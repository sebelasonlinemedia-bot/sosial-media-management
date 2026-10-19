/**
 * PiK's Digital Lab - Logika Frontend (Bahasa Indonesia)
 * Versi Full-Stack: Semua data accounts & posts disimpan di backend server
 * melalui fetch HTTP API. OAuth dialihkan ke endpoint backend.
 */

// ============================================================
// State Lokal (UI saja, bukan data)
// ============================================================
const appState = {
    platforms: {
        instagram: { name: 'Instagram', icon: 'instagram', colorClass: 'pill-instagram', defaultMaxChars: 2200 },
        facebook: { name: 'Facebook Feed', icon: 'facebook', colorClass: 'pill-facebook', defaultMaxChars: 5000 },
        tiktok: { name: 'TikTok Video', icon: 'music-2', colorClass: 'pill-tiktok', defaultMaxChars: 2200 },
        youtube: { name: 'YouTube Shorts', icon: 'youtube', colorClass: 'pill-youtube', defaultMaxChars: 100 }
    },
    accounts: [],
    posts: [],
    aiJobs: [],
    office: {
        employees: [],
        board: {},
        jobCounts: {},
        settings: null,
        selectedJobId: null,
        focusRoleId: null,
        stageReady: false,
        briefTemplates: [],
        insights: null,
        platforms: ['instagram', 'facebook', 'tiktok', 'youtube'],
        activityLive: [],
        auditEntries: []
    },
    serverMode: 'sandbox',  // 'sandbox' | 'real'
    authStatus: null,
    user: null,
    currentView: 'dashboard',
    composerSelectedPlatforms: [],
    composerMedia: null,
    composerPublishMode: 'now',
    calendarDate: new Date(),
    charts: { channelShare: null, analyticsReach: null, analyticsHealth: null }
};

// ============================================================
// API Client — Komunikasi ke Backend Express
// ============================================================
const api = {
    _authHandler: null,
    onAuthRequired(fn) {
        this._authHandler = fn;
    },
    async _parse(res) {
        let data = {};
        try {
            data = await res.json();
        } catch {
            data = { success: false, message: 'Respons tidak valid' };
        }
        // Hanya route terproteksi yang kirim authRequired. Login 401 (salah password) tidak.
        if (data.authRequired && typeof this._authHandler === 'function') {
            this._authHandler(data);
        }
        return data;
    },
    async get(path) {
        const res = await fetch(path, { credentials: 'include' });
        return this._parse(res);
    },
    async post(path, body) {
        const res = await fetch(path, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return this._parse(res);
    },
    async put(path, body) {
        const res = await fetch(path, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return this._parse(res);
    },
    async delete(path) {
        const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
        return this._parse(res);
    },
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/media/upload', { method: 'POST', body: formData, credentials: 'include' });
        return this._parse(res);
    }
};

// ============================================================
// Inisialisasi Aplikasi
// ============================================================
const app = {
    async init() {
        api.onAuthRequired(() => this.showLoginGate('Sesi berakhir. Silakan login lagi.'));
        this.setupLoginGate();

        // Cek mode server (sandbox / real) + status bootstrap login
        const status = await api.get('/api/status').catch(() => ({ mode: 'sandbox' }));
        appState.serverMode = status.mode || 'sandbox';
        appState.authStatus = status;

        const me = await api.get('/api/auth/me').catch(() => ({ authenticated: false }));
        if (!me.authenticated || !me.user) {
            this.showLoginGate();
            this.updateLoginBootstrapHint(status);
            lucide.createIcons();
            return;
        }
        appState.user = me.user;
        this.hideLoginGate();
        this.updateUserBadge();

        // Muat data awal dari backend
        await this.loadAccountsFromServer();
        await this.loadPostsFromServer();
        await this.loadAiJobsFromServer();

        // Atur jam
        this.updateClock();
        setInterval(() => this.updateClock(), 60000);

        // Pasang event listeners
        this.setupNavigation();
        this.setupComposerEvents();
        this.setupAccountsEvents();
        this.setupQueueEvents();
        this.setupModals();
        const refreshJobsBtn = document.getElementById('dashboard-refresh-jobs-btn');
        if (refreshJobsBtn) {
            refreshJobsBtn.addEventListener('click', async () => {
                await this.loadAiJobsFromServer();
                this.renderAiJobs();
                lucide.createIcons();
            });
        }
        const openOfficeBtn = document.getElementById('dashboard-open-office-btn');
        if (openOfficeBtn) {
            openOfficeBtn.addEventListener('click', () => this.switchView('office'));
        }
        this.setupOfficeEvents();

        // Periksa jika ada callback OAuth dari server di URL
        this.handleOAuthCallback();

        // Render pertama
        this.switchView('dashboard');
        lucide.createIcons();
    },

    setupLoginGate() {
        const form = document.getElementById('app-login-form');
        const logoutBtn = document.getElementById('app-logout-btn');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.submitLogin();
            });
        }
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await api.post('/api/auth/logout', {});
                appState.user = null;
                this.showLoginGate('Anda telah keluar.');
            });
        }
    },

    showLoginGate(message) {
        const gate = document.getElementById('app-login-gate');
        const appRoot = document.querySelector('.app-container');
        const err = document.getElementById('app-login-error');
        if (appRoot) appRoot.classList.add('hidden');
        if (gate) gate.classList.remove('hidden');
        if (err) {
            if (message) {
                err.textContent = message;
                err.classList.remove('hidden');
            } else {
                err.textContent = '';
                err.classList.add('hidden');
            }
        }
        this.updateLoginBootstrapHint(appState.authStatus);
    },

    updateLoginBootstrapHint(status) {
        const hint = document.getElementById('app-login-hint');
        const hostEl = document.getElementById('app-login-host');
        if (!hint && !hostEl) return;

        const boot = status && status.bootstrap ? status.bootstrap : null;
        const host = (status && status.host) || window.location.host || '';
        const isLocal = !!(status && status.isLocalHost)
            || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
        const configured = !!(boot && boot.configured);
        const hasUsers = !!(boot && boot.hasUsers);

        if (hostEl) {
            hostEl.hidden = false;
            if (isLocal) {
                hostEl.textContent = `Anda di lokal: http://${host || 'localhost:3000'} (baca .env + db.json).`;
                hostEl.removeAttribute('data-tone');
            } else {
                hostEl.textContent = `Anda di cloud: ${host} — env diambil dari Vercel, bukan file .env di PC.`;
                if (configured) hostEl.removeAttribute('data-tone');
                else hostEl.setAttribute('data-tone', 'warn');
            }
        }

        if (!hint) return;
        if (!configured) {
            hint.setAttribute('data-tone', 'warn');
            hint.innerHTML = isLocal
                ? 'Bootstrap belum sync: isi <code>ADMIN_EMAIL</code> + <code>ADMIN_PASSWORD</code> di <code>.env</code>, simpan, lalu <strong>restart</strong> <code>npm run dev</code> (bukan hanya refresh browser).'
                : 'Bootstrap belum ada di Vercel: tambah <code>ADMIN_EMAIL</code> + <code>ADMIN_PASSWORD_HASH</code> (dan <code>DATABASE_URL</code>) di Project → Settings → Environment Variables, lalu <strong>Redeploy</strong>.';
            return;
        }
        if (!hasUsers) {
            hint.setAttribute('data-tone', 'warn');
            hint.innerHTML = isLocal
                ? 'Env ADMIN_* sudah ada, tapi belum ada user di DB. Restart server agar bootstrap menulis ke <code>db.json</code>.'
                : 'Env ADMIN_* terdeteksi, tapi belum ada user. Pastikan <code>DATABASE_URL</code> (Neon) terisi, lalu Redeploy.';
            return;
        }
        hint.removeAttribute('data-tone');
        hint.innerHTML = isLocal
            ? 'Login memakai email/password yang sama dengan <code>ADMIN_EMAIL</code> / <code>ADMIN_PASSWORD</code> di <code>.env</code> (setelah restart). Placeholder di atas bukan kredensial default.'
            : 'Login production memakai kredensial dari Vercel env (<code>ADMIN_EMAIL</code> + password/hash), bukan dari <code>.env</code> di PC.';
    },

    hideLoginGate() {
        const gate = document.getElementById('app-login-gate');
        const appRoot = document.querySelector('.app-container');
        if (gate) gate.classList.add('hidden');
        if (appRoot) appRoot.classList.remove('hidden');
    },

    updateUserBadge() {
        const el = document.getElementById('app-user-badge');
        if (!el || !appState.user) return;
        el.textContent = `${appState.user.email} · ${appState.user.role || 'editor'}`;
        el.classList.remove('hidden');
    },

    async submitLogin() {
        const email = (document.getElementById('app-login-email')?.value || '').trim();
        const password = document.getElementById('app-login-password')?.value || '';
        const err = document.getElementById('app-login-error');
        const btn = document.getElementById('app-login-submit');
        if (err) {
            err.classList.add('hidden');
            err.textContent = '';
        }
        if (btn) btn.disabled = true;
        try {
            const data = await api.post('/api/auth/login', { email, password });
            if (!data.success || !data.user) {
                if (err) {
                    err.textContent = data.message || 'Login gagal.';
                    err.classList.remove('hidden');
                }
                return;
            }
            appState.user = data.user;
            window.location.reload();
            return;
        } catch (e) {
            if (err) {
                err.textContent = e.message || 'Login gagal.';
                err.classList.remove('hidden');
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    // --- Deteksi & Tampilkan Notifikasi Hasil OAuth ---
    handleOAuthCallback() {
        const params = new URLSearchParams(window.location.search);
        const auth = params.get('auth');
        const authStatus = params.get('status');
        const msg = params.get('msg');

        if (auth && authStatus) {
            const platformNames = { meta: 'Facebook/Instagram', youtube: 'YouTube', tiktok: 'TikTok' };
            const platformLabel = platformNames[auth] || auth;

            if (authStatus === 'success') {
                this.showToast(`✅ ${platformLabel} berhasil terhubung!`, 'emerald');
            } else {
                this.showToast(`❌ Gagal menghubungkan ${platformLabel}: ${msg || 'Terjadi kesalahan.'}`, 'red');
            }

            // Bersihkan query parameter dari URL
            window.history.replaceState({}, document.title, '/');

            // Reload akun
            this.loadAccountsFromServer().then(() => {
                this.updateActiveAccountsCounter();
                if (appState.currentView === 'accounts') this.renderAccounts();
            });
        }
    },

    // --- Load Data dari Server ---
    async loadAccountsFromServer() {
        try {
            const data = await api.get('/api/accounts');
            if (data.success) {
                appState.accounts = data.accounts || [];
                this.updatePreviewAccounts();
            }
        } catch (e) {
            console.error('[APP] Gagal memuat akun dari server:', e);
        }
    },

    async loadPostsFromServer() {
        try {
            const data = await api.get('/api/posts');
            if (data.success) appState.posts = data.posts || [];
        } catch (e) {
            console.error('[APP] Gagal memuat postingan dari server:', e);
        }
    },

    async loadAiJobsFromServer() {
        try {
            const data = await api.get('/api/ai/jobs');
            if (data.success) appState.aiJobs = data.jobs || [];
        } catch (e) {
            console.error('[APP] Gagal memuat job AI dari server:', e);
            appState.aiJobs = [];
        }
    },

    // --- Toast Notifikasi ---
    showToast(message, color = 'indigo') {
        const colors = {
            indigo: '#6366f1', emerald: '#10b981', red: '#ef4444', yellow: '#f59e0b'
        };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:9999;
            background:${colors[color] || colors.indigo}; color:white;
            padding:14px 20px; border-radius:12px; font-size:0.875rem;
            font-weight:600; font-family:inherit; box-shadow:0 8px 24px rgba(0,0,0,0.3);
            animation:slideUp 0.3s ease forwards; max-width:360px;
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);

        // Tambahkan animasi via style tag jika belum ada
        if (!document.getElementById('toast-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'toast-styles';
            styleEl.textContent = `
                @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
            `;
            document.head.appendChild(styleEl);
        }

        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
    },

    updateClock() {
        const timeDisplay = document.getElementById('header-time');
        if (timeDisplay) {
            const now = new Date();
            const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            const dayName = indonesianDays[now.getDay()];
            const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            timeDisplay.innerText = `${dayName}, ${timeStr}`;
        }
    },

    // --- Pengalih View ---
    switchView(viewName) {
        appState.currentView = viewName;
        document.querySelectorAll('.sidebar-menu li').forEach(li => {
            li.classList.toggle('active', li.getAttribute('data-view') === viewName);
        });
        document.querySelectorAll('.view-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `view-${viewName}`);
        });

        // Jika keluar dari view composer, hapus status edit
        if (viewName !== 'composer') {
            appState.editingPostId = null;
            this.showCancelEditButton(false);
        }

        if (viewName !== 'office') {
            this.teardownOffice3D();
        }

        const titles = {
            dashboard: { title: 'Dasbor Utama', subtitle: 'Ikhtisar saluran terhubung dan antrean postingan terjadwal Anda.' },
            composer: { title: 'Buat Postingan Baru', subtitle: 'Tulis, unggah media, dan kirim postingan secara bersamaan ke berbagai sosmed.' },
            queue: { title: 'Jadwal & Kalender', subtitle: 'Atur kalender konten Anda di masa mendatang secara presisi.' },
            office: { title: 'Kantor AI', subtitle: 'Ruang kerja karyawan AI — brief, work board, dan publish otomatis.' },
            accounts: { title: 'Akun Terhubung', subtitle: 'Tautkan profil, halaman, dan channel sosial media Anda.' },
            analytics: { title: 'Analisis Konten', subtitle: 'Analisis jangkauan, impresi, interaksi, dan rasio keberhasilan postingan.' }
        };

        if (viewName === 'composer' && appState.editingPostId) {
            document.getElementById('view-title').innerText = 'Edit Postingan';
            document.getElementById('view-subtitle').innerText = 'Ubah detail, ganti jadwal, atau ubah saluran tujuan untuk postingan ini.';
        } else if (titles[viewName]) {
            document.getElementById('view-title').innerText = titles[viewName].title;
            document.getElementById('view-subtitle').innerText = titles[viewName].subtitle;
        }

        // Render konten per view
        if (viewName === 'dashboard') this.renderDashboard();
        else if (viewName === 'composer') {
            if (!appState.editingPostId) {
                this.resetComposerForm();
            } else {
                this.resetComposerPlatforms();
            }
        }
        else if (viewName === 'queue') this.renderQueue();
        else if (viewName === 'office') this.renderOffice();
        else if (viewName === 'accounts') this.renderAccounts();
        else if (viewName === 'analytics') this.renderAnalytics();

        lucide.createIcons();
    },

    setupNavigation() {
        document.querySelectorAll('.sidebar-menu li').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetView = item.getAttribute('data-view');
                if (targetView === 'composer') {
                    appState.editingPostId = null;
                }
                this.switchView(targetView);
            });
        });
        document.getElementById('header-create-post-btn').addEventListener('click', () => {
            appState.editingPostId = null;
            this.switchView('composer');
        });
        document.getElementById('dashboard-view-queue-btn').addEventListener('click', () => this.switchView('queue'));
    },

    updateActiveAccountsCounter() {
        const count = appState.accounts.filter(a => a.connected).length;
        document.getElementById('active-accounts-count').innerText = count;
        const sc = document.getElementById('stats-active-channels');
        if (sc) sc.innerText = count;
        const tp = document.getElementById('stats-total-posts');
        if (tp) tp.innerText = appState.posts.length;
        const sp = document.getElementById('stats-scheduled-posts');
        if (sp) sp.innerText = appState.posts.filter(p => p.status === 'scheduled').length;
    }
};

