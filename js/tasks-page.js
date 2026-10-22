/**
 * Halaman Tugas — papan kanban "Lacak Pekerjaan di Seluruh Organisasi Anda"
 * (meniru tata letak papan Tasks pada referensi, Bahasa Indonesia).
 *
 * Sumber data NYATA (tanpa endpoint/skema baru):
 * - Job Kantor AI: GET /api/ai/jobs (sama dengan app.loadAiJobsFromServer).
 * - Karyawan & status hadir: GET /api/ai/office (employees) dan
 *   GET /api/ai/office/roles untuk nama/judul/warna avatar peran.
 *
 * Pemetaan status job -> kolom kanban (4 kolom):
 * - Backlog         : queued (Antri), needs_info (Perlu info)
 * - Tugas           : awaiting_approval (menunggu persetujuan manusia)
 * - Sedang Berjalan : publishing (sedang publish), working (bila muncul)
 * - Selesai         : done (Selesai) dan failed (Gagal) — keduanya status
 *                     terminal/akhir; kartu failed dibedakan lencana merah
 *                     "GAGAL" + prioritas TINGGI agar tidak tertukar selesai.
 *
 * Prioritas kartu DITURUNKAN deterministik dari status job (job tidak punya
 * field riskLevel/priority — jangan mengarang acak):
 * - TINGGI : failed, awaiting_approval (butuh perhatian/persetujuan)
 * - SEDANG : publishing, needs_info, queued
 * - RENDAH : done
 *
 * Seret & letakkan (jujur): API yang ada TIDAK punya transisi status bebas
 * antar status job (transisi resmi hanya lewat /answer, /approve, /run,
 * /revision di detail job Kantor AI yang bergate otonomi/approval). Jadi
 * seret antar kolom TIDAK mengubah status job di server — ia hanya mengubah
 * pengelompokan lokal halaman ini, tersimpan di localStorage kunci
 * `piks-tasks-board-v1` ({columns:{jobId:kolomId}}) dan diberi label jelas
 * di UI. Status resmi tetap mengikuti server; klik kartu membuka modal
 * detail job yang sudah ada (app.openJobDetailModal) untuk aksi resmi.
 *
 * "Buat Tugas" / tombol + per kolom membuka formulir Brief Cepat yang sudah
 * ada di Kantor AI (#office) — bukan formulir baru/mati; pengiriman tetap
 * POST /api/ai/jobs lewat app.submitOfficeBrief dengan gate yang sama.
 */
