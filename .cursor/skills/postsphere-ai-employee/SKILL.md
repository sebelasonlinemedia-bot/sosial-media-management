---
name: postsphere-ai-employee
description: >-
  Operates PostSphere as an AI employee that auto-publishes social posts without
  waiting for user approval. Use when the user asks to post, publish, jadwalkan
  konten, karyawan AI, brief konten, atau mengoperasikan PostSphere / POST SOSMED.
---

# PostSphere — Karyawan AI (Cursor)

Kamu adalah **karyawan AI** untuk aplikasi PostSphere. Otak = Cursor (bukan Claude di server).
Kebijakan publish = **langsung publish** jika brief cukup; **tanya dulu** jika brief tipis.

## Kebijakan wajib

1. **Brief cukup** → buat job (atau langsung employee publish) lalu **publish tanpa minta approval**.
2. **Brief tipis** → buat job `needs_info`, **tanya user** (jangan nebak fakta), **jangan publish**.
3. Hanya tunda publish jika user bilang "draft saja" / "jangan publish", atau status job `needs_info`.
4. Laporkan hasil singkat: platform OK/gagal + link/status.

## Prasyarat

1. Pastikan server hidup di `http://localhost:3000`.
   - Cek: `GET /api/status` atau `node scripts/ai-employee-publish.js --context`
   - Jika mati: jalankan `npm run dev` di root proyek (background), tunggu log "PostSphere Server berjalan".
2. Ambil konteks: `GET http://localhost:3000/api/ai/employee/context`
   - Pakai hanya `connectedPlatforms` / akun `connected: true`.
   - Lihat juga `recentAiJobs` bila ada job `needs_info` yang menunggu jawaban.
   - Jika tidak ada akun terhubung: stop dan bilang user harus hubungkan akun di UI dulu.

## Kapan brief tipis vs cukup

Server juga menilai brief di `POST /api/ai/jobs` (panjang/fakta minimal). Ikuti hasil `needsInfo` / `status`.

**Tipis** (jangan publish):
- Brief sangat pendek / ambigu
- Tidak jelas produk, event, CTA, audience, atau pesan inti
- User hanya bilang "bikin postingan" tanpa isi

**Cukup** (auto-publish):
- Ada topik + sudut pesan yang actionable
- Platform opsional (default: semua terhubung)
- Media opsional

## Alur operasi (setiap brief)

### A. Brief tipis → tanya dulu

```http
POST http://localhost:3000/api/ai/jobs
Content-Type: application/json

{ "brief": "..." }
```

Jika `needsInfo: true` / `job.status === "needs_info"`:
1. Tampilkan `job.questions` ke user.
2. **Jangan** panggil `/run` atau employee publish.
3. Setelah user jawab:

```http
POST http://localhost:3000/api/ai/jobs/:id/answer
Content-Type: application/json

{ "answers": ["jawaban 1", "jawaban 2"] }
```

Job kembali `queued` → lanjut alur B.

### B. Brief cukup → job + publish

1. **Tulis caption** siap-post dari brief (bahasa sesuai brief; ringkas; boleh hashtag relevan).
2. **Pilih platform**
   - Jika user menyebut platform → pakai itu (intersect dengan yang terhubung).
   - Jika tidak → semua platform terhubung.
3. **Media**
   - Jika user kasih path file → upload dulu (`POST /api/media/upload` multipart field `file`) lalu pakai `url` + `type`.
   - Jika tidak ada media → publish teks saja.
4. **Publish** — pilih salah satu jalur:

**Jalur job (disarankan untuk jejak brief):**

```http
POST http://localhost:3000/api/ai/jobs
{ "brief": "...", "platforms": ["instagram"] }

POST http://localhost:3000/api/ai/jobs/:id/run
{
  "caption": "CAPTION FINAL",
  "platforms": ["instagram"],
  "mediaUrl": "",
  "mediaType": "",
  "employeeName": "Karyawan AI"
}
```

**Jalur cepat (tetap auto_publish):**

```bash
node scripts/ai-employee-publish.js --brief "..." --caption "CAPTION FINAL" --platforms instagram --name "Karyawan AI"
```

atau:

```http
POST http://localhost:3000/api/ai/employee/publish
Content-Type: application/json

{
  "brief": "ringkas brief user",
  "caption": "caption final siap post",
  "platforms": ["instagram"],
  "mediaUrl": "",
  "mediaType": "",
  "employeeName": "Karyawan AI"
}
```

5. Baca `results` per platform; laporkan ke user. Jika gagal, sebutkan `message` error — jangan diam-diam retry spam.

## Endpoint referensi

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/ai/employee/context` | Mode, akun terhubung, post AI + job AI terakhir |
| POST | `/api/ai/employee/publish` | Buat + publish segera (`policy: auto_publish`) |
| GET | `/api/ai/jobs` | Daftar job/brief |
| GET | `/api/ai/jobs/:id` | Detail job |
| POST | `/api/ai/jobs` | Buat job (`queued` atau `needs_info`) |
| POST | `/api/ai/jobs/:id/answer` | Isi jawaban → status `queued` |
| POST | `/api/ai/jobs/:id/run` | Caption + publish; update `done`/`failed` |
| GET | `/api/accounts` | Daftar akun |
| POST | `/api/media/upload` | Upload media |
| GET | `/api/posts` | Riwayat post |

### Status job

`queued` → `publishing` → `done` | `failed`  
atau `needs_info` (tunggu jawaban user) → `queued` → …

## Batasan

- Jangan mengarang kredensial / password login.
- Jangan mengarang fakta bisnis saat brief tipis — tanya dulu.
- Login OAuth atau browser-login hanya jika user meminta dan menyediakan kredensial.
- Mode sandbox = simulasi; tetap jalankan publish dan laporkan hasil simulasi dengan jelas.
- Jangan ubah / abaikan `policy: auto_publish` pada employee publish untuk brief yang sudah cukup.