// ============================================================
// Dashboard
// ============================================================
app.renderDashboard = function () {
    this.updateActiveAccountsCounter();

    const channelList = document.getElementById('dashboard-channel-list');
    channelList.innerHTML = '';
    const connectedAccounts = appState.accounts.filter(a => a.connected);

    if (connectedAccounts.length === 0) {
        channelList.innerHTML = `<div class="empty-state-small"><p class="font-xs">Belum ada akun terhubung.</p><button class="btn btn-sm btn-secondary" onclick="app.switchView('accounts')">Hubungkan Akun</button></div>`;
    } else {
        connectedAccounts.forEach(acc => {
            const pInfo = appState.platforms[acc.platform];
            channelList.innerHTML += `
                <div class="dash-channel-row">
                    <div class="dash-channel-left">
                        <img src="${acc.avatar || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=256&auto=format&fit=crop'}" class="dash-channel-avatar" alt="avatar">
                        <div>
                            <span class="dash-channel-name">${acc.name}</span>
                            <div class="dash-channel-platform text-secondary font-xs">${pInfo ? pInfo.name : acc.platform} • ${acc.handle}</div>
                        </div>
                    </div>
                    <span class="badge badge-emerald"><span class="badge-dot"></span>Aktif</span>
                </div>`;
        });
    }

    const scheduledPosts = appState.posts.filter(p => p.status === 'scheduled').sort((a, b) => new Date(a.publishDate) - new Date(b.publishDate));
    const upcomingList = document.getElementById('dashboard-upcoming-list');
    const emptyQueue = document.getElementById('dashboard-empty-queue');
    upcomingList.querySelectorAll('.upcoming-item').forEach(el => el.remove());

    if (scheduledPosts.length === 0) {
        emptyQueue.classList.remove('hidden');
    } else {
        emptyQueue.classList.add('hidden');
        scheduledPosts.slice(0, 3).forEach(post => {
            const dateObj = new Date(post.publishDate);
            const dateStr = dateObj.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            let platformPillsHtml = '';
            post.platforms.forEach(p => {
                const info = appState.platforms[p];
                if (info) platformPillsHtml += `<div class="platform-pill ${info.colorClass}" title="${info.name}"><i data-lucide="${info.icon}"></i></div>`;
            });
            let mediaHtml = '<i data-lucide="image"></i>';
            if (post.mediaUrl) {
                mediaHtml = post.mediaType === 'video'
                    ? `<i data-lucide="video" style="color:var(--indigo);"></i>`
                    : `<img src="${post.mediaUrl}" alt="Thumbnail" class="upcoming-media">`;
            }
            const item = document.createElement('div');
            item.className = 'upcoming-item';
            item.innerHTML = `
                <div class="upcoming-media">${mediaHtml}</div>
                <div class="upcoming-info">
                    <span class="upcoming-text">${post.caption || 'Tanpa Keterangan'}</span>
                    <div class="upcoming-time-pills">
                        <span class="upcoming-date font-xs"><i data-lucide="calendar" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${dateStr} @ ${timeStr}</span>
                        <div class="upcoming-platforms">${platformPillsHtml}</div>
                    </div>
                </div>
                <div class="upcoming-actions">
                    <button class="btn btn-sm btn-secondary" onclick="app.editPost('${post.id}')" title="Edit"><i data-lucide="edit" style="width:12px;height:12px;"></i></button>
                    <button class="btn btn-sm btn-secondary" onclick="app.postImmediately('${post.id}')" title="Terbitkan Sekarang"><i data-lucide="send" style="width:12px;height:12px;"></i></button>
                    <button class="btn btn-sm btn-secondary" onclick="app.deletePost('${post.id}')" title="Hapus"><i data-lucide="trash-2" style="width:12px;height:12px;color:var(--red);"></i></button>
                </div>`;
            upcomingList.appendChild(item);
        });
    }

    this.renderChannelShareChart();
    this.renderAiJobs();
    this.loadAndRenderInsights('dashboard-nextup-body');
    lucide.createIcons();
};

app.renderAiJobs = function () {
    const list = document.getElementById('dashboard-ai-jobs-list');
    if (!list) return;

    const empty = document.getElementById('dashboard-empty-jobs');
    list.querySelectorAll('.ai-job-row').forEach(el => el.remove());

    const jobs = (appState.aiJobs || []).slice(0, 5);
    if (jobs.length === 0) {
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    const badgeFor = (status) => {
        const map = {
            queued: 'badge-indigo',
            needs_info: 'badge-yellow',
            publishing: 'badge-violet',
            done: 'badge-emerald',
            failed: 'badge-red'
        };
        return map[status] || 'badge-indigo';
    };

    const labelFor = (status) => {
        const map = {
            queued: 'Antri',
            needs_info: 'Perlu info',
            publishing: 'Publish…',
            done: 'Selesai',
            failed: 'Gagal'
        };
        return map[status] || status;
    };

    jobs.forEach(job => {
        const row = document.createElement('div');
        row.className = 'ai-job-row ai-job-row-clickable';
        row.title = 'Buka di Kantor AI';
        row.addEventListener('click', () => {
            appState.office.selectedJobId = job.id;
            this.switchView('office');
        });
        const brief = (job.brief || '(tanpa brief)').replace(/</g, '&lt;');
        const who = (job.employeeName || job.roleId || 'AI').replace(/</g, '&lt;');
        row.innerHTML = `
            <div class="ai-job-meta">
                <span class="ai-job-brief" title="${brief}">${brief}</span>
                <span class="ai-job-id">${who} · ${job.id}</span>
            </div>
            <span class="badge ${badgeFor(job.status)}">${labelFor(job.status)}</span>`;
        list.appendChild(row);
    });
};

// ============================================================
// Kantor AI
// ============================================================
app.setupOfficeEvents = function () {
    const form = document.getElementById('office-brief-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitOfficeBrief();
        });
    }
    const refreshBtn = document.getElementById('office-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.renderOffice());
    }
    const answerBtn = document.getElementById('office-answer-submit');
    if (answerBtn) {
        answerBtn.addEventListener('click', () => this.submitOfficeAnswers());
    }
    const runBtn = document.getElementById('office-run-job-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => this.runOfficeJob(false));
    }
    const approveBtn = document.getElementById('office-approve-job-btn');
    if (approveBtn) {
        approveBtn.addEventListener('click', () => this.approveOfficeJob());
    }
    const retryBtn = document.getElementById('office-retry-job-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => this.runOfficeJob(true));
    }
    const settingsSave = document.getElementById('office-settings-save');
    if (settingsSave) {
        settingsSave.addEventListener('click', () => this.saveOfficeSettings());
    }
    const pauseBtn = document.getElementById('office-emergency-pause-btn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => this.toggleEmergencyPause());
    }
    const brandSave = document.getElementById('office-brand-save');
    if (brandSave) {
        brandSave.addEventListener('click', () => this.saveOfficeBrandMemory());
    }
    const brandLoad = document.getElementById('office-brand-load');
    if (brandLoad) {
        brandLoad.addEventListener('click', () => this.loadOfficeBrandMemory());
    }
    document.querySelectorAll('.office-tpl-btn').forEach(btn => {
        btn.addEventListener('click', () => this.applyOfficeBriefTemplate(btn.dataset.tpl));
    });
    const dashInsightsOffice = document.getElementById('dashboard-open-office-from-insights');
    if (dashInsightsOffice) {
        dashInsightsOffice.addEventListener('click', () => this.switchView('office'));
    }
    const toggle3d = document.getElementById('office-3d-toggle');
    if (toggle3d) {
        const prefOn = (typeof AiOffice3D !== 'undefined' && AiOffice3D.loadPreference)
            ? AiOffice3D.loadPreference()
            : false;
        toggle3d.checked = !!prefOn;
        toggle3d.addEventListener('change', () => {
            const viewport = document.getElementById('office-3d-viewport');
            if (typeof AiOffice3D === 'undefined' || typeof THREE === 'undefined') {
                toggle3d.checked = false;
                if (viewport) viewport.classList.add('is-3d-off');
                this.showToast('Modul 3D gagal dimuat. Muat ulang halaman.', 'red');
                return;
            }
            AiOffice3D.setEnabled(toggle3d.checked);
            if (toggle3d.checked && !appState.office.stageReady) {
                this.initOffice3D();
            }
            this.syncOffice3DEmployees();
        });
    }
};

app.loadOfficeFromServer = async function () {
    try {
        const data = await api.get('/api/ai/office');
        if (data.success) {
            appState.office.employees = data.employees || [];
            appState.office.board = data.board || {};
            appState.office.jobCounts = data.jobCounts || {};
            appState.office.settings = data.settings || null;
            appState.office.briefTemplates = data.briefTemplates || [];
            if (data.platforms) appState.office.platforms = data.platforms;
        }
        await this.loadAiJobsFromServer();
    } catch (e) {
        console.error('[APP] Gagal memuat Kantor AI:', e);
    }
};

app.renderOffice = async function () {
    await this.loadOfficeFromServer();
    this.renderOfficeSettings();
    this.renderOfficeEmployees();
    this.renderOfficeBoard();
    this.renderOfficeRoleSelect();
    this.renderOfficeAnswerPanel();
    await this.loadAndRenderInsights('office-nextup-body');
    this.initOffice3D();
    this.syncOffice3DEmployees();
    await this.loadOfficeActivityLog();
    lucide.createIcons();
};

app.loadAndRenderInsights = async function (containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
        const data = await api.get('/api/ai/insights?days=30');
        if (!data.success) {
            el.innerHTML = `<p class="text-secondary font-sm">${this._escapeHtml(data.message || 'Gagal memuat insights.')}</p>`;
            return;
        }
        appState.office.insights = data;
        this.renderNextUpPanel(el, data);
    } catch (e) {
        el.innerHTML = '<p class="text-secondary font-sm">Gagal memuat insights.</p>';
    }
};

