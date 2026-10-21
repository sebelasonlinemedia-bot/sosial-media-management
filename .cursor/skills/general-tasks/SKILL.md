---
name: general-tasks
description: >-
  Menjalankan tugas umum Kantor AI PiK's Digital Lab di luar publish sosmed:
  riset web, email, dokumen, spreadsheet, gambar, WhatsApp, tugas bebas LLM.
  Use when the user asks to riset web, kirim email, buat dokumen/laporan,
  olah CSV/spreadsheet, generate gambar, kirim WhatsApp, atau tugas kantor
  umum lainnya di POST SOSMED.
---

# Tugas Umum — Kantor AI PiK's Digital Lab (Fase A–D)

Eksekutor: `lib/task-executors.js` · Katalog: `GET /api/ai/task-types`
MCP: `list_task_types`, `create_task`, `execute_task`, `research_web`

## Tipe tugas & pemilik bawaan

| taskType | Pemilik | Keluar? | Input wajib |
|----------|---------|---------|-------------|
| `research` | Rani (strategist) | Tidak | `urls[]` (maks 3), `query?` |
| `email` | Titin (community-manager) | **Ya** | `to`, `subject`, `body` |
| `document` | Dimas (copywriter) | Tidak | `title`, `content?`, `format?` (md/txt/html/csv) |
| `spreadsheet` | Bimo (analyst) | Tidak | `csv` (analisis) atau `rows[]` (buat CSV) |
| `image` | Salsa (visual-producer) | Tidak | `prompt`, `size?` |
| `whatsapp` | Titin (community-manager) | **Ya** | `to`, `message` |
| `general` | Maya (manager) | Tidak | `instruction` |

## Alur

1. Cek `GET /api/ai/settings` — `emergencyPause` memblokir tugas keluar.
2. Buat job: `POST /api/ai/jobs { taskType, taskInput, roleId? }` (atau MCP `create_task`).
   Field kurang → executor mengembalikan `needs_info`; tanya field itu saja, jangan nebak.
3. Eksekusi: `POST /api/ai/jobs/:id/execute` (atau MCP `execute_task`).
4. Tugas keluar + otonomi bukan `limited_autonomous` → `awaiting_approval`.
   Setujui via `/approve { autoRun: false }` lalu execute lagi; `forceExecute`
   hanya admin/approver atas izin eksplisit user. **Jangan force tanpa izin.**
5. Hasil: `job.taskResult` (summary + data). File dokumen/CSV:
   `GET /api/ai/jobs/:id/artifact`.
6. Riset cepat satu langkah: `POST /api/ai/research { urls, query }` / MCP `research_web`.

## Kejujuran mode

Tanpa kredensial, hasil bertanda `simulated: true` — laporkan sebagai simulasi,
bukan terkirim/terbuat:

- Email asli: `SMTP_HOST/SMTP_USER/SMTP_PASS` (atau `RESEND_API_KEY`) di `.env`.
- WhatsApp asli: `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.
- Gambar asli: `OPENAI_API_KEY` (atau provider LLM OpenAI). Selain itu placeholder SVG.
- `general` & ringkasan riset asli: butuh LLM (Pengaturan → LLM / env provider).

## Batasan

- Jangan log kredensial/token. Jangan kirim email/WhatsApp saat `emergencyPause`.
- Jangan gunakan `/run` untuk tugas umum (itu jalur publish sosmed).
- Tugas umum tidak mengubah status/antonomi job konten yang sudah ada.
