# Deploy PostSphere → GitHub + Neon + Vercel

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
| `SESSION_SECRET` | string acak |
| `CRON_SECRET` | string acak (opsional) |
| OAuth keys | sama seperti `.env.example` (opsional) |
| Redirect URI | `https://<domain-vercel>/api/auth/.../callback` |

4. Deploy

## Batasan di Vercel

- Puppeteer / Instagram private API **tidak** jalan di serverless
- Upload file ke `/tmp` (sementara; hilang setelah cold start) — untuk produksi pakai Blob/S3
- Jadwal post: Cron tiap 5 menit (`/api/cron/publish`)

Untuk otomasi browser penuh, tetap jalankan `npm run dev` di VPS/lokal.

## 4. Tim Konten — skema baru (Fase 1)

Setelah pull, pastikan Neon punya tabel tambahan (otomatis di `db-postgres.load()` atau jalankan `schema.sql`):

- `app_meta` — settings otonomi / emergencyPause / dailyPostCap
- `audit_log` — jejak aksi agen
- `accounts.data.brandMemory` — memori brand (JSONB di kolom `data`)
- `ai_jobs.status` — termasuk `awaiting_approval`; field ekstra di `data` JSONB

Lokal (`db.json`) mendapat `aiSettings` + `auditLog` otomatis saat load.

## 5. Fase 2 — stub / TODO

| Item | Status | Catatan |
|------|--------|---------|
| Analitik penggerak agen | Stub | `GET /api/ai/insights` + placeholder UI Kantor AI |
| Notifikasi email/WhatsApp | Stub | Field `settings.notifications` di `PUT /api/ai/settings` |
| Token encryption at rest | Helper minimal | `lib/token-crypto.js` — set `TOKEN_ENCRYPTION_KEY` (≥16 char). Belum di-wire ke upsert OAuth (hindari breaking). TODO: encrypt on write / decrypt on read. |
| Izin per peran/akun | Stub model | Field `settings.rolePermissions` — enforce belum |

Jangan commit `.env`, `db.json`, atau secrets.