app.renderNextUpPanel = function (el, data) {
    if (!el) return;
    const next = data.nextUp || {};
    const insights = data.insights || [];
    const recs = (next.recommendations || data.recommendations || []).slice(0, 3);
    const insightLines = insights.slice(0, 3).map(i =>
        `<li class="office-nextup-item">
            <span class="office-nextup-item-title">${this._escapeHtml(i.title)}</span>
            <span class="office-nextup-item-reason">${this._escapeHtml(i.summary)}</span>
        </li>`
    ).join('');
    const recHtml = recs.map(r =>
        `<li class="office-nextup-item">
            <span class="office-nextup-item-title">${this._escapeHtml(r.cta || r.id)}</span>
            <span class="office-nextup-item-reason">${this._escapeHtml(r.reason || '')}</span>
            <div class="office-nextup-actions">
                <button type="button" class="btn btn-sm btn-primary office-nextup-cta"
                    data-role="${this._escapeHtml(r.roleId || 'strategist')}"
                    data-platforms="${this._escapeHtml((r.platforms || []).join(','))}"
                    data-reason="${this._escapeHtml(r.reason || '')}">${this._escapeHtml(r.cta || 'Buat brief')}</button>
            </div>
        </li>`
    ).join('');

    el.innerHTML = `
        <p class="office-nextup-headline">${this._escapeHtml(next.headline || 'Apa berikutnya')}</p>
        <p class="office-nextup-summary">${this._escapeHtml(next.summary || '')}</p>
        ${insightLines ? `<ul class="office-nextup-list">${insightLines}</ul>` : ''}
        ${recHtml ? `<ul class="office-nextup-list">${recHtml}</ul>` : ''}
        <p class="input-hint">${data.sampleSize || 0} post · ${data.windowDays || 30} hari${data.bestHour != null ? ` · jam kuat ~${String(data.bestHour).padStart(2, '0')}:00` : ''}</p>
    `;
    el.querySelectorAll('.office-nextup-cta').forEach(btn => {
        btn.addEventListener('click', () => {
            this.applyInsightCta({
                roleId: btn.dataset.role,
                platforms: (btn.dataset.platforms || '').split(',').filter(Boolean),
                reason: btn.dataset.reason || ''
            });
        });
    });
};

app.applyInsightCta = function ({ roleId, platforms, reason }) {
    this.switchView('office');
    const select = document.getElementById('office-role-select');
    if (select && roleId) select.value = roleId;
    const ta = document.getElementById('office-brief-text');
    if (ta) {
        const plats = (platforms || []).join(', ') || 'instagram';
        ta.value = `${reason || 'Konten lanjutan dari insights'}. Platform: ${plats}. CTA jelas. Tone sesuai brand memory.`;
    }
    appState.office.focusRoleId = roleId || null;
    this.showToast('Brief disiapkan dari insights — review lalu kirim.', 'emerald');
};

app._collectRolePermissionsFromUi = function () {
    const root = document.getElementById('office-role-permissions');
    if (!root) return {};
    const platforms = appState.office.platforms || ['instagram', 'facebook', 'tiktok', 'youtube'];
    const map = {};
    root.querySelectorAll('.office-role-perm-row').forEach(row => {
        const roleId = row.dataset.roleId;
        if (!roleId) return;
        const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
        // Semua centang atau nol centang → tidak dibatasi (omit)
        if (checked.length > 0 && checked.length < platforms.length) {
            map[roleId] = checked;
        }
    });
    return map;
};

app.renderOfficeRolePermissions = function () {
    const root = document.getElementById('office-role-permissions');
    if (!root) return;
    const platforms = appState.office.platforms || ['instagram', 'facebook', 'tiktok', 'youtube'];
    const perms = (appState.office.settings && appState.office.settings.rolePermissions) || {};
    const employees = appState.office.employees || [];
    root.innerHTML = employees.map(emp => {
        const allowed = Object.prototype.hasOwnProperty.call(perms, emp.id) ? perms[emp.id] : null;
        const checks = platforms.map(p => {
            const on = allowed == null ? true : allowed.includes(p);
            return `<label><input type="checkbox" value="${p}" ${on ? 'checked' : ''}> ${p}</label>`;
        }).join('');
        return `<div class="office-role-perm-row" data-role-id="${emp.id}">
            <span class="office-role-perm-name">${this._escapeHtml(emp.name)} · ${this._escapeHtml(emp.title || emp.id)}</span>
            <div class="office-role-perm-checks">${checks}</div>
        </div>`;
    }).join('') || '<p class="text-secondary font-sm">Muat Kantor AI dulu.</p>';
};

app.renderOfficeSettings = function () {
    const s = appState.office.settings;
    const autonomy = document.getElementById('office-autonomy-select');
    const cap = document.getElementById('office-daily-cap');
    const status = document.getElementById('office-settings-status');
    const pauseBtn = document.getElementById('office-emergency-pause-btn');
    const notifyEn = document.getElementById('office-notify-enabled');
    const notifyEmail = document.getElementById('office-notify-email');
    const notifyWh = document.getElementById('office-notify-webhook');
    if (!s) {
        if (status) status.textContent = 'Settings belum dimuat.';
        return;
    }
    if (autonomy) autonomy.value = s.autonomyLevel || 'limited_autonomous';
    if (cap) cap.value = s.dailyPostCap != null ? s.dailyPostCap : 10;
    const n = s.notifications || {};
    if (notifyEn) notifyEn.checked = !!n.enabled;
    if (notifyEmail) notifyEmail.value = n.email || '';
    if (notifyWh) notifyWh.value = n.whatsappWebhookUrl || n.whatsapp || '';
    this.renderOfficeRolePermissions();
    if (status) {
        status.textContent = s.emergencyPause
            ? '⛔ Jeda darurat AKTIF — agen tidak boleh publish.'
            : `Otonomi: ${s.autonomyLevel} · cap ${s.dailyPostCap}/hari` +
                (n.enabled ? ' · notifikasi on' : '');
    }
    if (pauseBtn) {
        pauseBtn.textContent = s.emergencyPause ? 'Lepas jeda' : 'Jeda darurat';
        pauseBtn.classList.toggle('btn-danger', !s.emergencyPause);
        pauseBtn.classList.toggle('btn-secondary', !!s.emergencyPause);
    }
};

app.saveOfficeSettings = async function () {
    try {
        const autonomyLevel = document.getElementById('office-autonomy-select')?.value;
        const dailyPostCap = parseInt(document.getElementById('office-daily-cap')?.value, 10);
        const notifications = {
            enabled: !!document.getElementById('office-notify-enabled')?.checked,
            email: document.getElementById('office-notify-email')?.value?.trim() || null,
            whatsappWebhookUrl: document.getElementById('office-notify-webhook')?.value?.trim() || null
        };
        const rolePermissions = this._collectRolePermissionsFromUi();
        const data = await api.put('/api/ai/settings', {
            autonomyLevel,
            dailyPostCap,
            notifications,
            rolePermissions
        });
        if (!data.success) {
            this.showToast(data.message || 'Gagal simpan settings.', 'red');
            return;
        }
        appState.office.settings = {
            autonomyLevel: data.settings.autonomyLevel,
            emergencyPause: data.settings.emergencyPause,
            dailyPostCap: data.settings.dailyPostCap,
            notifications: data.settings.notifications,
            rolePermissions: data.settings.rolePermissions,
            insightsEnabled: data.settings.insightsEnabled
        };
        this.renderOfficeSettings();
        this.showToast('Settings Tim Konten disimpan.', 'emerald');
    } catch (e) {
        this.showToast('Gagal simpan settings.', 'red');
    }
};

app.toggleEmergencyPause = async function () {
    const s = appState.office.settings;
    const pause = !(s && s.emergencyPause);
    try {
        const data = await api.post('/api/ai/settings/emergency-pause', { pause });
        if (!data.success) {
            this.showToast(data.message || 'Gagal.', 'red');
            return;
        }
        appState.office.settings = {
            ...(appState.office.settings || {}),
            autonomyLevel: data.settings.autonomyLevel,
            emergencyPause: data.settings.emergencyPause,
            dailyPostCap: data.settings.dailyPostCap,
            notifications: data.settings.notifications,
            rolePermissions: data.settings.rolePermissions
        };
        this.renderOfficeSettings();
        this.showToast(data.message || (pause ? 'Jeda aktif' : 'Jeda lepas'), pause ? 'yellow' : 'emerald');
    } catch (e) {
        this.showToast('Gagal mengubah jeda darurat.', 'red');
    }
};

app.applyOfficeBriefTemplate = async function (tplId) {
    try {
        const data = await api.get('/api/ai/brief-templates');
        const tpl = (data.templates || []).find(t => t.id === tplId);
        const ta = document.getElementById('office-brief-text');
        if (tpl && ta) {
            ta.value = tpl.text || '';
            this.showToast(`Templat: ${tpl.label}`, 'emerald');
        }
    } catch (e) {
        this.showToast('Gagal memuat templat.', 'red');
    }
};

app.loadOfficeBrandMemory = async function () {
    const platform = document.getElementById('office-brand-platform')?.value || 'instagram';
    try {
        const data = await api.get(`/api/accounts/${platform}/brand-memory`);
        const bm = data.brandMemory || {};
        document.getElementById('office-brand-tone').value = bm.tone || '';
        document.getElementById('office-brand-audience').value = bm.audience || '';
        document.getElementById('office-brand-banned').value = (bm.bannedWords || []).join(', ');
        document.getElementById('office-brand-pillars').value = (bm.pillars || []).join(', ');
        document.getElementById('office-brand-emoji').checked = bm.emojiOk !== false;
        this.showToast(data.summary || 'Brand memory dimuat.', 'emerald');
    } catch (e) {
        this.showToast('Belum ada memori — isi lalu simpan.', 'yellow');
    }
};

app.saveOfficeBrandMemory = async function () {
    const platform = document.getElementById('office-brand-platform')?.value || 'instagram';
    const split = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    const brandMemory = {
        tone: document.getElementById('office-brand-tone')?.value || '',
        audience: document.getElementById('office-brand-audience')?.value || '',
        bannedWords: split(document.getElementById('office-brand-banned')?.value),
        pillars: split(document.getElementById('office-brand-pillars')?.value),
        emojiOk: !!document.getElementById('office-brand-emoji')?.checked
    };
    try {
        const data = await api.put(`/api/accounts/${platform}/brand-memory`, { brandMemory });
        if (!data.success) {
            this.showToast(data.message || 'Gagal simpan.', 'red');
            return;
        }
        this.showToast(`Memori ${platform} disimpan.`, 'emerald');
    } catch (e) {
        this.showToast('Gagal simpan brand memory.', 'red');
    }
};

app.initOffice3D = function () {
    const viewport = document.getElementById('office-3d-viewport');
    const canvas = document.getElementById('office-3d-canvas');
    const labels = document.getElementById('office-3d-labels');
    const toggle = document.getElementById('office-3d-toggle');
    if (!viewport || typeof AiOffice3D === 'undefined' || typeof THREE === 'undefined') {
        if (viewport) viewport.classList.add('is-3d-off');
        if (toggle) toggle.checked = false;
        return;
    }
    if (appState.office.stageReady) {
        AiOffice3D.resize();
        return;
    }
    const enabled = toggle ? toggle.checked : AiOffice3D.loadPreference();
    if (toggle) toggle.checked = enabled;
    const ok = AiOffice3D.init(viewport, {
        canvas,
        labelsRoot: labels,
        enabled,
        onSelect: (roleId) => this.focusOfficeEmployee(roleId),
        onActivity: (rows) => this.renderOfficeActivityLive(rows)
    });
    appState.office.stageReady = !!ok;
    if (!ok) {
        viewport.classList.add('is-3d-off');
        if (toggle) toggle.checked = false;
    }
};

app.renderOfficeActivityLive = function (rows) {
    const list = document.getElementById('office-activity-live');
    if (!list) return;
    const items = Array.isArray(rows) ? rows : (typeof AiOffice3D !== 'undefined' && AiOffice3D.getActivitySnapshot
        ? AiOffice3D.getActivitySnapshot()
        : []);
    appState.office.activityLive = items;
    if (!items.length) {
        list.innerHTML = '<li class="text-secondary">Belum ada aktivitas ruang.</li>';
        return;
    }
    list.innerHTML = items.map((row) => {
        const name = this._escapeHtml(row.name || row.roleId || '—');
        const speech = this._escapeHtml(row.speech || row.label || row.status || '');
        const status = this._escapeHtml(row.status || 'idle');
        return `<li><strong>${name}</strong> · ${status}<br>${speech}</li>`;
    }).join('');
};

app.loadOfficeActivityLog = async function () {
    const auditEl = document.getElementById('office-activity-audit');
    const metaEl = document.getElementById('office-activity-meta');
    try {
        const data = await api.get('/api/ai/audit-log?limit=12');
        const entries = (data && data.success && Array.isArray(data.entries)) ? data.entries : [];
        appState.office.auditEntries = entries;
        if (metaEl) {
            metaEl.textContent = entries.length
                ? `${entries.length} entri audit terbaru`
                : 'Live dari status job';
        }
        if (!auditEl) return;
        if (!entries.length) {
            auditEl.innerHTML = '<li>Belum ada audit trail. Publish / needs_info / approval akan muncul di sini.</li>';
            return;
        }
        auditEl.innerHTML = entries.map((e) => {
            const when = e.createdAt ? new Date(e.createdAt).toLocaleString('id-ID', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'
            }) : '';
            const actor = this._escapeHtml(e.actor || 'system');
            const action = this._escapeHtml(e.action || '');
            const target = this._escapeHtml(e.target || '');
            const detail = e.detail ? this._escapeHtml(String(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)).slice(0, 80)) : '';
            return `<li><time>${when}</time> · <strong>${actor}</strong> ${action}${target ? ' → ' + target : ''}${detail ? ' — ' + detail : ''}</li>`;
        }).join('');
    } catch (err) {
        if (auditEl) {
            auditEl.innerHTML = '<li>Audit log tidak tersedia saat ini.</li>';
        }
    }
};

app.teardownOffice3D = function () {
    if (typeof AiOffice3D !== 'undefined') {
        AiOffice3D.dispose();
    }
    appState.office.stageReady = false;
};

