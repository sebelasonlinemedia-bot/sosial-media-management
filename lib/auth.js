/**
 * App authentication — signed cookie session (serverless-friendly).
 * Bootstrap admin: ADMIN_EMAIL + ADMIN_PASSWORD_HASH (atau ADMIN_PASSWORD lokal).
 * Jangan log password / session token.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'piks_sid';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FORCE_PUBLISH_ROLES = new Set(['admin', 'approver']);

function isProduction() {
    return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

function getSessionSecret() {
    const s = process.env.SESSION_SECRET || '';
    if (s.length >= 16) return s;
    if (isProduction()) {
        console.error('[auth] SESSION_SECRET wajib (≥16 karakter) di production.');
    } else {
        console.warn('[auth] SESSION_SECRET lemah/kosong — memakai fallback lokal saja.');
    }
    return s || 'dev-only-insecure-session-secret';
}

function timingSafeEqualStr(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

function signPayload(payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
    if (!timingSafeEqualStr(sig, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || !payload.exp || payload.exp < Date.now()) return null;
        if (!payload.userId || !payload.email) return null;
        return {
            id: payload.userId,
            email: payload.email,
            role: payload.role || 'editor',
            name: payload.name || ''
        };
    } catch {
        return null;
    }
}

function createSessionToken(user) {
    return signPayload({
        userId: user.id,
        email: user.email,
        role: user.role || 'editor',
        name: user.name || '',
        exp: Date.now() + MAX_AGE_MS
    });
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    });
    return out;
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction(),
        path: '/',
        maxAge: MAX_AGE_MS
    };
}

function setSessionCookie(res, token) {
    const opts = cookieOptions();
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        `Path=${opts.path}`,
        `Max-Age=${Math.floor(opts.maxAge / 1000)}`,
        `SameSite=${opts.sameSite}`,
        'HttpOnly'
    ];
    if (opts.secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
    const parts = [
        `${COOKIE_NAME}=`,
        'Path=/',
        'Max-Age=0',
        'SameSite=Lax',
        'HttpOnly'
    ];
    if (isProduction()) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function extractToken(req) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        const bearer = auth.slice(7).trim();
        // Cron uses CRON_SECRET — jangan treat sebagai session
        if (bearer && bearer !== process.env.CRON_SECRET) return bearer;
    }
    const cookies = parseCookies(req);
    return cookies[COOKIE_NAME] || null;
}

/** Attach req.user jika session valid (tidak memaksa login). */
function attachUser(req, _res, next) {
    try {
        const token = extractToken(req);
        req.user = token ? verifyToken(token) : null;
        req.sessionToken = token && req.user ? token : null;
    } catch {
        req.user = null;
        req.sessionToken = null;
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Autentikasi wajib. Login dulu via POST /api/auth/login.',
            authRequired: true
        });
    }
    next();
}

