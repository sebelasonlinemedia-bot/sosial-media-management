/**
 * Object storage opsional (P3 / DEP-02).
 * Jika BLOB_READ_WRITE_TOKEN set → unggah ke Vercel Blob (URL HTTPS absolut).
 * Else → path lokal /uploads + PUBLIC_BASE_URL (tidak wajibkan token).
 */

const fs = require('fs');
const path = require('path');

function isBlobConfigured() {
    return !!(process.env.BLOB_READ_WRITE_TOKEN && String(process.env.BLOB_READ_WRITE_TOKEN).trim());
}

/**
 * @param {{ localPath: string, filename: string, contentType?: string }} opts
 * @returns {Promise<{ storage: 'blob'|'local', url: string, publicUrl: string|null, pathname?: string }>}
 */
async function persistUploadedFile(opts = {}) {
    const { localPath, filename, contentType } = opts;
    if (!localPath || !fs.existsSync(localPath)) {
        throw new Error('File lokal tidak ditemukan untuk persist.');
    }

    if (!isBlobConfigured()) {
        const url = `/uploads/${filename}`;
        return {
            storage: 'local',
            url,
            publicUrl: null,
            note: 'BLOB_READ_WRITE_TOKEN tidak set — memakai disk lokal / PUBLIC_BASE_URL.'
        };
    }

    try {
        const { put } = require('@vercel/blob');
        const body = fs.readFileSync(localPath);
        const blob = await put(`uploads/${filename}`, body, {
            access: 'public',
            contentType: contentType || undefined,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
        // Hapus salinan lokal ephemeral jika berhasil (terutama /tmp Vercel)
        try {
            fs.unlinkSync(localPath);
        } catch {
            /* ignore */
        }
        return {
            storage: 'blob',
            url: blob.url,
            publicUrl: blob.url,
            pathname: blob.pathname,
            note: 'Tersimpan di Vercel Blob.'
        };
    } catch (err) {
        // Jangan crash boot/upload path — fallback lokal dengan catatan
        const url = `/uploads/${path.basename(filename)}`;
        return {
            storage: 'local',
            url,
            publicUrl: null,
            note: `Blob gagal (${err.message}) — fallback lokal.`,
            blobError: err.message
        };
    }
}

module.exports = {
    isBlobConfigured,
    persistUploadedFile
};