app.syncOffice3DEmployees = function () {
    if (typeof AiOffice3D === 'undefined' || !appState.office.stageReady) return;
    AiOffice3D.updateEmployees(appState.office.employees || []);
    if (typeof AiOffice3D.getActivitySnapshot === 'function') {
        this.renderOfficeActivityLive(AiOffice3D.getActivitySnapshot());
    }
};

app.focusOfficeEmployee = function (roleId) {
    if (!roleId) return;
    appState.office.focusRoleId = roleId;
    const select = document.getElementById('office-role-select');
    if (select) select.value = roleId;

    const emp = (appState.office.employees || []).find(e => e.id === roleId);
    if (emp?.latestJob) {
        appState.office.selectedJobId = emp.latestJob.id;
    }

    document.querySelectorAll('.office-employee-card').forEach(card => {
        card.classList.toggle('is-focused', card.dataset.roleId === roleId);
    });

    this.renderOfficeBoard();
    this.renderOfficeAnswerPanel();

    const boardCard = document.querySelector('.office-board-card');
    if (boardCard) boardCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (emp) {
        this.showToast(`Fokus: ${emp.name} — ${this._statusLabel(emp.status)}`, 'emerald');
    }
};

app._escapeHtml = function (str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

app._statusLabel = function (status) {
    const map = {
        idle: 'Siaga',
        queued: 'Antri',
        needs_info: 'Perlu info',
        awaiting_approval: 'Approval',
        working: 'Kerja',
        publishing: 'Publish…',
        done: 'Selesai',
        failed: 'Gagal'
    };
    return map[status] || status;
};

app._statusBadge = function (status) {
    const map = {
        idle: 'badge-indigo',
        queued: 'badge-indigo',
        needs_info: 'badge-yellow',
        awaiting_approval: 'badge-orange',
        working: 'badge-violet',
        publishing: 'badge-violet',
        done: 'badge-emerald',
        failed: 'badge-red'
    };
    return map[status] || 'badge-indigo';
};

app.renderOfficeEmployees = function () {
    const grid = document.getElementById('office-employees-grid');
    const empty = document.getElementById('office-employees-empty');
    if (!grid) return;

    grid.querySelectorAll('.office-employee-card').forEach(el => el.remove());
    const employees = appState.office.employees || [];
    if (employees.length === 0) {
        if (empty) {
            empty.classList.remove('hidden');
            empty.querySelector('p').textContent = 'Belum ada peran terdaftar.';
        }
        return;
    }
    if (empty) empty.classList.add('hidden');

    employees.forEach(emp => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'office-employee-card';
        card.dataset.roleId = emp.id;
        const workload = emp.workload || (emp.activeCount ? `${emp.activeCount} tugas` : 'idle');
        const brief = emp.latestJob
            ? this._escapeHtml((emp.latestJob.brief || '').slice(0, 72))
            : 'Belum ada job';
        card.innerHTML = `
            <div class="office-employee-avatar" style="background:${emp.avatarColor || 'var(--indigo)'}">
                <span>${emp.emoji || '🤖'}</span>
            </div>
            <div class="office-employee-info">
                <span class="office-employee-name">${this._escapeHtml(emp.name)}</span>
                <span class="office-employee-title">${this._escapeHtml(emp.title)}</span>
                <span class="office-employee-workload">${this._escapeHtml(workload)}</span>
                <span class="office-employee-brief">${brief}</span>
            </div>
            <span class="badge ${this._statusBadge(emp.status)}">${this._statusLabel(emp.status)}</span>`;
        if (appState.office.focusRoleId === emp.id) card.classList.add('is-focused');
        card.addEventListener('click', () => {
            this.focusOfficeEmployee(emp.id);
            if (emp.latestJob) {
                appState.office.selectedJobId = emp.latestJob.id;
                this.renderOfficeAnswerPanel();
            }
        });
        grid.appendChild(card);
    });
};

app.renderOfficeBoard = function () {
    const statuses = ['queued', 'needs_info', 'awaiting_approval', 'publishing', 'done', 'failed'];
    const board = appState.office.board || {};
    const counts = appState.office.jobCounts || {};
    const countsEl = document.getElementById('office-board-counts');
    if (countsEl) {
        countsEl.textContent = counts.total
            ? `${counts.total} job · ${counts.needs_info || 0} info · ${counts.awaiting_approval || 0} approval · ${counts.queued || 0} antri`
            : 'Belum ada job';
    }

    statuses.forEach(status => {
        const col = document.getElementById(`office-col-${status}`);
        const countEl = document.getElementById(`office-count-${status}`);
        if (!col) return;
        col.innerHTML = '';
        const items = board[status] || [];
        if (countEl) countEl.textContent = String(counts[status] != null ? counts[status] : items.length);

        if (items.length === 0) {
            col.innerHTML = '<p class="office-column-empty">Kosong</p>';
            return;
        }

        const focusRole = appState.office.focusRoleId;
        const filtered = focusRole
            ? items.filter(j => j.roleId === focusRole || j.employeeRole === focusRole)
            : items;

        if (filtered.length === 0) {
            col.innerHTML = focusRole
                ? '<p class="office-column-empty">Tidak ada job peran ini</p>'
                : '<p class="office-column-empty">Kosong</p>';
            return;
        }

        filtered.forEach(job => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'office-job-card';
            if (appState.office.selectedJobId === job.id) item.classList.add('active');
            const errHint = job.lastError
                ? `<span class="office-job-error">${this._escapeHtml(String(job.lastError).slice(0, 60))}</span>`
                : '';
            item.innerHTML = `
                <span class="office-job-brief">${this._escapeHtml(job.brief || '(tanpa brief)')}</span>
                <span class="office-job-meta">${this._escapeHtml(job.employeeName || job.roleId || 'AI')} · v${job.version || 1} · ${this._escapeHtml(job.id)}</span>
                ${errHint}`;
            item.addEventListener('click', () => {
                appState.office.selectedJobId = job.id;
                this.renderOfficeBoard();
                this.renderOfficeAnswerPanel();
            });
            col.appendChild(item);
        });
    });

    const countsElFocus = document.getElementById('office-board-counts');
    if (countsElFocus && appState.office.focusRoleId) {
        const emp = (appState.office.employees || []).find(e => e.id === appState.office.focusRoleId);
        const clearHint = document.createElement('button');
        clearHint.type = 'button';
        clearHint.className = 'btn-text office-clear-focus';
        clearHint.textContent = emp ? `Filter: ${emp.name} · Hapus` : 'Hapus filter';
        clearHint.addEventListener('click', () => {
            appState.office.focusRoleId = null;
            document.querySelectorAll('.office-employee-card.is-focused').forEach(c => c.classList.remove('is-focused'));
            this.renderOfficeBoard();
        });
        countsElFocus.appendChild(document.createTextNode(' · '));
        countsElFocus.appendChild(clearHint);
    }
};

app.renderOfficeRoleSelect = function () {
    const select = document.getElementById('office-role-select');
    if (!select) return;
    const current = select.value;
    const employees = appState.office.employees || [];
    select.innerHTML = '<option value="">Pilih karyawan…</option>';
    employees.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.textContent = `${emp.emoji || ''} ${emp.name} — ${emp.title}`;
        select.appendChild(opt);
    });
    if (current && employees.some(e => e.id === current)) {
        select.value = current;
    } else if (employees[0]) {
        select.value = employees[0].id;
    }
};

app.renderOfficeAnswerPanel = function () {
    const card = document.getElementById('office-answer-card');
    if (!card) return;

    const jobId = appState.office.selectedJobId;
    const job = (appState.aiJobs || []).find(j => j.id === jobId)
        || Object.values(appState.office.board || {}).flat().find(j => j.id === jobId);

    const answerBtn = document.getElementById('office-answer-submit');
    const runBtn = document.getElementById('office-run-job-btn');
    const approveBtn = document.getElementById('office-approve-job-btn');
    const retryBtn = document.getElementById('office-retry-job-btn');
    const errEl = document.getElementById('office-answer-error');

    const hideActions = () => {
        if (answerBtn) answerBtn.classList.add('hidden');
        if (runBtn) runBtn.classList.add('hidden');
        if (approveBtn) approveBtn.classList.add('hidden');
        if (retryBtn) retryBtn.classList.add('hidden');
    };

    if (!job) {
        card.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden');
    document.getElementById('office-answer-job-id').textContent = `${job.id} · ${job.status}`;
    document.getElementById('office-answer-brief').textContent = job.brief || '';
    hideActions();

    if (errEl) {
        if (job.lastError) {
            errEl.textContent = `Error: ${job.lastError}`;
            errEl.classList.remove('hidden');
        } else {
            errEl.textContent = '';
            errEl.classList.add('hidden');
        }
    }

    const qWrap = document.getElementById('office-answer-questions');

    if (job.status === 'needs_info') {
        if (answerBtn) answerBtn.classList.remove('hidden');
        const questions = job.questions || [];
        qWrap.innerHTML = questions.length
            ? questions.map((q, i) => `
                <div class="form-group">
                    <label for="office-answer-${i}">${this._escapeHtml(q)}</label>
                    <textarea id="office-answer-${i}" class="form-control office-answer-input" rows="2" data-index="${i}" required></textarea>
                </div>`).join('')
            : '<p class="text-secondary font-sm">Lengkapi brief lalu kirim jawaban.</p>';
        return;
    }

    if (job.status === 'awaiting_approval') {
        qWrap.innerHTML = '<p class="text-secondary font-sm">Menunggu persetujuan manusia (otonomi / high-risk / cap / jeda). Setujui untuk publish.</p>';
        if (approveBtn) approveBtn.classList.remove('hidden');
        return;
    }

    if (job.status === 'failed') {
        qWrap.innerHTML = `<p class="text-secondary font-sm">Publish gagal.${job.lastError ? ' Perbaiki lalu retry.' : ''}</p>`;
        if (retryBtn) retryBtn.classList.remove('hidden');
        if (runBtn) runBtn.classList.remove('hidden');
        return;
    }

    if (job.status === 'queued' || job.status === 'done') {
        qWrap.innerHTML = job.status === 'queued'
            ? '<p class="text-secondary font-sm">Job siap. Jalankan publish (gate otonomi tetap berlaku).</p>'
            : '<p class="text-secondary font-sm">Job selesai. Bisa dijalankan ulang jika perlu.</p>';
        if (runBtn) runBtn.classList.remove('hidden');
        return;
    }

    qWrap.innerHTML = `<p class="text-secondary font-sm">Status: ${this._escapeHtml(job.status)}</p>`;
};

app.submitOfficeBrief = async function () {
    const roleId = document.getElementById('office-role-select')?.value;
    const brief = document.getElementById('office-brief-text')?.value?.trim();
    if (!roleId) {
        this.showToast('Pilih peran karyawan dulu.', 'yellow');
        return;
    }
    if (!brief) {
        this.showToast('Isi brief terlebih dahulu.', 'yellow');
        return;
    }

    const emp = (appState.office.employees || []).find(e => e.id === roleId);
    const submitBtn = document.getElementById('office-brief-submit');
    if (submitBtn) submitBtn.disabled = true;

    const variantA = document.getElementById('office-variant-a')?.value?.trim() || '';
    const variantB = document.getElementById('office-variant-b')?.value?.trim() || '';

    try {
        const data = await api.post('/api/ai/jobs', {
            brief,
            roleId,
            employeeName: emp?.name || undefined,
            platforms: emp?.defaultPlatforms || [],
            variantA: variantA || undefined,
            variantB: variantB || undefined
        });

        if (!data.success) {
            this.showToast(data.message || 'Gagal membuat job.', 'red');
            return;
        }

        document.getElementById('office-brief-text').value = '';
        const va = document.getElementById('office-variant-a');
        const vb = document.getElementById('office-variant-b');
        if (va) va.value = '';
        if (vb) vb.value = '';
        appState.office.selectedJobId = data.job.id;

        if (data.needsInfo) {
            this.showToast('Brief tipis — isi pertanyaan di panel kanan.', 'yellow');
        } else {
            this.showToast(`Job ${data.job.id} masuk antrean (${emp?.name || 'AI'}).`, 'emerald');
        }
        await this.renderOffice();
        this.renderAiJobs();
    } catch (e) {
        this.showToast('Gagal mengirim brief.', 'red');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
};

app.submitOfficeAnswers = async function () {
    const jobId = appState.office.selectedJobId;
    if (!jobId) return;

    const inputs = document.querySelectorAll('.office-answer-input');
    const answers = [...inputs].map(el => el.value.trim());
    if (answers.some(a => !a)) {
        this.showToast('Jawab semua pertanyaan dulu.', 'yellow');
        return;
    }

    try {
        const data = await api.post(`/api/ai/jobs/${jobId}/answer`, { answers });
        if (!data.success) {
            this.showToast(data.message || 'Gagal mengirim jawaban.', 'red');
            return;
        }
        this.showToast('Jawaban tersimpan — job kembali antri.', 'emerald');
        appState.office.selectedJobId = data.job.id;
        await this.renderOffice();
    } catch (e) {
        this.showToast('Gagal mengirim jawaban.', 'red');
    }
};

app.runOfficeJob = async function (forcePublish) {
    const jobId = appState.office.selectedJobId;
    if (!jobId) return;

    const job = (appState.aiJobs || []).find(j => j.id === jobId);
    if (!job) {
        this.showToast('Job tidak ditemukan.', 'red');
        return;
    }

    try {
        const canForce = ['admin', 'approver'].includes(appState.user?.role);
        const data = await api.post(`/api/ai/jobs/${jobId}/run`, {
            caption: job.caption || job.brief,
            platforms: job.platforms || [],
            employeeName: job.employeeName,
            // forcePublish hanya admin/approver; setelah /approve pakai approvedAt
            forcePublish: !!(forcePublish && canForce)
        });
        if (data.awaitingApproval) {
            this.showToast(data.message || 'Menunggu approval.', 'yellow');
            if (data.duplicateWarning) {
                this.showToast(data.duplicateWarning.message, 'yellow');
            }
        } else if (!data.success) {
            this.showToast(data.message || 'Publish gagal.', 'red');
        } else {
            this.showToast(`Publish selesai (${job.employeeName || 'AI'}).`, 'emerald');
            if (data.duplicateWarning) {
                this.showToast(data.duplicateWarning.message, 'yellow');
            }
        }
        await this.loadPostsFromServer();
        await this.renderOffice();
        this.renderAiJobs();
    } catch (e) {
        this.showToast('Gagal menjalankan job.', 'red');
    }
};

app.approveOfficeJob = async function () {
    const jobId = appState.office.selectedJobId;
    if (!jobId) return;
    try {
        const approve = await api.post(`/api/ai/jobs/${jobId}/approve`, { note: 'Disetujui dari UI Kantor AI' });
        if (!approve.success) {
            this.showToast(approve.message || 'Gagal approve.', 'red');
            return;
        }
        const job = approve.job || (appState.aiJobs || []).find(j => j.id === jobId);
        // Setelah approve, server memakai job.approvedAt — jangan kirim forcePublish anon
        const data = await api.post(`/api/ai/jobs/${jobId}/run`, {
            caption: job?.caption || job?.brief,
            platforms: job?.platforms || [],
            employeeName: job?.employeeName
        });
        if (!data.success && !data.awaitingApproval) {
            this.showToast(data.message || 'Publish setelah approve gagal.', 'red');
        } else if (data.awaitingApproval) {
            this.showToast(data.message || 'Masih terblokir (jeda darurat?).', 'yellow');
        } else {
            this.showToast('Disetujui & dipublish.', 'emerald');
        }
        await this.loadPostsFromServer();
        await this.renderOffice();
        this.renderAiJobs();
    } catch (e) {
        this.showToast('Gagal approve job.', 'red');
    }
};

app.renderChannelShareChart = function () {
    const canvas = document.getElementById('dashboard-channel-chart');
    if (!canvas) return;
    const counts = { instagram: 0, facebook: 0, tiktok: 0, youtube: 0 };
    appState.posts.forEach(p => p.platforms.forEach(pl => { if (counts[pl] !== undefined) counts[pl]++; }));
    if (appState.charts.channelShare) appState.charts.channelShare.destroy();
    appState.charts.channelShare = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Instagram', 'Facebook', 'TikTok', 'YouTube'],
            datasets: [{ data: [counts.instagram || 1, counts.facebook || 1, counts.tiktok || 1, counts.youtube || 1], backgroundColor: ['#e1306c', '#1877f2', '#0f172a', '#ff0000'], borderWidth: 2, borderColor: '#ffffff' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { family: 'Inter', size: 10 } } } }, cutout: '65%' }
    });
};

