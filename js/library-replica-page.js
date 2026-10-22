/**
 * Halaman Library — replika visual referensi Company Content Library.
 * Data lokal saja; TIDAK terhubung ke backend/penerbitan mana pun.
 * Konten buatan pengguna tersimpan di localStorage `piks-library-replica-v1`.
 * Panel aktivitas kanan memakai modul bersama js/replica-activity.js.
 */
(function () {
    const STORAGE_KEY = 'piks-library-replica-v1';
    // Jenis konten sesuai deretan kartu pada referensi. Subjudul yang
    // terpotong pada tangkapan layar dilengkapi secara wajar (lihat ringkasan).
    const TYPES = [
        { id: 'social', name: 'Social post', sub: 'Choose a platform to start', icon: 'share-2', color: '#fbbf24' },
        { id: 'newsletter', name: 'Newsletter', sub: 'A recurring publication for subscribers', icon: 'mail', color: '#60a5fa' },
        { id: 'campaign', name: 'Campaign', sub: 'A coordinated set of themed posts', icon: 'flag', color: '#fb923c' },
        { id: 'image', name: 'Image', sub: 'A visual for a set purpose', icon: 'image', color: '#a78bfa' },
        { id: 'video', name: 'Video', sub: 'A short video for an audience', icon: 'clapperboard', color: '#fb7185' },
        { id: 'music', name: 'Music', sub: 'Original music for a project', icon: 'music', color: '#2dd4bf' },
        { id: 'article', name: 'Article', sub: 'A longer written story', icon: 'file-text', color: '#34d399' },
        { id: 'case-study', name: 'Case study', sub: 'A customer story with results', icon: 'briefcase', color: '#60a5fa' },
        { id: 'white-paper', name: 'White paper', sub: 'A research-led authority piece', icon: 'file', color: '#94a3b8' },
        { id: 'presentation', name: 'Presentation', sub: 'A structured slide deck', icon: 'presentation', color: '#2dd4bf' },
        { id: 'flyer', name: 'Flyer', sub: 'A designed one-page promotion', icon: 'layers', color: '#a78bfa' },
        { id: 'infographic', name: 'Infographic', sub: 'A visual explanation of data', icon: 'bar-chart-3', color: '#f472b6' },
        { id: 'mockup', name: 'Mockup', sub: 'A design in situ on a page', icon: 'monitor', color: '#fb7185' },
        { id: 'brochure', name: 'Brochure', sub: 'A print-ready fold-out or PDF', icon: 'book-open', color: '#34d399' },
        { id: 'logo', name: 'Logo', sub: 'A mark for a brand or product', icon: 'hexagon', color: '#fbbf24' },
        { id: 'web-page', name: 'Web page', sub: 'A purpose-built page for the web', icon: 'globe', color: '#4ade80' },
        { id: 'document', name: 'Document', sub: 'A report, plan, or working file', icon: 'file-text', color: '#60a5fa' },
        { id: 'spreadsheet', name: 'Spreadsheet', sub: 'A tracker, model, or data table', icon: 'table', color: '#4ade80' },
        { id: 'audio', name: 'Audio', sub: 'A recorded or narrated clip', icon: 'audio-lines', color: '#fb923c' },
        { id: 'podcast', name: 'Podcast', sub: 'A produced audio episode', icon: 'podcast', color: '#a78bfa' }
    ];
    const STAGES = [
        { id: 'drafts', name: 'Drafts', icon: 'file-text', color: '#93c5fd', sub0: '0 drafts prepared', sub: n => `${n} draft${n === 1 ? '' : 's'} prepared`, empty: 'Your drafts will appear here', next: 'Request approval' },
        { id: 'approval', name: 'Needs approval', icon: 'clock', color: '#fbbf24', sub0: 'Waiting for human review', sub: n => `${n} waiting for human review`, empty: 'Nothing is waiting for human review', next: 'Approve' },
        { id: 'scheduled', name: 'Scheduled', icon: 'calendar-days', color: '#a78bfa', sub0: 'Approved and ready to publish', sub: n => `${n} approved and ready`, empty: 'Approved posts will appear here', next: 'Publish' },
        { id: 'delivery', name: 'Delivery', icon: 'send', color: '#34d399', sub0: 'Published', sub: n => `${n} published`, empty: 'Delivery results will appear here', next: null }
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
    const state = { bound: false, app: null, activity: null, items: [], media: [], selectedType: 'social', modalType: 'social' };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function employees() { return (window.ChatPage && Array.isArray(ChatPage.EMPLOYEES) && ChatPage.EMPLOYEES.length) ? ChatPage.EMPLOYEES : FALLBACK_EMPLOYEES; }
    function typeById(id) { return TYPES.find(t => t.id === id) || TYPES[0]; }
    function stageById(id) { return STAGES.find(s => s.id === id) || STAGES[0]; }
    function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
    function fmtTime(ts) { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } }

    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.items = (s && Array.isArray(s.items)) ? s.items.filter(i => i && i.id && i.title && TYPES.some(t => t.id === i.type) && STAGES.some(x => x.id === i.stage)) : [];
            state.media = (s && Array.isArray(s.media)) ? s.media.filter(m => m && m.id && m.title && (m.kind === 'image' || m.kind === 'video')) : [];
            if (s && TYPES.some(t => t.id === s.selectedType)) state.selectedType = s.selectedType;
        } catch (_) { state.items = []; state.media = []; }
        state.modalType = state.selectedType;
    }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, media: state.media, selectedType: state.selectedType })); } catch (_) {} }

    function renderEmployees() {
        const box = el('lb-employees'); if (!box) return;
        box.innerHTML = employees().map((e, i) => `<button type="button" class="cr-emp${i === 0 ? ' is-active' : ''}" title="${esc(e.name)} — ${esc(e.role)} (demo)"><span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span><span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }

    function renderTypes() {
        const box = el('lb-types'); if (!box) return;
        box.innerHTML = TYPES.map(t => `<button type="button" class="lb-type${t.id === state.selectedType ? ' is-selected' : ''}" data-lb-type="${esc(t.id)}" aria-pressed="${String(t.id === state.selectedType)}" title="${esc(t.name)} — ${esc(t.sub)}">
            <span class="lb-type-icon" style="color:${esc(t.color)}"><i data-lucide="${esc(t.icon)}"></i></span>
            <span class="lb-type-name">${esc(t.name)}</span>
            ${t.id === 'social' ? '<span class="lb-platforms" aria-hidden="true"><span style="background:#0a66c2">in</span><span style="background:#1877f2">f</span><span style="background:#111">𝕏</span><span style="background:linear-gradient(45deg,#f59e0b,#ec4899,#8b5cf6)">◎</span><span style="background:#111">♪</span><span style="background:#f00">▶</span><span style="background:#ff4500">●</span><span style="background:#e60023">P</span></span>' : ''}
            <span class="lb-type-sub">${esc(t.sub)}</span>
        </button>`).join('');
        icons();
    }

    function renderWorkflow() {
        const box = el('lb-workflow'); if (!box) return;
        box.innerHTML = STAGES.map(stage => {
            const items = state.items.filter(i => i.stage === stage.id);
            return `<div class="lb-col" data-lb-col="${esc(stage.id)}">
                <div class="lb-col-head"><span class="lb-col-title" style="color:${esc(stage.color)}"><i data-lucide="${esc(stage.icon)}"></i>${esc(stage.name)}</span><span class="lb-col-count" data-lb-count="${esc(stage.id)}">${items.length}</span></div>
                <p class="lb-col-sub">${esc(items.length ? stage.sub(items.length) : stage.sub0)}</p>
                <div class="lb-col-body">
                ${items.length ? items.map(item => { const t = typeById(item.type); return `<div class="lb-item">
                    <div class="lb-item-top"><span class="lb-item-type" style="color:${esc(t.color)}"><i data-lucide="${esc(t.icon)}"></i>${esc(t.name)}</span><button type="button" class="lb-item-del" data-lb-del-item="${esc(item.id)}" title="Hapus konten ${esc(item.title)}" aria-label="Hapus konten ${esc(item.title)}"><i data-lucide="trash-2"></i></button></div>
                    <p class="lb-item-title">${esc(item.title)}</p>
                    <p class="lb-item-time">${esc(fmtTime(item.createdAt))}</p>
                    ${stage.next ? `<button type="button" class="lb-item-next" data-lb-advance="${esc(item.id)}">${esc(stage.next)} <i data-lucide="arrow-right"></i></button>` : '<span class="lb-item-done"><i data-lucide="check"></i> Published</span>'}
                </div>`; }).join('') : `<p class="lb-col-empty">${esc(stage.empty)}</p>`}
                </div>
            </div>`;
        }).join('');
        icons();
    }

    function renderMedia() {
        [['image', 'lb-media-images', 'image', 'No generated images yet.'], ['video', 'lb-media-videos', 'clapperboard', 'No generated videos yet.']].forEach(([kind, id, icon, empty]) => {
            const box = el(id); if (!box) return;
            const list = state.media.filter(m => m.kind === kind);
            box.innerHTML = list.length ? list.map(m => `<div class="lb-media-row"><span class="lb-media-icon"><i data-lucide="${icon}"></i></span><span class="lb-media-name">${esc(m.title)}</span><span class="lb-media-time">${esc(fmtTime(m.createdAt))}</span><button type="button" class="lb-item-del" data-lb-del-media="${esc(m.id)}" title="Hapus media ${esc(m.title)}" aria-label="Hapus media ${esc(m.title)}"><i data-lucide="trash-2"></i></button></div>`).join('') : `<p class="lb-media-empty">${esc(empty)}</p>`;
        });
        icons();
    }

    function render() { renderTypes(); renderWorkflow(); renderMedia(); }

    function openModal(typeId) {
        state.modalType = TYPES.some(t => t.id === typeId) ? typeId : state.selectedType;
        state.selectedType = state.modalType;
        renderTypes(); renderPicker();
        const title = el('lb-f-title'); if (title) title.value = '';
        const modal = el('lb-modal'); if (modal) modal.classList.remove('hidden');
        if (title) title.focus();
    }
    function closeModal() { const m = el('lb-modal'); if (m) m.classList.add('hidden'); }
    function renderPicker() {
        const box = el('lb-picker'); if (!box) return;
        box.innerHTML = TYPES.map(t => `<button type="button" class="lb-pick${t.id === state.modalType ? ' is-selected' : ''}" data-lb-pick="${esc(t.id)}" aria-pressed="${String(t.id === state.modalType)}" title="${esc(t.name)}"><span style="color:${esc(t.color)}"><i data-lucide="${esc(t.icon)}"></i></span>${esc(t.name)}</button>`).join('');
        const label = el('lb-modal-type-name'); if (label) label.textContent = typeById(state.modalType).name;
        icons();
    }

    function submitForm(event) {
        event.preventDefault();
        const title = (el('lb-f-title')?.value || '').trim(); if (!title) return;
        const type = typeById(state.modalType);
        const item = { id: uid('lb'), type: type.id, title, stage: 'drafts', createdAt: Date.now() };
        state.items.unshift(item);
        state.selectedType = type.id;
        // Keputusan: konten Image/Video juga dicatat sebagai media tergenerasi
        // (tertaut itemId; menghapus draf ikut menghapus media tertautnya).
        if (type.id === 'image' || type.id === 'video') state.media.unshift({ id: uid('lb-media'), kind: type.id, title, createdAt: item.createdAt, itemId: item.id });
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Library ${type.name} created: ${title}`, time: 'now', icon: type.icon, color: 'c-violet' });
        save(); render(); closeModal();
    }

    function advance(id) {
        const item = state.items.find(i => i.id === id); if (!item) return;
        const idx = STAGES.findIndex(s => s.id === item.stage);
        const next = STAGES[idx + 1]; if (!next) return;
        item.stage = next.id;
        if (state.activity) state.activity.addLive({ kind: 'activity', scope: 'team', category: 'workspace', label: 'Activity', title: `Library content moved to ${next.name}: ${item.title}`, time: 'now', icon: next.icon, color: 'c-teal' });
        save(); renderWorkflow();
    }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-library-replica'); if (!root) return;
        const panel = el('lb-activity-panel');
        if (panel && window.ReplicaActivity) { panel.innerHTML = ReplicaActivity.markup(); state.activity = ReplicaActivity.create(panel); }
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const typeBtn = event.target.closest('[data-lb-type]'); if (typeBtn) { openModal(typeBtn.getAttribute('data-lb-type')); return; }
            const pick = event.target.closest('[data-lb-pick]'); if (pick) { state.modalType = pick.getAttribute('data-lb-pick'); state.selectedType = state.modalType; save(); renderTypes(); renderPicker(); return; }
            if (event.target.closest('[data-lb-create]')) { openModal(state.selectedType); return; }
            const scrollBtn = event.target.closest('[data-lb-scroll]'); if (scrollBtn) { const strip = el('lb-types'); if (strip) strip.scrollBy({ left: Number(scrollBtn.getAttribute('data-lb-scroll')) || 300, behavior: 'smooth' }); return; }
            const adv = event.target.closest('[data-lb-advance]'); if (adv) { advance(adv.getAttribute('data-lb-advance')); return; }
            const delItem = event.target.closest('[data-lb-del-item]'); if (delItem) { const id = delItem.getAttribute('data-lb-del-item'); state.items = state.items.filter(i => i.id !== id); state.media = state.media.filter(m => m.itemId !== id); save(); render(); return; }
            const delMedia = event.target.closest('[data-lb-del-media]'); if (delMedia) { state.media = state.media.filter(m => m.id !== delMedia.getAttribute('data-lb-del-media')); save(); renderMedia(); return; }
            if (event.target.closest('[data-lb-modal-close]') || event.target.id === 'lb-modal') { closeModal(); return; }
            const exit = event.target.closest('[data-lb-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-lb-exit')); return; }
            const navKey = event.target.closest('[data-lb-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-lb-nav')); return; }
        });
        const form = el('lb-form'); if (form) form.addEventListener('submit', submitForm);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
        renderEmployees(); render(); if (state.activity) state.activity.render(); icons();
    }
    function open() { load(); renderEmployees(); render(); if (state.activity) state.activity.render(); icons(); }

    window.LibraryReplicaPage = { bind, open, getState: () => ({ items: state.items.slice(), media: state.media.slice(), selectedType: state.selectedType }), TYPES, STAGES };
})();
