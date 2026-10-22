/**
 * Halaman Kalender Mingguan — "Lihat Pekerjaan Terencana di Seluruh Perusahaan
 * Anda" (meniru kalender mingguan referensi, Bahasa Indonesia).
 *
 * Sumber data NYATA (tanpa endpoint/skema baru):
 * - Postingan terjadwal: appState.posts (status 'scheduled', waktu publishDate).
 * - Job Kantor AI: GET /api/ai/jobs (sama dengan app.loadAiJobsFromServer) +
 *   GET /api/ai/office & /api/ai/office/roles untuk peran/warna.
 *
 * Jadwal job (jujur): API job TIDAK punya kolom jadwal. Tugas yang dibuat dari
 * halaman ini menulis baris "Mulai: <ISO>" & "Selesai: <ISO>" di dalam brief
 * (jalur resmi POST /api/ai/jobs, sama seperti Brief Cepat Kantor AI) dan
 * kalender membaca baris itu (atau structuredBrief.date bila ada). Job lama
 * tanpa baris jadwal tampil di baris "Sepanjang Hari" pada tanggal dibuatnya
 * dengan penanda "(tanpa jadwal — hari dibuat)", bukan dikarang jamnya.
 *
 * Membuat tugas TIDAK memaksa publish: POST /api/ai/jobs hanya membuat job
 * queued/needs_info; gerbang otonomi/approval/emergencyPause di server tetap
 * berlaku saat job dijalankan. Status hasil respons ditampilkan apa adanya.
 */
