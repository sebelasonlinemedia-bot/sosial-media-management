/**
 * Halaman Organisasi — "Jelajahi Tenaga Kerja Anda" (meniru bagan struktur
 * organisasi): pohon departemen/studio di kiri, node "Anda" di tengah atas,
 * kolom departemen berisi kartu agen, penempatan meja agen.
 *
 * Sumber data:
 * - Peran & departemen bawaan: GET /api/ai/office/roles + GET /api/ai/departments
 *   (cadangan lokal sama dengan lib/ai-roles.js & lib/ai-departments.js).
 * - Status hadir agen: GET /api/ai/office (employees[].status).
 * - Jumlah meja: officeLayout.desks dari GET /api/ai/settings (layout kantor
 *   3D yang sama dengan editor Layout); fallback 12 meja.
 *
 * Persistensi penempatan: localStorage `piks-marketplace-v1` — KUNCI YANG SAMA
 * dengan js/marketplace-page.js agar Pasar & Organisasi tidak bertentangan.
 * Objek tersimpan: { placements:{roleId:deptId}, customDepts:[{id,name,studio,
 * emoji,color,description}], activity:[], desks:{roleId:nomorMeja},
 * orgUnplaced:[roleId] }.
 *
 * Batas integrasi kantor 3D (jujur, sesuai kode yang ada):
 * - Nama ruang/studio departemen custom hanya hidup di localStorage ini;
 *   label zona studio 3D (ai-office-3d.js STUDIO_ROOM_NAMES /
 *   computeStudioRooms) statis dari partisi gedung (4 studio fisik) dan
 *   registry departemen server tidak menerima departemen custom, jadi nama
 *   studio custom TIDAK mengubah label 3D. Untuk departemen bawaan, nama
 *   studio yang tampil di sini sama dengan lib/ai-departments.js.
 * - Meja 3D ditempati peran berdasarkan urutan indeks peran (ROLE_STUDIO di
 *   ai-office-3d.js): peran ke-i duduk di desks[i]. Nomor "bawaan 3D" itu
 *   ditampilkan di kartu; penempatan meja custom di halaman ini adalah
 *   pemetaan organisasi (tersimpan lokal) dan tidak mengurut ulang kursi 3D.
 */
