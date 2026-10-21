/**
 * Registry Departemen/Studio Kantor AI (konsep tenaga kerja per departemen,
 * adaptasi pola "AI workforce by department"): 10 departemen, tiap departemen
 * menaungi 0..n peran spesialis dari lib/ai-roles.js.
 *
 * Departemen tanpa spesialis tampil sebagai studio "segera hadir" — sengaja
 * tidak memaksakan agen baru agar layout kantor 3D & work board tetap stabil.
 * Akuntabilitas tetap pada manusia: departemen hanya struktur organisasi,
 * bukan pelonggaran gate/otonomi apa pun.
 */

const { listRoles } = require('./ai-roles');

const AI_DEPARTMENTS = [
    {
        id: 'operations',
        name: 'Operations',
        studio: 'Studio Operasi',
        emoji: '🗂️',
        color: '#e11d48',
        description: 'Orkestrasi kerja tim, pecah brief, monitor work board, dan eskalasi ke manusia.'
    },
    {
        id: 'marketing',
        name: 'Marketing',
        studio: 'Studio Marketing',
        emoji: '🎯',
        color: '#0d9488',
        description: 'Strategi konten, kalender, caption, dan kampanye lintas platform.'
    },
    {
        id: 'design',
        name: 'Design',
        studio: 'Studio Kreatif',
        emoji: '🎬',
        color: '#7c3aed',
        description: 'Brief visual, skrip video pendek, dan arahan kreatif.'
    },
    {
        id: 'support',
        name: 'Support',
        studio: 'Studio Community',
        emoji: '💬',
        color: '#059669',
        description: 'Balasan komentar/DM, sortir keluhan, dan eskalasi kasus sensitif.'
    },
    {
        id: 'data',
        name: 'Data',
        studio: 'Studio Analitik',
        emoji: '📊',
        color: '#d97706',
        description: 'Insights performa, analisis data, dan rekomendasi siklus berikutnya.'
    },
    {
        id: 'legal',
        name: 'Legal',
        studio: 'Studio Compliance',
        emoji: '🛡️',
        color: '#475569',
        description: 'QA klaim, kesesuaian brand, dan penjaga risiko sebelum publish.'
    },
    {
        id: 'sales',
        name: 'Sales',
        studio: 'Studio Sales',
        emoji: '🤝',
        color: '#0284c7',
        description: 'Workflow penjualan berulang: daftar prospek, follow-up, naskah penjualan.'
    },
    {
        id: 'finance',
        name: 'Finance',
        studio: 'Studio Finance',
        emoji: '💰',
        color: '#65a30d',
        description: 'Workflow pendukung keuangan: invoice, rekap, dan dokumen transaksi.'
    },
    {
        id: 'product',
        name: 'Product',
        studio: 'Studio Produk',
        emoji: '🧩',
        color: '#db2777',
        description: 'Riset produk, perencanaan fitur, dan ringkasan masukan pengguna.'
    },
    {
        id: 'people',
        name: 'People',
        studio: 'Studio People',
        emoji: '👥',
        color: '#9333ea',
        description: 'Operasional SDM: deskripsi kerja, agenda, dan dokumen people-ops.'
    }
];

function getDepartmentById(id) {
    return AI_DEPARTMENTS.find(d => d.id === id) || null;
}

/**
 * Pohon departemen → spesialis. Spesialis diambil dari registry peran
 * (field `department` tiap peran). Departemen kosong = comingSoon.
 */
function buildDepartmentTree(roles) {
    const all = Array.isArray(roles) ? roles : listRoles();
    return AI_DEPARTMENTS.map(dept => {
        const specialists = all
            .filter(r => r.department === dept.id)
            .map(r => ({
                id: r.id,
                name: r.name,
                title: r.title,
                emoji: r.emoji,
                avatarColor: r.avatarColor,
                outputs: r.outputs,
                defaultPlatforms: r.defaultPlatforms || []
            }));
        return { ...dept, specialists, comingSoon: specialists.length === 0 };
    });
}

function listDepartments() {
    return AI_DEPARTMENTS.map(d => ({ ...d }));
}

module.exports = {
    AI_DEPARTMENTS,
    getDepartmentById,
    buildDepartmentTree,
    listDepartments
};
