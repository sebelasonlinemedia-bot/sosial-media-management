# AUDIT TEKNIS — PiK's Digital Lab (ex-PostSphere)

| Meta | Nilai |
|------|--------|
| **Workspace** | `E:\00. APLIKASI\POST SOSMED` |
| **Tanggal audit** | 2026-10-19 |
| **Ruang lingkup** | Read-only: kode sumber, schema, package, konfigurasi deploy, inspeksi struktur data lokal (token di-redact) |
| **Tidak dilakukan** | Install deps, migrasi DB, ubah source (selain file ini), publish ke sosmed, baca nilai rahasia `.env` |
| **Repo remote** | `https://github.com/sebelasonlinemedia-bot/sosial-media-management.git` (`main`) |
| **Versi paket** | `piks-digital-lab@1.0.0` (`package.json`) |
| **Commit HEAD (saat audit)** | `c40634e` — Raise Kantor AI 3D fidelity… |

**Legenda status temuan**

| Label | Arti |
|-------|------|
| **Verified** | Dibuktikan langsung di kode/konfigurasi dengan kutipan `file:line` |
| **Potential** | Indikasi kuat dari pola kode/desain; belum diuji runtime produksi |
| **Not verified** | Tidak bisa dikonfirmasi tanpa akses runtime / akun API / data produksi |
| **Recommendation** | Saran perbaikan / arah arsitektur (bukan bug terbukti) |

**Severity:** P0 = kritis (eksploit/kehilangan kontrol segera) · P1 = tinggi · P2 = sedang · P3 = rendah / utang teknis

---

## A. Executive Summary

PiK's Digital Lab adalah **monolit Express + frontend statis** untuk mengelola multi-platform social (FB/IG/TikTok/YouTube), dengan lapisan **Tim Konten / Kantor AI** (job brief, otonomi, brand memory) yang **otaknya di Cursor**, bukan LLM di server.

**Kesiapan SaaS:** belum siap. Aplikasi saat ini bersifat **single-tenant tanpa autentikasi pengguna** — seluruh REST API terbuka. Data model `accounts.platform UNIQUE` membatasi satu koneksi per platform untuk seluruh instance. Analytics engagement adalah **mock random**. Integrasi OAuth nyata ada di kode, tetapi media URL publish memakai `localhost` (gagal di cloud). Browser automation (Puppeteer / `instagram-private-api`) hanya untuk lokal/VPS dan **tidak jalan di Vercel**.

**Verdict:** cocok sebagai **prototipe / lab internal lokal**; **tidak** siap multi-tenant SaaS publik tanpa harderning autentikasi, tenancy, storage media, analytics nyata, dan pemisahan jalur otomasi.

---

## B. Inventarisasi Arsitektur

### B.1 Stack terverifikasi

| Lapisan | Teknologi | Bukti |
|---------|-----------|--------|
| Runtime | Node.js ≥18 | `package.json` engines |
| HTTP | Express 4 | `server.js` |
| Frontend | Vanilla JS + HTML/CSS (+ Three.js office 3D) | `index.html`, `app.js`, `ai-office-3d.js`, `styles.css` |
| DB lokal | File JSON `db.json` | `db.js` |
| DB cloud | Neon Postgres via `@neondatabase/serverless` | `db-postgres.js`, `schema.sql` |
| OAuth HTTP | axios | `server.js` Graph/YouTube/TikTok |
| Upload | multer disk | `server.js` |
| Browser auto | puppeteer + stealth | `automation/*` |
| IG unofficial | `instagram-private-api` | `automation/instagram.js` |
| Deploy | Vercel serverless (`api/index.js` → `server.js`) | `vercel.json`, `api/index.js` |

### B.2 Diagram komponen (logis)

```
Browser (index.html / app.js / ai-office-3d.js)
        │  fetch REST (tanpa auth session app)
        ▼
Express (server.js) ─── cors() terbuka, body 50mb
        │
        ├─ db facade (db.js) ──► db.json  ATAU  Neon (DATABASE_URL)
        ├─ lib/ai-policy | ai-roles | ai-insights | ai-notify | token-crypto
        ├─ OAuth Meta / Google / TikTok (axios)
        ├─ publishToAllPlatforms → callPlatformAPI
        └─ [non-Vercel] automation/* (Puppeteer / private API)
```

### B.3 Dual mode SANDBOX vs REAL

- **SANDBOX** jika tidak ada `META_CLIENT_ID` **dan** `GOOGLE_CLIENT_ID` **dan** `TIKTOK_CLIENT_KEY` — `server.js:89-93`.
- Mode diumumkan di `GET /api/status` — `server.js:135-143`.
- **Verified gap:** callback OAuth tetap menerima `?sandbox=1` bahkan saat mode REAL (`server.js:251`, `374`, `448`) — bisa menghubungkan akun demo palsu.

