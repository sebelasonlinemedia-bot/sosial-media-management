/**
 * PostSphere - Express Backend Server
 * Menangani OAuth 2.0 untuk Meta (FB/IG), Google/YouTube, TikTok
 * serta REST API untuk akun, postingan, dan penjadwalan otomatis.
 *
 * Mode SANDBOX: Aktif secara otomatis jika .env tidak dikonfigurasi.
 *               Semua aksi OAuth dan posting akan disimulasikan.
 *
 * Mode REAL:    Aktif jika kredensial API ada di file .env.
 *               Melakukan redirect OAuth asli dan mengirim ke API sosmed.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const db = require('./db');

// ============================================================
// Modul Otomasi Browser (Puppeteer) — tanpa API key
// ============================================================
let automationModules = {};
try {
    automationModules.instagram = require('./automation/instagram');
    automationModules.facebook  = require('./automation/facebook');
    automationModules.tiktok    = require('./automation/tiktok');
    automationModules.youtube   = require('./automation/youtube');
    console.log('🤖 [AUTOMATION] Modul browser automation berhasil dimuat.');
} catch (e) {
    console.warn('⚠️  [AUTOMATION] Modul browser automation tidak tersedia:', e.message);
}

// ============================================================
// Inisialisasi
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

// Muat database dari file
db.load();

// Deteksi apakah ada kredensial API (Mode REAL vs SANDBOX)
const SANDBOX_MODE = !(
    process.env.META_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    process.env.TIKTOK_CLIENT_KEY
);

if (SANDBOX_MODE) {
    console.log('⚠️  [SERVER] Mode SANDBOX aktif — tidak ada kredensial API ditemukan di .env');
    console.log('   Salin .env.example ke .env dan isi dengan kredensial asli untuk Mode REAL.');
} else {
    console.log('✅ [SERVER] Mode REAL aktif — menggunakan kredensial API dari .env');
}

// ============================================================
// Middleware
// ============================================================
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Setup storage media lokal dengan multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Sajikan file frontend (HTML, CSS, JS) dan media upload
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// ============================================================
// Helper Sandbox / Dummy Data
// ============================================================
const SANDBOX_PROFILES = {
    meta: { name: 'Akun Facebook/IG Demo', handle: '@demo_postsphere', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=256&auto=format&fit=crop', pageId: 'sandbox_page_001' },
    youtube: { name: 'Demo Channel YT', handle: '@DemoPostSphereYT', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&auto=format&fit=crop', channelId: 'sandbox_channel_001' },
    tiktok: { name: 'Demo TikTok', handle: '@demo_tiktok', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=256&auto=format&fit=crop', openId: 'sandbox_tiktok_001' }
};

// ============================================================
// API Routes: Informasi Mode
// ============================================================
app.get('/api/status', (req, res) => {
    res.json({
        mode: SANDBOX_MODE ? 'sandbox' : 'real',
        platforms: {
            meta: !!process.env.META_CLIENT_ID,
            youtube: !!process.env.GOOGLE_CLIENT_ID,
            tiktok: !!process.env.TIKTOK_CLIENT_KEY
        }
    });
});

// ============================================================
// API Routes: Manajemen Akun
// ============================================================

// GET: Daftar semua akun terhubung (tanpa token sensitif)
app.get('/api/accounts', (req, res) => {
    const accounts = db.getAccounts().map(a => {
        const { accessToken, refreshToken, ...safe } = a;
        return safe;
    });
    res.json({ success: true, accounts });
});

// DELETE: Putuskan akun dari platform tertentu
app.delete('/api/accounts/:platform', (req, res) => {
    const { platform } = req.params;
    const ok = db.disconnectAccount(platform);
    if (ok) {
        res.json({ success: true, message: `Akun ${platform} berhasil diputuskan.` });
    } else {
        res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
    }
});

// ============================================================
// API Routes: OAuth — META (Facebook & Instagram)
// ============================================================

// Step 1: Redirect ke halaman login Facebook
app.get('/api/auth/meta', (req, res) => {
    if (SANDBOX_MODE) {
        return res.redirect('/api/auth/meta/callback?sandbox=1');
    }
    const scopes = [
        'pages_manage_posts',
        'instagram_content_publish',
        'pages_read_engagement',
        'instagram_basic',
        'pages_show_list'
    ].join(',');
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}&scope=${scopes}&response_type=code`;
    res.redirect(authUrl);
});

// Step 2: Callback setelah pengguna setuju di Facebook
app.get('/api/auth/meta/callback', async (req, res) => {
    try {
        let profileData;

        if (req.query.sandbox === '1' || SANDBOX_MODE) {
            // SANDBOX: gunakan data dummy
            profileData = {
                platform: 'instagram',
                name: SANDBOX_PROFILES.meta.name,
                handle: SANDBOX_PROFILES.meta.handle,
                avatar: SANDBOX_PROFILES.meta.avatar,
                accessToken: 'sandbox_meta_token_' + Date.now(),
                pageId: SANDBOX_PROFILES.meta.pageId,
                sandbox: true
            };
            // Juga simpan akun Facebook
            db.upsertAccount({
                platform: 'facebook',
                name: SANDBOX_PROFILES.meta.name + ' (FB)',
                handle: SANDBOX_PROFILES.meta.handle,
                avatar: SANDBOX_PROFILES.meta.avatar,
                accessToken: 'sandbox_meta_token_' + Date.now(),
                pageId: SANDBOX_PROFILES.meta.pageId,
                sandbox: true,
                connected: true
            });
        } else {
            // REAL: Tukar code dengan access token
            const code = req.query.code;
            if (!code) return res.redirect('/?auth=meta&status=error&msg=no_code');

            const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                params: {
                    client_id: process.env.META_CLIENT_ID,
                    client_secret: process.env.META_CLIENT_SECRET,
                    redirect_uri: process.env.META_REDIRECT_URI,
                    code
                }
            });
            const accessToken = tokenRes.data.access_token;

            // Ambil profil pengguna
            const meRes = await axios.get('https://graph.facebook.com/v19.0/me', {
                params: { access_token: accessToken, fields: 'id,name,picture' }
            });

            // Ambil daftar halaman Facebook
            const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
                params: { access_token: accessToken }
            });
            const page = pagesRes.data.data && pagesRes.data.data[0];

            // Ambil akun Instagram yang terhubung
            let igHandle = meRes.data.name;
            let igId = null;
            if (page) {
                try {
                    const igRes = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
                        params: { fields: 'instagram_business_account', access_token: page.access_token }
                    });
                    if (igRes.data.instagram_business_account) {
                        igId = igRes.data.instagram_business_account.id;
                        const igProfile = await axios.get(`https://graph.facebook.com/v19.0/${igId}`, {
                            params: { fields: 'username,profile_picture_url', access_token: page.access_token }
                        });
                        igHandle = '@' + (igProfile.data.username || igHandle);
                    }
                } catch (e) { /* IG tidak terhubung */ }
            }

            profileData = {
                platform: 'instagram',
                name: meRes.data.name,
                handle: igHandle,
                avatar: meRes.data.picture ? meRes.data.picture.data.url : '',
                accessToken: page ? page.access_token : accessToken,
                igUserId: igId,
                pageId: page ? page.id : null,
                pageToken: page ? page.access_token : null,
                connected: true
            };

            // Simpan juga akun Facebook
            db.upsertAccount({
                platform: 'facebook',
                name: page ? page.name : meRes.data.name,
                handle: page ? page.name : meRes.data.name,
                avatar: meRes.data.picture ? meRes.data.picture.data.url : '',
                accessToken: page ? page.access_token : accessToken,
                pageId: page ? page.id : null,
                connected: true
            });
        }

        // Simpan profil Instagram ke database
        db.upsertAccount({ ...profileData, connected: true });
        console.log(`[AUTH] Meta terhubung: ${profileData.handle}`);
        res.redirect(`/?auth=meta&status=success`);

    } catch (err) {
        console.error('[AUTH Meta ERROR]', err.response ? err.response.data : err.message);
        res.redirect(`/?auth=meta&status=error&msg=${encodeURIComponent(err.message)}`);
    }
});

