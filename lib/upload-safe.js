/**
 * Hardening upload: MIME/extension allowlist + sanitize filename.
 */

const path = require('path');

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
]);

const ALLOWED_EXT = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.mp4', '.mov', '.webm'
]);

function sanitizeFilename(original) {
    const base = path.basename(String(original || 'file'));
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    const sliced = cleaned.slice(0, 120);
    return sliced || 'file';
}

function isAllowedUpload(file) {
    if (!file) return { ok: false, message: 'Tidak ada file.' };
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
        return { ok: false, message: `MIME tidak diizinkan: ${mime || '(kosong)'}.` };
    }
    if (!ALLOWED_EXT.has(ext)) {
        return { ok: false, message: `Ekstensi tidak diizinkan: ${ext || '(kosong)'}.` };
    }
    return { ok: true };
}

function multerFileFilter(_req, file, cb) {
    const check = isAllowedUpload(file);
    if (!check.ok) return cb(new Error(check.message), false);
    cb(null, true);
}

module.exports = {
    ALLOWED_MIME,
    ALLOWED_EXT,
    sanitizeFilename,
    isAllowedUpload,
    multerFileFilter
};
