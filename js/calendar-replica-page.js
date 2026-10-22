/**
 * Halaman Calendar — replika visual referensi SisTava (Company Master Calendar).
 * Data acara demo lokal; TIDAK terhubung ke kalender lama (view `calendar` /
 * js/calendar-page.js tetap utuh & bisa dibuka via #calendar).
 * Acara tersimpan di localStorage `piks-calendar-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 */
(function () {
    const STORAGE_KEY = 'piks-calendar-replica-v1';
    const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const COLORS = ['#6366f1', '#0d9488', '#e11d48', '#d97706', '#059669', '#2563eb'];
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
    const now = new Date();
    const state = {
        bound: false, app: null, activity: null, events: [],
        viewMode: 'month',
        cursor: new Date(now.getFullYear(), now.getMonth(), 1),
        selected: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        openMenu: null
    };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function parseKey(k) { const p = String(k || '').split('-').map(Number); return p.length === 3 && p.every(n => !Number.isNaN(n)) ? new Date(p[0], p[1] - 1, p[2]) : null; }
    function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
    function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function load() { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); state.events = (s && Array.isArray(s.events)) ? s.events.filter(e => e && e.id && e.title && parseKey(e.date)) : []; } catch (_) { state.events = []; } }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ events: state.events })); } catch (_) {} }
    function eventsOn(k) { return state.events.filter(e => e.date === k).slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))); }

    function renderEmployees() {
        const box = el('cl-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function chipHtml(e) {
        return `<span class="cl-chip" style="background:${esc(e.color || COLORS[0])}" title="${esc(e.time ? e.time + ' · ' : '')}${esc(e.title)}"><span class="cl-chip-text">${esc(e.time ? e.time + ' ' : '')}${esc(e.title)}</span><button type="button" class="cl-chip-del" data-cl-del="${esc(e.id)}" title="Hapus acara" aria-label="Hapus acara ${esc(e.title)}"><i data-lucide="x"></i></button></span>`;
    }

    function renderLabel() {
        const label = el('cl-period-label'); if (!label) return;
        if (state.viewMode === 'month') label.textContent = `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;
        else if (state.viewMode === 'week') { const a = mondayOf(state.selected); const b = addDays(a, 6); label.textContent = a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`; }
        else { const d = state.selected; label.textContent = `${DAY_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
        document.querySelectorAll('[data-cl-view]').forEach(b => { const on = b.getAttribute('data-cl-view') === state.viewMode; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    }

    function renderMonth() {
        const wrap = el('cl-cal-body'); if (!wrap) return;
        const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
        const start = mondayOf(first);
        const today = new Date();
        let cells = '';
        for (let i = 0; i < 42; i++) {
            const d = addDays(start, i); const k = keyOf(d); const evs = eventsOn(k);
            const cls = ['cl-cell', d.getMonth() !== state.cursor.getMonth() ? 'is-out' : '', sameDay(d, today) ? 'is-today' : '', sameDay(d, state.selected) ? 'is-selected' : ''].filter(Boolean).join(' ');
            cells += `<div class="${cls}" data-cl-date="${k}" role="button" tabindex="0" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}${sameDay(d, today) ? ' (hari ini)' : ''}" title="Klik untuk memilih · klik ganda untuk menambah acara"><span class="cl-daynum${sameDay(d, today) ? ' is-today' : ''}">${d.getDate()}</span><span class="cl-chips">${evs.slice(0, 3).map(chipHtml).join('')}${evs.length > 3 ? `<span class="cl-more">+${evs.length - 3} more</span>` : ''}</span></div>`;
        }
        wrap.innerHTML = `<div class="cl-weekhead">${DAY_SHORT.map(d => `<span>${d}</span>`).join('')}</div><div class="cl-grid">${cells}</div>`;
    }

    function hourRows(days) {
        let html = `<div class="cl-time-head" style="grid-template-columns:44px repeat(${days.length},minmax(0,1fr))"><span></span>${days.map(d => `<span class="${sameDay(d, new Date()) ? 'is-today' : ''} ${sameDay(d, state.selected) ? 'is-selected' : ''}"><strong>${DAY_SHORT[(d.getDay() + 6) % 7]}</strong> ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</span>`).join('')}</div>`;
        for (let h = 0; h < 24; h++) {
            html += `<div class="cl-time-row" style="grid-template-columns:44px repeat(${days.length},minmax(0,1fr))"><span class="cl-hour">${pad(h)}:00</span>${days.map(d => { const k = keyOf(d); const evs = eventsOn(k).filter(e => parseInt(String(e.time || '09:00').split(':')[0], 10) === h); return `<span class="cl-hour-cell${sameDay(d, state.selected) ? ' is-selected' : ''}" data-cl-date="${k}" data-cl-hour="${h}" role="button" tabindex="0" title="Klik untuk memilih · klik ganda untuk menambah acara">${evs.map(chipHtml).join('')}</span>`; }).join('')}</div>`;
        }
        return `<div class="cl-timewrap">${html}</div>`;
    }
    function renderWeek() { const wrap = el('cl-cal-body'); if (!wrap) return; const a = mondayOf(state.selected); wrap.innerHTML = hourRows(Array.from({ length: 7 }, (_, i) => addDays(a, i))); }
    function renderDay() { const wrap = el('cl-cal-body'); if (!wrap) return; wrap.innerHTML = hourRows([state.selected]); }

    function render() { renderLabel(); if (state.viewMode === 'week') renderWeek(); else if (state.viewMode === 'day') renderDay(); else renderMonth(); icons(); }

    function step(dir) {
        if (state.viewMode === 'month') { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + dir, 1); state.selected = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), Math.min(state.selected.getDate(), 28)); }
        else if (state.viewMode === 'week') state.selected = addDays(state.selected, dir * 7);
        else state.selected = addDays(state.selected, dir);
        if (state.viewMode !== 'month') state.cursor = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
        render();
    }
    function goToday() { const t = new Date(); state.selected = new Date(t.getFullYear(), t.getMonth(), t.getDate()); state.cursor = new Date(t.getFullYear(), t.getMonth(), 1); render(); }

    function openModal(date, hour) {
        const d = date || state.selected || new Date();
        state.selected = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        state.cursor = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
        const dateInput = el('cl-event-date'); if (dateInput) dateInput.value = keyOf(state.selected);
        const timeInput = el('cl-event-time'); if (timeInput) timeInput.value = typeof hour === 'number' ? `${pad(hour)}:00` : '09:00';
        const title = el('cl-event-title'); if (title) title.value = '';
        const note = el('cl-event-note'); if (note) note.value = '';
        const modal = el('cl-modal'); if (modal) modal.classList.remove('hidden');
        render(); if (title) title.focus();
    }
    function closeModal() { const m = el('cl-modal'); if (m) m.classList.add('hidden'); }
    function submitForm(event) {
        event.preventDefault();
        const title = (el('cl-event-title')?.value || '').trim(); if (!title) return;
        const date = el('cl-event-date')?.value || keyOf(state.selected); if (!parseKey(date)) return;
        const time = el('cl-event-time')?.value || '09:00';
        const note = (el('cl-event-note')?.value || '').trim();
        const color = el('cl-event-color')?.value || COLORS[state.events.length % COLORS.length];
        state.events.push({ id: `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title, date, time, note, color });
        state.selected = parseKey(date); state.cursor = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
        save(); render(); closeModal();
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Calendar event added: ${title}`, time: 'now', icon: 'calendar-days', color: 'c-blue' });
    }

    function closeMenus() { state.openMenu = null; document.querySelectorAll('[data-cl-menu]').forEach(m => m.classList.add('hidden')); }
    function toggleMenu(name) {
        const willOpen = state.openMenu !== name; closeMenus(); if (!willOpen) return;
        state.openMenu = name; const m = document.querySelector(`[data-cl-menu="${name}"]`); if (m) m.classList.remove('hidden');
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-calendar-replica'); if (!root) return;
        const panel = el('cl-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const del = event.target.closest('[data-cl-del]'); if (del) { event.stopPropagation(); state.events = state.events.filter(e => e.id !== del.getAttribute('data-cl-del')); save(); render(); return; }
            if (event.target.closest('[data-cl-create]')) { openModal(state.selected); return; }
            if (event.target.closest('[data-cl-prev]')) { step(-1); return; }
            if (event.target.closest('[data-cl-next]')) { step(1); return; }
            if (event.target.closest('[data-cl-today]')) { goToday(); return; }
            const viewBtn = event.target.closest('[data-cl-view]'); if (viewBtn) { state.viewMode = viewBtn.getAttribute('data-cl-view'); render(); return; }
            const menuBtn = event.target.closest('[data-cl-menu-toggle]'); if (menuBtn) { toggleMenu(menuBtn.getAttribute('data-cl-menu-toggle')); return; }
            const proj = event.target.closest('[data-cl-project]'); if (proj) { const l = el('cl-project-label'); if (l) l.textContent = proj.getAttribute('data-cl-project'); closeMenus(); return; }
            if (event.target.closest('[data-cl-connect-opt]')) { closeMenus(); return; }
            if (!event.target.closest('.cl-dd')) closeMenus();
            if (event.target.closest('[data-cl-modal-close]') || event.target.id === 'cl-modal') { closeModal(); return; }
            const exit = event.target.closest('[data-cl-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-cl-exit')); return; }
            const navKey = event.target.closest('[data-cl-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-cl-nav')); return; }
            const cell = event.target.closest('[data-cl-date]');
            if (cell) { const d = parseKey(cell.getAttribute('data-cl-date')); if (d) { state.selected = d; state.cursor = new Date(d.getFullYear(), d.getMonth(), 1); render(); } return; }
        });
        root.addEventListener('dblclick', (event) => {
            const cell = event.target.closest('[data-cl-date]'); if (!cell) return;
            const d = parseKey(cell.getAttribute('data-cl-date')); const h = cell.getAttribute('data-cl-hour');
            if (d) openModal(d, h === null ? undefined : parseInt(h, 10));
        });
        root.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.matches && event.target.matches('[data-cl-date]')) { const d = parseKey(event.target.getAttribute('data-cl-date')); if (d) { state.selected = d; render(); } }
        });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); closeMenus(); } });
        const form = el('cl-event-form'); if (form) form.addEventListener('submit', submitForm);
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); if (state.activity) state.activity.render(); icons(); }

    window.CalendarReplicaPage = { bind, open, getEvents: () => state.events.slice(), getState: () => ({ viewMode: state.viewMode, selected: keyOf(state.selected), cursor: keyOf(state.cursor) }) };
})();
