/**
 * Enkripsi token at-rest (accessToken / refreshToken).
 * Aktif jika TOKEN_ENCRYPTION_KEY diset (≥16 char).
 * Tanpa key: pass-through + warn sekali (kompatibel lokal).
 *
 * Jangan log nilai token. TODO produksi: migrasi token lama, rotasi key.
 */

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
let warnedNoKey = false;

function getKey() {
    const raw = process.env.TOKEN_ENCRYPTION_KEY || '';
    if (!raw || raw.length < 16) return null;
    return crypto.createHash('sha256').update(raw).digest();
}

/** Panggil saat write token — warn sekali jika key kosong. */
function warnIfNoEncryptionKey() {
    if (warnedNoKey || getKey()) return;
    warnedNoKey = true;
    console.warn('[token-crypto] TOKEN_ENCRYPTION_KEY kosong — token disimpan plain (mode lokal).');
}

function encryptSecret(plain) {
    if (plain == null || plain === '') return plain;
    const key = getKey();
    if (!key) {
        warnIfNoEncryptionKey();
        return plain;
    }
    if (String(plain).startsWith(PREFIX)) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url');
}

function decryptSecret(value) {
    if (value == null || value === '') return value;
    const key = getKey();
    const str = String(value);
    if (!str.startsWith(PREFIX)) return value;
    if (!key) {
        console.warn('[token-crypto] TOKEN_ENCRYPTION_KEY hilang — tidak bisa decrypt');
        return value;
    }
    try {
        const buf = Buffer.from(str.slice(PREFIX.length), 'base64url');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const data = buf.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (e) {
        console.warn('[token-crypto] decrypt gagal:', e.message);
        return value;
    }
}

function isEncryptionEnabled() {
    return !!getKey();
}

/** Encrypt fields sebelum persist akun. */
function encryptAccountTokens(accountData) {
    if (!accountData || typeof accountData !== 'object') return accountData;
    warnIfNoEncryptionKey();
    const out = { ...accountData };
    if (out.accessToken != null && out.accessToken !== '') {
        out.accessToken = encryptSecret(out.accessToken);
    }
    if (out.refreshToken != null && out.refreshToken !== '') {
        out.refreshToken = encryptSecret(out.refreshToken);
    }
    return out;
}

/** Decrypt fields setelah baca dari DB (untuk publish). */
function decryptAccountTokens(account) {
    if (!account || typeof account !== 'object') return account;
    return {
        ...account,
        accessToken: account.accessToken != null ? decryptSecret(account.accessToken) : account.accessToken,
        refreshToken: account.refreshToken != null ? decryptSecret(account.refreshToken) : account.refreshToken
    };
}

module.exports = {
    encryptSecret,
    decryptSecret,
    encryptAccountTokens,
    decryptAccountTokens,
    warnIfNoEncryptionKey,
    isEncryptionEnabled,
    PREFIX
};