// ============================================================
// API Routes: OAuth — GOOGLE / YouTube
// ============================================================

app.get('/api/auth/youtube', (req, res) => {
    if (SANDBOX_MODE) {
        return res.redirect('/api/auth/youtube/callback?sandbox=1');
    }
    const scopes = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'profile',
        'email'
    ].join(' ');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
    res.redirect(authUrl);
});

app.get('/api/auth/youtube/callback', async (req, res) => {
    try {
        let profileData;

        if (req.query.sandbox === '1' || SANDBOX_MODE) {
            profileData = {
                platform: 'youtube',
                name: SANDBOX_PROFILES.youtube.name,
                handle: SANDBOX_PROFILES.youtube.handle,
                avatar: SANDBOX_PROFILES.youtube.avatar,
                accessToken: 'sandbox_yt_token_' + Date.now(),
                channelId: SANDBOX_PROFILES.youtube.channelId,
                sandbox: true,
                connected: true
            };
        } else {
            const code = req.query.code;
            if (!code) return res.redirect('/?auth=youtube&status=error&msg=no_code');

            // Tukar code dengan token
            const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: process.env.GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code'
            });

            const { access_token, refresh_token } = tokenRes.data;

            // Ambil profil channel YouTube
            const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
                params: { part: 'snippet', mine: true },
                headers: { Authorization: `Bearer ${access_token}` }
            });

            const channel = channelRes.data.items && channelRes.data.items[0];
            const snippet = channel ? channel.snippet : {};

            profileData = {
                platform: 'youtube',
                name: snippet.title || 'YouTube Channel',
                handle: '@' + (snippet.customUrl || snippet.title || 'YTChannel'),
                avatar: snippet.thumbnails ? snippet.thumbnails.default.url : '',
                accessToken: access_token,
                refreshToken: refresh_token,
                channelId: channel ? channel.id : null,
                connected: true
            };
        }

        db.upsertAccount(profileData);
        console.log(`[AUTH] YouTube terhubung: ${profileData.handle}`);
        res.redirect('/?auth=youtube&status=success');

    } catch (err) {
        console.error('[AUTH YouTube ERROR]', err.response ? err.response.data : err.message);
        res.redirect(`/?auth=youtube&status=error&msg=${encodeURIComponent(err.message)}`);
    }
});

