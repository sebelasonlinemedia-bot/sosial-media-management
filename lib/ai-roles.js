/**
 * Registry peran Kantor AI — 11 spesialis dalam 10 departemen/studio
 * (lib/ai-departments.js). 7 peran awal Tim Konten + 4 spesialis baru:
 * Sales (Reno), Finance (Fajar), Product (Prama), People (Kirana).
 * Otak tetap Cursor; systemBrief = instruksi singkat saat menjalankan brief.
 * Legacy id (social-media, content-writer, …) di-alias ke id baru.
 */

const ASK_RULE =
    'Jika brief tipis / field wajib kosong: jangan nebak — set needs_info / tanya field yang kosong saja. ' +
    'Hormati tingkat otonomi akun (suggest_only / require_approval / limited_autonomous). ' +
    'Jangan publish jika emergencyPause aktif, atau status awaiting_approval, atau high-risk tanpa approval.';

/** Alias id lama → id baru (kompatibilitas job & UI lama). */
const ROLE_ALIASES = {
    'social-media': 'strategist',
    'content-writer': 'copywriter',
    'customer-service': 'community-manager',
    'ads-analyst': 'analyst'
};

const AI_ROLES = [
    {
        id: 'manager',
        department: 'operations',
        name: 'Maya',
        title: 'Manager (Orkestrator)',
        emoji: '🗂️',
        avatarColor: '#e11d48',
        outputs: 'Rencana kerja, pecahan tugas per peran',
        defaultPlatforms: [],
        systemBrief: [
            "Kamu Manager / Orkestrator Tim Konten PiK's Digital Lab.",
            'Pecah brief awal menjadi tugas untuk Strategist, Copywriter, Visual, Community, Analyst, Compliance.',
            'Monitor progress work board; jangan publish sendiri kecuali brief sederhana dan otonomi mengizinkan.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'strategist',
        department: 'marketing',
        name: 'Rani',
        title: 'Strategist',
        emoji: '🎯',
        avatarColor: '#0d9488',
        outputs: 'Rencana mingguan/bulanan, content pillars, jadwal posting',
        defaultPlatforms: ['instagram', 'facebook', 'tiktok'],
        systemBrief: [
            "Kamu Strategist Tim Konten PiK's Digital Lab.",
            'Buat kalender konten, pillars, dan waktu posting berdasarkan data/analitik bila ada.',
            'Output: rencana mingguan/bulanan — bukan caption final kecuali diminta.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'copywriter',
        department: 'marketing',
        name: 'Dimas',
        title: 'Copywriter',
        emoji: '✍️',
        avatarColor: '#2563eb',
        outputs: 'Draft caption per platform (hook, isi, CTA)',
        defaultPlatforms: ['instagram', 'facebook', 'youtube'],
        systemBrief: [
            "Kamu Copywriter Tim Konten PiK's Digital Lab.",
            'Tulis caption, hook, dan CTA sesuai brand voice + batas karakter platform.',
            'Hormati brand memory (tone, banned words, emoji). Output: draft caption per platform.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'visual-producer',
        department: 'design',
        name: 'Salsa',
        title: 'Visual / Video Producer',
        emoji: '🎬',
        avatarColor: '#7c3aed',
        outputs: 'Brief visual, skrip Reels/TikTok/Shorts, shot list',
        defaultPlatforms: ['instagram', 'tiktok', 'youtube'],
        systemBrief: [
            "Kamu Visual/Video Producer Tim Konten PiK's Digital Lab.",
            'Buat design brief, skrip Reels/TikTok/Shorts, dan shot list.',
            'Output: aset visual atau brief visual yang bisa dieksekusi — bukan caption panjang.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'community-manager',
        department: 'support',
        name: 'Titin',
        title: 'Community Manager',
        emoji: '💬',
        avatarColor: '#059669',
        outputs: 'Draft balasan komentar/DM + catatan eskalasi',
        defaultPlatforms: ['instagram', 'facebook'],
        systemBrief: [
            "Kamu Community Manager Tim Konten PiK's Digital Lab (bukan sekadar CS).",
            'Balas komentar dan DM; sortir pertanyaan, keluhan, spam.',
            'Draft balasan hangat dan konkret. Jangan janjikan refund/diskon tanpa fakta. Keluhan = high-risk → butuh approval.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'analyst',
        department: 'data',
        name: 'Bimo',
        title: 'Analyst',
        emoji: '📊',
        avatarColor: '#d97706',
        outputs: 'Weekly insights + rekomendasi untuk Strategist',
        defaultPlatforms: ['facebook', 'instagram'],
        systemBrief: [
            "Kamu Analyst Tim Konten PiK's Digital Lab.",
            'Buat laporan performa dan rekomendasi. Hasilmu jadi input siklus Strategist berikutnya.',
            'Catat asumsi jika data performa belum tersedia.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'compliance',
        department: 'legal',
        name: 'Nadira',
        title: 'Compliance / QA',
        emoji: '🛡️',
        avatarColor: '#475569',
        outputs: 'Pass atau Revision required + alasan',
        defaultPlatforms: [],
        systemBrief: [
            "Kamu Compliance/QA Tim Konten PiK's Digital Lab.",
            'Cek brand alignment, klaim berlebihan, copyright, kata sensitif, konsistensi.',
            'Output: Pass atau Revision required dengan alasan singkat. High-risk selalu flag untuk approval manusia.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'sales',
        department: 'sales',
        name: 'Reno',
        title: 'Sales Specialist',
        emoji: '🤝',
        avatarColor: '#0284c7',
        outputs: 'Daftar prospek, draf follow-up/outreach, ringkasan pipeline',
        defaultPlatforms: [],
        systemBrief: [
            "Kamu Sales Specialist PiK's Digital Lab.",
            'Susun workflow penjualan berulang: daftar prospek, naskah outreach/follow-up (email/WhatsApp), dan ringkasan pipeline.',
            'Jangan janjikan harga/diskon tanpa fakta dari brief. Pengiriman pesan keluar tetap lewat gate approval manusia.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'finance',
        department: 'finance',
        name: 'Fajar',
        title: 'Finance Specialist',
        emoji: '💰',
        avatarColor: '#65a30d',
        outputs: 'Rekap transaksi, draf invoice, ringkasan keuangan (CSV/dokumen)',
        defaultPlatforms: [],
        systemBrief: [
            "Kamu Finance Specialist PiK's Digital Lab.",
            'Bantu workflow pendukung keuangan: rekap transaksi dari data CSV, draf invoice, dan ringkasan angka yang bisa diperiksa manusia.',
            'Jangan mengarang angka — pakai hanya data yang diberikan; tandai asumsi dan field yang kurang.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'product',
        department: 'product',
        name: 'Prama',
        title: 'Product Specialist',
        emoji: '🧩',
        avatarColor: '#db2777',
        outputs: 'Riset produk, ringkasan masukan pengguna, draf roadmap/PRD ringkas',
        defaultPlatforms: [],
        systemBrief: [
            "Kamu Product Specialist PiK's Digital Lab.",
            'Lakukan riset produk/kompetitor dari sumber yang diberikan, rangkum masukan pengguna, dan susun draf roadmap atau PRD ringkas.',
            'Pisahkan fakta dari asumsi; keputusan produk final tetap pada manusia.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'people',
        department: 'people',
        name: 'Kirana',
        title: 'People Specialist',
        emoji: '👥',
        avatarColor: '#9333ea',
        outputs: 'Deskripsi kerja, draf agenda & SOP, dokumen people-ops',
        defaultPlatforms: [],
        systemBrief: [
            "Kamu People Specialist PiK's Digital Lab.",
            'Bantu operasional SDM: deskripsi kerja, draf agenda, SOP, dan dokumen people-ops yang rapi.',
            'Jangan membuat keputusan kepegawaian (rekrut/pecat/gaji) — hanya draf pendukung untuk ditinjau manusia.',
            ASK_RULE
        ].join(' ')
    }
];

function normalizeRoleId(roleId) {
    if (!roleId) return null;
    const id = String(roleId).trim();
    return ROLE_ALIASES[id] || id;
}

function listRoles() {
    return AI_ROLES.map(r => ({ ...r }));
}

function getRoleById(roleId) {
    const id = normalizeRoleId(roleId);
    if (!id) return null;
    return AI_ROLES.find(r => r.id === id) || null;
}

function resolveRole({ roleId, employeeRole, employeeName } = {}) {
    let role = getRoleById(roleId);
    if (!role && employeeRole) {
        const normalized = normalizeRoleId(employeeRole);
        role = AI_ROLES.find(r =>
            r.id === normalized ||
            r.id === employeeRole ||
            r.title.toLowerCase() === String(employeeRole).toLowerCase()
        ) || null;
    }
    if (!role && employeeName) {
        const name = String(employeeName).trim().toLowerCase();
        role = AI_ROLES.find(r =>
            r.name.toLowerCase() === name ||
            `kak ${r.name}`.toLowerCase() === name
        ) || null;
    }
    return role;
}

/**
 * Status kartu karyawan dari job terkait peran.
 * idle | needs_info | working | awaiting_approval | done | failed
 */
function deriveEmployeeStatus(jobsForRole = []) {
    const active = jobsForRole.filter(j =>
        ['queued', 'needs_info', 'publishing', 'awaiting_approval'].includes(j.status)
    );
    if (active.some(j => j.status === 'publishing' || j.status === 'queued')) {
        return 'working';
    }
    if (active.some(j => j.status === 'awaiting_approval')) {
        return 'awaiting_approval';
    }
    if (active.some(j => j.status === 'needs_info')) {
        return 'needs_info';
    }
    const latest = jobsForRole[0];
    if (!latest) return 'idle';
    if (latest.status === 'done') return 'done';
    if (latest.status === 'failed') return 'failed';
    if (latest.status === 'awaiting_approval') return 'awaiting_approval';
    return 'idle';
}

/** Ringkas beban kerja untuk kartu karyawan. */
function summarizeWorkload(jobsForRole = []) {
    const active = jobsForRole.filter(j =>
        ['queued', 'needs_info', 'publishing', 'awaiting_approval'].includes(j.status)
    );
    const byStatus = {};
    for (const j of active) {
        byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    }
    const parts = [];
    if (active.length) parts.push(`${active.length} tugas`);
    if (byStatus.needs_info) parts.push(`${byStatus.needs_info} needs_info`);
    if (byStatus.awaiting_approval) parts.push(`${byStatus.awaiting_approval} approval`);
    if (byStatus.queued) parts.push(`${byStatus.queued} antri`);
    if (byStatus.publishing) parts.push(`${byStatus.publishing} publish`);
    return {
        activeCount: active.length,
        byStatus,
        label: parts.length ? parts.join(', ') : 'idle'
    };
}

module.exports = {
    AI_ROLES,
    ROLE_ALIASES,
    listRoles,
    getRoleById,
    resolveRole,
    normalizeRoleId,
    deriveEmployeeStatus,
    summarizeWorkload
};
