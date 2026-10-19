#!/usr/bin/env node
/**
 * Karyawan AI — CLI publish langsung (tetap di-gate otonomi).
 *
 * Auth: login dulu (ADMIN_EMAIL + ADMIN_PASSWORD atau PIKS_EMAIL + PIKS_PASSWORD),
 * lalu kirim Authorization: Bearer <token>.
 *
 * Contoh:
 *   node scripts/ai-employee-publish.js --brief "Promo flash sale sepatu" --platforms instagram
 *   node scripts/ai-employee-publish.js --caption "Halo!" --platforms instagram,facebook --media ./foto.jpg
 *   node scripts/ai-employee-publish.js --context
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const BASE = process.env.PIKS_DIGITAL_LAB_URL || process.env.POSTSPHERE_URL || 'http://localhost:3000';

function parseArgs(argv) {
    const out = { platforms: null, media: null, caption: null, brief: null, name: 'Karyawan AI', context: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '--context') out.context = true;
        else if (a === '--brief') out.brief = next();
        else if (a === '--caption') out.caption = next();
        else if (a === '--platforms') out.platforms = next().split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        else if (a === '--media') out.media = next();
        else if (a === '--name') out.name = next();
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

async function ensureServer() {
    try {
        await axios.get(`${BASE}/api/status`, { timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

async function login() {
    const email = process.env.PIKS_EMAIL || process.env.ADMIN_EMAIL;
    const password = process.env.PIKS_PASSWORD || process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        throw new Error('Set PIKS_EMAIL+PIKS_PASSWORD atau ADMIN_EMAIL+ADMIN_PASSWORD untuk CLI auth.');
    }
    const { data } = await axios.post(`${BASE}/api/auth/login`, { email, password });
    if (!data?.success || !data.token) {
        throw new Error(data?.message || 'Login CLI gagal');
    }
    return data.token;
}

function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}

async function uploadMedia(filePath, token) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) throw new Error(`File media tidak ditemukan: ${abs}`);
    const form = new FormData();
    form.append('file', fs.createReadStream(abs));
    const res = await axios.post(`${BASE}/api/media/upload`, form, {
        headers: { ...form.getHeaders(), ...authHeaders(token) },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });
    if (!res.data || !res.data.success) throw new Error(res.data?.message || 'Upload gagal');
    return { mediaUrl: res.data.url, mediaType: res.data.type };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        console.log(`Usage:
  node scripts/ai-employee-publish.js --context
  node scripts/ai-employee-publish.js --brief "..." [--platforms ig,fb] [--media path] [--name "Karyawan AI"]
  node scripts/ai-employee-publish.js --caption "..." ...

Env auth: PIKS_EMAIL + PIKS_PASSWORD (atau ADMIN_EMAIL + ADMIN_PASSWORD)`);
        process.exit(0);
    }

    const up = await ensureServer();
    if (!up) {
        console.error(`Server PiK's Digital Lab tidak merespons di ${BASE}`);
        console.error('Jalankan dulu: npm run dev');
        process.exit(1);
    }

    const token = await login();

    if (args.context) {
        const { data } = await axios.get(`${BASE}/api/ai/employee/context`, {
            headers: authHeaders(token)
        });
        console.log(JSON.stringify(data, null, 2));
        process.exit(0);
    }

    if (!args.caption && !args.brief) {
        console.error('Wajib --caption atau --brief');
        process.exit(1);
    }

    let mediaUrl = '';
    let mediaType = '';
    if (args.media) {
        const uploaded = await uploadMedia(args.media, token);
        mediaUrl = uploaded.mediaUrl;
        mediaType = uploaded.mediaType;
    }

    const payload = {
        brief: args.brief || '',
        caption: args.caption || args.brief,
        platforms: args.platforms,
        mediaUrl,
        mediaType,
        employeeName: args.name
    };

    const { data } = await axios.post(`${BASE}/api/ai/employee/publish`, payload, {
        headers: authHeaders(token)
    });
    console.log(JSON.stringify(data, null, 2));
    process.exit(data.success ? 0 : 2);
}

main().catch(err => {
    console.error(err.response?.data || err.message);
    process.exit(1);
});