// ============================================================
// API Routes: OAuth — TikTok
// ============================================================

app.get('/api/auth/tiktok', (req, res) => {
    if (SANDBOX_MODE) {
        return res.redirect('/api/auth/tiktok/callback?sandbox=1');
    }
    const scopes = ['user.info.basic', 'video.upload', 'video.publish'].join(',');
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI)}&state=postsphere`;
    res.redirect(authUrl);
});

app.get('/api/auth/tiktok/callback', async (req, res) => {
    try {
        let profileData;

        if (req.query.sandbox === '1' || SANDBOX_MODE) {
            profileData = {
                platform: 'tiktok',
                name: SANDBOX_PROFILES.tiktok.name,
                handle: SANDBOX_PROFILES.tiktok.handle,
                avatar: SANDBOX_PROFILES.tiktok.avatar,
                accessToken: 'sandbox_tt_token_' + Date.now(),
                openId: SANDBOX_PROFILES.tiktok.openId,
                sandbox: true,
                connected: true
            };
        } else {
            const code = req.query.code;
            if (!code) return res.redirect('/?auth=tiktok&status=error&msg=no_code');

            // Tukar code dengan token TikTok
            const tokenRes = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
                client_key: process.env.TIKTOK_CLIENT_KEY,
                client_secret: process.env.TIKTOK_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: process.env.TIKTOK_REDIRECT_URI
            }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            const { access_token, open_id } = tokenRes.data;

            // Ambil profil pengguna TikTok
            const userRes = await axios.post('https://open.tiktokapis.com/v2/user/info/', {
                fields: ['open_id', 'display_name', 'avatar_url']
            }, {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            const ttUser = userRes.data.data ? userRes.data.data.user : {};

            profileData = {
                platform: 'tiktok',
                name: ttUser.display_name || 'TikTok User',
                handle: '@' + (ttUser.display_name || 'tiktokuser'),
                avatar: ttUser.avatar_url || '',
                accessToken: access_token,
                openId: open_id || ttUser.open_id,
                connected: true
            };
        }

        db.upsertAccount(profileData);
        console.log(`[AUTH] TikTok terhubung: ${profileData.handle}`);
        res.redirect('/?auth=tiktok&status=success');

    } catch (err) {
        console.error('[AUTH TikTok ERROR]', err.response ? err.response.data : err.message);
        res.redirect(`/?auth=tiktok&status=error&msg=${encodeURIComponent(err.message)}`);
    }
});

// ============================================================
// API Routes: Browser Login (tanpa API key — hanya username/password)
// ============================================================

/**
 * POST /api/auth/browser-login
 * Body: { platform: 'instagram'|'facebook'|'tiktok'|'youtube', username, password }
 * Membuka browser Puppeteer untuk login dan menyimpan session.
 */
app.post('/api/auth/browser-login', async (req, res) => {
    const { platform, username, password } = req.body;
    if (!platform || !username || !password) {
        return res.status(400).json({ success: false, message: 'Platform, username, dan password wajib diisi.' });
    }

    const mod = automationModules[platform];
    if (!mod) {
        return res.status(400).json({ success: false, message: `Platform '${platform}' tidak didukung untuk mode browser login.` });
    }

    try {
        let profileData;
        switch (platform) {
            case 'instagram': profileData = await mod.loginInstagram(username, password); break;
            case 'facebook':  profileData = await mod.loginFacebook(username, password);  break;
            case 'tiktok':    profileData = await mod.loginTikTok(username, password);    break;
            case 'youtube':   profileData = await mod.loginYouTube(username, password);   break;
            default: throw new Error('Platform tidak dikenal.');
        }
        profileData.sandbox = false;
        db.upsertAccount(profileData);
        console.log(`[AUTH-BROWSER] ${platform} terhubung: ${profileData.handle}`);
        res.json({ success: true, account: { ...profileData, password: undefined } });
    } catch (err) {
        console.error(`[AUTH-BROWSER] Error login ${platform}:`, err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * DELETE /api/auth/browser-logout/:platform
 * Menghapus session browser dan memutuskan akun.
 */
app.delete('/api/auth/browser-logout/:platform', (req, res) => {
    const { platform } = req.params;
    try {
        const { clearSession } = require('./automation/browser');
        clearSession(platform);
        db.disconnectAccount(platform);
        res.json({ success: true, message: `Session ${platform} dihapus.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// API Routes: Unggah Media
