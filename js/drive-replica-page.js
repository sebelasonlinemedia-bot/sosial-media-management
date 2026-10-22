/**
 * Halaman Drive — replika visual referensi SisTava (Company File Drive).
 * Data demo lokal; TIDAK terhubung ke penyimpanan backend mana pun.
 * Folder bawaan bersifat demo (angka jumlah awal adalah angka demo pada
 * pohon); berkas/folder buatan pengguna tersimpan di localStorage
 * `piks-drive-replica-v1`. Panel aktivitas kanan memakai modul bersama
 * js/replica-activity.js.
 */
(function () {
    const STORAGE_KEY = 'piks-drive-replica-v1';
    const DEFAULT_FOLDERS = [
        { id: 'org', name: 'Org Files', parentId: null, demo: 9 },
        { id: 'work', name: 'Work Files', parentId: 'org', demo: 4 },
        { id: 'uploads', name: 'Uploads', parentId: 'org', demo: 5 },
        { id: 'chat-files', name: 'Chat', parentId: 'uploads', demo: 0 },
        { id: 'knowledge', name: 'Knowledge', parentId: 'uploads', demo: 3 },
        { id: 'small', name: 'Small', parentId: 'uploads', demo: 0 }
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
    const state = { bound: false, app: null, activity: null, userFolders: [], files: [], selectedId: 'org', collapsed: [], viewMode: 'folders', query: '', openMenu: null };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function allFolders() { return DEFAULT_FOLDERS.concat(state.userFolders.map(f => ({ ...f, user: true }))); }
    function folderById(id) { return allFolders().find(f => f.id === id) || null; }
    function childrenOf(id) { return allFolders().filter(f => f.parentId === id); }
    function isCollapsed(id) { return state.collapsed.includes(id); }
    function countOf(f) { return (f.demo || 0) + state.files.filter(x => x.folderId === f.id).length + state.userFolders.filter(x => x.parentId === f.id).length; }
    function ancestorsOf(f) { const chain = []; let cur = f; const seen = new Set(); while (cur && cur.parentId && !seen.has(cur.id)) { seen.add(cur.id); cur = folderById(cur.parentId); if (cur) chain.unshift(cur); } return chain; }

    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.userFolders = (s && Array.isArray(s.folders)) ? s.folders.filter(f => f && f.id && f.name && folderExistsLoose(f.parentId)) : [];
            state.files = (s && Array.isArray(s.files)) ? s.files.filter(f => f && f.id && f.name && f.folderId) : [];
            if (s && typeof s.selectedId === 'string' && folderById(s.selectedId)) state.selectedId = s.selectedId;
            state.collapsed = (s && Array.isArray(s.collapsed)) ? s.collapsed.filter(id => DEFAULT_FOLDERS.some(f => f.id === id) || state.userFolders.some(f => f.id === id)) : [];
            if (s && (s.viewMode === 'files' || s.viewMode === 'folders')) state.viewMode = s.viewMode;
            if (!folderById(state.selectedId)) state.selectedId = 'org';
            // Berkas yang foldernya sudah tidak ada dibuang agar konsisten.
            state.files = state.files.filter(f => folderById(f.folderId));
        } catch (_) { state.userFolders = []; state.files = []; state.selectedId = 'org'; state.collapsed = []; }
    }
    function folderExistsLoose(id) { return id === null || id === undefined || DEFAULT_FOLDERS.some(f => f.id === id) || state.userFolders.some(f => f.id === id); }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ folders: state.userFolders, files: state.files, selectedId: state.selectedId, collapsed: state.collapsed, viewMode: state.viewMode })); } catch (_) {} }

    function renderEmployees() {
        const box = el('dr-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function treeRows(parentId, depth, out) {
        childrenOf(parentId).forEach(f => {
            const kids = childrenOf(f.id);
            const collapsed = isCollapsed(f.id);
            out.push(`<div class="dr-tree-row${f.id === state.selectedId ? ' is-selected' : ''}" style="--depth:${depth}">
                ${kids.length ? `<button type="button" class="dr-tree-toggle${collapsed ? ' is-collapsed' : ''}" data-dr-toggle="${esc(f.id)}" title="${collapsed ? 'Bentangkan' : 'Ciutkan'} folder ${esc(f.name)}" aria-label="Ciutkan/bentangkan ${esc(f.name)}" aria-expanded="${String(!collapsed)}"><i data-lucide="chevron-down"></i></button>` : '<span class="dr-tree-spacer"></span>'}
                <button type="button" class="dr-tree-item" data-dr-folder="${esc(f.id)}" aria-current="${f.id === state.selectedId ? 'true' : 'false'}" title="${esc(f.name)}"><i data-lucide="folder"></i><span class="dr-tree-name">${esc(f.name)}</span><span class="dr-tree-count">(${countOf(f)})</span></button>
                ${f.user ? `<button type="button" class="dr-tree-del" data-dr-del-folder="${esc(f.id)}" title="Hapus folder ${esc(f.name)}" aria-label="Hapus folder ${esc(f.name)}"><i data-lucide="x"></i></button>` : ''}
            </div>`);
            if (kids.length && !collapsed) treeRows(f.id, depth + 1, out);
        });
        return out;
    }
    function renderTree() {
        const box = el('dr-tree'); if (!box) return;
        box.innerHTML = treeRows(null, 0, []).join('');
        icons();
    }

    function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (_) { return ''; } }

    function renderContent() {
        const crumb = el('dr-breadcrumb');
        const body = el('dr-body');
        const sel = folderById(state.selectedId) || DEFAULT_FOLDERS[0];
        if (crumb) {
            const chain = ancestorsOf(sel).concat([sel]);
            crumb.innerHTML = `<span class="dr-crumb-home"><i data-lucide="home"></i> Home</span>` + chain.map((f, i) => `<span class="dr-crumb-sep">&gt;</span><span class="${i === chain.length - 1 ? 'dr-crumb-cur' : ''}">${esc(f.name)}</span>`).join('');
        }
        if (!body) return;
        const q = state.query.trim().toLowerCase();
        const folderItems = (state.viewMode === 'folders' ? state.userFolders.filter(f => f.parentId === sel.id) : []).filter(f => !q || f.name.toLowerCase().includes(q));
        const fileItems = state.files.filter(f => f.folderId === sel.id).filter(f => !q || f.name.toLowerCase().includes(q));
        if (q && !folderItems.length && !fileItems.length) {
            body.innerHTML = `<div class="dr-empty-wrap"><div class="dr-empty"><span class="dr-empty-icon"><i data-lucide="search-x"></i></span><h2>No files found</h2><p>No files in ${esc(sel.name)} match &ldquo;${esc(state.query.trim())}&rdquo;.</p></div></div>`;
        } else if (!folderItems.length && !fileItems.length) {
            const isRoot = sel.id === 'org';
            body.innerHTML = `<div class="dr-empty-wrap"><div class="dr-empty"><span class="dr-empty-icon"><i data-lucide="folder-open"></i></span><h2>${isRoot ? 'Your Drive is ready' : esc(sel.name) + ' is empty'}</h2><p>Files your team creates, uploads, or saves to Drive will appear here.</p></div></div>`;
        } else {
            body.innerHTML = `<div class="dr-list">${folderItems.map(f => `<div class="dr-row"><span class="dr-row-icon is-folder"><i data-lucide="folder"></i></span><span class="dr-row-main"><span class="dr-row-name">${esc(f.name)}</span><span class="dr-row-meta">Folder &middot; in ${esc(sel.name)}</span></span><button type="button" class="dr-row-del" data-dr-del-folder="${esc(f.id)}" title="Hapus folder ${esc(f.name)}" aria-label="Hapus folder ${esc(f.name)}"><i data-lucide="trash-2"></i></button></div>`).join('')}${fileItems.map(f => `<div class="dr-row"><span class="dr-row-icon"><i data-lucide="file-text"></i></span><span class="dr-row-main"><span class="dr-row-name">${esc(f.name)}</span><span class="dr-row-meta">File &middot; ${esc(fmtDate(f.createdAt))}</span></span><button type="button" class="dr-row-del" data-dr-del-file="${esc(f.id)}" title="Hapus berkas ${esc(f.name)}" aria-label="Hapus berkas ${esc(f.name)}"><i data-lucide="trash-2"></i></button></div>`).join('')}</div>`;
        }
        document.querySelectorAll('[data-dr-mode]').forEach(b => { const on = b.getAttribute('data-dr-mode') === state.viewMode; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        icons();
    }

    function render() { renderTree(); renderContent(); }

    function deleteFolder(id) {
        if (!state.userFolders.some(f => f.id === id)) return;
        const doomed = new Set([id]);
        let grew = true;
        while (grew) { grew = false; state.userFolders.forEach(f => { if (doomed.has(f.parentId) && !doomed.has(f.id)) { doomed.add(f.id); grew = true; } }); }
        state.userFolders = state.userFolders.filter(f => !doomed.has(f.id));
        state.files = state.files.filter(f => !doomed.has(f.folderId));
        state.collapsed = state.collapsed.filter(x => !doomed.has(x));
        if (doomed.has(state.selectedId)) state.selectedId = 'org';
        save(); render();
    }

    function openModal() {
        const sel = el('dr-item-folder');
        if (sel) sel.innerHTML = allFolders().map(f => `<option value="${esc(f.id)}"${f.id === state.selectedId ? ' selected' : ''}>${esc(ancestorsOf(f).map(a => a.name).concat([f.name]).join(' / '))}</option>`).join('');
        const name = el('dr-item-name'); if (name) name.value = '';
        const type = el('dr-item-type'); if (type) type.value = 'file';
        const modal = el('dr-modal'); if (modal) modal.classList.remove('hidden');
        if (name) name.focus();
    }
    function closeModal() { const m = el('dr-modal'); if (m) m.classList.add('hidden'); }
    function submitForm(event) {
        event.preventDefault();
        const name = (el('dr-item-name')?.value || '').trim(); if (!name) return;
        const type = el('dr-item-type')?.value === 'folder' ? 'folder' : 'file';
        const dest = el('dr-item-folder')?.value || state.selectedId;
        if (!folderById(dest)) return;
        const id = `dr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        if (type === 'folder') {
            state.userFolders.push({ id, name, parentId: dest });
            state.collapsed = state.collapsed.filter(x => x !== dest);
            state.selectedId = id;
            if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Drive folder created: ${name}`, time: 'now', icon: 'folder', color: 'c-blue' });
        } else {
            state.files.push({ id, name, folderId: dest, createdAt: Date.now() });
            state.selectedId = dest;
            if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Drive file added: ${name}`, time: 'now', icon: 'file-text', color: 'c-teal' });
        }
        save(); render(); closeModal();
    }

    function closeMenus() { state.openMenu = null; document.querySelectorAll('[data-dr-menu]').forEach(m => m.classList.add('hidden')); }
    function toggleMenu(name) { const willOpen = state.openMenu !== name; closeMenus(); if (!willOpen) return; state.openMenu = name; const m = document.querySelector(`[data-dr-menu="${name}"]`); if (m) m.classList.remove('hidden'); }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-drive-replica'); if (!root) return;
        const panel = el('dr-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const toggle = event.target.closest('[data-dr-toggle]'); if (toggle) { const id = toggle.getAttribute('data-dr-toggle'); state.collapsed = isCollapsed(id) ? state.collapsed.filter(x => x !== id) : state.collapsed.concat([id]); save(); renderTree(); return; }
            const delFolder = event.target.closest('[data-dr-del-folder]'); if (delFolder) { event.stopPropagation(); deleteFolder(delFolder.getAttribute('data-dr-del-folder')); return; }
            const delFile = event.target.closest('[data-dr-del-file]'); if (delFile) { state.files = state.files.filter(f => f.id !== delFile.getAttribute('data-dr-del-file')); save(); render(); return; }
            const folderBtn = event.target.closest('[data-dr-folder]'); if (folderBtn) { state.selectedId = folderBtn.getAttribute('data-dr-folder'); save(); render(); return; }
            const modeBtn = event.target.closest('[data-dr-mode]'); if (modeBtn) { state.viewMode = modeBtn.getAttribute('data-dr-mode'); save(); renderContent(); return; }
            if (event.target.closest('[data-dr-create]')) { openModal(); return; }
            const menuBtn = event.target.closest('[data-dr-menu-toggle]'); if (menuBtn) { toggleMenu(menuBtn.getAttribute('data-dr-menu-toggle')); return; }
            const proj = event.target.closest('[data-dr-project]'); if (proj) { const l = el('dr-project-label'); if (l) l.textContent = proj.getAttribute('data-dr-project'); closeMenus(); return; }
            if (event.target.closest('[data-dr-connect-opt]')) { closeMenus(); return; }
            if (!event.target.closest('.dr-dd')) closeMenus();
            if (event.target.closest('[data-dr-modal-close]') || event.target.id === 'dr-modal') { closeModal(); return; }
            const exit = event.target.closest('[data-dr-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-dr-exit')); return; }
            const navKey = event.target.closest('[data-dr-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-dr-nav')); return; }
        });
        const search = el('dr-search');
        if (search) search.addEventListener('input', () => { state.query = search.value || ''; renderContent(); });
        const form = el('dr-item-form'); if (form) form.addEventListener('submit', submitForm);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); closeMenus(); } });
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); const s = el('dr-search'); if (s && s.value !== state.query) { state.query = s.value || ''; renderContent(); } if (state.activity) state.activity.render(); icons(); }

    window.DriveReplicaPage = { bind, open, getState: () => ({ selectedId: state.selectedId, viewMode: state.viewMode, folders: state.userFolders.slice(), files: state.files.slice() }), DEFAULT_FOLDERS };
})();