(function () {
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
    const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const STATUS_LABEL = {
        queued: 'Antri', needs_info: 'Perlu info', awaiting_approval: 'Menunggu persetujuan',
        publishing: 'Sedang menerbitkan', working: 'Sedang bekerja', done: 'Selesai', failed: 'Gagal',
        scheduled: 'Terjadwal', posted: 'Terbit'
    };

    const state = {
        bound: false, app: null, loading: false, loaded: false, scrolled: false,
        weekAnchor: startOfWeek(new Date()),
        filterKind: 'all', filterAgent: 'all',
        jobs: [], posts: [], roles: FALLBACK_ROLES.map(r => ({ ...r })),
        emergencyPause: false
    };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function el(id) { return document.getElementById(id); }
    function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    function toast(msg, color) { if (state.app && state.app.showToast) state.app.showToast(msg, color || 'indigo'); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function startOfWeek(d) {
        const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Senin
        return x;
    }
    function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function timeId(d) { return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, ':'); }
    function roleOf(job) {
        const rid = job.roleId || job.employeeRole || '';
        return state.roles.find(r => r.id === rid) || state.roles.find(r => r.name === job.employeeName)
            || { id: rid || 'ai', name: job.employeeName || 'AI', title: job.employeeRole || 'Karyawan AI', avatarColor: '#475569' };
    }
    function jobTitle(job) {
        const first = String(job.brief || '(tanpa brief)').split('\n').map(s => s.trim()).find(s => s && !/^(Mulai|Selesai|Proyek|Prioritas|Status awal|Sprint):/i.test(s)) || '(tanpa brief)';
        return first.length > 80 ? first.slice(0, 77) + '…' : first;
    }
    /** Waktu mulai job: structuredBrief.date → baris "Mulai:" di brief → null. */
    function jobStart(job) {
        const cand = (job.structuredBrief && job.structuredBrief.date) || '';
        let d = cand ? new Date(cand) : null;
        if (d && !Number.isNaN(d.getTime())) return { date: d, scheduled: true };
        const m = String(job.brief || '').match(/Mulai:\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}[^\s]*)/);
        if (m) { d = new Date(m[1]); if (!Number.isNaN(d.getTime())) return { date: d, scheduled: true }; }
        d = new Date(job.createdAt || job.updatedAt || '');
        return Number.isNaN(d.getTime()) ? null : { date: d, scheduled: false };
    }
    function events() {
        const out = [];
        (state.posts || []).filter(p => p && p.status === 'scheduled' && p.publishDate).forEach(p => {
            const d = new Date(p.publishDate);
            if (Number.isNaN(d.getTime())) return;
            const cap = String(p.caption || 'Postingan terjadwal').trim().split('\n')[0] || 'Postingan terjadwal';
            out.push({ kind: 'post', id: p.id, date: d, allDay: false, title: cap, status: p.status, color: '#8b5cf6', who: 'Postingan' });
        });
        (state.jobs || []).forEach(j => {
            const s = jobStart(j); if (!s) return;
            const role = roleOf(j);
            out.push({ kind: 'job', id: j.id, date: s.date, allDay: !s.scheduled, scheduled: s.scheduled, title: jobTitle(j), status: j.status, color: role.avatarColor || '#475569', who: role.name, roleId: role.id });
        });
        return out;
    }
    function filteredEvents() {
        return events().filter(ev => {
            if (state.filterKind !== 'all' && ev.kind !== state.filterKind) return false;
            if (state.filterAgent !== 'all' && ev.roleId !== state.filterAgent) return false;
            return true;
        });
    }

    /* ---------- Render ---------- */
    function renderRange() {
        const a = state.weekAnchor, b = addDays(a, 6);
        const sameMonth = a.getMonth() === b.getMonth();
        const fmt = (d, withMonth) => d.toLocaleDateString('id-ID', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
        const label = el('cal-range');
        if (label) label.textContent = `${fmt(a, !sameMonth)} – ${fmt(b, true)} ${b.getFullYear()}`;
    }
    function renderAgents() {
        const box = el('cal-agents'); if (!box) return;
        const evs = events();
        const item = (id, label, sub, color, initial) => {
            const count = id === 'all' ? evs.length : evs.filter(e => e.roleId === id).length;
            const on = state.filterAgent === id;
            return `<button type="button" class="cal-agent${on ? ' is-active' : ''}" data-cal-agent="${esc(id)}" aria-pressed="${on}">
                <span class="cal-av" style="background:${esc(color)}">${esc(initial)}</span>
                <span class="cal-agent-text"><strong>${esc(label)}</strong><span>${esc(sub)} · ${count}</span></span></button>`;
        };
        box.innerHTML = item('all', 'Semua Agen', 'Postingan & tugas', '#334155', 'Σ')
            + state.roles.map(r => item(r.id, r.name, r.title || '', r.avatarColor || '#475569', (r.name || '?').charAt(0))).join('');
    }
    function renderGrid() {
        const grid = el('cal-grid'); if (!grid) return;
        renderRange(); renderAgents();
        if (state.loading && !state.loaded) { grid.innerHTML = '<p class="cal-empty">Memuat jadwal dari server…</p>'; return; }
        const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekAnchor, i));
        const todayKey = dateKey(new Date());
        const evs = filteredEvents();
        const byDayHour = {}, byDayAll = {};
        evs.forEach(ev => {
            const k = dateKey(ev.date);
            if (ev.allDay) (byDayAll[k] = byDayAll[k] || []).push(ev);
            else { const kk = `${k}|${ev.date.getHours()}`; (byDayHour[kk] = byDayHour[kk] || []).push(ev); }
        });
        const evHtml = (ev) => `<button type="button" class="cal-event is-${ev.kind}" style="--cal-ev:${esc(ev.color)}" data-cal-event="${esc(ev.kind)}:${esc(ev.id)}" title="${esc(ev.title)} — ${esc(ev.who)} · ${esc(STATUS_LABEL[ev.status] || ev.status)}${ev.allDay ? ' (tanpa jadwal — hari dibuat)' : ''}">
            <span class="cal-event-time">${ev.allDay ? 'Sepanjang hari' : esc(timeId(ev.date))}</span> ${esc(ev.title)}</button>`;
        let html = '<div class="cal-row cal-head-row"><span class="cal-gutter"></span>' + days.map(d =>
            `<span class="cal-day-head${dateKey(d) === todayKey ? ' is-today' : ''}"><strong>${d.getDate()}</strong> ${DAY_NAMES[(d.getDay() + 6) % 7]}</span>`).join('') + '</div>';
        html += '<div class="cal-row cal-allday-row"><span class="cal-gutter">Sepanjang Hari</span>' + days.map(d => {
            const list = byDayAll[dateKey(d)] || [];
            return `<span class="cal-cell cal-allday-cell" data-cal-slot="${dateKey(d)}|allday">${list.map(evHtml).join('')}</span>`;
        }).join('') + '</div>';
        for (let h = 0; h < 24; h++) {
            html += `<div class="cal-row"><span class="cal-gutter">${pad(h)}.00</span>` + days.map(d => {
                const list = byDayHour[`${dateKey(d)}|${h}`] || [];
                return `<span class="cal-cell${dateKey(d) === todayKey ? ' is-today-col' : ''}" data-cal-slot="${dateKey(d)}|${h}">${list.map(evHtml).join('')}</span>`;
            }).join('') + '</div>';
        }
        grid.innerHTML = html;
        if (!state.scrolled) {
            state.scrolled = true;
            const scroller = el('cal-scroller'); if (scroller) scroller.scrollTop = 7 * 49;
        }
        icons();
    }
    function render() { renderGrid(); }

    /* ---------- Panel Buat Tugas ---------- */
    function fillAssignees() {
        const sel = el('cal-f-assignee'); if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = state.roles.map(r => `<option value="${esc(r.id)}">${esc(r.name)} — ${esc(r.title || '')}</option>`).join('');
        if (cur && state.roles.some(r => r.id === cur)) sel.value = cur;
        else if (state.filterAgent !== 'all') sel.value = state.filterAgent;
    }
    function setLocalInput(input, d) {
        if (!input || !d) return;
        input.value = `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function openPanel(slotDate) {
        const panel = el('cal-panel'); if (!panel) return;
        panel.hidden = false;
        fillAssignees();
        const start = slotDate ? new Date(slotDate) : (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
        setLocalInput(el('cal-f-start'), start);
        setLocalInput(el('cal-f-end'), new Date(start.getTime() + 60 * 60000));
        const msg = el('cal-form-msg'); if (msg) { msg.hidden = true; msg.textContent = ''; }
        const pause = el('cal-pause-note'); if (pause) pause.hidden = !state.emergencyPause;
        const title = el('cal-f-title'); if (title) title.focus();
        icons();
    }
    function closePanel() { const p = el('cal-panel'); if (p) p.hidden = true; }
    function formMsg(text, ok) {
        const msg = el('cal-form-msg'); if (!msg) return;
        msg.hidden = false; msg.textContent = text;
        msg.className = `cal-form-msg ${ok ? 'is-ok' : 'is-warn'}`;
    }

    async function submitTask(event) {
        event.preventDefault();
        const roleId = el('cal-f-assignee')?.value || '';
        const title = (el('cal-f-title')?.value || '').trim();
        const desc = (el('cal-f-desc')?.value || '').trim();
        if (!roleId) { formMsg('Pilih penanggung jawab dulu.', false); return; }
        if (!title) { formMsg('Judul wajib diisi.', false); return; }
        const startVal = el('cal-f-start')?.value || '';
        const endVal = el('cal-f-end')?.value || '';
        const start = startVal ? new Date(startVal) : null;
        const end = endVal ? new Date(endVal) : null;
        const role = state.roles.find(r => r.id === roleId);
        const lines = [title, desc,
            start && !Number.isNaN(start.getTime()) ? `Mulai: ${start.toISOString()}` : '',
            end && !Number.isNaN(end.getTime()) ? `Selesai: ${end.toISOString()}` : '',
            `Proyek: ${(el('cal-f-project')?.value || '').trim() || '-'}`,
            `Prioritas: ${el('cal-f-priority')?.value || 'Sedang'}`,
            `Status awal diminta: ${el('cal-f-status')?.value || 'Tugas'}`,
            `Sprint/putaran: ${(el('cal-f-sprint')?.value || '').trim() || '-'}`,
            'Selesaikan tugas ini sesuai judul dan deskripsi di atas, lalu laporkan hasilnya.'].filter(Boolean);
        const btn = el('cal-submit'); if (btn) btn.disabled = true;
        try {
            const data = await api.post('/api/ai/jobs', { brief: lines.join('\n'), roleId, employeeName: role?.name || undefined });
            if (!data || !data.success || !data.job) { formMsg((data && data.message) || 'Gagal membuat tugas.', false); return; }
            const st = STATUS_LABEL[data.job.status] || data.job.status;
            formMsg(data.job.status === 'needs_info'
                ? `Tugas dibuat untuk ${role?.name || 'agen'} tetapi berstatus “${st}” — brief dinilai tipis oleh server. Lengkapi lewat detail job di Kantor AI; tugas belum berjalan.`
                : `Tugas dibuat untuk ${role?.name || 'agen'} dengan status “${st}” (antrean server). Ia tampil di kalender pada jam Mulai; publish tetap melewati gerbang persetujuan yang berlaku.`, true);
            toast(`Tugas dibuat: ${st}${role ? ` — ${role.name}` : ''}`, data.job.status === 'needs_info' ? 'yellow' : 'emerald');
            if (start && !Number.isNaN(start.getTime())) state.weekAnchor = startOfWeek(start);
            await syncFromApi();
            setTimeout(closePanel, 900);
        } catch (e) { formMsg(e.message || 'Gagal membuat tugas.', false); }
        finally { if (btn) btn.disabled = false; }
    }

    function askMaya() {
        const title = (el('cal-f-title')?.value || '').trim() || '(judul belum diisi)';
        const role = state.roles.find(r => r.id === (el('cal-f-assignee')?.value || ''));
        const startVal = el('cal-f-start')?.value || '';
        if (state.app && state.app.switchView) state.app.switchView('mission');
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            const input = el('ceo-chat-input'); const roleSel = el('ceo-chat-role');
            if (input) {
                if (roleSel) roleSel.value = 'manager';
                input.value = `Maya, tentang tugas “${title}”${role ? ` untuk ${role.name}` : ''}${startVal ? ` (mulai ${startVal.replace('T', ' ')})` : ''}: `;
                input.focus(); clearInterval(timer);
            } else if (tries > 25) { clearInterval(timer); toast('Kotak Chat CEO tidak ditemukan di Mission Control.', 'red'); }
        }, 200);
    }

    /* ---------- Data ---------- */
    async function syncFromApi() {
        state.loading = true; if (!state.loaded) renderGrid();
        try {
            if (typeof api !== 'undefined' && api.get) {
                const [jobsData, officeData, rolesData] = await Promise.all([
                    api.get('/api/ai/jobs').catch(() => null),
                    api.get('/api/ai/office').catch(() => null),
                    api.get('/api/ai/office/roles').catch(() => null)
                ]);
                if (jobsData && jobsData.success && Array.isArray(jobsData.jobs)) {
                    state.jobs = jobsData.jobs;
                    if (typeof appState !== 'undefined') appState.aiJobs = state.jobs;
                } else if (typeof appState !== 'undefined' && Array.isArray(appState.aiJobs)) state.jobs = appState.aiJobs;
                if (rolesData && Array.isArray(rolesData.roles) && rolesData.roles.length)
                    state.roles = rolesData.roles.map(r => ({ id: r.id, name: r.name, title: r.title, avatarColor: r.avatarColor }));
                if (officeData) state.emergencyPause = !!officeData.emergencyPause;
            }
            if (state.app && state.app.loadPostsFromServer) await state.app.loadPostsFromServer();
            if (typeof appState !== 'undefined') state.posts = appState.posts || [];
            state.loaded = true;
        } catch (_) { /* data terakhir tetap tampil */ }
        state.loading = false; render();
    }

    function openEvent(kind, id) {
        if (kind === 'post') {
            if (state.app && typeof state.app.openPostDetailsModal === 'function') state.app.openPostDetailsModal(id);
            else if (state.app && state.app.switchView) state.app.switchView('queue');
            return;
        }
        if (typeof appState !== 'undefined') {
            appState.aiJobs = state.jobs;
            appState.office.selectedJobId = id;
        }
        if (state.app && typeof state.app.openJobDetailModal === 'function') state.app.openJobDetailModal(id);
        else if (state.app && state.app.switchView) state.app.switchView('office');
    }

    function bind(app) {
        if (state.bound) return;
        state.bound = true; state.app = app;
        const root = el('view-calendar'); if (!root) return;
        root.addEventListener('click', (event) => {
            const nav = event.target.closest('[data-cal-nav]');
            if (nav) { if (state.app && state.app.switchView) state.app.switchView(nav.getAttribute('data-cal-nav')); return; }
            const agent = event.target.closest('[data-cal-agent]');
            if (agent) {
                state.filterAgent = agent.getAttribute('data-cal-agent') || 'all';
                const sel = el('cal-filter-agent'); if (sel) sel.value = state.filterAgent;
                renderAgents(); renderGrid(); return;
            }
            const ev = event.target.closest('[data-cal-event]');
            if (ev) { const [kind, id] = String(ev.getAttribute('data-cal-event')).split(/:(.+)/).filter(Boolean); openEvent(kind, id); return; }
            const slot = event.target.closest('[data-cal-slot]');
            if (slot) {
                const [k, h] = String(slot.getAttribute('data-cal-slot')).split('|');
                const d = new Date(`${k}T00:00:00`); if (h !== 'allday') d.setHours(parseInt(h, 10) || 0, 0, 0, 0);
                openPanel(d); return;
            }
            if (event.target.closest('[data-cal-prev]')) { state.weekAnchor = addDays(state.weekAnchor, -7); renderGrid(); return; }
            if (event.target.closest('[data-cal-next]')) { state.weekAnchor = addDays(state.weekAnchor, 7); renderGrid(); return; }
            if (event.target.closest('[data-cal-today]')) { state.weekAnchor = startOfWeek(new Date()); renderGrid(); return; }
            if (event.target.closest('[data-cal-create]')) { openPanel(null); return; }
            if (event.target.closest('[data-cal-refresh]')) { syncFromApi(); return; }
            if (event.target.closest('[data-cal-close]')) { closePanel(); return; }
            if (event.target.closest('[data-cal-ask]')) { askMaya(); return; }
            const ft = event.target.closest('[data-cal-filter-toggle]');
            if (ft) { const m = el('cal-filter-menu'); if (m) { const open = m.classList.toggle('hidden') === false; ft.setAttribute('aria-expanded', String(open)); } return; }
            if (event.target.closest('[data-cal-clear-filter]')) {
                state.filterKind = 'all'; state.filterAgent = 'all';
                const k = el('cal-filter-kind'); const a = el('cal-filter-agent');
                if (k) k.value = 'all'; if (a) a.value = 'all';
                render(); return;
            }
        });
        const onFilter = () => {
            state.filterKind = el('cal-filter-kind')?.value || 'all';
            state.filterAgent = el('cal-filter-agent')?.value || 'all';
            renderAgents(); renderGrid();
        };
        ['cal-filter-kind', 'cal-filter-agent'].forEach(id => { const n = el(id); if (n) n.addEventListener('change', onFilter); });
        const form = el('cal-form'); if (form) form.addEventListener('submit', submitTask);
        const prioSel = el('cal-filter-agent');
        if (prioSel && prioSel.options.length <= 1) { /* diisi saat render pertama di open() */ }
        render();
    }

    function open() {
        state.weekAnchor = state.weekAnchor || startOfWeek(new Date());
        const agentSel = el('cal-filter-agent');
        if (agentSel) agentSel.innerHTML = '<option value="all">Semua agen</option>' + state.roles.map(r => `<option value="${esc(r.id)}">${esc(r.name)} — ${esc(r.title || '')}</option>`).join('');
        render(); syncFromApi();
    }

    window.CalendarPage = { bind, open, _state: state };
})();