### B.4 Aliran data utama

1. **Connect akun:** OAuth redirect → callback → `db.upsertAccount` (token optional encrypt) **atau** `POST /api/auth/browser-login` → session file di `sessions/`.
2. **Compose/post:** UI → `POST /api/posts` / publish → `publishToAllPlatforms` → per-platform API/automation → `generateMockStats()` disimpan di post.
3. **AI job:** UI/Cursor → `POST /api/ai/jobs` → `assessStructuredBrief` → `needs_info|queued` → `POST .../run` → `evaluatePublishGate` → publish atau `awaiting_approval`.
4. **Schedule:** lokal `setInterval` 60s; Vercel `GET /api/cron/publish` (cron harian).

---

## C. Inventarisasi Endpoint API

Semua endpoint di bawah diekspor dari `server.js`. **Tidak ada middleware autentikasi aplikasi** (Verified: tidak ada `express-session` usage, tidak ada `bcrypt`, tidak ada `requireAuth`).

| Method | Path | Fungsi | Auth app |
|--------|------|--------|----------|
| GET | `/api/status` | Mode sandbox/real + flag kredensial | Tidak |
| GET | `/api/accounts` | Daftar akun (strip access/refresh token) | Tidak |
| GET/PUT | `/api/accounts/:platform/brand-memory` | Baca/ubah brand memory | Tidak |
| DELETE | `/api/accounts/:platform` | Disconnect | Tidak |
| GET | `/api/auth/meta` | Mulai OAuth Meta | Tidak |
| GET | `/api/auth/meta/callback` | Callback Meta (+ sandbox) | Tidak |
| GET | `/api/auth/youtube` | Mulai OAuth YT | Tidak |
| GET | `/api/auth/youtube/callback` | Callback YT | Tidak |
| GET | `/api/auth/tiktok` | Mulai OAuth TikTok | Tidak |
| GET | `/api/auth/tiktok/callback` | Callback TikTok | Tidak |
| POST | `/api/auth/browser-login` | Login username/password → automation | Tidak |
| DELETE | `/api/auth/browser-logout/:platform` | Hapus session browser | Tidak |
| POST | `/api/media/upload` | Upload media 50MB | Tidak |
| GET/POST | `/api/posts` | List / create (+ optional publish) | Tidak |
| GET N/A / PUT/DELETE | `/api/posts/:id` | Update / delete | Tidak |
| POST | `/api/posts/:id/publish` | Force publish | Tidak |
| GET | `/api/ai/employee/context` | Konteks agen Cursor | Tidak |
| POST | `/api/ai/employee/publish` | Publish langsung + gate | Tidak |
| GET/PUT | `/api/ai/settings` | Settings otonomi | Tidak |
| POST | `/api/ai/settings/emergency-pause` | Pause darurat | Tidak |
| GET | `/api/ai/audit-log` | Audit trail | Tidak |
| GET | `/api/ai/brief-templates` | Template brief | Tidak |
| GET | `/api/ai/insights` | Insights dari posts/stats | Tidak |
| GET/POST | `/api/ai/jobs` | List / create job | Tidak |
| GET | `/api/ai/jobs/:id` | Detail job | Tidak |
| POST | `/api/ai/jobs/:id/answer` | Jawab needs_info | Tidak |
| POST | `/api/ai/jobs/:id/approve` | Approve (lalu client /run) | Tidak |
| POST | `/api/ai/jobs/:id/run` | Jalankan publish job | Tidak |
| GET | `/api/ai/office` | Board + employees | Tidak |
| GET | `/api/ai/office/roles` | Registry 7 peran | Tidak |
| GET | `/api/cron/publish` | Scheduler due posts | Bearer **hanya jika** `CRON_SECRET` set |

Catch-all: `GET *` → `index.html` (kecuali ekstensi aset) — `server.js:1946-1951`.

---

## D. Dependency Map

### D.1 Dependencies runtime (`package.json`)

| Paket | Digunakan? | Catatan audit |
|-------|------------|---------------|
| `express` | Ya | Server |
| `cors` | Ya | `app.use(cors())` tanpa allowlist |
| `body-parser` | Ya | Limit 50mb |
| `axios` | Ya | OAuth + publish + notify |
| `multer` | Ya | **1.x** — lockfile mencatat deprecation/vuln; upgrade ke 2.x **Recommendation** |
| `dotenv` | Ya | Load `.env` |
| `@neondatabase/serverless` | Ya | Jika `DATABASE_URL` |
| `form-data` | Ya | YouTube upload |
| `puppeteer` / `puppeteer-extra` / stealth | Ya (lokal) | Tidak dimuat di Vercel |
| `instagram-private-api` | Ya | Unofficial; risiko ToS/ban |
| `bcryptjs` | **Tidak** (Verified: tidak direferensikan di source app) | Dead dependency |
| `express-session` | **Tidak** | Dead dependency; `SESSION_SECRET` di `.env.example` **tidak dibaca** di `server.js` |

