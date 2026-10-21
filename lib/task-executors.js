/**
 * Eksekutor Tugas Umum Kantor AI (Fase A–D).
 *
 * Memperluas Kantor AI dari sekadar publish sosmed menjadi tugas umum:
 *  - research    : ambil & ringkas halaman web (Rani/Bimo)
 *  - email       : kirim email SMTP/Resend (Titin) — OUTWARD, lewat gate approval
 *  - document    : buat dokumen md/txt/html/csv (Dimas)
 *  - spreadsheet : analisis CSV / buat CSV dari baris data (Bimo)
 *  - image       : generate gambar OpenAI, atau placeholder SVG simulasi (Salsa)
 *  - whatsapp    : kirim WhatsApp Cloud API (Titin) — OUTWARD, lewat gate approval
 *  - general     : tugas bebas via LLM bila terkonfigurasi (Maya)
 *
 * Pola aplikasi dipertahankan: tanpa kredensial → mode simulasi (SANDBOX)
 * yang jujur ditandai `simulated: true`, tidak pernah berpura-pura terkirim.
 * Modul ini murni (tanpa Express/db) — konteks disuntik server:
 *   ctx.llmText(prompt) -> string|null   (null bila LLM tak terkonfigurasi)
 *   ctx.openAiKey       -> string        (opsional, untuk generate gambar)
 *   ctx.env             -> objek env     (default process.env)
 *   ctx.fetch           -> fungsi fetch  (default global fetch)
 */

const TASK_TYPES = {
    research: {
        id: 'research',
        label: 'Riset Web',
        defaultRoleId: 'strategist',
        outward: false,
        required: ['urls'],
        hint: 'input: { urls: string[], query?: string }'
    },
    email: {
        id: 'email',
        label: 'Kirim Email',
        defaultRoleId: 'community-manager',
        outward: true,
        required: ['to', 'subject', 'body'],
        hint: 'input: { to, subject, body }'
    },
    document: {
        id: 'document',
        label: 'Buat Dokumen',
        defaultRoleId: 'copywriter',
        outward: false,
        required: ['title'],
        hint: 'input: { title, content?, format?: "md"|"txt"|"html"|"csv", rows? }'
    },
    spreadsheet: {
        id: 'spreadsheet',
        label: 'Olah Spreadsheet (CSV)',
        defaultRoleId: 'analyst',
        outward: false,
        required: [],
        hint: 'input: { csv?: string, rows?: object[] } — csv dianalisis, rows diubah jadi CSV'
    },
    image: {
        id: 'image',
        label: 'Generate Gambar',
        defaultRoleId: 'visual-producer',
        outward: false,
        required: ['prompt'],
        hint: 'input: { prompt, size?: "1024x1024" }'
    },
    whatsapp: {
        id: 'whatsapp',
        label: 'Kirim WhatsApp',
        defaultRoleId: 'community-manager',
        outward: true,
        required: ['to', 'message'],
        hint: 'input: { to: "62812xxxx", message }'
    },
    general: {
        id: 'general',
        label: 'Tugas Umum (LLM)',
        defaultRoleId: 'manager',
        outward: false,
        required: ['instruction'],
        hint: 'input: { instruction }'
    }
};

function normalizeTaskType(value) {
    const id = String(value || '').trim().toLowerCase();
    return TASK_TYPES[id] ? id : null;
}

function getTaskType(value) {
    const id = normalizeTaskType(value);
    return id ? TASK_TYPES[id] : null;
}

function listTaskTypes() {
    return Object.values(TASK_TYPES).map(t => ({ ...t }));
}

/** Field wajib yang masih kosong untuk tipe tugas ini. */
function missingFields(type, input) {
    const def = getTaskType(type);
    if (!def) return ['taskType'];
    const data = input && typeof input === 'object' ? input : {};
    const missing = [];
    for (const field of def.required) {
        const v = data[field];
        if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) {
            missing.push(field);
        }
    }
    if (def.id === 'spreadsheet' && !data.csv && !(Array.isArray(data.rows) && data.rows.length)) {
        missing.push('csv atau rows');
    }
    return missing;
}

