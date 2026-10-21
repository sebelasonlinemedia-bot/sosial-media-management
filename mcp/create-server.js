/**
 * MCP Server PiK's Digital Lab — definisi tool bersama untuk dua transport:
 *  - stdio lokal (mcp/server.js, dipakai Cursor/Claude Desktop di mesin ini)
 *  - Streamable HTTP di route /mcp (server.js, untuk production)
 *
 * Semua tool hanya meneruskan panggilan ke REST API aplikasi dengan
 * Authorization: Bearer <session token>, sehingga seluruh pagar yang sudah
 * ada tetap berlaku: auth & peran, emergencyPause, tingkat otonomi, gate
 * publish, dan penjaga versi basi (expectedVersion).
 * Token OAuth platform TIDAK pernah diekspos lewat tool mana pun.
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const MAX_TEXT = 12000;

function trimText(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '\n…(dipotong)' : text;
}

function toolResult(data) {
    return { content: [{ type: 'text', text: trimText(data) }] };
}

function toolError(err) {
    return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${err && err.message ? err.message : String(err)}` }]
    };
}

/** Ambil session token: pakai token langsung, atau login dengan email+password. */
async function resolveToken({ baseUrl, token, email, password } = {}) {
    if (token) return token;
    if (!email || !password) return null;
    const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.token) {
        throw new Error(`Login PiK's Digital Lab gagal: ${data.message || res.status}`);
    }
    return data.token;
}