### D.2 Dependency map fungsional

```
UI ──► Express routes ──► db.* ──► JSONB/file
                 │
                 ├── OAuth providers (Meta/Google/TikTok)
                 ├── publish engine ──► Graph / YT / TikTok Open API
                 │                  └── automation modules
                 └── AI policy/roles/insights (rules, no LLM SDK)
```

Tidak ada SDK OpenAI/Anthropic/dll di `package.json` maupun source (Verified grep).

---

## E. Keamanan (AppSec)

### E.1 Temuan keamanan (tabel)

| ID | Sev | Komponen | Bukti | Masalah | Dampak | Rekomendasi | Cara verifikasi fix |
|----|-----|----------|-------|---------|--------|-------------|---------------------|
| SEC-01 | P0 | API surface | Tidak ada middleware auth di `server.js`; `bcryptjs`/`express-session` unused | Semua endpoint mutasi terbuka (publish, settings, upload, disconnect, AI forcePublish) | Siapa saja yang reach host bisa publish ke akun terhubung / ubah otonomi / pause | Tambah auth (session/JWT), proteksi semua `/api/*` kecuali OAuth callback publik; RBAC | Tanpa cookie/token → 401 pada `POST /api/posts` |
| SEC-02 | P0 | AI gate bypass | `forcePublish` di `server.js:1039`, `1715-1724`; gate di `lib/ai-policy.js:339-370` | Client bisa kirim `forcePublish:true` tanpa identitas manusia terverifikasi | Melewati suggest_only / require_approval / high-risk | Binding forcePublish ke session user terautentikasi + CSRF; jangan terima flag mentah dari anon | Sebagai anon, `forcePublish` ditolak |
| SEC-03 | P0 | Browser login | `POST /api/auth/browser-login` `server.js:516-543` | Endpoint menerima password plaintext tanpa auth app | Credential stuffing / theft jika host exposed | Hapus dari deploy publik; atau mTLS/VPN + auth kuat; jangan log password | Host publik: 401/404 tanpa login app |
| SEC-04 | P1 | OAuth sandbox override | `server.js:251`, `374`, `448` | `?sandbox=1` mengaktifkan akun demo meski REAL | Polusi data akun / false connected | Izinkan sandbox query hanya jika `SANDBOX_MODE===true` | Di REAL, `callback?sandbox=1` → 403 |
| SEC-05 | P1 | Cron auth opsional | `server.js:1934-1938` | Jika `CRON_SECRET` kosong, cron terbuka | Trigger mass publish terjadwal | Wajibkan `CRON_SECRET` di produksi; fail closed | Tanpa Bearer → 401 selalu di prod |
| SEC-06 | P1 | Token at-rest | `lib/token-crypto.js`; encrypt hanya `accessToken`/`refreshToken` | `pageToken` disimpan di account data tanpa encrypt (`server.js:325`); key opsional | Token FB page plain di DB jika key kosong / field lain | Encrypt semua secret fields; wajibkan key di prod; migrasi | DB tidak berisi token plain |
| SEC-07 | P1 | Session files | `automation/browser.js:82-86`; `sessions/*-ig-state.json` lokal | Cookie/state IG di filesystem; folder di-gitignore (baik) tapi debug scripts ada | Compromise disk = hijack akun | Encrypt session at rest; batasi ACL; jangan simpan di shared host | Session tidak readable plaintext |
| SEC-08 | P1 | Upload | `server.js:113-117`, `567-573` | Tidak ada `fileFilter` MIME/extension; filename dari `originalname` | Upload malware/HTML, path issues, storage abuse | Allowlist MIME; sanitize filename; virus scan; object storage signed URL | Upload `.exe`/`.html` ditolak |
| SEC-09 | P2 | CORS | `server.js:105` | `cors()` default = reflect/any origin | Browser cross-site memanggil API (diperparah tanpa auth) | Allowlist origin + credentials policy | Origin asing ditolak |
| SEC-10 | P2 | OAuth CSRF | Meta/YT tanpa `state` random; TikTok `state=piks-digital-lab` fixed `server.js:440` | Login CSRF / callback injection | Bind state ke session + verify | Callback tanpa state valid gagal |
| SEC-11 | P2 | Error leakage | Banyak `err.message` ke client + redirect `msg=` | Info internal ke attacker | Generic error ke client; log server-side | Response tidak memuat stack/path |
| SEC-12 | P2 | Static root | `express.static(__dirname)` `server.js:120` | Seluruh tree project tersaji (termasuk potensi file sensitif jika ter-commit) | Information disclosure | Serve hanya `public/`; jangan expose `.env` (sudah gitignore) | `GET /.env` 404 |
| SEC-13 | P3 | Deps mati + multer 1.x | `package.json`; lockfile deprecation multer | Surface attack / kebingungan ops | Hapus unused; upgrade multer | `npm ls` bersih; multer≥2 |