/* ------------------------------------------------------------------ CSV */

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const src = String(text || '');
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
            } else cell += ch;
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            row.push(cell); cell = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(cell); cell = '';
            if (row.some(c => String(c).trim() !== '')) rows.push(row);
            row = [];
        } else cell += ch;
    }
    row.push(cell);
    if (row.some(c => String(c).trim() !== '')) rows.push(row);
    return rows;
}

function toCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const isObj = rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0]);
    const headers = isObj ? Object.keys(rows[0]) : rows[0].map((_, i) => `kolom${i + 1}`);
    const esc = v => {
        const s = v == null ? '' : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(esc).join(',')];
    const body = isObj ? rows : rows.slice(1);
    for (const r of body) {
        lines.push(headers.map(h => esc(isObj ? r[h] : r[headers.indexOf(h)])).join(','));
    }
    return lines.join('\n');
}

function analyzeCsv(text) {
    const table = parseCsv(text);
    if (!table.length) return { rowCount: 0, columns: [], stats: {} };
    const headers = table[0].map((h, i) => String(h || `kolom${i + 1}`).trim());
    const dataRows = table.slice(1);
    const stats = {};
    headers.forEach((h, idx) => {
        const nums = dataRows.map(r => Number(r[idx])).filter(n => Number.isFinite(n));
        if (nums.length && nums.length >= Math.max(1, Math.floor(dataRows.length / 2))) {
            const sum = nums.reduce((a, b) => a + b, 0);
            stats[h] = {
                count: nums.length,
                sum: Math.round(sum * 100) / 100,
                avg: Math.round((sum / nums.length) * 100) / 100,
                min: Math.min(...nums),
                max: Math.max(...nums)
            };
        }
    });
    return { rowCount: dataRows.length, columns: headers, stats };
}

/* ----------------------------------------------------------------- HTML */

function stripHtml(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeXml(s) {
    return String(s || '').replace(/[<>&"']/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
    }[c]));
}

function sanitizeFilename(name) {
    const base = String(name || 'dokumen').toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return base || 'dokumen';
}

/* ------------------------------------------------------------- Executors */

async function execResearch(input, ctx) {
    const urls = (Array.isArray(input.urls) ? input.urls : [input.urls])
        .map(u => String(u || '').trim()).filter(Boolean).slice(0, 3);
    const fetchFn = ctx.fetch || fetch;
    const sources = [];
    for (const url of urls) {
        if (!/^https?:\/\//i.test(url)) {
            sources.push({ url, error: 'URL harus http/https.' });
            continue;
        }
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 15000);
            const res = await fetchFn(url, { signal: ctrl.signal, headers: { 'User-Agent': 'PiksDigitalLab-Research/1.0' } });
            clearTimeout(timer);
            const html = await res.text();
            sources.push({ url, status: res.status, excerpt: stripHtml(html).slice(0, 4000) });
        } catch (err) {
            sources.push({ url, error: err.name === 'AbortError' ? 'Timeout 15 detik.' : err.message });
        }
    }
    const okSources = sources.filter(s => s.excerpt);
    let summary = null;
    if (okSources.length && ctx.llmText) {
        const prompt = [
            'Ringkas hasil riset web berikut dalam Bahasa Indonesia.',
            input.query ? `Fokus riset: ${input.query}` : '',
            'Balas HANYA JSON: {"result": "<ringkasan + poin temuan kunci>"}',
            ...okSources.map(s => `--- ${s.url}\n${s.excerpt}`)
        ].filter(Boolean).join('\n\n');
        summary = await ctx.llmText(prompt).catch(() => null);
    }
    return {
        ok: okSources.length > 0,
        simulated: false,
        summary: summary
            || (okSources.length
                ? `Berhasil mengambil ${okSources.length}/${urls.length} halaman. ${summary === null && ctx.llmText === undefined ? '' : '(LLM tidak terkonfigurasi — ringkasan otomatis dilewati, kutipan teks tersedia di data.)'}`
                : 'Semua URL gagal diambil.'),
        data: { query: input.query || null, sources }
    };
}

