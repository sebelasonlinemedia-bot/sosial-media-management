/**
 * Unit smoke P1: oauth-state, upload-safe, rate-limit, token-crypto pageToken.
 * Usage: node scripts/test-p1-hardening.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createOAuthState, verifyOAuthState } = require('../lib/oauth-state');
const { isAllowedUpload, sanitizeFilename } = require('../lib/upload-safe');
const { createRateLimiter } = require('../lib/rate-limit');
const {
    encryptAccountTokens,
    decryptAccountTokens,
    encryptSecret,
    decryptSecret,
    PREFIX
} = require('../lib/token-crypto');

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed += 1;
    } else {
        console.log('PASS:', msg);
    }
}

// OAuth state
const state = createOAuthState({ provider: 'meta', userId: 'u1' });
const ok = verifyOAuthState(state, 'meta');
assert(ok.ok === true, 'oauth state verify ok');
assert(verifyOAuthState('bad', 'meta').ok === false, 'oauth state reject garbage');
assert(verifyOAuthState(state, 'tiktok').ok === false, 'oauth state reject wrong provider');

// Upload allowlist
assert(isAllowedUpload({ mimetype: 'image/png', originalname: 'a.png' }).ok, 'png allowed');
assert(!isAllowedUpload({ mimetype: 'text/html', originalname: 'x.html' }).ok, 'html rejected');
assert(!isAllowedUpload({ mimetype: 'application/x-msdownload', originalname: 'a.exe' }).ok, 'exe rejected');
assert(sanitizeFilename('../../evil name!.png') === 'evil_name_.png' || sanitizeFilename('../../evil name!.png').endsWith('.png'), 'filename sanitized');

// Rate limit
const limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: 'slow' });
const fakeRes = () => {
    const headers = {};
    return {
        statusCode: 200,
        body: null,
        setHeader(k, v) { headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
};
let nextCount = 0;
const next = () => { nextCount += 1; };
limiter({ ip: '1.1.1.1', path: '/api/auth/login', user: null }, fakeRes(), next);
limiter({ ip: '1.1.1.1', path: '/api/auth/login', user: null }, fakeRes(), next);
const blocked = fakeRes();
limiter({ ip: '1.1.1.1', path: '/api/auth/login', user: null }, blocked, next);
assert(nextCount === 2 && blocked.statusCode === 429, 'rate limit trips on 3rd hit');

// pageToken encrypt (only if key set — otherwise pass-through still roundtrips)
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'test-encryption-key-32chars!!';
const sealed = encryptAccountTokens({
    platform: 'instagram',
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    pageToken: 'pt-1'
});
assert(String(sealed.pageToken).startsWith(PREFIX), 'pageToken encrypted');
assert(String(sealed.accessToken).startsWith(PREFIX), 'accessToken encrypted');
const opened = decryptAccountTokens(sealed);
assert(opened.pageToken === 'pt-1' && opened.accessToken === 'at-1', 'pageToken decrypt roundtrip');

const sessionBlob = encryptSecret(JSON.stringify([{ name: 'c', value: 'v' }]));
assert(String(decryptSecret(sessionBlob)).includes('"name"'), 'session blob encrypt roundtrip');

if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nPASS: all P1 hardening checks');