### E.2 Secrets handling

| Item | Status |
|------|--------|
| `.env` / `.env*` di `.gitignore` | Verified — tidak di-track git |
| Nilai rahasia ditampilkan di audit ini | **Tidak** (hanya nama key) |
| Key lokal terdeteksi (nama saja) | `PORT`, `SESSION_SECRET`, Meta/Google/TikTok OAuth keys+redirects |
| Tidak ada di `.env` lokal (saat audit) | `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` |
| `SESSION_SECRET` | Ada di env template tetapi **tidak digunakan kode** |

---

## F. Database & Model Data

### F.1 Dual backend

| Mode | Trigger | File |
|------|---------|------|
| JSON file | `!process.env.DATABASE_URL` | `db.js` → `db.json` |
| Neon | `DATABASE_URL` set | `db-postgres.js` + DDL di `load()` |

Schema deklaratif: `schema.sql` (selaras dengan create-if-not-exists di `db-postgres.js:51-112`).

### F.2 Tabel / koleksi

| Entitas | Model | Catatan |
|----------|-------|---------|
| `users` | id + JSONB `data` | **Tidak ada API login/register** di `server.js`; `userCount` lokal = 0 |
| `accounts` | `platform TEXT UNIQUE` | **Single account per platform / instance** — blocker multi-tenant |
| `posts` | JSONB + status/publish_date | Stats mock disimpan di JSON |
| `ai_jobs` | brief + status + JSONB | Status: queued, needs_info, publishing, awaiting_approval, done, failed |
| `app_meta` | key/value JSONB | `ai_settings` |
| `audit_log` | actor/action/target/detail | Cap 500 di JSON mode |

### F.3 Temuan DB

| ID | Sev | Status | Masalah | Dampak | Rekomendasi |
|----|-----|--------|---------|--------|-------------|
| DB-01 | P0 | Verified | `accounts.platform UNIQUE` — tidak ada `tenant_id`/`user_id` | Tidak bisa SaaS multi-org | Desain ulang: `workspaces`, `social_accounts` N per platform |
| DB-02 | P1 | Verified | Document-oriented JSONB tanpa normalisasi relasi post↔platform results | Query analitik/reporting terbatas | Kolom terstruktur / table `post_platform_results` |
| DB-03 | P1 | Potential | ID berbasis `Date.now()` (`post-`+timestamp) | Collision di concurrent writes | UUID/ULID |
| DB-04 | P2 | Verified | JSON `db.json` full-file rewrite tiap save | Race/corruption lokal under concurrency | Postgres untuk apa pun non-single-process |
| DB-05 | P2 | Verified | `disconnectAccount` null-kan `accessToken` tetapi field lain (cookies path, igUsername) mungkin tersisa | Orphan secrets | Clear semua credential fields |
| DB-06 | P3 | Verified | Index ada untuk status/publish & audit | Baik untuk cron | Pertahankan; tambah index tenant saat multi-tenant |

### F.4 Snapshot lokal (redacted, Not a prod claim)

Dari `db.json` saat audit: 3 akun (IG connected via `private_api`), 4 posts, 6 AI jobs, audit 7, `insightsEnabled: false`, mock stats hadir pada posts. **Bukan** verifikasi Neon produksi.

---

## G. Integrasi Media Sosial

### G.1 Matriks integrasi

| Platform | OAuth API | Browser/Private | Publish path | Catatan risiko |
|----------|-----------|-----------------|--------------|----------------|
| Facebook | Ya Graph v19 | Puppeteer `automation/facebook.js` | `pageId` + photos/feed | Butuh Page token; media via URL localhost |
| Instagram | Via Meta Business | `instagram-private-api` | Container+publish **atau** private photo | Private API melanggar ToS Meta (Potential legal/ban) |
| YouTube | OAuth upload scope | Puppeteer Google login | multipart upload | **Tidak ada refresh access_token** di publish path |
| TikTok | OAuth + Content Posting init | Puppeteer upload | `PULL_FROM_URL` dengan `mediaUrl` localhost | URL harus publik HTTPS untuk API resmi |

### G.2 Temuan integrasi