async function execEmail(input, ctx) {
    const env = ctx.env || process.env;
    const { to, subject, body } = input;
    // 1) SMTP asli bila dikonfigurasi
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
        const nodemailer = require('nodemailer');
        const transport = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: parseInt(env.SMTP_PORT || '587', 10),
            secure: String(env.SMTP_SECURE || '') === 'true',
            auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
        });
        const info = await transport.sendMail({
            from: env.SMTP_FROM || env.SMTP_USER,
            to, subject, text: body
        });
        return { ok: true, simulated: false, summary: `Email terkirim ke ${to} (SMTP, id ${info.messageId || '-'}).`, data: { to, subject, messageId: info.messageId || null } };
    }
    // 2) Resend HTTP API bila ada key
    if (env.RESEND_API_KEY) {
        const fetchFn = ctx.fetch || fetch;
        const res = await fetchFn('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: env.RESEND_FROM || 'onboarding@resend.dev', to, subject, text: body })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Resend gagal (${res.status}): ${data.message || 'unknown'}`);
        return { ok: true, simulated: false, summary: `Email terkirim ke ${to} (Resend, id ${data.id || '-'}).`, data: { to, subject, messageId: data.id || null } };
    }
    // 3) Simulasi jujur (mode SANDBOX / tanpa kredensial)
    return {
        ok: true,
        simulated: true,
        summary: `SIMULASI email ke ${to} — belum terkirim. Isi SMTP_HOST/SMTP_USER/SMTP_PASS atau RESEND_API_KEY di .env untuk pengiriman asli.`,
        data: { to, subject, bodyPreview: String(body).slice(0, 300) }
    };
}

function execDocument(input) {
    const format = ['md', 'txt', 'html', 'csv'].includes(String(input.format || '').toLowerCase())
        ? String(input.format).toLowerCase() : 'md';
    const title = String(input.title).trim();
    let content = input.content ? String(input.content) : '';
    if (format === 'csv') {
        content = Array.isArray(input.rows) ? toCsv(input.rows) : content;
        if (!content) content = 'kolom1,kolom2\n';
    } else if (!content) {
        content = format === 'html'
            ? `<h1>${escapeXml(title)}</h1>\n<p></p>`
            : (format === 'md' ? `# ${title}\n\n` : `${title}\n\n`);
    } else if (format === 'html' && !/^\s*</.test(content)) {
        content = `<h1>${escapeXml(title)}</h1>\n<p>${escapeXml(content).replace(/\n/g, '<br>')}</p>`;
    }
    const mime = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', csv: 'text/csv' }[format];
    return {
        ok: true,
        simulated: false,
        summary: `Dokumen "${title}" dibuat (${format}, ${content.length} karakter). Unduh via GET /api/ai/jobs/:id/artifact.`,
        data: { title, format, chars: content.length },
        artifact: { filename: `${sanitizeFilename(title)}.${format}`, mime, content }
    };
}

function execSpreadsheet(input) {
    if (input.csv) {
        const analysis = analyzeCsv(String(input.csv));
        return {
            ok: true,
            simulated: false,
            summary: `CSV dianalisis: ${analysis.rowCount} baris, ${analysis.columns.length} kolom (${analysis.columns.join(', ')}).`,
            data: analysis
        };
    }
    const csv = toCsv(input.rows);
    return {
        ok: true,
        simulated: false,
        summary: `CSV dibuat dari ${input.rows.length} baris data. Unduh via GET /api/ai/jobs/:id/artifact.`,
        data: { rowCount: input.rows.length },
        artifact: { filename: 'data.csv', mime: 'text/csv', content: csv }
    };
}

