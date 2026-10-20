---
name: analytics-next-brief
description: >-
  Mengubah insights performa menjadi brief konten berikutnya di PiK's Digital
  Lab (Analyst Bimo → Strategist Rani). Use when the user asks to baca insights,
  analisis performa, brief berikutnya, konten apa selanjutnya, atau papan
  analitik di POST SOSMED.
---

# Analytics → Brief Berikutnya — Bimo (Analyst) → Rani (Strategist)

Pemilik peran: `analyst` (Bimo), penerus brief: `strategist` (Rani). Skill allowlist: `analytics-next-brief`.

## Trigger

```json
{
  "skillId": "analytics-next-brief",
  "activation": {
    "anyPhrases": [
      "cek papan analitik",
      "lihat papan analitik",
      "baca insights",
      "analisis performa",
      "brief berikutnya",
      "konten apa selanjutnya",
      "apa berikutnya"
    ]
  },
  "movement": { "target": "analyst-board", "skipIfAlreadyThere": true }
}
```

## Instruksi deterministik

1. **Read-before-write**: baca `GET /api/ai/insights?days=30` dan `GET /api/ai/jobs` dulu. Catat `statsSource` — bila `mock`, nyatakan asumsi itu di laporan; jangan menyajikan angka mock sebagai metrics resmi.
2. Ambil maksimal 3 rekomendasi dari `nextUp.recommendations` (prioritas high → medium). Untuk tiap rekomendasi tulis: CTA, platform, alasan berbasis data (best post / jam kuat / format unggul / platform underposted).
3. Ubah rekomendasi teratas menjadi brief Strategist yang konkret: goal, platforms, CTA, tone (dari brand memory bila relevan). Field kosong yang wajib → biarkan sebagai pertanyaan `needs_info`; **jangan nebak** angka atau fakta bisnis.
4. Buat job hanya bila brief cukup: `POST /api/ai/jobs` dengan `roleId: "strategist"`, `skillId: "analytics-next-brief"`. Hormati otonomi & `emergencyPause` dari settings — skill ini tidak mem-publish.
5. Laporkan: sumber data (live/mixed/mock), 3 rekomendasi, dan job yang dibuat (bila ada). Hanya buat job untuk rekomendasi yang dipilih.
