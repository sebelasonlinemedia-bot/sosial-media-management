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
| Analitik penggerak agen | Partial | Agregasi lokal + konektor `/api/analytics/live` (Meta/YT/TikTok jika token); `statsSource: mock\|live\|unavailable` — jangan klaim live jika API gagal |
| Notifikasi email/WhatsApp | Live | `settings.notifications` + stub HTTP POST webhook; audit log; gagal tidak memblokir job |
| Token encryption at rest | Live | `accessToken` / `refreshToken` / `pageToken` (+ session file jika key set). `TOKEN_ENCRYPTION_KEY` ≥16 |
| App AuthN/AuthZ | Live | Session cookie `piks_sid`; `POST /api/auth/login`; mutasi `/api/*` butuh login; `forcePublish` = admin/approver |
| Izin per peran/akun | Live | `settings.rolePermissions` enforced di create job / run / employee publish; checklist UI |
| OAuth CSRF state | Live | Signed `state` Meta/YouTube/TikTok; verify di callback REAL |
| Upload hardening | Live | MIME/extension allowlist + sanitize filename |
| Rate limit | Live | In-memory pada login + publish endpoints |
| Approve atomik | Live | `POST .../approve` default `autoRun=true` → lanjut `/run` (pakai `approvedAt`) |

## 6. Audit remediasi P0–P3 (ringkas)

| Prioritas | Status | Isi utama |
|-----------|--------|-----------|
| **P0** | Done | Auth session, `forcePublish` bound role, browser-login locked ke session app, media URL cloud guard |
| **P1** | Done | OAuth `state`, MIME upload, rate limit, token/pageToken encrypt, YT refresh, cron fail-closed, approve atomik |
| **P2** | Done | `workspaceId` scaffolding + workspace `default`; analytics mock vs live di UI; reconcile `posted\|partial\|failed`; manual publish hormati pause/cap; `GET /api/health`; safe-log; `npm run test:p2` / `npm run check:db` |
| **P3** | Done (sebagian deferred) | `UNIQUE (workspace_id, platform)` + isolasi query; live metrics Meta/YT/TikTok (`/api/analytics/live`, gagal ≠ klaim live); TikTok publish poll (~45s timeout); Blob opsional (`BLOB_READ_WRITE_TOKEN`); `js/auth-ui.js` + `js/office-api.js`; multer 2; hapus `express-session` unused; `npm run test:p3`. Deferred: cleanup transitive `request` (instagram-private-api) |

### P3 — catatan ops

- **DB breaking (non-destruktif data):** boot Postgres drop `UNIQUE(platform)` lama → `UNIQUE (workspace_id, platform)`. Backfill `workspace_id` dari JSONB / `default`.
- **Blob:** tanpa `BLOB_READ_WRITE_TOKEN` upload tetap local + `PUBLIC_BASE_URL`.
- **TikTok poll:** setelah init, server poll status sampai terminal atau timeout 45s (`lib/tiktok-publish.js`); timeout → `pending: true`, bukan sukses penuh.

### DATABASE_URL (Neon)

```bash
npm run check:db
# atau di Vercel (tanpa paste secret ke chat):
# vercel env add DATABASE_URL
```

Script hanya melaporkan host/mode — **tidak** mencetak URI. Jika kosong, app tetap jalan dengan `db.json` lokal.

Jangan commit `.env`, `db.json`, atau secrets.