// Terbitkan sekarang via API server
app.postImmediately = async function (postId) {
    try {
        const data = await api.post(`/api/posts/${postId}/publish`, {});
        if (data.success) {
            await this.loadPostsFromServer();
            this.updateActiveAccountsCounter();
            this.showToast('✅ Postingan berhasil diterbitkan!', 'emerald');
            if (appState.currentView === 'dashboard') this.renderDashboard();
            else if (appState.currentView === 'queue') this.renderQueue();
        }
    } catch (e) {
        this.showToast('❌ Gagal menerbitkan postingan.', 'red');
    }
};

app.deletePost = async function (postId) {
    if (!confirm('Apakah Anda yakin ingin menghapus postingan ini?')) return;
    const data = await api.delete(`/api/posts/${postId}`);
    if (data.success) {
        await this.loadPostsFromServer();
        this.updateActiveAccountsCounter();
        this.showToast('🗑️ Postingan berhasil dihapus.', 'indigo');
        if (appState.currentView === 'dashboard') this.renderDashboard();
        else if (appState.currentView === 'queue') this.renderQueue();
    }
};

// ============================================================
// Composer
// ============================================================
app.setupComposerEvents = function () {
    const captionEl = document.getElementById('post-caption');
    const mediaZone = document.getElementById('media-uploader-zone');
    const mediaFileInput = document.getElementById('media-file-input');
    const submitBtn = document.getElementById('composer-submit-btn');
    const saveDraftBtn = document.getElementById('composer-save-draft-btn');

    captionEl.addEventListener('input', (e) => this.updateComposerPreviews(e.target.value));

    mediaZone.addEventListener('click', (e) => { if (!e.target.closest('#remove-media-btn')) mediaFileInput.click(); });
    mediaZone.addEventListener('dragover', (e) => { e.preventDefault(); mediaZone.classList.add('dragover'); });
    mediaZone.addEventListener('dragleave', () => mediaZone.classList.remove('dragover'));
    mediaZone.addEventListener('drop', (e) => {
        e.preventDefault();
        mediaZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) this.handleMediaUploadFile(e.dataTransfer.files[0]);
    });

    mediaFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) this.handleMediaUploadFile(e.target.files[0]);
    });

    document.getElementById('remove-media-btn').addEventListener('click', () => this.clearComposerMedia());

    document.querySelectorAll('input[name="publish-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.schedule-radio-card').forEach(c => c.classList.remove('active'));
            e.target.closest('.schedule-radio-card').classList.add('active');
            appState.composerPublishMode = e.target.value;
            const box = document.getElementById('scheduler-date-time-box');
            const submitText = document.getElementById('composer-submit-text');
            if (e.target.value === 'scheduled') {
                box.classList.remove('hidden');
                submitText.innerText = 'Jadwalkan Postingan';
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                document.getElementById('schedule-date').value = tomorrow.toISOString().split('T')[0];
                document.getElementById('schedule-time').value = '12:00';
            } else {
                box.classList.add('hidden');
                submitText.innerText = 'Kirim Sekarang';
            }
            this.validateComposerState();
        });
    });

    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const platform = tab.getAttribute('data-platform');
            document.querySelectorAll('.preview-wrapper').forEach(w => w.classList.remove('active'));
            document.getElementById(`preview-${platform}`).classList.add('active');
        });
    });

    submitBtn.addEventListener('click', () => this.submitComposerPost());
    saveDraftBtn.addEventListener('click', () => this.submitComposerPost('draft'));

    const cancelEditBtn = document.getElementById('composer-cancel-edit-btn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            this.resetComposerForm();
            this.switchView('queue');
        });
    }
};

app.resetComposerPlatforms = function () {
    if (!appState.editingPostId) {
        appState.composerSelectedPlatforms = [];
    }
    this.renderPlatformSelectors();
};

app.renderPlatformSelectors = function () {
    const grid = document.getElementById('composer-platform-selectors');
    grid.innerHTML = '';
    const connectedAccounts = appState.accounts.filter(a => a.connected);
    const warning = document.getElementById('platforms-warning-hint');
    const captionEl = document.getElementById('post-caption');

    if (connectedAccounts.length === 0) {
        warning.classList.remove('hidden');
        captionEl.disabled = true;
        return;
    }
    warning.classList.add('hidden');
    captionEl.disabled = false;

    connectedAccounts.forEach(acc => {
        const info = appState.platforms[acc.platform];
        if (!info) return;
        const card = document.createElement('div');
        card.className = 'platform-selector-card';
        if (appState.composerSelectedPlatforms.includes(acc.platform)) {
            card.classList.add('selected');
        }
        card.setAttribute('data-platform', acc.platform);
        card.innerHTML = `
            <div class="p-card-icon" style="background-color: var(--color-${acc.platform})"><i data-lucide="${info.icon}"></i></div>
            <div class="p-card-info text-center">
                <span class="p-card-name">${info.name}</span>
                <span class="p-card-handle">${acc.handle}</span>
            </div>`;
        card.addEventListener('click', () => {
            if (card.classList.contains('selected')) {
                card.classList.remove('selected');
                appState.composerSelectedPlatforms = appState.composerSelectedPlatforms.filter(p => p !== acc.platform);
            } else {
                card.classList.add('selected');
                appState.composerSelectedPlatforms.push(acc.platform);
            }
            this.validateComposerState();
            this.renderComposerPlatformLimits();
        });
        grid.appendChild(card);
    });
    this.renderComposerPlatformLimits();
    this.validateComposerState();
    lucide.createIcons();
};

app.renderComposerPlatformLimits = function () {
    const limitsBox = document.getElementById('composer-platform-limits');
    limitsBox.innerHTML = '';
    appState.composerSelectedPlatforms.forEach(p => {
        const info = appState.platforms[p];
        limitsBox.innerHTML += `<span class="limit-badge" id="limit-badge-${p}">${info.name}: maks ${info.defaultMaxChars} kar</span>`;
    });
};

app.handleMediaUploadFile = async function (file) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { alert('Format tidak didukung!'); return; }

    // Tampilkan preview lokal dulu
    const localUrl = URL.createObjectURL(file);
    appState.composerMedia = { type: isVideo ? 'video' : 'image', url: localUrl, file };

    const prompt = document.getElementById('uploader-prompt');
    const container = document.getElementById('uploader-preview-container');
    const imgEl = document.getElementById('uploader-img-preview');
    const videoEl = document.getElementById('uploader-video-preview');

    prompt.classList.add('hidden');
    container.classList.remove('hidden');
    if (isVideo) {
        imgEl.classList.add('hidden');
        videoEl.classList.remove('hidden');
        videoEl.src = localUrl;
    } else {
        videoEl.classList.add('hidden');
        imgEl.classList.remove('hidden');
        imgEl.src = localUrl;
    }

    this.updateMockupMedia(appState.composerMedia);

    // Upload file ke server di background
    try {
        this.showToast('⬆️ Mengunggah media ke server...', 'indigo');
        const result = await api.uploadFile(file);
        if (result.success) {
            appState.composerMedia.serverUrl = result.url;
            this.showToast('✅ Media berhasil diunggah.', 'emerald');
        } else {
            this.showToast('⚠️ Gagal mengunggah media ke server.', 'yellow');
        }
    } catch (e) {
        this.showToast('⚠️ Server tidak dapat dijangkau, media tersimpan lokal.', 'yellow');
    }

    this.validateComposerState();
};

app.clearComposerMedia = function () {
    appState.composerMedia = null;
    document.getElementById('uploader-prompt').classList.remove('hidden');
    document.getElementById('uploader-preview-container').classList.add('hidden');
    document.getElementById('uploader-img-preview').src = '';
    document.getElementById('uploader-video-preview').src = '';
    document.getElementById('media-file-input').value = '';
    this.updateMockupMedia(null);
    this.validateComposerState();
};

app.updateMockupMedia = function (mediaObj) {
    const elements = [
        { id: 'ig-preview-media', platform: 'instagram', emptyMarkup: `<div class="media-placeholder"><i data-lucide="image"></i><p>Area Pratinjau Media</p></div>`, previewClass: 'ig-preview-file' },
        { id: 'fb-preview-media', platform: 'facebook', emptyMarkup: `<div class="media-placeholder"><i data-lucide="image"></i><p>Area Pratinjau Media</p></div>`, previewClass: 'fb-preview-file' },
        { id: 'tt-preview-media', platform: 'tiktok', emptyMarkup: `<div class="tt-media-placeholder"><i data-lucide="video" style="width:48px;height:48px;margin-bottom:8px;"></i><p>Area Video TikTok</p></div>`, previewClass: 'tt-preview-file' },
        { id: 'yt-preview-media', platform: 'youtube', emptyMarkup: `<div class="yt-media-placeholder"><i data-lucide="youtube" style="width:48px;height:48px;margin-bottom:8px;color:#ff0000;"></i><p>Pratinjau Video YouTube</p></div>`, previewClass: 'yt-preview-file' }
    ];
    elements.forEach(item => {
        const container = document.getElementById(item.id);
        if (!container) return;
        if (!mediaObj) { container.innerHTML = item.emptyMarkup; return; }
        const url = mediaObj.url;
        if (mediaObj.type === 'video') {
            container.innerHTML = `<video src="${url}" class="${item.previewClass}" autoplay loop muted></video>`;
        } else if (item.platform === 'tiktok' || item.platform === 'youtube') {
            container.innerHTML = `<img src="${url}" class="${item.previewClass}" style="opacity:0.5;filter:blur(4px);">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;font-size:11px;font-weight:700;color:white;background:rgba(0,0,0,0.6);padding:8px;border-radius:6px;">Unggah video untuk platform ini.</div>`;
        } else {
            container.innerHTML = `<img src="${url}" class="${item.previewClass}" alt="Pratinjau">`;
        }
    });
    lucide.createIcons();
};

