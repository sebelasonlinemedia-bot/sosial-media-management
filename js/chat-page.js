/**
 * Halaman Chat — replika visual referensi SisTava (Employee Direct Chat).
 * Data demo statis lokal; TIDAK terhubung ke backend chat mana pun.
 * Riwayat demo tersimpan hanya di localStorage `piks-chat-replica-v1`.
 */
(function () {
    const STORAGE_KEY = 'piks-chat-replica-v1';
    const EMPLOYEES = [
        { id: 'alice', name: 'Alice', role: 'Personal Assistant', color: '#d97706', greeting: "Hey there, I'm Alice, your personal assistant. I can keep your day moving, handle the details, and bring in the right teammates when you need deeper help. Choose what we should start with below." },
        { id: 'maya', name: 'Maya', role: 'Manager', color: '#e11d48', greeting: "Hey there, I'm Maya, your manager. I can break a brief into tasks, assign the right teammates, and keep approvals on track. Choose what we should start with below." },
        { id: 'rani', name: 'Rani', role: 'Strategist', color: '#0d9488', greeting: "Hey there, I'm Rani, your strategist. I can turn insights into the next content brief and plan what to post. Choose what we should start with below." },
        { id: 'dimas', name: 'Dimas', role: 'Copywriter', color: '#2563eb', greeting: "Hey there, I'm Dimas, your copywriter. I can write hooks, captions, and scripts in the brand voice. Choose what we should start with below." },
        { id: 'salsa', name: 'Salsa', role: 'Visual Producer', color: '#7c3aed', greeting: "Hey there, I'm Salsa, your visual producer. I can plan visuals, thumbnails, and short video concepts. Choose what we should start with below." },
        { id: 'titin', name: 'Titin', role: 'Community Manager', color: '#059669', greeting: "Hey there, I'm Titin, your community manager. I can draft replies and keep the audience conversation moving. Choose what we should start with below." },
        { id: 'bimo', name: 'Bimo', role: 'Analyst', color: '#0891b2', greeting: "Hey there, I'm Bimo, your analyst. I can read performance numbers and point to what to do next. Choose what we should start with below." },
        { id: 'nadira', name: 'Nadira', role: 'Compliance', color: '#475569', greeting: "Hey there, I'm Nadira, your compliance reviewer. I can check claims, banned words, and brand safety before anything ships. Choose what we should start with below." }
    ];
    const state = { bound: false, app: null, activeId: 'alice', enabled: true, threads: {}, activity: null };
    /* Panel aktivitas kanan memakai modul bersama js/replica-activity.js
       (data & logika filter yang sama dengan halaman Tasks replika). */
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function emp() { return EMPLOYEES.find(e => e.id === state.activeId) || EMPLOYEES[0]; }
    function load() { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (s && typeof s === 'object') { if (s.threads) state.threads = s.threads; if (s.activeId && EMPLOYEES.some(e => e.id === s.activeId)) state.activeId = s.activeId; if (typeof s.enabled === 'boolean') state.enabled = s.enabled; } } catch (_) {} }
    function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ threads: state.threads, activeId: state.activeId, enabled: state.enabled })); } catch (_) {} }
    function thread(id) { if (!Array.isArray(state.threads[id])) state.threads[id] = []; return state.threads[id]; }

    function renderEmployees() {
        const box = el('cr-employees'); if (!box) return;
        box.innerHTML = EMPLOYEES.map(e => `<button type="button" class="cr-emp${e.id === state.activeId ? ' is-active' : ''}" data-cr-emp="${esc(e.id)}">
            <span class="cr-avatar" style="background:${esc(e.color)}">${esc(e.name[0])}<i class="cr-dot"></i></span>
            <span class="cr-emp-text"><strong>${esc(e.name)}</strong><span>${esc(e.role)}</span></span></button>`).join('');
    }
    function renderMessages() {
        const box = el('cr-messages'); if (!box) return;
        const e = emp();
        const msgs = thread(e.id);
        box.innerHTML = `<div class="cr-msg cr-msg-agent"><span class="cr-avatar cr-avatar-sm" style="background:${esc(e.color)}">${esc(e.name[0])}</span><div><p class="cr-msg-name">${esc(e.name)}</p><p class="cr-msg-body">${esc(e.greeting)}</p></div></div>` +
            msgs.map(m => m.from === 'me'
                ? `<div class="cr-msg cr-msg-me"><div class="cr-bubble-me">${esc(m.text)}</div></div>`
                : `<div class="cr-msg cr-msg-agent"><span class="cr-avatar cr-avatar-sm" style="background:${esc(e.color)}">${esc(e.name[0])}</span><div><p class="cr-msg-name">${esc(e.name)}</p><p class="cr-msg-body">${esc(m.text)}</p></div></div>`).join('');
        box.scrollTop = box.scrollHeight;
    }
    function renderHead() {
        const e = emp();
        const tab = el('cr-active-tab'); if (tab) tab.innerHTML = `<span class="cr-avatar cr-avatar-sm" style="background:${esc(e.color)}">${esc(e.name[0])}</span> ${esc(e.name)} <span class="cr-tab-badge">${esc(e.role.split(' ')[0])}</span>`;
        const t = el('cr-chat-tab'); if (t) t.innerHTML = '<i data-lucide="message-square"></i> Chat';
        renderEmployees(); renderMessages(); icons();
    }
    function renderActivity() { if (state.activity) state.activity.render(); }
    function send() {
        const input = el('cr-input'); if (!input) return;
        const text = input.value.trim(); if (!text) return;
        const e = emp();
        thread(e.id).push({ from: 'me', text });
        thread(e.id).push({ from: 'agent', text: `Got it — I'll start on "${text.length > 72 ? text.slice(0, 72) + '…' : text}" and bring in the right teammates if it needs deeper help. (Demo reply — not connected to a backend.)` });
        if (state.activity) state.activity.addLive({ kind: 'run', scope: 'employee', category: 'run', label: 'Work run', title: `${e.name} ran a task`, time: 'now', icon: 'zap', color: 'c-amber' });
        input.value = ''; save(); renderMessages(); renderActivity(); input.focus();
    }
    function selectEmployee(id) { state.activeId = id; save(); renderHead(); renderActivity(); const i = el('cr-input'); if (i) i.placeholder = `Tell ${emp().name} what to work on…`; }

    function bind(app) {
        if (state.bound) return; state.bound = true; state.app = app; load();
        const root = el('view-chat'); if (!root) return;
        const actPanel = root.querySelector('.cr-analysis');
        if (actPanel && window.ReplicaActivity) state.activity = ReplicaActivity.create(actPanel);
        root.addEventListener('click', (event) => {
            if (state.activity && state.activity.handleClick(event)) return;
            const empBtn = event.target.closest('[data-cr-emp]'); if (empBtn) { selectEmployee(empBtn.getAttribute('data-cr-emp')); return; }
            if (event.target.closest('[data-cr-send]')) { send(); return; }
            const en = event.target.closest('[data-cr-enable]'); if (en) { state.enabled = !state.enabled; save(); en.textContent = state.enabled ? 'Enable' : 'Enabled'; en.classList.toggle('is-on', state.enabled); en.setAttribute('aria-pressed', String(state.enabled)); return; }
            const exit = event.target.closest('[data-cr-exit]'); if (exit && state.app && state.app.switchView) { state.app.switchView(exit.getAttribute('data-cr-exit')); return; }
            const navKey = event.target.closest('[data-cr-nav]'); if (navKey && state.app && state.app.openMainMenu) { state.app.openMainMenu(navKey.getAttribute('data-cr-nav')); return; }
        });
        const input = el('cr-input');
        if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        const en = root.querySelector('[data-cr-enable]'); if (en) { en.textContent = state.enabled ? 'Enable' : 'Enabled'; en.classList.toggle('is-on', state.enabled); }
        renderHead(); renderActivity();
    }
    function open() { load(); renderHead(); renderActivity(); const i = el('cr-input'); if (i) i.placeholder = `Tell ${emp().name} what to work on…`; }
    window.ChatPage = { bind, open, EMPLOYEES };
})();
