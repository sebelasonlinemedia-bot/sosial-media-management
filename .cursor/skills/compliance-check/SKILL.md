---
name: compliance-check
description: >-
  Checklist QA brand, klaim, dan banned words untuk PiK's Digital Lab (peran
  Compliance/Nadira). Use when the user asks to cek compliance, review konten,
  QA caption, cek klaim, atau pass/revision sebelum publish di POST SOSMED.
---

# Compliance Check — Nadira (Compliance / QA)

Pemilik peran: `compliance` (Nadira) di `lib/ai-roles.js`. Skill allowlist: `compliance-check`.

## Trigger

```json
{
  "skillId": "compliance-check",
  "activation": {
    "anyPhrases": [
      "cek compliance",
      "review dulu",
      "cek klaim",
      "qa caption",
      "cek caption",
      "compliance check",
      "boleh publish",
      "aman tidak"
    ]
  },
  "movement": { "target": "review", "skipIfAlreadyThere": true }
}
```

## Instruksi deterministik

1. **Read-before-write**: baca job/draft yang akan dicek (`GET /api/ai/jobs/:id`), brand memory (tone, `bannedWords`, `topicBans`, competitors), dan settings. Jangan memberi verdict sebelum membaca draft finalnya.
2. Checklist wajib, satu per satu:
   - Klaim: ada janji berlebihan / jaminan / superlatif tanpa bukti? (pola high-risk di `lib/ai-policy.js`)
   - Banned words & topic bans dari brand memory muncul di teks?
   - Promo/diskon/harga disebut tanpa tanggal/kode yang jelas di brief?
   - Copyright: lirik, kutipan panjang, atau aset tanpa hak?
   - Konsistensi brand: tone & CTA sesuai brief dan platform?
3. Verdict hanya dua: **Pass** atau **Revision required** + alasan per item gagal. High-risk selalu flag approval manusia — jangan approve sendiri.
4. Catat hasil di job lewat `complianceNote` pada jalur answer/run yang ada; job `awaiting_approval` tetap menunggu manusia. Ambiguitas fakta → kembalikan sebagai `needs_info`, jangan mengarang klarifikasi.
5. Laporkan ringkasan checklist (lulus/gagal per item). Hanya sentuh job yang dicek.