(function () {
    const STORAGE_KEY = 'piks-tasks-board-v1';

    const COLUMNS = [
        { id: 'backlog', title: 'Backlog' },
        { id: 'todo', title: 'Tugas' },
        { id: 'progress', title: 'Sedang Berjalan' },
        { id: 'done', title: 'Selesai' }
    ];

    const STATUS_COLUMN = {
        queued: 'backlog',
        needs_info: 'backlog',
        awaiting_approval: 'todo',
        publishing: 'progress',
        working: 'progress',
        done: 'done',
        failed: 'done'
    };

    const STATUS_LABEL = {
        queued: 'Antri', needs_info: 'Perlu info', awaiting_approval: 'Menunggu persetujuan',
        publishing: 'Sedang menerbitkan', working: 'Sedang bekerja',
        done: 'Selesai', failed: 'Gagal'
    };

    const FALLBACK_ROLES = [
        { id: 'manager', name: 'Maya', title: 'Manager (Orkestrator)', avatarColor: '#e11d48' },
        { id: 'strategist', name: 'Rani', title: 'Strategist', avatarColor: '#0d9488' },
        { id: 'copywriter', name: 'Dimas', title: 'Copywriter', avatarColor: '#2563eb' },
        { id: 'visual-producer', name: 'Salsa', title: 'Visual / Video Producer', avatarColor: '#7c3aed' },
        { id: 'community-manager', name: 'Titin', title: 'Community Manager', avatarColor: '#059669' },
        { id: 'analyst', name: 'Bimo', title: 'Analyst', avatarColor: '#d97706' },
        { id: 'compliance', name: 'Nadira', title: 'Compliance / QA', avatarColor: '#475569' },
        { id: 'sales', name: 'Reno', title: 'Sales Specialist', avatarColor: '#0284c7' },
        { id: 'finance', name: 'Fajar', title: 'Finance Specialist', avatarColor: '#65a30d' },
        { id: 'product', name: 'Prama', title: 'Product Specialist', avatarColor: '#db2777' },
        { id: 'people', name: 'Kirana', title: 'People Specialist', avatarColor: '#9333ea' }
    ];

    const ACTIVE_EMP = new Set(['working', 'publishing', 'queued', 'awaiting_approval', 'needs_info']);

    const state = {
        bound: false,
        app: null,
        jobs: [],
        roles: FALLBACK_ROLES.map(r => ({ ...r })),
        empStatus: {}, // roleId -> status dari /api/ai/office
        mode: 'board', // 'board' | 'list'
        filterStatus: 'all',
        filterPriority: 'all',
        filterAgent: 'all',
        overrides: {}, // jobId -> kolom lokal (localStorage)
        loading: false,
        loaded: false
    };

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function toast(msg, color) { if (state.app && state.app.showToast) state.app.showToast(msg, color || 'indigo'); }

    /* ---------- Persistensi pengelompokan lokal ---------- */
    function loadLocal() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            state.overrides = saved && saved.columns && typeof saved.columns === 'object' ? saved.columns : {};
        } catch (_) { state.overrides = {}; }
    }
    function saveLocal() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns: state.overrides })); } catch (_) {}
    }

    /* ---------- Model turunan ---------- */
    function roleOf(job) {
        const rid = job.roleId || job.employeeRole || '';
        return state.roles.find(r => r.id === rid)
            || state.roles.find(r => r.name === job.employeeName)
            || { id: rid || 'ai', name: job.employeeName || 'AI', title: job.employeeRole || 'Karyawan AI', avatarColor: '#475569' };
    }
    function mappedColumn(job) { return STATUS_COLUMN[job.status] || 'backlog'; }
    function columnOf(job) {
        const local = state.overrides[job.id];
        return COLUMNS.some(c => c.id === local) ? local : mappedColumn(job);
    }
    function priorityOf(job) {
        if (job.status === 'failed' || job.status === 'awaiting_approval') return { id: 'high', label: 'TINGGI' };
        if (job.status === 'done') return { id: 'low', label: 'RENDAH' };
        return { id: 'medium', label: 'SEDANG' };
    }
    /** Waktu relatif Bahasa Indonesia penuh ("2 hari lalu"); sejalan pola app._relativeTimeId. */
    function relativeId(value) {
        if (!value) return '';
        const t = new Date(value).getTime();
        if (Number.isNaN(t)) return '';
        const diff = Date.now() - t;
        if (diff < 60 * 1000) return 'baru saja';
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} menit lalu`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} jam lalu`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} hari lalu`;
        return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function filteredJobs() {
        return state.jobs.filter(job => {
            if (state.filterAgent !== 'all' && roleOf(job).id !== state.filterAgent) return false;
            if (state.filterStatus !== 'all' && job.status !== state.filterStatus) return false;
            if (state.filterPriority !== 'all' && priorityOf(job).id !== state.filterPriority) return false;
            return true;
        });
    }
    function jobTitle(job) {
        const first = String(job.brief || '(tanpa brief)').split('\n').map(s => s.trim()).find(Boolean) || '(tanpa brief)';
        return first.length > 90 ? first.slice(0, 87) + '…' : first;
    }

    /* ---------- Render ---------- */
    function avatarHtml(role, cls) {
        const online = ACTIVE_EMP.has(state.empStatus[role.id] || '');
        return `<span class="tasks-av ${cls || ''}" style="background:${esc(role.avatarColor || '#475569')}" title="${esc(role.name)} — ${esc(role.title || '')}">${esc((role.name || '?').charAt(0))}<i class="tasks-dot${online ? ' is-on' : ''}"></i></span>`;
    }

    function renderSummary() {
        const ring = el('tasks-ring-fg');
        const pctEl = el('tasks-pct');
        const text = el('tasks-summary-text');
        const meta = el('tasks-summary-meta');
        const total = state.jobs.length;
        const done = state.jobs.filter(j => j.status === 'done').length;
        const failed = state.jobs.filter(j => j.status === 'failed').length;
        const running = state.jobs.filter(j => j.status === 'publishing' || j.status === 'working').length;
        const approval = state.jobs.filter(j => j.status === 'awaiting_approval').length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (ring) {
            const C = 2 * Math.PI * 26;
            ring.style.strokeDasharray = String(C);
            ring.style.strokeDashoffset = String(C - (C * pct) / 100);
        }
        if (text) {
            text.textContent = total
                ? `Putaran kerja saat ini memuat ${total} job tim AI: ${running} sedang berjalan, ${approval} menunggu persetujuan, ${done} selesai${failed ? `, ${failed} gagal` : ''}. Klik kartu untuk detail & persetujuan resmi di Kantor AI.`
                : 'Belum ada job pada putaran kerja ini. Buat tugas pertama lewat tombol Buat Tugas — brief masuk ke Kantor AI dan mengikuti gate persetujuan yang berlaku.';
        }
        if (meta) meta.textContent = total ? `${done} dari ${total} job selesai` : '0 job';
    }

    function renderAgents() {
        const box = el('tasks-agents');
        if (!box) return;
        const jobs = state.jobs;
        const chip = (id, label, role) => {
            const count = id === 'all' ? jobs.length : jobs.filter(j => roleOf(j).id === id).length;
            const on = state.filterAgent === id;
            return `<button type="button" class="tasks-agent-chip${on ? ' is-active' : ''}" data-tasks-agent="${esc(id)}" aria-pressed="${on}">
                ${role ? avatarHtml(role) : '<span class="tasks-av" style="background:#334155">Σ</span>'}
                <span class="tasks-agent-text"><strong>${esc(label)}</strong><span>${count} tugas</span></span>
            </button>`;
        };
        box.innerHTML = chip('all', 'Semua Agen', null) + state.roles.map(r => chip(r.id, r.name, r)).join('');
    }

    function cardHtml(job) {
        const role = roleOf(job);
        const prio = priorityOf(job);
        const when = relativeId(job.updatedAt || job.createdAt);
        const local = state.overrides[job.id] && state.overrides[job.id] !== mappedColumn(job);
        return `<article class="tasks-card${job.status === 'failed' ? ' is-failed' : ''}" draggable="true" data-tasks-card="${esc(job.id)}" tabindex="0" role="button" title="Klik untuk detail job di Kantor AI">
            <h4>${esc(jobTitle(job))}</h4>
            <div class="tasks-card-badges">
                <span class="tasks-prio is-${prio.id}">${prio.label}</span>
                <span class="tasks-status is-${esc(job.status)}">${esc(STATUS_LABEL[job.status] || job.status)}</span>
                ${local ? '<span class="tasks-local-badge" title="Pengelompokan lokal halaman ini, bukan status server">lokal</span>' : ''}
            </div>
            ${job.lastError && job.status === 'failed' ? `<p class="tasks-card-err">${esc(String(job.lastError).slice(0, 80))}</p>` : ''}
            <div class="tasks-card-foot">
                <span class="tasks-when">${when ? esc(when) : ''}</span>
                ${avatarHtml(role)}
            </div>
        </article>`;
    }

    function renderBoard() {
        const board = el('tasks-board');
        const list = el('tasks-list');
        if (!board || !list) return;
        const jobs = filteredJobs();
        const isBoard = state.mode === 'board';
        board.hidden = !isBoard;
        list.hidden = isBoard;

        if (state.loading && !state.loaded) {
            board.innerHTML = '<p class="tasks-empty-board">Memuat tugas dari server…</p>';
            list.innerHTML = '';
            return;
        }
        board.innerHTML = COLUMNS.map(col => {
            const items = jobs.filter(j => columnOf(j) === col.id);
            return `<section class="tasks-col" data-tasks-col="${col.id}" aria-label="${esc(col.title)}">
                <header class="tasks-col-head"><h3>${esc(col.title)}</h3><em>${items.length}</em>
                    <button type="button" class="tasks-plus" data-tasks-add="${col.id}" title="Buat tugas baru (formulir brief Kantor AI)" aria-label="Buat tugas di kolom ${esc(col.title)}"><i data-lucide="plus"></i></button>
                </header>
                <div class="tasks-col-body" data-tasks-drop="${col.id}">
                    ${items.length ? items.map(cardHtml).join('') : '<p class="tasks-drop-hint">Seret tugas ke sini</p>'}
                </div>
            </section>`;
        }).join('');

        if (!isBoard) {
            list.innerHTML = jobs.length ? `<div class="tasks-list-head"><span>Tugas</span><span>Prioritas</span><span>Status</span><span>Diperbarui</span><span>Penanggung jawab</span></div>` +
                jobs.map(job => {
                    const role = roleOf(job); const prio = priorityOf(job);
                    return `<button type="button" class="tasks-row" data-tasks-card="${esc(job.id)}">
                        <span class="tasks-row-title">${esc(jobTitle(job))}</span>
                        <span><span class="tasks-prio is-${prio.id}">${prio.label}</span></span>
                        <span>${esc(STATUS_LABEL[job.status] || job.status)}</span>
                        <span>${esc(relativeId(job.updatedAt || job.createdAt) || '-')}</span>
                        <span class="tasks-row-who">${avatarHtml(role)} ${esc(role.name)}</span>
                    </button>`;
                }).join('')
                : '<p class="tasks-empty-board">Tidak ada tugas yang cocok dengan saringan saat ini.</p>';
        }
        bindCards();
        icons();
    }

    function render() {
        renderSummary();
        renderAgents();
        renderBoard();
        const agentSel = el('tasks-filter-agent');
        if (agentSel && agentSel.options.length <= 1) {
            agentSel.innerHTML = '<option value="all">Semua penanggung jawab</option>' +
                state.roles.map(r => `<option value="${esc(r.id)}">${esc(r.name)} — ${esc(r.title || '')}</option>`).join('');
            agentSel.value = state.filterAgent;
        }
        icons();
    }

    /* ---------- Seret & letakkan (pengelompokan lokal saja) ---------- */
    function bindCards() {
        const root = el('view-tasks');
        if (!root) return;
        root.querySelectorAll('[data-tasks-card]').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                if (e.dataTransfer) { e.dataTransfer.setData('text/plain', card.getAttribute('data-tasks-card')); e.dataTransfer.effectAllowed = 'move'; }
                card.classList.add('is-dragging');
            });
            card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
        });
        root.querySelectorAll('[data-tasks-drop]').forEach(zone => {
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('is-over');
                const jobId = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
                const job = state.jobs.find(j => j.id === jobId);
                if (!job) return;
                const target = zone.getAttribute('data-tasks-drop');
                if (columnOf(job) === target) return;
                // Jujur: hanya pengelompokan lokal; status server tidak berubah.
                if (target === mappedColumn(job)) delete state.overrides[jobId];
                else state.overrides[jobId] = target;
                saveLocal();
                renderBoard();
                toast('Pengelompokan lokal diubah (tersimpan di perangkat ini). Status resmi job di server tidak berubah — ubah lewat detail job di Kantor AI.', 'indigo');
            });
        });
    }

    /* ---------- Aksi ---------- */
    function openJob(jobId) {
        const job = state.jobs.find(j => j.id === jobId);
        if (!job) return;
        // Pakai modal detail job yang sudah ada (answer/approve/run bergate di sana).
        if (typeof appState !== 'undefined') {
            appState.aiJobs = state.jobs;
            appState.office.selectedJobId = jobId;
            const emp = (appState.office.employees || []);
            if (!emp.length) appState.office.employees = state.roles.map(r => ({ ...r, status: state.empStatus[r.id] || 'idle' }));
        }
        if (state.app && typeof state.app.openJobDetailModal === 'function') state.app.openJobDetailModal(jobId);
        else if (state.app && state.app.switchView) state.app.switchView('office');
    }

    function createTask(columnId) {
        const col = COLUMNS.find(c => c.id === columnId);
        const agent = state.filterAgent !== 'all' ? state.filterAgent : '';
        if (state.app && state.app.switchView) state.app.switchView('office');
        toast(col
            ? `Buat tugas lewat Brief Cepat Kantor AI. Job baru masuk antrean server (biasanya Backlog) dan mengikuti gate persetujuan — kolom tujuan “${col.title}” tidak memaksa status.`
            : 'Buat tugas lewat Brief Cepat Kantor AI — job baru mengikuti gate persetujuan yang berlaku.', 'indigo');
        // Formulir brief dirender async oleh renderOffice; tunggu select siap.
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            const select = el('office-role-select');
            const text = el('office-brief-text');
            if (select && select.options.length > 1) {
                if (agent) select.value = agent;
                if (text) text.focus();
                clearInterval(timer);
            } else if (tries > 25) clearInterval(timer);
        }, 200);
    }

    /* ---------- Muat data server ---------- */
    async function syncFromApi() {
        if (typeof api === 'undefined' || !api.get) { render(); return; }
        state.loading = true;
        if (!state.loaded) renderBoard();
        try {
            const [jobsData, officeData, rolesData] = await Promise.all([
                api.get('/api/ai/jobs').catch(() => null),
                api.get('/api/ai/office').catch(() => null),
                api.get('/api/ai/office/roles').catch(() => null)
            ]);
            if (jobsData && jobsData.success && Array.isArray(jobsData.jobs)) {
                state.jobs = jobsData.jobs;
                if (typeof appState !== 'undefined') appState.aiJobs = state.jobs;
            } else if (typeof appState !== 'undefined' && Array.isArray(appState.aiJobs)) {
                state.jobs = appState.aiJobs;
            }
            if (rolesData && Array.isArray(rolesData.roles) && rolesData.roles.length) {
                state.roles = rolesData.roles.map(r => ({ id: r.id, name: r.name, title: r.title, avatarColor: r.avatarColor }));
                const sel = el('tasks-filter-agent');
                if (sel) sel.innerHTML = '';
            }
            if (officeData && Array.isArray(officeData.employees)) {
                state.empStatus = {};
                officeData.employees.forEach(e => { if (e && e.id) state.empStatus[e.id] = e.status || 'idle'; });
                if (typeof appState !== 'undefined') appState.office.employees = officeData.employees;
            }
            // Buang override lokal untuk job yang sudah tidak ada.
            const ids = new Set(state.jobs.map(j => j.id));
            Object.keys(state.overrides).forEach(id => { if (!ids.has(id)) delete state.overrides[id]; });
            saveLocal();
            state.loaded = true;
        } catch (_) { /* data terakhir tetap tampil */ }
        state.loading = false;
        render();
    }

    /* ---------- Binding ---------- */
    function bind(app) {
        if (state.bound) return;
        state.bound = true;
        state.app = app;
        loadLocal();
        const root = el('view-tasks');
        if (!root) return;

        root.addEventListener('click', (event) => {
            const nav = event.target.closest('[data-tasks-nav]');
            if (nav) { if (state.app && state.app.switchView) state.app.switchView(nav.getAttribute('data-tasks-nav')); return; }
            const modeBtn = event.target.closest('[data-tasks-mode]');
            if (modeBtn) {
                state.mode = modeBtn.getAttribute('data-tasks-mode');
                root.querySelectorAll('[data-tasks-mode]').forEach(b => {
                    const on = b === modeBtn;
                    b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on));
                });
                renderBoard(); return;
            }
            if (event.target.closest('[data-tasks-create]')) { createTask(null); return; }
            const add = event.target.closest('[data-tasks-add]');
            if (add) { createTask(add.getAttribute('data-tasks-add')); return; }
            if (event.target.closest('[data-tasks-refresh]')) { syncFromApi(); return; }
            const filterBtn = event.target.closest('[data-tasks-filter-toggle]');
            if (filterBtn) {
                const menu = el('tasks-filter-menu');
                if (menu) { const open = menu.classList.toggle('hidden') === false; filterBtn.setAttribute('aria-expanded', String(open)); }
                return;
            }
            if (event.target.closest('[data-tasks-clear-filter]')) {
                state.filterStatus = 'all'; state.filterPriority = 'all'; state.filterAgent = 'all';
                const s = el('tasks-filter-status'); const p = el('tasks-filter-priority'); const a = el('tasks-filter-agent');
                if (s) s.value = 'all'; if (p) p.value = 'all'; if (a) a.value = 'all';
                render(); return;
            }
            const agentChip = event.target.closest('[data-tasks-agent]');
            if (agentChip) {
                state.filterAgent = agentChip.getAttribute('data-tasks-agent') || 'all';
                const a = el('tasks-filter-agent'); if (a) a.value = state.filterAgent;
                renderAgents(); renderBoard(); return;
            }
            const card = event.target.closest('[data-tasks-card]');
            if (card && !event.target.closest('[data-tasks-add]')) { openJob(card.getAttribute('data-tasks-card')); return; }
        });
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target.closest && event.target.closest('[data-tasks-card]');
            if (card && card.tagName !== 'BUTTON') { event.preventDefault(); openJob(card.getAttribute('data-tasks-card')); }
        });
        const onFilter = () => {
            const s = el('tasks-filter-status'); const p = el('tasks-filter-priority'); const a = el('tasks-filter-agent');
            state.filterStatus = s ? s.value : 'all';
            state.filterPriority = p ? p.value : 'all';
            state.filterAgent = a ? a.value : 'all';
            renderAgents(); renderBoard();
        };
        ['tasks-filter-status', 'tasks-filter-priority', 'tasks-filter-agent'].forEach(id => {
            const node = el(id);
            if (node) node.addEventListener('change', onFilter);
        });
        // Pemicu dari Work Board Mission Control (tombol di header workboard).
        document.addEventListener('click', (event) => {
            if (event.target.closest('[data-tasks-open-page]') && state.app && state.app.switchView) state.app.switchView('tasks');
        });
        render();
    }

    function open() {
        loadLocal();
        render();
        syncFromApi();
    }

    window.TasksPage = { bind, open };
})();
