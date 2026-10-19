/**
 * OAuth CSRF state — signed HMAC (SESSION_SECRET), TTL pendek.
 * Generate di /api/auth/{meta|youtube|tiktok}, verify di callback REAL.
 */

const crypto = require('crypto');

const TTL_MS = 15 * 60 * 1000;

function getSecret() {
    const s = process.env.SESSION_SECRET || '';
    if (s.length >= 16) return s;
    return s || 'dev-only-insecure-session-secret';
}

function timingSafeEqualStr(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

/** @param {{ provider?: string, userId?: string }} [extra] */
function createOAuthState(extra = {}) {
    const payload = {
        n: crypto.randomBytes(16).toString('hex'),
        exp: Date.now() + TTL_MS,
        p: extra.provider || '',
        u: extra.userId || ''
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    return `${body}.${sig}`;
}

/**
 * @returns {{ ok: true, payload: object } | { ok: false, message: string }}
 */
function verifyOAuthState(state, expectedProvider) {
    if (!state || typeof state !== 'string' || !state.includes('.')) {
        return { ok: false, message: 'OAuth state hilang atau tidak valid.' };
    }
    const [body, sig] = state.split('.');
    if (!body || !sig) return { ok: false, message: 'OAuth state tidak valid.' };
    const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    if (!timingSafeEqualStr(sig, expected)) {
        return { ok: false, message: 'OAuth state signature gagal.' };
    }
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || !payload.exp || payload.exp < Date.now()) {
            return { ok: false, message: 'OAuth state kedaluwarsa — ulangi connect.' };
        }
        if (expectedProvider && payload.p && payload.p !== expectedProvider) {
            return { ok: false, message: 'OAuth state provider tidak cocok.' };
        }
        return { ok: true, payload };
    } catch {
        return { ok: false, message: 'OAuth state corrupt.' };
    }
}

module.exports = {
    createOAuthState,
    verifyOAuthState,
    TTL_MS
};
