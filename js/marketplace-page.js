/**
 * Halaman Pasar — marketplace rekrut karyawan AI PiK's Digital Lab.
 * Penempatan departemen bersifat custom: user memilih departemen tujuan
 * (10 departemen bawaan + departemen baru buatan user).
 * Persistensi: localStorage `piks-marketplace-v1` (tidak ada endpoint settings
 * yang cocok; PUT /api/ai/settings tidak menerima field ini, dan skema DB
 * tidak diubah). Data peran/departemen dimuat dari API bila tersedia,
 * dengan data cadangan lokal yang sama dengan lib/ai-roles.js & ai-departments.js.
 */
(function () {
    const STORAGE_KEY = 'piks-marketplace-v1';

    const FALLBACK_DEPARTMENTS = [
        { id: 'operations', name: 'Operations', studio: 'Studio Operasi', emoji: '🗂️', color: '#e11d48', description: 'Orkestrasi kerja tim, pecah brief, monitor work board, dan eskalasi ke manusia.' },
        { id: 'marketing', name: 'Marketing', studio: 'Studio Marketing', emoji: '🎯', color: '#0d9488', description: 'Strategi konten, kalender, caption, dan kampanye lintas platform.' },
        { id: 'design', name: 'Design', studio: 'Studio Kreatif', emoji: '🎬', color: '#7c3aed', description: 'Brief visual, skrip video pendek, dan arahan kreatif.' },
        { id: 'support', name: 'Support', studio: 'Studio Community', emoji: '💬', color: '#059669', description: 'Balasan komentar/DM, sortir keluhan, dan eskalasi kasus sensitif.' },
        { id: 'data', name: 'Data', studio: 'Studio Analitik', emoji: '📊', color: '#d97706', description: 'Insights performa, analisis data, dan rekomendasi siklus berikutnya.' },
        { id: 'legal', name: 'Legal', studio: 'Studio Compliance', emoji: '🛡️', color: '#475569', description: 'QA klaim, kesesuaian brand, dan penjaga risiko sebelum publish.' },
        { id: 'sales', name: 'Sales', studio: 'Studio Sales', emoji: '🤝', color: '#0284c7', description: 'Workflow penjualan berulang: daftar prospek, follow-up, naskah penjualan.' },
        { id: 'finance', name: 'Finance', studio: 'Studio Finance', emoji: '💰', color: '#65a30d', description: 'Workflow pendukung keuangan: invoice, rekap, dan dokumen transaksi.' },
        { id: 'product', name: 'Product', studio: 'Studio Produk', emoji: '🧩', color: '#db2777', description: 'Riset produk, perencanaan fitur, dan ringkasan masukan pengguna.' },
        { id: 'people', name: 'People', studio: 'Studio People', emoji: '👥', color: '#9333ea', description: 'Operasional SDM: deskripsi kerja, agenda, dan dokumen people-ops.' }
    ];

    const FALLBACK_ROLES = [
        { id: 'manager', department: 'operations', name: 'Maya', title: 'Manager (Orkestrator)', emoji: '🗂️', avatarColor: '#e11d48', outputs: 'Rencana kerja, pecahan tugas per peran', defaultPlatforms: [] },
        { id: 'strategist', department: 'marketing', name: 'Rani', title: 'Strategist', emoji: '🎯', avatarColor: '#0d9488', outputs: 'Rencana mingguan/bulanan, content pillars, jadwal posting', defaultPlatforms: ['instagram', 'facebook', 'tiktok'] },
        { id: 'copywriter', department: 'marketing', name: 'Dimas', title: 'Copywriter', emoji: '✍️', avatarColor: '#2563eb', outputs: 'Draft caption per platform (hook, isi, CTA)', defaultPlatforms: ['instagram', 'facebook', 'youtube'] },
        { id: 'visual-producer', department: 'design', name: 'Salsa', title: 'Visual / Video Producer', emoji: '🎬', avatarColor: '#7c3aed', outputs: 'Brief visual, skrip Reels/TikTok/Shorts, shot list', defaultPlatforms: ['instagram', 'tiktok', 'youtube'] },
        { id: 'community-manager', department: 'support', name: 'Titin', title: 'Community Manager', emoji: '💬', avatarColor: '#059669', outputs: 'Draft balasan komentar/DM + catatan eskalasi', defaultPlatforms: ['instagram', 'facebook'] },
        { id: 'analyst', department: 'data', name: 'Bimo', title: 'Analyst', emoji: '📊', avatarColor: '#d97706', outputs: 'Weekly insights + rekomendasi untuk Strategist', defaultPlatforms: ['facebook', 'instagram'] },
        { id: 'compliance', department: 'legal', name: 'Nadira', title: 'Compliance / QA', emoji: '🛡️', avatarColor: '#475569', outputs: 'Pass atau Revision required + alasan', defaultPlatforms: [] },
        { id: 'sales', department: 'sales', name: 'Reno', title: 'Sales Specialist', emoji: '🤝', avatarColor: '#0284c7', outputs: 'Daftar prospek, draf follow-up/outreach, ringkasan pipeline', defaultPlatforms: [] },
        { id: 'finance', department: 'finance', name: 'Fajar', title: 'Finance Specialist', emoji: '💰', avatarColor: '#65a30d', outputs: 'Rekap transaksi, draf invoice, ringkasan keuangan (CSV/dokumen)', defaultPlatforms: [] },
        { id: 'product', department: 'product', name: 'Prama', title: 'Product Specialist', emoji: '🧩', avatarColor: '#db2777', outputs: 'Riset produk, ringkasan masukan pengguna, draf roadmap/PRD ringkas', defaultPlatforms: [] },
        { id: 'people', department: 'people', name: 'Kirana', title: 'People Specialist', emoji: '👥', avatarColor: '#9333ea', outputs: 'Deskripsi kerja, draf agenda & SOP, dokumen people-ops', defaultPlatforms: [] }
    ];

    const TEAM = {
        id: 'tim-konten',
        name: 'Tim Konten',
        description: 'Tim inti PiK\'s Digital Lab untuk produksi konten sosial media ujung ke ujung: dari strategi, caption, visual, interaksi komunitas, analitik, sampai pemeriksaan kepatuhan sebelum terbit.',
        memberIds: ['manager', 'strategist', 'copywriter', 'visual-producer', 'community-manager', 'analyst', 'compliance'],
        capabilities: [
            'Strategi & kalender konten mingguan',
            'Caption, hook, dan CTA per platform',
            'Brief visual & skrip video pendek',
            'Balasan komentar dan DM komunitas',
            'Analisis performa & rekomendasi',
            'Pemeriksaan brand, klaim & kepatuhan',
            'Orkestrasi brief & pembagian tugas',
            'Pendampingan persetujuan sebelum terbit'
        ]
    };

    const PLATFORM_LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

    const state = {
        bound: false,
        app: null,
        tab: 'all', // all | employees | teams
        query: '',
        deptFilter: 'all',
        statusFilter: 'all', // all | recruited | available
        roles: FALLBACK_ROLES.map(r => ({ ...r })),
        departments: FALLBACK_DEPARTMENTS.map(d => ({ ...d })),
        placements: {}, // roleId -> deptId
        customDepts: [],
        desks: {}, // roleId -> nomor meja (milik halaman Organisasi; dipertahankan)
        orgUnplaced: [], // roleId yang dilepas penempatannya (milik halaman Organisasi)
        activity: [], // { text, time }
        pendingRoleId: null,
        pendingDeptId: null
    };

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved && typeof saved === 'object') {
                state.placements = saved.placements && typeof saved.placements === 'object' ? saved.placements : {};
                state.customDepts = Array.isArray(saved.customDepts) ? saved.customDepts : [];
                state.activity = Array.isArray(saved.activity) ? saved.activity : [];
                // Bidang milik halaman Organisasi — dipertahankan apa adanya agar tidak terhapus.
                state.desks = saved.desks && typeof saved.desks === 'object' ? saved.desks : {};
                state.orgUnplaced = Array.isArray(saved.orgUnplaced) ? saved.orgUnplaced : [];
            }
        } catch (_) { /* abaikan data rusak */ }
    }
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                placements: state.placements,
                customDepts: state.customDepts,
                activity: state.activity.slice(0, 20),
                desks: state.desks || {},
                orgUnplaced: state.orgUnplaced || []
            }));
        } catch (_) { /* penyimpanan tidak tersedia */ }
    }
    function logActivity(text) {
        state.activity.unshift({ text, time: new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) });
        state.activity = state.activity.slice(0, 20);
    }

    function allDepartments() { return state.departments.concat(state.customDepts); }
    function deptById(id) { return allDepartments().find(d => d.id === id) || null; }
    function roleById(id) { return state.roles.find(r => r.id === id) || null; }
    function placedDept(role) { return state.placements[role.id] ? deptById(state.placements[role.id]) : null; }
    function deptCount(deptId) { return state.roles.filter(r => state.placements[r.id] === deptId).length; }

    function matches(role) {
        const q = state.query.trim().toLowerCase();
        if (q) {
            const origin = deptById(role.department);
            const placed = placedDept(role);
            const hay = [role.name, role.title, role.outputs, origin && origin.name, origin && origin.studio, placed && placed.name].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (state.deptFilter !== 'all') {
            const effective = state.placements[role.id] || role.department;
            if (effective !== state.deptFilter) return false;
        }
        if (state.statusFilter === 'recruited' && !state.placements[role.id]) return false;
        if (state.statusFilter === 'available' && state.placements[role.id]) return false;
        return true;
    }
    function teamMatches() {
        const q = state.query.trim().toLowerCase();
        if (!q) return true;
        return (TEAM.name + ' ' + TEAM.description + ' ' + TEAM.capabilities.join(' ')).toLowerCase().includes(q);
    }

    function avatar(role, cls) {
        return `<span class="mkt-avatar ${cls || ''}" style="background:${esc(role.avatarColor || '#475569')}" aria-hidden="true">${esc((role.name || '?').charAt(0))}</span>`;
    }

    function renderSidebar() {
        const box = el('mkt-depts');
        if (!box) return;
        box.innerHTML = allDepartments().map(d => {
            const count = deptCount(d.id);
            const active = state.deptFilter === d.id;
            return `<button type="button" class="mkt-dept${active ? ' is-active' : ''}" data-mkt-dept="${esc(d.id)}" title="${esc(d.description || '')}">
                <span class="mkt-dept-dot" style="background:${esc(d.color || '#64748b')}"></span>
                <span class="mkt-dept-text"><strong>${esc(d.studio || d.name)}</strong><span>${esc(d.name)}</span></span>
                <em>${count}</em>
            </button>`;
        }).join('');
        const total = el('mkt-recruited-total');
        if (total) total.textContent = String(Object.keys(state.placements).length);
    }

    function renderTeamCard() {
        const box = el('mkt-team-card');
        if (!box) return;
        const show = (state.tab === 'all' || state.tab === 'teams') && teamMatches();
        box.classList.toggle('hidden', !show);
        if (!show) return;
        const members = TEAM.memberIds.map(roleById).filter(Boolean);
        const recruited = members.filter(r => state.placements[r.id]).length;
        box.innerHTML = `
            <div class="mkt-team-main">
                <p class="mkt-kicker">Tim Unggulan</p>
                <h3>${esc(TEAM.name)}</h3>
                <p class="mkt-team-desc">${esc(TEAM.description)}</p>
                <div class="mkt-caps">
                    ${TEAM.capabilities.map(c => `<span><i data-lucide="check"></i>${esc(c)}</span>`).join('')}
                </div>
                <div class="mkt-team-actions">
                    <button type="button" class="btn btn-primary" data-mkt-recruit-team><i data-lucide="users"></i> Rekrut Tim</button>
                    <span class="mkt-team-status">${recruited}/${members.length} anggota sudah direkrut</span>
                </div>
            </div>
            <div class="mkt-team-members" aria-label="Anggota ${esc(TEAM.name)}">
                ${members.map(r => `<span class="mkt-cluster" title="${esc(r.name)} — ${esc(r.title)}">${avatar(r)}<span>${esc(r.name)}</span></span>`).join('')}
            </div>`;
        icons();
    }

    function renderEmployees() {
        const box = el('mkt-employees');
        if (!box) return;
        const showSection = state.tab === 'all' || state.tab === 'employees';
        const section = el('mkt-employees-section');
        if (section) section.classList.toggle('hidden', !showSection);
        if (!showSection) return;
        const list = state.roles.filter(matches);
        box.innerHTML = list.length ? list.map(role => {
            const origin = deptById(role.department);
            const placed = placedDept(role);
            return `<article class="mkt-card${placed ? ' is-recruited' : ''}">
                <div class="mkt-card-head">${avatar(role, 'mkt-avatar-lg')}<div><h4>${esc(role.name)}</h4><p>${esc(role.title)}</p></div>${role.emoji ? `<span class="mkt-emoji" aria-hidden="true">${esc(role.emoji)}</span>` : ''}</div>
                <p class="mkt-card-out">${esc(role.outputs || '')}</p>
                <p class="mkt-card-dept">Departemen asal: <strong>${esc(origin ? (origin.studio || origin.name) : '-')}</strong></p>
                ${placed ? `<p class="mkt-badge"><i data-lucide="badge-check"></i> Direkrut · ${esc(placed.studio || placed.name)}</p>` : ''}
                <div class="mkt-card-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-mkt-interview="${esc(role.id)}"><i data-lucide="messages-square"></i> Wawancara</button>
                    <button type="button" class="btn ${placed ? 'btn-secondary' : 'btn-primary'} btn-sm" data-mkt-recruit="${esc(role.id)}"><i data-lucide="${placed ? 'settings-2' : 'user-plus'}"></i> ${placed ? 'Atur' : 'Rekrut'}</button>
                </div>
            </article>`;
        }).join('') : '<p class="mkt-empty">Tidak ada karyawan yang cocok dengan pencarian/filter ini.</p>';
        icons();
    }

    function renderActivity() {
        const box = el('mkt-activity');
        if (!box) return;
        box.innerHTML = state.activity.length
            ? state.activity.map(a => `<div class="mkt-act-item"><i data-lucide="activity"></i><div><p>${esc(a.text)}</p><time>${esc(a.time)}</time></div></div>`).join('')
            : '<p class="mkt-empty">Belum ada aktivitas</p>';
        icons();
    }

    function renderCount() {
        const countEl = el('mkt-result-count');
        if (!countEl) return;
        const emp = state.tab === 'teams' ? 0 : state.roles.filter(matches).length;
        const team = (state.tab === 'employees' || !teamMatches()) ? 0 : 1;
        const total = (state.tab === 'all' ? emp + team : state.tab === 'teams' ? team : emp);
        countEl.textContent = `${total} hasil`;
    }

    function render() { renderSidebar(); renderTeamCard(); renderEmployees(); renderActivity(); renderCount(); icons(); }

    /* ---------- Modal ---------- */
    function openModal(html) {
        const root = el('mkt-modal-root');
        if (!root) return;
        root.innerHTML = `<div class="mkt-modal-backdrop" data-mkt-close></div><div class="mkt-modal" role="dialog" aria-modal="true">${html}</div>`;
        root.classList.remove('hidden');
        icons();
    }
    function closeModal() {
        const root = el('mkt-modal-root');
        if (root) { root.classList.add('hidden'); root.innerHTML = ''; }
        state.pendingRoleId = null; state.pendingDeptId = null;
    }

    function deptOptionsHtml(selectedId) {
        return allDepartments().map(d => {
            const count = deptCount(d.id);
            return `<button type="button" class="mkt-dept-option${d.id === selectedId ? ' is-selected' : ''}" data-mkt-pick-dept="${esc(d.id)}">
                <span class="mkt-dept-dot" style="background:${esc(d.color || '#64748b')}"></span>
                <span class="mkt-dept-text"><strong>${esc(d.studio || d.name)}</strong><span>${count} karyawan ditempatkan</span></span>
                ${d.id === selectedId ? '<i data-lucide="check"></i>' : ''}
            </button>`;
        }).join('');
    }

    function openRecruit(roleId) {
        const role = roleById(roleId);
        if (!role) return;
        state.pendingRoleId = roleId;
        state.pendingDeptId = state.placements[roleId] || role.department;
        const placed = placedDept(role);
        openModal(`
            <div class="mkt-modal-head"><h3>${placed ? 'Atur Penempatan' : 'Rekrut'} ${esc(role.name)}</h3><button type="button" class="mkt-icon-btn" data-mkt-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
            <p class="mkt-modal-sub">${esc(role.title)} — pilih departemen tujuan penempatan. Penempatan ini custom dan bisa diubah kapan saja lewat tombol Atur.</p>
            <div class="mkt-dept-options">${deptOptionsHtml(state.pendingDeptId)}</div>
            <div class="mkt-new-dept">
                <input type="text" id="mkt-new-dept-name" class="form-control" placeholder="Nama departemen baru (mis. Studio Podcast)" aria-label="Nama departemen baru">
                <button type="button" class="btn btn-secondary btn-sm" data-mkt-add-dept data-mkt-add-for="recruit"><i data-lucide="plus"></i> Buat &amp; Pilih</button>
            </div>
            <div class="mkt-modal-actions">
                ${placed ? '<button type="button" class="btn btn-secondary" data-mkt-unrecruit><i data-lucide="user-x"></i> Lepas dari Departemen</button>' : ''}
                <button type="button" class="btn btn-primary" data-mkt-confirm-recruit><i data-lucide="check"></i> ${placed ? 'Simpan Penempatan' : 'Rekrut ke Departemen Ini'}</button>
            </div>`);
    }

    function openRecruitTeam() {
        state.pendingRoleId = '__team__';
        state.pendingDeptId = '__each__';
        const members = TEAM.memberIds.map(roleById).filter(Boolean);
        openModal(`
            <div class="mkt-modal-head"><h3>Rekrut ${esc(TEAM.name)}</h3><button type="button" class="mkt-icon-btn" data-mkt-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
            <p class="mkt-modal-sub">Rekrut ${members.length} anggota sekaligus: ${members.map(r => esc(r.name)).join(', ')}. Pilih cara penempatannya.</p>
            <div class="mkt-dept-options">
                <button type="button" class="mkt-dept-option is-selected" data-mkt-pick-dept="__each__">
                    <span class="mkt-dept-dot" style="background:#14b8a6"></span>
                    <span class="mkt-dept-text"><strong>Departemen masing-masing</strong><span>Tiap anggota ke departemen asalnya (disarankan)</span></span>
                    <i data-lucide="check"></i>
                </button>
                ${deptOptionsHtml('')}
            </div>
            <div class="mkt-new-dept">
                <input type="text" id="mkt-new-dept-name" class="form-control" placeholder="Nama departemen baru untuk satu tim" aria-label="Nama departemen baru">
                <button type="button" class="btn btn-secondary btn-sm" data-mkt-add-dept data-mkt-add-for="team"><i data-lucide="plus"></i> Buat &amp; Pilih</button>
            </div>
            <div class="mkt-modal-actions">
                <button type="button" class="btn btn-primary" data-mkt-confirm-team><i data-lucide="users"></i> Rekrut Tim</button>
            </div>`);
        // deptOptionsHtml menandai tidak ada yang terpilih; perbaiki penanda opsi __each__ tetap.
    }

    function openInterview(roleId) {
        const role = roleById(roleId);
        if (!role) return;
        const origin = deptById(role.department);
        const placed = placedDept(role);
        const platforms = (role.defaultPlatforms || []).map(p => PLATFORM_LABEL[p] || p);
        openModal(`
            <div class="mkt-modal-head"><h3>Wawancara — ${esc(role.name)}</h3><button type="button" class="mkt-icon-btn" data-mkt-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
            <div class="mkt-interview-head">${avatar(role, 'mkt-avatar-lg')}<div><strong>${esc(role.name)}</strong><p>${esc(role.title)}</p></div></div>
            <div class="mkt-interview-grid">
                <div><p class="mkt-kicker">Tanggung jawab &amp; output</p><p>${esc(role.outputs || '-')}</p></div>
                <div><p class="mkt-kicker">Departemen asal</p><p>${esc(origin ? `${origin.studio} (${origin.name})` : '-')}</p></div>
                <div><p class="mkt-kicker">Platform utama</p><p>${platforms.length ? esc(platforms.join(', ')) : 'Tidak terikat platform tertentu'}</p></div>
                <div><p class="mkt-kicker">Status rekrut</p><p>${placed ? `Direkrut · ${esc(placed.studio || placed.name)}` : 'Belum direkrut'}</p></div>
            </div>
            <div class="mkt-chat">
                <p><strong>${esc(role.name)}:</strong> Halo! Saya ${esc(role.name)}, ${esc(role.title)} di PiK's Digital Lab. Output utama saya: ${esc(role.outputs || '-')}. Beri saya brief yang jelas, lalu saya kerjakan sesuai aturan persetujuan yang berlaku.</p>
            </div>
            <div class="mkt-modal-actions">
                <button type="button" class="btn btn-secondary" data-mkt-goto-office><i data-lucide="messages-square"></i> Beri Brief di Kantor AI</button>
                <button type="button" class="btn btn-primary" data-mkt-recruit="${esc(role.id)}"><i data-lucide="user-plus"></i> ${placed ? 'Atur Penempatan' : 'Rekrut ' + esc(role.name)}</button>
            </div>`);
    }

    function openAddDepartment() {
        openModal(`
            <div class="mkt-modal-head"><h3>Tambah Departemen</h3><button type="button" class="mkt-icon-btn" data-mkt-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
            <p class="mkt-modal-sub">Departemen baru tampil di sidebar kiri dan bisa dipilih sebagai tujuan penempatan karyawan.</p>
            <div class="mkt-new-dept mkt-new-dept-solo">
                <input type="text" id="mkt-new-dept-name" class="form-control" placeholder="Nama departemen (mis. Studio Podcast)" aria-label="Nama departemen baru">
                <button type="button" class="btn btn-primary btn-sm" data-mkt-add-dept data-mkt-add-for="solo"><i data-lucide="plus"></i> Tambah Departemen</button>
            </div>`);
        const input = el('mkt-new-dept-name');
        if (input) input.focus();
    }

    function addDepartment(from) {
        const input = el('mkt-new-dept-name');
        const name = input ? input.value.trim() : '';
        if (!name) { if (input) input.focus(); return null; }
        const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
        const dept = { id, name, studio: name, emoji: '🏢', color: '#f59e0b', description: 'Departemen custom buatan user.' };
        state.customDepts.push(dept);
        logActivity(`Departemen baru dibuat: ${name}`);
        save();
        if (from === 'solo') { closeModal(); render(); }
        else if (state.pendingRoleId === '__team__') {
            openRecruitTeam();
            state.pendingDeptId = id;
            document.querySelectorAll('[data-mkt-pick-dept]').forEach(b => b.classList.toggle('is-selected', b.getAttribute('data-mkt-pick-dept') === id));
            icons(); render();
        } else if (state.pendingRoleId) {
            const rid = state.pendingRoleId;
            openRecruit(rid);
            state.pendingDeptId = id;
            const box = document.querySelector('.mkt-dept-options');
            if (box) { box.innerHTML = deptOptionsHtml(id); icons(); }
            render();
        } else { render(); }
        return dept;
    }

    function confirmRecruit() {
        const role = roleById(state.pendingRoleId);
        if (!role || !state.pendingDeptId) return;
        const dept = deptById(state.pendingDeptId);
        const was = state.placements[role.id];
        state.placements[role.id] = state.pendingDeptId;
        logActivity(was && was !== state.pendingDeptId
            ? `${role.name} dipindahkan ke ${dept ? dept.studio : state.pendingDeptId}`
            : `${role.name} direkrut ke ${dept ? dept.studio : state.pendingDeptId}`);
        save(); closeModal(); render();
    }

    function confirmTeam() {
        const members = TEAM.memberIds.map(roleById).filter(Boolean);
        const mode = state.pendingDeptId;
        let changed = 0;
        members.forEach(r => {
            const target = (!mode || mode === '__each__') ? r.department : mode;
            if (state.placements[r.id] !== target) changed++;
            state.placements[r.id] = target;
        });
        const targetLabel = (!mode || mode === '__each__') ? 'departemen masing-masing' : ((deptById(mode) || {}).studio || mode);
        logActivity(`Tim Konten direkrut (${members.length} anggota) ke ${targetLabel}`);
        save(); closeModal(); render();
        // ringkasan singkat terlihat di panel aktivitas + judul status tim
    }

    async function syncFromApi() {
        if (typeof api === 'undefined' || !api.get) return;
        try {
            const [rolesData, deptData] = await Promise.all([
                api.get('/api/ai/office/roles').catch(() => null),
                api.get('/api/ai/departments').catch(() => null)
            ]);
            if (rolesData && Array.isArray(rolesData.roles) && rolesData.roles.length) {
                state.roles = rolesData.roles.map(r => ({
                    id: r.id, department: r.department, name: r.name, title: r.title,
                    emoji: r.emoji, avatarColor: r.avatarColor, outputs: r.outputs,
                    defaultPlatforms: r.defaultPlatforms || []
                }));
            }
            if (deptData && Array.isArray(deptData.departments) && deptData.departments.length) {
                state.departments = deptData.departments.map(d => ({
                    id: d.id, name: d.name, studio: d.studio, emoji: d.emoji, color: d.color, description: d.description
                }));
            }
            syncFilterUi();
            render();
        } catch (_) { /* data cadangan tetap dipakai */ }
    }

    function bind(app) {
        if (state.bound) return;
        state.bound = true;
        state.app = app;
        load();
        const root = el('view-marketplace');
        if (!root) return;

        root.addEventListener('click', (event) => {
            const tab = event.target.closest('[data-mkt-tab]');
            if (tab) {
                state.tab = tab.getAttribute('data-mkt-tab') || 'all';
                root.querySelectorAll('[data-mkt-tab]').forEach(b => {
                    const on = b.getAttribute('data-mkt-tab') === state.tab;
                    b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                render(); return;
            }
            const deptBtn = event.target.closest('[data-mkt-dept]');
            if (deptBtn) {
                const id = deptBtn.getAttribute('data-mkt-dept');
                state.deptFilter = state.deptFilter === id ? 'all' : id;
                syncFilterUi(); render(); return;
            }
            if (event.target.closest('[data-mkt-add-dept-open]')) { openAddDepartment(); return; }
            if (event.target.closest('[data-mkt-recruit-scroll]')) {
                const sec = el('mkt-employees-section');
                if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            if (event.target.closest('[data-mkt-recruit-team]')) { openRecruitTeam(); return; }
            const interview = event.target.closest('[data-mkt-interview]');
            if (interview) { openInterview(interview.getAttribute('data-mkt-interview')); return; }
            const recruit = event.target.closest('[data-mkt-recruit]');
            if (recruit) { openRecruit(recruit.getAttribute('data-mkt-recruit')); return; }
            if (event.target.closest('#mkt-filter-btn')) {
                const menu = el('mkt-filter-menu');
                if (menu) menu.classList.toggle('hidden');
                return;
            }
            if (event.target.closest('[data-mkt-clear-filter]')) {
                state.deptFilter = 'all'; state.statusFilter = 'all'; syncFilterUi(); render(); return;
            }
        });

        const search = el('mkt-search');
        if (search) search.addEventListener('input', () => { state.query = search.value || ''; render(); });
        const deptSel = el('mkt-filter-dept');
        if (deptSel) deptSel.addEventListener('change', () => { state.deptFilter = deptSel.value; renderSidebarActive(); render(); });
        const statusSel = el('mkt-filter-status');
        if (statusSel) statusSel.addEventListener('change', () => { state.statusFilter = statusSel.value; render(); });

        const modalRoot = el('mkt-modal-root');
        // Pindah ke body agar position:fixed tidak terkurung transform panel view.
        if (modalRoot && modalRoot.parentElement !== document.body) document.body.appendChild(modalRoot);
        if (modalRoot) {
            modalRoot.addEventListener('click', (event) => {
                if (event.target.closest('[data-mkt-close]')) { closeModal(); return; }
                const pick = event.target.closest('[data-mkt-pick-dept]');
                if (pick) {
                    state.pendingDeptId = pick.getAttribute('data-mkt-pick-dept');
                    modalRoot.querySelectorAll('[data-mkt-pick-dept]').forEach(b => b.classList.toggle('is-selected', b.getAttribute('data-mkt-pick-dept') === state.pendingDeptId));
                    icons(); return;
                }
                const addBtn = event.target.closest('[data-mkt-add-dept]');
                if (addBtn) { addDepartment(addBtn.getAttribute('data-mkt-add-for')); return; }
                if (event.target.closest('[data-mkt-confirm-recruit]')) { confirmRecruit(); return; }
                if (event.target.closest('[data-mkt-confirm-team]')) { confirmTeam(); return; }
                if (event.target.closest('[data-mkt-unrecruit]')) {
                    const role = roleById(state.pendingRoleId);
                    if (role) { delete state.placements[role.id]; logActivity(`${role.name} dilepas dari departemennya`); save(); }
                    closeModal(); render(); return;
                }
                const gotoOffice = event.target.closest('[data-mkt-goto-office]');
                if (gotoOffice) {
                    closeModal();
                    if (state.app && state.app.switchView) state.app.switchView('office');
                    else if (window.app && app.switchView) app.switchView('office');
                    return;
                }
                const recruit = event.target.closest('[data-mkt-recruit]');
                if (recruit) { openRecruit(recruit.getAttribute('data-mkt-recruit')); return; }
            });
        }
        document.addEventListener('click', (event) => {
            const menu = el('mkt-filter-menu');
            if (menu && !menu.classList.contains('hidden') && !event.target.closest('#view-marketplace')) menu.classList.add('hidden');
        });
        render();
    }

    function renderSidebarActive() { renderSidebar(); }
    function syncFilterUi() {
        const deptSel = el('mkt-filter-dept');
        if (deptSel) {
            const current = deptSel.value;
            deptSel.innerHTML = '<option value="all">Semua departemen</option>' + allDepartments().map(d => `<option value="${esc(d.id)}">${esc(d.studio || d.name)}</option>`).join('');
            deptSel.value = state.deptFilter;
            if (deptSel.value !== state.deptFilter) deptSel.value = current || 'all';
        }
    }

    function open() {
        load();
        syncFilterUi();
        render();
        syncFromApi();
    }

    window.MarketplacePage = { bind, open };
})();
