/**
 * Halaman Peralatan (Tools) — peralatan yang dapat dipakai karyawan AI
 * PiK's Digital Lab, diadaptasi dari referensi halaman Tools untuk
 * karyawan AI (grid APPS, UTILITIES, INTEGRATIONS, SYSTEM, panel detail).
 *
 * Persistensi: localStorage `piks-tools-v1` (pola sama dengan Pasar/
 * Organisasi/Tugas — tidak ada endpoint server yang cocok & aman untuk
 * kredensial aplikasi pihak ketiga, jadi TIDAK ada backend baru dan
 * tidak ada token/secrets yang disimpan; hanya status & preferensi UI).
 * Data SYSTEM dibangun dari appState.aiJobs / GET /api/ai/jobs +
 * /api/ai/office/roles bila tersedia; bila kosong dipakai data contoh
 * lokal yang DITANDAI JELAS di UI.
 */
(function () {
    const STORAGE_KEY = 'piks-tools-v1';

    const APPS = [
        ['airtable', 'Airtable', 'Ai', '#f82b60'], ['asana', 'Asana', 'As', '#f06a6a'], ['clickup', 'ClickUp', 'Cu', '#7b61ff'],
        ['confluence', 'Confluence', 'Co', '#2684ff'], ['discord', 'Discord', 'Di', '#5865f2'], ['dropbox', 'Dropbox', 'Dr', '#0061ff'],
        ['github', 'GitHub', 'Gh', '#64748b'], ['gmail', 'Gmail', 'Gm', '#ea4335'], ['gong', 'Gong', 'Go', '#a855f7'],
        ['google-calendar', 'Google Calendar', 'Gc', '#4285f4'], ['google-docs', 'Google Docs', 'Gd', '#4285f4'], ['google-drive', 'Google Drive', 'Gv', '#f59e0b'],
        ['google-sheets', 'Google Sheets', 'Gs', '#22c55e'], ['hubspot', 'HubSpot', 'Hu', '#ff7a59'], ['intercom', 'Intercom', 'In', '#0091ea'],
        ['jira', 'Jira', 'Ji', '#2684ff'], ['linear', 'Linear', 'Li', '#5e6ad2'], ['mailchimp', 'Mailchimp', 'Ma', '#eab308'],
        ['microsoft-teams', 'Microsoft Teams', 'Mt', '#6264a7'], ['monday', 'Monday', 'Mo', '#ff3d57'], ['notion', 'Notion', 'No', '#94a3b8'],
        ['outlook', 'Outlook', 'Ou', '#0a64c8'], ['salesforce', 'Salesforce', 'Sa', '#00a1e0'], ['slack', 'Slack', 'Sl', '#611f69'],
        ['klaviyo', 'Klaviyo', 'Kl', '#16a34a'], ['lemlist', 'Lemlist', 'Le', '#3b82f6'], ['linkedin', 'LinkedIn', 'In', '#0a66c2'],
        ['meta-ads', 'Meta Ads', 'Me', '#1877f2'], ['pexels', 'Pexels', 'Pe', '#05a081'], ['pinterest', 'Pinterest', 'Pi', '#e60023'],
        ['reddit', 'Reddit', 'Re', '#ff4500'], ['semrush', 'Semrush', 'Se', '#ff642d'], ['ticktick', 'TickTick', 'Ti', '#4772fa'],
        ['tiktok', 'TikTok', 'Tt', '#94a3b8'], ['twitter', 'Twitter / X', 'X', '#64748b'], ['whatsapp', 'WhatsApp', 'Wa', '#25d366']
    ].map(([id, name, initial, color]) => ({ id, name, initial, color, kind: 'app' }));

    const UTILITIES = [
        { id: 'util-doc-editor', name: 'Document Editor', initial: 'De', color: '#38bdf8', kind: 'utility', desc: 'Buat dan sunting berkas teks, Excel, Word, PowerPoint, dsb. — karyawan Anda dapat membuat dokumen untuk diunduh.' },
        { id: 'util-image-generator', name: 'Image Generator', initial: 'Ig', color: '#a78bfa', kind: 'utility', desc: 'Hasilkan logo, ilustrasi, dan grafis dari deskripsi teks singkat untuk kebutuhan konten.' },
        { id: 'util-premium-prospect', name: 'Premium Prospect Database', initial: 'Pp', color: '#f59e0b', kind: 'utility', desc: 'Cari basis data premium berisi jutaan profesional dan perusahaan, dengan email & nomor telepon kerja terverifikasi.' },
        { id: 'util-prospect', name: 'Prospect Database', initial: 'Pd', color: '#34d399', kind: 'utility', desc: 'Cari basis data profesional dan perusahaan dengan email serta nomor telepon kerja terverifikasi.' }
    ];

    const SKILLS = {
        gmail: ['Penanganan Email Masuk & Balasan', 'Outreach & Tindak Lanjut'], whatsapp: ['Balasan Komunitas', 'Outreach & Tindak Lanjut'],
        'google-calendar': ['Penjadwalan Konten', 'Pengingat & Agenda'], notion: ['Dokumentasi & Ringkasan', 'Kelola Tugas'],
        slack: ['Pesan & Komunikasi', 'Notifikasi Tim'], default: ['Otomatisasi Tugas', 'Ringkasan & Laporan']
    };

    const FALLBACK_ROLES = [
        { id: 'manager', name: 'Maya', avatarColor: '#e11d48' }, { id: 'strategist', name: 'Rani', avatarColor: '#0d9488' },
        { id: 'copywriter', name: 'Dimas', avatarColor: '#2563eb' }, { id: 'visual-producer', name: 'Salsa', avatarColor: '#7c3aed' },
        { id: 'community-manager', name: 'Titin', avatarColor: '#059669' }, { id: 'analyst', name: 'Bimo', avatarColor: '#d97706' },
        { id: 'compliance', name: 'Nadira', avatarColor: '#475569' }
    ];
    const CATEGORIES = ['Tulis Berkas', 'Kelola Peralatan', 'Pencarian Web', 'Baca Berkas', 'Tulis Tugas', 'Baca Tugas', 'Spesialis Web', 'Pesan & Komunikasi'];
    const ROLE_CATEGORY = { manager: 1, strategist: 2, copywriter: 0, 'visual-producer': 6, 'community-manager': 7, analyst: 3, compliance: 3, sales: 7, finance: 0, product: 4, people: 5 };

    const state = {
        bound: false, app: null, filter: 'all', query: '', selectedId: null, instructionsOpen: false,
        roles: FALLBACK_ROLES.map(r => ({ ...r })), jobs: [], jobsLoaded: false,
        data: null
    };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function toast(m, c) { if (state.app && state.app.showToast) state.app.showToast(m, c || 'indigo'); }
    function today() { return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric', year: 'numeric' }); }

    function defaultData() {
        return {
            apps: {
                gmail: { connected: true, connectedAt: today(), approval: 'ask', rules: '', instructions: '', trained: false, trainedAt: '', enabled: true, removed: false, used: 2, succeeded: 2, failed: 0 },
                'google-calendar': { connected: true, connectedAt: today(), approval: 'ask', rules: '', instructions: '', trained: false, trainedAt: '', enabled: true, removed: false, used: 1, succeeded: 1, failed: 0 }
            },
            customApps: [], integrations: { servers: [], agents: [], webhooks: [] }
        };
    }
    function load() {
        state.data = defaultData();
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved && typeof saved === 'object') {
                if (saved.apps && typeof saved.apps === 'object') state.data.apps = Object.assign(state.data.apps, saved.apps);
                if (Array.isArray(saved.customApps)) state.data.customApps = saved.customApps;
                if (saved.integrations) ['servers', 'agents', 'webhooks'].forEach(k => { if (Array.isArray(saved.integrations[k])) state.data.integrations[k] = saved.integrations[k]; });
            }
        } catch (_) {}
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); } catch (_) {} }
    function entry(id) {
        if (!state.data.apps[id]) state.data.apps[id] = { connected: false, connectedAt: '', approval: 'ask', rules: '', instructions: '', trained: false, trainedAt: '', enabled: true, removed: false, used: 0, succeeded: 0, failed: 0 };
        const e = state.data.apps[id];
        if (!e.approval) e.approval = 'ask';
        return e;
    }
    function allApps() { return APPS.concat(state.data.customApps).concat(UTILITIES); }
    function appById(id) { return allApps().find(a => a.id === id) || null; }
    function visibleApps() {
        return APPS.concat(state.data.customApps).filter(a => {
            const e = entry(a.id); if (e.removed) return false;
            if (state.filter === 'connected' && !e.connected) return false;
            if (state.filter === 'disconnected' && e.connected) return false;
            if (state.query && !a.name.toLowerCase().includes(state.query.toLowerCase())) return false;
            return true;
        });
    }

    /* ---------- Render kartu ---------- */
    function cardHtml(a) {
        const e = entry(a.id);
        return `<article class="tools-card${state.selectedId === a.id ? ' is-selected' : ''}" data-tools-open="${esc(a.id)}" tabindex="0" role="button" aria-label="Buka detail ${esc(a.name)}" title="Klik untuk detail ${esc(a.name)}">
            <span class="tools-dot${e.connected ? ' is-on' : ''}" title="${e.connected ? 'Terhubung' : 'Belum terhubung'}"></span>
            <span class="tools-icon" style="background:${esc(a.color)}">${esc(a.initial)}</span>
            <h4>${esc(a.name)}</h4>
            ${a.desc ? `<p class="tools-card-desc">${esc(a.desc)}</p>` : ''}
            <button type="button" class="tools-connect${e.connected ? ' is-on' : ''}" data-tools-connect="${esc(a.id)}" aria-pressed="${e.connected}">${e.connected ? 'Terhubung' : 'Hubungkan'} <span class="tools-toggle" aria-hidden="true"><i></i></span></button>
        </article>`;
    }
    function renderApps() {
        const box = el('tools-apps'); if (!box) return;
        const list = visibleApps();
        box.innerHTML = list.length ? list.map(cardHtml).join('') : '<p class="tools-empty">Tidak ada aplikasi yang cocok dengan saringan ini.</p>';
        const count = el('tools-connected-count');
        if (count) count.textContent = `${APPS.concat(state.data.customApps).filter(a => entry(a.id).connected && !entry(a.id).removed).length} terhubung`;
        icons();
    }
    function renderUtilities() { const box = el('tools-utilities'); if (box) box.innerHTML = UTILITIES.filter(a => !entry(a.id).removed).map(cardHtml).join(''); icons(); }

    function integrationRow(kind, icon, title, desc, addLabel) {
        const items = state.data.integrations[kind] || [];
        return `<div class="tools-int-row">
            <span class="tools-int-icon"><i data-lucide="${icon}"></i></span>
            <div class="tools-int-text"><strong>${esc(title)}</strong><span>${esc(desc)}</span>
            ${items.length ? `<div class="tools-int-items">${items.map(it => `<span class="tools-chip">${esc(it.name)}${it.url ? ` · ${esc(it.url)}` : ''}<button type="button" data-tools-del-int="${kind}:${esc(it.id)}" aria-label="Hapus ${esc(it.name)}"><i data-lucide="x"></i></button></span>`).join('')}</div>` : ''}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-tools-add-int="${kind}"><i data-lucide="plus"></i> ${esc(addLabel)}</button>
        </div>`;
    }
    function renderIntegrations() {
        const box = el('tools-integrations'); if (!box) return;
        box.innerHTML =
            integrationRow('servers', 'server', 'MCP Servers', 'Hubungkan server MCP dan layanan untuk berbuat lebih banyak.', 'Tambah Server') +
            integrationRow('agents', 'bot', 'A2A Agents', 'Bawa agen AI lain ke dalam tugas Anda.', 'Tambah Agent') +
            integrationRow('webhooks', 'webhook', 'Webhooks', 'Bereaksi terhadap peristiwa dari aplikasi lain secara otomatis.', 'Tambah Webhook') +
            ['API Endpoints|Panggil API eksternal dari tugas karyawan AI.', 'Phone Call|Panggilan telepon keluar/masuk oleh karyawan AI.', 'Database|Koneksi basis data eksternal untuk kueri terstruktur.'].map(s => {
                const [t, d] = s.split('|');
                return `<div class="tools-int-row is-disabled"><span class="tools-int-icon"><i data-lucide="lock"></i></span><div class="tools-int-text"><strong>${esc(t)}</strong><span>${esc(d)}</span></div><span class="tools-soon">Segera hadir</span></div>`;
            }).join('');
        icons();
    }

    /* ---------- Grafik SYSTEM ---------- */
    function chartData() {
        const roles = state.roles.slice(0, 7);
        if (state.jobs.length) {
            const rows = CATEGORIES.map((cat, ci) => {
                const segs = roles.map(r => ({ role: r, value: state.jobs.filter(j => (ROLE_CATEGORY[j.roleId || j.employeeRole] ?? (ci % roles.length)) === ci && (j.roleId === r.id || j.employeeName === r.name)).length }));
                return { cat, segs };
            }).filter(r => r.segs.some(s => s.value));
            if (rows.length) return { rows, real: true, max: Math.max(1, ...rows.map(r => r.segs.reduce((a, s) => a + s.value, 0))) };
        }
        // Cadangan lokal deterministik (bukan acak) — ditandai jelas di UI.
        const rows = CATEGORIES.map((cat, ci) => {
            const segs = roles.map((r, ri) => ({ role: r, value: Math.max(0, ((ci * 3 + ri * 2) % 9) - ri) }));
            if (!segs.some(s => s.value > 0) && segs[ci % segs.length]) segs[ci % segs.length].value = 3;
            return { cat, segs };
        });
        return { rows, real: false, max: Math.max(1, ...rows.map(r => r.segs.reduce((a, s) => a + s.value, 0))) };
    }
    function renderChart() {
        const box = el('tools-chart'); const legend = el('tools-chart-legend'); const note = el('tools-chart-note');
        if (!box) return;
        const { rows, real, max } = chartData();
        box.innerHTML = rows.map(r => `<div class="tools-bar-row"><span class="tools-bar-label">${esc(r.cat)}</span><div class="tools-bar" role="img" aria-label="${esc(r.cat)}">${r.segs.filter(s => s.value > 0).map(s => `<span style="width:${(s.value / max) * 100}%;background:${esc(s.role.avatarColor || '#64748b')}" title="${esc(s.role.name)}: ${s.value}"></span>`).join('')}</div><em>${r.segs.reduce((a, s) => a + s.value, 0)}</em></div>`).join('');
        if (legend) legend.innerHTML = state.roles.slice(0, 7).map(r => `<span><i style="background:${esc(r.avatarColor || '#64748b')}"></i>${esc(r.name)}</span>`).join('');
        if (note) note.textContent = real ? `Berdasarkan ${state.jobs.length} job Kantor AI nyata (appState.aiJobs / GET /api/ai/jobs), dikelompokkan per karyawan & kategori peralatan.` : 'Data contoh lokal — belum ada job Kantor AI nyata yang tercatat, jadi angka ini ilustrasi deterministik dan akan digantikan data job nyata begitu tersedia.';
    }

    function render() { load(); renderApps(); renderUtilities(); renderIntegrations(); renderChart(); if (state.selectedId) renderDetail(); icons(); }

    /* ---------- Panel detail ---------- */
    function closeDetail() { state.selectedId = null; const p = el('tools-detail'); if (p) { p.classList.add('hidden'); p.innerHTML = ''; } renderApps(); renderUtilities(); }
    function renderDetail() {
        const panel = el('tools-detail'); const a = appById(state.selectedId);
        if (!panel || !a) return;
        const e = entry(a.id);
        const skills = SKILLS[a.id] || SKILLS.default;
        panel.classList.remove('hidden');
        panel.innerHTML = `<div class="tools-detail-head">
                <span class="tools-icon tools-icon-lg" style="background:${esc(a.color)}">${esc(a.initial)}</span>
                <div><h3>${esc(a.name)}</h3><p>${a.kind === 'utility' ? 'Utilitas bawaan PiK\'s Digital Lab' : 'Aplikasi untuk karyawan AI'}</p></div>
                <button type="button" class="tools-icon-btn" data-tools-close aria-label="Tutup panel"><i data-lucide="x"></i></button>
            </div>
            <section><h5>Koneksi</h5>
                ${e.connected ? `<p class="tools-connected"><i data-lucide="check-circle-2"></i> Terhubung ${esc(e.connectedAt || '')}</p><button type="button" class="btn btn-secondary btn-sm" data-tools-disconnect>Putuskan</button>`
                : `<p class="tools-muted">Belum terhubung.</p><button type="button" class="btn btn-primary btn-sm" data-tools-connect-panel><i data-lucide="plug"></i> Hubungkan</button>`}
            </section>
            <section><h5>Pelatihan</h5>
                ${e.trained ? `<p class="tools-connected"><i data-lucide="graduation-cap"></i> Sudah dilatih ${esc(e.trainedAt || '')}</p>` : `<p class="tools-muted"><i data-lucide="circle-dashed"></i> Belum dilatih pada ${esc(a.name)}</p><button type="button" class="btn btn-secondary btn-sm" data-tools-learn><i data-lucide="graduation-cap"></i> Pelajari</button>`}
            </section>
            <section><h5>Persetujuan <span class="tools-muted">— kapan karyawan harus bertanya dulu?</span></h5>
                <div class="tools-segmented" role="group" aria-label="Mode persetujuan">
                    <button type="button" class="${e.approval === 'dont' ? 'is-active' : ''}" data-tools-approval="dont">Jangan tanya</button>
                    <button type="button" class="${e.approval === 'ask' ? 'is-active' : ''}" data-tools-approval="ask">Tanya dulu <em>bawaan</em></button>
                </div><p class="tools-muted">Bawaan untuk alat ini: Tanya dulu.</p>
            </section>
            <section><h5>Aturan Anda</h5>
                <textarea id="tools-rules" class="form-control" rows="3" placeholder="mis. Jangan pernah email john@acme.com. Selalu cek sebelum mengirim email ke pelanggan.">${esc(e.rules || '')}</textarea>
            </section>
            <section><button type="button" class="tools-collapse" data-tools-toggle-instructions aria-expanded="${state.instructionsOpen}">Instruksi <span class="tools-muted">— yang diikuti karyawan Anda</span><i data-lucide="chevron-${state.instructionsOpen ? 'up' : 'down'}"></i></button>
                ${state.instructionsOpen ? `<textarea id="tools-instructions" class="form-control" rows="3" placeholder="Instruksi khusus cara memakai ${esc(a.name)}…">${esc(e.instructions || '')}</textarea>` : ''}
            </section>
            <section><h5>Keterampilan Terkait</h5><div class="tools-chips">${skills.map(s => `<span class="tools-chip"><i data-lucide="sparkles"></i>${esc(s)}</span>`).join('')}</div></section>
            <section><h5>Analitik <span class="tools-muted">aktivitas alat ini</span></h5>
                <div class="tools-analytics"><div><strong>${e.used || 0}</strong><span>Dipakai</span></div><div><strong>${e.succeeded || 0}</strong><span>Berhasil</span></div><div><strong>${e.failed || 0}</strong><span>Gagal</span></div></div>
            </section>
            <div class="tools-detail-foot">
                <label class="tools-enabled"><span class="tools-dot${e.enabled ? ' is-on' : ''}"></span>${e.enabled ? 'Aktif' : 'Nonaktif'}<button type="button" class="tools-switch${e.enabled ? ' is-on' : ''}" data-tools-enabled aria-pressed="${e.enabled}" aria-label="Aktif/nonaktif"><i></i></button></label>
                <button type="button" class="btn btn-danger btn-sm" data-tools-remove><i data-lucide="trash-2"></i> Hapus</button>
            </div>`;
        icons();
        const rules = el('tools-rules');
        if (rules) rules.addEventListener('input', () => { entry(a.id).rules = rules.value; save(); });
        const ins = el('tools-instructions');
        if (ins) ins.addEventListener('input', () => { entry(a.id).instructions = ins.value; save(); });
    }
    function openDetail(id) { state.selectedId = id; state.instructionsOpen = false; renderDetail(); renderApps(); renderUtilities(); }

    function toggleConnect(id) {
        const e = entry(id);
        e.connected = !e.connected;
        e.connectedAt = e.connected ? today() : '';
        if (e.connected) { e.used = (e.used || 0) + 1; e.succeeded = (e.succeeded || 0) + 1; }
        save(); renderApps(); renderUtilities(); if (state.selectedId === id) renderDetail();
        const a = appById(id); toast(`${a ? a.name : 'Aplikasi'} ${e.connected ? 'terhubung' : 'terputus'} (tersimpan lokal).`, e.connected ? 'emerald' : 'indigo');
    }

    /* ---------- Modal tambah ---------- */
    function openModal(html) { const r = el('tools-modal-root'); if (!r) return; r.innerHTML = `<div class="tools-modal-backdrop" data-tools-modal-close></div><div class="tools-modal" role="dialog" aria-modal="true">${html}</div>`; r.classList.remove('hidden'); icons(); const f = r.querySelector('input'); if (f) f.focus(); }
    function closeModal() { const r = el('tools-modal-root'); if (r) { r.classList.add('hidden'); r.innerHTML = ''; } }
    function openAddApp() {
        openModal(`<div class="tools-modal-head"><h3>Tambah Aplikasi</h3><button type="button" class="tools-icon-btn" data-tools-modal-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
        <p class="tools-muted">Aplikasi custom tampil di grid APPS dan punya panel detail yang sama. Hanya nama & deskripsi yang disimpan lokal — tidak ada kredensial.</p>
        <div class="tools-form"><label>Nama aplikasi *<input type="text" id="tools-add-name" class="form-control" placeholder="mis. Trello"></label>
        <label>Deskripsi singkat<input type="text" id="tools-add-desc" class="form-control" placeholder="Untuk apa aplikasi ini dipakai"></label></div>
        <div class="tools-modal-actions"><button type="button" class="btn btn-secondary" data-tools-modal-close>Batal</button><button type="button" class="btn btn-primary" data-tools-confirm-add-app><i data-lucide="plus"></i> Tambah Aplikasi</button></div>`);
    }
    function openAddIntegration(kind) {
        const labels = { servers: ['Tambah Server MCP', 'Nama server', 'URL server (opsional)'], agents: ['Tambah Agent A2A', 'Nama agent', 'URL agent (opsional)'], webhooks: ['Tambah Webhook', 'Nama webhook', 'URL webhook (opsional)'] };
        const [title, namePh, urlPh] = labels[kind];
        openModal(`<div class="tools-modal-head"><h3>${title}</h3><button type="button" class="tools-icon-btn" data-tools-modal-close aria-label="Tutup"><i data-lucide="x"></i></button></div>
        <p class="tools-muted">Entri disimpan lokal di perangkat ini (kunci <code>piks-tools-v1</code>) dan tampil di seksi Integrasi. Tidak ada koneksi jaringan yang dibuat dari halaman ini.</p>
        <div class="tools-form"><label>Nama *<input type="text" id="tools-int-name" class="form-control" placeholder="${namePh}"></label>
        <label>URL<input type="text" id="tools-int-url" class="form-control" placeholder="${urlPh}"></label></div>
        <div class="tools-modal-actions"><button type="button" class="btn btn-secondary" data-tools-modal-close>Batal</button><button type="button" class="btn btn-primary" data-tools-confirm-add-int="${kind}"><i data-lucide="plus"></i> ${title}</button></div>`);
    }

    async function syncFromApi() {
        try {
            if (typeof appState !== 'undefined' && Array.isArray(appState.aiJobs) && appState.aiJobs.length) { state.jobs = appState.aiJobs; state.jobsLoaded = true; }
            if (typeof api !== 'undefined' && api.get) {
                const [rolesData, jobsData] = await Promise.all([api.get('/api/ai/office/roles').catch(() => null), api.get('/api/ai/jobs').catch(() => null)]);
                if (rolesData && Array.isArray(rolesData.roles) && rolesData.roles.length) state.roles = rolesData.roles.map(r => ({ id: r.id, name: r.name, avatarColor: r.avatarColor }));
                if (jobsData && jobsData.success && Array.isArray(jobsData.jobs)) state.jobs = jobsData.jobs;
                else if (jobsData && Array.isArray(jobsData.jobs)) state.jobs = jobsData.jobs;
            }
        } catch (_) {}
        renderChart();
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-tools'); if (!root) return;
        root.addEventListener('click', (event) => {
            const connect = event.target.closest('[data-tools-connect]');
            if (connect) { event.stopPropagation(); toggleConnect(connect.getAttribute('data-tools-connect')); return; }
            const open = event.target.closest('[data-tools-open]');
            if (open) { openDetail(open.getAttribute('data-tools-open')); return; }
            const tab = event.target.closest('[data-tools-tab]');
            if (tab) { state.filter = tab.getAttribute('data-tools-tab'); root.querySelectorAll('[data-tools-tab]').forEach(b => { const on = b === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); }); renderApps(); return; }
            if (event.target.closest('[data-tools-add-app]')) { openAddApp(); return; }
            const addInt = event.target.closest('[data-tools-add-int]');
            if (addInt) { openAddIntegration(addInt.getAttribute('data-tools-add-int')); return; }
            const delInt = event.target.closest('[data-tools-del-int]');
            if (delInt) { const [kind, id] = delInt.getAttribute('data-tools-del-int').split(':'); state.data.integrations[kind] = (state.data.integrations[kind] || []).filter(x => x.id !== id); save(); renderIntegrations(); return; }
            if (event.target.closest('[data-tools-refresh-chart]')) { syncFromApi(); return; }
        });
        const search = el('tools-search');
        if (search) search.addEventListener('input', () => { state.query = search.value || ''; renderApps(); });

        const panel = el('tools-detail');
        if (panel) panel.addEventListener('click', (event) => {
            const a = appById(state.selectedId); if (!a) return; const e = entry(a.id);
            if (event.target.closest('[data-tools-close]')) { closeDetail(); return; }
            if (event.target.closest('[data-tools-disconnect]') || event.target.closest('[data-tools-connect-panel]')) { toggleConnect(a.id); return; }
            if (event.target.closest('[data-tools-learn]')) { e.trained = true; e.trainedAt = today(); e.used = (e.used || 0) + 1; save(); renderDetail(); toast(`${a.name} ditandai sudah dilatih (lokal).`, 'emerald'); return; }
            const appr = event.target.closest('[data-tools-approval]');
            if (appr) { e.approval = appr.getAttribute('data-tools-approval'); save(); renderDetail(); return; }
            if (event.target.closest('[data-tools-toggle-instructions]')) { state.instructionsOpen = !state.instructionsOpen; renderDetail(); return; }
            if (event.target.closest('[data-tools-enabled]')) { e.enabled = !e.enabled; save(); renderDetail(); return; }
            if (event.target.closest('[data-tools-remove]')) {
                const custom = state.data.customApps.some(x => x.id === a.id);
                if (custom) state.data.customApps = state.data.customApps.filter(x => x.id !== a.id);
                e.removed = true; e.connected = false; save(); closeDetail(); render();
                toast(`${a.name} dihapus dari daftar peralatan (lokal). Tambah lagi lewat Tambah Aplikasi bila perlu.`, 'indigo'); return;
            }
        });

        const modalRoot = el('tools-modal-root');
        if (modalRoot && modalRoot.parentElement !== document.body) document.body.appendChild(modalRoot);
        if (modalRoot) modalRoot.addEventListener('click', (event) => {
            if (event.target.closest('[data-tools-modal-close]')) { closeModal(); return; }
            if (event.target.closest('[data-tools-confirm-add-app]')) {
                const name = (el('tools-add-name') || {}).value ? el('tools-add-name').value.trim() : '';
                if (!name) { const i = el('tools-add-name'); if (i) i.focus(); return; }
                const desc = (el('tools-add-desc') || {}).value ? el('tools-add-desc').value.trim() : '';
                const existing = allApps().find(x => x.name.toLowerCase() === name.toLowerCase());
                if (existing) { entry(existing.id).removed = false; save(); closeModal(); render(); openDetail(existing.id); toast(`${name} sudah ada — ditampilkan kembali.`, 'indigo'); return; }
                const palette = ['#0ea5e9', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#14b8a6'];
                const appNew = { id: 'custom-' + Date.now().toString(36), name, initial: name.slice(0, 2), color: palette[state.data.customApps.length % palette.length], kind: 'app', desc };
                state.data.customApps.push(appNew); save(); closeModal(); render(); openDetail(appNew.id); return;
            }
            const confirmInt = event.target.closest('[data-tools-confirm-add-int]');
            if (confirmInt) {
                const kind = confirmInt.getAttribute('data-tools-confirm-add-int');
                const name = (el('tools-int-name') || {}).value ? el('tools-int-name').value.trim() : '';
                if (!name) { const i = el('tools-int-name'); if (i) i.focus(); return; }
                const url = (el('tools-int-url') || {}).value ? el('tools-int-url').value.trim() : '';
                state.data.integrations[kind].push({ id: 'int-' + Date.now().toString(36), name, url });
                save(); closeModal(); renderIntegrations(); toast(`${name} ditambahkan (lokal).`, 'emerald'); return;
            }
        });
        const detail = el('tools-detail');
        if (detail && detail.parentElement !== document.body) { /* tetap di dalam view agar mengikuti tema panel */ }
        render();
    }
    function open() { load(); render(); syncFromApi(); }

    window.ToolsPage = { bind, open };
})();
