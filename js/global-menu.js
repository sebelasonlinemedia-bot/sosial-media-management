/**
 * Menu kiri global — hanya rel ikon tipis (±64px) yang selalu tampil di semua
 * halaman setelah login (kecuali Aktivitas yang punya bawaannya). Panel tim
 * lebar hanya flyout sementara (klik tombol panel/Cmd+K), tertutup saat klik
 * di luar, Esc, memilih tujuan, atau muat ulang — tidak disimpan.
 * Klik anggota tim membuka Aktivitas tersaring ke karyawan itu.
 */
(function () {
    const TEAM = [
        { id: 'manager', name: 'Maya', role: 'Asisten Pribadi', color: '#34d399', online: true, crown: true },
        { id: 'strategist', name: 'Rani', role: 'Spesialis Dukungan', color: '#fb7185', online: true },
        { id: 'copywriter', name: 'Dimas', role: 'Manajer Pemasaran', color: '#60a5fa', online: true },
        { id: 'analyst', name: 'Bimo', role: 'Analis Data', color: '#a78bfa', online: false },
        { id: 'compliance', name: 'Nadira', role: 'Perwakilan Penjualan', color: '#fbbf24', online: true },
        { id: 'finance', name: 'Fajar', role: 'Akuntan', color: '#94a3b8', online: false },
        { id: 'sales', name: 'Reno', role: 'Paralegal', color: '#38bdf8', online: false },
        { id: 'visual-producer', name: 'Salsa', role: 'Desainer Grafis', color: '#f472b6', online: true },
        { id: 'product', name: 'Prama', role: 'Manajer Operasi', color: '#fb923c', online: false },
        { id: 'community-manager', name: 'Titin', role: 'Manajer SDM', color: '#4ade80', online: true },
        { id: 'people', name: 'Kirana', role: 'Desainer Produk', color: '#c084fc', online: true }
    ];
    const ACTIVE = new Set(['working', 'publishing', 'queued', 'awaiting_approval', 'needs_info']);
    const state = { query: '', orgOpen: true, teamOpen: true, account: 'personal', team: TEAM.map(p => ({ ...p })) };

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function avatar(person) {
        const crown = person.crown
            ? '<svg class="act-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7.5 7.2 12 12 5l4.8 7L21 7.5 19.2 18H4.8L3 7.5z"/></svg>' : '';
        return `<span class="act-av" style="background:${esc(person.color)}">${esc(person.name.charAt(0))}${crown}<i class="act-dot${person.online ? ' is-on' : ''}"></i></span>`;
    }
    function renderMembers() {
        const box = document.getElementById('gm-members');
        const count = document.getElementById('gm-team-count');
        const live = document.getElementById('gm-live-count');
        const sub = document.getElementById('gm-live-sub');
        const q = state.query.trim().toLowerCase();
        const list = q ? state.team.filter(p => p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) : state.team;
        const online = state.team.filter(p => p.online).length;
        if (count) count.textContent = String(state.team.length);
        if (live) live.textContent = online.toLocaleString('id-ID');
        if (sub) sub.textContent = `dari ${state.team.length.toLocaleString('id-ID')} direkrut`;
        if (!box) return;
        box.hidden = !state.teamOpen;
        box.innerHTML = list.length
            ? list.map(p => `<button type="button" class="act-member" data-gm-member="${esc(p.id)}" role="option" aria-selected="false" title="Lihat aktivitas ${esc(p.name)}">${avatar(p)}<span class="act-member-text"><strong>${esc(p.name)}</strong><span>${esc(p.role)}</span></span></button>`).join('')
            : '<p class="act-empty">Tidak ada karyawan dengan kata itu.</p>';
        const orgBody = document.getElementById('gm-org-body');
        const orgBtn = document.getElementById('gm-org-toggle');
        const teamBtn = document.getElementById('gm-team-toggle');
        if (orgBody) orgBody.hidden = !state.orgOpen;
        if (orgBtn) { orgBtn.classList.toggle('is-shut', !state.orgOpen); orgBtn.setAttribute('aria-expanded', String(state.orgOpen)); }
        if (teamBtn) { teamBtn.classList.toggle('is-shut', !state.teamOpen); teamBtn.setAttribute('aria-expanded', String(state.teamOpen)); }
        if (window.lucide) lucide.createIcons();
    }
    function setPanel(open) {
        // Panel tim hanya flyout sementara di atas rel ikon; tidak pernah
        // disimpan ke localStorage dan tidak menggeser konten utama.
        document.body.classList.toggle('gm-roster-open', !!open);
        document.body.classList.remove('gm-roster-collapsed');
        const btn = document.getElementById('gm-toggle-roster');
        if (btn) {
            btn.setAttribute('aria-expanded', String(!!open));
            btn.setAttribute('title', open ? 'Tutup panel tim' : 'Buka panel tim');
            btn.classList.toggle('is-active', !!open);
        }
    }
    function closePanel() { setPanel(false); }
    // Kompatibilitas mundur untuk pemanggil lama: collapsed=true berarti tutup.
    function setCollapsed(collapsed) { setPanel(!collapsed); }
    function sync(view) {
        document.querySelectorAll('[data-gm-nav]').forEach(btn => {
            const on = btn.getAttribute('data-gm-nav') === view;
            btn.classList.toggle('is-active', on);
            if (on) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
        });
        closePanel();
    }
    async function syncLive() {
        if (typeof api === 'undefined' || !api.get) return;
        try {
            const data = await api.get('/api/ai/office');
            const employees = data && Array.isArray(data.employees) ? data.employees : [];
            if (!employees.length || !employees.some(e => ACTIVE.has(e.status))) return;
            const byId = new Map(employees.map(e => [e.id, e]));
            state.team.forEach(p => { const live = byId.get(p.id); if (live) p.online = ACTIVE.has(live.status); });
            renderMembers();
        } catch (_) { /* tampilan awal tetap utuh */ }
    }
    function bind() {
        const root = document.getElementById('global-side-menu');
        if (!root) return;
        // Normalkan preferensi versi lama: panel selalu tertutup saat muat.
        try { localStorage.removeItem('gm-roster-collapsed'); } catch (_) {}
        setPanel(false);

        root.addEventListener('click', (event) => {
            const member = event.target.closest('[data-gm-member]');
            if (member) {
                const id = member.getAttribute('data-gm-member');
                closePanel();
                // `app` adalah binding global leksikal dari app.js (bukan window.app)
                if (typeof app !== 'undefined' && app.switchView) app.switchView('activity');
                if (window.ActivityPage && ActivityPage.focusMember) ActivityPage.focusMember(id);
                return;
            }
            const nav = event.target.closest('[data-gm-nav]');
            if (nav && typeof app !== 'undefined' && app.switchView) {
                const view = nav.getAttribute('data-gm-nav');
                closePanel();
                sync(view);
                app.switchView(view);
            }
        });
        // Klik di luar panel/rel menutup flyout.
        document.addEventListener('click', (event) => {
            if (!document.body.classList.contains('gm-roster-open')) return;
            if (!event.target.closest('#global-side-menu')) closePanel();
        });
        const search = document.getElementById('gm-search');
        if (search) search.addEventListener('input', () => { state.query = search.value || ''; renderMembers(); });
        const orgBtn = document.getElementById('gm-org-toggle');
        if (orgBtn) orgBtn.addEventListener('click', () => { state.orgOpen = !state.orgOpen; renderMembers(); });
        const teamBtn = document.getElementById('gm-team-toggle');
        if (teamBtn) teamBtn.addEventListener('click', () => { state.teamOpen = !state.teamOpen; renderMembers(); });
        const toggle = document.getElementById('gm-toggle-roster');
        if (toggle) toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            setPanel(!document.body.classList.contains('gm-roster-open'));
        });
        const accountBtn = document.getElementById('gm-account-btn');
        const accountMenu = document.getElementById('gm-account-menu');
        if (accountBtn && accountMenu) {
            accountBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = accountMenu.classList.toggle('hidden') === false;
                accountBtn.setAttribute('aria-expanded', String(open));
            });
            document.addEventListener('click', () => { accountMenu.classList.add('hidden'); accountBtn.setAttribute('aria-expanded', 'false'); });
        }
        root.querySelectorAll('[data-gm-account]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.account = btn.getAttribute('data-gm-account');
                const label = document.getElementById('gm-account-label');
                const av = document.getElementById('gm-account-av');
                if (label) label.textContent = state.account === 'agency' ? 'Akun Agensi' : 'Akun Personal';
                if (av) av.textContent = state.account === 'agency' ? 'A' : 'P';
                if (accountMenu) accountMenu.classList.add('hidden');
            });
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.body.classList.contains('gm-roster-open')) {
                closePanel();
                const toggleBtn = document.getElementById('gm-toggle-roster');
                if (toggleBtn) toggleBtn.focus();
                return;
            }
            if (document.body.classList.contains('is-login-mode') || document.body.classList.contains('is-activity-mode')) return;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                setPanel(true);
                const input = document.getElementById('gm-search');
                if (input) { event.preventDefault(); input.focus(); }
            }
        });
        renderMembers();
        sync((location.hash || '').replace(/^#/, '') || 'mission');
        syncLive();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
    window.GlobalSideMenu = { sync, setCollapsed, setPanel, openPanel: () => setPanel(true), closePanel, refresh: renderMembers };
})();
