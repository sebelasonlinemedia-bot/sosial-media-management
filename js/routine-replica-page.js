/**
 * Halaman Routine — replika visual referensi Company Working Hours / Routines.
 * Data lokal saja; TIDAK menjalankan pekerjaan nyata di backend mana pun.
 * Keadaan tersimpan di localStorage `piks-routine-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 * Teks panjang yang buram pada referensi ditulis ulang setara makna
 * (employee diam sampai ada pekerjaan nyata, izin email, eksekusi lokal, dsb.).
 */
(function () {
    const STORAGE_KEY = 'piks-routine-replica-v1';
    const FREQUENCIES = ['Every day', 'Every 24h', 'Every week', 'On standby only'];
    // Data demo awal (berlabel demo di UI); routine bawaan contoh.
    const DEFAULT_ROUTINES = [
        { id: 'rt-market', name: 'Market Updates', icon: 'trending-up', freq: 'Every 24h', desc: 'Your employee has been quiet. This is the routine that brings them back when there is real work to do. It watches the market signals you care about, and only wakes your employee when something has actually changed. When it runs, your employee checks the latest updates, works out what matters for your business, and prepares a short summary you can act on. If nothing has changed, they stay on standby and do nothing — no noise, no wasted work.', advanced: ['Can read email when a market digest arrives in the inbox', 'Runs locally in this workspace; nothing is sent outside without your review', 'Only acts on sources already connected to the company', 'Stays silent when there is no meaningful change to report'] },
        { id: 'rt-plan', name: 'Plan and wrap the agent', icon: 'list-checks', freq: 'Every week', desc: 'At the start of the period your employee plans the work ahead, and at the end they wrap it up. They review what was finished, what is still open, and what should happen next, then leave a clear plan the whole team can follow. If there is nothing new to plan, they stay on standby.', advanced: ['Reads the current task list before proposing a plan', 'Runs locally in this workspace', 'Never reassigns work without leaving a note for the team', 'Skips the wrap-up when no work was completed'] },
        { id: 'rt-meetings', name: 'Prepare me for upcoming meetings', icon: 'calendar-clock', freq: 'Every day', desc: 'Before each meeting, your employee prepares a short brief: who is attending, what was discussed last time, and what you may want to decide. They only prepare when a meeting is actually coming up — otherwise they stay on standby and do not disturb you.', advanced: ['Can read calendar events already connected to the workspace', 'Runs locally in this workspace', 'Does not message attendees on your behalf', 'Only prepares for meetings within the next working day'] },
        { id: 'rt-inbox', name: 'Manage my inbox', icon: 'inbox', freq: 'Every day', desc: 'Your employee keeps an eye on the shared inbox and sorts what arrives: urgent items first, routine items filed, and anything that needs your decision brought to the top. They never reply on your behalf without approval — if there is nothing new, they stay on standby.', advanced: ['Can read email in the connected company mailbox', 'Never sends a reply without your approval', 'Runs locally in this workspace', 'Leaves anything unclear untouched and flags it for you'] },
        { id: 'rt-brief', name: 'Brief me on my day', icon: 'sun', freq: 'Every day', desc: 'Each morning your employee prepares one short brief for your day: meetings, priorities, and anything waiting on you. It is a single summary, not a stream of messages. If your day is empty, the brief simply says so and they go back on standby.', advanced: ['Reads the day\u2019s calendar and open tasks', 'Runs locally in this workspace', 'One brief per day — no repeated reminders', 'Skips weekends unless a meeting is scheduled'] },
        { id: 'rt-team', name: 'Keep the team working', icon: 'users', freq: 'Every 24h', desc: 'This routine checks whether anyone in the team is blocked or idle. If real work is waiting, your employee picks it up or nudges the right person. If everything is moving, they stay quiet on standby and let the team work.', advanced: ['Reads team tasks before nudging anyone', 'Runs locally in this workspace', 'Never assigns work outside the team\u2019s agreed hours', 'Stays silent when every task is already in progress'] },
        { id: 'rt-leads', name: 'Pick up leads', icon: 'user-plus', freq: 'Every day', desc: 'When a new lead arrives, your employee picks it up straight away: they check the details, add it to the CRM, and prepare the first follow-up for your review. If no lead has arrived, they stay on standby and do nothing.', advanced: ['Can read new enquiries from the connected mailbox', 'Adds leads to the CRM but never contacts them unapproved', 'Runs locally in this workspace', 'Flags incomplete leads instead of guessing the details'] },
        { id: 'rt-heartbeat', name: 'Heartbeat', icon: 'heart-pulse', freq: 'Every 24h', desc: 'A quiet health check for the workspace. Your employee confirms that connections, routines and the team are all still working, and only speaks up if something looks wrong. When everything is healthy, the check is recorded and they return to standby.', advanced: ['Checks connected tools and recent routine runs', 'Runs locally in this workspace', 'Only alerts you when something actually failed', 'Records each check in Routine health below'] }
    ];
    const FALLBACK_EMPLOYEES = [
        { id: 'alice', name: 'Alice', role: 'Personal Assistant', color: '#d97706' },
        { id: 'maya', name: 'Maya', role: 'Manager', color: '#e11d48' },
        { id: 'rani', name: 'Rani', role: 'Strategist', color: '#0d9488' },
        { id: 'dimas', name: 'Dimas', role: 'Copywriter', color: '#2563eb' },
        { id: 'salsa', name: 'Salsa', role: 'Visual Producer', color: '#7c3aed' },
        { id: 'titin', name: 'Titin', role: 'Community Manager', color: '#059669' },
        { id: 'bimo', name: 'Bimo', role: 'Analyst', color: '#0891b2' },
        { id: 'nadira', name: 'Nadira', role: 'Compliance', color: '#475569' }
    ];
    const state = { bound: false, app: null, activity: null, routines: [], health: {}, expandedId: null };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
    function todayKey(d) { const x = d || new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
    function fmtRun(ts) { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } }

    function defaults() { return DEFAULT_ROUTINES.map(r => ({ ...r, active: false, lastRun: null })); }
    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.routines = (s && Array.isArray(s.routines) && s.routines.length) ? s.routines.filter(r => r && r.id && r.name).map(r => ({
                id: String(r.id), name: String(r.name), icon: String(r.icon || 'repeat'), freq: FREQUENCIES.includes(r.freq) ? r.freq : 'Every day',
                desc: String(r.desc || ''), advanced: Array.isArray(r.advanced) ? r.advanced.map(String) : [], active: !!r.active, lastRun: r.lastRun || null
            })) : defaults();
            state.health = (s && s.health && typeof s.health === 'object') ? s.health : {};
            state.expandedId = (s && state.routines.some(r => r.id === s.expandedId)) ? s.expandedId : null;
        } catch (_) { state.routines = defaults(); state.health = {}; state.expandedId = null; }
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ routines: state.routines, health: state.health, expandedId: state.expandedId })); } catch (_) {} }

    function renderEmployees() {
        const box = el('rt-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }
    function freqOptions(current) { return FREQUENCIES.map(f => `<option value="${esc(f)}"${f === current ? ' selected' : ''}>${esc(f)}</option>`).join(''); }

    function detailHtml(r) {
        return `<div class="rt-detail">
            <div class="rt-status-row">
                <div class="rt-status-text"><strong>${r.active ? 'Active — watching for work' : 'On standby until there is work'}</strong><span>${r.active ? 'This routine is switched on. It will run on its schedule below, and stay quiet when there is nothing to do.' : 'It will run automatically when work is added to this board, or you can run it yourself at any time.'}</span></div>
                <button type="button" class="rt-email-btn" title="Use email address (demo)">Use email address</button>
            </div>
            ${r.lastRun ? `<p class="rt-last-run"><i data-lucide="check-circle-2"></i> Last run ${esc(fmtRun(r.lastRun))} (demo lokal)</p>` : ''}
            <p class="rt-detail-label">What this routine does</p>
            <p class="rt-desc">${esc(r.desc || 'This routine watches for real work and only acts when there is something to do. Otherwise it stays on standby.')}</p>
            <div class="rt-when">
                <div class="rt-when-left"><p class="rt-detail-label">When it runs</p><select class="rt-freq-select" data-rt-freq="${esc(r.id)}" aria-label="Frekuensi ${esc(r.name)}">${freqOptions(r.freq)}</select><p class="rt-when-note">Repeat: runs on this schedule while switched on.</p></div>
                <div class="rt-when-right"><p class="rt-detail-label">Run it once</p><button type="button" class="rt-run" data-rt-run="${esc(r.id)}"><i data-lucide="play"></i> Run now</button></div>
            </div>
            <p class="rt-detail-label">Advanced</p>
            <ul class="rt-advanced">${(r.advanced && r.advanced.length ? r.advanced : ['Runs locally in this workspace', 'Stays on standby when there is no real work']).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
            <div class="rt-detail-actions"><button type="button" class="rt-del" data-rt-del="${esc(r.id)}"><i data-lucide="trash-2"></i> Delete routine</button></div>
        </div>`;
    }

    function renderList() {
        const box = el('rt-list'); if (!box) return;
        box.innerHTML = state.routines.length ? state.routines.map(r => `<article class="rt-row${state.expandedId === r.id ? ' is-open' : ''}" data-rt-row="${esc(r.id)}">
            <button type="button" class="rt-row-main" data-rt-toggle-row="${esc(r.id)}" aria-expanded="${String(state.expandedId === r.id)}">
                <span class="rt-row-icon"><i data-lucide="${esc(r.icon)}"></i></span>
                <span class="rt-row-name">${esc(r.name)}</span>
                ${r.lastRun ? `<span class="rt-row-ran">Ran ${esc(fmtRun(r.lastRun))}</span>` : ''}
            </button>
            <span class="rt-row-controls">
                <select class="rt-freq-pill" data-rt-freq="${esc(r.id)}" aria-label="Frekuensi ${esc(r.name)}" title="Ubah frekuensi ${esc(r.name)}">${freqOptions(r.freq)}</select>
                <span class="rt-standby"><span class="rt-standby-label">${r.active ? 'Active' : 'On standby'}</span><button type="button" class="rt-switch${r.active ? ' is-on' : ''}" data-rt-switch="${esc(r.id)}" role="switch" aria-checked="${String(r.active)}" aria-label="${r.active ? 'Matikan' : 'Nyalakan'} routine ${esc(r.name)}" title="${r.active ? 'Matikan' : 'Nyalakan'} routine ${esc(r.name)}"><span></span></button></span>
            </span>
            ${state.expandedId === r.id ? detailHtml(r) : ''}
        </article>`).join('') : '<p class="rt-empty">No routines yet. Use + Add Routine to create one.</p>';
        icons();
    }

    function renderHealth() {
        const box = el('rt-health-days'); if (!box) return;
        const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const now = new Date(); const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        let total = 0;
        box.innerHTML = labels.map((label, i) => {
            const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
            const count = Number(state.health[todayKey(d)] || 0); total += count;
            const isToday = todayKey(d) === todayKey(now);
            return `<span class="rt-day"><span class="rt-dot${count ? ' is-filled' : ''}${isToday ? ' is-today' : ''}" title="${esc(label)} — ${count} check(s)"></span><span>${esc(label)}</span></span>`;
        }).join('');
        const note = el('rt-health-note'); if (note) note.textContent = total ? `${total} routine check${total === 1 ? '' : 's'} recorded this week` : 'No routine checks recorded yet';
    }
    function render() { renderList(); renderHealth(); }

    function openModal() { const m = el('rt-modal'); if (m) m.classList.remove('hidden'); const n = el('rt-f-name'); if (n) { n.value = ''; n.focus(); } const d = el('rt-f-desc'); if (d) d.value = ''; const f = el('rt-f-freq'); if (f) f.value = 'Every day'; }
    function closeModal() { const m = el('rt-modal'); if (m) m.classList.add('hidden'); }
    function submitForm(event) {
        event.preventDefault();
        const name = (el('rt-f-name')?.value || '').trim(); if (!name) return;
        const freq = el('rt-f-freq')?.value || 'Every day';
        const desc = (el('rt-f-desc')?.value || '').trim();
        const r = { id: uid('rt'), name, icon: 'repeat', freq: FREQUENCIES.includes(freq) ? freq : 'Every day', desc: desc || 'This routine watches for real work and only acts when there is something to do. Otherwise it stays on standby.', advanced: ['Runs locally in this workspace', 'Stays on standby when there is no real work', 'Never acts outside this workspace without your review'], active: false, lastRun: null };
        state.routines.push(r); state.expandedId = r.id;
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Routine created: ${name}`, time: 'now', icon: 'repeat', color: 'c-teal' });
        save(); render(); closeModal();
    }
    function runNow(id) {
        const r = state.routines.find(x => x.id === id); if (!r) return;
        r.lastRun = Date.now();
        const key = todayKey(); state.health[key] = Number(state.health[key] || 0) + 1;
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'run', label: 'Activity', title: `Routine ran: ${r.name} (demo lokal)`, time: 'now', icon: 'play', color: 'c-green' });
        save(); render();
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-routine-replica'); if (!root) return;
        const panel = el('rt-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const sw = event.target.closest('[data-rt-switch]'); if (sw) { const r = state.routines.find(x => x.id === sw.getAttribute('data-rt-switch')); if (r) { r.active = !r.active; save(); render(); } return; }
            const run = event.target.closest('[data-rt-run]'); if (run) { runNow(run.getAttribute('data-rt-run')); return; }
            const del = event.target.closest('[data-rt-del]'); if (del) { const id = del.getAttribute('data-rt-del'); state.routines = state.routines.filter(x => x.id !== id); if (state.expandedId === id) state.expandedId = null; save(); render(); return; }
            if (event.target.closest('[data-rt-add]')) { openModal(); return; }
            if (event.target.closest('[data-rt-modal-close]') || event.target.id === 'rt-modal') { closeModal(); return; }
            const rowBtn = event.target.closest('[data-rt-toggle-row]'); if (rowBtn) { const id = rowBtn.getAttribute('data-rt-toggle-row'); state.expandedId = state.expandedId === id ? null : id; save(); render(); return; }
            const exit = event.target.closest('[data-rt-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-rt-exit')); return; }
            const navKey = event.target.closest('[data-rt-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-rt-nav')); return; }
        });
        root.addEventListener('change', (event) => {
            const sel = event.target.closest('[data-rt-freq]'); if (sel) { const r = state.routines.find(x => x.id === sel.getAttribute('data-rt-freq')); if (r && FREQUENCIES.includes(sel.value)) { r.freq = sel.value; save(); render(); } }
        });
        const form = el('rt-form'); if (form) form.addEventListener('submit', submitForm);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); if (state.activity) state.activity.render(); icons(); }

    window.RoutineReplicaPage = { bind, open, FREQUENCIES, getState: () => ({ routines: state.routines.slice(), health: { ...state.health }, expandedId: state.expandedId }) };
})();