function requireRole(...roles) {
    const allowed = new Set(roles);
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Autentikasi wajib.',
                authRequired: true
            });
        }
        if (!allowed.has(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Peran '${req.user.role}' tidak diizinkan untuk aksi ini.`
            });
        }
        next();
    };
}

function canForcePublish(user) {
    return !!(user && FORCE_PUBLISH_ROLES.has(user.role));
}

/**
 * Tolak forcePublish dari anon / non-admin/approver.
 * Job yang sudah approvedAt tetap boleh tanpa forcePublish flag.
 */
function assertForcePublish(req, forcePublishFlag) {
    if (!forcePublishFlag) return { ok: true };
    if (!req.user) {
        return { ok: false, status: 401, message: 'forcePublish memerlukan autentikasi.' };
    }
    if (!canForcePublish(req.user)) {
        return {
            ok: false,
            status: 403,
            message: 'forcePublish hanya untuk role admin atau approver.'
        };
    }
    return { ok: true };
}

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        role: user.role || 'editor',
        name: user.name || ''
    };
}

async function hashPassword(plain) {
    return bcrypt.hash(String(plain), 10);
}

async function verifyPassword(plain, hash) {
    if (!plain || !hash) return false;
    // Support legacy plain (hanya jika hash bukan bcrypt) — jangan di production baru
    if (typeof hash === 'string' && !hash.startsWith('$2')) {
        return timingSafeEqualStr(plain, hash);
    }
    return bcrypt.compare(String(plain), String(hash));
}

/**
 * Buat / sync admin dari env.
 * - Email di-normalize (trim + lowercase).
 * - Jika user ADMIN_EMAIL sudah ada, password di-sync dari ADMIN_PASSWORD(_HASH)
 *   agar mengubah .env + restart benar-benar mengubah kredensial login.
 * - Password pendek (mis. "123") OK untuk lokal; tidak ada min-length di sini.
 * - ADMIN_PASSWORD_HASH menang atas ADMIN_PASSWORD.
 */
async function ensureBootstrapAdmin(db) {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) {
        const users = await db.getUsers();
        if (!users.length) {
            console.warn('[auth] Tidak ada user & ADMIN_EMAIL kosong — set ADMIN_EMAIL + ADMIN_PASSWORD(_HASH) untuk bootstrap.');
        }
        return null;
    }

    const fromHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
    const plain = process.env.ADMIN_PASSWORD;
    const hasPlain = plain != null && plain !== '';

    if (!fromHash && !hasPlain) {
        console.warn('[auth] ADMIN_EMAIL set tapi ADMIN_PASSWORD_HASH / ADMIN_PASSWORD kosong — skip bootstrap.');
        return null;
    }

    if (!fromHash && hasPlain && isProduction()) {
        console.warn('[auth] ADMIN_PASSWORD plain dipakai di production — lebih aman ADMIN_PASSWORD_HASH (bcrypt).');
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
        let needsSync = false;
        let passwordHash = existing.passwordHash;

        if (fromHash) {
            needsSync = String(existing.passwordHash || '') !== fromHash;
            if (needsSync) passwordHash = fromHash;
        } else if (!(await verifyPassword(plain, existing.passwordHash))) {
            needsSync = true;
            passwordHash = await hashPassword(plain);
        }

        if (needsSync && typeof db.updateUser === 'function') {
            const updated = await db.updateUser(existing.id, {
                passwordHash,
                role: existing.role || 'admin',
                name: existing.name || process.env.ADMIN_NAME || 'Admin',
                email
            });
            console.log(`[auth] Bootstrap admin password di-sync dari .env: ${email}`);
            return updated || { ...existing, passwordHash, email };
        }
        return existing;
    }

    const passwordHash = fromHash || (await hashPassword(plain));
    const user = await db.addUser({
        email,
        passwordHash,
        role: 'admin',
        name: process.env.ADMIN_NAME || 'Admin'
    });
    console.log(`[auth] Bootstrap admin dibuat: ${email}`);
    return user;
}

function isPublicApi(req) {
    const p = req.path || req.url || '';
    const m = req.method;

    if (m === 'GET' && p === '/api/status') return true;
    if (m === 'POST' && p === '/api/auth/login') return true;
    if (m === 'GET' && p === '/api/auth/me') return true;
    if (m === 'POST' && p === '/api/auth/logout') return true;
    if (m === 'GET' && p === '/api/cron/publish') return true;

    // OAuth provider callbacks (redirect browser) — cookie session tetap dicek di handler jika perlu
    if (m === 'GET' && /^\/api\/auth\/(meta|youtube|tiktok)\/callback\/?$/.test(p)) return true;

    return false;
}

/** Middleware: semua /api/* selain public → requireAuth. */
function requireAuthForApi(req, res, next) {
    if (!req.path.startsWith('/api/')) return next();
    if (isPublicApi(req)) return next();
    return requireAuth(req, res, next);
}

module.exports = {
    COOKIE_NAME,
    MAX_AGE_MS,
    FORCE_PUBLISH_ROLES,
    isProduction,
    createSessionToken,
    verifyToken,
    setSessionCookie,
    clearSessionCookie,
    attachUser,
    requireAuth,
    requireRole,
    requireAuthForApi,
    canForcePublish,
    assertForcePublish,
    publicUser,
    hashPassword,
    verifyPassword,
    ensureBootstrapAdmin,
    isPublicApi
};