| ID | Sev | Status | Bukti | Masalah | Dampak | Rekomendasi |
|----|-----|--------|-------|---------|--------|-------------|
| INT-01 | P0 | Verified | `server.js:741` `http://localhost:${PORT}${post.mediaUrl}` | Media URL untuk Graph/TikTok mengarah ke localhost | Publish OAuth di Vercel/cloud hampir pasti gagal (Meta/TikTok tidak bisa fetch) | Public HTTPS URL (S3/Blob/CDN) |
| INT-02 | P1 | Verified | Refresh token disimpan YT `server.js:415` tetapi tidak dipakai ulang di `callPlatformAPI` | Access token YT kedaluwarsa tanpa refresh | Upload YT gagal setelah ~1 jam | Implement token refresh sebelum upload |
| INT-03 | P1 | Verified | `IS_VERCEL` skip automation `server.js:53-65` | Browser/private path mati di Vercel | Hanya OAuth (yang juga patah media URL) di serverless | Worker VPS terpisah untuk automation |
| INT-04 | P1 | Verified | IG private API `automation/instagram.js` | Bergantung session file + unofficial client | Fragile; checkpoint/2FA; ban risk | Prefer Meta Graph resmi saja untuk produk |
| INT-05 | P2 | Verified | `browser.js:34` `headless: false` hardcode | Parameter headless diabaikan | Tidak cocok server headless | Hormati flag headless |
| INT-06 | P2 | Potential | TikTok init saja, tidak poll status publish | Sukses “init” ≠ video live | False positive UX | Poll `publish_id` status |
| INT-07 | P2 | Potential | Meta scopes terbatas; tidak ada long-lived token exchange eksplisit | Token user pendek | Putus koneksi | Exchange long-lived + refresh page tokens |
| INT-08 | P3 | Not verified | Apakah kredensial OAuth di `.env` valid di Meta/Google/TikTok console | Tidak diuji live (dilarang publish) | — | Uji sandbox app dengan akun test |

### G.3 Kepatuhan platform (Potential)

- Unofficial IG API & credential browser login: risiko ToS.
- Meminta user nonaktifkan 2FA (pesan error automation): anti-pattern keamanan akun.

---

## H. Workflow Publish

### H.1 Jalur publish (Verified)

```
Manual UI ──► POST /api/posts (status posted) ──► publishToAllPlatforms ──► mock stats
Scheduled ──► scheduler 60s / cron ──► due status=scheduled ──► sama
AI employee ──► POST /api/ai/employee/publish ──► evaluatePublishGate ──► publish
AI job run ──► POST /api/ai/jobs/:id/run ──► gate / awaiting_approval ──► publish
```

Fungsi inti: `publishToAllPlatforms` `server.js:690-718`, `callPlatformAPI` `724-822`.

### H.2 Gate AI vs publish manual

| Jalur | Hormati emergencyPause / otonomi / high-risk? |
|-------|-----------------------------------------------|
| `/api/ai/employee/publish`, `/api/ai/jobs/:id/run` | Ya (`evaluatePublishGate`) |
| `/api/posts`, `/api/posts/:id/publish`, scheduler | **Tidak** — publish langsung |

**Verified gap produk:** manusia (atau attacker tanpa auth) bisa bypass seluruh kebijakan Tim Konten lewat API posts klasik.

### H.3 Temuan workflow

| ID | Sev | Status | Masalah | Rekomendasi |
|----|-----|--------|---------|-------------|
| WF-01 | P1 | Verified | Approve tidak auto-run; hanya menginstruksikan `/run` + `forcePublish` (`server.js:1623-1630`) | Atomic approve+publish server-side dalam satu transaksi auth |
| WF-02 | P1 | Verified | Manual posts tanpa AI gate | Satu pipeline publish dengan policy hooks |
| WF-03 | P2 | Verified | Status post bisa `posted` meski partial platform error (AI path set `failed` jika any error; manual path kurang konsisten) | Per-platform status aggregasi eksplisit |
| WF-04 | P2 | Verified | Cron Vercel **harian** `0 12 * * *` (`vercel.json`) vs `DEPLOY.md` klaim “tiap 5 menit” | Samakan docs; Hobby limit = daily OK tapi latency jadwal buruk |
| WF-05 | P3 | Potential | Scheduler lokal + cron bisa double-publish jika keduanya jalan ke DB sama | Lock/lease pada post id |

---

## I. AI Agents / Tim Konten

### I.1 Apakah ada LLM di server?

| Klaim | Bukti | Verdict |
|-------|-------|---------|
| “Otak = Cursor (bukan Claude di server)” | Skill `.cursor/skills/.../SKILL.md`; komentar `lib/ai-roles.js:2-3`; `schema.sql:34` | **Verified: tidak ada LLM runtime di server** |
| OpenAI/Anthropic SDK | Tidak di dependencies / source | **Verified absent** |
| Peran 7 karyawan | `lib/ai-roles.js` registry Maya/Rani/Dimas/Salsa/Titin/Bimo/Nadira | **Verified UI/rules metadata** |
| Generasi caption otomatis oleh server | Caption dari brief/user body (`captionFromBrief`) | **Verified: tidak generate via LLM** |
| Kantor AI 3D | `ai-office-3d.js` visualisasi status | **Verified presentational** |

