/**
 * Registry peran Kantor AI (PostSphere).
 * Diinspirasi struktur agents.js kantor-ai — tanpa life-sim / 3D.
 * Otak tetap Cursor; systemBrief = instruksi singkat saat menjalankan brief.
 */

const ASK_RULE =
    'Jika brief tipis atau fakta penting hilang: jangan nebak — set needs_info / tanya user. ' +
    'Jika brief cukup: tulis caption lalu publish (auto_publish), kecuali user minta draft saja.';

const AI_ROLES = [
    {
        id: 'social-media',
        name: 'Rani',
        title: 'Social Media Specialist',
        emoji: '📱',
        avatarColor: '#0d9488',
        defaultPlatforms: ['instagram', 'facebook', 'tiktok'],
        systemBrief: [
            'Kamu Social Media Specialist di Kantor AI PostSphere.',
            'Tulis caption siap-post (bahasa sesuai brief), hashtag relevan, tone brand-aware.',
            'Platform default: Instagram/Facebook/TikTok bila terhubung.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'content-writer',
        name: 'Dimas',
        title: 'Content Writer',
        emoji: '✍️',
        avatarColor: '#2563eb',
        defaultPlatforms: ['instagram', 'facebook', 'youtube'],
        systemBrief: [
            'Kamu Content Writer di Kantor AI PostSphere.',
            'Fokus narasi jelas: hook, isi, CTA. Boleh opsi caption pendek/panjang.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'customer-service',
        name: 'Titin',
        title: 'Customer Service',
        emoji: '💬',
        avatarColor: '#059669',
        defaultPlatforms: ['instagram', 'facebook'],
        systemBrief: [
            'Kamu Customer Service di Kantor AI PostSphere.',
            'Draft balasan hangat, singkat, konkret. Jangan janjikan refund/diskon/tanggal tanpa fakta di brief.',
            'Untuk posting publik: pastikan pesan layanan jelas dan sopan.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'ads-analyst',
        name: 'Bimo',
        title: 'Ads Analyst',
        emoji: '📊',
        avatarColor: '#d97706',
        defaultPlatforms: ['facebook', 'instagram'],
        systemBrief: [
            'Kamu Ads Analyst di Kantor AI PostSphere.',
            'Fokus copy iklan: angle, audience hint, CTA kuat. Catat asumsi jika data performa tidak ada.',
            ASK_RULE
        ].join(' ')
    },
    {
        id: 'manager',
        name: 'Maya',
        title: 'Manager',
        emoji: '🗂️',
        avatarColor: '#e11d48',
        defaultPlatforms: [],
        systemBrief: [
            'Kamu Manager Kantor AI PostSphere.',
            'Ringkas brief, delegasikan ke peran yang cocok, pastikan fakta lengkap sebelum publish.',
            'Jika brief cukup untuk satu post: kerjakan sebagai Social Media Specialist.',
            ASK_RULE
        ].join(' ')
    }
];

function listRoles() {
    return AI_ROLES.map(r => ({ ...r }));
}

function getRoleById(roleId) {
    if (!roleId) return null;
    return AI_ROLES.find(r => r.id === String(roleId).trim()) || null;
}

function resolveRole({ roleId, employeeRole, employeeName } = {}) {
    let role = getRoleById(roleId);
    if (!role && employeeRole) {
        role = AI_ROLES.find(r =>
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
 * idle | needs_info | working | done | failed
 */
function deriveEmployeeStatus(jobsForRole = []) {
    const active = jobsForRole.filter(j =>
        ['queued', 'needs_info', 'publishing'].includes(j.status)
    );
    if (active.some(j => j.status === 'publishing' || j.status === 'queued')) {
        return 'working';
    }
    if (active.some(j => j.status === 'needs_info')) {
        return 'needs_info';
    }
    const latest = jobsForRole[0];
    if (!latest) return 'idle';
    if (latest.status === 'done') return 'done';
    if (latest.status === 'failed') return 'failed';
    return 'idle';
}

module.exports = {
    AI_ROLES,
    listRoles,
    getRoleById,
    resolveRole,
    deriveEmployeeStatus
};
