/**
 * Helper minimal enkripsi token at-rest (Fase 2).
 * Aktif hanya jika TOKEN_ENCRYPTION_KEY diset (32+ char).
 * Tanpa key: pass-through (kompatibel dengan data existing).
 *
 * TODO produksi: migrasi token lama, rotasi key, AES-GCM dengan IV per nilai.
 */

const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKey() {
    const raw = process.env.TOKEN_ENCRYPTION_KEY || '';
    if (!raw || raw.length < 16) return null;
    return crypto.createHash('sha256').update(raw).digest();
}

function encryptSecret(plain) {
    if (plain == null || plain === '') return plain;
    const key = getKey();
    if (!key) return plain;
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

module.exports = {
    encryptSecret,
    decryptSecret,
    isEncryptionEnabled,
    PREFIX
};