// ============================================================

// Upload file media (gambar/video) ke server
app.post('/api/media/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah.' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    res.json({ success: true, url: fileUrl, type: fileType, filename: req.file.filename });
});

// ============================================================
// API Routes: Manajemen Postingan
// ============================================================

// GET: Daftar semua postingan
app.get('/api/posts', (req, res) => {
    const posts = db.getPosts();
    res.json({ success: true, posts });
});

// POST: Buat postingan baru (langsung atau terjadwal)
app.post('/api/posts', async (req, res) => {
    const { caption, mediaUrl, mediaType, platforms, status, publishDate } = req.body;

    if (!platforms || platforms.length === 0) {
        return res.status(400).json({ success: false, message: 'Pilih setidaknya satu platform.' });
    }

    let postStatus = status || 'posted';
    let finalPublishDate = publishDate || new Date().toISOString();

    // Simpan postingan ke database
    const newPost = db.addPost({
        caption: caption || '',
        mediaUrl: mediaUrl || '',
        mediaType: mediaType || '',
        platforms,
        status: postStatus,
        publishDate: finalPublishDate,
        stats: null,
        publishResults: {}
    });

    // Jika langsung dikirim, proses sekarang
    if (postStatus === 'posted') {
        const results = await publishToAllPlatforms(newPost);
        db.updatePost(newPost.id, {
            status: 'posted',
            publishResults: results,
            stats: generateMockStats()
        });
        return res.json({ success: true, post: db.getPostById(newPost.id), results });
    }

    res.json({ success: true, post: newPost });
});

// DELETE: Hapus satu postingan
app.delete('/api/posts/:id', (req, res) => {
    const ok = db.deletePost(req.params.id);
    if (ok) {
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Postingan tidak ditemukan.' });
    }
});

