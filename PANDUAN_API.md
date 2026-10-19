# Panduan Menghubungkan Akun Asli — PostSphere

## Cara Mendapatkan API Key untuk Setiap Platform

---

## 1. Meta (Facebook + Instagram)

### Langkah-langkah:
1. Buka [https://developers.facebook.com/](https://developers.facebook.com/) → Login
2. Klik **My Apps** → **Create App** → pilih **Business**
3. Isi nama app, lalu klik **Create App**
4. Di dashboard, tambahkan produk:
   - **Facebook Login** → Website
   - **Instagram Graph API**
5. Di menu **Facebook Login > Settings**:
   - Tambahkan **Valid OAuth Redirect URIs**: `http://localhost:3000/api/auth/meta/callback`
6. Buka **Settings > Basic**:
   - Salin **App ID** → isi ke `META_CLIENT_ID` di file `.env`
   - Salin **App Secret** → isi ke `META_CLIENT_SECRET`
7. Hubungkan **Halaman Facebook** dan **Akun Instagram Business** ke aplikasi Meta Anda

> ⚠️ Instagram hanya mendukung **akun Business/Creator**, bukan akun pribadi.

---

## 2. Google / YouTube

### Langkah-langkah:
1. Buka [https://console.cloud.google.com/](https://console.cloud.google.com/) → Buat project baru
2. Buka **APIs & Services > Library** → aktifkan **YouTube Data API v3**
3. Buka **APIs & Services > Credentials** → **Create Credentials > OAuth 2.0 Client IDs**
4. Pilih **Web Application**
5. Di bagian **Authorized Redirect URIs**, tambahkan: `http://localhost:3000/api/auth/youtube/callback`
6. Salin **Client ID** → isi ke `GOOGLE_CLIENT_ID`
7. Salin **Client Secret** → isi ke `GOOGLE_CLIENT_SECRET`
8. Buka **OAuth Consent Screen** → tambahkan email Anda sebagai **Test User**

> ⚠️ Untuk penggunaan publik, app perlu diverifikasi oleh Google. Untuk testing pribadi, cukup tambahkan email ke Test Users.

---

## 3. TikTok

### Langkah-langkah:
1. Buka [https://developers.tiktok.com/](https://developers.tiktok.com/) → Login dengan akun TikTok
2. Buat **App** baru → pilih **Web**
3. Di bagian **Products**, aktifkan:
   - **Login Kit**
   - **Content Posting API**
4. Di **Redirect URI**, tambahkan: `http://localhost:3000/api/auth/tiktok/callback`
5. Salin **Client Key** → isi ke `TIKTOK_CLIENT_KEY`
6. Salin **Client Secret** → isi ke `TIKTOK_CLIENT_SECRET`

> ⚠️ TikTok memerlukan proses persetujuan API khusus untuk Content Posting API.

---

## Konfigurasi File .env

Setelah mendapatkan semua key, salin dan isi file `.env`:

```bash
# Salin template
copy .env.example .env
```

Kemudian edit `.env` dengan Notepad atau VS Code:

```env
META_CLIENT_ID=123456789012345
META_CLIENT_SECRET=abcdef1234567890abcdef1234567890
META_REDIRECT_URI=http://localhost:3000/api/auth/meta/callback

GOOGLE_CLIENT_ID=123456789012-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/youtube/callback

TIKTOK_CLIENT_KEY=aw1234567890abcd
TIKTOK_CLIENT_SECRET=abc1234567890abcdef1234567890abc
TIKTOK_REDIRECT_URI=http://localhost:3000/api/auth/tiktok/callback
```

---

## Menjalankan Server

```bash
# Di folder POST SOSMED
node server.js
```

Buka browser: **http://localhost:3000**

---

## Perbedaan Mode Sandbox vs Mode Real

| Fitur | Sandbox | Real |
|---|---|---|
| Login akun | Simulasi | OAuth nyata |
| Posting konten | Simulasi | Dikirim ke API |
| Data akun | Data dummy | Profil asli |
| API key diperlukan | ❌ Tidak | ✅ Ya |
| Perlu internet | Tidak | Ya |