**Kesimpulan:** “AI agents” = **orchestration + policy engine + Cursor operator**, bukan autonomous LLM service. Cocok untuk lab dengan operator manusia+Cursor; **bukan** SaaS agen mandiri end-to-end tanpa integrasi model.

### I.2 Policy engine (kuat relatif)

Verified di `lib/ai-policy.js`:

- Autonomy: `suggest_only` | `require_approval` | `limited_autonomous`
- `emergencyPause`, daily cap, high-risk regex, brand banned words, duplicate caption warning
- `rolePermissions` enforced di create/run/employee publish

Kelemahan: `forcePublish` tanpa auth (SEC-02); email notify hanya stub log (`lib/ai-notify.js:48-51`).

### I.3 Temuan AI

| ID | Sev | Status | Masalah | Rekomendasi |
|----|-----|--------|---------|-------------|
| AI-01 | P1 | Verified | Tidak ada eksekusi multi-agent pipeline di server (Manager tidak memecah job ke sub-job otomatis) | Orkestrasi job graph atau dokumentasikan “manual Cursor only” |
| AI-02 | P2 | Verified | Insights memakai stats mock → rekomendasi “best post” tidak bermakna | Hubungkan Insights API platform |
| AI-03 | P2 | Verified | Notifikasi email stub | SMTP/provider nyata |
| AI-04 | P3 | Recommendation | systemBrief hanya string untuk Cursor | Persist run prompts / model versioning jika nanti ada LLM |

---

## J. Analytics & Insights

| Aspek | Status | Bukti |
|-------|--------|-------|
| Stats post | **Mock random** | `generateMockStats` `server.js:826-831` dipanggil setiap publish sukses |
| UI Analytics | Menampilkan `post.stats` | `app.js` ~2350+ |
| `GET /api/ai/insights` | Agregasi lokal dari posts/stats; `stub: false` di payload | `lib/ai-insights.js:220-221` — **bukan stub flag**, tetapi **input data mock** |
| Sync insight dari Meta/YT/TikTok | **Tidak ada** kode fetch insights API | — |

| ID | Sev | Status | Masalah | Dampak | Rekomendasi |
|----|-----|--------|---------|--------|-------------|
| AN-01 | P1 | Verified | Mock stats | Keputusan bisnis/AI salah | Tarik metrics resmi per platform; tandai `statsSource: mock\|live` |
| AN-02 | P2 | Verified | `DEPLOY.md` menyebut insights “Live” | Overclaim vs kualitas data | Klarifikasi “live aggregation of local/mock stats” |

---

## K. Deployment: Vercel vs Lokal

| Aspek | Lokal (`npm run dev`) | Vercel |
|-------|----------------------|--------|
| Entry | `server.js` listen PORT | `api/index.js` require server |
| DB | `db.json` default | Wajib `DATABASE_URL` (Neon) praktis |
| Scheduler | `setInterval` 60s | Cron 1×/hari `/api/cron/publish` |
| Automation | Dimuat | Dilewati (`IS_VERCEL`) |
| Upload | `uploads/` persistent disk | `/tmp/uploads` ephemeral |
| Puppeteer | Dimungkinkan | Tidak cocok serverless |
| Cold start / body size | N/A | Risk timeout untuk publish panjang (**Potential**) |

| ID | Sev | Status | Masalah | Rekomendasi |
|----|-----|--------|---------|-------------|
| DEP-01 | P1 | Verified | Docs vs cron schedule mismatch | Update `DEPLOY.md` |
| DEP-02 | P1 | Verified | Ephemeral uploads | S3/Vercel Blob |
| DEP-03 | P2 | Verified | `vercel.json` includeFiles automation tetapi runtime skip | Kurangi bundle atau pisah worker |
| DEP-04 | P2 | Potential | Serverless + Puppeteer deps tetap ter-bundle risk size | Optional dependency / separate package |

---

## L. Testing & Kualitas Engineering

| Item | Temuan |
|------|--------|
| Automated test suite | **Tidak ada** jest/mocha/vitest di `package.json` scripts |
| Script di `sessions/test-*.js`, `debug-*.js` | Ad-hoc lokal; mengandung artefak debug; **bukan** CI |
| Syntax check (audit) | `node --check` lulus untuk `server.js`, `db.js`, `db-postgres.js`, `lib/token-crypto.js`, `lib/ai-policy.js`, `api/index.js` |
| TypeScript | Tidak dipakai |
| CI | Tidak diverifikasi workflow GitHub Actions di repo root (tidak ada file CI di inventarisasi file project) |

| ID | Sev | Recommendation |
|----|-----|----------------|
| QA-01 | P1 | Unit test `evaluatePublishGate`, token-crypto, assessStructuredBrief |
| QA-02 | P1 | Integration test publish dengan mock axios (tanpa hit API nyata) |
| QA-03 | P2 | Smoke test deploy: `/api/status`, DB load |

