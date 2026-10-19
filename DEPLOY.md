# Deploy PiK's Digital Lab → GitHub + Neon + Vercel

Akun: `sebelasonlinemedia@gmail.com`

## 1. GitHub

Repo: https://github.com/sebelasonlinemedia-bot/sosial-media-management

```bash
git push -u origin main
```

Login CLI harus akun **sebelasonlinemedia-bot** (bukan akun lain).

## 2. Neon Postgres

1. Buka project Neon → tombol **Connect**
2. Salin **connection string** (URI)
3. Simpan sebagai `DATABASE_URL` (lokal di `.env`, di Vercel di Environment Variables)
4. Schema dibuat otomatis saat request pertama (atau jalankan `schema.sql` di SQL Editor)

## 3. Vercel

1. Import repo `sosial-media-management`
2. Framework Preset: **Other**
3. Environment Variables:

| Name | Value |
|------|--------|
| `DATABASE_URL` | URI dari Neon |
| `SESSION_SECRET` | string acak (≥16) |
| `CRON_SECRET` | string acak (**wajib** di production) |
| `APP_ORIGIN` / `PUBLIC_BASE_URL` | `https://<domain-vercel>` |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` | bootstrap login admin |
| `TOKEN_ENCRYPTION_KEY` | ≥16 (disarankan production) |
| OAuth keys | sama seperti `.env.example` (opsional) |
| Redirect URI | `https://<domain-vercel>/api/auth/.../callback` |

4. Deploy

## Batasan di Vercel

- Puppeteer / Instagram private API **tidak** jalan di serverless (pakai worker VPS terpisah)
- Upload file ke `/tmp` (ephemeral) — hilang setelah cold start
- Jadwal post di **Vercel Hobby**: cron **1× sehari** `0 12 * * *` → `GET /api/cron/publish` (lihat `vercel.json`). Bukan tiap 5 menit.
- Lokal / VPS: scheduler in-process tiap **60 detik** (tidak memakai cron Vercel)
- `CRON_SECRET` **wajib** di production (fail closed 503/401 tanpa Bearer)
- Media OAuth (Meta/TikTok `PULL_FROM_URL`): set `PUBLIC_BASE_URL` ke HTTPS publik (bukan localhost)

### Path media publik → Blob (nanti, tanpa deps berbayar wajib sekarang)

1. Set `PUBLIC_BASE_URL=https://<domain-vercel>` agar path `/uploads/...` bisa di-fetch (hanya hidup selama instance punya file).
2. Untuk persistensi: unggah ke **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) atau S3-compatible, simpan URL absolut di `post.mediaUrl`, lalu publish memakai URL itu (sudah didukung jika `mediaUrl` absolute `https://`).
3. Integrasi SDK Blob belum di-wire di kode — langkah berikutnya non-breaking: ganti handler `/api/media/upload` agar menulis ke Blob dan mengembalikan URL publik.

Untuk otomasi browser penuh, tetap jalankan `npm run dev` di VPS/lokal.

## 4. Tim Konten — skema baru (Fase 1)

Setelah pull, pastikan Neon punya tabel tambahan (otomatis di `db-postgres.load()` atau jalankan `schema.sql`):

- `app_meta` — settings otonomi / emergencyPause / dailyPostCap
- `audit_log` — jejak aksi agen
- `accounts.data.brandMemory` — memori brand (JSONB di kolom `data`)
- `ai_jobs.status` — termasuk `awaiting_approval`; field ekstra di `data` JSONB

Lokal (`db.json`) mendapat `aiSettings` + `auditLog` otomatis saat load.

## 5. Fase 2 — live

| Item | Status | Catatan |
|------|--------|---------|
| Analitik penggerak agen | Partial | Agregasi live dari posts lokal; `statsSource: mock\|live` — sering mock sampai Insights API platform di-wire |
| Notifikasi email/WhatsApp | Live | `settings.notifications` + stub HTTP POST webhook; audit log; gagal tidak memblokir job |
| Token encryption at rest | Live | `accessToken` / `refreshToken` / `pageToken` (+ session file jika key set). `TOKEN_ENCRYPTION_KEY` ≥16 |
| App AuthN/AuthZ | Live | Session cookie `piks_sid`; `POST /api/auth/login`; mutasi `/api/*` butuh login; `forcePublish` = admin/approver |
| Izin per peran/akun | Live | `settings.rolePermissions` enforced di create job / run / employee publish; checklist UI |
| OAuth CSRF state | Live | Signed `state` Meta/YouTube/TikTok; verify di callback REAL |
| Upload hardening | Live | MIME/extension allowlist + sanitize filename |
| Rate limit | Live | In-memory pada login + publish endpoints |
| Approve atomik | Live | `POST .../approve` default `autoRun=true` → lanjut `/run` (pakai `approvedAt`) |

Jangan commit `.env`, `db.json`, atau secrets.