// PUT: Perbarui/Ubah postingan yang ada (misal: terjadwal atau draf)
app.put('/api/posts/:id', async (req, res) => {
    const { id } = req.params;
    const { caption, mediaUrl, mediaType, platforms, status, publishDate } = req.body;

    const post = db.getPostById(id);
    if (!post) {
        return res.status(404).json({ success: false, message: 'Postingan tidak ditemukan.' });
    }

    const updates = {};
    if (caption !== undefined) updates.caption = caption;
    if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl;
    if (mediaType !== undefined) updates.mediaType = mediaType;
    if (platforms !== undefined) updates.platforms = platforms;
    if (status !== undefined) updates.status = status;
    if (publishDate !== undefined) updates.publishDate = publishDate;

    // Jika diedit dan status diubah menjadi langsung dikirim (posted), jalankan mesin publikasi
    const updatedPost = db.updatePost(id, updates);
    if (status === 'posted' && post.status !== 'posted') {
        const results = await publishToAllPlatforms(updatedPost);
        db.updatePost(id, {
            status: 'posted',
            publishResults: results,
            stats: generateMockStats()
        });
        return res.json({ success: true, post: db.getPostById(id), results });
    }

    res.json({ success: true, post: updatedPost });
});

// POST: Publikasikan postingan terjadwal secara langsung
app.post('/api/posts/:id/publish', async (req, res) => {
    const post = db.getPostById(req.params.id);
    if (!post) {
        return res.status(404).json({ success: false, message: 'Postingan tidak ditemukan.' });
    }
    const results = await publishToAllPlatforms(post);
    db.updatePost(post.id, {
        status: 'posted',
        publishDate: new Date().toISOString(),
        publishResults: results,
        stats: generateMockStats()
    });
    res.json({ success: true, post: db.getPostById(post.id), results });
});

// ============================================================
// Mesin Publikasi Konten
// ============================================================

/**
 * Memproses publikasi ke semua platform yang dipilih
 * Mengembalikan hasil per platform: { platform: 'success'|'error' }
 */
async function publishToAllPlatforms(post) {
    const results = {};
    const accounts = db.getAccounts();

    for (const platform of post.platforms) {
        const acc = accounts.find(a => a.platform === platform && a.connected);
        if (!acc) {
            results[platform] = { status: 'error', message: 'Akun tidak terhubung.' };
            continue;
        }

        try {
            if (acc.sandbox || (SANDBOX_MODE && !['browser', 'private_api'].includes(acc.automationType))) {
                // SANDBOX: Simulasikan keberhasilan
                await new Promise(r => setTimeout(r, 200));
                results[platform] = { status: 'success', message: 'Berhasil (Sandbox)', postId: 'sandbox_post_' + Date.now() };
            } else {
                // REAL / BROWSER AUTOMATION: Panggil API platform atau jalankan Puppeteer
                const result = await callPlatformAPI(platform, acc, post);
                results[platform] = result;
            }
            console.log(`[PUBLISH] ${platform}: ✅`, results[platform]);
        } catch (err) {
            console.error(`[PUBLISH] ${platform}: ❌`, err.message);
            results[platform] = { status: 'error', message: err.message };
        }
    }

    return results;
}

/**
 * Mengirim konten ke API platform nyata (OAuth) atau via Browser Automation
 */