---

## M. Frontend & UX Teknis

- SPA-like single `index.html` + `app.js` besar (~2k LOC) — tight coupling ke API.
- Kantor AI 3D (`ai-office-3d.js`) status dari `/api/ai/office` — presentasional.
- OAuth UX mendukung sandbox connect dari UI (`app.js` redirect sandbox).
- Tidak ada login screen aplikasi (selaras dengan absen auth backend).

| ID | Sev | Status | Catatan |
|----|-----|--------|---------|
| FE-01 | P2 | Potential | Monolit JS tanpa bundler/modules modern — maintainability |
| FE-02 | P3 | Verified | Analytics charts bergantung mock stats |

---

## N. Kesiapan SaaS (Penilaian)

| Kriteria SaaS | Skor (1–5) | Catatan |
|---------------|------------|---------|
| Multi-tenant isolation | 1 | Platform UNIQUE global |
| AuthN/AuthZ | 1 | Tidak ada |
| Billing/metering | 1 | Tidak ada |
| Real social publish reliability | 2 | Kode OAuth ada; media URL & token refresh lemah; automation tidak cloud-native |
| AI automation productized | 2 | Policy bagus; eksekusi bergantung Cursor eksternal |
| Analytics truthfulness | 1 | Mock |
| Observability/audit | 3 | audit_log ada; auth kosong mengurangi nilai |
| Secure secret storage | 2 | Encrypt opsional; pageToken plain |
| Test/CI | 1 | Hampir kosong |
| Deploy story | 3 | Vercel+Neon terdokumentasi dengan batasan jujur di DEPLOY (sebagian) |

**Overall readiness: ~1.5 / 5 — Prototype / internal tool.**

---

## O. Tabel Temuan Konsolidasi (P0–P3)

| ID | P | Komponen | Bukti | Masalah | Dampak | Rekomendasi | Verifikasi fix |
|----|---|----------|-------|---------|--------|-------------|----------------|
| SEC-01 | P0 | Auth API | `server.js` (seluruh `/api`) | API tanpa login | Takeover publish/settings | Auth wajib | 401 tanpa session |
| SEC-02 | P0 | AI policy | `server.js:1039`, `ai-policy.js` | `forcePublish` anon | Bypass otonomi | Bind ke user auth | Anon force ditolak |
| SEC-03 | P0 | Browser login | `server.js:516` | Password endpoint terbuka | Credential theft | Matikan publik | Endpoint locked |
| INT-01 | P0 | Media URL | `server.js:741` | localhost media | OAuth publish gagal cloud | Object storage HTTPS | Graph fetch 200 |
| DB-01 | P0 | Schema | `schema.sql:12` | 1 akun/platform | Blocker SaaS | Multi-tenant schema | 2 org × same platform OK |
| SEC-04 | P1 | OAuth | `server.js:251` | sandbox=1 di REAL | Data palsu | Guard mode | 403 |
| SEC-05 | P1 | Cron | `server.js:1936` | Secret opsional | Trigger publish | Fail closed | 401 |
| SEC-06 | P1 | Tokens | `token-crypto.js`, `pageToken` | Encrypt partial/optional | Token leak DB | Encrypt all + required key | Ciphertext only |
| SEC-07 | P1 | Sessions | `sessions/` | Cookie files | Account hijack | Encrypt/ACL | — |
| SEC-08 | P1 | Upload | `server.js:113` | No MIME filter | Malware/DoS | Allowlist | Reject bad MIME |
| INT-02 | P1 | YouTube | no refresh use | Token expiry | YT fail | Refresh flow | Upload after 2h OK |
| INT-03 | P1 | Vercel | `server.js:53` | No automation | Fitur hilang cloud | Worker VPS | — |
| INT-04 | P1 | IG private | `instagram.js` | ToS/ban | Legal/ops | Graph only | — |
| WF-01 | P1 | Approve | `server.js:1623` | Non-atomic | UX/race | Single endpoint | — |
| WF-02 | P1 | Manual publish | posts API | Bypass AI policy | Inkonsistensi kontrol | Unified gate | — |
| AN-01 | P1 | Stats | `generateMockStats` | Fake analytics | Salah keputusan | Live metrics | Flag source |
| DEP-01 | P1 | Docs | `DEPLOY.md` vs `vercel.json` | Misinform schedule | Ops error | Align docs | — |
| DEP-02 | P1 | Upload cloud | `/tmp` | Media hilang | Publish rusak | Blob storage | Persist URL |
| QA-01 | P1 | Tests | no test script | Regresi | Unit tests | CI green | — |
| SEC-09 | P2 | CORS | `server.js:105` | Open CORS | CSRF-ish API | Allowlist | — |
| SEC-10 | P2 | OAuth state | `server.js:440` | Weak CSRF OAuth | Account linking abuse | Random state | — |
| INT-05 | P2 | Puppeteer | `browser.js:34` | headless false | Server issue | Fix flag | — |
| INT-06 | P2 | TikTok | init only | False success | Poll status | — |
| AI-02 | P2 | Insights | mock input | Bad recs | Live stats | — |
| DB-03 | P2 | IDs | Date.now | Collision | UUID | — |
| FE-01 | P2 | Frontend | monolith JS | Maintain cost | Modularize | — |
| SEC-13 | P3 | deps | bcrypt unused | Noise | Cleanup | — |
| AI-04 | P3 | LLM | none | Clarity | Document architecture | — |

