/**
 * Halaman Mailbox — replika visual referensi Company Central Mailbox.
 * Data lokal saja; TIDAK terhubung ke server email nyata. Connect bersifat
 * demo: "Connect email" (atas) menyimulasikan sinkronisasi kotak surat
 * karyawan dengan menambahkan satu surat masuk demo ke Inbox, sedangkan
 * Connect pada kotak surat pribadi hanya mengubah status lokal.
 * Surat buatan pengguna tersimpan di localStorage `piks-mailbox-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 */
(function () {
    const STORAGE_KEY = 'piks-mailbox-replica-v1';
    const FOLDERS = [
        { id: 'inbox', name: 'Inbox', icon: 'inbox', empty: 'No emails yet', emptySub: 'Emails sent to a mailbox address in use will show up here.' },
        { id: 'sent', name: 'Sent', icon: 'send', empty: 'No sent emails yet', emptySub: 'Emails you send will appear here.' },
        { id: 'drafts', name: 'Drafts', icon: 'file-text', empty: 'No drafts yet', emptySub: 'Drafts you save will appear here.' },
        { id: 'archive', name: 'Archive', icon: 'archive', empty: 'No archived emails', emptySub: 'Archived emails will appear here.' },
        { id: 'spam', name: 'Spam', icon: 'shield-alert', empty: 'No spam', emptySub: 'Spam emails will appear here.' },
        { id: 'trash', name: 'Trash', icon: 'trash-2', empty: 'Trash is empty', emptySub: 'Deleted emails will appear here.' }
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
    const AVATAR_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#059669'];
    const state = { bound: false, app: null, activity: null, emails: [], folder: 'inbox', mailbox: 'all', query: '', selectedId: null, personalConnected: false, employeeConnected: false, demoSeq: 0 };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function folderById(id) { return FOLDERS.find(f => f.id === id) || FOLDERS[0]; }
    function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
    function colorFor(name) { let h = 0; const s = String(name || '?'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
    function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'; }
    function fmtTime(ts) { try { const d = new Date(ts); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } }
    function fmtShort(ts) { try { const d = new Date(ts); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) { return ''; } }

    function validEmail(e) { return e && e.id && FOLDERS.some(f => f.id === e.folder) && typeof e.subject === 'string'; }
    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.emails = (s && Array.isArray(s.emails)) ? s.emails.filter(validEmail) : [];
            if (s && FOLDERS.some(f => f.id === s.folder)) state.folder = s.folder;
            if (s && ['all', 'employee', 'personal'].includes(s.mailbox)) state.mailbox = s.mailbox;
            if (s && typeof s.personalConnected === 'boolean') state.personalConnected = s.personalConnected;
            if (s && typeof s.employeeConnected === 'boolean') state.employeeConnected = s.employeeConnected;
            if (s && Number.isFinite(s.demoSeq)) state.demoSeq = s.demoSeq;
            if (s && typeof s.selectedId === 'string' && state.emails.some(e => e.id === s.selectedId)) state.selectedId = s.selectedId; else state.selectedId = null;
        } catch (_) { state.emails = []; state.selectedId = null; }
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ emails: state.emails, folder: state.folder, mailbox: state.mailbox, selectedId: state.selectedId, personalConnected: state.personalConnected, employeeConnected: state.employeeConnected, demoSeq: state.demoSeq })); } catch (_) {} }

    function renderEmployees() {
        const box = el('mb-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }
    function inMailbox(e) { return state.mailbox === 'all' || e.mailbox === state.mailbox; }
    function folderEmails(fid) { return state.emails.filter(e => e.folder === fid && inMailbox(e)); }
    function filtered() {
        const q = state.query.trim().toLowerCase();
        return folderEmails(state.folder).filter(e => !q || [e.from, e.to, e.subject, e.body].some(f => String(f || '').toLowerCase().includes(q)));
    }
    function selected() { return state.emails.find(e => e.id === state.selectedId) || null; }

    function renderFolders() {
        const box = el('mb-folders'); if (!box) return;
        box.innerHTML = FOLDERS.map(f => {
            const list = folderEmails(f.id);
            const unread = f.id === 'inbox' ? list.filter(e => !e.read).length : 0;
            return `<button type="button" class="mb-folder${f.id === state.folder ? ' is-active' : ''}" data-mb-folder="${esc(f.id)}" aria-pressed="${String(f.id === state.folder)}" title="${esc(f.name)}"><i data-lucide="${esc(f.icon)}"></i> ${esc(f.name)}${unread ? `<span class="mb-folder-unread" title="${unread} belum dibaca">${unread}</span>` : ''}<span class="mb-folder-count">${list.length}</span></button>`;
        }).join('');
    }
    function renderList() {
        const box = el('mb-list'); if (!box) return;
        const folder = folderById(state.folder);
        const head = el('mb-list-title'); if (head) head.textContent = folder.name;
        const count = el('mb-list-count'); if (count) count.textContent = `${filtered().length} email${filtered().length === 1 ? '' : 's'}`;
        const list = filtered();
        if (!list.length) {
            const searching = !!state.query.trim();
            box.innerHTML = `<div class="mb-empty"><span class="mb-empty-icon"><i data-lucide="${searching ? 'search-x' : 'mail'}"></i></span><strong>${searching ? 'No emails found' : esc(folder.empty)}</strong><p>${searching ? `No emails match &ldquo;${esc(state.query.trim())}&rdquo; in ${esc(folder.name)}.` : esc(folder.emptySub)}</p></div>`;
        } else {
            box.innerHTML = list.map(e => `<button type="button" class="mb-mail-item${e.id === state.selectedId ? ' is-selected' : ''}${!e.read && e.folder === 'inbox' ? ' is-unread' : ''}" data-mb-open="${esc(e.id)}" title="${esc(e.subject || '(no subject)')}">
                <span class="mb-mail-top"><span class="mb-mail-from">${esc(e.folder === 'sent' || e.folder === 'drafts' ? (e.to || '—') : (e.from || '—'))}</span><span class="mb-mail-time">${esc(fmtShort(e.createdAt))}</span></span>
                <span class="mb-mail-subject">${esc(e.subject || '(no subject)')}</span>
                <span class="mb-mail-snippet">${esc(e.body || '')}</span>
            </button>`).join('');
        }
        icons();
    }
    function renderRead() {
        const box = el('mb-read'); if (!box) return;
        const e = selected();
        if (!e || e.folder !== state.folder || !inMailbox(e)) { box.innerHTML = `<div class="mb-read-empty">Select an email to read</div>`; return; }
        const who = e.folder === 'sent' || e.folder === 'drafts' ? (e.to || '—') : (e.from || '—');
        box.innerHTML = `<div class="mb-read-body">
            <h2 class="mb-read-subject">${esc(e.subject || '(no subject)')}</h2>
            <div class="mb-read-meta">
                <span class="mb-read-avatar" style="background:${esc(colorFor(who))}">${esc(initials(who))}</span>
                <span class="mb-read-who"><strong>${esc(who)}</strong><span>${e.folder === 'sent' || e.folder === 'drafts' ? `From: Me &middot; To: ${esc(e.to || '—')}` : `To: ${esc(e.to || 'Company mailbox')}`}</span></span>
                <span class="mb-read-time">${esc(fmtTime(e.createdAt))}</span>
                <button type="button" class="mb-read-del" data-mb-delete="${esc(e.id)}" title="${e.folder === 'trash' ? 'Hapus permanen surat ini' : 'Pindahkan surat ini ke Trash'}" aria-label="Hapus surat ${esc(e.subject || '')}"><i data-lucide="trash-2"></i></button>
            </div>
            <p class="mb-read-text">${esc(e.body || '')}</p>
        </div>`;
        icons();
    }
    function renderStatus() {
        const emp = el('mb-employee-status');
        if (emp) { emp.textContent = state.employeeConnected ? 'Connected (demo) — demo inbox synced' : 'Demo — not connected to a real mail server'; emp.classList.toggle('is-connected', state.employeeConnected); }
        const top = el('mb-connect-email');
        if (top) { top.classList.toggle('is-connected', state.employeeConnected); top.innerHTML = state.employeeConnected ? '<i data-lucide="check"></i> Email connected (demo)' : '<i data-lucide="link-2"></i> Connect email'; }
        const per = el('mb-personal-status');
        if (per) { per.textContent = state.personalConnected ? 'Connected (demo)' : 'No inbox connected'; per.classList.toggle('is-connected', state.personalConnected); }
        const btn = el('mb-personal-connect');
        if (btn) { btn.textContent = state.personalConnected ? 'Connected' : 'Connect'; btn.classList.toggle('is-connected', state.personalConnected); btn.disabled = state.personalConnected; btn.title = state.personalConnected ? 'Kotak surat pribadi terhubung (demo lokal)' : 'Hubungkan kotak surat pribadi (demo lokal — bukan server email nyata)'; }
        icons();
    }
    function render() { renderFolders(); renderList(); renderRead(); renderStatus(); const sel = el('mb-mailbox'); if (sel && sel.value !== state.mailbox) sel.value = state.mailbox; }

    function openEmail(id) {
        const e = state.emails.find(x => x.id === id); if (!e) return;
        state.selectedId = id;
        if (e.folder === 'inbox' && !e.read) e.read = true;
        save(); renderList(); renderRead(); renderFolders();
    }
    function deleteEmail(id) {
        const e = state.emails.find(x => x.id === id); if (!e) return;
        if (e.folder === 'trash') state.emails = state.emails.filter(x => x.id !== id);
        else e.folder = 'trash';
        if (state.selectedId === id) state.selectedId = null;
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Mailbox email deleted: ${e.subject || '(no subject)'}`, time: 'now', icon: 'trash-2', color: 'c-rose' });
        save(); render();
    }
    function connectEmployee() {
        // Demo lokal: simulasi sinkronisasi kotak surat karyawan — setiap klik
        // menambahkan SATU surat masuk demo berlabel jelas ke Inbox.
        state.employeeConnected = true; state.demoSeq += 1;
        const n = state.demoSeq;
        const mail = { id: uid('mb-in'), folder: 'inbox', mailbox: 'employee', from: 'Alice (demo)', to: 'Company Central Mailbox', subject: `Demo incoming email #${n} — employee mailbox sync`, body: `This is a demo incoming email generated locally by "Connect email".\n\nNo real mail server was contacted. Use New email to compose your own message, or open this email to see the reading pane.`, createdAt: Date.now(), read: false };
        state.emails.unshift(mail);
        state.folder = 'inbox'; state.selectedId = null;
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Mailbox demo email received: ${mail.subject}`, time: 'now', icon: 'mail', color: 'c-blue' });
        save(); render();
    }
    function connectPersonal() {
        if (state.personalConnected) return;
        state.personalConnected = true;
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: 'Personal mailbox connected (demo)', time: 'now', icon: 'mail-check', color: 'c-green' });
        save(); renderStatus();
    }
    function openModal() { const m = el('mb-modal'); if (m) m.classList.remove('hidden'); const to = el('mb-f-to'); if (to) to.focus(); }
    function closeModal() { const m = el('mb-modal'); if (m) m.classList.add('hidden'); }
    function submitCompose(action) {
        const to = (el('mb-f-to')?.value || '').trim();
        const subject = (el('mb-f-subject')?.value || '').trim();
        const body = (el('mb-f-body')?.value || '').trim();
        if (!to || !subject) return;
        const isDraft = action === 'draft';
        const mail = { id: uid(isDraft ? 'mb-draft' : 'mb-sent'), folder: isDraft ? 'drafts' : 'sent', mailbox: 'personal', from: 'Me', to, subject, body, createdAt: Date.now(), read: true };
        state.emails.unshift(mail);
        state.folder = mail.folder; state.mailbox = 'all'; state.selectedId = mail.id; state.query = ''; const s = el('mb-search-input'); if (s) s.value = '';
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Mailbox email ${isDraft ? 'saved as draft' : 'sent (demo)'}: ${subject}`, time: 'now', icon: isDraft ? 'file-text' : 'send', color: 'c-teal' });
        save(); render(); closeModal();
        const form = el('mb-form'); if (form) form.reset();
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-mailbox-replica'); if (!root) return;
        const panel = el('mb-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const folderBtn = event.target.closest('[data-mb-folder]'); if (folderBtn) { state.folder = folderBtn.getAttribute('data-mb-folder'); state.selectedId = null; save(); render(); return; }
            const openBtn = event.target.closest('[data-mb-open]'); if (openBtn) { openEmail(openBtn.getAttribute('data-mb-open')); return; }
            const delBtn = event.target.closest('[data-mb-delete]'); if (delBtn) { deleteEmail(delBtn.getAttribute('data-mb-delete')); return; }
            if (event.target.closest('[data-mb-compose]')) { openModal(); return; }
            if (event.target.closest('[data-mb-connect-email]')) { connectEmployee(); return; }
            if (event.target.closest('[data-mb-connect-personal]')) { connectPersonal(); return; }
            const draftBtn = event.target.closest('[data-mb-save-draft]'); if (draftBtn) { submitCompose('draft'); return; }
            if (event.target.closest('[data-mb-modal-close]') || event.target.id === 'mb-modal') { closeModal(); return; }
            const exit = event.target.closest('[data-mb-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-mb-exit')); return; }
            const navKey = event.target.closest('[data-mb-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-mb-nav')); return; }
        });
        const sel = el('mb-mailbox'); if (sel) sel.addEventListener('change', () => { state.mailbox = sel.value; state.selectedId = null; save(); render(); });
        const search = el('mb-search-input'); if (search) search.addEventListener('input', () => { state.query = search.value || ''; renderList(); });
        const form = el('mb-form'); if (form) form.addEventListener('submit', (e) => { e.preventDefault(); submitCompose('send'); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); if (state.activity) state.activity.render(); icons(); }

    window.MailboxReplicaPage = { bind, open, getState: () => ({ emails: state.emails.slice(), folder: state.folder, mailbox: state.mailbox, selectedId: state.selectedId, personalConnected: state.personalConnected, employeeConnected: state.employeeConnected }), FOLDERS };
})();