app.updateComposerPreviews = function (text) {
    const cleanText = text.trim();
    document.getElementById('composer-char-counter').innerText = `${cleanText.length} / 2200`;
    document.getElementById('ig-preview-text').innerText = cleanText || 'Keterangan postingan akan muncul di sini saat Anda mengetik di editor...';
    document.getElementById('fb-preview-text').innerText = cleanText || 'Konten dan teks postingan akan muncul di sini...';
    document.getElementById('tt-preview-text').innerText = cleanText || 'Tulis keterangan untuk melihat pratinjau TikTok...';
    document.getElementById('yt-preview-text').innerText = cleanText || 'Judul video YouTube ditampilkan di sini. #shorts #youtube';
    appState.composerSelectedPlatforms.forEach(p => {
        const info = appState.platforms[p];
        const badge = document.getElementById(`limit-badge-${p}`);
        if (badge) badge.classList.toggle('exceeded', cleanText.length > info.defaultMaxChars);
    });
    this.validateComposerState();
};

app.updatePreviewAccounts = function () {
    const defaultAvatar = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=256&auto=format&fit=crop';
    
    // 1. Instagram
    const igAcc = appState.accounts.find(a => a.platform === 'instagram' && a.connected);
    const igHandleEl = document.getElementById('ig-preview-handle');
    const igHandleBodyEl = document.getElementById('ig-preview-handle-body');
    const igAvatarEl = document.querySelector('.ig-avatar-placeholder img.preview-mockup-avatar');
    if (igAcc) {
        if (igHandleEl) igHandleEl.innerText = igAcc.handle || `@${igAcc.name}`;
        if (igHandleBodyEl) igHandleBodyEl.innerText = igAcc.handle || `@${igAcc.name}`;
        if (igAvatarEl) igAvatarEl.src = igAcc.avatar || defaultAvatar;
    } else {
        if (igHandleEl) igHandleEl.innerText = '@user_pikslab';
        if (igHandleBodyEl) igHandleBodyEl.innerText = '@user_pikslab';
        if (igAvatarEl) igAvatarEl.src = defaultAvatar;
    }

    // 2. Facebook
    const fbAcc = appState.accounts.find(a => a.platform === 'facebook' && a.connected);
    const fbNameEl = document.getElementById('fb-preview-name');
    const fbAvatarEl = document.querySelector('.fb-avatar img.preview-mockup-avatar');
    if (fbAcc) {
        if (fbNameEl) fbNameEl.innerText = fbAcc.name;
        if (fbAvatarEl) fbAvatarEl.src = fbAcc.avatar || defaultAvatar;
    } else {
        if (fbNameEl) fbNameEl.innerText = "Akun PiK's Digital Lab";
        if (fbAvatarEl) fbAvatarEl.src = defaultAvatar;
    }

    // 3. TikTok
    const ttAcc = appState.accounts.find(a => a.platform === 'tiktok' && a.connected);
    const ttHandleEl = document.getElementById('tt-preview-handle');
    const ttAvatarEl = document.querySelector('.tt-action-avatar img');
    if (ttAcc) {
        if (ttHandleEl) ttHandleEl.innerText = ttAcc.handle || `@${ttAcc.name}`;
        if (ttAvatarEl) ttAvatarEl.src = ttAcc.avatar || defaultAvatar;
    } else {
        if (ttHandleEl) ttHandleEl.innerText = '@kreator_pikslab';
        if (ttAvatarEl) ttAvatarEl.src = defaultAvatar;
    }

    // 4. YouTube
    const ytAcc = appState.accounts.find(a => a.platform === 'youtube' && a.connected);
    const ytHandleEl = document.getElementById('yt-preview-handle');
    const ytAvatarEl = document.querySelector('.yt-channel-avatar img');
    const ytSoundtrackEl = document.querySelector('.yt-music-box-preview img');
    if (ytAcc) {
        if (ytHandleEl) ytHandleEl.innerText = ytAcc.handle || `@${ytAcc.name}`;
        if (ytAvatarEl) ytAvatarEl.src = ytAcc.avatar || defaultAvatar;
        if (ytSoundtrackEl) ytSoundtrackEl.src = ytAcc.avatar || defaultAvatar;
    } else {
        if (ytHandleEl) ytHandleEl.innerText = '@PiksDigitalLabYT';
        if (ytAvatarEl) ytAvatarEl.src = defaultAvatar;
        if (ytSoundtrackEl) ytSoundtrackEl.src = defaultAvatar;
    }
};

app.validateComposerState = function () {
    const text = document.getElementById('post-caption').value.trim();
    const submitBtn = document.getElementById('composer-submit-btn');
    const saveDraftBtn = document.getElementById('composer-save-draft-btn');
    let isValid = true;
    if (appState.composerSelectedPlatforms.length === 0) isValid = false;
    if (text.length === 0 && !appState.composerMedia) isValid = false;
    appState.composerSelectedPlatforms.forEach(p => { if (text.length > appState.platforms[p].defaultMaxChars) isValid = false; });
    if (appState.composerSelectedPlatforms.includes('tiktok') && !appState.composerMedia) isValid = false;
    if (appState.composerSelectedPlatforms.includes('youtube') && !appState.composerMedia) isValid = false;
    if (appState.composerPublishMode === 'scheduled') {
        const dateVal = document.getElementById('schedule-date').value;
        const timeVal = document.getElementById('schedule-time').value;
        if (!dateVal || !timeVal || new Date(`${dateVal}T${timeVal}`) <= new Date()) isValid = false;
    }
    submitBtn.disabled = !isValid;
    saveDraftBtn.disabled = appState.composerSelectedPlatforms.length === 0;
};

app.submitComposerPost = async function (forceDraft) {
    const text = document.getElementById('post-caption').value;
    const submitBtn = document.getElementById('composer-submit-btn');
    const spinner = document.getElementById('composer-submit-spinner');

    let postStatus = forceDraft === 'draft' ? 'draft' : appState.composerPublishMode === 'scheduled' ? 'scheduled' : 'posted';
    let publishDate = new Date().toISOString();
    if (postStatus === 'scheduled') {
        const d = document.getElementById('schedule-date').value;
        const t = document.getElementById('schedule-time').value;
        publishDate = new Date(`${d}T${t}`).toISOString();
    }

    // Tentukan URL media yang digunakan (server URL jika tersedia, jika tidak base64 lokal)
    const mediaUrl = appState.composerMedia ? (appState.composerMedia.serverUrl || appState.composerMedia.url) : '';
    const mediaType = appState.composerMedia ? appState.composerMedia.type : '';

    submitBtn.disabled = true;
    if (postStatus === 'posted') spinner.classList.remove('hidden');

    try {
        let result;
        if (appState.editingPostId) {
            result = await api.put(`/api/posts/${appState.editingPostId}`, {
                caption: text,
                mediaUrl,
                mediaType,
                platforms: appState.composerSelectedPlatforms,
                status: postStatus,
                publishDate
            });
        } else {
            result = await api.post('/api/posts', {
                caption: text,
                mediaUrl,
                mediaType,
                platforms: appState.composerSelectedPlatforms,
                status: postStatus,
                publishDate
            });
        }

        spinner.classList.add('hidden');

        if (result.success) {
            // Reset form
            this.resetComposerForm();

            // Reload data
            await this.loadPostsFromServer();
            this.updateActiveAccountsCounter();

            let msg = '';
            if (appState.editingPostId) {
                msg = postStatus === 'posted' ? '✅ Postingan berhasil diubah dan diterbitkan!' : '📅 Perubahan jadwal berhasil disimpan.';
            } else {
                msg = postStatus === 'posted' ? '✅ Postingan berhasil dikirim ke semua jejaring sosial!' : '📅 Postingan berhasil dijadwalkan.';
            }

            appState.editingPostId = null;

            this.showToast(msg, postStatus === 'posted' ? 'emerald' : 'indigo');
            this.switchView(postStatus === 'scheduled' ? 'queue' : 'dashboard');
        } else {
            this.showToast('❌ Gagal menyimpan postingan: ' + (result.message || 'Error tidak diketahui.'), 'red');
            submitBtn.disabled = false;
        }
    } catch (e) {
        spinner.classList.add('hidden');
        this.showToast('❌ Tidak dapat terhubung ke server. Pastikan server berjalan.', 'red');
        submitBtn.disabled = false;
    }
};

app.resetComposerForm = function () {
    appState.editingPostId = null;

    const badge = document.getElementById('composer-status-badge');
    if (badge) {
        badge.innerText = 'Draf Baru';
        badge.className = 'badge badge-indigo';
    }

    const captionEl = document.getElementById('post-caption');
    if (captionEl) {
        captionEl.value = '';
    }

    this.clearComposerMedia();

    const radioNow = document.querySelector('input[name="publish-mode"][value="now"]');
    if (radioNow) {
        radioNow.checked = true;
        radioNow.closest('.schedule-radio-card').classList.add('active');
    }
    const radioScheduled = document.querySelector('input[name="publish-mode"][value="scheduled"]');
    if (radioScheduled) {
        radioScheduled.checked = false;
        radioScheduled.closest('.schedule-radio-card').classList.remove('active');
    }
    const box = document.getElementById('scheduler-date-time-box');
    if (box) box.classList.add('hidden');

    const submitText = document.getElementById('composer-submit-text');
    if (submitText) {
        submitText.innerText = 'Kirim Sekarang';
    }

    appState.composerSelectedPlatforms = [];
    this.renderPlatformSelectors();
    this.showCancelEditButton(false);
    this.updateComposerPreviews('');
};

app.showCancelEditButton = function (show) {
    const cancelBtn = document.getElementById('composer-cancel-edit-btn');
    const draftBtn = document.getElementById('composer-save-draft-btn');
    if (cancelBtn) {
        if (show) {
            cancelBtn.classList.remove('hidden');
            if (draftBtn) draftBtn.classList.add('hidden');
        } else {
            cancelBtn.classList.add('hidden');
            if (draftBtn) draftBtn.classList.remove('hidden');
        }
    }
};

app.editPost = function (postId) {
    const post = appState.posts.find(p => p.id === postId);
    if (!post) return;

    appState.editingPostId = post.id;
    this.closePostDetailsModal();
    this.switchView('composer');

    const badge = document.getElementById('composer-status-badge');
    if (badge) {
        badge.innerText = 'Edit Draf/Jadwal';
        badge.className = 'badge badge-yellow';
    }

    document.getElementById('post-caption').value = post.caption || '';

    appState.composerSelectedPlatforms = [...post.platforms];
    this.renderPlatformSelectors();

    if (post.mediaUrl) {
        appState.composerMedia = {
            type: post.mediaType,
            url: post.mediaUrl,
            serverUrl: post.mediaUrl
        };
        const prompt = document.getElementById('uploader-prompt');
        const container = document.getElementById('uploader-preview-container');
        const imgEl = document.getElementById('uploader-img-preview');
        const videoEl = document.getElementById('uploader-video-preview');

        prompt.classList.add('hidden');
        container.classList.remove('hidden');
        if (post.mediaType === 'video') {
            imgEl.classList.add('hidden');
            videoEl.classList.remove('hidden');
            videoEl.src = post.mediaUrl;
        } else {
            videoEl.classList.add('hidden');
            imgEl.classList.remove('hidden');
            imgEl.src = post.mediaUrl;
        }
        this.updateMockupMedia(appState.composerMedia);
    } else {
        this.clearComposerMedia();
    }

    appState.composerPublishMode = post.status === 'scheduled' ? 'scheduled' : 'now';

    const radioNow = document.querySelector('input[name="publish-mode"][value="now"]');
    const radioScheduled = document.querySelector('input[name="publish-mode"][value="scheduled"]');
    const box = document.getElementById('scheduler-date-time-box');
    const submitText = document.getElementById('composer-submit-text');

    if (post.status === 'scheduled') {
        if (radioScheduled) {
            radioScheduled.checked = true;
            radioScheduled.closest('.schedule-radio-card').classList.add('active');
        }
        if (radioNow) {
            radioNow.checked = false;
            radioNow.closest('.schedule-radio-card').classList.remove('active');
        }
        if (box) box.classList.remove('hidden');
        if (submitText) submitText.innerText = 'Simpan Jadwal';

        const dateObj = new Date(post.publishDate);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hour = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');

        document.getElementById('schedule-date').value = `${year}-${month}-${day}`;
        document.getElementById('schedule-time').value = `${hour}:${min}`;
    } else {
        if (radioNow) {
            radioNow.checked = true;
            radioNow.closest('.schedule-radio-card').classList.add('active');
        }
        if (radioScheduled) {
            radioScheduled.checked = false;
            radioScheduled.closest('.schedule-radio-card').classList.remove('active');
        }
        if (box) box.classList.add('hidden');
        if (submitText) submitText.innerText = 'Simpan Perubahan';
    }

    this.updateComposerPreviews(post.caption || '');
    this.validateComposerState();
    this.showCancelEditButton(true);
};

