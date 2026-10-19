/**
 * PiK's Digital Lab - Express Backend Server
 * Menangani OAuth 2.0 untuk Meta (FB/IG), Google/YouTube, TikTok
 * serta REST API untuk akun, postingan, dan penjadwalan otomatis.
 *
 * Mode SANDBOX: Aktif secara otomatis jika .env tidak dikonfigurasi.
 *               Semua aksi OAuth dan posting akan disimulasikan.
 *
 * Mode REAL:    Aktif jika kredensial API ada di file .env.
 *               Melakukan redirect OAuth asli dan mengirim ke API sosmed.
 */

const path = require('path');
// Load .env sebelum modul lain membaca process.env (auth bootstrap, DB mode, dll).
// Perubahan .env membutuhkan restart proses Node (`npm run dev` / `npm start`).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');

const db = require('./db');
const {
    listRoles,
    getRoleById,
    resolveRole,
    deriveEmployeeStatus,
    summarizeWorkload,
    normalizeRoleId
} = require('./lib/ai-roles');
const {
    BRIEF_TEMPLATES,
    normalizeBrandMemory,
    summarizeBrandMemory,
    normalizeAiSettings,
    publicAiSettings,
    evaluatePublishGate,
    evaluateManualPublishGate,
    assessStructuredBrief,
    appendDecision,
    enforceRolePlatforms,
    ALL_PLATFORMS,
    AUTONOMY_LEVELS
} = require('./lib/ai-policy');
const { isEncryptionEnabled, warnIfNoEncryptionKey, encryptSecret } = require('./lib/token-crypto');
const { listProviders } = require('./lib/llm');
const { runCeoChatTurn } = require('./lib/ceo-chat');
const {
    resolveCrewPresenceUpdate,
    applyPresenceToStatus,
    normalizeCrewPresence
} = require('./lib/crew-presence');
const { buildInsights } = require('./lib/ai-insights');
const { notifyJobAttention } = require('./lib/ai-notify');
const auth = require('./lib/auth');
const { createOAuthState, verifyOAuthState } = require('./lib/oauth-state');
const { createRateLimiter } = require('./lib/rate-limit');
const { sanitizeFilename, multerFileFilter } = require('./lib/upload-safe');
const { resolveWorkspaceId, DEFAULT_WORKSPACE_ID } = require('./lib/workspace');
const { publishOutcomeFields } = require('./lib/publish-status');
const {
    generateMockStats,
    fetchLiveMetrics,
    fetchLiveMetricsForAccounts,
    summarizeStatsSources
} = require('./lib/metrics');
const { safeLog } = require('./lib/safe-log');
const { pollTikTokPublishStatus } = require('./lib/tiktok-publish');
const { isBlobConfigured, persistUploadedFile } = require('./lib/object-storage');

const IS_VERCEL = !!process.env.VERCEL;
const IS_PRODUCTION = auth.isProduction();

// ============================================================
// Modul Otomasi Browser (Puppeteer) — tidak dimuat di Vercel
// ============================================================
let automationModules = {};
if (!IS_VERCEL) {
    try {
        automationModules.instagram = require('./automation/instagram');
        automationModules.facebook  = require('./automation/facebook');
        automationModules.tiktok    = require('./automation/tiktok');
        automationModules.youtube   = require('./automation/youtube');
        console.log('🤖 [AUTOMATION] Modul browser automation berhasil dimuat.');
    } catch (e) {
        console.warn('⚠️  [AUTOMATION] Modul browser automation tidak tersedia:', e.message);
    }
} else {
    console.log('ℹ️  [AUTOMATION] Dilewati di Vercel (serverless).');
}

// ============================================================
// Inisialisasi
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

let dbReady = null;
function ensureDb() {
    if (!dbReady) dbReady = db.load();
    return dbReady;
}
let bootstrapDone = null;
function ensureBootstrap() {
    if (!bootstrapDone) {
        bootstrapDone = auth.ensureBootstrapAdmin(db).catch(err => {
            console.warn('[auth] Bootstrap admin gagal:', err.message);
            bootstrapDone = null;
        });
    }
    return bootstrapDone;
}

app.use(async (req, res, next) => {
    try {
        await ensureDb();
        await ensureBootstrap();
        next();
    } catch (err) {
        console.error('[DB] Init gagal:', err.message);
        res.status(500).json({ success: false, message: 'Database belum siap: ' + err.message });
    }
});

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

if (IS_PRODUCTION && !isEncryptionEnabled()) {
    console.warn('[token-crypto] PRODUCTION: TOKEN_ENCRYPTION_KEY kosong/lemah — token OAuth disimpan plain. Set key ≥16 karakter.');
} else {
    warnIfNoEncryptionKey();
}

/** Base URL publik untuk media yang diambil platform eksternal (bukan localhost di cloud). */
function getPublicBaseUrl(req) {
    const fromEnv = (process.env.PUBLIC_BASE_URL || process.env.APP_ORIGIN || '').replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    if (req && req.get) {
        const host = req.get('x-forwarded-host') || req.get('host');
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
        if (host) return `${proto}://${host}`;
    }
    return `http://localhost:${PORT}`;
}

function absoluteMediaUrl(mediaPath, req) {
    if (!mediaPath) return null;
    if (/^https?:\/\//i.test(mediaPath)) return mediaPath;
    const base = getPublicBaseUrl(req);
    const pathPart = mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
    return `${base}${pathPart}`;
}

/** Di cloud, media untuk Graph/TikTok tidak boleh localhost. */
function assertCloudMediaUrl(mediaUrl) {
    if (!IS_PRODUCTION || !mediaUrl) return;
    if (/localhost|127\.0\.0\.1/i.test(mediaUrl)) {
        throw new Error(
            'PUBLIC_BASE_URL wajib di cloud (HTTPS publik). Media localhost tidak bisa di-fetch Meta/TikTok. ' +
            'Set PUBLIC_BASE_URL / APP_ORIGIN, atau unggah ke Blob/S3 (lihat DEPLOY.md).'
        );
    }
}

async function assertNotEmergencyPaused() {
    const settings = await db.getAiSettings();
    if (settings && settings.emergencyPause) {
        const err = new Error('Emergency pause aktif — publish diblokir.');
        err.statusCode = 423;
        throw err;
    }
    return settings;
}

/** Gate publish manual: emergencyPause + dailyPostCap (+ warnings high-risk). */
async function assertManualPublishAllowed({ platforms, caption, brief } = {}) {
    const settings = await db.getAiSettings();
    const brandMemories = await collectBrandMemories(platforms || []);
    const recentPosts = await db.getPosts();
    const gate = evaluateManualPublishGate({
        settings,
        platforms: platforms || [],
        caption: caption || '',
        brief: brief || '',
        brandMemories,
        recentPosts
    });
    if (!gate.allowPublish) {
        const err = new Error(gate.reasons[0] || 'Publish diblokir oleh kebijakan.');
        err.statusCode = gate.policy === 'emergency_pause' ? 423 : 403;
        err.gate = gate;
        throw err;
    }
    return gate;
}

function rejectSandboxInReal(req, res) {
    if (req.query.sandbox === '1' && !SANDBOX_MODE) {
        res.status(403).json({
            success: false,
            message: 'Override ?sandbox=1 diblokir saat mode REAL (kredensial OAuth ada).'
        });
        return true;
    }
    return false;
}

// ============================================================
// Middleware
// ============================================================
const corsAllowed = [
    process.env.APP_ORIGIN,
    process.env.PUBLIC_BASE_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
].filter(Boolean).map(o => String(o).replace(/\/$/, ''));

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (!IS_PRODUCTION) return callback(null, true);
        const normalized = origin.replace(/\/$/, '');
        if (corsAllowed.includes(normalized)) return callback(null, true);
        console.warn('[cors] Ditolak origin:', origin);
        return callback(null, false);
    },
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(auth.attachUser);
app.use(auth.requireAuthForApi);

const rateLimitLogin = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.'
});
const rateLimitPublish = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: 'Terlalu banyak publish. Coba lagi nanti.'
});

// Setup storage media (lokal /tmp di Vercel — ephemeral; produksi → Blob/S3)
const uploadDir = IS_VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: multerFileFilter
});

if (IS_PRODUCTION) {
    const pub = (process.env.PUBLIC_BASE_URL || process.env.APP_ORIGIN || '').replace(/\/$/, '');
    if (!pub || /localhost|127\.0\.0\.1/i.test(pub)) {
        console.warn('[media] PRODUCTION: set PUBLIC_BASE_URL ke HTTPS publik (bukan localhost) agar Graph/TikTok bisa fetch media.');
    }
}