function createPiksMcpServer({ baseUrl, token } = {}) {
    const root = String(baseUrl || 'http://localhost:3000').replace(/\/$/, '');

    async function api(path, { method = 'GET', body } = {}) {
        const res = await fetch(root + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
            throw new Error(data.message || `API ${res.status} pada ${path}`);
        }
        return data;
    }

    const server = new McpServer({ name: 'piks-digital-lab', version: '1.0.0' });
    const tool = (name, description, inputSchema, handler) => {
        server.registerTool(name, { description, inputSchema }, async (args) => {
            try {
                return toolResult(await handler(args || {}));
            } catch (err) {
                return toolError(err);
            }
        });
    };

    tool('office_context',
        'Konteks Kantor AI: daftar agen + statusnya, ringkasan work board, jumlah job, dan kebijakan otonomi. Panggil pertama sebelum bekerja.',
        {},
        async () => {
            const data = await api('/api/ai/office');
            return {
                office: data.office,
                policy: data.policy,
                emergencyPause: data.emergencyPause,
                employees: (data.employees || []).map(e => ({
                    id: e.id, name: e.name, title: e.title, status: e.status,
                    workload: e.workload, latestJob: e.latestJob
                })),
                jobCounts: data.jobCounts,
                board: Object.fromEntries(Object.entries(data.board || {}).map(([k, v]) => [k, (v || []).length]))
            };
        });

    tool('list_roles',
        'Daftar 7 peran Tim Konten AI (id, nama, title, output khas, platform bawaan).',
        {},
        async () => (await api('/api/ai/office/roles')).roles);

    tool('list_jobs',
        'Daftar job AI terbaru. Opsional filter roleId (manager, strategist, copywriter, visual-producer, community-manager, analyst, compliance).',
        { roleId: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
        async ({ roleId, limit }) => {
            const q = roleId ? `?roleId=${encodeURIComponent(roleId)}` : '';
            const data = await api(`/api/ai/jobs${q}`);
            return (data.jobs || []).slice(0, limit || 20).map(j => ({
                id: j.id, brief: (j.brief || '').slice(0, 160), status: j.status,
                roleId: j.roleId, employeeName: j.employeeName, version: j.version || 1,
                platforms: j.platforms || [], updatedAt: j.updatedAt
            }));
        });

    tool('get_job',
        'Detail satu job: brief, caption, status, riwayat draf per versi (draftHistory), dan catatan revisi yang belum dikerjakan.',
        { jobId: z.string() },
        async ({ jobId }) => (await api(`/api/ai/jobs/${encodeURIComponent(jobId)}`)).job);

    tool('create_job',
        'Buat job brief baru untuk agen. Brief tipis akan berstatus needs_info (agen bertanya, bukan menebak).',
        {
            brief: z.string().min(10),
            roleId: z.string(),
            platforms: z.array(z.string()).optional(),
            employeeName: z.string().optional()
        },
        async ({ brief, roleId, platforms, employeeName }) => {
            const data = await api('/api/ai/jobs', {
                method: 'POST',
                body: { brief, roleId, platforms: platforms || [], employeeName }
            });
            return { job: data.job, needsInfo: data.needsInfo, role: data.role };
        });

    tool('answer_job',
        'Jawab pertanyaan klarifikasi job needs_info; job kembali ke antrean (queued) dengan versi naik.',
        { jobId: z.string(), answers: z.array(z.string()).min(1) },
        async ({ jobId, answers }) => (await api(`/api/ai/jobs/${encodeURIComponent(jobId)}/answer`, {
            method: 'POST', body: { answers }
        })).job);

    tool('request_revision',
        'Minta revisi draf job (awaiting_approval/queued/failed): komentar wajib, draf lama tersimpan di riwayat, job kembali antre. expectedVersion melindungi dari versi basi.',
        { jobId: z.string(), note: z.string().min(3), expectedVersion: z.number().int().optional() },
        async ({ jobId, note, expectedVersion }) => (await api(`/api/ai/jobs/${encodeURIComponent(jobId)}/revision`, {
            method: 'POST', body: { note, expectedVersion }
        })).job);

    tool('approve_job',
        'Setujui job awaiting_approval. autoRun=true (bawaan API) langsung lanjut publish; kirim autoRun=false untuk hanya menyetujui. expectedVersion melindungi dari menyetujui draf yang sudah berubah.',
        { jobId: z.string(), expectedVersion: z.number().int().optional(), note: z.string().optional(), autoRun: z.boolean().optional() },
        async ({ jobId, expectedVersion, note, autoRun }) => {
            const data = await api(`/api/ai/jobs/${encodeURIComponent(jobId)}/approve`, {
                method: 'POST',
                body: { expectedVersion, note, autoRun: autoRun === true }
            });
            return data;
        });

    tool('run_job',
        'Jalankan job: kirim caption final untuk gate publish. Hasil bisa awaiting_approval (gate menahan), done, atau failed — baca field job/message pada hasil.',
        { jobId: z.string(), caption: z.string().optional(), platforms: z.array(z.string()).optional() },
        async ({ jobId, caption, platforms }) => api(`/api/ai/jobs/${encodeURIComponent(jobId)}/run`, {
            method: 'POST', body: { caption, platforms }
        }));

    tool('get_insights',
        'Insights performa + rekomendasi "apa berikutnya" untuk siklus brief Strategist.',
        {},
        async () => api('/api/ai/insights'));

    tool('list_accounts',
        'Akun sosmed terhubung (hanya platform, handle, nama, status — tanpa kredensial/token).',
        {},
        async () => {
            const data = await api('/api/accounts');
            return (data.accounts || []).map(a => ({
                platform: a.platform, handle: a.handle, name: a.name,
                connected: !!a.connected, sandbox: !!a.sandbox
            }));
        });

    /* ---- Tugas Umum Kantor AI (Fase A–D): di luar publish sosmed ---- */

    tool('list_task_types',
        'Katalog tugas umum Kantor AI: research (riset web), email, document, spreadsheet (CSV), image, whatsapp, general (LLM). Memuat peran bawaan, field wajib, dan apakah tugas bersifat keluar (butuh approval).',
        {},
        async () => api('/api/ai/task-types'));

    tool('create_task',
        'Buat job tugas umum (bukan publish sosmed). taskType dari list_task_types; input sesuai hint tiap tipe. Job dibuat queued; jalankan dengan execute_task. Brief opsional — bila kosong disintesis dari input.',
        {
            taskType: z.string(),
            input: z.record(z.string(), z.any()),
            brief: z.string().optional(),
            roleId: z.string().optional()
        },
        async ({ taskType, input, brief, roleId }) => api('/api/ai/jobs', {
            method: 'POST',
            body: { taskType, taskInput: input, brief, roleId }
        }));

    tool('execute_task',
        'Eksekusi job tugas umum. Tugas keluar (email/whatsapp) bisa berhenti di awaiting_approval sesuai otonomi — setujui dulu (approve_job autoRun=false) atau forceExecute khusus admin/approver atas izin user. Hasil di job.taskResult; dokumen/CSV diunduh via GET /api/ai/jobs/:id/artifact.',
        { jobId: z.string(), forceExecute: z.boolean().optional() },
        async ({ jobId, forceExecute }) => api(`/api/ai/jobs/${encodeURIComponent(jobId)}/execute`, {
            method: 'POST', body: { forceExecute: forceExecute === true }
        }));

    tool('research_web',
        'Riset web cepat (Rani): ambil maks 3 URL, ringkas via LLM bila terkonfigurasi. Membuat job research yang langsung dieksekusi; hasil ringkasan + kutipan sumber di job.taskResult.',
        { urls: z.array(z.string()).min(1).max(3), query: z.string().optional() },
        async ({ urls, query }) => api('/api/ai/research', {
            method: 'POST', body: { urls, query }
        }));

    /* ---- Bersih-bersih work board (admin/approver) ---- */

    tool('delete_job',
        'Hapus SATU job dari work board (admin/approver). Status working/publishing/awaiting_approval dilindungi server (409). Tidak bisa dibatalkan — pastikan user memang meminta job ini dihapus.',
        { jobId: z.string() },
        async ({ jobId }) => api(`/api/ai/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }));

    tool('cleanup_jobs',
        'Bersihkan work board secara massal (admin/approver). Bawaan menghapus job done+failed; onlyTest=true membatasi ke brief uji (test/uji/e2e/contoh.id); olderThanDays membatasi umur. Selalu panggil dryRun=true dulu, laporkan jumlahnya ke user, baru hapus setelah user setuju.',
        {
            statuses: z.array(z.enum(['done', 'posted', 'failed', 'needs_info', 'queued'])).optional(),
            onlyTest: z.boolean().optional(),
            olderThanDays: z.number().positive().optional(),
            dryRun: z.boolean().optional()
        },
        async (args) => api('/api/ai/jobs/cleanup', { method: 'POST', body: args || {} }));

    return server;
}

module.exports = { createPiksMcpServer, resolveToken };