// ============================================================
// Akun Terhubung
// ============================================================
app.setupAccountsEvents = function () {
    const modal = document.getElementById('oauth-modal');
    document.getElementById('oauth-close-btn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('oauth-cancel-btn').addEventListener('click', () => modal.classList.add('hidden'));

    // Tombol Hubungkan Semua Instan (Sandbox)
    const quickBtn = document.getElementById('btn-quick-connect-all');
    if (quickBtn) {
        quickBtn.addEventListener('click', async () => {
            quickBtn.disabled = true;
            quickBtn.innerHTML = `<span class="btn-spinner"></span><span>Menghubungkan...</span>`;
            await new Promise(r => setTimeout(r, 800));
            window.location.href = '/api/auth/meta/callback?sandbox=1';
        });
    }

    // ---- Browser Login Modal Setup ----
    const blModal = document.getElementById('browser-login-modal');
    document.getElementById('browser-login-close-btn').addEventListener('click', () => blModal.classList.add('hidden'));
    document.getElementById('browser-login-cancel-btn').addEventListener('click', () => blModal.classList.add('hidden'));

    // Show/hide password toggle
    document.getElementById('browser-login-toggle-pass').addEventListener('click', function () {
        const passInput = document.getElementById('browser-login-password');
        const icon = this.querySelector('i');
        if (passInput.type === 'password') {
            passInput.type = 'text';
            icon.setAttribute('data-lucide', 'eye-off');
        } else {
            passInput.type = 'password';
            icon.setAttribute('data-lucide', 'eye');
        }
        lucide.createIcons();
    });

    // Submit browser login
    document.getElementById('browser-login-submit-btn').addEventListener('click', () => app.submitBrowserLogin());
};

app.openBrowserLoginModal = function (platform) {
    const modal = document.getElementById('browser-login-modal');
    // Pre-select platform
    const sel = document.getElementById('browser-login-platform');
    if (platform) sel.value = platform;
    // Reset form state
    document.getElementById('browser-login-username').value = '';
    document.getElementById('browser-login-password').value = '';
    document.getElementById('browser-login-status').classList.add('hidden');
    document.getElementById('browser-login-submit-btn').disabled = false;
    document.getElementById('browser-login-submit-text').innerText = 'Masuk Sekarang';
    modal.classList.remove('hidden');
    lucide.createIcons();
};

app.submitBrowserLogin = async function () {
    const platform = document.getElementById('browser-login-platform').value;
    const username = document.getElementById('browser-login-username').value.trim();
    const password = document.getElementById('browser-login-password').value;
    const statusBox = document.getElementById('browser-login-status');
    const statusText = document.getElementById('browser-login-status-text');
    const submitBtn = document.getElementById('browser-login-submit-btn');

    if (!username || !password) {
        this.showToast('⚠️ Isi username dan password terlebih dahulu.', 'yellow');
        return;
    }

    // Show loading state
    statusBox.classList.remove('hidden');
    statusText.innerText = `Memulai browser untuk ${platform}...`;
    submitBtn.disabled = true;
    document.getElementById('browser-login-submit-text').innerText = 'Sedang Login...';

    try {
        const result = await api.post('/api/auth/browser-login', { platform, username, password });
        if (result.success) {
            statusText.innerText = '✅ Login berhasil! Memuat ulang akun...';
            this.showToast(`✅ ${platform} berhasil login via browser!`, 'emerald');
            await new Promise(r => setTimeout(r, 1200));
            document.getElementById('browser-login-modal').classList.add('hidden');
            await this.loadAccountsFromServer();
            this.updateActiveAccountsCounter();
            this.renderAccounts();
        } else {
            statusText.innerText = `❌ ${result.message || 'Login gagal. Periksa kredensial.'}`;
            statusBox.style.background = 'rgba(239,68,68,0.08)';
            statusBox.style.borderColor = 'rgba(239,68,68,0.3)';
            submitBtn.disabled = false;
            document.getElementById('browser-login-submit-text').innerText = 'Coba Lagi';
            this.showToast(`❌ Login ${platform} gagal: ${result.message || 'periksa kredensial'}`, 'red');
        }
    } catch (e) {
        statusText.innerText = '❌ Tidak bisa terhubung ke server.';
        submitBtn.disabled = false;
        document.getElementById('browser-login-submit-text').innerText = 'Coba Lagi';
        this.showToast('❌ Server tidak merespons.', 'red');
    }
};

app.browserLogout = async function (platform) {
    if (!confirm(`Putuskan sesi browser untuk ${platform}? Anda harus login kembali sebelum posting.`)) return;
    try {
        const result = await api.delete(`/api/auth/browser-logout/${platform}`);
        if (result.success) {
            this.showToast(`Sesi browser ${platform} dihapus.`, 'indigo');
            await this.loadAccountsFromServer();
            this.updateActiveAccountsCounter();
            this.renderAccounts();
        }
    } catch (e) {
        this.showToast('Gagal menghapus sesi browser.', 'red');
    }
};

app.renderAccounts = function () {
    const grid = document.getElementById('accounts-status-grid');
    grid.innerHTML = '';

    Object.keys(appState.platforms).forEach(platformKey => {
        const platInfo = appState.platforms[platformKey];
        const acc = appState.accounts.find(a => a.platform === platformKey);
        const isConnected = acc && acc.connected;
        const isSandbox = acc && acc.sandbox;
        const card = document.createElement('div');
        card.className = 'account-status-card';

        let bodyHtml = '';
        if (isConnected) {
            bodyHtml = `
                <div class="account-card-body">
                    <img src="${acc.avatar || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=256&auto=format&fit=crop'}" class="account-body-avatar" alt="Avatar">
                    <div class="account-body-info">
                        <span class="account-profile-name">${acc.name}</span>
                        <span class="account-profile-handle">${acc.handle}</span>
                    </div>
                    <span class="badge ${isSandbox ? 'badge-yellow' : 'badge-emerald'}" style="margin-left:auto;flex-shrink:0;">
                        <span class="badge-dot"></span>${isSandbox ? 'Sandbox' : 'Asli ✓'}
                    </span>
                </div>`;
        } else {
            bodyHtml = `<div class="account-card-body" style="border-style:dashed;justify-content:center;opacity:0.5;"><span class="font-xs text-secondary">Belum Ada Akun Tertaut</span></div>`;
        }

        // Tentukan URL OAuth yang sesuai
        const oauthMap = { instagram: 'meta', facebook: 'meta', tiktok: 'tiktok', youtube: 'youtube' };
        const oauthPlatform = oauthMap[platformKey] || platformKey;
        const sandboxLabel = appState.serverMode === 'sandbox' ? ' (Sandbox)' : '';
        const isRealConnectable = appState.serverMode === 'real';

        card.innerHTML = `
            <div class="account-card-header">
                <div class="account-platform-identity">
                    <div class="account-platform-icon-circle" style="background-color:var(--color-${platformKey})">
                        <i data-lucide="${platInfo.icon}"></i>
                    </div>
                    <div class="account-name-details">
                        <span class="account-platform-title">${platInfo.name}</span>
                        <span class="font-xs text-secondary">${isConnected ? 'Siap digunakan' : (isRealConnectable ? 'Memerlukan otorisasi' : 'Mode Sandbox — masukkan API key untuk koneksi asli')}</span>
                    </div>
                </div>
            </div>
            ${bodyHtml}
            <div class="account-card-actions">
                ${isConnected
                    ? (() => {
                        const isBrowser = acc && acc.automationType === 'browser';
                        return isBrowser
                            ? `<button class="btn btn-secondary btn-sm" onclick="app.browserLogout('${platformKey}')"><i data-lucide="log-out"></i> Logout Browser</button>
                               <button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);" onclick="app.disconnectAccount('${platformKey}')">Hapus Akun</button>`
                            : `<button class="btn btn-secondary btn-sm" onclick="app.disconnectAccount('${platformKey}')">Putuskan Akun</button>`;
                      })()
                    : `<div style="display:flex;flex-direction:column;gap:8px;width:100%;">
                           <button class="btn btn-primary btn-sm" onclick="app.openBrowserLoginModal('${platformKey}')" style="width:100%;justify-content:center;">
                               <i data-lucide="monitor" style="width:14px;height:14px;"></i> Login via Browser
                           </button>
                           <button class="btn btn-secondary btn-sm" onclick="window.location.href='/api/auth/${oauthPlatform}'" style="width:100%;justify-content:center;font-size:0.75rem;opacity:0.7;">
                               <i data-lucide="zap" style="width:14px;height:14px;"></i> Coba OAuth${sandboxLabel}
                           </button>
                       </div>`
                }
            </div>`;
        grid.appendChild(card);
    });

    // Tampilkan banner mode server
    this.renderServerModeBanner();
    lucide.createIcons();
};

app.renderServerModeBanner = function () {
    let banner = document.getElementById('server-mode-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'server-mode-banner';
        const grid = document.getElementById('accounts-status-grid');
        if (grid) grid.parentNode.insertBefore(banner, grid);
    }

    if (appState.serverMode === 'sandbox') {
        banner.className = 'card';
        banner.style.cssText = 'background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.3);padding:16px 20px;margin-bottom:20px;display:flex;align-items:flex-start;gap:12px;';
        banner.innerHTML = `
            <i data-lucide="info" style="width:20px;height:20px;color:#f59e0b;flex-shrink:0;margin-top:2px;"></i>
            <div>
                <p style="font-weight:700;color:#b45309;font-size:0.9375rem;">Mode Sandbox Aktif</p>
                <p class="text-secondary font-sm" style="margin-top:4px;">Untuk menghubungkan akun asli: <br>
                1. Salin file <code style="background:rgba(15,23,42,0.06);padding:2px 6px;border-radius:4px;">.env.example</code> menjadi <code style="background:rgba(15,23,42,0.06);padding:2px 6px;border-radius:4px;">.env</code><br>
                2. Isi dengan Client ID & Secret dari <a href="https://developers.facebook.com" target="_blank" style="color:#4f46e5;text-decoration:underline;">Meta Developer</a>, <a href="https://console.cloud.google.com" target="_blank" style="color:#4f46e5;text-decoration:underline;">Google Cloud</a>, dan <a href="https://developers.tiktok.com" target="_blank" style="color:#4f46e5;text-decoration:underline;">TikTok Developer</a><br>
                3. Restart server: <code style="background:rgba(15,23,42,0.06);padding:2px 6px;border-radius:4px;">node server.js</code></p>
            </div>`;
    } else {
        banner.className = 'card';
        banner.style.cssText = 'background:rgba(5,150,105,0.08);border-color:rgba(5,150,105,0.3);padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;';
        banner.innerHTML = `<i data-lucide="shield-check" style="width:20px;height:20px;color:#059669;"></i><p style="font-weight:700;color:#047857;">Mode Real Aktif — Koneksi OAuth asli tersedia.</p>`;
    }
    lucide.createIcons();
};

app.disconnectAccount = async function (platform) {
    if (!confirm(`Memutuskan akun ${platform} akan menghentikan posting otomatis. Lanjutkan?`)) return;
    const result = await api.delete(`/api/accounts/${platform}`);
    if (result.success) {
        await this.loadAccountsFromServer();
        this.updateActiveAccountsCounter();
        this.renderAccounts();
        this.showToast(`Akun ${platform} berhasil diputuskan.`, 'indigo');
    }
};

// ============================================================
// Jadwal & Kalender
// ============================================================
app.setupQueueEvents = function () {
    const listBtn = document.getElementById('queue-toggle-list');
    const calBtn = document.getElementById('queue-toggle-calendar');
    const listView = document.getElementById('queue-list-view');
    const calView = document.getElementById('calendar-grid-view');

    listBtn.addEventListener('click', () => { listBtn.classList.add('active'); calBtn.classList.remove('active'); listView.classList.remove('hidden'); calView.classList.add('hidden'); });
    calBtn.addEventListener('click', () => { calBtn.classList.add('active'); listBtn.classList.remove('active'); calView.classList.remove('hidden'); listView.classList.add('hidden'); this.renderCalendar(); });

    document.getElementById('queue-filter-platform').addEventListener('change', () => this.renderQueue());
    document.getElementById('queue-filter-status').addEventListener('change', () => this.renderQueue());
    document.getElementById('calendar-prev-month').addEventListener('click', () => { appState.calendarDate.setMonth(appState.calendarDate.getMonth() - 1); this.renderCalendar(); });
    document.getElementById('calendar-next-month').addEventListener('click', () => { appState.calendarDate.setMonth(appState.calendarDate.getMonth() + 1); this.renderCalendar(); });
};

app.renderQueue = function () {
    const listContainer = document.getElementById('queue-timeline-list');
    listContainer.innerHTML = '';
    const filterPlatform = document.getElementById('queue-filter-platform').value;
    const filterStatus = document.getElementById('queue-filter-status').value;
    let posts = [...appState.posts];
    if (filterPlatform !== 'all') posts = posts.filter(p => p.platforms.includes(filterPlatform));
    if (filterStatus !== 'all') posts = posts.filter(p => p.status === filterStatus);
    posts.sort((a, b) => new Date(a.publishDate) - new Date(b.publishDate));

    if (posts.length === 0) {
        listContainer.innerHTML = `<div class="empty-state"><i data-lucide="archive"></i><h3>Postingan tidak ditemukan</h3><p>Tidak ada konten yang sesuai filter.</p><button class="btn btn-primary" onclick="app.switchView('composer')">Buat Postingan Baru</button></div>`;
        lucide.createIcons();
        return;
    }

    const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const groups = {};
    posts.forEach(post => {
        const d = new Date(post.publishDate);
        const label = `${indonesianDays[d.getDay()]}, ${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
        if (!groups[label]) groups[label] = [];
        groups[label].push(post);
    });

    Object.keys(groups).forEach(dayLabel => {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'timeline-group';
        groupWrapper.innerHTML = `<div class="timeline-date-label">${dayLabel}</div>`;
        const postsContainer = document.createElement('div');
        postsContainer.className = 'timeline-posts';

        groups[dayLabel].forEach(post => {
            const timeVal = new Date(post.publishDate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const platformsHtml = post.platforms.map(p => {
                const info = appState.platforms[p];
                return info ? `<div class="platform-pill ${info.colorClass}" title="${info.name}"><i data-lucide="${info.icon}"></i></div>` : '';
            }).join('');
            const statusBadge = post.status === 'scheduled' ? '<span class="badge badge-yellow"><span class="badge-dot"></span>Terjadwal</span>'
                : post.status === 'posted' ? '<span class="badge badge-emerald"><span class="badge-dot"></span>Diterbitkan</span>'
                : post.status === 'failed' ? '<span class="badge badge-red"><span class="badge-dot"></span>Gagal</span>'
                : '<span class="badge badge-indigo"><span class="badge-dot"></span>Draf</span>';
            let mediaHtml = '<i data-lucide="image"></i>';
            if (post.mediaUrl) mediaHtml = post.mediaType === 'video' ? `<i data-lucide="video" style="color:var(--indigo);"></i>` : `<img src="${post.mediaUrl}" alt="Thumb" class="post-media-thumbnail">`;

            postsContainer.innerHTML += `
                <div class="timeline-post-card">
                    <div class="post-media-thumbnail">${mediaHtml}</div>
                    <div class="post-info-box">
                        <span class="post-caption-snippet">${post.caption || 'Tanpa Keterangan teks.'}</span>
                        <div class="post-meta-details">
                            <span class="post-time-meta"><i data-lucide="clock"></i>${timeVal} WIB</span>
                            <div class="cell-platforms-list">${platformsHtml}</div>
                            <div class="post-status-meta">${statusBadge}</div>
                        </div>
                    </div>
                    <div class="timeline-post-actions">
                        ${post.status !== 'posted' ? `<button class="btn btn-secondary btn-sm" onclick="app.editPost('${post.id}')" title="Edit"><i data-lucide="edit" style="width:12px;height:12px;"></i></button>` : ''}
                        ${post.status === 'scheduled' || post.status === 'draft' ? `<button class="btn btn-secondary btn-sm" onclick="app.postImmediately('${post.id}')" title="Terbitkan Sekarang"><i data-lucide="send" style="width:12px;height:12px;"></i></button>` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="app.openPostDetailsModal('${post.id}')"><i data-lucide="sliders" style="width:12px;height:12px;"></i></button>
                        <button class="btn btn-secondary btn-sm" onclick="app.deletePost('${post.id}')"><i data-lucide="trash-2" style="width:12px;height:12px;color:var(--red);"></i></button>
                    </div>
                </div>`;
        });
        groupWrapper.appendChild(postsContainer);
        listContainer.appendChild(groupWrapper);
    });
    lucide.createIcons();
};