function simulatedSvg(prompt) {
    const text = escapeXml(String(prompt).slice(0, 90));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">`
        + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
        + `<stop offset="0" stop-color="#0d9488"/><stop offset="1" stop-color="#1e3a5f"/></linearGradient></defs>`
        + `<rect width="1024" height="1024" fill="url(#g)"/>`
        + `<text x="512" y="492" font-family="sans-serif" font-size="34" fill="#ffffff" text-anchor="middle">SIMULASI GAMBAR</text>`
        + `<text x="512" y="542" font-family="sans-serif" font-size="24" fill="#d7f0ea" text-anchor="middle">${text}</text>`
        + `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function execImage(input, ctx) {
    const env = ctx.env || process.env;
    const apiKey = ctx.openAiKey || env.OPENAI_API_KEY || '';
    if (apiKey) {
        const fetchFn = ctx.fetch || fetch;
        const res = await fetchFn('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-image-1', prompt: String(input.prompt), size: input.size || '1024x1024' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`OpenAI Images gagal (${res.status}): ${data.error?.message || 'unknown'}`);
        const item = (data.data || [])[0] || {};
        return {
            ok: true,
            simulated: false,
            summary: 'Gambar dibuat via OpenAI Images.',
            data: { prompt: input.prompt, imageUrl: item.url || null, b64: item.b64_json ? '(base64 tersedia di respons API)' : null }
        };
    }
    return {
        ok: true,
        simulated: true,
        summary: 'SIMULASI gambar (placeholder SVG) — isi OPENAI_API_KEY di .env atau pakai provider LLM OpenAI untuk gambar asli.',
        data: { prompt: input.prompt, imageUrl: simulatedSvg(input.prompt) }
    };
}

async function execWhatsapp(input, ctx) {
    const env = ctx.env || process.env;
    if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
        const fetchFn = ctx.fetch || fetch;
        const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const res = await fetchFn(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: String(input.to).replace(/[^0-9]/g, ''),
                type: 'text',
                text: { body: String(input.message) }
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`WhatsApp API gagal (${res.status}): ${data.error?.message || 'unknown'}`);
        const msgId = data.messages?.[0]?.id || null;
        return { ok: true, simulated: false, summary: `WhatsApp terkirim ke ${input.to} (id ${msgId || '-'}).`, data: { to: input.to, messageId: msgId } };
    }
    return {
        ok: true,
        simulated: true,
        summary: `SIMULASI WhatsApp ke ${input.to} — belum terkirim. Isi WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID di .env untuk pengiriman asli.`,
        data: { to: input.to, messagePreview: String(input.message).slice(0, 300) }
    };
}

async function execGeneral(input, ctx) {
    if (ctx.llmText) {
        const prompt = [
            'Kamu karyawan AI Kantor PiK\'s Digital Lab. Kerjakan tugas berikut dengan konkret dan ringkas (Bahasa Indonesia).',
            'Jangan mengarang fakta bisnis/kredensial. Bila info kurang, sebutkan apa yang kurang di akhir.',
            'Balas HANYA JSON: {"result": "<hasil tugas>"}',
            '',
            `Tugas: ${input.instruction}`
        ].join('\n');
        const result = await ctx.llmText(prompt);
        if (result) {
            return { ok: true, simulated: false, summary: 'Tugas umum selesai via LLM.', data: { instruction: input.instruction, result } };
        }
    }
    return {
        ok: true,
        simulated: true,
        summary: 'SIMULASI tugas umum — LLM belum terkonfigurasi (Pengaturan → LLM / env API key), jadi baru rencana kerja yang dibuat.',
        data: {
            instruction: input.instruction,
            result: null,
            plan: [
                'Terima & klarifikasi instruksi (field kurang → needs_info).',
                'Pecah tugas per peran oleh Maya (Manager).',
                'Eksekusi + catat hasil di job ini.',
                'Konfigurasi LLM agar eksekusi berikutnya menghasilkan output asli.'
            ]
        }
    };
}

/**
 * Jalankan satu tugas umum.
 * @returns {Promise<{ok, simulated?, summary, data?, artifact?, missing?}>}
 */
async function executeTask(type, input, ctx = {}) {
    const def = getTaskType(type);
    if (!def) {
        return { ok: false, summary: `taskType tidak dikenal: ${type}`, missing: ['taskType'] };
    }
    const data = input && typeof input === 'object' ? input : {};
    const missing = missingFields(def.id, data);
    if (missing.length) {
        return { ok: false, summary: `Input tugas ${def.id} belum lengkap: ${missing.join(', ')}.`, missing };
    }
    switch (def.id) {
        case 'research': return execResearch(data, ctx);
        case 'email': return execEmail(data, ctx);
        case 'document': return execDocument(data);
        case 'spreadsheet': return execSpreadsheet(data);
        case 'image': return execImage(data, ctx);
        case 'whatsapp': return execWhatsapp(data, ctx);
        case 'general': return execGeneral(data, ctx);
        default: return { ok: false, summary: 'Executor tidak ditemukan.', missing: [] };
    }
}

module.exports = {
    TASK_TYPES,
    normalizeTaskType,
    getTaskType,
    listTaskTypes,
    missingFields,
    parseCsv,
    toCsv,
    analyzeCsv,
    stripHtml,
    executeTask
};