(function () {
    const STORAGE_KEY = 'piks-marketplace-v1';
    const UNPLACED_ID = '__unplaced__';
    const FALLBACK_DESK_TOTAL = 12;

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
        { id: 'visual-producer', department: 'design', name: 'Salsa', title: 'Visual / Video Producer', emoji: '🎬', color: '#7c3aed', avatarColor: '#7c3aed', outputs: 'Brief visual, skrip Reels/TikTok/Shorts, shot list', defaultPlatforms: ['instagram', 'tiktok', 'youtube'] },
        { id: 'community-manager', department: 'support', name: 'Titin', title: 'Community Manager', emoji: '💬', avatarColor: '#059669', outputs: 'Draft balasan komentar/DM + catatan eskalasi', defaultPlatforms: ['instagram', 'facebook'] },
        { id: 'analyst', department: 'data', name: 'Bimo', title: 'Analyst', emoji: '📊', avatarColor: '#d97706', outputs: 'Weekly insights + rekomendasi untuk Strategist', defaultPlatforms: ['facebook', 'instagram'] },
        { id: 'compliance', department: 'legal', name: 'Nadira', title: 'Compliance / QA', emoji: '🛡️', avatarColor: '#475569', outputs: 'Pass atau Revision required + alasan', defaultPlatforms: [] },
        { id: 'sales', department: 'sales', name: 'Reno', title: 'Sales Specialist', emoji: '🤝', avatarColor: '#0284c7', outputs: 'Daftar prospek, draf follow-up/outreach, ringkasan pipeline', defaultPlatforms: [] },
        { id: 'finance', department: 'finance', name: 'Fajar', title: 'Finance Specialist', emoji: '💰', avatarColor: '#65a30d', outputs: 'Rekap transaksi, draf invoice, ringkasan keuangan (CSV/dokumen)', defaultPlatforms: [] },
        { id: 'product', department: 'product', name: 'Prama', title: 'Product Specialist', emoji: '🧩', avatarColor: '#db2777', outputs: 'Riset produk, ringkasan masukan pengguna, draf roadmap/PRD ringkas', defaultPlatforms: [] },
        { id: 'people', department: 'people', name: 'Kirana', title: 'People Specialist', emoji: '👥', avatarColor: '#9333ea', outputs: 'Deskripsi kerja, draf agenda & SOP, dokumen people-ops', defaultPlatforms: [] }
    ];

    const ACTIVE_STATUS = new Set(['working', 'publishing', 'queued', 'awaiting_approval', 'needs_info']);
    const STATUS_LABEL = {
        idle: 'Santai', working: 'Sedang bekerja', publishing: 'Sedang menerbitkan',
        queued: 'Dalam antrean', awaiting_approval: 'Menunggu persetujuan',
        needs_info: 'Butuh info tambahan', done: 'Selesai', failed: 'Gagal'
    };
    const COLOR_PRESETS = ['#e11d48', '#0d9488', '#2563eb', '#7c3aed', '#059669', '#d97706', '#0284c7', '#65a30d', '#db2777', '#9333ea', '#f59e0b', '#64748b'];
    const EMOJI_PRESETS = ['🏢', '🎙️', '🎬', '🎯', '💬', '📊', '🛡️', '🤝', '💰', '🧩', '👥', '🗂️', '🚀', '🎨'];

    const state = {
        bound: false,
        app: null,
        roles: FALLBACK_ROLES.map(r => ({ ...r })),
        departments: FALLBACK_DEPARTMENTS.map(d => ({ ...d })),
        placements: {},
        customDepts: [],
        activity: [],
        desks: {},
        orgUnplaced: [],
        statuses: {}, // roleId -> status dari /api/ai/office
        deskTotal: FALLBACK_DESK_TOTAL,
        deskSource: 'bawaan (12 meja)',
        collapsed: {}, // deptId -> true
        query: '',
        manage: false,
        pendingRoleId: null,
        pendingDeptId: null,
        pendingDesk: null,
        editingDeptId: null
    };

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function toast(msg, color) {
        if (state.app && state.app.showToast) state.app.showToast(msg, color || 'emerald');
    }
    function go(view) {
        if (state.app && state.app.switchView) state.app.switchView(view);
        else if (typeof app !== 'undefined' && app.switchView) app.switchView(view);
    }

    /* ---------- Persistensi (kunci sama dengan Pasar) ---------- */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== 'object') return;
            state.placements = saved.placements && typeof saved.placements === 'object' ? saved.placements : {};
            state.customDepts = Array.isArray(saved.customDepts) ? saved.customDepts : [];
            state.activity = Array.isArray(saved.activity) ? saved.activity : [];
            state.desks = saved.desks && typeof saved.desks === 'object' ? saved.desks : {};
            state.orgUnplaced = Array.isArray(saved.orgUnplaced) ? saved.orgUnplaced.filter(String) : [];
        } catch (_) { /* abaikan data rusak */ }
    }
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                placements: state.placements,
                customDepts: state.customDepts,
                activity: state.activity.slice(0, 20),
                desks: state.desks,
                orgUnplaced: state.orgUnplaced
            }));
        } catch (_) { /* penyimpanan tidak tersedia */ }
    }
    function logActivity(text) {
        state.activity.unshift({ text, time: new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) });
        state.activity = state.activity.slice(0, 20);
    }

    /* ---------- Model turunan ---------- */
    function allDepartments() { return state.departments.concat(state.customDepts); }
    function deptById(id) { return allDepartments().find(d => d.id === id) || null; }
    function roleById(id) { return state.roles.find(r => r.id === id) || null; }
    function isCustomDept(id) { return state.customDepts.some(d => d.id === id); }
    /** Departemen efektif agen: penempatan eksplisit > departemen asal peran;
     *  agen yang sengaja dilepas (orgUnplaced) tidak masuk departemen mana pun. */
    function effectiveDeptId(role) {
        if (state.orgUnplaced.includes(role.id)) return null;
        return state.placements[role.id] || role.department || null;
    }
    function membersOf(deptId) {
        if (deptId === UNPLACED_ID) return state.roles.filter(r => effectiveDeptId(r) === null);
        return state.roles.filter(r => effectiveDeptId(r) === deptId);
    }
    /** Nomor meja bawaan kantor 3D: peran ke-i duduk di desks[i] (ROLE_STUDIO). */
    function defaultDesk(role) {
        const idx = state.roles.findIndex(r => r.id === role.id);
        return idx >= 0 ? idx + 1 : null;
    }
    function explicitDesk(roleId) {
        const n = parseInt(state.desks[roleId], 10);
        return Number.isFinite(n) && n >= 1 ? n : null;
    }
    function deskTakenBy(deskNo, exceptRoleId) {
        return state.roles.find(r => r.id !== exceptRoleId && explicitDesk(r.id) === deskNo) || null;
    }
    function deskLabel(role) {
        const custom = explicitDesk(role.id);
        if (custom) return `Meja ${custom}`;
        const def = defaultDesk(role);
        return def ? `Meja ${def} · bawaan 3D` : 'Meja belum diatur';
    }
    function present(role) { return ACTIVE_STATUS.has(state.statuses[role.id] || ''); }
    function matchesQuery(role) {
        const q = state.query.trim().toLowerCase();
        if (!q) return true;
        const dept = deptById(effectiveDeptId(role) || '');
        return [role.name, role.title, role.outputs, dept && dept.name, dept && dept.studio].join(' ').toLowerCase().includes(q);
    }
    function avatar(role, cls) {
        return `<span class="org-avatar ${cls || ''}" style="background:${esc(role.avatarColor || '#475569')}" aria-hidden="true">${esc((role.name || '?').charAt(0))}<i class="org-dot${present(role) ? ' is-on' : ''}"></i></span>`;
    }

    /* ---------- Render: sidebar pohon organisasi ---------- */
    function columns() {
        const cols = allDepartments().map(d => ({ dept: d, members: membersOf(d.id) }));
        cols.push({ dept: { id: UNPLACED_ID, name: 'Belum Ditempatkan', studio: 'Tanpa Ruang / Studio', emoji: '📥', color: '#64748b', description: 'Agen yang belum ditempatkan ke departemen mana pun.' }, members: membersOf(UNPLACED_ID) });
        return cols;
    }

    function renderTree() {
        const box = el('org-tree');
        if (!box) return;
        const cols = columns();
        const totalMembers = state.roles.length;
        box.innerHTML = `
            <button type="button" class="org-tree-row org-tree-root" data-org-toggle="__org__" aria-expanded="${state.collapsed.__org__ ? 'false' : 'true'}">
                <i data-lucide="chevron-down" class="org-chevron${state.collapsed.__org__ ? ' is-shut' : ''}"></i>
                <i data-lucide="building-2"></i><span>Organisasi</span><em>${totalMembers}</em>
            </button>
            ${state.collapsed.__org__ ? '' : cols.map(({ dept, members }) => {
                const shut = !!state.collapsed[dept.id];
                const visible = members.filter(matchesQuery);
                return `<div class="org-tree-group">
                    <button type="button" class="org-tree-row is-child" data-org-toggle="${esc(dept.id)}" aria-expanded="${shut ? 'false' : 'true'}">
                        <i data-lucide="chevron-down" class="org-chevron${shut ? ' is-shut' : ''}"></i>
                        <span class="org-dept-dot" style="background:${esc(dept.color || '#64748b')}"></span>
                        <span class="org-tree-text"><strong>${esc(dept.name)}</strong><span>${esc(dept.studio || '')}</span></span>
                        <em>${members.length}</em>
                    </button>
                    ${shut ? '' : `<div class="org-tree-members">${visible.length ? visible.map(r => `
                        <button type="button" class="org-member" data-org-place="${esc(r.id)}" title="Tempatkan ${esc(r.name)}">
                            ${avatar(r)}<span class="org-member-text"><strong>${esc(r.name)}</strong><span>${esc(r.title)}</span></span>
                        </button>`).join('') : '<p class="org-empty org-empty-sm">Tidak ada anggota tampil.</p>'}
                    </div>`}
                </div>`;
            }).join('')}`;
        icons();
    }

    /* ---------- Render: bagan tengah ---------- */
    function renderChart() {
        const box = el('org-columns');
        if (!box) return;
        const cols = columns();
        box.innerHTML = cols.map(({ dept, members }) => {
            const visible = members.filter(matchesQuery);
            const filled = members.filter(r => explicitDesk(r.id)).length;
            const custom = isCustomDept(dept.id);
            return `<article class="org-col" style="--org-color:${esc(dept.color || '#64748b')}" aria-label="${esc(dept.name)}">
                <header class="org-col-head">
                    <span class="org-col-emoji" aria-hidden="true">${esc(dept.emoji || '🏢')}</span>
                    <div class="org-col-title">
                        <h3>${esc(dept.name)}</h3>
                        <p>${esc(dept.studio || dept.name)}</p>
                        <p class="org-col-summary">${members.length} agen · ${filled} meja terisi</p>
                    </div>
                    <em class="org-col-count">${members.length}</em>
                </header>
                ${state.manage && custom ? `<div class="org-col-manage">
                    <button type="button" class="btn btn-secondary btn-sm" data-org-edit-dept="${esc(dept.id)}"><i data-lucide="pencil"></i> Ubah Studio</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-org-delete-dept="${esc(dept.id)}"><i data-lucide="trash-2"></i> Hapus</button>
                </div>` : ''}
                <div class="org-col-body">
                    ${visible.length ? visible.map(r => `
                        <div class="org-card">
                            ${avatar(r, 'org-avatar-lg')}
                            <div class="org-card-text">
                                <strong>${esc(r.name)} ${r.emoji ? `<span aria-hidden="true">${esc(r.emoji)}</span>` : ''}</strong>
                                <span>${esc(r.title)}</span>
                                <span class="org-card-meta"><span class="org-desk-badge">${esc(deskLabel(r))}</span><span class="org-status">${esc(STATUS_LABEL[state.statuses[r.id]] || 'Santai')}</span></span>
                            </div>
                            <button type="button" class="org-icon-btn" data-org-place="${esc(r.id)}" title="Tempatkan ${esc(r.name)} (departemen & meja)" aria-label="Tempatkan ${esc(r.name)}"><i data-lucide="settings-2"></i></button>
                        </div>`).join('') : '<p class="org-empty">Belum ada agen di sini.</p>'}
                </div>
            </article>`;
        }).join('');
        const summary = el('org-summary');
        if (summary) {
            const usedDesks = new Set(state.roles.map(r => explicitDesk(r.id)).filter(Boolean));
            const placedCount = state.roles.filter(r => effectiveDeptId(r)).length;
            summary.textContent = `${placedCount}/${state.roles.length} agen ditempatkan · ${usedDesks.size} dari ${state.deskTotal} meja terisi (${esc(state.deskSource)}) · ${membersOf(UNPLACED_ID).length} belum ditempatkan`;
        }
        icons();
    }

    function render() { renderTree(); renderChart(); icons(); }

    /* ---------- Modal ---------- */
    function openModal(html) {
        const root = el('org-modal-root');
        if (!root) return;
        root.innerHTML = `<div class="org-modal-backdrop" data-org-close></div><div class="org-modal" role="dialog" aria-modal="true">${html}</div>`;
        root.classList.remove('hidden');
        icons();
    }
    function closeModal() {
        const root = el('org-modal-root');
        if (root) { root.classList.add('hidden'); root.innerHTML = ''; }
        state.pendingRoleId = null; state.pendingDeptId = null; state.pendingDesk = null; state.editingDeptId = null;
    }
    function modalHead(title) {
        return `<div class="org-modal-head"><h3>${esc(title)}</h3><button type="button" class="org-icon-btn" data-org-close aria-label="Tutup"><i data-lucide="x"></i></button></div>`;
    }

    function deptOptionsHtml(selectedId) {
        return allDepartments().map(d => {
            const count = membersOf(d.id).length;
            return `<button type="button" class="org-dept-option${d.id === selectedId ? ' is-selected' : ''}" data-org-pick-dept="${esc(d.id)}">
                <span class="org-dept-dot" style="background:${esc(d.color || '#64748b')}"></span>
                <span class="org-tree-text"><strong>${esc(d.name)} — ${esc(d.studio || d.name)}</strong><span>${count} agen di departemen ini</span></span>
                ${d.id === selectedId ? '<i data-lucide="check"></i>' : ''}
            </button>`;
        }).join('');
    }
    function deskOptionsHtml(selectedDesk, roleId) {
        let html = `<button type="button" class="org-dept-option${!selectedDesk ? ' is-selected' : ''}" data-org-pick-desk="">
            <span class="org-dept-dot" style="background:#64748b"></span>
            <span class="org-tree-text"><strong>Tanpa meja khusus</strong><span>Pakai meja bawaan kantor 3D (Meja ${esc(defaultDesk(roleById(roleId) || {}) || '-')})</span></span>
            ${!selectedDesk ? '<i data-lucide="check"></i>' : ''}</button>`;
        for (let n = 1; n <= state.deskTotal; n++) {
            const taken = deskTakenBy(n, roleId);
            html += `<button type="button" class="org-dept-option${n === selectedDesk ? ' is-selected' : ''}" data-org-pick-desk="${n}" ${taken ? 'disabled title="Sudah dipakai ' + esc(taken.name) + '"' : ''}>
                <span class="org-dept-dot" style="background:${taken ? '#475569' : '#14b8a6'}"></span>
                <span class="org-tree-text"><strong>Meja ${n}</strong><span>${taken ? 'Dipakai ' + esc(taken.name) : 'Kosong'}</span></span>
                ${n === selectedDesk ? '<i data-lucide="check"></i>' : ''}</button>`;
        }
        return html;
    }

    function openPlace(roleId) {
        const role = roleById(roleId);
        if (!role) return;
        state.pendingRoleId = roleId;
        state.pendingDeptId = effectiveDeptId(role) || role.department;
        state.pendingDesk = explicitDesk(roleId);
        const current = deptById(effectiveDeptId(role) || '');
        openModal(`
            ${modalHead(`Tempatkan ${role.name}`)}
            <p class="org-modal-sub">${esc(role.title)} — pilih departemen tujuan dan nomor meja. Saat ini: <strong>${current ? esc(current.name) + ' · ' + esc(current.studio || '') : 'Belum ditempatkan'}</strong> · ${esc(deskLabel(role))}.</p>
            <p class="org-modal-label">Departemen tujuan</p>
            <div class="org-dept-options">${deptOptionsHtml(state.pendingDeptId)}</div>
            <p class="org-modal-label">Nomor meja (daftar meja dari layout kantor: ${state.deskTotal} meja)</p>
            <div class="org-dept-options org-desk-options">${deskOptionsHtml(state.pendingDesk, roleId)}</div>
            <div class="org-modal-actions">
                ${effectiveDeptId(role) ? '<button type="button" class="btn btn-secondary" data-org-unplace><i data-lucide="user-x"></i> Lepas Penempatan</button>' : ''}
                <button type="button" class="btn btn-primary" data-org-confirm-place><i data-lucide="check"></i> Simpan Penempatan</button>
            </div>`);
    }

    function confirmPlace() {
        const role = roleById(state.pendingRoleId);
        if (!role || !state.pendingDeptId) return;
        const dept = deptById(state.pendingDeptId);
        const wasDept = effectiveDeptId(role);
        state.placements[role.id] = state.pendingDeptId;
        state.orgUnplaced = state.orgUnplaced.filter(id => id !== role.id);
        if (state.pendingDesk) {
            const taken = deskTakenBy(state.pendingDesk, role.id);
            if (taken) { toast(`Meja ${state.pendingDesk} sudah dipakai ${taken.name}. Pilih meja lain.`, 'yellow'); return; }
            state.desks[role.id] = state.pendingDesk;
        } else {
            delete state.desks[role.id];
        }
        const deskPart = state.pendingDesk ? `, Meja ${state.pendingDesk}` : '';
        logActivity(wasDept && wasDept !== state.pendingDeptId
            ? `${role.name} dipindahkan ke ${dept ? dept.studio : state.pendingDeptId}${deskPart}`
            : `${role.name} ditempatkan di ${dept ? dept.studio : state.pendingDeptId}${deskPart}`);
        save(); closeModal(); render();
        toast(`${role.name} ditempatkan di ${dept ? dept.studio : 'departemen'}${deskPart}.`, 'emerald');
    }

    function unplace() {
        const role = roleById(state.pendingRoleId);
        if (!role) return;
        delete state.placements[role.id];
        delete state.desks[role.id];
        if (!state.orgUnplaced.includes(role.id)) state.orgUnplaced.push(role.id);
        logActivity(`${role.name} dilepas penempatannya (Belum Ditempatkan)`);
        save(); closeModal(); render();
        toast(`${role.name} sekarang di Belum Ditempatkan.`, 'indigo');
    }

    function colorSwatches(selected) {
        return COLOR_PRESETS.map(c => `<button type="button" class="org-swatch${c === selected ? ' is-selected' : ''}" data-org-color="${c}" style="background:${c}" aria-label="Warna ${c}"></button>`).join('');
    }
    function emojiOptions(selected) {
        return EMOJI_PRESETS.map(e => `<button type="button" class="org-swatch org-emoji-swatch${e === selected ? ' is-selected' : ''}" data-org-emoji="${e}" aria-label="Ikon ${e}">${e}</button>`).join('');
    }

    function openCreateDept(editDept) {
        const dept = editDept || null;
        state.editingDeptId = dept ? dept.id : null;
        state.pendingColor = dept ? (dept.color || '#f59e0b') : '#f59e0b';
        state.pendingEmoji = dept ? (dept.emoji || '🏢') : '🏢';
        openModal(`
            ${modalHead(dept ? 'Ubah Departemen & Studio' : 'Buat Departemen')}
            <p class="org-modal-sub">Nama ruang/studio tampil di header kolom bagan, pohon organisasi di kiri, dan pilihan penempatan di Pasar (data yang sama).</p>
            <div class="org-form">
                <label>Nama departemen
                    <input type="text" id="org-dept-name" class="form-control" placeholder="mis. Podcast" value="${dept ? esc(dept.name) : ''}">
                </label>
                <label>Nama ruang / studio
                    <input type="text" id="org-dept-studio" class="form-control" placeholder="mis. Studio Podcast" value="${dept ? esc(dept.studio || '') : ''}">
                </label>
                <div><p class="org-modal-label">Warna departemen</p><div class="org-swatches" id="org-color-swatches">${colorSwatches(state.pendingColor)}</div></div>
                <div><p class="org-modal-label">Ikon departemen</p><div class="org-swatches" id="org-emoji-swatches">${emojiOptions(state.pendingEmoji)}</div></div>
            </div>
            <div class="org-modal-actions">
                <button type="button" class="btn btn-secondary" data-org-close>Batal</button>
                <button type="button" class="btn btn-primary" data-org-confirm-dept><i data-lucide="check"></i> ${dept ? 'Simpan Perubahan' : 'Buat Departemen'}</button>
            </div>`);
        const nameInput = el('org-dept-name');
        if (nameInput) nameInput.focus();
    }

    function confirmDept() {
        const name = (el('org-dept-name') || {}).value ? el('org-dept-name').value.trim() : '';
        const studio = (el('org-dept-studio') || {}).value ? el('org-dept-studio').value.trim() : '';
        if (!name) { toast('Nama departemen wajib diisi.', 'yellow'); const i = el('org-dept-name'); if (i) i.focus(); return; }
        if (!studio) { toast('Nama ruang/studio wajib diisi.', 'yellow'); const i = el('org-dept-studio'); if (i) i.focus(); return; }
        if (state.editingDeptId) {
            const dept = state.customDepts.find(d => d.id === state.editingDeptId);
            if (!dept) return;
            dept.name = name; dept.studio = studio;
            dept.color = state.pendingColor || dept.color; dept.emoji = state.pendingEmoji || dept.emoji;
            logActivity(`Departemen diubah: ${name} (${studio})`);
            save(); closeModal(); render();
            toast(`Departemen ${name} diperbarui — studio: ${studio}.`, 'emerald');
            return;
        }
        const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
        const dept = { id, name, studio, emoji: state.pendingEmoji || '🏢', color: state.pendingColor || '#f59e0b', description: 'Departemen custom buatan user dari halaman Organisasi.' };
        state.customDepts.push(dept);
        logActivity(`Departemen baru dibuat: ${name} (${studio})`);
        save(); closeModal(); render();
        toast(`Departemen ${name} dibuat dengan ruang ${studio}.`, 'emerald');
    }

    function openDeleteDept(deptId) {
        const dept = deptById(deptId);
        if (!dept || !isCustomDept(deptId)) return;
        const members = membersOf(deptId);
        openModal(`
            ${modalHead('Hapus Departemen')}
            <p class="org-modal-sub">Hapus <strong>${esc(dept.name)} (${esc(dept.studio || '')})</strong>? ${members.length ? `${members.length} agen di dalamnya akan pindah ke Belum Ditempatkan.` : 'Departemen ini kosong.'} Departemen bawaan tidak bisa dihapus.</p>
            <div class="org-modal-actions">
                <button type="button" class="btn btn-secondary" data-org-close>Batal</button>
                <button type="button" class="btn btn-danger" data-org-confirm-delete-dept="${esc(deptId)}"><i data-lucide="trash-2"></i> Hapus Departemen</button>
            </div>`);
    }
    function confirmDeleteDept(deptId) {
        const dept = deptById(deptId);
        membersOf(deptId).forEach(r => {
            delete state.placements[r.id];
            if (!state.orgUnplaced.includes(r.id)) state.orgUnplaced.push(r.id);
        });
        state.customDepts = state.customDepts.filter(d => d.id !== deptId);
        logActivity(`Departemen dihapus: ${dept ? dept.name : deptId}`);
        save(); closeModal(); render();
        toast('Departemen dihapus; agennya kini Belum Ditempatkan.', 'indigo');
    }

    function openInterviewList() {
        openModal(`
            ${modalHead('Wawancara Karyawan')}
            <p class="org-modal-sub">Pilih karyawan untuk melihat ringkasan wawancara, lalu beri brief di Kantor AI atau atur penempatannya.</p>
            <div class="org-dept-options">${state.roles.map(r => {
                const dept = deptById(effectiveDeptId(r) || '');
                return `<button type="button" class="org-dept-option" data-org-interview="${esc(r.id)}">
                    ${avatar(r)}<span class="org-tree-text"><strong>${esc(r.name)} — ${esc(r.title)}</strong><span>${dept ? esc(dept.studio || dept.name) : 'Belum ditempatkan'} · ${esc(deskLabel(r))}</span></span>
                    <i data-lucide="chevron-right"></i></button>`;
            }).join('')}</div>`);
    }
    function openInterview(roleId) {
        const role = roleById(roleId);
        if (!role) return;
        const origin = deptById(role.department);
        const placed = deptById(effectiveDeptId(role) || '');
        openModal(`
            ${modalHead(`Wawancara — ${role.name}`)}
            <div class="org-interview-head">${avatar(role, 'org-avatar-lg')}<div><strong>${esc(role.name)}</strong><p>${esc(role.title)}</p></div></div>
            <div class="org-interview-grid">
                <div><p class="org-modal-label">Tanggung jawab & output</p><p>${esc(role.outputs || '-')}</p></div>
                <div><p class="org-modal-label">Departemen asal</p><p>${esc(origin ? `${origin.studio} (${origin.name})` : '-')}</p></div>
                <div><p class="org-modal-label">Penempatan saat ini</p><p>${placed ? `${esc(placed.name)} · ${esc(placed.studio || '')} · ${esc(deskLabel(role))}` : 'Belum ditempatkan'}</p></div>
                <div><p class="org-modal-label">Status</p><p>${esc(STATUS_LABEL[state.statuses[role.id]] || 'Santai')}</p></div>
            </div>
            <div class="org-chat"><p><strong>${esc(role.name)}:</strong> Halo! Saya ${esc(role.name)}, ${esc(role.title)} di PiK's Digital Lab. Output utama saya: ${esc(role.outputs || '-')}. Beri saya brief yang jelas, lalu saya kerjakan sesuai aturan persetujuan yang berlaku.</p></div>
            <div class="org-modal-actions">
                <button type="button" class="btn btn-secondary" data-org-goto-office><i data-lucide="messages-square"></i> Beri Brief di Kantor AI</button>
                <button type="button" class="btn btn-primary" data-org-place="${esc(role.id)}"><i data-lucide="settings-2"></i> Tempatkan ${esc(role.name)}</button>
            </div>`);
    }

    /* ---------- Sinkronisasi API ---------- */
    async function syncFromApi() {
        if (typeof api === 'undefined' || !api.get) return;
        try {
            const [rolesData, deptData, officeData, settingsData] = await Promise.all([
                api.get('/api/ai/office/roles').catch(() => null),
                api.get('/api/ai/departments').catch(() => null),
                api.get('/api/ai/office').catch(() => null),
                api.get('/api/ai/settings').catch(() => null)
            ]);
            if (rolesData && Array.isArray(rolesData.roles) && rolesData.roles.length) {
                state.roles = rolesData.roles.map(r => ({
                    id: r.id, department: r.department, name: r.name, title: r.title,
                    emoji: r.emoji, avatarColor: r.avatarColor, outputs: r.outputs,
                    defaultPlatforms: r.defaultPlatforms || []
                }));
            }
            const tree = deptData && (deptData.departments || deptData.tree);
            if (Array.isArray(tree) && tree.length) {
                state.departments = tree.map(d => ({ id: d.id, name: d.name, studio: d.studio, emoji: d.emoji, color: d.color, description: d.description }));
            }
            if (officeData && Array.isArray(officeData.employees)) {
                state.statuses = {};
                officeData.employees.forEach(e => { if (e && e.id) state.statuses[e.id] = e.status || 'idle'; });
            }
            const layout = settingsData && settingsData.settings
                ? (settingsData.settings.officeLayout || settingsData.settings.defaultOfficeLayout) : null;
            if (layout && Array.isArray(layout.desks) && layout.desks.length) {
                state.deskTotal = layout.desks.length;
                state.deskSource = 'officeLayout kantor 3D (server)';
            }
            render();
        } catch (_) { /* data cadangan tetap dipakai */ }
    }

    /* ---------- Binding ---------- */
    function bind(app) {
        if (state.bound) return;
        state.bound = true;
        state.app = app;
        load();
        const root = el('view-organization');
        if (!root) return;

        root.addEventListener('click', (event) => {
            const nav = event.target.closest('[data-org-nav]');
            if (nav) { go(nav.getAttribute('data-org-nav')); return; }
            const toggle = event.target.closest('[data-org-toggle]');
            if (toggle) {
                const id = toggle.getAttribute('data-org-toggle');
                state.collapsed[id] = !state.collapsed[id];
                renderTree(); return;
            }
            if (event.target.closest('[data-org-create-dept]')) { openCreateDept(null); return; }
            if (event.target.closest('[data-org-interviews]')) { openInterviewList(); return; }
            if (event.target.closest('[data-org-manage]')) {
                state.manage = !state.manage;
                const btn = el('org-manage-btn');
                if (btn) btn.classList.toggle('is-active', state.manage);
                renderChart();
                toast(state.manage ? 'Mode kelola aktif: ubah/hapus departemen custom dari header kolomnya.' : 'Mode kelola nonaktif.', 'indigo');
                return;
            }
            const scrollBtn = event.target.closest('[data-org-scroll]');
            if (scrollBtn) {
                const wrap = el('org-columns-wrap');
                if (wrap) wrap.scrollBy({ left: (scrollBtn.getAttribute('data-org-scroll') === 'left' ? -340 : 340), behavior: 'smooth' });
                return;
            }
            const tab = event.target.closest('[data-org-tab]');
            if (tab) {
                root.querySelectorAll('[data-org-tab]').forEach(b => {
                    const on = b === tab;
                    b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                if (tab.getAttribute('data-org-tab') === 'employees') {
                    const search = el('org-search');
                    const wrap = el('org-columns-wrap');
                    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (search) search.focus();
                } else {
                    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                return;
            }
            const editDept = event.target.closest('[data-org-edit-dept]');
            if (editDept) { const d = deptById(editDept.getAttribute('data-org-edit-dept')); if (d) openCreateDept(d); return; }
            const delDept = event.target.closest('[data-org-delete-dept]');
            if (delDept) { openDeleteDept(delDept.getAttribute('data-org-delete-dept')); return; }
            const place = event.target.closest('[data-org-place]');
            if (place) { openPlace(place.getAttribute('data-org-place')); return; }
        });

        const search = el('org-search');
        if (search) search.addEventListener('input', () => { state.query = search.value || ''; render(); });

        const modalRoot = el('org-modal-root');
        if (modalRoot && modalRoot.parentElement !== document.body) document.body.appendChild(modalRoot);
        if (modalRoot) {
            modalRoot.addEventListener('click', (event) => {
                if (event.target.closest('[data-org-close]')) { closeModal(); return; }
                const pickDept = event.target.closest('[data-org-pick-dept]');
                if (pickDept) {
                    state.pendingDeptId = pickDept.getAttribute('data-org-pick-dept');
                    modalRoot.querySelectorAll('[data-org-pick-dept]').forEach(b => b.classList.toggle('is-selected', b === pickDept));
                    icons(); return;
                }
                const pickDesk = event.target.closest('[data-org-pick-desk]');
                if (pickDesk && !pickDesk.disabled) {
                    const v = pickDesk.getAttribute('data-org-pick-desk');
                    state.pendingDesk = v ? parseInt(v, 10) : null;
                    modalRoot.querySelectorAll('[data-org-pick-desk]').forEach(b => b.classList.toggle('is-selected', b === pickDesk));
                    icons(); return;
                }
                const swatch = event.target.closest('[data-org-color]');
                if (swatch) {
                    state.pendingColor = swatch.getAttribute('data-org-color');
                    modalRoot.querySelectorAll('[data-org-color]').forEach(b => b.classList.toggle('is-selected', b === swatch));
                    return;
                }
                const emojiBtn = event.target.closest('[data-org-emoji]');
                if (emojiBtn) {
                    state.pendingEmoji = emojiBtn.getAttribute('data-org-emoji');
                    modalRoot.querySelectorAll('[data-org-emoji]').forEach(b => b.classList.toggle('is-selected', b === emojiBtn));
                    return;
                }
                if (event.target.closest('[data-org-confirm-place]')) { confirmPlace(); return; }
                if (event.target.closest('[data-org-unplace]')) { unplace(); return; }
                if (event.target.closest('[data-org-confirm-dept]')) { confirmDept(); return; }
                const confirmDelete = event.target.closest('[data-org-confirm-delete-dept]');
                if (confirmDelete) { confirmDeleteDept(confirmDelete.getAttribute('data-org-confirm-delete-dept')); return; }
                const interview = event.target.closest('[data-org-interview]');
                if (interview) { openInterview(interview.getAttribute('data-org-interview')); return; }
                const place = event.target.closest('[data-org-place]');
                if (place) { openPlace(place.getAttribute('data-org-place')); return; }
                if (event.target.closest('[data-org-goto-office]')) { closeModal(); go('office'); return; }
            });
            modalRoot.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.target && event.target.id === 'org-dept-studio') { event.preventDefault(); confirmDept(); }
            });
        }

        // Pintu masuk dari halaman lain (Pasar, Pengaturan) memakai atribut yang sama.
        document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-org-open-page]');
            if (trigger) go('organization');
        });

        render();
    }

    function open() {
        load();
        render();
        syncFromApi();
    }

    window.OrganizationPage = { bind, open };
})();