async function callPlatformAPI(platform, acc, post) {
    // === BROWSER / PRIVATE API AUTOMATION MODE ===
    // Jika akun login via username/password (bukan OAuth)
    if (acc.automationType === 'browser' || acc.automationType === 'private_api') {
        const mod = automationModules[platform];
        if (!mod) throw new Error(`Modul automation untuk '${platform}' tidak tersedia.`);

        switch (platform) {
            case 'instagram': return await mod.postInstagram(acc, post);
            case 'facebook':  return await mod.postFacebook(acc, post);
            case 'tiktok':    return await mod.postTikTok(acc, post);
            case 'youtube':   return await mod.postYouTube(acc, post);
            default: throw new Error(`Platform tidak dikenali: ${platform}`);
        }
    }

    // === OAUTH API MODE (credential asli) ===
    const mediaUrl = post.mediaUrl ? `http://localhost:${PORT}${post.mediaUrl.startsWith('/') ? post.mediaUrl : '/' + post.mediaUrl}` : null;

    switch (platform) {
        case 'facebook': {
            const params = { message: post.caption, access_token: acc.accessToken };
            if (mediaUrl && post.mediaType === 'image') {
                const photoRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.pageId}/photos`, {
                    url: mediaUrl, caption: post.caption, access_token: acc.accessToken
                });
                return { status: 'success', postId: photoRes.data.id };
            } else {
                const feedRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.pageId}/feed`, params);
                return { status: 'success', postId: feedRes.data.id };
            }
        }

        case 'instagram': {
            if (!acc.igUserId) throw new Error('Akun Instagram Business belum terhubung ke halaman Facebook.');
            if (!mediaUrl) throw new Error('Instagram memerlukan media (gambar/video).');

            if (post.mediaType === 'video') {
                const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media`, {
                    video_url: mediaUrl, caption: post.caption, media_type: 'REELS', access_token: acc.accessToken
                });
                await new Promise(r => setTimeout(r, 5000));
                const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media_publish`, {
                    creation_id: containerRes.data.id, access_token: acc.accessToken
                });
                return { status: 'success', postId: publishRes.data.id };
            } else {
                const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media`, {
                    image_url: mediaUrl, caption: post.caption, access_token: acc.accessToken
                });
                const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media_publish`, {
                    creation_id: containerRes.data.id, access_token: acc.accessToken
                });
                return { status: 'success', postId: publishRes.data.id };
            }
        }

        case 'youtube': {
            if (!mediaUrl || post.mediaType !== 'video') throw new Error('YouTube memerlukan file video.');
            const videoPath = path.join(__dirname, 'uploads', path.basename(post.mediaUrl));
            if (!fs.existsSync(videoPath)) throw new Error('File video tidak ditemukan di server.');

            const FormData = require('form-data');
            const form = new FormData();
            form.append('snippet', JSON.stringify({
                title: post.caption ? post.caption.substring(0, 100) : 'PostSphere Upload',
                description: post.caption || '',
                categoryId: '22'
            }), { contentType: 'application/json' });
            form.append('status', JSON.stringify({ privacyStatus: 'public' }), { contentType: 'application/json' });
            form.append('file', fs.createReadStream(videoPath), { contentType: 'video/*' });

            const ytRes = await axios.post(
                'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
                form,
                { headers: { ...form.getHeaders(), Authorization: `Bearer ${acc.accessToken}` } }
            );
            return { status: 'success', postId: ytRes.data.id, videoUrl: `https://youtu.be/${ytRes.data.id}` };
        }

        case 'tiktok': {
            if (!mediaUrl || post.mediaType !== 'video') throw new Error('TikTok memerlukan file video.');
            const initRes = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
                post_info: {
                    title: post.caption ? post.caption.substring(0, 150) : 'PostSphere Video',
                    privacy_level: 'PUBLIC_TO_EVERYONE',
                    disable_duet: false, disable_comment: false, disable_stitch: false,
                    video_cover_timestamp_ms: 1000
                },
                source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl }
            }, {
                headers: { Authorization: `Bearer ${acc.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }
            });
            return { status: 'success', publishId: initRes.data.data ? initRes.data.data.publish_id : null };
        }

        default:
            throw new Error(`Platform tidak dikenali: ${platform}`);
    }
}

// Helper buat statistik palsu
function generateMockStats() {
    return {
        reach: Math.floor(Math.random() * 5000) + 100,
        engagement: Math.floor(Math.random() * 800) + 12,
        clicks: Math.floor(Math.random() * 150)
    };
}

// ============================================================
// Background Scheduler (cek setiap 60 detik)
// ============================================================
async function runScheduler() {
    const duePosts = db.getDueScheduledPosts();
    if (duePosts.length > 0) {
        console.log(`[SCHEDULER] ${duePosts.length} postingan siap diterbitkan...`);
        for (const post of duePosts) {
            console.log(`[SCHEDULER] Memproses: ${post.id} - ${post.caption ? post.caption.substring(0, 50) : 'tanpa keterangan'}...`);
            try {
                const results = await publishToAllPlatforms(post);
                db.updatePost(post.id, {
                    status: 'posted',
                    publishDate: new Date().toISOString(),
                    publishResults: results,
                    stats: generateMockStats()
                });
                console.log(`[SCHEDULER] ✅ Berhasil diterbitkan: ${post.id}`);
            } catch (err) {
                console.error(`[SCHEDULER] ❌ Gagal: ${post.id}`, err.message);
                db.updatePost(post.id, { status: 'failed', lastError: err.message });
            }
        }
    }
}

// Jalankan scheduler pertama kali, lalu setiap 60 detik
runScheduler();
setInterval(runScheduler, 60 * 1000);
console.log('[SCHEDULER] Background scheduler aktif — mengecek setiap 60 detik.');

// ============================================================
// API: Karyawan AI (dioperasikan agen Cursor — publish langsung)
// ============================================================

/**
 * Konteks cepat untuk agen: mode server + akun siap pakai
 */
app.get('/api/ai/employee/context', (req, res) => {
    const accounts = db.getAccounts()
        .filter(a => a.connected)
        .map(a => {
            const { accessToken, refreshToken, sessionState, password, ...safe } = a;
            return {
                platform: safe.platform,
                handle: safe.handle,
                name: safe.name,
                sandbox: !!safe.sandbox,
                automationType: safe.automationType || (safe.sandbox ? 'sandbox' : 'oauth')
            };
        });

    const recentAiPosts = db.getPosts()
        .filter(p => p.createdBy === 'ai-employee')
        .slice(-10)
        .reverse()
        .map(p => ({
            id: p.id,
            caption: (p.caption || '').slice(0, 120),
            platforms: p.platforms,
            status: p.status,
            employeeName: p.employeeName,
            createdAt: p.createdAt,
            publishResults: p.publishResults || {}
        }));

    res.json({
        success: true,
        mode: SANDBOX_MODE ? 'sandbox' : 'real',
        policy: 'auto_publish',
        baseUrl: `http://localhost:${PORT}`,
        connectedPlatforms: accounts.map(a => a.platform),
        accounts,
        recentAiPosts
    });
});

