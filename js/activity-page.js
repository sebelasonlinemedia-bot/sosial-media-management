/**
 * Halaman Aktivitas — audit tindakan tim (bahasa Indonesia).
 * Dipanggil dari app.switchView('activity').
 */
(function () {
    const TEAM = [
        { id: 'manager', name: 'Maya', role: 'Asisten Pribadi', color: '#34d399', online: true, crown: true },
        { id: 'strategist', name: 'Rani', role: 'Spesialis Dukungan', color: '#fb7185', online: true },
        { id: 'copywriter', name: 'Dimas', role: 'Manajer Pemasaran', color: '#60a5fa', online: true },
        { id: 'analyst', name: 'Bimo', role: 'Analis Data', color: '#a78bfa', online: false },
        { id: 'compliance', name: 'Nadira', role: 'Perwakilan Penjualan', color: '#fbbf24', online: true },
        { id: 'finance', name: 'Fajar', role: 'Akuntan', color: '#94a3b8', online: false },
        { id: 'sales', name: 'Reno', role: 'Paralegal', color: '#38bdf8', online: false },
        { id: 'visual-producer', name: 'Salsa', role: 'Desainer Grafis', color: '#f472b6', online: true },
        { id: 'product', name: 'Prama', role: 'Manajer Operasi', color: '#fb923c', online: false },
        { id: 'community-manager', name: 'Titin', role: 'Manajer SDM', color: '#4ade80', online: true },
        { id: 'people', name: 'Kirana', role: 'Desainer Produk', color: '#c084fc', online: true }
    ];

    const ACTIVE = new Set(['working', 'publishing', 'queued', 'awaiting_approval', 'needs_info']);

    const CARDS = [
        {
            id: 'sprint',
            kind: 'audit',
            scope: 'company',
            trigger: 'schedule',
            actorId: 'manager',
            title: 'Memperbarui info perusahaan, memakai profil kelola pemberi kerja, dan merencanakan sprint',
            when: '1 jam lalu',
            summary: 'Memperbarui info perusahaan, memakai profil kelola pemberi kerja, dan merencanakan sprint',
            actions: [
                {
                    time: '08.00',
                    label: 'Maya memperbarui info perusahaan',
                    ms: '84 mdtk',
                    details: [
                        ['Status', 'diperbarui'],
                        ['Entitas', 'Profil perusahaan'],
                        ['Bidang', 'nama, jam operasional, kontak']
                    ]
                },
                {
                    time: '08.00',
                    label: 'Maya merencanakan sprint',
                    ms: '75 mdtk',
                    details: [
                        ['Status', 'diambil'],
                        ['Entitas', 'Sprint #1'],
                        ['ID Sprint', '08f453d7-e669-4d29-9015-ae8fbf729dc9'],
                        ['Nomor', '1'],
                        ['Status', 'perencanaan'],
                        ['Tujuan', '7'],
                        ['Durasi (hari)', '7'],
                        ['Berulang', 'Ya'],
                        ['Dimulai pada', '—'],
                        ['Berakhir pada', '—'],
                        ['Upacara kuartal', 'Tidak'],
                        ['Upacara tahunan', 'Tidak']
                    ]
                },
                {
                    time: '08.30',
                    label: 'Maya memakai kelola profil pemberi kerja',
                    ms: '61 mdtk',
                    details: [
                        ['Status', 'dipakai'],
                        ['Entitas', 'Profil pemberi kerja'],
                        ['Mode', 'kelola']
                    ]
                }
            ]
        },
        {
            id: 'chat-dimas',
            kind: 'chat',
            scope: 'team',
            trigger: 'chat',
            actorId: 'copywriter',
            title: 'Membalas pesan obrolan',
            when: '2 jam lalu',
            summary: 'Dimas membalas pesan di kanal konten dan menandai draf caption yang perlu ditinjau.'
        },
        {
            id: 'chat-rani',
            kind: 'chat',
            scope: 'team',
            trigger: 'chat',
            actorId: 'strategist',
            title: 'Membalas pesan obrolan',
            when: '2 jam lalu',
            summary: 'Rani membalas pertanyaan jadwal posting dan mengunci pilar konten minggu ini.'
        },
        {
            id: 'review-titin',
            kind: 'chat',
            scope: 'employee',
            trigger: 'manual',
            actorId: 'community-manager',
            title: 'Meninjau komentar masuk',
            when: '3 jam lalu',
            summary: 'Titin menyortir komentar komunitas, membalas yang aman, dan menandai keluhan untuk persetujuan.'
        }
    ];

    const SIDE = [
        { bucket: 'hour', actorId: 'manager', text: 'jadwal terlewat, tidak ada panel…', when: '4 mnt', scope: 'team', cardId: 'sprint' },
        { bucket: 'earlier', actorId: 'manager', text: 'Memperbarui info perusahaan, …', when: '1 jam', scope: 'company', cardId: 'sprint' },
        { bucket: 'earlier', actorId: 'copywriter', text: 'Membalas pesan obrolan…', when: '1 jam', scope: 'team', cardId: 'chat-dimas' },
        { bucket: 'earlier', actorId: 'strategist', text: 'Membalas pesan obrolan…', when: '2 jam', scope: 'team', cardId: 'chat-rani' },
        { bucket: 'earlier', actorId: 'manager', text: 'Membuat Sprint #1', when: '2 jam', scope: 'company', cardId: 'sprint' }
    ];

    const TRIGGER_LABEL = {
        all: 'Semua pemicu',
        schedule: 'Jadwal',
        chat: 'Obrolan',
        manual: 'Manual'
    };

    const state = {
        bound: false,
        app: null,
        query: '',
        orgOpen: true,
        teamOpen: true,
        rosterOpen: true,
        sideOpen: true,
        scope: 'team',
        sideScope: 'team',
        trigger: 'all',
        memberId: null,
        space: 'workspace',
        account: 'personal',
        userSized: false,
        expanded: { 'sprint:1': true },
        cardOpen: { sprint: true },
        team: TEAM.map(person => ({ ...person })),
        noticeTimer: null
    };

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function personById(id) {
        return state.team.find(person => person.id === id) || state.team[0];
    }

    function initials(name) {
        return String(name || '?').trim().charAt(0).toUpperCase();
    }

    function avatar(person, size) {
        const cls = size ? `act-av act-av-${size}` : 'act-av';
        const crown = person.crown
            ? '<svg class="act-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7.5 7.2 12 12 5l4.8 7L21 7.5 19.2 18H4.8L3 7.5z"/></svg>'
            : '';
        const dot = `<i class="act-dot${person.online ? ' is-on' : ''}"></i>`;
        return `<span class="${cls}" style="background:${esc(person.color)}">${esc(initials(person.name))}${crown}${dot}</span>`;
    }

    function workingCount() {
        return state.team.filter(person => person.online).length;
    }

    function visibleMembers() {
        const q = state.query.trim().toLowerCase();
        if (!q) return state.team;
        return state.team.filter(person =>
            person.name.toLowerCase().includes(q) || person.role.toLowerCase().includes(q)
        );
    }

    function visibleCards() {
        return CARDS.filter(card => {
            if (state.trigger !== 'all' && card.trigger !== state.trigger) return false;
            if (state.memberId && card.actorId !== state.memberId) return false;
            if (state.scope === 'company' && card.scope !== 'company') return false;
            if (state.scope === 'employee' && !state.memberId && card.scope === 'company') return false;
            return true;
        });
    }

    function toast(message) {
        const el = document.getElementById('act-notice');
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
        clearTimeout(state.noticeTimer);
        state.noticeTimer = setTimeout(() => el.classList.add('hidden'), 2800);
    }

    function renderRoster() {
        const members = document.getElementById('act-members');
        const teamCount = document.getElementById('act-team-count');
        const liveCount = document.getElementById('act-live-count');
        const liveSub = document.getElementById('act-live-sub');
        const pill = document.getElementById('act-online-pill');
        const stack = document.getElementById('act-stack');
        const list = visibleMembers();
        const online = workingCount();
        if (teamCount) teamCount.textContent = String(state.team.length);
        if (liveCount) liveCount.textContent = online.toLocaleString('id-ID');
        if (liveSub) liveSub.textContent = `dari ${state.team.length.toLocaleString('id-ID')} direkrut`;
        if (pill) pill.textContent = String(online);
        if (members) {
            members.hidden = !state.teamOpen;
            members.innerHTML = list.length
                ? list.map(person => `
                    <button type="button" class="act-member${state.memberId === person.id ? ' is-active' : ''}" data-act-member="${esc(person.id)}" role="option" aria-selected="${state.memberId === person.id ? 'true' : 'false'}">
                        ${avatar(person)}
                        <span class="act-member-text"><strong>${esc(person.name)}</strong><span>${esc(person.role)}</span></span>
                    </button>`).join('')
                : '<p class="act-empty">Tidak ada karyawan dengan kata itu.</p>';
        }
        if (stack) {
            const shown = state.team.slice(0, 4);
            const rest = state.team.length - shown.length;
            stack.innerHTML = shown.map(person => avatar(person)).join('')
                + (rest > 0 ? `<span class="act-stack-more">+${rest}</span>` : '');
        }
        const orgBody = document.getElementById('act-org-body');
        const orgBtn = document.getElementById('act-org-toggle');
        const teamBtn = document.getElementById('act-team-toggle');
        if (orgBody) orgBody.hidden = !state.orgOpen;
        if (orgBtn) {
            orgBtn.classList.toggle('is-shut', !state.orgOpen);
            orgBtn.setAttribute('aria-expanded', state.orgOpen ? 'true' : 'false');
        }
        if (teamBtn) {
            teamBtn.classList.toggle('is-shut', !state.teamOpen);
            teamBtn.setAttribute('aria-expanded', state.teamOpen ? 'true' : 'false');
        }
    }

    function renderCard(card) {
        const actor = personById(card.actorId);
        const open = !!state.cardOpen[card.id];
        const icon = card.kind === 'chat' ? 'message-circle' : 'clock';
        const tone = card.kind === 'chat' ? ' is-chat' : '';
        let body = '';
        if (open && card.kind === 'audit') {
            const actions = (card.actions || []).map((action, index) => {
                const key = `${card.id}:${index}`;
                const expanded = !!state.expanded[key];
                const details = expanded && action.details
                    ? `<div class="act-detail">${action.details.map(([label, value]) =>
                        `<div class="act-detail-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`
                    ).join('')}</div>`
                    : '';
                return `<div class="act-action${expanded ? ' is-open' : ''}">
                    <button type="button" class="act-action-head" data-act-toggle="${esc(key)}">
                        <i data-lucide="chevron-right" class="act-chevron"></i>
                        <span class="act-action-time">${esc(action.time)}</span>
                        <i class="act-bullet"></i>
                        <span>${esc(action.label)}</span>
                        <span class="act-ms">${esc(action.ms)}</span>
                    </button>
                    ${details}
                </div>`;
            }).join('');
            body = `<div class="act-card-body">
                <p class="act-kicker">Pemicu</p>
                <div class="act-trigger-line"><i data-lucide="clock"></i><span>Jadwal</span><span class="act-ontime">Tepat waktu</span></div>
                <p class="act-kicker">Ringkasan</p>
                <p class="act-summary">${esc(card.summary)}</p>
                <p class="act-kicker">Tindakan</p>
                ${actions}
            </div>`;
        } else if (open && card.summary) {
            body = `<div class="act-card-body"><p class="act-summary">${esc(card.summary)}</p></div>`;
        }
        return `<article class="act-card" id="act-card-${esc(card.id)}">
            <div class="act-card-head">
                <button type="button" class="act-card-main" data-act-card="${esc(card.id)}">
                    <span class="act-card-icon${tone}"><i data-lucide="${icon}"></i></span>
                    <span class="act-card-title">${esc(card.title)}</span>
                </button>
                <span class="act-card-meta">
                    <span class="act-who">${avatar(actor, 'xs')}<span>${esc(actor.name)}</span></span>
                    <i data-lucide="clock" style="width:13px;height:13px"></i>
                    <span>${esc(card.when)}</span>
                    <button type="button" class="act-card-search" data-act-focus="${esc(card.actorId)}" title="Saring ke ${esc(actor.name)}">
                        <i data-lucide="search"></i>
                    </button>
                </span>
            </div>
            ${body}
        </article>`;
    }

    function renderFeed() {
        const feed = document.getElementById('act-feed');
        const count = document.getElementById('act-recent-count');
        const cards = visibleCards();
        if (count) count.textContent = String(cards.length);
        if (!feed) return;
        feed.innerHTML = cards.length
            ? cards.map(renderCard).join('')
            : '<p class="act-empty">Tidak ada aktivitas untuk filter ini.</p>';
    }

    function renderTimeline() {
        const root = document.getElementById('act-timeline');
        if (!root) return;
        const items = SIDE.filter(item => state.sideScope === 'company' ? item.scope === 'company' : true);
        const hour = items.filter(item => item.bucket === 'hour');
        const earlier = items.filter(item => item.bucket === 'earlier');
        const block = (label, icon, rows) => {
            if (!rows.length) return '';
            return `<p class="act-side-label"><i data-lucide="${icon}"></i>${label}</p>`
                + rows.map(item => {
                    const actor = personById(item.actorId);
                    return `<button type="button" class="act-side-item" data-act-jump="${esc(item.cardId || '')}">
                        ${avatar(actor, 'sm')}
                        <p><b>${esc(actor.name)}</b> ${esc(item.text)}</p>
                        <time>${esc(item.when)}</time>
                    </button>`;
                }).join('');
        };
        root.innerHTML = block('Jam terakhir', 'clock', hour) + block('Sebelumnya', 'history', earlier)
            || '<p class="act-empty">Belum ada linimasa.</p>';
    }

    function render() {
        renderRoster();
        renderFeed();
        renderTimeline();
        if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    }

    function setSpace(space) {
        state.space = space === 'market' ? 'market' : 'workspace';
        const market = document.getElementById('act-market');
        const workspace = document.getElementById('act-workspace');
        if (market) market.classList.toggle('hidden', state.space !== 'market');
        if (workspace) workspace.classList.toggle('hidden', state.space !== 'workspace');
        document.querySelectorAll('[data-act-space]').forEach(btn => {
            const on = btn.getAttribute('data-act-space') === state.space;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    function setScope(scope) {
        state.scope = scope || 'team';
        document.querySelectorAll('[data-act-scope]').forEach(btn => {
            const on = btn.getAttribute('data-act-scope') === state.scope;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderFeed();
        if (window.lucide) lucide.createIcons();
    }

    function setSide(scope) {
        state.sideScope = scope === 'company' ? 'company' : 'team';
        document.querySelectorAll('[data-act-side]').forEach(btn => {
            const on = btn.getAttribute('data-act-side') === state.sideScope;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderTimeline();
        if (window.lucide) lucide.createIcons();
    }

    function setTrigger(trigger) {
        state.trigger = TRIGGER_LABEL[trigger] ? trigger : 'all';
        const label = document.getElementById('act-trigger-label');
        const menu = document.getElementById('act-trigger-menu');
        const btn = document.getElementById('act-trigger-btn');
        if (label) label.textContent = TRIGGER_LABEL[state.trigger];
        if (menu) menu.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        document.querySelectorAll('[data-act-trigger]').forEach(item => {
            item.classList.toggle('is-active', item.getAttribute('data-act-trigger') === state.trigger);
        });
        renderFeed();
        if (window.lucide) lucide.createIcons();
    }

    function selectMember(id) {
        state.memberId = state.memberId === id ? null : id;
        if (state.memberId) state.scope = 'employee';
        document.querySelectorAll('[data-act-scope]').forEach(btn => {
            const on = btn.getAttribute('data-act-scope') === state.scope;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderRoster();
        renderFeed();
        if (window.lucide) lucide.createIcons();
    }

    async function syncLive() {
        if (typeof api === 'undefined' || !api.get) return;
        try {
            const data = await api.get('/api/ai/office');
            const employees = data && Array.isArray(data.employees) ? data.employees : [];
            if (!employees.length) return;
            const anyActive = employees.some(emp => ACTIVE.has(emp.status));
            if (!anyActive) return;
            const byId = new Map(employees.map(emp => [emp.id, emp]));
            state.team.forEach(person => {
                const live = byId.get(person.id);
                if (!live) return;
                person.online = ACTIVE.has(live.status);
            });
            renderRoster();
            renderFeed();
            renderTimeline();
            if (window.lucide) lucide.createIcons();
        } catch (_) { /* tampilan awal tetap utuh */ }
    }

    function fitColumns() {
        const narrow = window.matchMedia('(max-width: 860px)').matches;
        if (narrow && !state.userSized) {
            state.rosterOpen = false;
            state.sideOpen = false;
        }
        const roster = document.getElementById('act-roster');
        const side = document.getElementById('act-side');
        const collapseRoster = document.getElementById('act-collapse-roster');
        const collapseSide = document.getElementById('act-collapse-side');
        if (roster) roster.classList.toggle('is-collapsed', !state.rosterOpen);
        if (side) side.classList.toggle('is-collapsed', !state.sideOpen);
        if (collapseRoster) {
            collapseRoster.setAttribute('aria-expanded', state.rosterOpen ? 'true' : 'false');
            const icon = collapseRoster.querySelector('i');
            if (icon) icon.setAttribute('data-lucide', state.rosterOpen ? 'chevron-left' : 'chevron-right');
        }
        if (collapseSide) {
            collapseSide.setAttribute('aria-expanded', state.sideOpen ? 'true' : 'false');
            const icon = collapseSide.querySelector('i');
            if (icon) icon.setAttribute('data-lucide', state.sideOpen ? 'chevron-right' : 'chevron-left');
        }
    }

    function bind(app) {
        if (state.bound) return;
        state.bound = true;
        state.app = app;
        const root = document.getElementById('view-activity');
        if (!root) return;

        root.addEventListener('click', (event) => {
            const nav = event.target.closest('[data-act-nav]');
            if (nav && state.app && state.app.switchView) {
                const view = nav.getAttribute('data-act-nav');
                if (view && view !== 'activity') state.app.switchView(view);
                return;
            }
            const space = event.target.closest('[data-act-space]');
            if (space) {
                const target = space.getAttribute('data-act-space');
                // Tab Pasar membuka halaman Pasar (marketplace) tersendiri.
                if (target === 'market' && state.app && state.app.switchView) {
                    state.app.switchView('marketplace');
                    return;
                }
                setSpace(target);
                return;
            }
            const scope = event.target.closest('[data-act-scope]');
            if (scope) {
                const next = scope.getAttribute('data-act-scope');
                if (next !== 'employee') state.memberId = null;
                setScope(next);
                renderRoster();
                return;
            }
            const side = event.target.closest('[data-act-side]');
            if (side) {
                setSide(side.getAttribute('data-act-side'));
                return;
            }
            const trigger = event.target.closest('[data-act-trigger]');
            if (trigger) {
                setTrigger(trigger.getAttribute('data-act-trigger'));
                return;
            }
            const member = event.target.closest('[data-act-member]');
            if (member) {
                selectMember(member.getAttribute('data-act-member'));
                return;
            }
            const toggle = event.target.closest('[data-act-toggle]');
            if (toggle) {
                const key = toggle.getAttribute('data-act-toggle');
                state.expanded[key] = !state.expanded[key];
                renderFeed();
                if (window.lucide) lucide.createIcons();
                return;
            }
            const cardBtn = event.target.closest('[data-act-card]');
            if (cardBtn && !event.target.closest('[data-act-focus]')) {
                const id = cardBtn.getAttribute('data-act-card');
                state.cardOpen[id] = !state.cardOpen[id];
                renderFeed();
                if (window.lucide) lucide.createIcons();
                return;
            }
            const focus = event.target.closest('[data-act-focus]');
            if (focus) {
                event.stopPropagation();
                const id = focus.getAttribute('data-act-focus');
                state.memberId = id;
                state.scope = 'employee';
                document.querySelectorAll('[data-act-scope]').forEach(btn => {
                    const on = btn.getAttribute('data-act-scope') === 'employee';
                    btn.classList.toggle('is-active', on);
                });
                renderRoster();
                renderFeed();
                if (window.lucide) lucide.createIcons();
                return;
            }
            const jump = event.target.closest('[data-act-jump]');
            if (jump) {
                const id = jump.getAttribute('data-act-jump');
                if (!id) return;
                state.cardOpen[id] = true;
                renderFeed();
                if (window.lucide) lucide.createIcons();
                const card = document.getElementById(`act-card-${id}`);
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        const search = document.getElementById('act-search');
        if (search) {
            search.addEventListener('input', () => {
                state.query = search.value || '';
                renderRoster();
            });
        }
        const orgBtn = document.getElementById('act-org-toggle');
        if (orgBtn) orgBtn.addEventListener('click', () => {
            state.orgOpen = !state.orgOpen;
            renderRoster();
        });
        const teamBtn = document.getElementById('act-team-toggle');
        if (teamBtn) teamBtn.addEventListener('click', () => {
            state.teamOpen = !state.teamOpen;
            if (!state.teamOpen) state.memberId = null;
            renderRoster();
            renderFeed();
        });
        const triggerBtn = document.getElementById('act-trigger-btn');
        const triggerMenu = document.getElementById('act-trigger-menu');
        if (triggerBtn && triggerMenu) {
            triggerBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const open = triggerMenu.classList.toggle('hidden') === false;
                triggerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }
        const accountBtn = document.getElementById('act-account-btn');
        const accountMenu = document.getElementById('act-account-menu');
        if (accountBtn && accountMenu) {
            accountBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const open = accountMenu.classList.toggle('hidden') === false;
                accountBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }
        root.querySelectorAll('[data-act-account]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.account = btn.getAttribute('data-act-account');
                const label = document.getElementById('act-account-label');
                const av = document.getElementById('act-account-av');
                const text = state.account === 'agency' ? 'Akun Agensi' : 'Akun Personal';
                if (label) label.textContent = text;
                if (av) av.textContent = state.account === 'agency' ? 'A' : 'P';
                if (accountMenu) accountMenu.classList.add('hidden');
                if (accountBtn) accountBtn.setAttribute('aria-expanded', 'false');
            });
        });
        document.addEventListener('click', () => {
            if (triggerMenu) triggerMenu.classList.add('hidden');
            if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
            if (accountMenu) accountMenu.classList.add('hidden');
            if (accountBtn) accountBtn.setAttribute('aria-expanded', 'false');
        });

        const collapseRoster = document.getElementById('act-collapse-roster');
        const collapseSide = document.getElementById('act-collapse-side');
        if (collapseRoster) collapseRoster.addEventListener('click', () => {
            state.userSized = true;
            state.rosterOpen = !state.rosterOpen;
            const roster = document.getElementById('act-roster');
            if (roster) roster.classList.toggle('is-collapsed', !state.rosterOpen);
            collapseRoster.setAttribute('aria-expanded', state.rosterOpen ? 'true' : 'false');
            const icon = collapseRoster.querySelector('i');
            if (icon) icon.setAttribute('data-lucide', state.rosterOpen ? 'chevron-left' : 'chevron-right');
            if (window.lucide) lucide.createIcons();
        });
        if (collapseSide) collapseSide.addEventListener('click', () => {
            state.userSized = true;
            state.sideOpen = !state.sideOpen;
            const side = document.getElementById('act-side');
            if (side) side.classList.toggle('is-collapsed', !state.sideOpen);
            collapseSide.setAttribute('aria-expanded', state.sideOpen ? 'true' : 'false');
            const icon = collapseSide.querySelector('i');
            if (icon) icon.setAttribute('data-lucide', state.sideOpen ? 'chevron-right' : 'chevron-left');
            if (window.lucide) lucide.createIcons();
        });

        const refresh = document.getElementById('act-refresh');
        if (refresh) refresh.addEventListener('click', async () => {
            refresh.classList.add('is-spinning');
            await syncLive();
            render();
            setTimeout(() => refresh.classList.remove('is-spinning'), 700);
        });
        const credits = document.getElementById('act-credits');
        if (credits) credits.addEventListener('click', () => {
            toast('Kredit gratis belum tersedia. Tim memakai kuota agensi.');
        });
        const bell = document.getElementById('act-bell');
        if (bell) bell.addEventListener('click', () => {
            toast('1 pemberitahuan: jadwal Maya terlewat, tidak ada panel yang terbuka.');
            const badge = bell.querySelector('.act-badge');
            if (badge) badge.remove();
        });
        const theme = document.getElementById('act-theme');
        if (theme) theme.addEventListener('click', () => {
            toast('Tampilan gelap tetap aktif di halaman aktivitas.');
        });
        const me = document.getElementById('act-me');
        if (me) me.addEventListener('click', () => {
            if (accountBtn) accountBtn.click();
        });
        const logo = document.getElementById('act-logo');
        if (logo && app && app.switchView) {
            logo.addEventListener('click', () => app.switchView('mission'));
        }
        const fab = document.getElementById('act-fab');
        if (fab && app) {
            fab.addEventListener('click', () => {
                if (app.switchView) app.switchView('mission');
                if (app.setMissionPanelOpen) app.setMissionPanelOpen(true);
                if (app.setMissionTab) app.setMissionTab('chat');
            });
        }
        window.addEventListener('resize', () => {
            if (!document.body.classList.contains('is-activity-mode')) return;
            fitColumns();
            if (window.lucide) lucide.createIcons();
        });
        document.addEventListener('keydown', (event) => {
            if (!document.body.classList.contains('is-activity-mode')) return;
            const key = event.key.toLowerCase();
            if ((event.metaKey || event.ctrlKey) && key === 'k') {
                event.preventDefault();
                const input = document.getElementById('act-search');
                if (input) input.focus();
            }
        });
    }

    function open() {
        setSpace(state.space);
        render();
        fitColumns();
        if (window.lucide) lucide.createIcons();
        syncLive();
    }

    /** Dipakai menu kiri global: saring aktivitas ke satu karyawan. */
    function focusMember(id) {
        if (!state.team.some(person => person.id === id)) return;
        state.memberId = id;
        state.scope = 'employee';
        document.querySelectorAll('[data-act-scope]').forEach(btn => {
            const on = btn.getAttribute('data-act-scope') === 'employee';
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        render();
    }

    window.ActivityPage = { bind, open, focusMember };
})();
