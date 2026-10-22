/**
 * Halaman Knowledge — replika visual referensi Company Knowledge.
 * Data lokal saja; TIDAK ada pelatihan/pencarian AI sungguhan (demo lokal).
 * Keadaan tersimpan di localStorage `piks-knowledge-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 * Deskripsi kartu yang buram pada referensi direkonstruksi setara makna.
 * Catatan: halaman ini sengaja TIDAK memuat banner rencana berbayar apa pun.
 */
(function () {
    const STORAGE_KEY = 'piks-knowledge-replica-v1';
    const SOURCES = [
        { id: 'apps', name: 'Apps', icon: 'layout-grid', color: '#a78bfa', desc: 'Apps, tools and data your company uses, connected in one place.', fieldLabel: 'App name', fieldPlaceholder: 'Nama aplikasi…', detailLabel: 'Link (optional)', detailPlaceholder: 'https://…' },
        { id: 'websites', name: 'Websites', icon: 'globe', color: '#60a5fa', desc: 'Crawl a URL or website so its pages can be learned.', fieldLabel: 'Website URL', fieldPlaceholder: 'https://example.com', detailLabel: 'Name (optional)', detailPlaceholder: 'Nama situs…' },
        { id: 'files', name: 'Files', icon: 'file-text', color: '#34d399', desc: 'Upload PDFs, documents, spreadsheets, and other files.', fieldLabel: 'File name', fieldPlaceholder: 'company-handbook.pdf', detailLabel: 'Note (optional)', detailPlaceholder: 'Catatan singkat…' },
        { id: 'text', name: 'Text', icon: 'type', color: '#fbbf24', desc: 'Paste notes, a policy, or any text — it is learned as-is.', fieldLabel: 'Title', fieldPlaceholder: 'Judul teks…', detailLabel: 'Text', detailPlaceholder: 'Tempel isi teks di sini…' }
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
    const state = { bound: false, app: null, activity: null, items: [], folders: [], modalSource: 'text' };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function sourceById(id) { return SOURCES.find(s => s.id === id) || SOURCES[0]; }
    function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
    function fmtTime(ts) { try { const d = new Date(ts); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } }

    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.items = (s && Array.isArray(s.items)) ? s.items.filter(i => i && i.id && i.title && SOURCES.some(x => x.id === i.source)) : [];
            state.folders = (s && Array.isArray(s.folders)) ? s.folders.filter(f => f && f.id && f.name) : [];
        } catch (_) { state.items = []; state.folders = []; }
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, folders: state.folders })); } catch (_) {} }

    function renderEmployees() {
        const box = el('kn-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function renderCards() {
        const box = el('kn-cards'); if (!box) return;
        box.innerHTML = SOURCES.map(s => {
            const count = state.items.filter(i => i.source === s.id).length;
            return `<article class="kn-card">
                <div class="kn-card-top"><span class="kn-card-icon" style="color:${esc(s.color)}"><i data-lucide="${esc(s.icon)}"></i></span><button type="button" class="kn-add-pill" data-kn-add="${esc(s.id)}" title="Add ${esc(s.name)} knowledge source">+ Add</button></div>
                <h3 class="kn-card-name">${esc(s.name)}</h3>
                <p class="kn-card-desc">${esc(s.desc)}</p>
                ${count ? `<span class="kn-card-count">${count} trained</span>` : ''}
            </article>`;
        }).join('');
        icons();
    }

    function renderTrained() {
        const box = el('kn-trained'); if (!box) return;
        if (!state.items.length) {
            box.innerHTML = '<p class="kn-nothing">Nothing trained yet. Pick a data source above to start training.</p>';
            return;
        }
        box.innerHTML = `<div class="kn-trained-list">${state.items.map(item => { const s = sourceById(item.source); return `<div class="kn-trained-row">
            <span class="kn-trained-icon" style="color:${esc(s.color)}"><i data-lucide="${esc(s.icon)}"></i></span>
            <span class="kn-trained-main"><strong>${esc(item.title)}</strong>${item.detail ? `<span>${esc(item.detail.length > 90 ? item.detail.slice(0, 90) + '…' : item.detail)}</span>` : ''}</span>
            <span class="kn-trained-time">${esc(fmtTime(item.createdAt))}</span>
            <span class="kn-status">Trained</span>
            <button type="button" class="kn-del" data-kn-del-item="${esc(item.id)}" title="Hapus ${esc(item.title)}" aria-label="Hapus ${esc(item.title)}"><i data-lucide="trash-2"></i></button>
        </div>`; }).join('')}</div>`;
        icons();
    }

    function renderFolders() {
        const box = el('kn-folders'); if (!box) return;
        if (!state.folders.length) {
            box.innerHTML = `<div class="kn-folders-empty"><span class="kn-folders-empty-icon"><i data-lucide="folder-open"></i></span><p>No folders imported into this company yet.</p></div>`;
        } else {
            box.innerHTML = `<div class="kn-folder-list">${state.folders.map(f => `<div class="kn-folder-row">
                <span class="kn-folder-icon"><i data-lucide="folder"></i></span>
                <span class="kn-trained-main"><strong>${esc(f.name)}</strong><span>Imported folder (demo lokal)</span></span>
                <span class="kn-trained-time">${esc(fmtTime(f.createdAt))}</span>
                <span class="kn-status">Trained</span>
                <button type="button" class="kn-del" data-kn-del-folder="${esc(f.id)}" title="Hapus folder ${esc(f.name)}" aria-label="Hapus folder ${esc(f.name)}"><i data-lucide="trash-2"></i></button>
            </div>`).join('')}</div>`;
        }
        icons();
    }

    function render() { renderCards(); renderTrained(); renderFolders(); }

    function renderModalFields() {
        const s = sourceById(state.modalSource);
        const title = el('kn-modal-title'); if (title) title.textContent = `Add ${s.name}`;
        const label1 = el('kn-f1-label'); if (label1) label1.childNodes[0].textContent = s.fieldLabel;
        const input1 = el('kn-f-title'); if (input1) { input1.placeholder = s.fieldPlaceholder; input1.value = ''; }
        const label2 = el('kn-f2-label'); if (label2) label2.childNodes[0].textContent = s.detailLabel;
        const area = el('kn-f-detail'); if (area) { area.placeholder = s.detailPlaceholder; area.value = ''; area.rows = s.id === 'text' ? 5 : 2; }
        const picker = el('kn-picker');
        if (picker) picker.innerHTML = SOURCES.map(x => `<button type="button" class="kn-pick${x.id === state.modalSource ? ' is-selected' : ''}" data-kn-pick="${esc(x.id)}" aria-pressed="${String(x.id === state.modalSource)}" title="${esc(x.name)}"><span style="color:${esc(x.color)}"><i data-lucide="${esc(x.icon)}"></i></span>${esc(x.name)}</button>`).join('');
        icons();
    }
    function openModal(sourceId) {
        state.modalSource = SOURCES.some(s => s.id === sourceId) ? sourceId : 'text';
        renderModalFields();
        const m = el('kn-modal'); if (m) m.classList.remove('hidden');
        const input = el('kn-f-title'); if (input) input.focus();
    }
    function closeModal() { const m = el('kn-modal'); if (m) m.classList.add('hidden'); }

    function submitForm(event) {
        event.preventDefault();
        const title = (el('kn-f-title')?.value || '').trim(); if (!title) return;
        const detail = (el('kn-f-detail')?.value || '').trim();
        const s = sourceById(state.modalSource);
        state.items.unshift({ id: uid('kn'), source: s.id, title, detail, createdAt: Date.now() });
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Knowledge source trained: ${title} (${s.name}, demo lokal)`, time: 'now', icon: s.icon, color: 'c-teal' });
        save(); render(); closeModal();
    }

    function importFolder() {
        const n = state.folders.length + 1;
        const names = ['Company Documents', 'Brand Assets', 'Product Guides', 'Team Policies'];
        const folder = { id: uid('kn-folder'), name: `${names[(n - 1) % names.length]}${n > names.length ? ' ' + n : ''}`, createdAt: Date.now() };
        state.folders.unshift(folder);
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Knowledge folder imported: ${folder.name} (demo lokal)`, time: 'now', icon: 'folder', color: 'c-blue' });
        save(); renderFolders(); icons();
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-knowledge-replica'); if (!root) return;
        const panel = el('kn-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const add = event.target.closest('[data-kn-add]'); if (add) { openModal(add.getAttribute('data-kn-add')); return; }
            const pick = event.target.closest('[data-kn-pick]'); if (pick) { state.modalSource = pick.getAttribute('data-kn-pick'); renderModalFields(); const t = el('kn-f-title'); if (t) t.focus(); return; }
            if (event.target.closest('[data-kn-import]')) { importFolder(); return; }
            if (event.target.closest('[data-kn-plus]')) { openModal('apps'); return; }
            const delItem = event.target.closest('[data-kn-del-item]'); if (delItem) { state.items = state.items.filter(i => i.id !== delItem.getAttribute('data-kn-del-item')); save(); render(); return; }
            const delFolder = event.target.closest('[data-kn-del-folder]'); if (delFolder) { state.folders = state.folders.filter(f => f.id !== delFolder.getAttribute('data-kn-del-folder')); save(); renderFolders(); return; }
            if (event.target.closest('[data-kn-modal-close]') || event.target.id === 'kn-modal') { closeModal(); return; }
            const exit = event.target.closest('[data-kn-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-kn-exit')); return; }
            const navKey = event.target.closest('[data-kn-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-kn-nav')); return; }
        });
        const form = el('kn-form'); if (form) form.addEventListener('submit', submitForm);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); if (state.activity) state.activity.render(); icons(); }

    window.KnowledgeReplicaPage = { bind, open, SOURCES, getState: () => ({ items: state.items.slice(), folders: state.folders.slice() }) };
})();
