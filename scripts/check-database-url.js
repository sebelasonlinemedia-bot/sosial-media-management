/**
 * Cek DATABASE_URL tanpa mencetak connection string / secrets.
 * Usage: node scripts/check-database-url.js
 *
 * Tidak gagal keras jika URL kosong (lokal pakai db.json OK).
 * Exit 0 = ok / mode file; exit 2 = URL set tapi format mencurigakan.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const raw = process.env.DATABASE_URL;
const present = !!(raw && String(raw).trim());

function summarizeUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname || '(no-host)';
        const isNeon = /\.neon\.tech$/i.test(host) || /neon/i.test(host);
        return {
            protocol: u.protocol.replace(/:$/, ''),
            host,
            database: (u.pathname || '').replace(/^\//, '') || '(default)',
            sslmode: u.searchParams.get('sslmode') || null,
            isNeon,
            hasUser: !!u.username,
            // jangan pernah log password
        };
    } catch (_) {
        return null;
    }
}

console.log('=== DATABASE_URL check (no secrets) ===');
if (!present) {
    console.log('status: unset');
    console.log('mode: file (db.json) — OK untuk lokal');
    console.log('hint: untuk Neon/Vercel set DATABASE_URL di .env atau `vercel env add DATABASE_URL`');
    console.log('hint: jangan commit .env; jangan paste URI di chat');
    process.exit(0);
}

const info = summarizeUrl(String(raw).trim());
if (!info) {
    console.error('status: set but INVALID URI format');
    console.error('hint: gunakan URI postgres dari Neon Connect (sslmode=require)');
    process.exit(2);
}

console.log('status: set');
console.log('mode: postgres');
console.log('protocol:', info.protocol);
console.log('host:', info.host);
console.log('database:', info.database);
console.log('sslmode:', info.sslmode || '(none)');
console.log('provider_guess:', info.isNeon ? 'neon' : 'other');
console.log('has_user:', info.hasUser);
console.log('OK — string tidak ditampilkan. Pastikan juga di Vercel Project → Settings → Environment Variables.');
process.exit(0);
