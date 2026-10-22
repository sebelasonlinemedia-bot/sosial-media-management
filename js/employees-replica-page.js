/**
 * Halaman Employees — replika referensi Company Employees Directory +
 * Marketplace talenta AI (mode Hire, di halaman yang sama).
 * Data lokal saja; keadaan tersimpan di localStorage `piks-employees-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 * Nama/deskripsi yang buram pada referensi direkonstruksi wajar & konsisten.
 */
(function () {
    const STORAGE_KEY = 'piks-employees-replica-v1';
    // Urutan mengikuti gambar 2–5: tersedia (ungu Hire) → Custom (hijau) →
    // Temporarily unavailable (emas) → Coming Soon (ungu gelap).
    const TALENTS = [
        { id: 'alice', first: 'Alice', name: 'Alice', role: 'Personal Assistant', dept: 'ASSISTANT', status: 'available', photo: 'https://randomuser.me/api/portraits/women/44.jpg', color: '#d97706', desc: 'Keeps your day running — scheduling, inbox and follow-ups handled end to end.' },
        { id: 'kenji', first: 'Kenji', name: 'Kenji', role: 'Sales Representative', dept: 'SALES', status: 'available', photo: 'https://randomuser.me/api/portraits/men/32.jpg', color: '#2563eb', desc: 'Prospects, qualifies and follows up with your pipeline every single day.' },
        { id: 'eva', first: 'Eva', name: 'Eva', role: 'Marketing Manager', dept: 'MARKETING', status: 'available', photo: 'https://randomuser.me/api/portraits/women/68.jpg', color: '#db2777', desc: 'Plans campaigns and keeps every channel on brand, on schedule, on message.' },
        { id: 'custom', first: 'Custom AI Talent', name: 'Custom AI Talent', role: 'Any Role You Need', dept: 'CUSTOM', status: 'custom', photo: '', color: '#102a43', desc: 'Tell us the role — a specialist agent shaped around your exact workflow.' },
        { id: 'max', first: 'Max', name: 'Max', role: 'Operations Manager', dept: 'OPERATIONS', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/men/22.jpg', color: '#0891b2', desc: 'Keeps processes, vendors and deadlines moving without dropping a beat.' },
        { id: 'aisha', first: 'Aisha', name: 'Aisha', role: 'Support Specialist', dept: 'SUPPORT', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/women/21.jpg', color: '#7c3aed', desc: 'Answers customers with care and resolves tickets before they escalate.' },
        { id: 'kojo', first: 'Kojo', name: 'Kojo', role: 'Accountant', dept: 'FINANCE', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/men/85.jpg', color: '#0d9488', desc: 'Books, reconciliations and reports kept accurate and always up to date.' },
        { id: 'kamran', first: 'Kamran', name: 'Kamran', role: 'HR Manager', dept: 'HR', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/women/17.jpg', color: '#b45309', desc: 'Hiring, onboarding and people operations run warmly and by the book.' },
        { id: 'kofi', first: 'Kofi', name: 'Kofi', role: 'Data Analyst', dept: 'DATA', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/men/52.jpg', color: '#4f46e5', desc: 'Turns raw numbers into clear dashboards and decisions you can trust.' },
        { id: 'sara', first: 'Sara', name: 'Sara', role: 'Product Designer', dept: 'PRODUCT', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/women/79.jpg', color: '#be185d', desc: 'Designs product flows that feel simple, useful and quietly beautiful.' },
        { id: 'marco', first: 'Marco', name: 'Marco', role: 'Paralegal', dept: 'LEGAL', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/men/41.jpg', color: '#475569', desc: 'Drafts, reviews and organises legal documents with careful precision.' },
        { id: 'marisol', first: 'Marisol', name: 'Marisol', role: 'Graphic Designer', dept: 'DESIGN', status: 'unavailable', photo: 'https://randomuser.me/api/portraits/women/33.jpg', color: '#9333ea', desc: 'Creates scroll-stopping visuals matched to your brand at a glance.' },
        { id: 'dale', first: 'Dale', name: 'Dale', role: 'Software Engineer', dept: 'ENGINEERING', status: 'coming', photo: 'https://randomuser.me/api/portraits/men/17.jpg', color: '#0369a1', desc: 'Ships reliable features and keeps the codebase clean and tested.' },
        { id: 'mei', first: 'Mei', name: 'Mei', role: 'Security Analyst', dept: 'SECURITY', status: 'coming', photo: 'https://randomuser.me/api/portraits/women/90.jpg', color: '#15803d', desc: 'Watches systems around the clock and flags risks before they bite.' },
        { id: 'diego', first: 'Diego', name: 'Diego', role: 'IT Administrator', dept: 'IT', status: 'coming', photo: 'https://randomuser.me/api/portraits/men/64.jpg', color: '#a16207', desc: 'Keeps accounts, devices and access running smoothly for everyone.' },
        { id: 'lena', first: 'Lena', name: 'Lena', role: 'QA Manager', dept: 'QUALITY', status: 'coming', photo: 'https://randomuser.me/api/portraits/women/50.jpg', color: '#c2410c', desc: 'Tests every release so only polished work reaches your customers.' }
    ];
    const FALLBACK_EMPLOYEES = [
        { id: 'alice', name: 'Alice', role: 'Personal Assistant', color: '#d97706' },
        { id: 'maya', name: 'Maya', role: 'Manager', color: '#e11d48' },
        { id: 'rani', name: 'Rani', role: 'Strategist', color: '#0d9488' }
    ];
    const STAT_DEFS = [
        { key: 'tasks', label: 'Tasks', color: '#60a5fa' },
        { key: 'skills', label: 'Skills', color: '#a78bfa' },
        { key: 'runs', label: 'Runs', color: '#34d399' },
        { key: 'score', label: 'Score', color: '#fbbf24' }
    ];

    function defaultState() {
        return {
            teams: [
                { id: 'team-core', name: 'Core Team' },
                { id: 'team-new', name: 'New Team' }
            ],
            employees: [
                { id: 'emp-alice', talentId: 'alice', name: 'Alice', role: 'Personal Assistant', teamId: 'team-core', color: '#d97706', photo: TALENTS[0].photo, stats: { tasks: 12, skills: 8, runs: 24, score: 96 } }
            ],
            hired: [],
            mode: 'directory'
        };
    }
    const state = { bound: false, app: null, activity: null, teams: [], employees: [], hired: [], mode: 'directory', search: '', filter: 'all', profileId: null, dragId: null };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
    function talentById(id) { return TALENTS.find(t => t.id === id) || null; }
    function teamById(id) { return state.teams.find(t => t.id === id) || state.teams[0] || null; }
    function statsFor(seed) {
        let h = 0; const s = String(seed || 'x'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
        return { tasks: 4 + (h % 14), skills: 3 + (h % 9), runs: 6 + (h % 26), score: 82 + (h % 17) };
    }

    function load() {
        const d = defaultState();
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.teams = (s && Array.isArray(s.teams) && s.teams.length) ? s.teams.filter(t => t && t.id && t.name) : d.teams;
            state.employees = (s && Array.isArray(s.employees)) ? s.employees.filter(e => e && e.id && e.name && e.role) : d.employees;
            state.hired = (s && Array.isArray(s.hired)) ? s.hired.filter(id => TALENTS.some(t => t.id === id)) : d.hired;
            state.mode = (s && (s.mode === 'marketplace' || s.mode === 'directory')) ? s.mode : 'directory';
        } catch (_) { state.teams = d.teams; state.employees = d.employees; state.hired = d.hired; state.mode = 'directory'; }
        if (!state.teams.length) state.teams = d.teams;
        state.employees.forEach(e => { if (!teamById(e.teamId)) e.teamId = state.teams[0].id; if (!e.stats) e.stats = statsFor(e.name); });
    }
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ teams: state.teams, employees: state.employees, hired: state.hired, mode: state.mode })); } catch (_) {}
    }

    function renderEmployeesPanel() {
        const box = el('em-employees'); if (!box) return;
        const list = state.employees.length ? state.employees : FALLBACK_EMPLOYEES;
        box.innerHTML = list.map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)}"><span class="cr-avatar" style="background:${esc(e.color || '#475569')}">${esc((e.name || '?')[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function statHtml(emp) {
        const st = emp.stats || statsFor(emp.name);
        return `<div class="em-mini-stats">${STAT_DEFS.map(d => `<span class="em-stat"><i style="background:${d.color}"></i>${d.label}<strong style="color:${d.color}">${esc(st[d.key])}</strong></span>`).join('')}</div>`;
    }
    function avatarHtml(emp, cls) {
        const initial = esc((emp.name || '?').trim()[0] || '?');
        if (emp.photo) return `<span class="em-avatar ${cls || ''}" style="background:${esc(emp.color || '#475569')}"><span>${initial}</span><img src="${esc(emp.photo)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
        return `<span class="em-avatar ${cls || ''}" style="background:${esc(emp.color || '#475569')}"><span>${initial}</span></span>`;
    }

    function renderDirectory() {
        const wrap = el('em-teams'); if (!wrap) return;
        const branch = el('em-branch'); if (branch) branch.style.width = Math.min(180 + state.teams.length * 120, 760) + 'px';
        wrap.innerHTML = state.teams.map(team => {
            const members = state.employees.filter(e => e.teamId === team.id);
            return `<section class="em-team" data-em-team-drop="${esc(team.id)}" aria-label="${esc(team.name)}">
                <header class="em-team-head"><span class="em-team-title"><i data-lucide="users"></i>${esc(team.name)}</span><span class="em-team-count">${members.length}</span>
                <button type="button" class="em-team-del" data-em-del-team="${esc(team.id)}" title="Hapus tim ${esc(team.name)}" aria-label="Hapus tim ${esc(team.name)}"><i data-lucide="x"></i></button></header>
                <div class="em-team-body">
                ${members.length ? members.map(emp => `<article class="em-mini" draggable="true" data-em-drag="${esc(emp.id)}">
                    <div class="em-mini-top">${avatarHtml(emp)}<span class="em-mini-id"><strong>${esc(emp.name)}</strong><span>${esc(emp.role)}</span></span></div>
                    ${statHtml(emp)}
                    <div class="em-mini-actions">
                        <button type="button" class="em-mini-btn" data-em-chat="${esc(emp.id)}"><i data-lucide="message-square"></i>Chat</button>
                        <button type="button" class="em-mini-btn" data-em-profile="${esc(emp.id)}"><i data-lucide="circle-user-round"></i>Profile</button>
                        <button type="button" class="em-mini-btn em-mini-hire" data-em-open-hire title="Buka Marketplace untuk merekrut"><i data-lucide="user-plus"></i>Hire</button>
                    </div>
                    <label class="em-move">Move<select data-em-move="${esc(emp.id)}" aria-label="Pindah tim untuk ${esc(emp.name)}">${state.teams.map(t => `<option value="${esc(t.id)}"${t.id === emp.teamId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
                </article>`).join('') : '<p class="em-empty-team">Drag people here</p>'}
                </div>
            </section>`;
        }).join('');
        icons();
    }

    function talentButton(t) {
        if (state.hired.includes(t.id)) return `<button type="button" class="em-talent-btn is-hired" disabled><i data-lucide="check"></i>Hired</button>`;
        if (t.status === 'available') return `<button type="button" class="em-talent-btn is-hire" data-em-hire="${esc(t.id)}"><i data-lucide="user-plus"></i>Hire</button>`;
        if (t.status === 'custom') return `<button type="button" class="em-talent-btn is-custom" data-em-hire="${esc(t.id)}"><i data-lucide="sparkles"></i>Hire Custom Talent</button>`;
        if (t.status === 'unavailable') return `<button type="button" class="em-talent-btn is-unavailable" disabled><i data-lucide="clock"></i>Temporarily unavailable</button>`;
        return `<button type="button" class="em-talent-btn is-coming" disabled><i data-lucide="hourglass"></i>Coming Soon</button>`;
    }
    function renderMarketplace() {
        const grid = el('em-talent-grid'); if (!grid) return;
        const q = state.search.trim().toLowerCase();
        const list = TALENTS.filter(t => {
            if (state.filter === 'available' && !(t.status === 'available' || t.status === 'custom')) return false;
            if (state.filter === 'unavailable' && t.status !== 'unavailable') return false;
            if (state.filter === 'coming' && t.status !== 'coming') return false;
            if (state.filter === 'hired' && !state.hired.includes(t.id)) return false;
            if (!q) return true;
            return `${t.name} ${t.role} ${t.dept}`.toLowerCase().includes(q);
        });
        const count = el('em-market-count'); if (count) count.textContent = String(TALENTS.length);
        grid.innerHTML = list.length ? list.map(t => `<article class="em-talent" data-em-talent="${esc(t.id)}">
            <div class="em-talent-photo" style="background:${esc(t.color)}"><span class="em-talent-initial">${esc(t.first[0])}</span>${t.photo ? `<img src="${esc(t.photo)}" alt="Portrait ${esc(t.name)}" loading="lazy" onerror="this.remove()">` : '<span class="em-custom-figure"><i data-lucide="user-round"></i></span>'}<span class="em-talent-shade"></span></div>
            <span class="em-talent-icons" aria-hidden="true"><i data-lucide="message-square"></i><i data-lucide="file-text"></i><i data-lucide="calendar-days"></i><i data-lucide="sparkles"></i></span>
            <span class="em-talent-dept">${esc(t.dept)}</span>
            <div class="em-talent-info"><span class="em-talent-first">${esc(t.first)}</span><h3>${esc(t.role)}</h3><p>${esc(t.desc)}</p>${talentButton(t)}</div>
        </article>`).join('') : '<p class="em-no-results">No talent matches your search.</p>';
        icons();
    }

    function renderMode() {
        const dir = el('em-directory'); const mkt = el('em-marketplace');
        const isMkt = state.mode === 'marketplace';
        if (dir) dir.classList.toggle('hidden', isMkt);
        if (mkt) mkt.classList.toggle('hidden', !isMkt);
        document.querySelectorAll('[data-em-main-tab]').forEach(b => {
            const on = (b.getAttribute('data-em-main-tab') === 'marketplace') === isMkt;
            b.classList.toggle('is-active', on);
        });
        if (isMkt) renderMarketplace(); else renderDirectory();
    }
    function render() { renderEmployeesPanel(); renderDirectory(); renderMarketplace(); renderMode(); }

    function setMode(mode) { state.mode = mode === 'marketplace' ? 'marketplace' : 'directory'; save(); renderMode(); icons(); }

    function hireTalent(id) {
        const t = talentById(id); if (!t) return;
        if (t.status !== 'available' && t.status !== 'custom') return;
        if (!state.hired.includes(t.id)) state.hired.push(t.id);
        if (!state.employees.some(e => e.talentId === t.id)) {
            const target = state.teams.find(tm => /core/i.test(tm.name)) || state.teams[0];
            state.employees.push({ id: uid('emp'), talentId: t.id, name: t.name === 'Custom AI Talent' ? 'Custom Talent' : t.first, role: t.role, teamId: target ? target.id : 'team-core', color: t.color, photo: t.photo, stats: statsFor(t.id) });
        }
        if (state.activity) state.activity.addLive({ kind: 'hired', scope: 'employee', category: 'workspace', label: 'Employee hired', title: `sebelas online media hired ${t.first}`, time: 'now', icon: 'user-plus', color: 'c-green' });
        save(); render();
    }

    function openProfile(id) {
        const emp = state.employees.find(e => e.id === id); if (!emp) return;
        state.profileId = id;
        const team = teamById(emp.teamId);
        const body = el('em-profile-body'); if (!body) return;
        body.innerHTML = `<div class="em-profile-top">${avatarHtml(emp, 'em-avatar-lg')}<span><strong>${esc(emp.name)}</strong><span>${esc(emp.role)}</span><small>${esc(team ? team.name : '')}</small></span></div>${statHtml(emp)}`;
        const modal = el('em-profile-modal'); if (modal) modal.classList.remove('hidden');
        icons();
    }
    function closeModals() {
        ['em-profile-modal', 'em-new-modal'].forEach(id => { const m = el(id); if (m) m.classList.add('hidden'); });
        state.profileId = null;
    }
    function openNewEmployee() {
        const sel = el('em-f-team'); if (sel) sel.innerHTML = state.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
        const m = el('em-new-modal'); if (m) m.classList.remove('hidden');
        const name = el('em-f-name'); if (name) { name.value = ''; name.focus(); }
        const role = el('em-f-role'); if (role) role.value = '';
    }
    function submitNewEmployee(event) {
        event.preventDefault();
        const name = (el('em-f-name')?.value || '').trim(); const role = (el('em-f-role')?.value || '').trim();
        const teamId = el('em-f-team')?.value || (state.teams[0] && state.teams[0].id);
        if (!name || !role || !teamId) return;
        const colors = ['#2563eb', '#db2777', '#0d9488', '#d97706', '#7c3aed', '#059669'];
        state.employees.push({ id: uid('emp'), talentId: '', name, role, teamId, color: colors[state.employees.length % colors.length], photo: '', stats: statsFor(name + role) });
        if (state.activity) state.activity.addLive({ kind: 'hired', scope: 'employee', category: 'workspace', label: 'Employee hired', title: `sebelas online media hired ${name}`, time: 'now', icon: 'user-plus', color: 'c-green' });
        save(); render(); closeModals();
    }
    function createTeam() {
        const n = state.teams.length + 1;
        const team = { id: uid('team'), name: `New Team ${n}` };
        state.teams.push(team);
        if (state.activity) state.activity.addLive({ kind: 'team', scope: 'team', category: 'workspace', label: 'Team created', title: 'Team created', time: 'now', icon: 'users', color: 'c-blue' });
        save(); render();
    }
    function deleteTeam(id) {
        if (state.teams.length <= 1) return;
        const fallback = state.teams.find(t => t.id !== id); if (!fallback) return;
        state.employees.forEach(e => { if (e.teamId === id) e.teamId = fallback.id; });
        state.teams = state.teams.filter(t => t.id !== id);
        save(); render();
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-employees-replica'); if (!root) return;
        const panel = el('em-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            if (event.target.closest('[data-em-open-hire]')) { setMode('marketplace'); return; }
            const hire = event.target.closest('[data-em-hire]'); if (hire) { hireTalent(hire.getAttribute('data-em-hire')); return; }
            if (event.target.closest('[data-em-back]')) { setMode('directory'); return; }
            if (event.target.closest('[data-em-create-team]')) { createTeam(); return; }
            if (event.target.closest('[data-em-new]')) { openNewEmployee(); return; }
            const delTeam = event.target.closest('[data-em-del-team]'); if (delTeam) { deleteTeam(delTeam.getAttribute('data-em-del-team')); return; }
            const prof = event.target.closest('[data-em-profile]'); if (prof) { openProfile(prof.getAttribute('data-em-profile')); return; }
            const chat = event.target.closest('[data-em-chat]'); if (chat && state.app && state.app.switchView) { state.app.switchView('chat'); return; }
            if (event.target.closest('[data-em-modal-close]') || event.target.classList.contains('em-modal')) { closeModals(); return; }
            const tab = event.target.closest('[data-em-main-tab]'); if (tab) { const v = tab.getAttribute('data-em-main-tab'); if (v === 'marketplace') setMode('marketplace'); else if (v === 'directory') setMode('directory'); return; }
            const exit = event.target.closest('[data-em-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-em-exit')); return; }
            const navKey = event.target.closest('[data-em-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-em-nav')); return; }
        });
        root.addEventListener('change', (event) => {
            const move = event.target.closest('[data-em-move]'); if (move) { const emp = state.employees.find(e => e.id === move.getAttribute('data-em-move')); if (emp) { emp.teamId = move.value; save(); render(); } return; }
            const filter = event.target.closest('[data-em-filter]'); if (filter) { state.filter = filter.value; renderMarketplace(); }
        });
        root.addEventListener('input', (event) => {
            if (event.target.id === 'em-search') { state.search = event.target.value; renderMarketplace(); }
        });
        root.addEventListener('dragstart', (event) => {
            const card = event.target.closest('[data-em-drag]'); if (!card) return;
            state.dragId = card.getAttribute('data-em-drag');
            try { event.dataTransfer.setData('text/plain', state.dragId); event.dataTransfer.effectAllowed = 'move'; } catch (_) {}
        });
        root.addEventListener('dragover', (event) => {
            const zone = event.target.closest('[data-em-team-drop]'); if (!zone) return;
            event.preventDefault(); zone.classList.add('is-over');
        });
        root.addEventListener('dragleave', (event) => {
            const zone = event.target.closest('[data-em-team-drop]'); if (zone) zone.classList.remove('is-over');
        });
        root.addEventListener('drop', (event) => {
            const zone = event.target.closest('[data-em-team-drop]'); if (!zone) return;
            event.preventDefault(); zone.classList.remove('is-over');
            const id = state.dragId || (() => { try { return event.dataTransfer.getData('text/plain'); } catch (_) { return ''; } })();
            const emp = state.employees.find(e => e.id === id); if (!emp) return;
            emp.teamId = zone.getAttribute('data-em-team-drop'); state.dragId = null; save(); render();
        });
        const form = el('em-form'); if (form) form.addEventListener('submit', submitNewEmployee);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModals(); });
        render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); state.search = ''; const s = el('em-search'); if (s) s.value = ''; render(); if (state.activity) state.activity.render(); icons(); }

    window.EmployeesReplicaPage = { bind, open, TALENTS, getState: () => ({ teams: state.teams.slice(), employees: state.employees.slice(), hired: state.hired.slice(), mode: state.mode }) };
})();