/**
 * Karyawan AI: buat caption dari brief (jika perlu) lalu LANGSUNG publish.
 * Tidak ada tahap approval — sesuai kebijakan user (mode 2B).
 */
app.post('/api/ai/employee/publish', async (req, res) => {
    try {
        const {
            brief,
            caption,
            platforms,
            mediaUrl,
            mediaType,
            employeeName
        } = req.body || {};

        const finalCaption = (caption || brief || '').trim();
        if (!finalCaption) {
            return res.status(400).json({
                success: false,
                message: 'Wajib isi caption atau brief.'
            });
        }

        const connected = db.getAccounts().filter(a => a.connected).map(a => a.platform);
        let targetPlatforms = Array.isArray(platforms) && platforms.length
            ? platforms.map(p => String(p).toLowerCase())
            : connected;

        targetPlatforms = [...new Set(targetPlatforms)].filter(p => connected.includes(p));

        if (targetPlatforms.length === 0) {
            return res.status(400).json({
                success: false,
                message: connected.length
                    ? 'Tidak ada platform target yang terhubung. Sesuaikan daftar platforms.'
                    : 'Belum ada akun terhubung. Hubungkan akun dulu di UI PostSphere.'
            });
        }

        const name = (employeeName || 'Karyawan AI').trim();
        console.log(`🤖 [AI-EMPLOYEE] ${name} publish → ${targetPlatforms.join(', ')}`);

        const newPost = db.addPost({
            caption: finalCaption,
            mediaUrl: mediaUrl || '',
            mediaType: mediaType || '',
            platforms: targetPlatforms,
            status: 'posted',
            publishDate: new Date().toISOString(),
            stats: null,
            publishResults: {},
            createdBy: 'ai-employee',
            employeeName: name,
            brief: brief || ''
        });

        const results = await publishToAllPlatforms(newPost);
        const failed = Object.values(results).some(r => r && r.status === 'error');
        db.updatePost(newPost.id, {
            status: failed ? 'failed' : 'posted',
            publishResults: results,
            stats: generateMockStats(),
            lastError: failed
                ? Object.entries(results)
                    .filter(([, r]) => r && r.status === 'error')
                    .map(([plat, r]) => `${plat}: ${r.message || 'gagal'}`)
                    .join('; ')
                : undefined
        });

        const post = db.getPostById(newPost.id);
        console.log(`🤖 [AI-EMPLOYEE] Selesai ${post.id} — ${failed ? 'ADA GAGAL' : 'OK'}`);

        res.json({
            success: !failed,
            policy: 'auto_publish',
            employeeName: name,
            post,
            results
        });
    } catch (err) {
        console.error('🤖 [AI-EMPLOYEE] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// Serve Frontend (Fallback ke index.html)
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log(`║  PostSphere Server berjalan di port ${PORT}    ║`);
    console.log(`║  Buka: http://localhost:${PORT}               ║`);
    console.log(`║  Mode: ${SANDBOX_MODE ? 'SANDBOX (simulasi)       ' : 'REAL (API terhubung)    '} ║`);
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
});
