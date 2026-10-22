/**
 * Halaman CRM — replika visual referensi Company Contacts Directory.
 * Data demo lokal; TIDAK terhubung ke CRM/backend mana pun. Satu kontak
 * contoh awal (DEMO_CONTACTS, berlabel demo di kode) meniru referensi;
 * kontak/deal/perusahaan buatan pengguna tersimpan di localStorage
 * `piks-crm-replica-v1` (termasuk daftar demo yang dihapus pengguna).
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 */
(function () {
    const STORAGE_KEY = 'piks-crm-replica-v1';
    // Data demo awal (bukan data backend): meniru satu baris pada referensi.
    const DEMO_CONTACTS = [
        { id: 'demo-mahmood-zaki', demo: true, name: 'Mahmood Zaki', email: 'mahmood@zaki.me', phone: '+44 20 7946 0452', job: 'Director of Sales', added: '10/22/2026', source: 'Manual' }
    ];
    const STAGES = [
        { id: 'new', label: 'New' },
        { id: 'screening', label: 'Screening' },
        { id: 'meeting', label: 'Meeting' },
        { id: 'proposal', label: 'Proposal' },
        { id: 'won', label: 'Won' }
    ];
    const TABS = {
        contacts: { label: 'Contacts', icon: 'contact-round', placeholder: 'Search name, email, phone, or job title', create: 'New contact' },
        deals: { label: 'Deals', icon: 'handshake', placeholder: 'Search deals', create: 'New deal' },
        companies: { label: 'Companies', icon: 'building-2', placeholder: 'Search companies', create: 'New company' }
    };
    const AVATAR_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#059669'];
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
    const state = { bound: false, app: null, activity: null, tab: 'contacts', query: '', contacts: [], deals: [], companies: [], deletedDemo: [], filter: 'all', selectedId: null, modalType: null, detailId: null, openMenu: null };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
    function colorFor(name) { let h = 0; const s = String(name || '?'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
    function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'; }
    function allContacts() { return DEMO_CONTACTS.filter(c => !state.deletedDemo.includes(c.id)).concat(state.contacts); }
    function contactById(id) { return allContacts().find(c => c.id === id) || null; }
    function match(q, fields) { return !q || fields.some(f => String(f || '').toLowerCase().includes(q)); }

    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.contacts = (s && Array.isArray(s.contacts)) ? s.contacts.filter(c => c && c.id && c.name) : [];
            state.deals = (s && Array.isArray(s.deals)) ? s.deals.filter(d => d && d.id && d.name && STAGES.some(x => x.id === d.stage)) : [];
            state.companies = (s && Array.isArray(s.companies)) ? s.companies.filter(c => c && c.id && c.name) : [];
            state.deletedDemo = (s && Array.isArray(s.deletedDemo)) ? s.deletedDemo.filter(id => DEMO_CONTACTS.some(c => c.id === id)) : [];
            if (s && TABS[s.tab]) state.tab = s.tab;
            if (s && ['all', 'demo', 'mine'].includes(s.filter)) state.filter = s.filter;
        } catch (_) { state.contacts = []; state.deals = []; state.companies = []; state.deletedDemo = []; }
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ contacts: state.contacts, deals: state.deals, companies: state.companies, deletedDemo: state.deletedDemo, tab: state.tab, filter: state.filter })); } catch (_) {} }

    function renderEmployees() {
        const box = el('cm-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function filteredContacts() {
        const q = state.query.trim().toLowerCase();
        let list = allContacts();
        if (state.filter === 'demo') list = list.filter(c => c.demo);
        if (state.filter === 'mine') list = list.filter(c => !c.demo);
        return list.filter(c => match(q, [c.name, c.email, c.phone, c.job, c.source]));
    }
    function filteredDeals(stageId) {
        const q = state.query.trim().toLowerCase();
        return state.deals.filter(d => d.stage === stageId).filter(d => match(q, [d.name, d.value]));
    }
    function filteredCompanies() {
        const q = state.query.trim().toLowerCase();
        return state.companies.filter(c => match(q, [c.name, c.industry, c.website]));
    }
    function fmtValue(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString('en-US')}` : '—'; }

    function renderContacts(body) {
        const list = filteredContacts();
        const rows = list.map(c => `<tr data-cm-contact="${esc(c.id)}" class="${state.selectedId === c.id ? 'is-selected' : ''}">
            <td class="cm-check"><input type="checkbox" data-cm-check="${esc(c.id)}" ${state.selectedId === c.id ? 'checked' : ''} aria-label="Pilih ${esc(c.name)}" title="Pilih kontak"></td>
            <td><span class="cm-contact-name"><span class="cm-avatar" style="background:${esc(colorFor(c.name))}">${esc(initials(c.name))}</span>${esc(c.name)}</span></td>
            <td>${esc(c.email || '—')}</td><td>${esc(c.phone || '—')}</td>
            <td>${c.job ? `<span class="cm-job-pill">${esc(c.job)}</span>` : '—'}</td>
            <td>${esc(c.added || '—')}</td><td>${esc(c.source || '—')}</td>
            <td><span class="cm-lastcell"><span class="cm-linkedin" title="LinkedIn (demo)">in</span><button type="button" class="cm-row-del" data-cm-del-contact="${esc(c.id)}" title="Hapus kontak ${esc(c.name)}" aria-label="Hapus kontak ${esc(c.name)}"><i data-lucide="trash-2"></i></button></span></td>
        </tr>`).join('');
        body.innerHTML = `<div class="cm-table-wrap"><table class="cm-table" aria-label="Contacts">
            <thead><tr><th class="cm-check"><input type="checkbox" aria-label="Pilih semua (demo)" title="Pilih semua (demo)"></th><th>Name</th><th>Email</th><th>Phone</th><th>Job title</th><th>Added</th><th>Source</th><th>LinkedIn</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="8" class="cm-empty-cell">${state.query.trim() || state.filter !== 'all' ? 'No contacts match your search.' : 'No contacts yet.'}</td></tr>`}</tbody>
        </table></div>`;
    }

    function renderDeals(body) {
        const q = state.query.trim().toLowerCase();
        body.innerHTML = `<div class="cm-board">${STAGES.map((stage, si) => {
            const deals = filteredDeals(stage.id);
            const total = state.deals.filter(d => d.stage === stage.id).length;
            return `<div class="cm-col" data-cm-col="${esc(stage.id)}">
                <div class="cm-col-head">${esc(stage.label)} <span class="cm-col-count" data-cm-col-count="${esc(stage.id)}">${total}</span></div>
                ${deals.length ? deals.map(d => `<div class="cm-deal-card" draggable="true" data-cm-deal-card="${esc(d.id)}">
                    <div class="cm-deal-top"><span class="cm-deal-name">${esc(d.name)}</span><button type="button" class="cm-card-del" data-cm-del-deal="${esc(d.id)}" title="Hapus deal ${esc(d.name)}" aria-label="Hapus deal ${esc(d.name)}"><i data-lucide="trash-2"></i></button></div>
                    <div class="cm-deal-value">${esc(fmtValue(d.value))}</div>
                    <div class="cm-deal-actions">
                        <button type="button" class="cm-move" data-cm-move="${esc(d.id)}|-1" ${si === 0 ? 'disabled' : ''} title="Pindah ke tahap sebelumnya" aria-label="Pindah ke tahap sebelumnya"><i data-lucide="chevron-left"></i></button>
                        <button type="button" class="cm-move" data-cm-move="${esc(d.id)}|1" ${si === STAGES.length - 1 ? 'disabled' : ''} title="Pindah ke tahap berikutnya" aria-label="Pindah ke tahap berikutnya"><i data-lucide="chevron-right"></i></button>
                    </div>
                </div>`).join('') : `<div class="cm-col-empty">No deals</div>`}
            </div>`;
        }).join('')}</div>`;
        if (q) { /* pencarian hanya menyaring kartu yang tampil; hitungan kolom tetap total tahap */ }
    }

    function renderCompanies(body) {
        const list = filteredCompanies();
        if (!state.companies.length) {
            body.innerHTML = `<div class="cm-empty-wrap"><div class="cm-empty"><span class="cm-empty-icon"><i data-lucide="building-2"></i></span><h2>No companies yet</h2><p>Add your first company to keep track of the organisations you work with.</p></div></div>`;
        } else if (!list.length) {
            body.innerHTML = `<div class="cm-empty-wrap"><div class="cm-empty"><span class="cm-empty-icon"><i data-lucide="search-x"></i></span><h2>No companies found</h2><p>No companies match &ldquo;${esc(state.query.trim())}&rdquo;.</p></div></div>`;
        } else {
            body.innerHTML = `<div class="cm-companies">${list.map(c => `<div class="cm-company-card">
                <span class="cm-company-icon"><i data-lucide="building-2"></i></span>
                <span class="cm-company-main"><span class="cm-company-name">${esc(c.name)}</span><span class="cm-company-meta">${esc([c.industry, c.website].filter(Boolean).join(' · ') || '—')}</span></span>
                <button type="button" class="cm-card-del" data-cm-del-company="${esc(c.id)}" title="Hapus perusahaan ${esc(c.name)}" aria-label="Hapus perusahaan ${esc(c.name)}"><i data-lucide="trash-2"></i></button>
            </div>`).join('')}</div>`;
        }
    }

    function render() {
        const body = el('cm-body'); if (!body) return;
        const tab = TABS[state.tab] || TABS.contacts;
        document.querySelectorAll('[data-cm-tab]').forEach(b => { const on = b.getAttribute('data-cm-tab') === state.tab; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        const create = el('cm-create'); if (create) create.innerHTML = `<i data-lucide="plus"></i> ${esc(tab.create)}`;
        const search = el('cm-search'); if (search && search.placeholder !== tab.placeholder) search.placeholder = tab.placeholder;
        const meta = el('cm-contacts-meta');
        if (meta) {
            meta.classList.toggle('hidden', state.tab !== 'contacts');
            if (state.tab === 'contacts') {
                const lbl = el('cm-filter-label'); if (lbl) lbl.textContent = state.filter === 'demo' ? 'Demo contacts' : state.filter === 'mine' ? 'Added by you' : 'All contacts';
                const of = el('cm-of'); if (of) of.textContent = `${filteredContacts().length} of ${allContacts().length}`;
            }
        }
        if (state.tab === 'contacts') renderContacts(body);
        else if (state.tab === 'deals') renderDeals(body);
        else renderCompanies(body);
        icons();
    }

    function deleteContact(id) {
        if (DEMO_CONTACTS.some(c => c.id === id)) { if (!state.deletedDemo.includes(id)) state.deletedDemo.push(id); }
        else state.contacts = state.contacts.filter(c => c.id !== id);
        if (state.selectedId === id) state.selectedId = null;
        if (state.detailId === id) closeDetail();
        save(); render();
    }
    function moveDeal(id, dir) {
        const deal = state.deals.find(d => d.id === id); if (!deal) return;
        const idx = STAGES.findIndex(s => s.id === deal.stage);
        const next = STAGES[idx + dir]; if (!next) return;
        deal.stage = next.id; save(); render();
    }

    const FORM_FIELDS = {
        contact: () => `
            <label class="cm-field">Name<input type="text" id="cm-f-name" required maxlength="120" placeholder="Nama kontak…" autocomplete="off"></label>
            <label class="cm-field">Email<input type="email" id="cm-f-email" maxlength="160" placeholder="nama@perusahaan.com" autocomplete="off"></label>
            <label class="cm-field">Phone<input type="tel" id="cm-f-phone" maxlength="40" placeholder="+44 …" autocomplete="off"></label>
            <label class="cm-field">Job title<input type="text" id="cm-f-job" maxlength="120" placeholder="Director of Sales…" autocomplete="off"></label>
            <label class="cm-field">Source<select id="cm-f-source"><option>Manual</option><option>Website</option><option>Referral</option><option>Import</option><option>Social</option></select></label>`,
        deal: () => `
            <label class="cm-field">Deal name<input type="text" id="cm-f-name" required maxlength="120" placeholder="Nama deal…" autocomplete="off"></label>
            <label class="cm-field">Value (USD)<input type="number" id="cm-f-value" min="0" step="any" placeholder="10000"></label>
            <label class="cm-field">Stage<select id="cm-f-stage">${STAGES.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select></label>`,
        company: () => `
            <label class="cm-field">Company name<input type="text" id="cm-f-name" required maxlength="120" placeholder="Nama perusahaan…" autocomplete="off"></label>
            <label class="cm-field">Industry<input type="text" id="cm-f-industry" maxlength="120" placeholder="Media, Retail, SaaS…" autocomplete="off"></label>
            <label class="cm-field">Website<input type="text" id="cm-f-website" maxlength="200" placeholder="example.com" autocomplete="off"></label>`
    };
    const MODAL_TITLES = { contact: 'New contact', deal: 'New deal', company: 'New company' };

    function openModal(type) {
        state.modalType = type;
        const title = el('cm-modal-title'); if (title) title.textContent = MODAL_TITLES[type] || 'New';
        const fields = el('cm-modal-fields'); if (fields) fields.innerHTML = FORM_FIELDS[type]();
        const modal = el('cm-modal'); if (modal) modal.classList.remove('hidden');
        const name = el('cm-f-name'); if (name) name.focus();
    }
    function closeModal() { const m = el('cm-modal'); if (m) m.classList.add('hidden'); state.modalType = null; }
    function openCreateForTab() { openModal(state.tab === 'deals' ? 'deal' : state.tab === 'companies' ? 'company' : 'contact'); }

    function openDetail(id) {
        const c = contactById(id); if (!c) return;
        state.detailId = id; state.selectedId = id;
        const box = el('cm-detail-body'); if (!box) return;
        box.innerHTML = `<div class="cm-detail-head"><span class="cm-avatar" style="background:${esc(colorFor(c.name))}">${esc(initials(c.name))}</span><span><strong>${esc(c.name)}</strong><span>${esc(c.job || 'Contact')}</span></span></div>
            ${[['Email', c.email], ['Phone', c.phone], ['Job title', c.job], ['Added', c.added], ['Source', c.source]].map(([k, v]) => `<div class="cm-detail-row"><span>${esc(k)}</span><strong>${esc(v || '—')}</strong></div>`).join('')}`;
        const modal = el('cm-detail-modal'); if (modal) modal.classList.remove('hidden');
        render();
    }
    function closeDetail() { const m = el('cm-detail-modal'); if (m) m.classList.add('hidden'); state.detailId = null; }

    function submitForm(event) {
        event.preventDefault();
        const type = state.modalType; if (!type) return;
        const val = (id) => (el(id)?.value || '').trim();
        const name = val('cm-f-name'); if (!name) return;
        if (type === 'contact') {
            const today = new Date();
            const added = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
            state.contacts.unshift({ id: uid('cm-contact'), name, email: val('cm-f-email'), phone: val('cm-f-phone'), job: val('cm-f-job'), source: val('cm-f-source') || 'Manual', added });
            state.selectedId = null;
            if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `CRM contact added: ${name}`, time: 'now', icon: 'contact-round', color: 'c-blue' });
        } else if (type === 'deal') {
            const stage = STAGES.some(s => s.id === val('cm-f-stage')) ? val('cm-f-stage') : 'new';
            state.deals.push({ id: uid('cm-deal'), name, value: val('cm-f-value'), stage });
            if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `CRM deal created: ${name}`, time: 'now', icon: 'handshake', color: 'c-teal' });
        } else {
            state.companies.unshift({ id: uid('cm-company'), name, industry: val('cm-f-industry'), website: val('cm-f-website') });
            if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `CRM company added: ${name}`, time: 'now', icon: 'building-2', color: 'c-violet' });
        }
        save(); render(); closeModal();
    }

    function closeMenus() { state.openMenu = null; document.querySelectorAll('[data-cm-menu]').forEach(m => m.classList.add('hidden')); }
    function toggleMenu(name) { const willOpen = state.openMenu !== name; closeMenus(); if (!willOpen) return; state.openMenu = name; const m = document.querySelector(`[data-cm-menu="${name}"]`); if (m) m.classList.remove('hidden'); }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-crm-replica'); if (!root) return;
        const panel = el('cm-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const tabBtn = event.target.closest('[data-cm-tab]'); if (tabBtn) { state.tab = tabBtn.getAttribute('data-cm-tab'); state.query = ''; const s = el('cm-search'); if (s) s.value = ''; save(); render(); return; }
            if (event.target.closest('[data-cm-create]')) { openCreateForTab(); return; }
            const menuBtn = event.target.closest('[data-cm-menu-toggle]'); if (menuBtn) { toggleMenu(menuBtn.getAttribute('data-cm-menu-toggle')); return; }
            const proj = event.target.closest('[data-cm-project]'); if (proj) { const l = el('cm-project-label'); if (l) l.textContent = proj.getAttribute('data-cm-project'); closeMenus(); return; }
            const filter = event.target.closest('[data-cm-filter]'); if (filter) { state.filter = filter.getAttribute('data-cm-filter'); save(); closeMenus(); render(); return; }
            if (event.target.closest('[data-cm-connect-opt]')) { closeMenus(); return; }
            if (!event.target.closest('.cm-dd')) closeMenus();
            const delContact = event.target.closest('[data-cm-del-contact]'); if (delContact) { event.stopPropagation(); deleteContact(delContact.getAttribute('data-cm-del-contact')); return; }
            const delDeal = event.target.closest('[data-cm-del-deal]'); if (delDeal) { state.deals = state.deals.filter(d => d.id !== delDeal.getAttribute('data-cm-del-deal')); save(); render(); return; }
            const delCompany = event.target.closest('[data-cm-del-company]'); if (delCompany) { state.companies = state.companies.filter(c => c.id !== delCompany.getAttribute('data-cm-del-company')); save(); render(); return; }
            const move = event.target.closest('[data-cm-move]'); if (move && !move.disabled) { const [id, dir] = move.getAttribute('data-cm-move').split('|'); moveDeal(id, Number(dir)); return; }
            const check = event.target.closest('[data-cm-check]'); if (check) { const id = check.getAttribute('data-cm-check'); state.selectedId = state.selectedId === id ? null : id; render(); return; }
            const row = event.target.closest('[data-cm-contact]'); if (row) { openDetail(row.getAttribute('data-cm-contact')); return; }
            if (event.target.closest('[data-cm-modal-close]') || event.target.id === 'cm-modal') { closeModal(); return; }
            if (event.target.closest('[data-cm-detail-close]') || event.target.id === 'cm-detail-modal') { closeDetail(); return; }
            if (event.target.closest('[data-cm-detail-delete]')) { if (state.detailId) deleteContact(state.detailId); return; }
            const exit = event.target.closest('[data-cm-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-cm-exit')); return; }
            const navKey = event.target.closest('[data-cm-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-cm-nav')); return; }
        });
        root.addEventListener('dragstart', (event) => {
            const card = event.target.closest('[data-cm-deal-card]'); if (!card) return;
            if (event.dataTransfer) { event.dataTransfer.setData('text/plain', card.getAttribute('data-cm-deal-card')); event.dataTransfer.effectAllowed = 'move'; }
        });
        root.addEventListener('dragover', (event) => {
            const col = event.target.closest('[data-cm-col]'); if (!col) return;
            event.preventDefault();
            root.querySelectorAll('.cm-col').forEach(c => c.classList.toggle('is-dragover', c === col));
        });
        root.addEventListener('dragleave', (event) => { const col = event.target.closest('[data-cm-col]'); if (col && !col.contains(event.relatedTarget)) col.classList.remove('is-dragover'); });
        root.addEventListener('drop', (event) => {
            const col = event.target.closest('[data-cm-col]'); if (!col) return;
            event.preventDefault();
            const id = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
            const deal = state.deals.find(d => d.id === id);
            root.querySelectorAll('.cm-col').forEach(c => c.classList.remove('is-dragover'));
            if (deal && deal.stage !== col.getAttribute('data-cm-col')) { deal.stage = col.getAttribute('data-cm-col'); save(); render(); }
        });
        const search = el('cm-search');
        if (search) search.addEventListener('input', () => { state.query = search.value || ''; render(); });
        const form = el('cm-form'); if (form) form.addEventListener('submit', submitForm);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); closeDetail(); closeMenus(); } });
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); const s = el('cm-search'); if (s && s.value !== state.query) { state.query = s.value || ''; render(); } if (state.activity) state.activity.render(); icons(); }

    window.CrmReplicaPage = { bind, open, getState: () => ({ tab: state.tab, contacts: allContacts().slice(), deals: state.deals.slice(), companies: state.companies.slice() }), STAGES, DEMO_CONTACTS };
})();