app.renderCalendar = function () {
    const daysGrid = document.getElementById('calendar-days-grid');
    daysGrid.innerHTML = '';
    const curDate = appState.calendarDate;
    const year = curDate.getFullYear();
    const month = curDate.getMonth();
    const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    document.getElementById('calendar-current-month-year').innerText = `${indonesianMonths[month]} ${year}`;
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLastDay = new Date(year, month, 0).getDate();
    const today = new Date();

    for (let x = firstDayIndex; x > 0; x--) {
        const d = document.createElement('div');
        d.className = 'calendar-day-node other-month';
        d.innerHTML = `<span class="day-number">${prevLastDay - x + 1}</span>`;
        daysGrid.appendChild(d);
    }

    for (let i = 1; i <= lastDay; i++) {
        const isToday = today.getDate() === i && today.getMonth() === month && today.getFullYear() === year;
        const dayDiv = document.createElement('div');
        dayDiv.className = `calendar-day-node ${isToday ? 'today' : ''}`;
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const scheduled = appState.posts.filter(p => p.publishDate.split('T')[0] === dateKey && p.status === 'scheduled');
        let badgesHtml = '';
        scheduled.forEach(post => {
            post.platforms.forEach(plat => {
                const info = appState.platforms[plat];
                if (info) badgesHtml += `<div class="calendar-post-badge cal-badge-${plat}" onclick="event.stopPropagation();app.openPostDetailsModal('${post.id}')" title="${post.caption}"><i data-lucide="${info.icon}" style="width:8px;height:8px;"></i><span>${(post.caption || '').substring(0, 10)}...</span></div>`;
            });
        });
        dayDiv.innerHTML = `<span class="day-number">${i}</span><div class="calendar-day-posts-list">${badgesHtml}</div>`;
        dayDiv.addEventListener('click', () => {
            this.switchView('composer');
            const dateInput = document.getElementById('schedule-date');
            const radioScheduled = document.querySelector('input[name="publish-mode"][value="scheduled"]');
            if (dateInput && radioScheduled) { radioScheduled.click(); dateInput.value = dateKey; }
        });
        daysGrid.appendChild(dayDiv);
    }

    const remaining = 42 - firstDayIndex - lastDay;
    for (let j = 1; j <= remaining; j++) {
        const d = document.createElement('div');
        d.className = 'calendar-day-node other-month';
        d.innerHTML = `<span class="day-number">${j}</span>`;
        daysGrid.appendChild(d);
    }
    lucide.createIcons();
};

app.openPostDetailsModal = function (postId) {
    const post = appState.posts.find(p => p.id === postId);
    if (!post) return;
    const overlay = document.getElementById('post-details-modal');
    const body = document.getElementById('post-details-modal-body');
    const footer = document.getElementById('post-details-modal-footer');
    const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const pDate = new Date(post.publishDate);
    const dateStr = `${pDate.getDate()} ${indonesianMonths[pDate.getMonth()]} ${pDate.getFullYear()}`;
    const timeStr = pDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const platformsHtml = post.platforms.map(p => { const info = appState.platforms[p]; return info ? `<div class="platform-pill ${info.colorClass}"><i data-lucide="${info.icon}"></i></div>` : ''; }).join('');
    const statusMap = { scheduled: 'Dijadwalkan', posted: 'Diterbitkan', draft: 'Draf', failed: 'Gagal' };
    let mediaHtml = '';
    if (post.mediaUrl) {
        mediaHtml = post.mediaType === 'video'
            ? `<div class="details-media-box"><video src="${post.mediaUrl}" controls></video></div>`
            : `<div class="details-media-box"><img src="${post.mediaUrl}" alt="Media post"></div>`;
    }

    // Tampilkan hasil publikasi per platform jika ada
    let resultsHtml = '';
    if (post.publishResults && Object.keys(post.publishResults).length > 0) {
        resultsHtml = `<div style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:4px;">
            <p class="font-xs text-secondary" style="margin-bottom:8px;">Hasil Publikasi:</p>
            ${Object.entries(post.publishResults).map(([plat, res]) => `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="text-transform:capitalize;font-size:0.8125rem;font-weight:600;">${plat}</span>
                    <span class="badge ${res.status === 'success' ? 'badge-emerald' : 'badge-red'}">${res.status === 'success' ? '✓ Sukses' : '✗ ' + (res.message || 'Gagal')}</span>
                    ${res.postId ? `<span class="font-xs text-muted">ID: ${res.postId}</span>` : ''}
                </div>`).join('')}
        </div>`;
    }

    body.innerHTML = `<div class="post-details-view">${mediaHtml}<div class="details-caption">${post.caption || '<em>Tanpa keterangan.</em>'}</div>
        <div class="details-meta-row">
            <div class="details-meta-item"><span class="details-meta-label">Tanggal Rilis</span><span class="details-meta-value">${dateStr}</span></div>
            <div class="details-meta-item"><span class="details-meta-label">Jam Rilis</span><span class="details-meta-value">${timeStr} WIB</span></div>
        </div>
        <div class="details-meta-row">
            <div class="details-meta-item"><span class="details-meta-label">Sasaran Publikasi</span><div class="details-platforms-row mt-2">${platformsHtml}</div></div>
            <div class="details-meta-item"><span class="details-meta-label">Status</span><span class="details-meta-value">${statusMap[post.status] || post.status}</span></div>
        </div>
        ${resultsHtml}
    </div>`;

    footer.innerHTML = `
        <button class="btn btn-secondary" onclick="app.closePostDetailsModal()">Tutup</button>
        ${post.status !== 'posted' ? `
            <button class="btn btn-secondary" onclick="app.editPost('${post.id}')">
                <i data-lucide="edit" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                <span>Ubah</span>
            </button>
            <button class="btn btn-primary" onclick="app.postImmediately('${post.id}');app.closePostDetailsModal()">Terbitkan Sekarang</button>
        ` : ''}`;

    overlay.classList.remove('hidden');
    lucide.createIcons();
};

app.closePostDetailsModal = function () { document.getElementById('post-details-modal').classList.add('hidden'); };

app.setupModals = function () {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    });
    document.getElementById('post-details-close-btn').addEventListener('click', () => this.closePostDetailsModal());
};

// ============================================================
// Analisis Konten
// ============================================================
app.renderAnalytics = function () {
    const tbody = document.getElementById('analytics-posts-tbody');
    tbody.innerHTML = '';
    const publishedPosts = appState.posts.filter(p => p.status === 'posted').sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const indonesianMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    if (publishedPosts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary" style="padding:32px;">Belum ada postingan yang diterbitkan. Kirim konten untuk melihat analitik.</td></tr>`;
    } else {
        publishedPosts.forEach(post => {
            const d = new Date(post.publishDate);
            const dateStr = `${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
            const platformPills = post.platforms.map(p => { const info = appState.platforms[p]; return info ? `<div class="platform-pill ${info.colorClass}" style="width:24px;height:24px;" title="${info.name}"><i data-lucide="${info.icon}" style="width:12px;height:12px;"></i></div>` : ''; }).join('');
            const thumbHtml = post.mediaUrl ? (post.mediaType === 'video' ? `<i data-lucide="video" style="color:var(--indigo);"></i>` : `<img src="${post.mediaUrl}" alt="Thumb" class="cell-thumbnail">`) : '<i data-lucide="image"></i>';
            tbody.innerHTML += `
                <tr>
                    <td><div class="analytics-post-cell"><div class="cell-thumbnail">${thumbHtml}</div><div><div class="cell-caption">${post.caption || 'Tanpa Keterangan'}</div><span class="font-xs text-muted">${dateStr} WIB</span></div></div></td>
                    <td><div class="cell-platforms-list">${platformPills}</div></td>
                    <td><span class="badge badge-emerald"><span class="badge-dot"></span>Diterbitkan</span></td>
                    <td class="font-bold">${post.stats ? post.stats.reach.toLocaleString('id-ID') : '0'}</td>
                    <td class="text-indigo font-bold">${post.stats ? post.stats.engagement.toLocaleString('id-ID') : '0'}</td>
                    <td>${post.stats ? post.stats.clicks.toLocaleString('id-ID') : '0'}</td>
                </tr>`;
        });
    }
    this.renderAnalyticsCharts();
    lucide.createIcons();
};

app.renderAnalyticsCharts = function () {
    const reachCtx = document.getElementById('analytics-reach-chart');
    if (reachCtx) {
        if (appState.charts.analyticsReach) appState.charts.analyticsReach.destroy();
        appState.charts.analyticsReach = new Chart(reachCtx, {
            type: 'line',
            data: {
                labels: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
                datasets: [
                    { label: 'Jangkauan Instagram', data: [12000, 19000, 15000, 25000, 22000, 30000, 34000], borderColor: '#e1306c', backgroundColor: 'rgba(225,48,108,0.05)', tension: 0.35, fill: true },
                    { label: 'Jangkauan Facebook', data: [22000, 24000, 27000, 21000, 29000, 38000, 42000], borderColor: '#1877f2', backgroundColor: 'rgba(24,119,242,0.05)', tension: 0.35, fill: true },
                    { label: 'Tayangan TikTok', data: [5000, 12000, 28000, 31000, 42000, 56000, 68000], borderColor: '#0f172a', backgroundColor: 'rgba(15,23,42,0.04)', tension: 0.35, fill: true }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#64748b', font: { family: 'Inter', size: 11 } } } }, scales: { x: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#94a3b8' } }, y: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#94a3b8' } } } }
        });
    }
    const healthCtx = document.getElementById('analytics-health-chart');
    if (healthCtx) {
        if (appState.charts.analyticsHealth) appState.charts.analyticsHealth.destroy();
        appState.charts.analyticsHealth = new Chart(healthCtx, {
            type: 'doughnut',
            data: { labels: ['Berhasil', 'Tertunda / Draf', 'Gagal'], datasets: [{ data: [98, 5, 1], backgroundColor: ['#059669', '#4f46e5', '#dc2626'], borderWidth: 2, borderColor: '#ffffff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { family: 'Inter', size: 10 } } } }, cutout: '70%' }
        });
    }
};

// ============================================================
// Inisialisasi saat DOM siap
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