---

## P. Lima Tindakan Pertama (Prioritas)

1. **Pasang autentikasi & otorisasi** pada semua `/api/*` mutasi; nonaktifkan atau proteksi ketat `browser-login` dan `forcePublish` (SEC-01/02/03).
2. **Wajibkan secret produksi:** `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` fail-closed; hilangkan override `sandbox=1` di mode REAL (SEC-04/05/06).
3. **Perbaiki publish cloud:** media ke object storage HTTPS; refresh token YouTube; jangan andalkan localhost URL (INT-01/02, DEP-02).
4. **Desain multi-tenant schema** (workspace → banyak social accounts) sebelum marketing sebagai SaaS (DB-01).
5. **Ganti mock analytics** dengan metrics API platform + tandai sumber data; tambah test gate policy (AN-01, QA-01).

---

## Q. Hal yang Belum Diverifikasi

Berikut **Not verified** dalam audit ini (butuh akses runtime/produksi atau uji live yang sengaja tidak dijalankan):

1. Keberhasilan OAuth end-to-end ke Meta/Google/TikTok dengan kredensial di `.env` (nilai tidak dibaca; publish tidak dijalankan).
2. Konektivitas dan isi database Neon produksi / env Vercel project.
3. Perilaku cold start, timeout, dan payload limit Vercel pada publish video besar.
4. Apakah app Meta/TikTok sudah lolos review developer untuk production scopes.
5. Efektivitas login Puppeteer terhadap UI platform terkini (selektor mudah rusak).
6. Kebenaran klaim performa Kantor AI 3D di perangkat target user.
7. Apakah remote GitHub mengandung history secrets (tidak diaudit `git log -p` penuh).
8. Keamanan konfigurasi Neon (IP allowlist, role privileges).
9. Rate limit / abuse dari internet ke deployment publik saat ini.
10. Kepatuhan hukum penyimpanan password yang dikirim ke `/browser-login` (jurisdiksi user).

---

## Lampiran A — Perintah read-only yang dijalankan

| Perintah | Tujuan | Risiko |
|----------|--------|--------|
| List file project / `git log` / `git remote` | Inventarisasi | Tidak ada (read) |
| `node --check` pada modul inti | Syntax | Tidak ada |
| Baca nama key `.env` saja (split `=`) | Inventory konfigurasi tanpa nilai | Rendah; **nilai tidak ditampilkan** |
| `node` inspect struktur `db.json` dengan redact token | Pahami data lokal | Rendah |
| `git check-ignore` / `git ls-files` secrets | Pastikan tidak ter-track | Tidak ada |

Tidak dijalankan: `npm install`, migrasi, hit publish API ke sosmed, baca isi secret.

---

## Lampiran B — Arsitektur file kunci

```
server.js              # Express API + publish + OAuth + AI routes
api/index.js           # Vercel adapter
db.js / db-postgres.js # Persistence facade
schema.sql             # Neon DDL
lib/ai-*.js            # Policy, roles, insights, notify
lib/token-crypto.js    # AES-256-GCM optional
automation/*           # Puppeteer / IG private API
app.js + index.html    # UI
ai-office-3d.js        # Visual Kantor AI
scripts/ai-employee-publish.js  # CLI agen
vercel.json            # Routes + daily cron
```

---

## Lampiran C — Klasifikasi klaim dokumentasi vs kode

| Klaim docs | Realitas kode | Label |
|------------|---------------|-------|
| Mode SANDBOX otomatis tanpa kredensial | Ya | Verified |
| Token encryption Fase 2 “Live” | Ya jika key set; else plain + warn | Verified (bersyarat) |
| Insights “Live” | Agregasi live dari data lokal; stats sering mock | Verified partial / overclaim risk |
| Email notify “Live” | Webhook HTTP ya; email = log stub | Verified partial |
| Cron tiap 5 menit | `vercel.json` daily noon; commit message sebut Hobby limit | Verified contradiction vs DEPLOY.md |
| Otak AI di server | Tidak; Cursor + rules | Verified |

---

*Akhir laporan audit teknis. Tidak ada perbaikan kode yang dilakukan pada tahap ini selain penulisan file ini.*
