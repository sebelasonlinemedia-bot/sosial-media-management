---
name: caption-hook
description: >-
  Menulis hook & caption konten untuk PiK's Digital Lab (peran Copywriter/Dimas).
  Use when the user asks to buat caption, tulis hook, caption promo, caption IG,
  caption TikTok, atau memperbaiki caption di POST SOSMED.
---

# Caption & Hook — Dimas (Copywriter)

Pemilik peran: `copywriter` (Dimas) di `lib/ai-roles.js`. Skill allowlist: `caption-hook` (cek `roleSkills` di Pengaturan bila job dibuat dengan `skillId`).

## Trigger

```json
{
  "skillId": "caption-hook",
  "activation": {
    "anyPhrases": [
      "buat caption",
      "tulis caption",
      "buatkan caption",
      "buat hook",
      "tulis hook",
      "caption ig",
      "caption instagram",
      "caption tiktok",
      "perbaiki caption"
    ]
  },
  "movement": { "target": "desk", "skipIfAlreadyThere": true }
}
```

## Instruksi deterministik

1. **Read-before-write**: baca dulu job terkait (`GET /api/ai/jobs` / `GET /api/ai/jobs/:id`), brand memory (`GET /api/accounts/:platform/brand-memory`), dan settings (`GET /api/ai/settings` — cek `emergencyPause` & otonomi). Jangan menulis caption sebelum membaca ketiganya.
2. Hormati kebijakan di skill utama `piks-digital-lab-ai-employee`: brief tipis → buat job status `needs_info` dan tanya field kosong saja. **Jangan nebak** produk, harga, tanggal, atau CTA yang tidak ada di brief.
3. Tulis hook di baris pertama (maks. ~12 kata), lalu isi, lalu satu CTA yang eksplisit dari brief. Sesuaikan batas karakter platform dari job.
4. Terapkan brand memory: tone, `bannedWords`, emoji ok/tidak. Kata terlarang → ganti, jangan diteruskan ke draft.
5. Simpan sebagai draft job (`POST /api/ai/jobs` dengan `roleId: "copywriter"`, `skillId: "caption-hook"`) atau update lewat jalur run/answer yang ada. Publish hanya lewat gate yang ada — skill ini tidak mem-publish langsung.
6. Laporkan: platform, hook yang dipilih, dan status job. Hanya sentuh file/job yang perlu.