// Sajikan file frontend (HTML, CSS, JS) dan media upload
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// ============================================================
// Helper Sandbox / Dummy Data
// ============================================================
const SANDBOX_PROFILES = {
    meta: { name: 'Akun Facebook/IG Demo', handle: '@demo_pikslab', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=256&auto=format&fit=crop', pageId: 'sandbox_page_001' },
    youtube: { name: 'Demo Channel YT', handle: '@DemoPiksDigitalLabYT', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&auto=format&fit=crop', channelId: 'sandbox_channel_001' },
    tiktok: { name: 'Demo TikTok', handle: '@demo_tiktok', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=256&auto=format&fit=crop', openId: 'sandbox_tiktok_001' }
};

// ============================================================
// API Routes: Informasi Mode + Health
// ============================================================

/** Health check hardened — mode DB tanpa leak secrets. */
app.get('/api/health', async (req, res) => {
    const started = Date.now();
    let dbOk = false;
    let dbMode = process.env.DATABASE_URL ? 'postgres' : 'file';
    let workspaceCount = null;
    try {
        await ensureDb();
        if (typeof db.getWorkspaces === 'function') {
            const ws = await db.getWorkspaces();
            workspaceCount = ws.length;
        }
        dbOk = true;
    } catch (err) {
        dbOk = false;
        safeLog('warn', '[health] db check gagal:', err.message);
    }
    const statusCode = dbOk ? 200 : 503;
    res.status(statusCode).json({
        ok: dbOk,
        service: "PiK's Digital Lab",
        db: { mode: dbMode, ok: dbOk },
        sandbox: !!SANDBOX_MODE,
        production: !!IS_PRODUCTION,
        vercel: !!IS_VERCEL,
        defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaceCount,
        uptimeSec: Math.floor(process.uptime()),
        latencyMs: Date.now() - started
        // sengaja tidak expose: DATABASE_URL, tokens, secrets, env values
    });
});

app.get('/api/status', async (req, res) => {
    const adminEmailSet = !!(process.env.ADMIN_EMAIL || '').trim();
    const adminSecretSet = !!(process.env.ADMIN_PASSWORD_HASH || '').trim()
        || (process.env.ADMIN_PASSWORD != null && process.env.ADMIN_PASSWORD !== '');
    let userCount = 0;
    try {
        userCount = (await db.getUsers()).length;
    } catch (_) { /* db belum siap */ }

    const host = String(req.get('x-forwarded-host') || req.get('host') || '');
    const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);

    res.json({
        mode: SANDBOX_MODE ? 'sandbox' : 'real',
        authRequired: true,
        authenticated: !!req.user,
        db: process.env.DATABASE_URL ? 'postgres' : 'file',
        defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
        production: !!IS_PRODUCTION,
        host,
        isLocalHost,
        bootstrap: {
            configured: adminEmailSet && adminSecretSet,
            adminEmailSet,
            adminSecretSet,
            hasUsers: userCount > 0,
            userCount
        },
        platforms: {
            meta: !!process.env.META_CLIENT_ID,
            youtube: !!process.env.GOOGLE_CLIENT_ID,
            tiktok: !!process.env.TIKTOK_CLIENT_KEY
        },
        publicBaseUrl: getPublicBaseUrl(req),
        tokenEncryption: isEncryptionEnabled(),
        scheduler: IS_VERCEL
            ? { kind: 'vercel-cron', note: 'Hobby: sekali sehari (lihat vercel.json)' }
            : { kind: 'local-interval', everySeconds: 60 }
    });
});

// ============================================================
// API Routes: App Login (session cookie)
// ============================================================

app.get('/api/auth/me', (req, res) => {
    res.json({
        success: true,
        authenticated: !!req.user,
        user: auth.publicUser(req.user)
    });
});

app.post('/api/auth/login', rateLimitLogin, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = req.body?.password;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email dan password wajib.' });
        }

        await auth.ensureBootstrapAdmin(db);

        const user = await db.getUserByEmail(email);
        if (!user || !(await auth.verifyPassword(password, user.passwordHash))) {
            const adminEmailSet = !!(process.env.ADMIN_EMAIL || '').trim();
            const adminSecretSet = !!(process.env.ADMIN_PASSWORD_HASH || '').trim()
                || (process.env.ADMIN_PASSWORD != null && process.env.ADMIN_PASSWORD !== '');
            const users = await db.getUsers().catch(() => []);
            let message = 'Email atau password salah.';
            if (!adminEmailSet || !adminSecretSet) {
                message = IS_PRODUCTION
                    ? 'Admin belum di-bootstrap di server ini. Set ADMIN_EMAIL + ADMIN_PASSWORD_HASH (atau ADMIN_PASSWORD) di Vercel env, lalu Redeploy.'
                    : 'Admin belum di-bootstrap. Set ADMIN_EMAIL + ADMIN_PASSWORD di .env lokal, lalu restart `npm run dev`.';
            } else if (!users.length) {
                message = process.env.DATABASE_URL
                    ? 'Bootstrap gagal menulis user. Cek DATABASE_URL / koneksi Postgres, lalu coba lagi.'
                    : (IS_PRODUCTION
                        ? 'Production tanpa DATABASE_URL — set Neon DATABASE_URL di Vercel, lalu Redeploy.'
                        : 'Belum ada user di db.json. Restart server agar bootstrap ADMIN_* berjalan.');
            }
            return res.status(401).json({
                success: false,
                message,
                bootstrapConfigured: adminEmailSet && adminSecretSet,
                hasUsers: users.length > 0
            });
        }

        const token = auth.createSessionToken(user);
        auth.setSessionCookie(res, token);
        await db.appendAuditLog({
            actor: user.email,
            action: 'login',
            target: user.id,
            detail: { role: user.role || 'editor' }
        });

        res.json({
            success: true,
            user: auth.publicUser(user),
            // Token untuk CLI / Cursor agent (kirim sebagai Authorization: Bearer)
            token
        });
    } catch (err) {
        console.error('[auth/login]', err.message);
        res.status(500).json({ success: false, message: 'Login gagal.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    auth.clearSessionCookie(res);
    res.json({ success: true });
});

// ============================================================
// API Routes: Manajemen Akun
// ============================================================

// GET: Daftar workspace (scaffolding multi-tenant)
app.get('/api/workspaces', async (req, res) => {
    try {
        const workspaces = typeof db.getWorkspaces === 'function'
            ? await db.getWorkspaces()
            : [{ id: DEFAULT_WORKSPACE_ID, name: 'Default' }];
        res.json({
            success: true,
            defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
            workspaces,
            note: 'workspaceId opsional; UNIQUE (workspace_id, platform) aktif (P3). Default workspace tetap kompatibel.'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET: Daftar semua akun terhubung (tanpa token sensitif)
app.get('/api/accounts', async (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    const accounts = (await db.getAccounts({ workspaceId })).map(a => {
        const { accessToken, refreshToken, pageToken, sessionState, password, ...safe } = a;
        return safe;
    });
    res.json({ success: true, workspaceId, accounts });
});

// Brand memory per akun (tone, banned words, pillars, …)
app.get('/api/accounts/:platform/brand-memory', async (req, res) => {
    try {
        const workspaceId = resolveWorkspaceId(req);
        const account = await db.getAccountByPlatform(req.params.platform, { workspaceId });
        if (!account) {
            return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
        }
        const brandMemory = normalizeBrandMemory(account.brandMemory);
        res.json({
            success: true,
            platform: account.platform,
            brandMemory,
            summary: summarizeBrandMemory(brandMemory)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/accounts/:platform/brand-memory', async (req, res) => {
    try {
        const platform = String(req.params.platform || '').toLowerCase();
        const workspaceId = resolveWorkspaceId(req);
        let account = await db.getAccountByPlatform(platform, { workspaceId });
        const brandMemory = normalizeBrandMemory(req.body?.brandMemory || req.body || {});
        if (!account) {
            account = await db.upsertAccount({
                platform,
                workspaceId,
                connected: false,
                brandMemory,
                name: platform,
                handle: ''
            });
        } else {
            account = await db.upsertAccount({
                ...account,
                platform,
                workspaceId,
                brandMemory
            });
        }
        await db.appendAuditLog({
            actor: 'user',
            action: 'brand_memory_update',
            target: platform,
            detail: { summary: summarizeBrandMemory(brandMemory) }
        });
        res.json({
            success: true,
            platform,
            brandMemory: normalizeBrandMemory(account.brandMemory),
            summary: summarizeBrandMemory(account.brandMemory)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE: Putuskan akun dari platform tertentu
app.delete('/api/accounts/:platform', async (req, res) => {
    const { platform } = req.params;
    const workspaceId = resolveWorkspaceId(req);
    const ok = await db.disconnectAccount(platform, { workspaceId });
    if (ok) {
        res.json({ success: true, workspaceId, message: `Akun ${platform} berhasil diputuskan.` });
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
    const state = createOAuthState({ provider: 'meta', userId: req.user?.id });
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}&scope=${scopes}&response_type=code&state=${encodeURIComponent(state)}`;
    res.redirect(authUrl);
});

// Step 2: Callback setelah pengguna setuju di Facebook
app.get('/api/auth/meta/callback', async (req, res) => {
    try {
        if (rejectSandboxInReal(req, res)) return;
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
            await db.upsertAccount({
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
            const stateCheck = verifyOAuthState(req.query.state, 'meta');
            if (!stateCheck.ok) {
                return res.redirect(`/?auth=meta&status=error&msg=${encodeURIComponent(stateCheck.message)}`);
            }
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
            await db.upsertAccount({
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
        await db.upsertAccount({ ...profileData, connected: true });
        console.log(`[AUTH] Meta terhubung: ${profileData.handle}`);
        res.redirect(`/?auth=meta&status=success`);

    } catch (err) {
        safeLog('error', '[AUTH Meta ERROR]', err.response ? err.response.data : err.message);
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
    const state = createOAuthState({ provider: 'youtube', userId: req.user?.id });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    res.redirect(authUrl);
});

app.get('/api/auth/youtube/callback', async (req, res) => {
    try {
        if (rejectSandboxInReal(req, res)) return;
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
            const stateCheck = verifyOAuthState(req.query.state, 'youtube');
            if (!stateCheck.ok) {
                return res.redirect(`/?auth=youtube&status=error&msg=${encodeURIComponent(stateCheck.message)}`);
            }
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

        await db.upsertAccount(profileData);
        console.log(`[AUTH] YouTube terhubung: ${profileData.handle}`);
        res.redirect('/?auth=youtube&status=success');

    } catch (err) {
        safeLog('error', '[AUTH YouTube ERROR]', err.response ? err.response.data : err.message);
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
    const state = createOAuthState({ provider: 'tiktok', userId: req.user?.id });
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
    res.redirect(authUrl);
});

app.get('/api/auth/tiktok/callback', async (req, res) => {
    try {
        if (rejectSandboxInReal(req, res)) return;
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
            const stateCheck = verifyOAuthState(req.query.state, 'tiktok');
            if (!stateCheck.ok) {
                return res.redirect(`/?auth=tiktok&status=error&msg=${encodeURIComponent(stateCheck.message)}`);
            }
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

        await db.upsertAccount(profileData);
        console.log(`[AUTH] TikTok terhubung: ${profileData.handle}`);
        res.redirect('/?auth=tiktok&status=success');

    } catch (err) {
        safeLog('error', '[AUTH TikTok ERROR]', err.response ? err.response.data : err.message);
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
    // requireAuthForApi sudah memastikan session app; jangan log password.
    const { platform, username, password } = req.body || {};
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
        // Jangan persist password sosmed di DB / response
        delete profileData.password;
        await db.upsertAccount(profileData);
        console.log(`[AUTH-BROWSER] ${platform} terhubung: ${profileData.handle || username}`);
        const safeAccount = {
            platform: profileData.platform,
            name: profileData.name,
            handle: profileData.handle,
            avatar: profileData.avatar,
            connected: true,
            automationType: profileData.automationType || null,
            sandbox: false
        };
        res.json({ success: true, account: safeAccount });
    } catch (err) {
        console.error(`[AUTH-BROWSER] Error login ${platform}:`, err.message);
        res.status(500).json({ success: false, message: 'Browser login gagal.' });
    }
});

/**
 * DELETE /api/auth/browser-logout/:platform
 * Menghapus session browser dan memutuskan akun.
 */
app.delete('/api/auth/browser-logout/:platform', async (req, res) => {
    const { platform } = req.params;
    try {
        const { clearSession } = require('./automation/browser');
        clearSession(platform);
        await db.disconnectAccount(platform);
        res.json({ success: true, message: `Session ${platform} dihapus.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// API Routes: Unggah Media
// ============================================================

// Upload file media (gambar/video) — MIME allowlist; opsional Vercel Blob jika token set
app.post('/api/media/upload', (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'File terlalu besar (maks 50MB).'
                : (err.message || 'Upload ditolak.');
            return res.status(400).json({ success: false, message: msg });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah.' });
        }
        const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        try {
            const persisted = await persistUploadedFile({
                localPath: req.file.path,
                filename: req.file.filename,
                contentType: req.file.mimetype
            });
            const fileUrl = persisted.url;
            const publicUrl = persisted.publicUrl || absoluteMediaUrl(fileUrl, req);
            res.json({
                success: true,
                url: fileUrl,
                publicUrl,
                type: fileType,
                filename: req.file.filename,
                storage: persisted.storage,
                blobConfigured: isBlobConfigured(),
                note: persisted.note || undefined
            });
        } catch (persistErr) {
            const fileUrl = `/uploads/${req.file.filename}`;
            res.json({
                success: true,
                url: fileUrl,
                publicUrl: absoluteMediaUrl(fileUrl, req),
                type: fileType,
                filename: req.file.filename,
                storage: 'local',
                note: `Persist fallback: ${persistErr.message}`
            });
        }
    });
});

// ============================================================
// API Routes: Manajemen Postingan
// ============================================================

// GET: Daftar semua postingan
app.get('/api/posts', async (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    const posts = await db.getPosts({ workspaceId });
    res.json({ success: true, workspaceId, posts });
});

// POST: Buat postingan baru (langsung atau terjadwal)
app.post('/api/posts', rateLimitPublish, async (req, res) => {
    try {
        const { caption, mediaUrl, mediaType, platforms, status, publishDate } = req.body;
        const workspaceId = resolveWorkspaceId(req);

        if (!platforms || platforms.length === 0) {
            return res.status(400).json({ success: false, message: 'Pilih setidaknya satu platform.' });
        }

        let postStatus = status || 'posted';
        let finalPublishDate = publishDate || new Date().toISOString();

        let manualGate = null;
        if (postStatus === 'posted') {
            manualGate = await assertManualPublishAllowed({
                platforms,
                caption: caption || '',
                brief: ''
            });
        }

        // Simpan postingan ke database
        const newPost = await db.addPost({
            caption: caption || '',
            mediaUrl: mediaUrl || '',
            mediaType: mediaType || '',
            platforms,
            status: postStatus,
            publishDate: finalPublishDate,
            stats: null,
            publishResults: {},
            workspaceId
        });

        // Jika langsung dikirim, proses sekarang
        if (postStatus === 'posted') {
            const results = await publishToAllPlatforms(newPost);
            const { fields, reconciliation } = publishOutcomeFields(results, {
                statsFactory: generateMockStats
            });
            await db.updatePost(newPost.id, fields);
            await db.appendAuditLog({
                actor: (req.user && req.user.email) || 'user',
                action: 'manual_publish',
                target: newPost.id,
                detail: {
                    reconciliation,
                    policy: manualGate && manualGate.policy,
                    warnings: (manualGate && manualGate.warnings) || []
                }
            });
            return res.json({
                success: reconciliation.aggregateStatus !== 'failed',
                partial: reconciliation.aggregateStatus === 'partial',
                publishStatus: reconciliation.aggregateStatus,
                reconciliation,
                policyWarnings: (manualGate && manualGate.warnings) || [],
                post: await db.getPostById(newPost.id),
                results
            });
        }

        res.json({ success: true, post: newPost });
    } catch (err) {
        const code = err.statusCode || 500;
        const body = { success: false, message: err.message };
        if (err.gate) {
            body.policy = err.gate.policy;
            body.reasons = err.gate.reasons;
        }
        res.status(code).json(body);
    }
});

// DELETE: Hapus satu postingan
app.delete('/api/posts/:id', async (req, res) => {
    const ok = await db.deletePost(req.params.id);
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

    const post = await db.getPostById(id);
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

    try {
        // Jika diedit dan status diubah menjadi langsung dikirim (posted), jalankan mesin publikasi
        const updatedPost = await db.updatePost(id, updates);
        if (status === 'posted' && post.status !== 'posted') {
            const manualGate = await assertManualPublishAllowed({
                platforms: updatedPost.platforms || platforms || [],
                caption: updatedPost.caption || '',
                brief: ''
            });
            const results = await publishToAllPlatforms(updatedPost);
            const { fields, reconciliation } = publishOutcomeFields(results, {
                statsFactory: generateMockStats
            });
            await db.updatePost(id, fields);
            return res.json({
                success: reconciliation.aggregateStatus !== 'failed',
                partial: reconciliation.aggregateStatus === 'partial',
                publishStatus: reconciliation.aggregateStatus,
                reconciliation,
                policyWarnings: manualGate.warnings || [],
                post: await db.getPostById(id),
                results
            });
        }

        res.json({ success: true, post: updatedPost });
    } catch (err) {
        const code = err.statusCode || 500;
        const body = { success: false, message: err.message };
        if (err.gate) {
            body.policy = err.gate.policy;
            body.reasons = err.gate.reasons;
        }
        res.status(code).json(body);
    }
});

// POST: Publikasikan postingan terjadwal secara langsung
app.post('/api/posts/:id/publish', rateLimitPublish, async (req, res) => {
    try {
        const post = await db.getPostById(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Postingan tidak ditemukan.' });
        }
        const manualGate = await assertManualPublishAllowed({
            platforms: post.platforms || [],
            caption: post.caption || '',
            brief: ''
        });
        const results = await publishToAllPlatforms(post);
        const { fields, reconciliation } = publishOutcomeFields(results, {
            statsFactory: generateMockStats
        });
        await db.updatePost(post.id, {
            ...fields,
            publishDate: new Date().toISOString()
        });
        res.json({
            success: reconciliation.aggregateStatus !== 'failed',
            partial: reconciliation.aggregateStatus === 'partial',
            publishStatus: reconciliation.aggregateStatus,
            reconciliation,
            policyWarnings: manualGate.warnings || [],
            post: await db.getPostById(post.id),
            results
        });
    } catch (err) {
        const code = err.statusCode || 500;
        const body = { success: false, message: err.message };
        if (err.gate) {
            body.policy = err.gate.policy;
            body.reasons = err.gate.reasons;
        }
        res.status(code).json(body);
    }
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
    const accounts = await db.getAccounts();

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
            safeLog('log', `[PUBLISH] ${platform}: ✅`, results[platform]);
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
    // PUBLIC_BASE_URL / APP_ORIGIN agar platform cloud bisa fetch media (bukan localhost)
    const mediaUrl = absoluteMediaUrl(post.mediaUrl, null);
    if (platform === 'facebook' || platform === 'instagram' || platform === 'tiktok') {
        assertCloudMediaUrl(mediaUrl);
    }

    switch (platform) {
        case 'facebook': {
            const token = acc.pageToken || acc.accessToken;
            const params = { message: post.caption, access_token: token };
            if (mediaUrl && post.mediaType === 'image') {
                const photoRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.pageId}/photos`, {
                    url: mediaUrl, caption: post.caption, access_token: token
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
            const token = acc.pageToken || acc.accessToken;

            if (post.mediaType === 'video') {
                const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media`, {
                    video_url: mediaUrl, caption: post.caption, media_type: 'REELS', access_token: token
                });
                await new Promise(r => setTimeout(r, 5000));
                const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media_publish`, {
                    creation_id: containerRes.data.id, access_token: token
                });
                return { status: 'success', postId: publishRes.data.id };
            } else {
                const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media`, {
                    image_url: mediaUrl, caption: post.caption, access_token: token
                });
                const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${acc.igUserId}/media_publish`, {
                    creation_id: containerRes.data.id, access_token: token
                });
                return { status: 'success', postId: publishRes.data.id };
            }
        }

        case 'youtube': {
            if (!mediaUrl || post.mediaType !== 'video') throw new Error('YouTube memerlukan file video.');
            const videoPath = path.join(uploadDir, path.basename(post.mediaUrl));
            if (!fs.existsSync(videoPath)) throw new Error('File video tidak ditemukan di server.');

            const fresh = await refreshYouTubeAccessToken(acc);
            const accessToken = fresh.accessToken || acc.accessToken;

            const FormData = require('form-data');
            const form = new FormData();
            form.append('snippet', JSON.stringify({
                title: post.caption ? post.caption.substring(0, 100) : "PiK's Digital Lab Upload",
                description: post.caption || '',
                categoryId: '22'
            }), { contentType: 'application/json' });
            form.append('status', JSON.stringify({ privacyStatus: 'public' }), { contentType: 'application/json' });
            form.append('file', fs.createReadStream(videoPath), { contentType: 'video/*' });

            const ytRes = await axios.post(
                'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
                form,
                { headers: { ...form.getHeaders(), Authorization: `Bearer ${accessToken}` } }
            );
            return { status: 'success', postId: ytRes.data.id, videoUrl: `https://youtu.be/${ytRes.data.id}` };
        }

        case 'tiktok': {
            if (!mediaUrl || post.mediaType !== 'video') throw new Error('TikTok memerlukan file video.');
            const initRes = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
                post_info: {
                    title: post.caption ? post.caption.substring(0, 150) : "PiK's Digital Lab Video",
                    privacy_level: 'PUBLIC_TO_EVERYONE',
                    disable_duet: false, disable_comment: false, disable_stitch: false,
                    video_cover_timestamp_ms: 1000
                },
                source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl }
            }, {
                headers: { Authorization: `Bearer ${acc.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }
            });
            const publishId = initRes.data.data ? initRes.data.data.publish_id : null;
            // INT-06 / P3: poll sampai terminal atau timeout (~45s, lihat lib/tiktok-publish.js)
            const polled = await pollTikTokPublishStatus({
                accessToken: acc.accessToken,
                publishId
            });
            if (polled.pollStatus === 'complete') {
                return {
                    status: 'success',
                    publishId,
                    pending: false,
                    pollStatus: polled.pollStatus,
                    tiktokStatus: polled.status,
                    attempts: polled.attempts,
                    message: polled.message
                };
            }
            if (polled.pollStatus === 'failed') {
                return {
                    status: 'error',
                    publishId,
                    pending: false,
                    pollStatus: polled.pollStatus,
                    tiktokStatus: polled.status,
                    attempts: polled.attempts,
                    message: polled.message
                };
            }
            // timeout / skipped — init mungkin masih diproses; jangan klaim fully live
            return {
                status: 'success',
                publishId,
                pending: true,
                pollStatus: polled.pollStatus,
                tiktokStatus: polled.status,
                attempts: polled.attempts,
                timeoutMs: polled.timeoutMs,
                message: polled.message
            };
        }

        default:
            throw new Error(`Platform tidak dikenali: ${platform}`);
    }
}

/** Refresh YouTube access_token via refresh_token sebelum upload (INT-02). */
async function refreshYouTubeAccessToken(acc) {
    if (!acc || !acc.refreshToken) return acc;
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return acc;
    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: acc.refreshToken,
            grant_type: 'refresh_token'
        });
        const access_token = tokenRes.data.access_token;
        if (!access_token) return acc;
        const expiresIn = tokenRes.data.expires_in;
        await db.upsertAccount({
            platform: 'youtube',
            accessToken: access_token,
            refreshToken: acc.refreshToken,
            tokenExpiresAt: expiresIn
                ? new Date(Date.now() + expiresIn * 1000).toISOString()
                : null,
            connected: true
        });
        return { ...acc, accessToken: access_token };
    } catch (err) {
        console.warn('[youtube] refresh token gagal:', err.response?.data?.error || err.message);
        return acc;
    }
}

// ============================================================
// Background Scheduler (cek setiap 60 detik)
// ============================================================
async function runScheduler() {
    await ensureDb();
    try {
        await assertNotEmergencyPaused();
    } catch (err) {
        console.warn('[SCHEDULER]', err.message);
        return { skipped: true, reason: err.message };
    }
    const duePosts = await db.getDueScheduledPosts();
    if (duePosts.length > 0) {
        console.log(`[SCHEDULER] ${duePosts.length} postingan siap diterbitkan...`);
        for (const post of duePosts) {
            console.log(`[SCHEDULER] Memproses: ${post.id} - ${post.caption ? post.caption.substring(0, 50) : 'tanpa keterangan'}...`);
            try {
                try {
                    await assertManualPublishAllowed({
                        platforms: post.platforms || [],
                        caption: post.caption || '',
                        brief: ''
                    });
                } catch (gateErr) {
                    console.warn(`[SCHEDULER] skip ${post.id}:`, gateErr.message);
                    await db.updatePost(post.id, {
                        status: 'scheduled',
                        lastError: gateErr.message
                    });
                    continue;
                }
                const results = await publishToAllPlatforms(post);
                const { fields, reconciliation } = publishOutcomeFields(results, {
                    statsFactory: generateMockStats
                });
                await db.updatePost(post.id, {
                    ...fields,
                    publishDate: new Date().toISOString()
                });
                console.log(`[SCHEDULER] ✅ ${post.id} → ${reconciliation.aggregateStatus}`);
            } catch (err) {
                console.error(`[SCHEDULER] ❌ Gagal: ${post.id}`, err.message);
                await db.updatePost(post.id, { status: 'failed', lastError: err.message });
            }
        }
    }
    return { skipped: false, processed: duePosts.length };
}

// Scheduler lokal saja (di Vercel pakai Cron → /api/cron/publish)
if (!IS_VERCEL) {
    runScheduler();
    setInterval(runScheduler, 60 * 1000);
    console.log('[SCHEDULER] Background scheduler aktif — mengecek setiap 60 detik.');
}

// ============================================================
// API: Karyawan AI (dioperasikan agen Cursor — publish langsung)
// ============================================================

/** Kumpulkan brand memory per platform untuk gate + konteks agen. */
async function collectBrandMemories(platforms = []) {
    const accounts = await db.getAccounts();
    const map = { _default: normalizeBrandMemory({}) };
    for (const a of accounts) {
        map[a.platform] = normalizeBrandMemory(a.brandMemory);
    }
    if (!platforms.length) return map;
    const scoped = { _default: map._default };
    for (const p of platforms) {
        scoped[p] = map[p] || map._default;
    }
    return scoped;
}

function brandMemoryContextSummary(brandMemories, platforms = []) {
    const plats = platforms.length ? platforms : Object.keys(brandMemories).filter(k => k !== '_default');
    if (!plats.length) return summarizeBrandMemory(brandMemories._default);
    return plats.map(p => `${p}: ${summarizeBrandMemory(brandMemories[p] || brandMemories._default)}`).join(' | ');
}

function captionFromBrief(brief, caption) {
    const fromBody = String(caption || '').trim();
    if (fromBody) return fromBody;
    const text = String(brief || '').trim();
    if (!text) return '';
    return text.length > 500 ? text.slice(0, 497) + '...' : text;
}

function draftVersionLabel(version) {
    const v = Math.max(1, parseInt(version, 10) || 1);
    return 'v' + Math.min(v, 99);
}

/**
 * Konteks cepat untuk agen: mode + otonomi + brand memory + job
 */
app.get('/api/ai/employee/context', async (req, res) => {
    const settings = await db.getAiSettings();
    const allAccounts = await db.getAccounts();
    const accounts = allAccounts
        .filter(a => a.connected)
        .map(a => {
            const { accessToken, refreshToken, sessionState, password, ...safe } = a;
            return {
                platform: safe.platform,
                handle: safe.handle,
                name: safe.name,
                sandbox: !!safe.sandbox,
                automationType: safe.automationType || (safe.sandbox ? 'sandbox' : 'oauth'),
                brandMemorySummary: summarizeBrandMemory(safe.brandMemory)
            };
        });

    const recentAiPosts = (await db.getPosts())
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

    const recentAiJobs = (await db.getAiJobs())
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(j => ({
            id: j.id,
            brief: (j.brief || '').slice(0, 120),
            status: j.status,
            questions: j.questions || [],
            employeeName: j.employeeName,
            roleId: j.roleId || null,
            lastError: j.lastError || null,
            createdAt: j.createdAt,
            updatedAt: j.updatedAt
        }));

    res.json({
        success: true,
        mode: SANDBOX_MODE ? 'sandbox' : 'real',
        policy: settings.autonomyLevel,
        emergencyPause: !!settings.emergencyPause,
        dailyPostCap: settings.dailyPostCap,
        office: 'Kantor AI — Tim Konten',
        roles: listRoles().map(r => ({ id: r.id, name: r.name, title: r.title, outputs: r.outputs })),
        briefTemplates: BRIEF_TEMPLATES.map(t => ({ id: t.id, label: t.label })),
        tokenEncryption: isEncryptionEnabled(),
        baseUrl: getPublicBaseUrl(req),
        connectedPlatforms: accounts.map(a => a.platform),
        accounts,
        recentAiPosts,
        recentAiJobs
    });
});

/**
 * Karyawan AI publish — di-gate oleh otonomi / pause / high-risk / daily cap.
 */
app.post('/api/ai/employee/publish', rateLimitPublish, async (req, res) => {
    try {
        const {
            brief,
            caption,
            platforms,
            mediaUrl,
            mediaType,
            employeeName,
            employeeRole,
            roleId,
            forcePublish
        } = req.body || {};

        const finalCaption = (caption || brief || '').trim();
        if (!finalCaption) {
            return res.status(400).json({
                success: false,
                message: 'Wajib isi caption atau brief.'
            });
        }

        const settings = await db.getAiSettings();
        const connected = (await db.getAccounts()).filter(a => a.connected).map(a => a.platform);
        let targetPlatforms = Array.isArray(platforms) && platforms.length
            ? platforms.map(p => String(p).toLowerCase())
            : connected;

        targetPlatforms = [...new Set(targetPlatforms)].filter(p => connected.includes(p));

        if (targetPlatforms.length === 0) {
            return res.status(400).json({
                success: false,
                message: connected.length
                    ? 'Tidak ada platform target yang terhubung. Sesuaikan daftar platforms.'
                    : "Belum ada akun terhubung. Hubungkan akun dulu di UI PiK's Digital Lab."
            });
        }

        const forceCheck = auth.assertForcePublish(req, !!forcePublish);
        if (!forceCheck.ok) {
            return res.status(forceCheck.status).json({ success: false, message: forceCheck.message });
        }

        const pubRole = resolveRole({ roleId, employeeRole, employeeName });
        if (pubRole?.id) {
            const perm = enforceRolePlatforms(settings, pubRole.id, targetPlatforms);
            if (!perm.ok) {
                return res.status(403).json({
                    success: false,
                    message: perm.message,
                    denied: perm.denied,
                    allowed: perm.allowed
                });
            }
            targetPlatforms = perm.platforms;
        }

        const brandMemories = await collectBrandMemories(targetPlatforms);
        const recentPosts = await db.getPosts();
        const gate = evaluatePublishGate({
            settings,
            platforms: targetPlatforms,
            caption: finalCaption,
            brief: brief || '',
            brandMemories,
            recentPosts,
            forcePublish: !!forcePublish
        });

        const name = (employeeName || 'Karyawan AI').trim();
        const brandSummary = brandMemoryContextSummary(brandMemories, targetPlatforms);

        if (!gate.allowPublish) {
            await db.appendAuditLog({
                actor: name,
                action: 'publish_blocked',
                target: 'employee/publish',
                detail: { reasons: gate.reasons, policy: gate.policy, platforms: targetPlatforms }
            });
            return res.status(403).json({
                success: false,
                blocked: true,
                policy: gate.policy,
                reasons: gate.reasons,
                duplicateWarning: gate.duplicateWarning,
                brandMemorySummary: brandSummary,
                message: gate.reasons[0] || 'Publish diblokir oleh kebijakan otonomi.'
            });
        }

        console.log(`🤖 [AI-EMPLOYEE] ${name} publish → ${targetPlatforms.join(', ')} (${gate.policy})`);

        const newPost = await db.addPost({
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
        const { fields, reconciliation } = publishOutcomeFields(results, {
            statsFactory: generateMockStats
        });
        await db.updatePost(newPost.id, fields);

        await db.appendAuditLog({
            actor: name,
            action: reconciliation.aggregateStatus === 'posted'
                ? 'publish_ok'
                : reconciliation.aggregateStatus === 'partial'
                    ? 'publish_partial'
                    : 'publish_failed',
            target: newPost.id,
            detail: { platforms: targetPlatforms, policy: gate.policy, reconciliation }
        });

        const post = await db.getPostById(newPost.id);
        console.log(`🤖 [AI-EMPLOYEE] Selesai ${post.id} — ${reconciliation.aggregateStatus}`);

        res.json({
            success: reconciliation.aggregateStatus !== 'failed',
            partial: reconciliation.aggregateStatus === 'partial',
            publishStatus: reconciliation.aggregateStatus,
            reconciliation,
            policy: gate.policy,
            employeeName: name,
            brandMemorySummary: brandSummary,
            duplicateWarning: gate.duplicateWarning,
            post,
            results
        });
    } catch (err) {
        console.error('🤖 [AI-EMPLOYEE] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// AI Settings, Audit, Insights stub, Brief templates
// ============================================================

app.get('/api/ai/settings', async (req, res) => {
    try {
        const settings = await db.getAiSettings();
        res.json({
            success: true,
            settings: publicAiSettings(settings),
            autonomyLevels: AUTONOMY_LEVELS,
            tokenEncryption: isEncryptionEnabled(),
            llmProviders: listProviders()
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/ai/settings', async (req, res) => {
    try {
        const body = req.body || {};
        const patch = {};
        if (body.autonomyLevel != null) patch.autonomyLevel = body.autonomyLevel;
        if (body.emergencyPause != null) patch.emergencyPause = !!body.emergencyPause;
        if (body.dailyPostCap != null) patch.dailyPostCap = body.dailyPostCap;
        if (body.accountOverrides != null) patch.accountOverrides = body.accountOverrides;
        if (body.notifications != null) patch.notifications = body.notifications;
        if (body.rolePermissions != null) patch.rolePermissions = body.rolePermissions;
        if (body.insightsEnabled != null) patch.insightsEnabled = !!body.insightsEnabled;

        // LLM: provider/model + apiKey (plain dari client → encrypt at-rest)
        if (body.llm != null && typeof body.llm === 'object') {
            const llmPatch = {};
            if (body.llm.provider != null) llmPatch.provider = body.llm.provider;
            if (body.llm.model != null) llmPatch.model = body.llm.model;
            if (body.llm.apiKey != null && String(body.llm.apiKey).trim()) {
                const plain = String(body.llm.apiKey).trim();
                if (plain !== '••••' && !plain.includes('…')) {
                    llmPatch.apiKeyEnc = encryptSecret(plain);
                }
            }
            if (body.llm.clearApiKey === true) llmPatch.apiKeyEnc = null;
            patch.llm = llmPatch;
        }

        const settings = await db.updateAiSettings(patch);
        const auditDetail = { ...patch };
        if (auditDetail.llm && auditDetail.llm.apiKeyEnc) {
            auditDetail.llm = { ...auditDetail.llm, apiKeyEnc: '[redacted]' };
        }
        await db.appendAuditLog({
            actor: req.user?.email || 'user',
            action: 'ai_settings_update',
            target: 'ai_settings',
            detail: auditDetail
        });
        res.json({ success: true, settings: publicAiSettings(settings) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const rateLimitChat = createRateLimiter({ windowMs: 60 * 1000, max: 20, keyPrefix: 'chat' });

app.get('/api/ai/chat', async (req, res) => {
    try {
        const messages = await db.getAiChatMessages({ limit: parseInt(req.query.limit, 10) || 80 });
        const settings = publicAiSettings(await db.getAiSettings());
        res.json({
            success: true,
            messages,
            llm: settings.llm,
            llmProviders: listProviders()
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/ai/chat', async (req, res) => {
    try {
        await db.clearAiChat();
        await db.appendAuditLog({
            actor: req.user?.email || 'user',
            action: 'ai_chat_clear',
            target: 'ai_chat',
            detail: {}
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/ai/chat', rateLimitChat, async (req, res) => {
    try {
        const message = String(req.body?.message || '').trim();
        const roleId = req.body?.roleId ? normalizeRoleId(req.body.roleId) : 'manager';
        if (!message) {
            return res.status(400).json({ success: false, message: 'Pesan wajib diisi.' });
        }

        const userMsg = await db.appendAiChatMessage({
            role: 'user',
            content: message,
            roleId,
            employeeName: 'CEO',
            meta: { source: 'webapp' }
        });

        const settings = await db.getAiSettings();
        const history = await db.getAiChatMessages({ limit: 20 });
        const histForLlm = history
            .filter(m => m.id !== userMsg.id)
            .map(m => ({ role: m.role, content: m.content }));

        let turn;
        try {
            turn = await runCeoChatTurn({
                settings,
                ceoMessage: message,
                roleId,
                history: histForLlm
            });
        } catch (err) {
            const assistantErr = await db.appendAiChatMessage({
                role: 'assistant',
                content: err.code === 'LLM_NOT_CONFIGURED'
                    ? err.message
                    : (`Gagal memanggil LLM: ${err.message}`),
                roleId,
                employeeName: getRoleById(roleId)?.name || 'Maya',
                meta: { error: true, code: err.code || 'LLM_ERROR' }
            });
            return res.status(err.code === 'LLM_NOT_CONFIGURED' ? 400 : 502).json({
                success: false,
                message: err.message,
                code: err.code || 'LLM_ERROR',
                messages: [userMsg, assistantErr]
            });
        }

        const role = getRoleById(turn.roleId) || getRoleById('manager');
        let job = null;

        // Arahan posisi 3D (duduk di meja / idle / meeting) — heuristik + LLM
        let crewPresence = normalizeCrewPresence(settings.crewPresence);
        const presenceUpdate = resolveCrewPresenceUpdate(message, turn.officeAction);
        if (presenceUpdate) {
            crewPresence = normalizeCrewPresence(presenceUpdate);
            await db.updateAiSettings({ crewPresence });
            settings.crewPresence = crewPresence;
        }

        if (turn.createJob && turn.brief) {
            const assessment = assessStructuredBrief(turn.brief);
            const briefText = assessment.text || turn.brief;
            const status = assessment.thin ? 'needs_info' : 'queued';
            let platforms = turn.platforms?.length
                ? turn.platforms
                : (role?.defaultPlatforms || []);
            if (platforms.length && role?.id) {
                const perm = enforceRolePlatforms(settings, role.id, platforms);
                if (perm.ok) platforms = perm.platforms;
            }
            job = await db.addAiJob({
                brief: briefText,
                structuredBrief: assessment.structured || null,
                status,
                questions: assessment.questions || [],
                needsInfo: !!assessment.thin,
                platforms,
                mediaUrl: '',
                mediaType: '',
                employeeName: role?.name || 'Maya',
                employeeRole: role?.title || 'Manager',
                roleId: role?.id || 'manager',
                caption: turn.caption || '',
                draftHistory: turn.caption
                    ? [{ version: 1, caption: turn.caption, note: 'Dari Chat CEO', at: new Date().toISOString() }]
                    : [],
                decisionLog: appendDecision([], {
                    actor: role?.name || 'AI',
                    reason: 'Dibuat dari Chat CEO',
                    status
                }),
                createdBy: 'ceo-chat',
                workspaceId: resolveWorkspaceId(req)
            });
            await db.appendAuditLog({
                actor: role?.name || 'ai',
                action: 'ai_job_from_chat',
                target: job.id,
                detail: { status: job.status, roleId: job.roleId }
            });
        }

        let replyText = turn.reply;
        if (presenceUpdate) {
            const where =
                crewPresence.mode === 'at_desk'
                    ? 'di meja komputer'
                    : crewPresence.mode === 'meeting'
                      ? 'di area rapat'
                      : 'mode istirahat';
            const who = crewPresence.roleIds?.length
                ? crewPresence.roleIds.join(', ')
                : 'seluruh tim';
            if (!/meja|duduk|rapat|istirahat|siaga/i.test(replyText)) {
                replyText += `\n\n📍 ${who} → ${where}.`;
            }
        }

        const assistantMsg = await db.appendAiChatMessage({
            role: 'assistant',
            content: replyText + (job
                ? `\n\n📋 Job ${job.id} → ${job.status}${job.needsInfo ? ' (perlu info)' : ''}.`
                : ''),
            roleId: role?.id || turn.roleId,
            employeeName: role?.name || 'Maya',
            jobId: job?.id || null,
            meta: {
                createJob: !!job,
                provider: turn.provider,
                model: turn.model || null,
                crewPresence: presenceUpdate ? crewPresence : undefined
            }
        });

        res.json({
            success: true,
            reply: replyText,
            job,
            crewPresence,
            messages: [userMsg, assistantMsg],
            llm: publicAiSettings(settings).llm
        });
    } catch (err) {
        safeLog('error', '[CEO-CHAT]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/ai/settings/emergency-pause', async (req, res) => {
    try {
        const pause = req.body?.pause !== false;
        const settings = await db.updateAiSettings({ emergencyPause: pause });
        await db.appendAuditLog({
            actor: 'user',
            action: pause ? 'emergency_pause_on' : 'emergency_pause_off',
            target: 'ai_settings',
            detail: {}
        });
        res.json({ success: true, settings, message: pause ? 'Jeda darurat AKTIF' : 'Jeda darurat dimatikan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/ai/audit-log', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = parseInt(req.query.offset, 10) || 0;
        const entries = await db.getAuditLog({ limit, offset });
        res.json({ success: true, entries });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/ai/brief-templates', (req, res) => {
    res.json({ success: true, templates: BRIEF_TEMPLATES });
});

/** Analitik penggerak agen — best/worst, jam/format, saran frekuensi */
app.get('/api/ai/insights', async (req, res) => {
    try {
        const workspaceId = resolveWorkspaceId(req);
        const settings = await db.getAiSettings();
        const posts = await db.getPosts({ workspaceId });
        const days = parseInt(req.query.days, 10) || 30;
        const payload = buildInsights(posts, { days });
        const sources = summarizeStatsSources(posts.filter(p => p.status === 'posted' || p.status === 'partial'));
        const accounts = (await db.getAccounts({ workspaceId })).filter(a => a.connected);
        const liveBatch = await fetchLiveMetricsForAccounts(accounts, { reason: 'insights' });
        res.json({
            success: true,
            workspaceId,
            insightsEnabled: settings.insightsEnabled !== false,
            ...payload,
            statsSourceSummary: sources,
            liveMetrics: {
                statsSource: liveBatch.statsSource,
                liveCount: liveBatch.liveCount,
                unavailableCount: liveBatch.unavailableCount,
                note: liveBatch.note,
                results: liveBatch.results.map(r => ({
                    platform: r.platform,
                    available: r.available,
                    statsSource: r.statsSource,
                    note: r.note
                }))
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Live metrics path (P3) — panggil API jika token ada; gagal → unavailable (bukan live).
 * Alias /api/analytics/live-stub tetap ada untuk kompatibilitas.
 */
async function handleLiveAnalytics(req, res) {
    try {
        const workspaceId = resolveWorkspaceId(req);
        const platform = String(req.query.platform || '').toLowerCase();
        const externalPostId = req.query.externalPostId || req.query.postId || null;
        if (!platform) {
            return res.json({
                success: true,
                available: false,
                statsSource: 'unavailable',
                stats: null,
                note: 'Query ?platform= facebook|instagram|youtube|tiktok diperlukan.'
            });
        }
        const account = await db.getAccountByPlatform(platform, { workspaceId });
        const result = await fetchLiveMetrics({
            platform,
            account,
            externalPostId,
            postId: req.query.postId
        });
        res.json({ success: true, workspaceId, ...result });
    } catch (err) {
        res.status(500).json({
            success: false,
            available: false,
            statsSource: 'unavailable',
            message: err.message
        });
    }
}

app.get('/api/analytics/live', handleLiveAnalytics);
app.get('/api/analytics/live-stub', handleLiveAnalytics);

// ============================================================
// AI Jobs (brief → needs_info | queued → run → publish | awaiting_approval)
// ============================================================


app.get('/api/ai/jobs', async (req, res) => {
    try {
        const jobs = await db.getAiJobs();
        let sorted = [...jobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const roleFilter = normalizeRoleId(req.query.roleId || req.query.role || '') || '';
        if (roleFilter) {
            sorted = sorted.filter(j =>
                j.roleId === roleFilter ||
                normalizeRoleId(j.employeeRole) === roleFilter ||
                j.employeeRole === roleFilter
            );
        }
        res.json({ success: true, jobs: sorted });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Kantor AI — daftar peran + ringkasan job aktif per peran + work board.
 */
app.get('/api/ai/office/roles', (req, res) => {
    res.json({ success: true, roles: listRoles() });
});

app.get('/api/ai/office', async (req, res) => {
    try {
        const settings = await db.getAiSettings();
        const jobs = await db.getAiJobs();
        const sorted = [...jobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const crewPresence = normalizeCrewPresence(settings.crewPresence);
        const employees = listRoles().map(role => {
            const roleJobs = sorted.filter(j =>
                j.roleId === role.id ||
                normalizeRoleId(j.employeeRole) === role.id ||
                j.employeeRole === role.id ||
                (j.employeeName && j.employeeName.toLowerCase() === role.name.toLowerCase())
            );
            const workload = summarizeWorkload(roleJobs);
            const latestJob = roleJobs[0] || null;
            const jobStatus = deriveEmployeeStatus(roleJobs);
            const applied = applyPresenceToStatus(jobStatus, crewPresence, role.id);
            return {
                id: role.id,
                name: role.name,
                title: role.title,
                emoji: role.emoji,
                avatarColor: role.avatarColor,
                outputs: role.outputs,
                defaultPlatforms: role.defaultPlatforms || [],
                systemBrief: role.systemBrief,
                status: applied.status,
                fromPresence: !!applied.fromPresence,
                presenceNote: applied.note || crewPresence.note || '',
                activeCount: workload.activeCount,
                workload: applied.fromPresence && applied.status === 'standby'
                    ? (applied.note || 'Siaga di meja')
                    : workload.label,
                latestJob: latestJob
                    ? {
                        id: latestJob.id,
                        brief: (latestJob.brief || '').slice(0, 160),
                        status: latestJob.status,
                        questions: latestJob.questions || [],
                        lastError: latestJob.lastError || null,
                        updatedAt: latestJob.updatedAt,
                        createdAt: latestJob.createdAt
                    }
                    : null
            };
        });

        const board = {
            queued: [],
            needs_info: [],
            awaiting_approval: [],
            publishing: [],
            done: [],
            failed: []
        };
        for (const j of sorted) {
            const bucket = board[j.status];
            if (!bucket) continue;
            if (bucket.length >= 20) continue;
            bucket.push({
                id: j.id,
                brief: (j.brief || '').slice(0, 160),
                status: j.status,
                roleId: j.roleId || null,
                employeeName: j.employeeName,
                questions: j.questions || [],
                lastError: j.lastError || null,
                version: j.version || 1,
                createdAt: j.createdAt,
                updatedAt: j.updatedAt
            });
        }

        res.json({
            success: true,
            office: 'Kantor AI — Tim Konten',
            policy: settings.autonomyLevel,
            emergencyPause: !!settings.emergencyPause,
            dailyPostCap: settings.dailyPostCap,
            settings: {
                autonomyLevel: settings.autonomyLevel,
                emergencyPause: settings.emergencyPause,
                dailyPostCap: settings.dailyPostCap,
                notifications: settings.notifications,
                rolePermissions: settings.rolePermissions,
                insightsEnabled: settings.insightsEnabled !== false
            },
            platforms: ALL_PLATFORMS,
            tokenEncryption: isEncryptionEnabled(),
            employees,
            crewPresence,
            board,
            briefTemplates: BRIEF_TEMPLATES.map(t => ({ id: t.id, label: t.label })),
            jobCounts: {
                total: sorted.length,
                queued: sorted.filter(j => j.status === 'queued').length,
                needs_info: sorted.filter(j => j.status === 'needs_info').length,
                awaiting_approval: sorted.filter(j => j.status === 'awaiting_approval').length,
                publishing: sorted.filter(j => j.status === 'publishing').length,
                done: sorted.filter(j => j.status === 'done').length,
                failed: sorted.filter(j => j.status === 'failed').length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/ai/jobs/:id', async (req, res) => {
    try {
        const job = await db.getAiJobById(req.params.id);
        if (!job) return res.status(404).json({ success: false, message: 'Job tidak ditemukan.' });
        const brandMemories = await collectBrandMemories(job.platforms || []);
        res.json({
            success: true,
            job,
            brandMemorySummary: brandMemoryContextSummary(brandMemories, job.platforms || [])
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/ai/jobs', async (req, res) => {
    try {
        const {
            brief,
            structuredBrief,
            platforms,
            mediaUrl,
            mediaType,
            employeeName,
            employeeRole,
            roleId,
            forceQueued,
            templateId,
            variantA,
            variantB,
            abWinner
        } = req.body || {};

        let briefInput = structuredBrief || brief;
        if (templateId && !briefInput) {
            const tpl = BRIEF_TEMPLATES.find(t => t.id === templateId);
            if (tpl) briefInput = tpl.brief;
        }

        const assessment = forceQueued
            ? { thin: false, questions: [], structured: null, text: String(brief || '').trim() }
            : assessStructuredBrief(briefInput);

        const briefText = assessment.text || String(brief || '').trim();
        if (!briefText && !forceQueued) {
            return res.status(400).json({
                success: false,
                message: 'Wajib isi brief atau structuredBrief.'
            });
        }

        const role = resolveRole({ roleId, employeeRole, employeeName });
        if (roleId && !getRoleById(roleId) && !role) {
            return res.status(400).json({
                success: false,
                message: `roleId tidak dikenal: ${roleId}. Lihat GET /api/ai/office/roles.`
            });
        }

        const status = assessment.thin ? 'needs_info' : 'queued';
        const fromStructured = assessment.structured?.platforms?.length
            ? assessment.structured.platforms
            : null;
        let resolvedPlatforms = Array.isArray(platforms) && platforms.length
            ? platforms.map(p => String(p).toLowerCase())
            : (fromStructured || role?.defaultPlatforms || []);

        const settings = await db.getAiSettings();
        const resolvedRoleId = role?.id || (roleId ? normalizeRoleId(roleId) : null);
        if (resolvedPlatforms.length && resolvedRoleId) {
            const perm = enforceRolePlatforms(settings, resolvedRoleId, resolvedPlatforms);
            if (!perm.ok) {
                return res.status(403).json({
                    success: false,
                    message: perm.message,
                    denied: perm.denied,
                    allowed: perm.allowed
                });
            }
            resolvedPlatforms = perm.platforms;
        }

        let decisionLog = appendDecision([], {
            actor: role?.name || 'system',
            reason: assessment.thin ? 'Brief tipis — needs_info' : 'Brief cukup — queued',
            status
        });

        const abVariants = {
            A: variantA != null ? String(variantA).trim() : null,
            B: variantB != null ? String(variantB).trim() : null
        };
        if (abVariants.A || abVariants.B) {
            decisionLog = appendDecision(decisionLog, {
                actor: role?.name || 'system',
                reason: 'A/B hook terdaftar',
                status: 'ab_registered',
                variants: {
                    A: abVariants.A ? abVariants.A.slice(0, 120) : null,
                    B: abVariants.B ? abVariants.B.slice(0, 120) : null
                }
            });
        }
        if (abWinner && (abWinner === 'A' || abWinner === 'B')) {
            decisionLog = appendDecision(decisionLog, {
                actor: 'user',
                reason: `Pemenang A/B: variant ${abWinner}`,
                status: 'ab_winner',
                winner: abWinner
            });
        }

        const job = await db.addAiJob({
            brief: briefText,
            structuredBrief: assessment.structured,
            status,
            questions: assessment.questions,
            draftHistory: [{
                at: new Date().toISOString(),
                type: 'created',
                version: 'v1',
                brief: briefText,
                complianceNote: null
            }],
            decisionLog,
            platforms: resolvedPlatforms,
            mediaUrl: mediaUrl || '',
            mediaType: mediaType || '',
            employeeName: (employeeName || role?.name || 'Karyawan AI').trim(),
            employeeRole: (employeeRole || role?.id || 'content').trim(),
            roleId: resolvedRoleId,
            variantA: abVariants.A || '',
            variantB: abVariants.B || '',
            abWinner: (abWinner === 'A' || abWinner === 'B') ? abWinner : null,
            runId: null,
            version: 1,
            lastError: null,
            publishResults: {}
        });

        await db.appendAuditLog({
            actor: job.employeeName,
            action: 'job_created',
            target: job.id,
            detail: { status, roleId: job.roleId, thin: assessment.thin }
        });

        if (status === 'needs_info') {
            notifyJobAttention(settings, {
                status: 'needs_info',
                job,
                reason: 'Brief tipis — perlu klarifikasi',
                actor: job.employeeName
            }, { appendAuditLog: (e) => db.appendAuditLog(e) }).catch(() => {});
        }

        console.log(`📋 [AI-JOB] ${job.id} status=${status} thin=${assessment.thin} role=${job.roleId || '-'}`);
        res.status(201).json({
            success: true,
            needsInfo: assessment.thin,
            role: role
                ? { id: role.id, name: role.name, title: role.title, systemBrief: role.systemBrief }
                : null,
            job
        });
    } catch (err) {
        console.error('📋 [AI-JOB] create error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/ai/jobs/:id/answer', async (req, res) => {
    try {
        const job = await db.getAiJobById(req.params.id);
        if (!job) return res.status(404).json({ success: false, message: 'Job tidak ditemukan.' });

        const { answers, brief, structuredBrief, complianceNote } = req.body || {};
        let nextBrief = String(brief || job.brief || '').trim();
        let nextStructured = job.structuredBrief || null;

        if (structuredBrief && typeof structuredBrief === 'object') {
            const assessed = assessStructuredBrief({ ...(job.structuredBrief || {}), ...structuredBrief });
            nextStructured = assessed.structured;
            nextBrief = assessed.text || nextBrief;
        }

        const answerList = Array.isArray(answers)
            ? answers.map(a => String(a || '').trim()).filter(Boolean)
            : (typeof answers === 'string' && answers.trim() ? [answers.trim()] : []);

        if (answerList.length) {
            const qaBlock = (job.questions || [])
                .map((q, i) => answerList[i] ? `Q: ${q}\nA: ${answerList[i]}` : null)
                .filter(Boolean)
                .join('\n');
            const fallback = answerList.map((a, i) => `Jawaban ${i + 1}: ${a}`).join('\n');
            nextBrief = [nextBrief, qaBlock || fallback].filter(Boolean).join('\n\n').trim();
        }

        if (!nextBrief) {
            return res.status(400).json({
                success: false,
                message: 'Berikan answers[] atau brief yang diperbarui.'
            });
        }

        const nextVersion = (job.version || 1) + 1;
        const history = Array.isArray(job.draftHistory) ? [...job.draftHistory] : [];
        history.push({
            at: new Date().toISOString(),
            type: 'answer',
            version: draftVersionLabel(nextVersion),
            answers: answerList,
            brief: nextBrief,
            complianceNote: complianceNote || null
        });

        const decisionLog = appendDecision(job.decisionLog, {
            actor: 'user',
            reason: 'Jawaban klarifikasi diterima → queued',
            status: 'queued'
        });

        const updated = await db.updateAiJob(job.id, {
            brief: nextBrief,
            structuredBrief: nextStructured,
            status: 'queued',
            questions: [],
            draftHistory: history,
            decisionLog,
            version: nextVersion,
            lastError: null
        });

        await db.appendAuditLog({
            actor: 'user',
            action: 'job_answered',
            target: job.id,
            detail: { version: nextVersion }
        });

        console.log(`📋 [AI-JOB] ${job.id} answered → queued`);
        res.json({ success: true, job: updated });
    } catch (err) {
        console.error('📋 [AI-JOB] answer error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Setujui job awaiting_approval; default autoRun=true → publish atomik via /run (approvedAt).
 * Body: { note?, autoRun?: boolean, caption?, ... } — autoRun false hanya menandai approved.
 */
app.post('/api/ai/jobs/:id/approve', rateLimitPublish, async (req, res) => {
    try {
        const job = await db.getAiJobById(req.params.id);
        if (!job) return res.status(404).json({ success: false, message: 'Job tidak ditemukan.' });

        if (!['awaiting_approval', 'queued', 'failed'].includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: `Status ${job.status} tidak bisa di-approve.`
            });
        }

        const actor = req.user?.email || 'user';
        const decisionLog = appendDecision(job.decisionLog, {
            actor,
            reason: req.body?.note || 'Disetujui manusia',
            status: 'approved'
        });

        await db.updateAiJob(job.id, {
            status: 'queued',
            decisionLog,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user?.id || null
        });

        await db.appendAuditLog({
            actor,
            action: 'job_approved',
            target: job.id,
            detail: { note: req.body?.note || '', autoRun: req.body?.autoRun !== false }
        });

        const autoRun = req.body?.autoRun !== false;
        if (!autoRun) {
            return res.json({
                success: true,
                message: 'Disetujui. Panggil POST /run (approvedAt sudah cukup; forcePublish tidak wajib).',
                job: await db.getAiJobById(job.id),
                next: { method: 'POST', path: `/api/ai/jobs/${job.id}/run`, body: {} }
            });
        }

        // Atomik: lanjutkan ke handler /run (gate hormati approvedAt)
        req.body = {
            ...(req.body || {}),
            forcePublish: false,
            caption: req.body?.caption != null ? req.body.caption : undefined
        };
        return runAiJobHandler(req, res);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

async function runAiJobHandler(req, res) {
    try {
        const job = await db.getAiJobById(req.params.id);
        if (!job) return res.status(404).json({ success: false, message: 'Job tidak ditemukan.' });

        if (job.status === 'needs_info') {
            return res.status(400).json({
                success: false,
                message: 'Job masih needs_info. Jawab pertanyaan dulu via POST /api/ai/jobs/:id/answer.',
                questions: job.questions || []
            });
        }

        if (job.status === 'publishing') {
            return res.status(409).json({ success: false, message: 'Job sedang publishing.' });
        }
        if (job.status === 'done' || job.status === 'posted') {
            return res.status(409).json({
                success: false,
                message: 'Job sudah dipublish (idempotent).',
                job
            });
        }

        const {
            caption,
            platforms,
            mediaUrl,
            mediaType,
            employeeName,
            forcePublish,
            complianceNote,
            variantA,
            variantB,
            abWinner
        } = req.body || {};

        const finalCaption = captionFromBrief(job.brief, caption || job.caption);
        if (!finalCaption) {
            return res.status(400).json({
                success: false,
                message: 'Caption kosong. Kirim caption di body atau pastikan brief terisi.'
            });
        }

        const connected = (await db.getAccounts()).filter(a => a.connected).map(a => a.platform);
        let targetPlatforms = Array.isArray(platforms) && platforms.length
            ? platforms.map(p => String(p).toLowerCase())
            : (Array.isArray(job.platforms) && job.platforms.length ? job.platforms : connected);

        targetPlatforms = [...new Set(targetPlatforms)].filter(p => connected.includes(p));

        if (targetPlatforms.length === 0) {
            return res.status(400).json({
                success: false,
                message: connected.length
                    ? 'Tidak ada platform target yang terhubung.'
                    : "Belum ada akun terhubung. Hubungkan akun dulu di UI PiK's Digital Lab."
            });
        }

        const settings = await db.getAiSettings();
        const runRoleId = job.roleId || normalizeRoleId(job.employeeRole);
        if (runRoleId) {
            const perm = enforceRolePlatforms(settings, runRoleId, targetPlatforms);
            if (!perm.ok) {
                return res.status(403).json({
                    success: false,
                    message: perm.message,
                    denied: perm.denied,
                    allowed: perm.allowed
                });
            }
            targetPlatforms = perm.platforms;
            if (!targetPlatforms.length) {
                return res.status(403).json({
                    success: false,
                    message: perm.message || 'Tidak ada platform yang diizinkan untuk peran ini.'
                });
            }
        }

        // forcePublish dari body hanya admin/approver; approvedAt dari /approve sudah cukup
        const forceCheck = auth.assertForcePublish(req, !!forcePublish);
        if (!forceCheck.ok) {
            return res.status(forceCheck.status).json({ success: false, message: forceCheck.message });
        }

        const brandMemories = await collectBrandMemories(targetPlatforms);
        const brandSummary = brandMemoryContextSummary(brandMemories, targetPlatforms);
        const recentPosts = await db.getPosts();
        const humanApproved = !!forcePublish || !!job.approvedAt;

        const gate = evaluatePublishGate({
            settings,
            platforms: targetPlatforms,
            caption: finalCaption,
            brief: job.brief || '',
            brandMemories,
            recentPosts,
            forcePublish: humanApproved
        });

        const name = (employeeName || job.employeeName || 'Karyawan AI').trim();
        const nextVersion = (job.version || 1) + 1;
        const history = Array.isArray(job.draftHistory) ? [...job.draftHistory] : [];
        history.push({
            at: new Date().toISOString(),
            type: 'draft',
            version: draftVersionLabel(nextVersion),
            caption: finalCaption,
            complianceNote: complianceNote || null
        });

        const nextVariantA = variantA != null ? String(variantA).trim() : (job.variantA || '');
        const nextVariantB = variantB != null ? String(variantB).trim() : (job.variantB || '');
        const nextWinner = (abWinner === 'A' || abWinner === 'B')
            ? abWinner
            : (job.abWinner || null);

        if (!gate.allowPublish) {
            let decisionLog = appendDecision(job.decisionLog, {
                actor: name,
                reason: gate.reasons[0] || 'Menunggu approval',
                status: 'awaiting_approval',
                policy: gate.policy
            });
            if (nextWinner) {
                decisionLog = appendDecision(decisionLog, {
                    actor: name,
                    reason: `Pemenang A/B dicatat: ${nextWinner}`,
                    status: 'ab_winner',
                    winner: nextWinner
                });
            }
            const updated = await db.updateAiJob(job.id, {
                status: 'awaiting_approval',
                caption: finalCaption,
                platforms: targetPlatforms,
                mediaUrl: mediaUrl != null ? mediaUrl : (job.mediaUrl || ''),
                mediaType: mediaType != null ? mediaType : (job.mediaType || ''),
                employeeName: name,
                draftHistory: history,
                decisionLog,
                variantA: nextVariantA,
                variantB: nextVariantB,
                abWinner: nextWinner,
                version: nextVersion,
                lastError: null
            });
            await db.appendAuditLog({
                actor: name,
                action: 'job_awaiting_approval',
                target: job.id,
                detail: { reasons: gate.reasons, policy: gate.policy }
            });
            notifyJobAttention(settings, {
                status: 'awaiting_approval',
                job: updated,
                reason: gate.reasons[0] || 'Menunggu persetujuan',
                actor: name
            }, { appendAuditLog: (e) => db.appendAuditLog(e) }).catch(() => {});
            return res.json({
                success: true,
                awaitingApproval: true,
                policy: gate.policy,
                reasons: gate.reasons,
                duplicateWarning: gate.duplicateWarning,
                brandMemorySummary: brandSummary,
                job: updated,
                message: gate.reasons[0] || 'Menunggu persetujuan manusia.'
            });
        }

        const runId = 'run-' + Date.now();
        history.push({ at: new Date().toISOString(), type: 'run_start', caption: finalCaption, runId });

        let decisionLog = appendDecision(job.decisionLog, {
            actor: name,
            reason: gate.reasons[0] || 'Auto-publish diizinkan',
            status: 'publishing',
            policy: gate.policy
        });
        if (nextWinner) {
            decisionLog = appendDecision(decisionLog, {
                actor: name,
                reason: `Pemenang A/B: variant ${nextWinner}`,
                status: 'ab_winner',
                winner: nextWinner
            });
        }

        await db.updateAiJob(job.id, {
            status: 'publishing',
            caption: finalCaption,
            platforms: targetPlatforms,
            mediaUrl: mediaUrl != null ? mediaUrl : (job.mediaUrl || ''),
            mediaType: mediaType != null ? mediaType : (job.mediaType || ''),
            employeeName: name,
            runId,
            draftHistory: history,
            decisionLog,
            variantA: nextVariantA,
            variantB: nextVariantB,
            abWinner: nextWinner,
            version: nextVersion,
            lastError: null,
            approvedAt: null
        });

        console.log(`📋 [AI-JOB] ${job.id} publishing → ${targetPlatforms.join(', ')} (${gate.policy})`);

        const newPost = await db.addPost({
            caption: finalCaption,
            mediaUrl: mediaUrl != null ? mediaUrl : (job.mediaUrl || ''),
            mediaType: mediaType != null ? mediaType : (job.mediaType || ''),
            platforms: targetPlatforms,
            status: 'posted',
            publishDate: new Date().toISOString(),
            stats: null,
            publishResults: {},
            createdBy: 'ai-employee',
            employeeName: name,
            brief: job.brief || '',
            jobId: job.id,
            runId
        });

        const results = await publishToAllPlatforms(newPost);
        const { fields, reconciliation } = publishOutcomeFields(results, {
            statsFactory: generateMockStats
        });
        const lastError = fields.lastError || null;

        await db.updatePost(newPost.id, fields);

        const jobStatus = reconciliation.aggregateStatus === 'posted'
            ? 'done'
            : reconciliation.aggregateStatus === 'partial'
                ? 'done'
                : 'failed';

        history.push({
            at: new Date().toISOString(),
            type: reconciliation.aggregateStatus === 'failed' ? 'run_failed' : 'run_done',
            postId: newPost.id,
            runId,
            lastError,
            publishStatus: reconciliation.aggregateStatus
        });

        decisionLog = appendDecision(decisionLog, {
            actor: name,
            reason: reconciliation.summary,
            status: jobStatus === 'failed' ? 'failed' : 'done',
            publishStatus: reconciliation.aggregateStatus
        });

        const updatedJob = await db.updateAiJob(job.id, {
            status: jobStatus,
            caption: finalCaption,
            platforms: targetPlatforms,
            publishResults: results,
            publishReconciliation: reconciliation,
            postId: newPost.id,
            draftHistory: history,
            decisionLog,
            lastError,
            version: nextVersion
        });

        await db.appendAuditLog({
            actor: name,
            action: reconciliation.aggregateStatus === 'failed'
                ? 'job_run_failed'
                : reconciliation.aggregateStatus === 'partial'
                    ? 'job_run_partial'
                    : 'job_run_ok',
            target: job.id,
            detail: {
                postId: newPost.id,
                platforms: targetPlatforms,
                policy: gate.policy,
                lastError,
                reconciliation
            }
        });

        const post = await db.getPostById(newPost.id);
        console.log(`📋 [AI-JOB] ${job.id} → ${updatedJob.status} (${reconciliation.aggregateStatus})`);

        res.json({
            success: reconciliation.aggregateStatus !== 'failed',
            partial: reconciliation.aggregateStatus === 'partial',
            publishStatus: reconciliation.aggregateStatus,
            reconciliation,
            policy: gate.policy,
            brandMemorySummary: brandSummary,
            duplicateWarning: gate.duplicateWarning,
            job: updatedJob,
            post,
            results
        });
    } catch (err) {
        console.error('📋 [AI-JOB] run error:', err.message);
        try {
            const job = await db.getAiJobById(req.params.id);
            await db.updateAiJob(req.params.id, {
                status: 'failed',
                lastError: err.message,
                publishResults: { error: err.message },
                decisionLog: appendDecision(job?.decisionLog, {
                    actor: 'system',
                    reason: err.message,
                    status: 'failed'
                })
            });
        } catch (_) { /* ignore */ }
        res.status(500).json({ success: false, message: err.message });
    }
}

app.post('/api/ai/jobs/:id/run', rateLimitPublish, runAiJobHandler);


// Cron Vercel: publish postingan terjadwal yang jatuh tempo
// Production: CRON_SECRET wajib (fail closed). Lokal: interval 60s; Vercel Hobby: 1×/hari (vercel.json).
app.get('/api/cron/publish', async (req, res) => {
    const header = req.headers.authorization || '';
    const cronSecret = process.env.CRON_SECRET || '';

    if (IS_PRODUCTION) {
        if (!cronSecret) {
            console.error('[cron] CRON_SECRET wajib di production — fail closed');
            return res.status(503).json({
                success: false,
                message: 'CRON_SECRET wajib di production.'
            });
        }
        if (header !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
    } else if (cronSecret && header !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await runScheduler();
    res.json({
        success: true,
        message: result?.skipped ? 'Scheduler dilewati (emergency pause)' : 'Scheduler dijalankan',
        ...result
    });
});

// ============================================================
// Serve Frontend (Fallback ke index.html)
// ============================================================
app.get('*', (req, res) => {
    // Jangan balas HTML untuk aset statis yang hilang (cegah script 404 → parse error)
    if (/\.(js|css|map|json|ico|png|jpe?g|webp|svg|woff2?)$/i.test(req.path)) {
        return res.status(404).type('text/plain').send('Not found');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// Start Server (lokal) / Export untuk Vercel
// ============================================================
module.exports = app;

if (require.main === module) {
    ensureDb()
        .then(() => auth.ensureBootstrapAdmin(db))
        .then(() => {
            app.listen(PORT, () => {
                console.log('');
                console.log('╔══════════════════════════════════════════════════╗');
                console.log(`║  PiK's Digital Lab Server — port ${PORT}            ║`);
                console.log(`║  Buka: http://localhost:${PORT}                     ║`);
                console.log(`║  Mode: ${SANDBOX_MODE ? 'SANDBOX (simulasi)             ' : 'REAL (API terhubung)          '} ║`);
                console.log(`║  DB: ${process.env.DATABASE_URL ? 'Neon Postgres                ' : 'db.json (lokal)              '} ║`);
                console.log('╚══════════════════════════════════════════════════╝');
                console.log('');
            });
        })
        .catch(err => {
            console.error('[SERVER] Gagal start:', err.message);
            process.exit(1);
        });
}
