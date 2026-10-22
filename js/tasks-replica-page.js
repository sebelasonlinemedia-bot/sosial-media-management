/**
 * Halaman Tasks — replika visual referensi SisTava (Company Master Tasks).
 * Papan kanban demo lokal; TIDAK terhubung ke papan job Kantor AI nyata
 * (view lama `tasks` / js/tasks-page.js tetap utuh & bisa dibuka via #tasks).
 * Status papan tersimpan di localStorage `piks-tasks-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 */
(function () {
    const STORAGE_KEY = 'piks-tasks-replica-v1';
    const COLUMNS = [
        { id: 'backlog', label: 'Backlog' },
        { id: 'todo', label: 'To Do' },
        { id: 'inprogress', label: 'In Progress' },
        { id: 'waiting', label: 'Waiting' },
        { id: 'done', label: 'Done' }
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
    const state = { bound: false, app: null, cards: [], targetColumn: 'backlog', dragId: null, activity: null };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function load() { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); state.cards = (s && Array.isArray(s.cards)) ? s.cards.filter(c => c && c.id && c.title && COLUMNS.some(col => col.id === c.column)) : []; } catch (_) { state.cards = []; } }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: state.cards })); } catch (_) {} }

    function renderEmployees() {
        const box = el('tk-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function renderBoard() {
        const board = el('tk-board'); if (!board) return;
        board.innerHTML = COLUMNS.map(col => {
            const cards = state.cards.filter(c => c.column === col.id);
            return `<section class="tk-col" data-tk-column="${esc(col.id)}" aria-label="${esc(col.label)}">
                <header class="tk-col-head"><span class="tk-col-name">${esc(col.label)}</span><span class="tk-col-count" data-tk-count="${esc(col.id)}">${cards.length}</span><button type="button" class="tk-col-add" data-tk-add="${esc(col.id)}" title="Tambah tugas ke ${esc(col.label)}" aria-label="Tambah tugas ke ${esc(col.label)}"><i data-lucide="plus"></i></button></header>
                <div class="tk-col-body" data-tk-drop="${esc(col.id)}">
                    ${cards.map(c => `<article class="tk-card" draggable="true" data-tk-card="${esc(c.id)}" title="Seret untuk memindahkan kolom"><p class="tk-card-title">${esc(c.title)}</p>${c.note ? `<p class="tk-card-note">${esc(c.note)}</p>` : ''}<span class="tk-card-foot"><span>${esc(col.label)}</span><button type="button" class="tk-card-del" data-tk-del="${esc(c.id)}" title="Hapus tugas" aria-label="Hapus tugas"><i data-lucide="x"></i></button></span></article>`).join('')}
                    <div class="tk-drop" data-tk-drop-slot="${esc(col.id)}">Drop tasks here</div>
                </div>
            </section>`;
        }).join('');
        icons();
    }

    function moveCard(id, column) {
        const card = state.cards.find(c => c.id === id); if (!card || !COLUMNS.some(c => c.id === column)) return;
        card.column = column; save(); renderBoard();
    }
    /** Dipakai uji otomatis & drag; memindahkan kartu ke kolom lain. */
    function moveCardByTitle(title, column) { const c = state.cards.find(x => x.title === title); if (c) moveCard(c.id, column); }

    function openModal(column) {
        state.targetColumn = COLUMNS.some(c => c.id === column) ? column : 'backlog';
        const sel = el('tk-task-column'); if (sel) sel.value = state.targetColumn;
        const modal = el('tk-modal'); if (modal) modal.classList.remove('hidden');
        const input = el('tk-task-title'); if (input) { input.value = ''; input.focus(); }
        const note = el('tk-task-note'); if (note) note.value = '';
    }
    function closeModal() { const m = el('tk-modal'); if (m) m.classList.add('hidden'); }
    function submitForm(event) {
        event.preventDefault();
        const title = (el('tk-task-title')?.value || '').trim(); if (!title) return;
        const column = el('tk-task-column')?.value || state.targetColumn;
        const note = (el('tk-task-note')?.value || '').trim();
        state.cards.push({ id: `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title, note, column });
        save(); renderBoard(); closeModal();
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Task added: ${title}`, time: 'now', icon: 'activity', color: 'c-teal' });
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-tasks-replica'); if (!root) return;
        const panel = el('tk-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const del = event.target.closest('[data-tk-del]'); if (del) { event.stopPropagation(); state.cards = state.cards.filter(c => c.id !== del.getAttribute('data-tk-del')); save(); renderBoard(); return; }
            const add = event.target.closest('[data-tk-add]'); if (add) { openModal(add.getAttribute('data-tk-add')); return; }
            if (event.target.closest('[data-tk-create]')) { openModal('backlog'); return; }
            if (event.target.closest('[data-tk-modal-close]') || event.target.id === 'tk-modal') { closeModal(); return; }
            const exit = event.target.closest('[data-tk-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-tk-exit')); return; }
            const navKey = event.target.closest('[data-tk-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-tk-nav')); return; }
        });
        const form = el('tk-task-form'); if (form) form.addEventListener('submit', submitForm);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
        // Drag & drop HTML5 antar kolom.
        root.addEventListener('dragstart', (event) => {
            const card = event.target.closest('[data-tk-card]'); if (!card) return;
            state.dragId = card.getAttribute('data-tk-card');
            if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; try { event.dataTransfer.setData('text/plain', state.dragId); } catch (_) {} }
            card.classList.add('is-dragging');
        });
        root.addEventListener('dragend', () => { state.dragId = null; root.querySelectorAll('.is-over').forEach(n => n.classList.remove('is-over')); });
        root.addEventListener('dragover', (event) => {
            const zone = event.target.closest('[data-tk-drop]'); if (!zone) return;
            event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            root.querySelectorAll('.tk-col-body.is-over').forEach(n => { if (n !== zone) n.classList.remove('is-over'); });
            zone.classList.add('is-over');
        });
        root.addEventListener('dragleave', (event) => { const zone = event.target.closest('[data-tk-drop]'); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('is-over'); });
        root.addEventListener('drop', (event) => {
            const zone = event.target.closest('[data-tk-drop]'); if (!zone) return;
            event.preventDefault(); zone.classList.remove('is-over');
            const id = state.dragId || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');
            if (id) moveCard(id, zone.getAttribute('data-tk-drop'));
        });
        renderEmployees(); renderBoard(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); renderBoard(); if (state.activity) state.activity.render(); icons(); }

    window.TasksReplicaPage = { bind, open, moveCard, moveCardByTitle, getCards: () => state.cards.slice(), COLUMNS };
})();
