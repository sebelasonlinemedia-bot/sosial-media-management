/**
 * Panel aktivitas kanan BERSAMA untuk halaman replika (Chat & Tasks).
 * Markup & gaya memakai kelas .cr-act-* / .cr-activity dari chat-replica.css;
 * logika dropdown + filter ter-scope per root halaman (bukan global),
 * supaya kedua halaman bisa hidup berdampingan tanpa saling menyentuh.
 * Data demo lokal (bukan backend): 1 Employee hired (employee) + 2 Team
 * created (team) + 19 Skill added (employee) + 1 Activity (team) = 23.
 */
(function () {
    const DEMO_ACTIVITY = [
        { kind: 'hired', scope: 'employee', category: 'workspace', label: 'Employee hired', title: 'sebelas online media hired Alice', time: '12m', icon: 'user-plus', color: 'c-green' },
        { kind: 'team', scope: 'team', category: 'workspace', label: 'Team created', title: 'Team created', time: '12m', icon: 'users', color: 'c-blue' }
    ].concat(Array.from({ length: 19 }, () => ({ kind: 'skill', scope: 'employee', category: 'workspace', label: 'Skill added', title: 'Skill added', time: '12m', icon: 'sparkles', color: 'c-violet' })), [
        { kind: 'team', scope: 'team', category: 'workspace', label: 'Team created', title: 'Team created', time: '12m', icon: 'users', color: 'c-blue' },
        { kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: 'Activity', time: '12m', icon: 'activity', color: 'c-teal' }
    ]);
    const SCOPE_LABELS = { company: 'Company', team: 'Team', employee: 'Employee' };
    const SHOW_LABELS = { all: 'All activity', run: 'Work runs', workspace: 'Workspace updates', attention: 'Needs attention' };
    const EMPTY_COPY = { all: ['No activity yet', 'Nothing to show for this scope.'], run: ['No work runs yet', 'Only when an employee actually ran.'], workspace: ['No workspace updates', 'Tasks, files, skips, settings will appear here.'], attention: ['Nothing needs attention', 'Failed, blocked, or waiting on you will appear here.'] };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }

    /** Markup panel (sama persis dengan yang semula statis di halaman Chat). */
    function markup() {
        return `
                <div class="cr-act-controls">
                    <div class="cr-act-dd" data-cr-dd="scope">
                        <button type="button" class="cr-act-pill" data-cr-dd-toggle="scope" aria-haspopup="true" aria-expanded="false"><i data-lucide="building-2"></i><span data-cr-scope-label>Company</span><i data-lucide="chevron-down" class="cr-act-chev"></i></button>
                        <div class="cr-act-menu hidden" data-cr-menu="scope" role="menu" aria-label="Whose activity">
                            <p class="cr-act-menu-title">Whose activity</p>
                            <button type="button" class="cr-act-opt is-selected" data-cr-scope="company" role="menuitemradio" aria-checked="true"><span class="cr-act-radio"></span><span class="cr-act-opt-main">Company</span></button>
                            <button type="button" class="cr-act-opt" data-cr-scope="team" role="menuitemradio" aria-checked="false"><span class="cr-act-radio"></span><span class="cr-act-opt-main">Team</span></button>
                            <button type="button" class="cr-act-opt" data-cr-scope="employee" role="menuitemradio" aria-checked="false"><span class="cr-act-radio"></span><span class="cr-act-opt-main">Employee</span></button>
                        </div>
                    </div>
                    <div class="cr-act-dd" data-cr-dd="show">
                        <button type="button" class="cr-act-pill" data-cr-dd-toggle="show" aria-haspopup="true" aria-expanded="false"><i data-lucide="layers"></i><span data-cr-show-label>All activity</span><i data-lucide="chevron-down" class="cr-act-chev"></i></button>
                        <div class="cr-act-menu cr-act-menu-wide hidden" data-cr-menu="show" role="menu" aria-label="Show activity">
                            <p class="cr-act-menu-title">Show</p>
                            <button type="button" class="cr-act-opt is-selected" data-cr-show="all" role="menuitemradio" aria-checked="true"><span class="cr-act-radio"></span><span class="cr-act-opt-main">All activity <span class="cr-act-count" data-cr-count="all">0</span><small>Everything, newest first</small></span></button>
                            <button type="button" class="cr-act-opt" data-cr-show="run" role="menuitemradio" aria-checked="false"><span class="cr-act-radio"></span><span class="cr-act-opt-main">Work runs <span class="cr-act-count" data-cr-count="run">0</span><small>Only when an employee actually ran</small></span></button>
                            <button type="button" class="cr-act-opt" data-cr-show="workspace" role="menuitemradio" aria-checked="false"><span class="cr-act-radio"></span><span class="cr-act-opt-main">Workspace updates <span class="cr-act-count" data-cr-count="workspace">0</span><small>Tasks, files, skips, settings</small></span></button>
                            <button type="button" class="cr-act-opt" data-cr-show="attention" role="menuitemradio" aria-checked="false"><span class="cr-act-radio"></span><span class="cr-act-opt-main">Needs attention <span class="cr-act-count" data-cr-count="attention">0</span><small>Failed, blocked, or waiting on you</small></span></button>
                        </div>
                    </div>
                </div>
                <div class="cr-activity"><p class="cr-no-activity">No activity yet</p></div>`;
    }

    function create(root) {
        if (!root) return null;
        const state = { scope: 'company', show: 'all', openDd: null, live: [] };
        function all() { return state.live.concat(DEMO_ACTIVITY); }
        function scoped() { return state.scope === 'company' ? all() : all().filter(i => i.scope === state.scope); }
        function close() {
            state.openDd = null;
            root.querySelectorAll('[data-cr-menu]').forEach(m => m.classList.add('hidden'));
            root.querySelectorAll('[data-cr-dd]').forEach(d => d.classList.remove('is-open'));
            root.querySelectorAll('[data-cr-dd-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false'));
        }
        function toggle(name) {
            const willOpen = state.openDd !== name; close(); if (!willOpen) return;
            state.openDd = name;
            const dd = root.querySelector(`[data-cr-dd="${name}"]`); const menu = root.querySelector(`[data-cr-menu="${name}"]`); const btn = root.querySelector(`[data-cr-dd-toggle="${name}"]`);
            if (dd) dd.classList.add('is-open'); if (menu) menu.classList.remove('hidden'); if (btn) btn.setAttribute('aria-expanded', 'true');
        }
        function render() {
            const box = root.querySelector('.cr-activity'); if (!box) return;
            const list = scoped();
            const counts = { all: list.length, run: list.filter(i => i.category === 'run').length, workspace: list.filter(i => i.category === 'workspace').length, attention: list.filter(i => i.category === 'attention').length };
            root.querySelectorAll('[data-cr-count]').forEach(n => { const k = n.getAttribute('data-cr-count'); if (k in counts) n.textContent = String(counts[k]); });
            const sl = root.querySelector('[data-cr-scope-label]'); if (sl) sl.textContent = SCOPE_LABELS[state.scope] || 'Company';
            const hl = root.querySelector('[data-cr-show-label]'); if (hl) hl.textContent = SHOW_LABELS[state.show] || 'All activity';
            root.querySelectorAll('[data-cr-scope]').forEach(b => { const on = b.getAttribute('data-cr-scope') === state.scope; b.classList.toggle('is-selected', on); b.setAttribute('aria-checked', String(on)); });
            root.querySelectorAll('[data-cr-show]').forEach(b => { const on = b.getAttribute('data-cr-show') === state.show; b.classList.toggle('is-selected', on); b.setAttribute('aria-checked', String(on)); });
            const filtered = state.show === 'all' ? list : list.filter(i => i.category === state.show);
            if (!filtered.length) { const c = EMPTY_COPY[state.show] || EMPTY_COPY.all; box.innerHTML = `<div class="cr-feed-empty"><strong>${esc(c[0])}</strong>${esc(c[1])}</div>`; return; }
            box.innerHTML = `<div class="cr-feed-head"><span>Last hour</span><span>${filtered.length}</span></div><div class="cr-feed">${filtered.map(i => `<div class="cr-act-item"><span class="cr-act-icon ${esc(i.color)}"><i data-lucide="${esc(i.icon)}"></i></span><span><span class="cr-act-label">${esc(i.label)}</span><span class="cr-act-title">${esc(i.title)}</span></span><span class="cr-act-time">${esc(i.time)}</span></div>`).join('')}</div>`;
            icons();
        }
        /** Tangani klik dropdown di dalam root; true bila sudah ditangani. */
        function handleClick(event) {
            const ddToggle = event.target.closest('[data-cr-dd-toggle]'); if (ddToggle && root.contains(ddToggle)) { toggle(ddToggle.getAttribute('data-cr-dd-toggle')); return true; }
            const scopeBtn = event.target.closest('[data-cr-scope]'); if (scopeBtn && root.contains(scopeBtn)) { state.scope = scopeBtn.getAttribute('data-cr-scope'); close(); render(); return true; }
            const showBtn = event.target.closest('[data-cr-show]'); if (showBtn && root.contains(showBtn)) { state.show = showBtn.getAttribute('data-cr-show'); close(); render(); return true; }
            return false;
        }
        document.addEventListener('click', (event) => { if (!event.target.closest('.cr-act-dd')) close(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
        return { render, close, handleClick, addLive(item) { state.live.unshift(item); render(); }, get scope() { return state.scope; }, get show() { return state.show; } };
    }

    window.ReplicaActivity = { create, markup, DEMO_ACTIVITY, SCOPE_LABELS, SHOW_LABELS };
})();
