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
        standup: null,
        knownSkills: [],
        platforms: ['instagram', 'facebook', 'tiktok', 'youtube'],
        activityLive: [],
        auditEntries: [],
        chatMessages: []
    },
    mission: {
        panelOpen: true,
        workingPanelOpen: true,
        workboardOpen: false,
        tab: 'crew',
        syncedAt: null,
        calendarDate: new Date(),
        calendarSelectedDate: null
    },
    serverMode: 'sandbox',  // 'sandbox' | 'real'
    authStatus: null,
    user: null,
    currentView: 'mission',
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

        // Atur jam (24 jam)
        this.updateClock();
        setInterval(() => this.updateClock(), 60000);
        // Poll Kantor AI tiap 20 dtk agar jadwal "jam HH:mm" terpicu
        setInterval(async () => {
            if (appState.currentView !== 'mission') return;
            try {
                await this.loadOfficeFromServer();
                this.renderOfficeEmployees();
                this.renderOfficeBoard();
                if (typeof this.renderMissionCrew === 'function') this.renderMissionCrew();
                if (appState.mission.tab === 'calendar' && typeof this.renderMissionCalendar === 'function') {
                    await this.loadPostsFromServer();
                    this.renderMissionCalendar();
                }
                if (typeof this.updateMissionPills === 'function') this.updateMissionPills();
                this.syncOffice3DEmployees();
                this.updateMissionSynced();
            } catch {
                /* ignore */
            }
        }, 20000);

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
        this.setupLayoutEditorEvents();
        this.setupMissionEvents();

        // Periksa jika ada callback OAuth dari server di URL
        this.handleOAuthCallback();

        // Render pertama — Mission Control sebagai halaman depan
        const hashView = (location.hash || '').replace(/^#/, '').trim();
        const allowed = ['mission', 'dashboard', 'composer', 'queue', 'office', 'accounts', 'analytics', 'settings', 'layout', 'about'];
        this.switchView(allowed.includes(hashView) ? hashView : 'mission');
        lucide.createIcons();
    },

    // Auth UI → js/auth-ui.js (P3 modularize); fallback jika skrip gagal dimuat (mis. deploy tanpa js/**)
    setupLoginGate() {
        if (typeof PiksAuthUI !== 'undefined') return PiksAuthUI.setupLoginGate(this);
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
        document.body.classList.remove('is-mission-mode');
        document.body.classList.add('is-login-mode');
        const missionEl = document.getElementById('view-mission');
        if (missionEl) missionEl.classList.add('hidden');
        const topbar = document.getElementById('app-shell-topbar');
        if (topbar) topbar.classList.add('hidden');
        if (typeof PiksAuthUI !== 'undefined') return PiksAuthUI.showLoginGate(this, message);
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
        if (typeof PiksAuthUI !== 'undefined') return PiksAuthUI.updateLoginBootstrapHint(status);
    },
    hideLoginGate() {
        if (typeof PiksAuthUI !== 'undefined') return PiksAuthUI.hideLoginGate();
        document.body.classList.remove('is-login-mode');
        const gate = document.getElementById('app-login-gate');
        const appRoot = document.querySelector('.app-container');
        const topbar = document.getElementById('app-shell-topbar');
        if (gate) gate.classList.add('hidden');
        if (appRoot) appRoot.classList.remove('hidden');
        if (topbar) topbar.classList.remove('hidden');
    },
    updateUserBadge() {
        if (typeof PiksAuthUI !== 'undefined') return PiksAuthUI.updateUserBadge();
        const el = document.getElementById('app-user-badge');
        if (!el || !appState.user) return;
        el.textContent = `${appState.user.email} · ${appState.user.role || 'editor'}`;
        el.classList.remove('hidden');
    },
    async submitLogin() {
        if (typeof PiksAuthUI !== 'undefined') return PiksAuthUI.submitLogin(this);
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

    /** Jam 24 jam (tanpa AM/PM). */
    _formatTime24(date, withSeconds) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
        if (withSeconds) opts.second = '2-digit';
        return d.toLocaleTimeString('id-ID', opts).replace(/\./g, ':');
    },

    _formatDateTime24(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        const day = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        return `${day}, ${this._formatTime24(d, false)}`;
    },

    updateClock() {
        const timeDisplay = document.getElementById('header-time');
        if (timeDisplay) {
            const now = new Date();
            const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            const dayName = indonesianDays[now.getDay()];
            timeDisplay.innerText = `${dayName}, ${this._formatTime24(now)}`;
        }
    },

    // --- Pengalih View ---
    switchView(viewName) {
        appState.currentView = viewName;
        const isMission = viewName === 'mission';
        const missionEl = document.getElementById('view-mission');
        document.body.classList.toggle('is-mission-mode', isMission);
        if (missionEl) missionEl.classList.toggle('hidden', !isMission);

        document.querySelectorAll('.sidebar-menu li').forEach(li => {
            li.classList.toggle('active', li.getAttribute('data-view') === viewName);
        });
        document.querySelectorAll('.view-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `view-${viewName}`);
        });

        document.querySelectorAll('[data-mission-nav]').forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute('data-mission-nav') === viewName);
        });

        const sectionLabel = document.getElementById('app-shell-section-label');
        if (sectionLabel) {
            const labels = {
                mission: 'OFFICE',
                dashboard: 'DASBOR',
                composer: 'COMPOSER',
                queue: 'JADWAL',
                office: 'WORK BOARD',
                accounts: 'AKUN',
                analytics: 'ANALISIS',
                settings: 'PENGATURAN',
                layout: 'LAYOUT KANTOR',
                about: 'TENTANG'
            };
            sectionLabel.textContent = labels[viewName] || 'APP';
        }

        // Jika keluar dari view composer, hapus status edit
        if (viewName !== 'composer') {
            appState.editingPostId = null;
            this.showCancelEditButton(false);
        }

        // Scene 3D hanya di Mission Control; tutup drawer saat ganti view
        this.closeMissionNavMenu();
        if (!isMission) {
            this.teardownOffice3D();
        }

        if (location.hash.replace(/^#/, '') !== viewName) {
            try {
                history.replaceState(null, '', `#${viewName}`);
            } catch (_) { /* ignore */ }
        }

        const titles = {
            mission: { title: 'Ruang / Office', subtitle: "Mission Control — Tim Konten AI PiK's Digital Lab." },
            dashboard: { title: 'Dasbor Utama', subtitle: 'Ikhtisar saluran terhubung dan antrean postingan terjadwal Anda.' },
            composer: { title: 'Buat Postingan Baru', subtitle: 'Tulis, unggah media, dan kirim postingan secara bersamaan ke berbagai sosmed.' },
            queue: { title: 'Jadwal & Kalender', subtitle: 'Atur kalender konten Anda di masa mendatang secara presisi.' },
            office: { title: 'Kantor AI', subtitle: 'Ruang kerja karyawan AI — brief cepat, brand memory, detail job, approval, dan insight apa berikutnya.' },
            accounts: { title: 'Akun Terhubung', subtitle: 'Tautkan profil, halaman, dan channel sosial media Anda.' },
            analytics: { title: 'Analisis Konten', subtitle: 'Analisis jangkauan, impresi, interaksi, dan rasio keberhasilan postingan.' },
            settings: { title: 'Pengaturan', subtitle: 'Otonomi & pengamanan karyawan AI — tingkat otonomi, notifikasi, izin platform per peran, dan LLM / Chat CEO.' },
            layout: { title: 'Layout Kantor', subtitle: 'Atur denah kantor 3D — tinggi dinding, ukuran gedung, meja agen, dan tata letak mebel.' },
            about: { title: 'Tentang Aplikasi', subtitle: "Profil PiK's Digital Lab, fitur, dan kemampuan masing-masing agen Tim Konten AI." }
        };

        const titleEl = document.getElementById('view-title');
        const subtitleEl = document.getElementById('view-subtitle');
        if (viewName === 'composer' && appState.editingPostId) {
            if (titleEl) titleEl.innerText = 'Edit Postingan';
            if (subtitleEl) subtitleEl.innerText = 'Ubah detail, ganti jadwal, atau ubah saluran tujuan untuk postingan ini.';
        } else if (titles[viewName]) {
            if (titleEl) titleEl.innerText = titles[viewName].title;
            if (subtitleEl) subtitleEl.innerText = titles[viewName].subtitle;
        }

        // Render konten per view
        if (viewName === 'mission') this.renderMission();
        else if (viewName === 'dashboard') this.renderDashboard();
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
        else if (viewName === 'settings') this.renderSettings();
        else if (viewName === 'layout') this.renderLayoutEditor();

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
        const goComposer = () => {
            appState.editingPostId = null;
            this.switchView('composer');
        };
        const headerCreate = document.getElementById('header-create-post-btn');
        if (headerCreate) headerCreate.addEventListener('click', goComposer);
        const shellCreate = document.getElementById('app-shell-create-post-btn');
        if (shellCreate) shellCreate.addEventListener('click', goComposer);
        const queueBtn = document.getElementById('dashboard-view-queue-btn');
        if (queueBtn) queueBtn.addEventListener('click', () => this.switchView('queue'));
        const settingsBtn = document.getElementById('open-settings-btn');
        if (settingsBtn) settingsBtn.addEventListener('click', () => this.switchView('settings'));
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
            const timeStr = this._formatTime24(dateObj);
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
    const chatForm = document.getElementById('ceo-chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.sendCeoChat();
        });
    }
    const chatClear = document.getElementById('ceo-chat-clear');
    if (chatClear) {
        chatClear.addEventListener('click', async () => {
            try {
                await api.delete('/api/ai/chat');
                appState.office.chatMessages = [];
                this.renderCeoChatMessages([]);
                this.showToast('Riwayat chat dihapus.', 'emerald');
            } catch (_) {
                this.showToast('Gagal hapus chat.', 'red');
            }
        });
    }
    const llmProv = document.getElementById('office-llm-provider');
    if (llmProv) {
        llmProv.addEventListener('change', () => {
            this._applyLlmProviderDefaults(llmProv.value, true);
        });
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
            : true;
        toggle3d.checked = !!prefOn;
        toggle3d.addEventListener('change', () => {
            this.applyMission3DMode(toggle3d.checked);
        });
    }
};

// ============================================================
// Mission Control (halaman depan)
// ============================================================
app.setupMissionEvents = function () {
    const menuBtn = document.getElementById('mission-menu-btn');
    const navMenu = document.getElementById('mission-nav-menu');
    if (menuBtn && navMenu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = navMenu.classList.toggle('hidden') === false;
            menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.addEventListener('click', (e) => {
            if (!navMenu.classList.contains('hidden') && !navMenu.contains(e.target) && e.target !== menuBtn) {
                this.closeMissionNavMenu();
            }
        });
    }
    document.querySelectorAll('[data-mission-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-mission-nav');
            this.closeMissionNavMenu();
            if (view) this.switchView(view);
        });
    });
    const logoutBtn = document.getElementById('mission-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await api.post('/api/auth/logout', {});
            appState.user = null;
            this.teardownOffice3D();
            this.showLoginGate('Anda telah keluar.');
        });
    }
    const refreshBtn = document.getElementById('mission-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.renderMission());
    }
    const tasksBtn = document.getElementById('mission-tasks-btn');
    if (tasksBtn) {
        tasksBtn.addEventListener('click', () => this.setMissionWorkboardOpen(!appState.mission.workboardOpen));
    }
    const workboardToggle = document.getElementById('mission-workboard-toggle');
    if (workboardToggle) {
        workboardToggle.addEventListener('click', () => this.setMissionWorkboardOpen(!appState.mission.workboardOpen));
    }
    const standupBtn = document.getElementById('mission-standup-btn');
    if (standupBtn) standupBtn.addEventListener('click', () => this.startStandup());
    const cleanupBtn = document.getElementById('mission-cleanup-btn');
    if (cleanupBtn) cleanupBtn.addEventListener('click', () => this.cleanupOfficeJobs());
    const standupAdvance = document.getElementById('mission-standup-advance');
    if (standupAdvance) standupAdvance.addEventListener('click', () => this.advanceStandup());
    const standupFinish = document.getElementById('mission-standup-finish');
    if (standupFinish) standupFinish.addEventListener('click', () => this.finishStandup());
    this.loadStandup();
    this.setMissionWorkboardOpen(this.loadMissionWorkboardPref(), false);
    const calendarBtn = document.getElementById('mission-calendar-btn');
    if (calendarBtn) {
        calendarBtn.addEventListener('click', () => this.toggleMissionCalendarPanel());
    }
    const missionCalPrev = document.getElementById('mission-calendar-prev-month');
    if (missionCalPrev) {
        missionCalPrev.addEventListener('click', () => {
            const d = appState.mission.calendarDate instanceof Date ? appState.mission.calendarDate : new Date();
            appState.mission.calendarDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
            this.renderMissionCalendar();
        });
    }
    const missionCalNext = document.getElementById('mission-calendar-next-month');
    if (missionCalNext) {
        missionCalNext.addEventListener('click', () => {
            const d = appState.mission.calendarDate instanceof Date ? appState.mission.calendarDate : new Date();
            appState.mission.calendarDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            this.renderMissionCalendar();
        });
    }
    const missionCalQueue = document.getElementById('mission-calendar-open-queue');
    if (missionCalQueue) {
        missionCalQueue.addEventListener('click', () => this.switchView('queue'));
    }
    const panelBtn = document.getElementById('mission-panel-btn');
    const panelClose = document.getElementById('mission-panel-close');
    if (panelBtn) {
        panelBtn.addEventListener('click', () => this.setMissionPanelOpen(!appState.mission.panelOpen));
    }
    if (panelClose) {
        panelClose.addEventListener('click', () => this.setMissionPanelOpen(false));
    }
    const workingBtn = document.getElementById('mission-working-btn');
    const workingClose = document.getElementById('mission-working-close');
    if (workingBtn) {
        workingBtn.addEventListener('click', () => this.setMissionWorkingPanelOpen(!appState.mission.workingPanelOpen));
    }
    if (workingClose) {
        workingClose.addEventListener('click', () => this.setMissionWorkingPanelOpen(false));
    }
    this.setMissionWorkingPanelOpen(this.loadMissionWorkingPanelPref(), false);
    document.querySelectorAll('[data-mission-tab]').forEach(tab => {
        tab.addEventListener('click', () => this.setMissionTab(tab.getAttribute('data-mission-tab')));
    });
    const mode2d = document.getElementById('mission-mode-2d');
    const mode3d = document.getElementById('mission-mode-3d');
    if (mode2d) mode2d.addEventListener('click', () => this.applyMission3DMode(false));
    if (mode3d) mode3d.addEventListener('click', () => this.applyMission3DMode(true));
    const panBtn = document.getElementById('mission-pan-btn');
    if (panBtn) {
        panBtn.addEventListener('click', () => {
            if (typeof AiOffice3D === 'undefined' || !AiOffice3D.setPanMode) return;
            const next = !AiOffice3D.isPanMode();
            AiOffice3D.setPanMode(next);
            panBtn.classList.toggle('is-active', next);
            panBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
        });
    }
    const resetBtn = document.getElementById('mission-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (typeof AiOffice3D !== 'undefined' && AiOffice3D.resetView) AiOffice3D.resetView();
        });
    }
    window.addEventListener('hashchange', () => {
        if (!appState.user) return;
        const hashView = (location.hash || '').replace(/^#/, '').trim();
        const allowed = ['mission', 'dashboard', 'composer', 'queue', 'office', 'accounts', 'analytics', 'settings', 'layout', 'about'];
        if (allowed.includes(hashView) && hashView !== appState.currentView) {
            this.switchView(hashView);
        }
    });
};

app.closeMissionNavMenu = function () {
    const navMenu = document.getElementById('mission-nav-menu');
    const menuBtn = document.getElementById('mission-menu-btn');
    if (navMenu) navMenu.classList.add('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
};

/** Panel Work Board di bawah Mission Control — tampil / minimize (state diingat). */
app.setMissionWorkboardOpen = function (open, persist = true) {
    appState.mission.workboardOpen = !!open;
    const panel = document.getElementById('mission-workboard');
    const body = document.getElementById('mission-workboard-body');
    const toggle = document.getElementById('mission-workboard-toggle');
    const tasksBtn = document.getElementById('mission-tasks-btn');
    if (panel) panel.classList.toggle('is-collapsed', !appState.mission.workboardOpen);
    if (body) body.hidden = !appState.mission.workboardOpen;
    if (toggle) toggle.setAttribute('aria-expanded', appState.mission.workboardOpen ? 'true' : 'false');
    if (tasksBtn) tasksBtn.classList.toggle('is-active', appState.mission.workboardOpen);
    if (persist) {
        try { localStorage.setItem('piks-workboard-open', appState.mission.workboardOpen ? '1' : '0'); } catch (_) { /* ignore */ }
    }
    if (appState.mission.workboardOpen) this.renderOfficeBoard();
    if (typeof AiOffice3D !== 'undefined' && appState.office.stageReady) {
        requestAnimationFrame(() => AiOffice3D.resize());
    }
};

app.loadMissionWorkboardPref = function () {
    try {
        return localStorage.getItem('piks-workboard-open') === '1';
    } catch (_) {
        return false;
    }
};

app._syncMissionCalendarBtn = function () {
    const btn = document.getElementById('mission-calendar-btn');
    if (!btn) return;
    const on = !!appState.mission.panelOpen && appState.mission.tab === 'calendar';
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
};

app.setMissionPanelOpen = function (open) {
    appState.mission.panelOpen = !!open;
    const shell = document.getElementById('view-mission');
    const btn = document.getElementById('mission-panel-btn');
    if (shell) shell.classList.toggle('is-panel-collapsed', !appState.mission.panelOpen);
    if (btn) {
        btn.classList.toggle('is-active', appState.mission.panelOpen);
        btn.setAttribute('aria-pressed', appState.mission.panelOpen ? 'true' : 'false');
    }
    this._syncMissionCalendarBtn();
    if (appState.mission.panelOpen && appState.mission.tab === 'calendar') this.renderMissionCalendar();
    if (typeof AiOffice3D !== 'undefined' && appState.office.stageReady) {
        requestAnimationFrame(() => AiOffice3D.resize());
    }
};

/** Panel kiri "Sedang Dikerjakan" — tampil / sembunyi (state diingat, pola sama seperti Work Board). */
app.setMissionWorkingPanelOpen = function (open, persist = true) {
    appState.mission.workingPanelOpen = !!open;
    const shell = document.getElementById('view-mission');
    const btn = document.getElementById('mission-working-btn');
    if (shell) shell.classList.toggle('is-working-collapsed', !appState.mission.workingPanelOpen);
    if (btn) {
        btn.classList.toggle('is-active', appState.mission.workingPanelOpen);
        btn.setAttribute('aria-pressed', appState.mission.workingPanelOpen ? 'true' : 'false');
    }
    if (persist) {
        try { localStorage.setItem('piks-working-panel-open', appState.mission.workingPanelOpen ? '1' : '0'); } catch (_) { /* ignore */ }
    }
    if (appState.mission.workingPanelOpen && typeof this.renderMissionWorkingPanel === 'function') {
        this.renderMissionWorkingPanel();
    }
    if (typeof AiOffice3D !== 'undefined' && appState.office.stageReady) {
        requestAnimationFrame(() => AiOffice3D.resize());
    }
};

app.loadMissionWorkingPanelPref = function () {
    try {
        const saved = localStorage.getItem('piks-working-panel-open');
        return saved === null ? true : saved === '1';
    } catch (_) {
        return true;
    }
};

/** Durasi ringkas Bahasa Indonesia: "baru saja" / "2 mnt" / "1 jam 5 mnt" / "2 hr". */
app._relativeTimeId = function (value) {
    if (!value) return '';
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) return '';
    const diffMs = Date.now() - t;
    if (diffMs < 60 * 1000) return 'baru saja';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins} mnt`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
        const rest = mins % 60;
        return rest ? `${hours} jam ${rest} mnt` : `${hours} jam`;
    }
    return `${Math.floor(hours / 24)} hr`;
};

/**
 * Kategorikan agen untuk panel kiri dari status karyawan + state animasi server
 * + snapshot aktivitas 3D. Mengembalikan null bila agen tidak sedang aktif.
 * section: 'working' (benar-benar bekerja) | 'waiting' (menunggu / perlu perhatian).
 */
app._missionWorkingCategory = function (emp, activityRow) {
    const status = (emp && emp.status) || (activityRow && activityRow.status) || 'idle';
    // Presence "meeting" memetakan agen idle ke awaiting_approval untuk pose rapat 3D —
    // itu bukan job yang menunggu approval, jadi jangan tampilkan sebagai Menunggu.
    if (emp && emp.fromPresence && status === 'awaiting_approval'
        && !(emp.latestJob && emp.latestJob.status === 'awaiting_approval')) {
        return null;
    }
    const anim = (emp && (emp.animationState || (emp.animation && emp.animation.state))) || '';
    const act = (activityRow && activityRow.activity) || '';
    const label = (activityRow && activityRow.label) || '';
    if (anim === 'blocked' || status === 'failed' || label === 'Blocked') {
        return { section: 'waiting', badge: 'Blocked', badgeClass: 'is-blocked', live: false };
    }
    if (anim === 'thinking' || act === 'thinking') {
        return { section: 'working', badge: 'Thinking', badgeClass: 'is-thinking', live: true };
    }
    if (status === 'needs_info' || act === 'review') {
        return { section: 'waiting', badge: 'Reviewing', badgeClass: 'is-reviewing', live: false };
    }
    if (status === 'awaiting_approval' || anim === 'waiting' || act === 'waiting' || act === 'chat') {
        return { section: 'waiting', badge: 'Waiting', badgeClass: 'is-waiting', live: false };
    }
    if (anim === 'overloaded') {
        return { section: 'working', badge: 'Working · Overload', badgeClass: 'is-working', live: true };
    }
    if (status === 'working' || status === 'publishing' || anim === 'working' || act === 'work') {
        return { section: 'working', badge: 'Working', badgeClass: 'is-working', live: true };
    }
    return null;
};

/**
 * Panel kiri "Sedang Dikerjakan" — real-time per agen.
 * Sumber data (tanpa endpoint/polling baru):
 *  - appState.office.employees dari GET /api/ai/office (status, animationState,
 *    presenceNote, latestJob) yang dimuat siklus renderMission + polling 20 dtk;
 *  - snapshot aktivitas 3D (AiOffice3D.getActivitySnapshot / appState.office.activityLive
 *    dari callback onActivity) untuk teks speech terbaru per agen.
 * Aman dipanggil kapan pun: panel/data belum ada → no-op tanpa error.
 */
app.renderMissionWorkingPanel = function () {
    const body = document.getElementById('mission-working-body');
    if (!body) return;
    const summaryEl = document.getElementById('mission-working-summary');
    const liveDot = document.getElementById('mission-working-live-dot');
    try {
        const employees = Array.isArray(appState.office.employees) ? appState.office.employees : [];
        let snapshot = Array.isArray(appState.office.activityLive) ? appState.office.activityLive : [];
        if (typeof AiOffice3D !== 'undefined' && AiOffice3D.getActivitySnapshot && appState.office.stageReady) {
            const snap = AiOffice3D.getActivitySnapshot();
            if (Array.isArray(snap) && snap.length) snapshot = snap;
        }
        const byRole = {};
        snapshot.forEach(row => { if (row && row.roleId) byRole[row.roleId] = row; });

        if (!employees.length) {
            if (summaryEl) summaryEl.textContent = 'Menunggu data kantor…';
            if (liveDot) liveDot.classList.remove('is-live');
            body.innerHTML = '<p class="mission-empty">Belum ada data agen. Panel terisi otomatis setelah data kantor dimuat.</p>';
            return;
        }

        const working = [];
        const waiting = [];
        let standbyCount = 0;
        employees.forEach(emp => {
            const row = byRole[emp.id] || null;
            const cat = this._missionWorkingCategory(emp, row);
            if (!cat) { standbyCount += 1; return; }
            (cat.section === 'working' ? working : waiting).push({ emp, row, cat });
        });

        if (summaryEl) {
            summaryEl.textContent = working.length || waiting.length
                ? `${working.length} bekerja · ${waiting.length} menunggu · ${standbyCount} standby`
                : `${standbyCount} agen standby`;
        }
        if (liveDot) liveDot.classList.toggle('is-live', working.length > 0);

        if (!working.length && !waiting.length) {
            body.innerHTML = `<div class="mission-working-empty">
                <p class="mission-working-empty-title">Tidak ada agen yang sedang bekerja — tim standby.</p>
                <p class="mission-working-empty-sub">${standbyCount} dari ${employees.length} agen siaga menunggu brief berikutnya.</p>
            </div>`;
            return;
        }

        const renderCard = ({ emp, row, cat }) => {
            const job = emp.latestJob || null;
            const fullJob = job && typeof this._findOfficeJob === 'function' ? this._findOfficeJob(job.id) : null;
            const speech = (row && row.speech) || emp.presenceNote || '';
            const activityText = speech
                || (cat.badge === 'Thinking' ? 'Thinking…' : cat.section === 'working' ? 'Working on brief…' : 'Menunggu tindak lanjut');
            const brief = job ? String(job.brief || '').trim() : '';
            const platforms = fullJob && Array.isArray(fullJob.platforms) && fullJob.platforms.length
                ? fullJob.platforms.map(p => (appState.platforms[p] ? appState.platforms[p].name : p)).join(', ')
                : '';
            const since = job ? this._relativeTimeId(job.createdAt) : '';
            const updated = job ? this._relativeTimeId(job.updatedAt) : '';
            const timeText = since ? `sejak ${since}` : (updated ? `diperbarui ${updated}` : '');
            const extraJobs = emp.activeCount > 1 ? `<span class="mission-working-chip">+${emp.activeCount - 1} tugas lain</span>` : '';
            const focused = appState.office.focusRoleId === emp.id ? ' is-focused' : '';
            const color = this._escapeHtml(emp.avatarColor || 'var(--indigo)');
            return `<button type="button" class="mission-working-card${focused}" data-role-id="${this._escapeHtml(emp.id)}" data-job-id="${job ? this._escapeHtml(String(job.id)) : ''}" title="Fokus ${this._escapeHtml(emp.name)}${job ? ' & buka detail job' : ''}">
                <span class="mission-working-avatar" style="background:${color}"><span>${emp.emoji || '🤖'}</span><span class="mission-working-dot ${cat.badgeClass}${cat.live ? ' is-live' : ''}" aria-hidden="true"></span></span>
                <span class="mission-working-info">
                    <span class="mission-working-name-row"><span class="mission-working-name">${this._escapeHtml(emp.name)}</span><span class="mission-working-badge ${cat.badgeClass}">${this._escapeHtml(cat.badge)}</span></span>
                    <span class="mission-working-role">${this._escapeHtml(emp.title || '')}</span>
                    <span class="mission-working-activity">${this._escapeHtml(activityText)}</span>
                    ${brief ? `<span class="mission-working-brief">${this._escapeHtml(brief.slice(0, 110))}</span>` : ''}
                    <span class="mission-working-meta">${platforms ? `<span>${this._escapeHtml(platforms)}</span>` : ''}${timeText ? `<span>${this._escapeHtml(timeText)}</span>` : ''}${extraJobs}</span>
                </span>
            </button>`;
        };
        const sectionHtml = (title, items, hint) => items.length
            ? `<div class="mission-working-section"><h3 class="mission-working-section-title">${title} <span>${items.length}</span></h3>${hint ? `<p class="mission-working-section-hint">${hint}</p>` : ''}<div class="mission-working-list">${items.map(renderCard).join('')}</div></div>`
            : '';
        body.innerHTML = sectionHtml('Sedang bekerja', working, '')
            + sectionHtml('Menunggu', waiting, 'Perlu info, approval, atau perhatian manusia.');
        body.querySelectorAll('.mission-working-card').forEach(card => {
            card.addEventListener('click', () => {
                const roleId = card.getAttribute('data-role-id');
                const jobId = card.getAttribute('data-job-id');
                if (roleId) this.focusOfficeEmployee(roleId);
                if (jobId && typeof this.openJobDetailModal === 'function' && this._findOfficeJob(jobId)) {
                    this.openJobDetailModal(jobId);
                }
                this.renderMissionWorkingPanel();
            });
        });
    } catch (err) {
        // Panel tidak boleh mematahkan Mission Control bila data belum siap.
        console.warn('[APP] Panel Sedang Dikerjakan belum bisa dirender:', err);
        body.innerHTML = '<p class="mission-empty">Aktivitas agen belum tersedia.</p>';
    }
};

app.setMissionTab = function (tab) {
    const next = tab || 'crew';
    appState.mission.tab = next;
    document.querySelectorAll('[data-mission-tab]').forEach(el => {
        const on = el.getAttribute('data-mission-tab') === next;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['crew', 'stats', 'activity', 'chat', 'calendar'].forEach(id => {
        const pane = document.getElementById(`mission-tab-${id}`);
        if (!pane) return;
        const on = id === next;
        pane.classList.toggle('is-active', on);
        pane.hidden = !on;
    });
    this._syncMissionCalendarBtn();
    if (next === 'chat') this.loadCeoChat();
    if (next === 'calendar') this.renderMissionCalendar();
};

/** Tombol Calendar top bar: buka/tutup kalender sebagai panel kanan Mission Control. */
app.toggleMissionCalendarPanel = function () {
    if (appState.currentView !== 'mission') {
        this.switchView('mission');
    }
    if (appState.mission.panelOpen && appState.mission.tab === 'calendar') {
        this.setMissionPanelOpen(false);
        return;
    }
    appState.mission.tab = 'calendar';
    this.setMissionPanelOpen(true);
    this.setMissionTab('calendar');
};

app._missionCalendarKey = function (date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

app.renderMissionCalendar = function () {
    const grid = document.getElementById('mission-calendar-days-grid');
    const monthLabel = document.getElementById('mission-calendar-month-year');
    const list = document.getElementById('mission-calendar-posts-list');
    const selectedLabel = document.getElementById('mission-calendar-selected-label');
    if (!grid || !monthLabel || !list) return;

    if (!(appState.mission.calendarDate instanceof Date) || Number.isNaN(appState.mission.calendarDate.getTime())) {
        appState.mission.calendarDate = new Date();
    }
    const cur = appState.mission.calendarDate;
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    monthLabel.textContent = `${indonesianMonths[month]} ${year}`;

    const todayKey = this._missionCalendarKey(new Date());
    if (!appState.mission.calendarSelectedDate) {
        appState.mission.calendarSelectedDate = todayKey;
    }
    const selectedKey = appState.mission.calendarSelectedDate;

    // Ikuti kalender lama (status terjadwal), plus yang sudah terbit agar panel informatif.
    const visible = (appState.posts || []).filter(p => p && (p.status === 'scheduled' || p.status === 'posted'));
    const byKey = {};
    visible.forEach(post => {
        const key = this._missionCalendarKey(post.publishDate);
        if (!key) return;
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(post);
    });
    Object.values(byKey).forEach(arr => arr.sort((a, b) => new Date(a.publishDate) - new Date(b.publishDate)));

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLastDay = new Date(year, month, 0).getDate();
    const cells = [];
    for (let x = firstDayIndex; x > 0; x--) {
        cells.push({ day: prevLastDay - x + 1, other: true, key: '' });
    }
    for (let i = 1; i <= lastDay; i++) {
        cells.push({ day: i, other: false, key: this._missionCalendarKey(new Date(year, month, i)) });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let j = 1; j <= trailing; j++) {
        cells.push({ day: j, other: true, key: '' });
    }

    grid.innerHTML = cells.map(cell => {
        if (cell.other) {
            return `<span class="mission-cal-day is-other" aria-hidden="true">${cell.day}</span>`;
        }
        const posts = byKey[cell.key] || [];
        const dots = posts.slice(0, 3).map(p => `<span class="mission-cal-dot is-${this._escapeHtml(p.status)}"></span>`).join('')
            + (posts.length > 3 ? `<span class="mission-cal-more">+${posts.length - 3}</span>` : '');
        const cls = ['mission-cal-day', cell.key === todayKey ? 'is-today' : '', cell.key === selectedKey ? 'is-selected' : '', posts.length ? 'has-posts' : ''].filter(Boolean).join(' ');
        const label = `${cell.day} ${indonesianMonths[month]} ${year}${posts.length ? `, ${posts.length} postingan` : ''}`;
        return `<button type="button" class="${cls}" data-mission-cal-date="${cell.key}" aria-label="${this._escapeHtml(label)}" aria-pressed="${cell.key === selectedKey ? 'true' : 'false'}"><span class="mission-cal-num">${cell.day}</span><span class="mission-cal-dots">${dots}</span></button>`;
    }).join('');
    grid.querySelectorAll('[data-mission-cal-date]').forEach(btn => {
        btn.addEventListener('click', () => {
            appState.mission.calendarSelectedDate = btn.getAttribute('data-mission-cal-date');
            this.renderMissionCalendar();
        });
    });

    const selectedDate = selectedKey ? new Date(`${selectedKey}T00:00:00`) : null;
    const selectedInMonth = selectedDate && !Number.isNaN(selectedDate.getTime())
        && selectedDate.getFullYear() === year && selectedDate.getMonth() === month;
    let listPosts;
    if (selectedInMonth) {
        listPosts = byKey[selectedKey] || [];
        if (selectedLabel) {
            selectedLabel.textContent = `${indonesianDays[selectedDate.getDay()]}, ${selectedDate.getDate()} ${indonesianMonths[month]} ${year}`;
        }
    } else {
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}-`;
        listPosts = visible
            .filter(p => this._missionCalendarKey(p.publishDate).startsWith(monthKey))
            .sort((a, b) => new Date(a.publishDate) - new Date(b.publishDate));
        if (selectedLabel) selectedLabel.textContent = `Semua di ${indonesianMonths[month]} ${year}`;
    }

    if (!listPosts.length) {
        list.innerHTML = `<li class="mission-empty">${selectedInMonth ? 'Tidak ada postingan terjadwal/terbit di hari ini.' : 'Tidak ada postingan terjadwal/terbit di bulan ini.'}</li>`;
        return;
    }
    list.innerHTML = listPosts.map(post => {
        const when = new Date(post.publishDate);
        const platformNames = (post.platforms || []).map(p => {
            const info = appState.platforms[p];
            return info ? info.name : p;
        }).join(', ');
        const caption = (post.caption || 'Tanpa keterangan').trim();
        const datePrefix = selectedInMonth ? '' : `${when.getDate()} ${indonesianMonths[when.getMonth()]} · `;
        const statusLabel = post.status === 'posted' ? 'Terbit' : 'Terjadwal';
        return `<li><button type="button" class="mission-cal-post" data-mission-cal-post="${this._escapeHtml(String(post.id))}">
            <span class="mission-cal-post-time">${this._escapeHtml(datePrefix)}${this._escapeHtml(this._formatTime24(when))}</span>
            <span class="mission-cal-post-main"><span class="mission-cal-post-caption">${this._escapeHtml(caption.slice(0, 90))}</span>
            <span class="mission-cal-post-meta">${this._escapeHtml(platformNames || '—')} · ${statusLabel}</span></span>
        </button></li>`;
    }).join('');
    list.querySelectorAll('[data-mission-cal-post]').forEach(btn => {
        btn.addEventListener('click', () => this.openPostDetailsModal(btn.getAttribute('data-mission-cal-post')));
    });
};

app.applyMission3DMode = function (enabled3d) {
    const toggle = document.getElementById('office-3d-toggle');
    const viewport = document.getElementById('office-3d-viewport');
    const mode2d = document.getElementById('mission-mode-2d');
    const mode3d = document.getElementById('mission-mode-3d');
    if (toggle) toggle.checked = !!enabled3d;
    if (mode2d) mode2d.classList.toggle('is-active', !enabled3d);
    if (mode3d) mode3d.classList.toggle('is-active', !!enabled3d);

    if (typeof AiOffice3D === 'undefined' || typeof THREE === 'undefined') {
        if (toggle) toggle.checked = false;
        if (viewport) viewport.classList.add('is-3d-off');
        if (mode2d) mode2d.classList.add('is-active');
        if (mode3d) mode3d.classList.remove('is-active');
        this.showToast('Modul 3D gagal dimuat. Muat ulang halaman.', 'red');
        return;
    }
    AiOffice3D.setEnabled(!!enabled3d);
    if (enabled3d && appState.currentView === 'mission' && !appState.office.stageReady) {
        this.initOffice3D();
    }
    this.syncOffice3DEmployees();
};

app.updateMissionSynced = function () {
    appState.mission.syncedAt = new Date();
    const el = document.getElementById('mission-synced-time');
    if (el) {
        el.textContent = this._formatTime24(appState.mission.syncedAt, true);
    }
};

app._nextCronLabel = function () {
    const sched = appState.authStatus && appState.authStatus.scheduler;
    if (sched && sched.kind === 'local-interval') {
        return `every ${sched.everySeconds || 60}s`;
    }
    // Vercel cron: 0 12 * * * (12:00 UTC)
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return this._formatDateTime24(next);
};

app.updateMissionPills = function () {
    const employees = appState.office.employees || [];
    const totalCrew = employees.length || 7;
    const activeCrew = employees.filter(e => {
        const s = e.status || 'idle';
        return s === 'working' || s === 'standby' || s === 'needs_info' || s === 'awaiting_approval';
    }).length;
    const idleCrew = employees.filter(e => (e.status || 'idle') === 'idle').length;
    const counts = appState.office.jobCounts || {};
    const running = (counts.publishing || 0);
    const open = (counts.queued || 0) + (counts.needs_info || 0) + (counts.awaiting_approval || 0);
    const connected = appState.accounts.filter(a => a.connected).length;
    const gatewayTotal = 4;

    const setPill = (key, value) => {
        document.querySelectorAll(`[data-mission-pill="${key}"]`).forEach(el => {
            el.textContent = value;
        });
    };
    setPill('crew', `${activeCrew}/${totalCrew}`);
    setPill('gateways', `${connected}/${gatewayTotal}`);
    setPill('tasks', `${running} running · ${open} open`);
    setPill('cron', this._nextCronLabel());

    const setStat = (key, value) => {
        const el = document.querySelector(`[data-mission-stat="${key}"]`);
        if (el) el.textContent = value;
    };
    setStat('gateways', `${connected} / ${gatewayTotal}`);
    setStat('crew', `${activeCrew} / ${totalCrew}`);
    setStat('crew-sub', `${idleCrew} idle`);
    setStat('open', String(open));
    setStat('open-sub', `${counts.total || 0} total · ${running} running`);
    setStat('jobs', String(counts.total || 0));
    setStat('jobs-sub', `${counts.done || 0} done · ${counts.failed || 0} failed`);
};

/** Standup Konten Terstruktur (#4) — panel kecil di atas Work Board. */
app.renderStandup = function () {
    const wrap = document.getElementById('mission-standup');
    const phaseEl = document.getElementById('mission-standup-phase');
    const cardEl = document.getElementById('mission-standup-card');
    if (!wrap || !phaseEl || !cardEl) return;
    const s = appState.office.standup;
    if (!s || !s.session) {
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    const session = s.session;
    const speaker = s.speaker || {};
    const phaseLabel = { gathering: 'Berkumpul di area rapat', in_progress: 'Berlangsung', complete: 'Selesai' }[session.phase] || session.phase;
    phaseEl.textContent = `Standup · ${phaseLabel}${speaker.roleId ? ` · giliran ${speaker.index + 1}/${speaker.total}` : ''}`;
    const card = speaker.card;
    if (session.phase === 'complete') {
        const made = (session.createdJobIds || []).length;
        cardEl.innerHTML = `<p><strong>Standup selesai.</strong></p><p>${made ? `${made} follow-up job dibuat.` : 'Klik "Selesai & buat follow-up" untuk menjadikan follow-up sebagai job.'}</p>`;
    } else if (card) {
        const blockers = (card.blockers || []).map(b => this._escapeHtml(b.brief || b.status)).join('; ');
        const next = (card.nextUp || []).map(n => this._escapeHtml(n.cta || '')).join('; ');
        cardEl.innerHTML = `<p><strong>${card.emoji || ''} ${this._escapeHtml(card.name)} — ${this._escapeHtml(card.title)}</strong></p>
            <p>${this._escapeHtml(card.headline || '')}</p>
            ${blockers ? `<p>Blocker: ${blockers}</p>` : ''}
            ${next ? `<p>Berikutnya: ${next}</p>` : ''}`;
    } else {
        cardEl.innerHTML = '<p class="mission-empty">Semua berkumpul — klik Maju untuk mulai giliran bicara.</p>';
    }
};

app.loadStandup = async function () {
    try {
        const data = await api.get('/api/ai/standup');
        if (data.success) {
            appState.office.standup = { session: data.session, speaker: data.speaker };
            this.renderStandup();
        }
    } catch (_) { /* standup opsional */ }
};

app.startStandup = async function () {
    try {
        const data = await api.post('/api/ai/standup/start', {});
        if (!data.success) { this.showToast(data.message || 'Gagal mulai standup.', 'red'); return; }
        appState.office.standup = { session: data.session, speaker: data.speaker };
        this.setMissionWorkboardOpen(true);
        this.renderStandup();
        await this.loadOfficeFromServer();
        this.syncOffice3DEmployees();
        this.showToast('Standup dimulai — tim ke area rapat.', 'emerald');
    } catch (_) {
        this.showToast('Gagal mulai standup.', 'red');
    }
};

app.advanceStandup = async function () {
    try {
        const data = await api.post('/api/ai/standup/advance', {});
        if (!data.success) { this.showToast(data.message || 'Gagal maju standup.', 'red'); return; }
        appState.office.standup = { session: data.session, speaker: data.speaker };
        this.renderStandup();
    } catch (_) {
        this.showToast('Gagal maju standup.', 'red');
    }
};

app.finishStandup = async function () {
    try {
        const data = await api.post('/api/ai/standup/finish', {});
        if (!data.success) { this.showToast(data.message || 'Gagal selesai standup.', 'red'); return; }
        appState.office.standup = { session: data.session, speaker: data.speaker };
        this.renderStandup();
        await this.loadOfficeFromServer();
        this.renderOfficeBoard();
        const n = (data.createdJobs || []).length;
        this.showToast(n ? `Standup selesai — ${n} follow-up job dibuat.` : 'Standup selesai — tidak ada follow-up.', 'emerald');
    } catch (_) {
        this.showToast('Gagal selesai standup.', 'red');
    }
};

app.renderMissionCrew = function () {
    const list = document.getElementById('mission-crew-list');
    if (!list) {
        if (typeof this.renderMissionWorkingPanel === 'function') this.renderMissionWorkingPanel();
        return;
    }
    const employees = appState.office.employees || [];
    if (!employees.length) {
        list.innerHTML = '<p class="mission-empty">Belum ada peran terdaftar.</p>';
        if (typeof this.renderMissionWorkingPanel === 'function') this.renderMissionWorkingPanel();
        return;
    }
    list.innerHTML = employees.map(emp => {
        const workload = emp.workload || (emp.activeCount ? `${emp.activeCount} tugas` : 'idle');
        const brief = emp.latestJob
            ? this._escapeHtml((emp.latestJob.brief || '').slice(0, 72))
            : 'Belum ada job';
        const focused = appState.office.focusRoleId === emp.id ? ' is-focused' : '';
        return `<button type="button" class="mission-crew-card${focused}" data-role-id="${this._escapeHtml(emp.id)}">
            <div class="mission-crew-avatar" style="background:${emp.avatarColor || 'var(--indigo)'}">
                <span>${emp.emoji || '🤖'}</span>
            </div>
            <div class="mission-crew-info">
                <span class="mission-crew-name">${this._escapeHtml(emp.name)}</span>
                <span class="mission-crew-title">${this._escapeHtml(emp.title)}</span>
                <span class="mission-crew-meta">${this._escapeHtml(workload)} · ${this._escapeHtml(this._statusLabel(emp.status))}</span>
                <span class="mission-crew-meta">${brief}</span>
            </div>
        </button>`;
    }).join('');
    list.querySelectorAll('.mission-crew-card').forEach(card => {
        card.addEventListener('click', () => {
            const roleId = card.getAttribute('data-role-id');
            this.focusOfficeEmployee(roleId);
            this.renderMissionCrew();
        });
    });
    // Panel kiri "Sedang Dikerjakan" ikut siklus render yang sama (polling 20 dtk / renderMission).
    if (typeof this.renderMissionWorkingPanel === 'function') this.renderMissionWorkingPanel();
};

app.renderMission = async function () {
    this.setMissionPanelOpen(appState.mission.panelOpen);
    this.setMissionWorkingPanelOpen(appState.mission.workingPanelOpen, false);
    this.setMissionWorkboardOpen(appState.mission.workboardOpen, false);
    this.setMissionTab(appState.mission.tab || 'crew');
    await this.loadOfficeFromServer();
    this.applySavedOfficeLayout();
    this.renderOfficeBoard();
    this.renderMissionCrew();
    this.updateMissionPills();
    await this.loadAndRenderInsights('mission-insights-body');
    await this.loadOfficeActivityLog();

    const prefOn = (typeof AiOffice3D !== 'undefined' && AiOffice3D.loadPreference)
        ? AiOffice3D.loadPreference()
        : true;
    this.applyMission3DMode(prefOn !== false);
    if (prefOn !== false) {
        this.initOffice3D();
        this.syncOffice3DEmployees();
    }
    this.updateMissionSynced();
    lucide.createIcons();
};

// Office API → js/office-api.js (P3 modularize); fallback jika skrip gagal dimuat
app.loadOfficeFromServer = async function () {
    if (typeof PiksOfficeApi !== 'undefined') return PiksOfficeApi.loadOfficeFromServer(this);
    try {
        const data = await api.get('/api/ai/office');
        if (data.success) {
            appState.office.employees = data.employees || [];
            appState.office.board = data.board || {};
            appState.office.jobCounts = data.jobCounts || {};
            appState.office.settings = data.settings || null;
                    appState.office.briefTemplates = data.briefTemplates || [];
                    appState.office.crewPresence = data.crewPresence || null;
                    if (data.knownSkills) appState.office.knownSkills = data.knownSkills;
                    if (data.platforms) appState.office.platforms = data.platforms;
        } else if (data.authRequired) {
            console.warn('[APP] Kantor AI butuh sesi login:', data.message);
        }
        await this.loadAiJobsFromServer();
    } catch (e) {
        console.error('[APP] Gagal memuat Kantor AI:', e);
    }
};

/** Halaman Pengaturan — panel Otonomi & Pengamanan (dulu sidebar Work Board). */
app.renderSettings = async function () {
    await this.loadOfficeFromServer();
    this.renderOfficeSettings();
    lucide.createIcons();
};

// ============================================================
// Layout Kantor — editor denah 2D (tampak atas) untuk kantor 3D
// ============================================================
app._layoutEditor = null;

/** Posisi+rotasi meja agen dari format [x,z] lama / [x,z,rotY] / {x,z,rotY}. */
app._deskPos = function (d) {
    if (Array.isArray(d)) return [Number(d[0]) || 0, Number(d[1]) || 0, Number(d[2]) || 0];
    d = d || {};
    return [Number(d.x) || 0, Number(d.z) || 0, Number(d.rotY != null ? d.rotY : d.rot) || 0];
};

/** Default efektif: default tersimpan server (Save to Default) > default pabrik kode. */
app._layoutDefaultData = function () {
    const savedDefault = typeof appState !== 'undefined' && appState.office && appState.office.settings
        ? appState.office.settings.defaultOfficeLayout : null;
    if (savedDefault) return JSON.parse(JSON.stringify(savedDefault));
    if (typeof AiOffice3D !== 'undefined' && typeof AiOffice3D.getDefaultLayout === 'function') {
        return AiOffice3D.getDefaultLayout();
    }
    // Salinan persis default pabrik ai-office-3d.js (defaultLayoutData) —
    // hanya dipakai bila modul 3D gagal dimuat.
    return {
        wallHeight: 2.55,
        building: { minX: -15.7, maxX: 17.1, minZ: -6.5, maxZ: 5.5 },
        desks: [
            [-12.45, -5.5, 0], [-5.95, -5.5, 0], [-8.4, -4.6, Math.PI / 2],
            [-3.5, -4.6, -Math.PI / 2], [7.35, -5.5, 0], [-14.9, -3.1, Math.PI / 2],
            [4.9, -4.6, Math.PI / 2], [9.8, -4.6, -Math.PI / 2], [13.85, -5.5, 0],
            [11.4, -4.6, Math.PI / 2], [16.3, -4.6, -Math.PI / 2],
            [-14.9, -4.6, Math.PI / 2], [-14.9, -1.6, Math.PI / 2],
            [-10.0, -4.6, -Math.PI / 2], [-10.0, -3.1, -Math.PI / 2], [-10.0, -1.6, -Math.PI / 2],
            [-8.4, -3.1, Math.PI / 2], [-8.4, -1.6, Math.PI / 2],
            [-3.5, -3.1, -Math.PI / 2], [-3.5, -1.6, -Math.PI / 2],
            [4.9, -3.1, Math.PI / 2], [4.9, -1.6, Math.PI / 2],
            [9.8, -3.1, -Math.PI / 2], [9.8, -1.6, -Math.PI / 2],
            [11.4, -3.1, Math.PI / 2], [11.4, -1.6, Math.PI / 2],
            [16.3, -3.1, -Math.PI / 2], [16.3, -1.6, -Math.PI / 2]
        ],
        partitions: { segments: [
            { axis: 'v', at: -9.2, from: -6.3, to: -0.9 },
            { axis: 'v', at: -2.7, from: -6.3, to: -0.9 },
            { axis: 'v', at: 4.1, from: -6.3, to: -0.9 },
            { axis: 'v', at: 10.6, from: -6.3, to: -0.9 },
            { axis: 'h', at: -0.9, from: -15.5, to: -13.25 },
            { axis: 'h', at: -0.9, from: -11.65, to: -9.4 },
            { axis: 'h', at: -0.9, from: -9.0, to: -6.75 },
            { axis: 'h', at: -0.9, from: -5.15, to: -2.9 },
            { axis: 'h', at: -0.9, from: 4.3, to: 6.55 },
            { axis: 'h', at: -0.9, from: 8.15, to: 10.4 },
            { axis: 'h', at: -0.9, from: 10.8, to: 13.05 },
            { axis: 'h', at: -0.9, from: 14.65, to: 16.9 }
        ] },
        meetingTable: { x: 0.7, z: -4.2, radius: 1.05, enabled: true },
        furniture: [
            { id: 'sofa-1', type: 'sofa', x: 0.7, z: 4.6, rotY: 0 },
            { id: 'sofa-2', type: 'sofa', x: -0.6, z: 3.5, rotY: Math.PI / 2 },
            { id: 'sofa-3', type: 'sofa', x: 2.0, z: 3.5, rotY: Math.PI / 2 },
            { id: 'coffee-table', type: 'coffeetable', x: 0.7, z: 3.5, rotY: Math.PI / 2 },
            { id: 'tv-1', type: 'tv', x: 0.7, z: -6.32, rotY: 0 },
            { id: 'bookshelf-1', type: 'bookshelf', x: -0.9, z: -6.32, rotY: 0 },
            { id: 'bookshelf-2', type: 'bookshelf', x: 2.3, z: -6.32, rotY: 0 },
            { id: 'arcade-1', type: 'arcade', x: 16.75, z: -6.15, rotY: 0 },
            { id: 'pingpong', type: 'pingpong', x: 13.5, z: 3.8, rotY: 0 },
            { id: 'pingpong-2', type: 'pingpong', x: -12.3, z: 2.4, rotY: 0 },
            { id: 'beanbag-1', type: 'beanbag', x: 11.3, z: 2.7, rotY: 0 },
            { id: 'beanbag-2', type: 'beanbag', x: 15.6, z: 2.9, rotY: 0 },
            { id: 'coffeebar', type: 'coffeebar', x: -13.2, z: 4.95, rotY: 0 },
            { id: 'stool-1', type: 'stool', x: -13.9, z: 4.25, rotY: 0 },
            { id: 'stool-2', type: 'stool', x: -12.5, z: 4.25, rotY: 0 },
            { id: 'pantry', type: 'pantry', x: -15.4, z: 1.8, rotY: -Math.PI / 2 },
            { id: 'fridge', type: 'fridge', x: -15.35, z: 3.1, rotY: -Math.PI / 2 },
            { id: 'galon', type: 'galon', x: -14.9, z: 2.4, rotY: 0 },
            { id: 'plant-1', type: 'plant', x: -15.4, z: -6.3, rotY: 0 },
            { id: 'plant-2', type: 'plant', x: -15.4, z: 5.2, rotY: 0 },
            { id: 'plant-3', type: 'plant', x: 16.8, z: 5.2, rotY: 0 },
            { id: 'tree-1', type: 'tree', x: -12.0, z: -9.8, rotY: 0 },
            { id: 'tree-2', type: 'tree', x: -5.0, z: -9.6, rotY: 0 },
            { id: 'tree-3', type: 'tree', x: 2.0, z: -9.6, rotY: 0 },
            { id: 'tree-4', type: 'tree', x: 9.0, z: -9.6, rotY: 0 },
            { id: 'tree-5', type: 'tree', x: -19.5, z: -0.5, rotY: 0 },
            { id: 'tree-6', type: 'tree', x: 20.8, z: -0.5, rotY: 0 },
            { id: 'lamp-1', type: 'lamp', x: -18.5, z: 7.0, rotY: 0 },
            { id: 'lamp-2', type: 'lamp', x: 20.0, z: 6.8, rotY: 0 },
            { id: 'lamp-3', type: 'lamp', x: 18.0, z: -8.5, rotY: 0 }
        ]
    };
};

app.renderLayoutEditor = async function () {
    if (!appState.office.settings) {
        await this.loadOfficeFromServer();
    }
    const saved = appState.office.settings && appState.office.settings.officeLayout;
    let base = saved ? JSON.parse(JSON.stringify(saved)) : this._layoutDefaultData();
    // Layout lama tanpa field baru → lengkapi dari bawaan agar denah utuh
    const def = this._layoutDefaultData();
    if (!base.furniture || !base.furniture.length) base.furniture = def.furniture;
    if (!base.desks || !base.desks.length) base.desks = def.desks;
    if (!base.partitions || !Array.isArray(base.partitions.segments)) base.partitions = def.partitions;
    if (!base.meetingTable) base.meetingTable = def.meetingTable;
    // Layout yang masih persis bawaan lama (belum dikustom user) dinaikkan
    // ke denah klaster studio saat ini — sama seperti migrasi scene 3D.
    let migratedFromLegacy = false;
    if (typeof AiOffice3D !== 'undefined' && typeof AiOffice3D.migrateLegacyLayout === 'function') {
        const m = AiOffice3D.migrateLegacyLayout(base);
        if (m && m.migrated) { base = m.layout; migratedFromLegacy = true; }
    }
    this._layoutEditor = { data: base, selected: null, drag: null };
    this._syncLayoutEditorControls();
    this._drawLayoutCanvas();
    const status = document.getElementById('layout-editor-status');
    if (status) {
        status.textContent = migratedFromLegacy
            ? 'Layout bawaan lama diperbarui ke denah 4 studio baru. Klik Simpan Layout untuk menetapkannya.'
            : saved
                ? 'Layout custom tersimpan sedang dipakai. Seret item lalu Simpan Layout.'
                : 'Masih layout bawaan. Atur denah lalu Simpan Layout untuk memakai layout custom.';
    }
    lucide.createIcons();
};

app._syncLayoutEditorControls = function () {
    const ed = this._layoutEditor;
    if (!ed) return;
    const d = ed.data;
    const wh = document.getElementById('layout-wall-height');
    const whVal = document.getElementById('layout-wall-height-val');
    const bw = document.getElementById('layout-building-width');
    const bwVal = document.getElementById('layout-building-width-val');
    const bd = document.getElementById('layout-building-depth');
    const bdVal = document.getElementById('layout-building-depth-val');
    if (wh) wh.value = d.wallHeight;
    if (whVal) whVal.textContent = Number(d.wallHeight).toFixed(2);
    const width = d.building.maxX - d.building.minX;
    const depth = d.building.maxZ - d.building.minZ;
    if (bw) bw.value = width;
    if (bwVal) bwVal.textContent = width.toFixed(1);
    if (bd) bd.value = depth;
    if (bdVal) bdVal.textContent = depth.toFixed(1);
    this._updateLayoutSelectedInfo();
};

app._updateLayoutSelectedInfo = function () {
    const info = document.getElementById('layout-selected-info');
    if (!info) return;
    const ed = this._layoutEditor;
    if (!ed || !ed.selected) {
        info.textContent = 'Belum ada item dipilih.';
        return;
    }
    const sel = ed.selected;
    if (sel.kind === 'desk') {
        const d = ed.data.desks[sel.index];
        if (d) {
            const dp = app._deskPos(d);
            info.textContent = `Meja agen #${sel.index + 1} — posisi (${dp[0].toFixed(1)}, ${dp[1].toFixed(1)}) \u00b7 putar ${Math.round((dp[2] * 180) / Math.PI)}\u00b0`;
        } else info.textContent = 'Meja agen';
    } else if (sel.kind === 'meeting') {
        const m = ed.data.meetingTable;
        info.textContent = m ? `Meja meeting — posisi (${m.x.toFixed(1)}, ${m.z.toFixed(1)})` : 'Meja meeting';
    } else if (sel.kind === 'partition') {
        const s = ed.data.partitions && ed.data.partitions.segments[sel.index];
        info.textContent = s
            ? `Partisi ${s.axis === 'h' ? 'horizontal' : 'vertikal'} — panjang ${(s.to - s.from).toFixed(1)} m`
            : 'Partisi';
    } else {
        const f = ed.data.furniture[sel.index];
        info.textContent = f
            ? `Mebel: ${f.type} — posisi (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) · putar ${Math.round(((f.rotY || 0) * 180) / Math.PI)}°`
            : 'Mebel';
    }
};

/** Transformasi dunia (meter) ↔ kanvas denah. */
app._layoutTransform = function () {
    const canvas = document.getElementById('layout-canvas');
    const ed = this._layoutEditor;
    if (!canvas || !ed) return null;
    const b = ed.data.building;
    const marginWorld = 4.5;
    const spanX = (b.maxX - b.minX) + marginWorld * 2;
    const spanZ = (b.maxZ - b.minZ) + marginWorld * 2 + 3; // ruang jalan di depan
    const scale = Math.min(canvas.width / spanX, canvas.height / spanZ);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    return {
        canvas,
        scale,
        toPx: (x, z) => [canvas.width / 2 + (x - cx) * scale, canvas.height / 2 + (z - cz) * scale],
        toWorld: (px, py) => [cx + (px - canvas.width / 2) / scale, cz + (py - canvas.height / 2) / scale]
    };
};

app._drawLayoutCanvas = function () {
    const t = this._layoutTransform();
    if (!t) return;
    const { canvas, scale, toPx } = t;
    const ctx = canvas.getContext('2d');
    const ed = this._layoutEditor;
    const d = ed.data;
    const b = d.building;

    // Latar gelap (gedung melayang seperti referensi)
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Jalan di depan (z besar = bawah)
    const [roadX, roadY] = toPx(b.minX - 4, b.maxZ + 2.2);
    const [roadX2, roadY2] = toPx(b.maxX + 4, b.maxZ + 7.2);
    ctx.fillStyle = '#11161f';
    ctx.fillRect(roadX, roadY, roadX2 - roadX, roadY2 - roadY);
    ctx.strokeStyle = 'rgba(226,232,240,0.5)';
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    const [, laneY] = toPx(0, b.maxZ + 4.7);
    ctx.moveTo(roadX, laneY);
    ctx.lineTo(roadX2, laneY);
    ctx.stroke();
    ctx.setLineDash([]);
    // Trotoar
    const [swX, swY] = toPx(b.minX - 1.8, b.minZ - 1.8);
    const [swX2, swY2] = toPx(b.maxX + 1.8, b.maxZ + 1.8);
    ctx.fillStyle = '#27313f';
    ctx.fillRect(swX, swY, swX2 - swX, swY2 - swY);
    // Lantai gedung slate gelap
    const [bx, by] = toPx(b.minX, b.minZ);
    const [bx2, by2] = toPx(b.maxX, b.maxZ);
    ctx.fillStyle = '#232c38';
    ctx.fillRect(bx, by, bx2 - bx, by2 - by);
    // Tepi gedung = dinding kaca sekeliling (sian transparan + rel teal)
    ctx.strokeStyle = 'rgba(103,232,249,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bx2 - bx, by2 - by);
    ctx.strokeStyle = 'rgba(20,184,166,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 2, by - 2, bx2 - bx + 4, by2 - by + 4);
    // Zona studio (pad warna departemen + label, dari posisi meja)
    if (typeof AiOffice3D !== 'undefined' && AiOffice3D.__test
        && typeof AiOffice3D.__test.computeStudioZones === 'function') {
        try {
            const zones = AiOffice3D.__test.computeStudioZones(d.desks || [], b);
            (zones || []).forEach((z) => {
                const [zx, zy] = toPx(z.cx - z.w / 2, z.cz - z.d / 2);
                const [zx2, zy2] = toPx(z.cx + z.w / 2, z.cz + z.d / 2);
                const col = '#' + Number(z.color || 0x38bdf8).toString(16).padStart(6, '0');
                ctx.fillStyle = col + '2e';
                ctx.fillRect(zx, zy, zx2 - zx, zy2 - zy);
                ctx.strokeStyle = col + '66';
                ctx.lineWidth = 1;
                ctx.strokeRect(zx, zy, zx2 - zx, zy2 - zy);
                ctx.fillStyle = 'rgba(226,232,240,0.9)';
                ctx.font = '700 8px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(z.studio || '').toUpperCase() + ' STUDIO', (zx + zx2) / 2, zy + 10);
            });
        } catch (_) { /* zona opsional */ }
    }
    // Partisi ruangan (dari layout — bisa digeser/diperpendek/dihapus)
    ((d.partitions && d.partitions.segments) || []).forEach((seg, i) => {
        const sel = ed.selected && ed.selected.kind === 'partition' && ed.selected.index === i;
        const [sx, sy] = seg.axis === 'h' ? toPx(seg.from, seg.at) : toPx(seg.at, seg.from);
        const [ex, ey] = seg.axis === 'h' ? toPx(seg.to, seg.at) : toPx(seg.at, seg.to);
        ctx.strokeStyle = sel ? '#facc15' : 'rgba(103,232,249,0.75)';
        ctx.lineWidth = sel ? 7 : 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.lineCap = 'butt';
    });
    // Meja meeting MEMANJANG elips sumbu-X (elongated-meeting-v1)
    const mt = d.meetingTable;
    if (mt && mt.enabled !== false) {
        const [mtX, mtY] = toPx(mt.x, mt.z);
        const sel = ed.selected && ed.selected.kind === 'meeting';
        ctx.fillStyle = '#6e4a30';
        ctx.beginPath();
        ctx.ellipse(mtX, mtY, (mt.radius || 1.05) * 1.6 * scale, (mt.radius || 1.05) * 0.62 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = sel ? '#facc15' : 'rgba(15,23,42,0.55)';
        ctx.lineWidth = sel ? 3 : 1;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MEETING', mtX, mtY + 3);
    }

    // Offset lokal (lx,lz) diputar rotY dunia (samakan dengan rotLocal scene 3D)
    const rotOffset = (rot, lx, lz) => [lx * Math.cos(rot) + lz * Math.sin(rot), -lx * Math.sin(rot) + lz * Math.cos(rot)];
    const drawItem = (x, z, w, h, color, label, selected, rotY) => {
        const [px, py] = toPx(x, z);
        const pw = Math.max(8, w * scale);
        const ph = Math.max(8, h * scale);
        ctx.save();
        ctx.translate(px, py);
        if (rotY) ctx.rotate(-rotY);
        ctx.fillStyle = color;
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeStyle = selected ? '#facc15' : 'rgba(15,23,42,0.55)';
        ctx.lineWidth = selected ? 3 : 1;
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
        if (label) {
            ctx.fillStyle = '#0f172a';
            ctx.font = '600 9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, 0, 3);
        }
        ctx.restore();
    };

    // Mebel
    (d.furniture || []).forEach((f, i) => {
        const sel = ed.selected && ed.selected.kind === 'furniture' && ed.selected.index === i;
        const shapes = {
            desk: [1.3, 0.7, '#b08954', 'meja'], workdesk: [1.9, 0.95, '#d6d3cd', 'meja'],
            chair: [0.5, 0.5, '#2f3a44', 'kursi'], sofa: [2.4, 0.9, '#5b6f8c', 'sofa'],
            armchair: [0.9, 0.85, '#7a6a9a', 'kursi'], beanbag: [0.8, 0.8, '#fb923c', 'bean'],
            coffeetable: [1.3, 0.7, '#8a5a3a', 'meja'], roundtable: [0.85, 0.85, '#6e4a30', 'bundar'],
            meetingtable: [3.4, 1.3, '#6e4a30', 'meeting'], pingpong: [2.74, 1.52, '#1f5f8b', 'pingpong'],
            arcade: [0.72, 0.62, '#b54b45', 'arcade'], coffeebar: [2.2, 0.55, '#c9a876', 'kopi'],
            pantry: [2.0, 0.6, '#e7e2d8', 'dapur'], fridge: [0.75, 0.7, '#dfe3e4', 'kulkas'],
            galon: [0.42, 0.42, '#5fb4f2', 'galon'], bookshelf: [1.4, 0.4, '#6b4a32', 'rak'],
            tv: [2.0, 0.15, '#111416', 'TV'], plant: [0.5, 0.5, '#4f8a4a', 'tanaman'],
            stool: [0.34, 0.34, '#2dd4bf', 'stool'],
            tree: [1.2, 1.2, '#3f7a3c', 'pohon'], lamp: [0.3, 0.3, '#2f3336', 'lampu']
        };
        const s = shapes[f.type] || [0.6, 0.6, '#94a3b8', f.type];
        drawItem(f.x, f.z, s[0], s[1], s[2], s[3], sel, f.rotY || 0);
    });

    // Meja agen + kursi (kursi di sisi atas meja = sisi agen duduk)
    (d.desks || []).forEach((desk, i) => {
        const sel = ed.selected && ed.selected.kind === 'desk' && ed.selected.index === i;
        const dp = app._deskPos(desk);
        const co = rotOffset(dp[2], 0, -0.68);
        drawItem(dp[0] + co[0], dp[1] + co[1], 0.42, 0.42, '#1f6f6b', '', sel, dp[2]);
        drawItem(dp[0], dp[1], 1.25, 0.65, '#5b8dd9', `A${i + 1}`, sel, dp[2]);
    });

    // Label zona koridor depan
    ctx.fillStyle = 'rgba(226,232,240,0.65)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const [lzX, lzY] = toPx(b.minX + 0.3, b.maxZ - 0.35);
    ctx.fillText('KORIDOR · LOUNGE · GAME', lzX, lzY);
    const [rzX, rzY] = toPx(0.35, b.minZ + 0.6);
    ctx.fillText('MEETING TERBUKA', rzX, rzY);
};

app._layoutHitTest = function (worldX, worldZ) {
    const ed = this._layoutEditor;
    if (!ed) return null;
    const d = ed.data;
    const mt = d.meetingTable;
    if (mt && mt.enabled !== false) {
        const ea = (mt.radius || 1.05) * 1.6 + 0.25;
        const eb = (mt.radius || 1.05) * 0.62 + 0.25;
        const en = ((worldX - mt.x) / ea) ** 2 + ((worldZ - mt.z) / eb) ** 2;
        if (en <= 1) return { kind: 'meeting', index: 0 };
    }
    for (let i = (d.desks || []).length - 1; i >= 0; i--) {
        const hp = app._deskPos(d.desks[i]);
        const dxw = worldX - hp[0];
        const dzw = worldZ - hp[1];
        const lx = dxw * Math.cos(hp[2]) - dzw * Math.sin(hp[2]);
        const lz = dxw * Math.sin(hp[2]) + dzw * Math.cos(hp[2]);
        if (Math.abs(lx) <= 0.8 && lz >= -1.05 && lz <= 0.5) {
            return { kind: 'desk', index: i };
        }
    }
    for (let i = (d.furniture || []).length - 1; i >= 0; i--) {
        const f = d.furniture[i];
        if (Math.abs(worldX - f.x) <= 0.85 && Math.abs(worldZ - f.z) <= 0.85) {
            return { kind: 'furniture', index: i };
        }
    }
    const segs = (d.partitions && d.partitions.segments) || [];
    for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i];
        // Jarak titik ke segmen garis
        const ax = s.axis === 'h' ? s.from : s.at;
        const az = s.axis === 'h' ? s.at : s.from;
        const bx = s.axis === 'h' ? s.to : s.at;
        const bz = s.axis === 'h' ? s.at : s.to;
        const dx = bx - ax;
        const dz = bz - az;
        const len2 = dx * dx + dz * dz || 1;
        let tt = ((worldX - ax) * dx + (worldZ - az) * dz) / len2;
        tt = Math.max(0, Math.min(1, tt));
        const dist = Math.hypot(worldX - (ax + tt * dx), worldZ - (az + tt * dz));
        if (dist <= 0.45) return { kind: 'partition', index: i };
    }
    return null;
};

app.setupLayoutEditorEvents = function () {
    const canvas = document.getElementById('layout-canvas');
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = '1';

    const pos = (evt) => {
        const rect = canvas.getBoundingClientRect();
        const px = (evt.clientX - rect.left) * (canvas.width / rect.width);
        const py = (evt.clientY - rect.top) * (canvas.height / rect.height);
        const t = this._layoutTransform();
        return t ? t.toWorld(px, py) : [0, 0];
    };

    canvas.addEventListener('pointerdown', (evt) => {
        const ed = this._layoutEditor;
        if (!ed) return;
        const [wx, wz] = pos(evt);
        const hit = this._layoutHitTest(wx, wz);
        ed.selected = hit;
        if (hit) {
            if (hit.kind === 'partition') {
                const seg = ed.data.partitions.segments[hit.index];
                ed.drag = {
                    ...hit,
                    startWX: wx, startWZ: wz,
                    startAt: seg.at, startFrom: seg.from, startTo: seg.to, axis: seg.axis
                };
            } else if (hit.kind === 'meeting') {
                ed.drag = { ...hit, dx: wx - ed.data.meetingTable.x, dz: wz - ed.data.meetingTable.z };
            } else {
                const item = hit.kind === 'desk' ? ed.data.desks[hit.index] : ed.data.furniture[hit.index];
                const ix = hit.kind === 'desk' ? item[0] : item.x;
                const iz = hit.kind === 'desk' ? item[1] : item.z;
                ed.drag = { ...hit, dx: wx - ix, dz: wz - iz };
            }
            canvas.setPointerCapture(evt.pointerId);
        }
        this._updateLayoutSelectedInfo();
        this._drawLayoutCanvas();
    });
    canvas.addEventListener('pointermove', (evt) => {
        const ed = this._layoutEditor;
        if (!ed || !ed.drag) return;
        const [wx, wz] = pos(evt);
        if (ed.drag.kind === 'partition') {
            const seg = ed.data.partitions.segments[ed.drag.index];
            if (seg) {
                const along = ed.drag.axis === 'v' ? (wz - ed.drag.startWZ) : (wx - ed.drag.startWX);
                const across = ed.drag.axis === 'v' ? (wx - ed.drag.startWX) : (wz - ed.drag.startWZ);
                seg.at = Math.round((ed.drag.startAt + across) * 10) / 10;
                seg.from = Math.round((ed.drag.startFrom + along) * 10) / 10;
                seg.to = Math.round((ed.drag.startTo + along) * 10) / 10;
            }
        } else if (ed.drag.kind === 'meeting') {
            ed.data.meetingTable.x = Math.round((wx - ed.drag.dx) * 10) / 10;
            ed.data.meetingTable.z = Math.round((wz - ed.drag.dz) * 10) / 10;
        } else {
            const nx = Math.round((wx - ed.drag.dx) * 10) / 10;
            const nz = Math.round((wz - ed.drag.dz) * 10) / 10;
            if (ed.drag.kind === 'desk') {
                const oldRot = app._deskPos(ed.data.desks[ed.drag.index])[2];
                ed.data.desks[ed.drag.index] = [nx, nz, oldRot];
            } else {
                ed.data.furniture[ed.drag.index].x = nx;
                ed.data.furniture[ed.drag.index].z = nz;
            }
        }
        this._updateLayoutSelectedInfo();
        this._drawLayoutCanvas();
    });
    const endDrag = () => {
        if (this._layoutEditor) this._layoutEditor.drag = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const wh = document.getElementById('layout-wall-height');
    if (wh) {
        wh.addEventListener('input', () => {
            const ed = this._layoutEditor;
            if (!ed) return;
            ed.data.wallHeight = Number(wh.value);
            const val = document.getElementById('layout-wall-height-val');
            if (val) val.textContent = Number(wh.value).toFixed(2);
        });
    }
    const resizeBuilding = () => {
        const ed = this._layoutEditor;
        if (!ed) return;
        const bw = document.getElementById('layout-building-width');
        const bd = document.getElementById('layout-building-depth');
        const width = Number(bw ? bw.value : 15.8);
        const depth = Number(bd ? bd.value : 9.2);
        const cx = (ed.data.building.minX + ed.data.building.maxX) / 2;
        const cz = (ed.data.building.minZ + ed.data.building.maxZ) / 2;
        ed.data.building = {
            minX: Math.round((cx - width / 2) * 100) / 100,
            maxX: Math.round((cx + width / 2) * 100) / 100,
            minZ: Math.round((cz - depth / 2) * 100) / 100,
            maxZ: Math.round((cz + depth / 2) * 100) / 100
        };
        this._syncLayoutEditorControls();
        this._drawLayoutCanvas();
    };
    const bwEl = document.getElementById('layout-building-width');
    const bdEl = document.getElementById('layout-building-depth');
    if (bwEl) bwEl.addEventListener('input', resizeBuilding);
    if (bdEl) bdEl.addEventListener('input', resizeBuilding);

    const addBtn = document.getElementById('layout-add-furniture');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed) return;
            const type = (document.getElementById('layout-furniture-type') || {}).value || 'plant';
            ed.data.furniture = ed.data.furniture || [];
            ed.data.furniture.push({
                id: 'f' + Date.now().toString(36),
                type,
                x: 0,
                z: 0,
                rotY: 0
            });
            ed.selected = { kind: 'furniture', index: ed.data.furniture.length - 1 };
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const rotateBtn = document.getElementById('layout-rotate-item');
    if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed || !ed.selected) return;
            if (ed.selected.kind === 'partition') {
                // Ganti arah vertikal <-> horizontal (pusat & panjang dipertahankan)
                const seg = ed.data.partitions.segments[ed.selected.index];
                if (seg) {
                    const center = seg.axis === 'v' ? seg.at : (seg.from + seg.to) / 2;
                    const mid = (seg.from + seg.to) / 2;
                    const half = (seg.to - seg.from) / 2;
                    if (seg.axis === 'v') {
                        seg.axis = 'h';
                        seg.at = Math.round(mid * 10) / 10;
                        seg.from = Math.round((center - half) * 10) / 10;
                        seg.to = Math.round((center + half) * 10) / 10;
                    } else {
                        seg.axis = 'v';
                        seg.at = Math.round(mid * 10) / 10;
                        seg.from = Math.round((center - half) * 10) / 10;
                        seg.to = Math.round((center + half) * 10) / 10;
                    }
                }
            } else if (ed.selected.kind === 'desk') {
                const cur = app._deskPos(ed.data.desks[ed.selected.index]);
                let nextRot = cur[2] + Math.PI / 4;
                if (nextRot > Math.PI) nextRot -= Math.PI * 2;
                ed.data.desks[ed.selected.index] = [cur[0], cur[1], Math.round(nextRot * 100) / 100];
            } else if (ed.selected.kind === 'furniture') {
                const f = ed.data.furniture[ed.selected.index];
                if (f) {
                    let next = (f.rotY || 0) + Math.PI / 4;
                    if (next > Math.PI) next -= Math.PI * 2;
                    f.rotY = Math.round(next * 100) / 100;
                }
            } else {
                this.showToast('Item ini tidak bisa diputar.', 'yellow');
                return;
            }
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const deleteBtn = document.getElementById('layout-delete-item');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed || !ed.selected) return;
            if (ed.selected.kind === 'furniture') {
                ed.data.furniture.splice(ed.selected.index, 1);
            } else if (ed.selected.kind === 'partition') {
                ed.data.partitions.segments.splice(ed.selected.index, 1);
            } else if (ed.selected.kind === 'meeting') {
                ed.data.meetingTable.enabled = false;
            } else if (ed.data.desks.length > 1) {
                ed.data.desks.splice(ed.selected.index, 1);
            } else {
                this.showToast('Minimal satu meja agen harus ada.', 'yellow');
                return;
            }
            ed.selected = null;
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const addPartitionBtn = document.getElementById('layout-add-partition');
    if (addPartitionBtn) {
        addPartitionBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed) return;
            if (!ed.data.partitions) ed.data.partitions = { segments: [] };
            if (ed.data.partitions.segments.length >= 12) {
                this.showToast('Maksimal 12 segmen partisi.', 'yellow');
                return;
            }
            ed.data.partitions.segments.push({ axis: 'v', at: 0, from: -2, to: 2 });
            ed.selected = { kind: 'partition', index: ed.data.partitions.segments.length - 1 };
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const addMeetingBtn = document.getElementById('layout-add-meeting');
    if (addMeetingBtn) {
        addMeetingBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed) return;
            if (!ed.data.meetingTable) {
                ed.data.meetingTable = { x: 3.0, z: -3.1, radius: 1.05, enabled: true };
            } else {
                ed.data.meetingTable.enabled = true;
            }
            ed.selected = { kind: 'meeting', index: 0 };
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const resizePartition = (delta) => {
        const ed = this._layoutEditor;
        if (!ed || !ed.selected) return;
        if (ed.selected.kind !== 'partition') {
            this.showToast('Perpendek/Perpanjang hanya untuk partisi terpilih.', 'yellow');
            return;
        }
        const seg = ed.data.partitions.segments[ed.selected.index];
        if (!seg) return;
        const mid = (seg.from + seg.to) / 2;
        let half = (seg.to - seg.from) / 2 + delta / 2;
        half = Math.max(0.25, half);
        seg.from = Math.round((mid - half) * 10) / 10;
        seg.to = Math.round((mid + half) * 10) / 10;
        this._updateLayoutSelectedInfo();
        this._drawLayoutCanvas();
    };
    const shortenBtn = document.getElementById('layout-shorten-item');
    if (shortenBtn) shortenBtn.addEventListener('click', () => resizePartition(-1));
    const lengthenBtn = document.getElementById('layout-lengthen-item');
    if (lengthenBtn) lengthenBtn.addEventListener('click', () => resizePartition(1));
    const addDeskBtn = document.getElementById('layout-add-desk');
    if (addDeskBtn) {
        addDeskBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed) return;
            if (ed.data.desks.length >= 12) {
                this.showToast('Maksimal 12 meja agen.', 'yellow');
                return;
            }
            ed.data.desks.push([-1, 1.8, 0]);
            ed.selected = { kind: 'desk', index: ed.data.desks.length - 1 };
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const removeDeskBtn = document.getElementById('layout-remove-desk');
    if (removeDeskBtn) {
        removeDeskBtn.addEventListener('click', () => {
            const ed = this._layoutEditor;
            if (!ed) return;
            if (ed.data.desks.length <= 1) {
                this.showToast('Minimal satu meja agen harus ada.', 'yellow');
                return;
            }
            ed.data.desks.pop();
            ed.selected = null;
            this._updateLayoutSelectedInfo();
            this._drawLayoutCanvas();
        });
    }
    const resetBtn = document.getElementById('layout-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            this._layoutEditor = { data: this._layoutDefaultData(), selected: null, drag: null };
            this._syncLayoutEditorControls();
            this._drawLayoutCanvas();
            this.showToast('Layout dikembalikan ke bawaan — klik Simpan Layout untuk memakai.', 'indigo');
        });
    }
    const saveBtn = document.getElementById('layout-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveOfficeLayout());
    }
    const saveDefaultBtn = document.getElementById('layout-save-default');
    if (saveDefaultBtn) {
        saveDefaultBtn.addEventListener('click', () => this.saveLayoutAsDefault());
    }
    const openBtn = document.getElementById('layout-open-office');
    if (openBtn) {
        openBtn.addEventListener('click', () => this.switchView('mission'));
    }
};

app.saveOfficeLayout = async function () {
    const ed = this._layoutEditor;
    if (!ed) return;
    try {
        const data = await api.put('/api/ai/settings', { officeLayout: ed.data });
        if (!data.success) {
            this.showToast(data.message || 'Gagal menyimpan layout.', 'red');
            return;
        }
        if (!appState.office.settings) appState.office.settings = {};
        appState.office.settings.officeLayout = data.settings.officeLayout;
        this.applySavedOfficeLayout(true);
        const status = document.getElementById('layout-editor-status');
        if (status) status.textContent = 'Layout tersimpan dan sudah diterapkan ke kantor 3D.';
        this.showToast('Layout kantor disimpan & diterapkan.', 'emerald');
    } catch (e) {
        this.showToast('Gagal menyimpan layout.', 'red');
    }
};

/** "Save to Default": simpan layout editan sebagai DEFAULT workspace persisten
 *  di server (settings.defaultOfficeLayout) sekaligus layout aktif, sehingga
 *  Reset bawaan kembali ke layout ini & kantor langsung memakainya. */
app.saveLayoutAsDefault = async function () {
    const ed = this._layoutEditor;
    if (!ed) return;
    try {
        const data = await api.put('/api/ai/settings', { defaultOfficeLayout: ed.data, officeLayout: ed.data });
        if (!data.success) {
            this.showToast(data.message || 'Gagal menyimpan default.', 'red');
            return;
        }
        if (!appState.office.settings) appState.office.settings = {};
        appState.office.settings.defaultOfficeLayout = data.settings.defaultOfficeLayout;
        appState.office.settings.officeLayout = data.settings.officeLayout;
        this.applySavedOfficeLayout(true);
        const status = document.getElementById('layout-editor-status');
        if (status) status.textContent = 'Layout ini sekarang DEFAULT workspace - Reset bawaan akan kembali ke layout ini.';
        this.showToast('Layout disimpan sebagai default workspace.', 'emerald');
    } catch (e) {
        this.showToast('Gagal menyimpan layout sebagai default.', 'red');
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
    lucide.createIcons();
};

app.loadAndRenderInsights = async function (containerId) {
    if (typeof PiksOfficeApi !== 'undefined') return PiksOfficeApi.loadAndRenderInsights(this, containerId);
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

app._knownSkillsFallback = [
    { id: 'piks-digital-lab-ai-employee', label: "PiK's Digital Lab — Tim Konten" },
    { id: 'caption-hook', label: 'Caption & Hook (Dimas)' },
    { id: 'compliance-check', label: 'Compliance Check (Nadira)' },
    { id: 'analytics-next-brief', label: 'Analytics → Brief Berikutnya (Bimo → Rani)' }
];

app._collectRoleSkillsFromUi = function () {
    const root = document.getElementById('office-role-skills');
    if (!root) return {};
    const skills = appState.office.knownSkills?.length ? appState.office.knownSkills : this._knownSkillsFallback;
    const map = {};
    root.querySelectorAll('.office-role-perm-row').forEach(row => {
        const roleId = row.dataset.roleId;
        if (!roleId) return;
        const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
        // Semua centang atau nol centang → tidak dibatasi (omit), pola rolePermissions.
        if (checked.length > 0 && checked.length < skills.length) {
            map[roleId] = checked;
        }
    });
    return map;
};

app.renderOfficeRoleSkills = function () {
    const root = document.getElementById('office-role-skills');
    if (!root) return;
    const skills = appState.office.knownSkills?.length ? appState.office.knownSkills : this._knownSkillsFallback;
    const perms = (appState.office.settings && appState.office.settings.roleSkills) || {};
    const employees = appState.office.employees || [];
    root.innerHTML = employees.map(emp => {
        const allowed = Object.prototype.hasOwnProperty.call(perms, emp.id) ? perms[emp.id] : null;
        const checks = skills.map(s => {
            const on = allowed == null ? true : allowed.includes(s.id);
            return `<label><input type="checkbox" value="${this._escapeHtml(s.id)}" ${on ? 'checked' : ''}> ${this._escapeHtml(s.label || s.id)}</label>`;
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
    this.renderOfficeRoleSkills();
    const llm = s.llm || {};
    const llmProv = document.getElementById('office-llm-provider');
    const llmModel = document.getElementById('office-llm-model');
    const llmKey = document.getElementById('office-llm-api-key');
    const llmHint = document.getElementById('office-llm-key-hint');
    const llmClear = document.getElementById('office-llm-clear-key');
    if (llmProv) llmProv.value = llm.provider || 'gemini';
    if (llmModel) llmModel.value = llm.model || '';
    if (llmKey) llmKey.value = '';
    if (llmClear) llmClear.checked = false;
    this._applyLlmProviderDefaults(llmProv?.value || llm.provider || 'gemini', !llm.model);
    if (llmHint) {
        if (llm.decryptFailed) {
            llmHint.textContent = llm.hint || 'Key tidak bisa dibuka — TOKEN_ENCRYPTION_KEY berubah. Tempel ulang API key lalu Simpan.';
        } else if (llm.configured) {
            const src = llm.keySource === 'env' ? ' (dari env server)' : '';
            llmHint.textContent = `Key tersimpan: ${llm.apiKeyMasked || '••••'}${src} — isi field untuk mengganti.`;
        } else {
            llmHint.textContent = llm.hint || 'Belum ada API key. Tempel Gemini/Groq di sini, atau set GEMINI_API_KEY di Vercel env.';
        }
    }
    this._syncCeoChatLlmHint(llm);
    if (status) {
        status.textContent = s.emergencyPause
            ? '⛔ Jeda darurat AKTIF — agen tidak boleh publish.'
            : `Otonomi: ${s.autonomyLevel} · cap ${s.dailyPostCap}/hari` +
                (n.enabled ? ' · notifikasi on' : '') +
                (llm.configured ? ` · LLM ${llm.provider}` : ' · LLM belum dikonfigurasi');
    }
    if (pauseBtn) {
        pauseBtn.textContent = s.emergencyPause ? 'Lepas jeda' : 'Jeda darurat';
        pauseBtn.classList.toggle('btn-danger', !s.emergencyPause);
        pauseBtn.classList.toggle('btn-secondary', !!s.emergencyPause);
    }
    this.renderDepartmentStructure();
};

/* ---- Struktur Departemen & Spesialis (konsep tenaga kerja per studio) ---- */
app._deptSkillByRole = {
    manager: 'piks-digital-lab-ai-employee · general-tasks',
    strategist: 'analytics-next-brief (penerus Bimo)',
    copywriter: 'caption-hook',
    'visual-producer': '— (brief & arahan Maya/Rani)',
    'community-manager': '— (eskalasi ke Maya/manusia)',
    analyst: 'analytics-next-brief',
    compliance: 'compliance-check',
    sales: 'general-tasks (outreach via email/whatsapp)',
    finance: 'general-tasks (spreadsheet/dokumen)',
    product: 'general-tasks (riset web/dokumen)',
    people: 'general-tasks (dokumen)'
};

app.renderDepartmentStructure = async function () {
    const treeEl = document.getElementById('dept-structure-tree');
    if (!treeEl) return;
    if (!appState.departments) {
        try {
            const data = await api.get('/api/ai/departments');
            if (data.success) appState.departments = data.departments;
        } catch { /* abaikan — tampilkan pesan di bawah */ }
    }
    const depts = appState.departments;
    if (!depts) {
        treeEl.innerHTML = '<p class="input-hint">Struktur belum bisa dimuat.</p>';
        return;
    }
    const esc = (v) => this._escapeHtml(v == null ? '' : String(v));
    const employees = appState.office?.employees || [];
    treeEl.innerHTML = depts.map(d => `
        <div class="dept-node" style="--dept-color:${esc(d.color)}">
            <div class="dept-node-head">
                <span class="dept-node-emoji">${esc(d.emoji)}</span>
                <div class="dept-node-title"><strong>${esc(d.name)}</strong><span>${esc(d.studio)}</span></div>
                ${d.comingSoon ? '<span class="badge badge-yellow">Segera hadir</span>' : `<span class="badge badge-indigo">${d.specialists.length} spesialis</span>`}
            </div>
            <p class="dept-node-desc">${esc(d.description)}</p>
            ${d.comingSoon
                ? '<p class="input-hint">Belum ada agen di studio ini. Tugas terkait masih ditangani Maya (Operations) sebagai tugas umum.</p>'
                : `<div class="dept-specialists">${d.specialists.map(sp => {
                    const emp = employees.find(e => e.id === sp.id);
                    const status = emp?.status || emp?.state || '—';
                    return `<button type="button" class="dept-specialist" data-role-id="${esc(sp.id)}">
                        <span>${esc(sp.emoji)} <strong>${esc(sp.name)}</strong> — ${esc(sp.title)}</span>
                        <span class="badge badge-indigo">${esc(status)}</span>
                    </button>`;
                }).join('')}</div>`}
        </div>`).join('');
    treeEl.querySelectorAll('.dept-specialist').forEach(btn => {
        btn.addEventListener('click', () => this.openSpecialistProfile(btn.getAttribute('data-role-id')));
    });
};

/** Profil spesialis + tombol chat (memakai Chat CEO existing dengan roleId). */
app.openSpecialistProfile = function (roleId) {
    const box = document.getElementById('dept-specialist-profile');
    if (!box || !roleId) return;
    const depts = appState.departments || [];
    let dept = null;
    let sp = null;
    for (const d of depts) {
        const found = (d.specialists || []).find(s => s.id === roleId);
        if (found) { dept = d; sp = found; break; }
    }
    if (!sp) return;
    const esc = (v) => this._escapeHtml(v == null ? '' : String(v));
    const emp = (appState.office?.employees || []).find(e => e.id === roleId);
    const status = emp?.status || emp?.state || '—';
    const platforms = (sp.defaultPlatforms || []).length ? sp.defaultPlatforms.join(', ') : 'Lintas platform';
    box.innerHTML = `
        <div class="dept-profile">
            <div class="dept-profile-head">
                <span class="dept-node-emoji">${esc(sp.emoji)}</span>
                <div><strong>${esc(sp.name)}</strong> — ${esc(sp.title)}<br>
                <span class="input-hint">${esc(dept.emoji)} ${esc(dept.name)} · ${esc(dept.studio)} · status: ${esc(status)}</span></div>
            </div>
            <dl class="about-agent-meta">
                <div><dt>Output</dt><dd>${esc(sp.outputs || '-')}</dd></div>
                <div><dt>Platform bawaan</dt><dd>${esc(platforms)}</dd></div>
                <div><dt>Skill</dt><dd><code>${esc(this._deptSkillByRole[roleId] || '—')}</code></dd></div>
            </dl>
            <div class="office-settings-actions">
                <button type="button" class="btn btn-sm btn-primary" id="dept-profile-chat">💬 Chat dengan ${esc(sp.name)}</button>
                <button type="button" class="btn btn-sm btn-secondary" id="dept-profile-close">Tutup profil</button>
            </div>
            <p class="input-hint">Chat memakai panel Chat CEO (butuh LLM terkonfigurasi). Hasil kerja tetap ditinjau manusia di Work Board — approve/force hanya admin/approver.</p>
        </div>`;
    const chatBtn = document.getElementById('dept-profile-chat');
    if (chatBtn) {
        chatBtn.addEventListener('click', () => {
            this.switchView('mission');
            if (this.setMissionTab) this.setMissionTab('chat');
            /* Opsi peran dibangun _fillCeoChatRoles saat tab chat aktif —
               terapkan pilihan sesudahnya agar tidak tertimpa rebuild. */
            setTimeout(() => {
                if (this._fillCeoChatRoles) this._fillCeoChatRoles();
                const roleSelect = document.getElementById('ceo-chat-role');
                if (roleSelect) roleSelect.value = roleId;
                const chatBox = document.getElementById('ceo-chat');
                if (chatBox) chatBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const input = document.getElementById('ceo-chat-input');
                if (input) input.focus();
            }, 400);
        });
    }
    const closeBtn = document.getElementById('dept-profile-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { box.innerHTML = ''; });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        const roleSkills = this._collectRoleSkillsFromUi();
        const llm = {
            provider: document.getElementById('office-llm-provider')?.value || 'gemini',
            model: document.getElementById('office-llm-model')?.value?.trim() || undefined,
            clearApiKey: !!document.getElementById('office-llm-clear-key')?.checked
        };
        const apiKeyVal = document.getElementById('office-llm-api-key')?.value?.trim();
        if (apiKeyVal) llm.apiKey = apiKeyVal;

        const data = await api.put('/api/ai/settings', {
            autonomyLevel,
            dailyPostCap,
            notifications,
            rolePermissions,
            roleSkills,
            llm
        });
        if (!data.success) {
            this.showToast(data.message || 'Gagal simpan settings.', 'red');
            return;
        }
        appState.office.settings = data.settings;
        this.renderOfficeSettings();
        this.showToast('Settings Tim Konten & LLM disimpan.', 'emerald');
    } catch (e) {
        this.showToast('Gagal simpan settings.', 'red');
    }
};

app._llmProviderDefaults = {
    gemini: { model: 'gemini-2.5-flash-lite', hint: 'Free tier — aistudio.google.com (lite lebih jarang overload)' },
    groq: { model: 'llama-3.3-70b-versatile', hint: 'Free tier — console.groq.com' },
    cursor: { model: 'composer-2.5', hint: 'CURSOR_API_KEY dari Cursor Dashboard' },
    openai: { model: 'gpt-4o-mini', hint: 'platform.openai.com' },
    anthropic: { model: 'claude-sonnet-4-20250514', hint: 'console.anthropic.com' }
};

app._applyLlmProviderDefaults = function (provider, forceModel) {
    const def = this._llmProviderDefaults[provider] || this._llmProviderDefaults.gemini;
    const model = document.getElementById('office-llm-model');
    const provHint = document.getElementById('office-llm-provider-hint');
    const list = document.getElementById('office-llm-model-list');
    if (provHint) provHint.textContent = def.hint;
    if (forceModel && model) model.value = def.model;
    if (list) {
        const models = {
            gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'],
            groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
            cursor: ['composer-2.5', 'composer-2'],
            openai: ['gpt-4o-mini', 'gpt-4o'],
            anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest']
        }[provider] || [];
        list.innerHTML = models.map(m => `<option value="${m}"></option>`).join('');
    }
};

app._syncCeoChatLlmHint = function (llm) {
    const hint = document.getElementById('ceo-chat-llm-hint');
    if (!hint) return;
    if (llm && llm.decryptFailed) {
        hint.textContent = 'Key rusak/enkripsi — simpan ulang di Pengaturan → LLM.';
        hint.classList.remove('is-ready');
    } else if (llm && llm.configured) {
        const src = llm.keySource === 'env' ? 'env' : (llm.apiKeyMasked || 'key ok');
        hint.textContent = `LLM siap · ${llm.provider} · ${src}`;
        hint.classList.add('is-ready');
    } else {
        hint.textContent = 'Atur API key di Pengaturan → LLM (atau GEMINI_API_KEY di Vercel).';
        hint.classList.remove('is-ready');
    }
};

app._fillCeoChatRoles = function () {
    const sel = document.getElementById('ceo-chat-role');
    if (!sel) return;
    const employees = appState.office.employees || [];
    const cur = sel.value;
    if (!employees.length) return;
    sel.innerHTML = employees.map(e =>
        `<option value="${e.id}">${this._escapeHtml(e.name)} — ${this._escapeHtml(e.title || e.id)}</option>`
    ).join('');
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
};

app.renderCeoChatMessages = function (messages) {
    const ul = document.getElementById('ceo-chat-messages');
    if (!ul) return;
    const list = messages || appState.office.chatMessages || [];
    if (!list.length) {
        ul.innerHTML = '<li class="ceo-chat-empty">Belum ada percakapan. Ketik perintah sebagai CEO.</li>';
        return;
    }
    ul.innerHTML = list.map(m => {
        const who = m.role === 'user'
            ? 'CEO'
            : (m.employeeName || m.roleId || 'AI');
        const cls = m.role === 'user' ? 'is-ceo' : 'is-ai';
        return `<li class="ceo-chat-bubble ${cls}">
            <span class="ceo-chat-who">${this._escapeHtml(who)}</span>
            <div class="ceo-chat-text">${this._escapeHtml(m.content || '').replace(/\n/g, '<br>')}</div>
        </li>`;
    }).join('');
    ul.scrollTop = ul.scrollHeight;
};

app.loadCeoChat = async function () {
    try {
        this._fillCeoChatRoles();
        const data = await api.get('/api/ai/chat?limit=80');
        if (!data.success) return;
        appState.office.chatMessages = data.messages || [];
        if (data.llm) {
            appState.office.settings = {
                ...(appState.office.settings || {}),
                llm: data.llm
            };
            this._syncCeoChatLlmHint(data.llm);
        }
        this.renderCeoChatMessages(appState.office.chatMessages);
    } catch (e) {
        /* ignore */
    }
};

app.sendCeoChat = async function (text) {
    const input = document.getElementById('ceo-chat-input');
    const sendBtn = document.getElementById('ceo-chat-send');
    const roleId = document.getElementById('ceo-chat-role')?.value || 'manager';
    const message = (text || input?.value || '').trim();
    if (!message) return;
    if (sendBtn) sendBtn.disabled = true;
    try {
        const data = await api.post('/api/ai/chat', { message, roleId });
        if (input) input.value = '';
        if (data.messages && data.messages.length) {
            appState.office.chatMessages = [
                ...(appState.office.chatMessages || []),
                ...data.messages
            ].slice(-200);
        }
        this.renderCeoChatMessages(appState.office.chatMessages);
        if (data.crewPresence) {
            appState.office.crewPresence = data.crewPresence;
        }
        // Refresh office + 3D agar karyawan benar-benar pindah posisi
        await this.loadOfficeFromServer();
        this.renderOfficeEmployees();
        if (typeof this.renderMissionCrew === 'function') this.renderMissionCrew();
        if (typeof this.updateMissionPills === 'function') this.updateMissionPills();
        this.syncOffice3DEmployees();
        if (data.job) {
            this.showToast(`Job dibuat: ${data.job.status}`, 'emerald');
        } else if (data.schedule?.at) {
            const clock = (() => {
                try {
                    const d = new Date(data.schedule.at);
                    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                } catch { return ''; }
            })();
            this.showToast(`Dijadwalkan ${clock || 'nanti'}: perintah kantor.`, 'emerald');
        } else if (data.crewPresence?.lastAction?.mode === 'at_desk') {
            const ids = data.crewPresence.lastAction.roleIds;
            this.showToast(
                ids?.length ? `${ids.join(', ')} → meja.` : 'Tim pindah ke meja kerja.',
                'emerald'
            );
        } else if (data.crewPresence?.lastAction?.mode === 'idle') {
            const ids = data.crewPresence.lastAction.roleIds;
            this.showToast(
                ids?.length ? `${ids.join(', ')} istirahat.` : 'Tim istirahat.',
                'emerald'
            );
        }
        if (!data.success && data.message) {
            this.showToast(data.message, 'red');
            if (data.messages) {
                appState.office.chatMessages = [
                    ...(appState.office.chatMessages || []).filter(m => !data.messages.find(n => n.id === m.id)),
                    ...data.messages
                ];
                this.renderCeoChatMessages(appState.office.chatMessages);
            }
        }
    } catch (e) {
        this.showToast(e.message || 'Gagal kirim chat.', 'red');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
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

/** Terapkan officeLayout tersimpan ke scene 3D (sekali per perubahan data). */
app.applySavedOfficeLayout = function (force) {
    if (typeof AiOffice3D === 'undefined' || typeof AiOffice3D.setLayout !== 'function') return;
    const saved = appState.office.settings
        && (appState.office.settings.officeLayout || appState.office.settings.defaultOfficeLayout);
    if (!saved) return;
    const key = JSON.stringify(saved);
    if (!force && appState.office.appliedLayoutJson === key) return;
    appState.office.appliedLayoutJson = key;
    AiOffice3D.setLayout(saved);
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
    // Terapkan layout kantor custom tersimpan (bila ada) sebelum scene dibangun
    this.applySavedOfficeLayout();
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
    const items = Array.isArray(rows) ? rows : (typeof AiOffice3D !== 'undefined' && AiOffice3D.getActivitySnapshot
        ? AiOffice3D.getActivitySnapshot()
        : []);
    appState.office.activityLive = items;
    // Speech 3D berubah (onActivity) → panel kiri ikut segar tanpa menunggu polling.
    if (typeof this.renderMissionWorkingPanel === 'function') this.renderMissionWorkingPanel();
    const list = document.getElementById('office-activity-live');
    if (!list) return;
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
            const when = e.createdAt ? this._formatDateTime24(e.createdAt) : '';
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
    if (typeof AiOffice3D !== 'undefined' && typeof AiOffice3D.setFocusedRole === 'function') {
        AiOffice3D.setFocusedRole(roleId);
    }
    const select = document.getElementById('office-role-select');
    if (select) select.value = roleId;

    const emp = (appState.office.employees || []).find(e => e.id === roleId);
    if (emp?.latestJob) {
        appState.office.selectedJobId = emp.latestJob.id;
    }

    // Aman bila kartu .office-employee-card tidak ada di DOM (querySelectorAll
    // mengembalikan NodeList kosong) — fokus tetap berlaku untuk Mission Crew
    // dan panel Detail Job di Kantor AI.
    document.querySelectorAll('.office-employee-card').forEach(card => {
        card.classList.toggle('is-focused', card.dataset.roleId === roleId);
    });
    document.querySelectorAll('.mission-crew-card').forEach(card => {
        card.classList.toggle('is-focused', card.getAttribute('data-role-id') === roleId);
    });

    this.renderOfficeBoard();
    this.renderOfficeAnswerPanel();

    if (appState.currentView === 'mission') {
        this.setMissionWorkboardOpen(true);
    }

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
        standby: 'Di meja',
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
        standby: 'badge-violet',
        publishing: 'badge-violet',
        done: 'badge-emerald',
        failed: 'badge-red'
    };
    return map[status] || 'badge-indigo';
};

app.renderOfficeEmployees = function () {
    // Grid Tim Konten AI sudah tidak ada di halaman Kantor AI (tim tampil di
    // Mission Control via renderMissionCrew). Fungsi dipertahankan untuk
    // pemanggil lama (polling, renderOffice, chat CEO) — aman no-op bila
    // grid tidak ada di DOM.
    const grid = document.getElementById('office-employees-grid');
    const empty = document.getElementById('office-employees-empty');
    if (!grid) return;

    grid.querySelectorAll('.office-employee-card').forEach(el => el.remove());
    const employees = appState.office.employees || [];
    if (employees.length === 0) {
        if (empty) {
            empty.classList.remove('hidden');
            const emptyText = empty.querySelector('p');
            if (emptyText) emptyText.textContent = 'Belum ada peran terdaftar.';
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
                // Klik kartu kanban Work Board → modal detail job di tempat,
                // tidak lagi pindah ke halaman Kantor AI.
                this.openJobDetailModal(job.id);
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

/** Cari job dari daftar penuh, fallback ke ringkasan board. */
app._findOfficeJob = function (jobId) {
    return (appState.aiJobs || []).find(j => j.id === jobId)
        || Object.values(appState.office.board || {}).flat().find(j => j.id === jobId)
        || null;
};

/** Modal detail job — dibuka dari klik kartu kanban Work Board (tanpa pindah halaman). */
app.openJobDetailModal = function (jobId) {
    const overlay = document.getElementById('job-detail-modal');
    if (!overlay) return;
    const job = this._findOfficeJob(jobId);
    if (!job) {
        this.showToast('Job tidak ditemukan.', 'red');
        return;
    }
    appState.office.selectedJobId = job.id;
    this._renderJobDetailModal(job);
    overlay.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

app.closeJobDetailModal = function () {
    const overlay = document.getElementById('job-detail-modal');
    if (overlay) overlay.classList.add('hidden');
};

/** Isi ulang modal dari data terbaru (setelah jawaban / approve / publish). */
app._refreshJobDetailModal = function () {
    const overlay = document.getElementById('job-detail-modal');
    if (!overlay || overlay.classList.contains('hidden')) return;
    const job = this._findOfficeJob(appState.office.selectedJobId);
    if (!job) {
        this.closeJobDetailModal();
        return;
    }
    this._renderJobDetailModal(job);
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

app._renderJobDetailModal = function (job) {
    const body = document.getElementById('job-detail-modal-body');
    const footer = document.getElementById('job-detail-modal-footer');
    const badge = document.getElementById('job-detail-status');
    if (!body || !footer) return;

    if (badge) {
        badge.textContent = this._statusLabel(job.status);
        badge.className = `badge ${this._statusBadge(job.status)}`;
    }

    const esc = (v) => this._escapeHtml(v == null ? '' : String(v));
    const fmtDate = (v) => {
        if (!v) return '-';
        const d = new Date(v);
        return Number.isNaN(d.getTime())
            ? '-'
            : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const emp = (appState.office.employees || []).find(e => e.id === job.roleId);
    const who = emp
        ? `${emp.emoji || ''} ${emp.name} — ${emp.title}`
        : (job.employeeName || job.roleId || 'AI');
    const platforms = Array.isArray(job.platforms) && job.platforms.length
        ? job.platforms.join(', ')
        : '-';

    let statusHtml = '';
    if (job.status === 'needs_info') {
        const questions = job.questions || [];
        statusHtml = questions.length
            ? `<div class="job-detail-section">
                    <p class="details-meta-label">Pertanyaan klarifikasi</p>
                    ${questions.map((q, i) => `
                        <div class="form-group">
                            <label for="job-detail-answer-${i}">${esc(q)}</label>
                            <textarea id="job-detail-answer-${i}" class="form-control job-detail-answer-input" rows="2" data-index="${i}" required></textarea>
                        </div>`).join('')}
                </div>`
            : '<p class="text-secondary font-sm">Lengkapi brief lalu kirim jawaban.</p>';
    } else if (job.status === 'awaiting_approval') {
        statusHtml = '<p class="text-secondary font-sm">Menunggu persetujuan manusia (otonomi / high-risk / cap / jeda). Setujui untuk publish.</p>';
    } else if (job.status === 'failed') {
        statusHtml = '<p class="text-secondary font-sm">Publish gagal. Perbaiki lalu coba lagi.</p>';
    } else if (job.status === 'queued') {
        statusHtml = '<p class="text-secondary font-sm">Job siap. Jalankan publish (gate otonomi tetap berlaku).</p>';
    } else if (job.status === 'publishing') {
        statusHtml = '<p class="text-secondary font-sm">Sedang publish…</p>';
    } else if (job.status === 'done') {
        statusHtml = '<p class="text-secondary font-sm">Job selesai. Bisa dijalankan ulang jika perlu.</p>';
    }

    const captionHtml = job.caption && job.caption !== job.brief
        ? `<div class="job-detail-section">
                <p class="details-meta-label">Caption</p>
                <p class="font-sm">${esc(job.caption)}</p>
            </div>`
        : '';

    // Riwayat draf & versi (adopsi kantor-ai) — backend sudah menyimpan draftHistory.
    const historyLabels = {
        created: 'Job dibuat', answer: 'Jawaban klarifikasi', draft: 'Draf diserahkan',
        revision: 'Revisi diminta', approved: 'Disetujui',
        run_start: 'Mulai publish', run_done: 'Publish selesai', run_failed: 'Publish gagal'
    };
    const historyEntries = (Array.isArray(job.draftHistory) ? job.draftHistory : [])
        .filter(h => h && typeof h === 'object')
        .slice()
        .reverse();
    const activeVersionLabel = `v${job.version || 1}`;
    const historyHtml = historyEntries.length
        ? `<div class="job-detail-section">
                <p class="details-meta-label">Riwayat Draf &amp; Versi (${historyEntries.length})</p>
                <div class="draft-history-list">
                    ${historyEntries.map(h => {
                        const isActive = h.version === activeVersionLabel;
                        const text = h.revisionNote || h.caption || h.brief || (Array.isArray(h.answers) ? h.answers.join(' · ') : '') || h.lastError || '';
                        return `<div class="draft-history-item${isActive ? ' is-active' : ''}">
                            <div class="draft-history-head">
                                <span class="badge ${isActive ? 'badge-emerald' : 'badge-indigo'}">${esc(h.version || '—')}</span>
                                <strong>${esc(historyLabels[h.type] || h.type || 'Draf')}</strong>
                                ${isActive ? '<span class="badge badge-amber">versi aktif</span>' : ''}
                                <span class="draft-history-date">${esc(fmtDate(h.at))}</span>
                            </div>
                            ${text ? `<p class="draft-history-text">${esc(text.length > 280 ? text.slice(0, 277) + '…' : text)}</p>` : ''}
                            ${h.type === 'revision' && h.previousCaption && h.previousCaption !== text ? `<p class="draft-history-text draft-history-prev">Draf sebelumnya: ${esc(h.previousCaption.length > 180 ? h.previousCaption.slice(0, 177) + '…' : h.previousCaption)}</p>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`
        : '';

    const revisionBannerHtml = job.revisionNote && job.status === 'queued'
        ? `<div class="job-detail-section draft-revision-banner">
                <p class="details-meta-label">Revisi diminta — catatan untuk agen</p>
                <p class="font-sm">${esc(job.revisionNote)}</p>
            </div>`
        : '';

    const revisionFormHtml = job.status === 'awaiting_approval'
        ? `<div class="job-detail-section">
                <p class="details-meta-label">Minta revisi draf ${esc(activeVersionLabel)}</p>
                <textarea id="job-detail-revision-note" class="form-control" rows="2" placeholder="Tulis apa yang harus diubah agen pada draf ini…"></textarea>
                <p class="font-xs text-secondary" style="margin:6px 0 0;">Job kembali ke antrean; draf ${esc(activeVersionLabel)} tetap tersimpan di riwayat di bawah.</p>
            </div>`
        : '';

    body.innerHTML = `
        <div class="job-detail-section">
            <p class="details-meta-label">Brief</p>
            <p class="font-sm">${esc(job.brief || '(tanpa brief)')}</p>
        </div>
        ${captionHtml}
        <div class="details-meta-row">
            <div class="details-meta-item"><span class="details-meta-label">Karyawan</span><span class="details-meta-value">${esc(who)}</span></div>
            <div class="details-meta-item"><span class="details-meta-label">Platform</span><span class="details-meta-value">${esc(platforms)}</span></div>
        </div>
        <div class="details-meta-row">
            <div class="details-meta-item"><span class="details-meta-label">ID Job</span><span class="details-meta-value">${esc(job.id)} · v${job.version || 1}</span></div>
            <div class="details-meta-item"><span class="details-meta-label">Diperbarui</span><span class="details-meta-value">${esc(fmtDate(job.updatedAt || job.createdAt))}</span></div>
        </div>
        ${job.lastError ? `<p class="font-sm text-danger job-detail-error">Error: ${esc(job.lastError)}</p>` : ''}
        ${statusHtml}
        ${revisionBannerHtml}
        ${revisionFormHtml}
        ${historyHtml}`;

    let actionsHtml = '';
    if (job.taskType && (job.status === 'queued' || job.status === 'failed')) {
        actionsHtml = '<button type="button" class="btn btn-primary" id="job-detail-execute-btn"><i data-lucide="play"></i><span>Jalankan Tugas</span></button>';
    } else if (job.status === 'needs_info') {
        actionsHtml = '<button type="button" class="btn btn-primary" id="job-detail-answer-submit">Kirim Jawaban → Antri</button>';
    } else if (job.status === 'awaiting_approval') {
        actionsHtml = `
            <button type="button" class="btn btn-secondary" id="job-detail-revision-btn"><i data-lucide="undo-2"></i><span>Minta Revisi</span></button>
            <button type="button" class="btn btn-primary" id="job-detail-approve-btn"><i data-lucide="shield-check"></i><span>Setujui &amp; Publish</span></button>`;
    } else if (job.status === 'failed') {
        actionsHtml = `
            <button type="button" class="btn btn-secondary" id="job-detail-run-btn">Jalankan Publish</button>
            <button type="button" class="btn btn-primary" id="job-detail-retry-btn"><i data-lucide="rotate-cw"></i><span>Retry Publish</span></button>`;
    } else if (job.status === 'queued' || job.status === 'done') {
        actionsHtml = '<button type="button" class="btn btn-primary" id="job-detail-run-btn"><i data-lucide="play"></i><span>Jalankan Publish</span></button>';
    }
    const canDeleteJob = !['working', 'publishing', 'awaiting_approval'].includes(job.status);
    const deleteHtml = canDeleteJob
        ? '<button type="button" class="btn btn-secondary" id="job-detail-delete-btn" title="Hapus job ini (admin/approver)"><i data-lucide="trash-2"></i><span>Hapus</span></button>'
        : '';
    footer.innerHTML = `
        <button type="button" class="btn btn-secondary" onclick="app.closeJobDetailModal()">Tutup</button>
        ${deleteHtml}
        ${actionsHtml}`;

    const answerBtn = document.getElementById('job-detail-answer-submit');
    if (answerBtn) answerBtn.addEventListener('click', () => this.submitJobDetailAnswers());
    const approveBtn = document.getElementById('job-detail-approve-btn');
    if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
            await this.approveOfficeJob();
            this._refreshJobDetailModal();
        });
    }
    const revisionBtn = document.getElementById('job-detail-revision-btn');
    if (revisionBtn) {
        revisionBtn.addEventListener('click', async () => {
            await this.requestJobRevision();
            this._refreshJobDetailModal();
        });
    }
    const deleteBtn = document.getElementById('job-detail-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const removed = await this.deleteOfficeJob(job.id);
            if (removed) this.closeJobDetailModal();
        });
    }
    const executeBtn = document.getElementById('job-detail-execute-btn');
    if (executeBtn) {
        executeBtn.addEventListener('click', async () => {
            await this.executeOfficeTask(job.id);
            this._refreshJobDetailModal();
        });
    }
    const runBtn = document.getElementById('job-detail-run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            await this.runOfficeJob(false);
            this._refreshJobDetailModal();
        });
    }
    const retryBtn = document.getElementById('job-detail-retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
            await this.runOfficeJob(true);
            this._refreshJobDetailModal();
        });
    }
};

/** Kirim jawaban klarifikasi dari modal (input khusus modal, bukan panel Kantor AI). */
app.submitJobDetailAnswers = async function () {
    const jobId = appState.office.selectedJobId;
    if (!jobId) return;

    const inputs = document.querySelectorAll('.job-detail-answer-input');
    const answers = [...inputs].map(el => el.value.trim());
    if (!answers.length || answers.some(a => !a)) {
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
        this.renderAiJobs();
        this._refreshJobDetailModal();
    } catch (e) {
        this.showToast('Gagal mengirim jawaban.', 'red');
    }
};

/** Minta revisi draf dari modal: komentar wajib, versi dikirim sebagai stale guard. */
app.requestJobRevision = async function () {
    const jobId = appState.office.selectedJobId;
    if (!jobId) return;
    const note = document.getElementById('job-detail-revision-note')?.value?.trim();
    if (!note) {
        this.showToast('Isi komentar revisi dulu — agen perlu tahu apa yang diubah.', 'yellow');
        return;
    }
    const job = this._findOfficeJob(jobId);
    try {
        const data = await api.post(`/api/ai/jobs/${jobId}/revision`, {
            note,
            expectedVersion: job?.version
        });
        if (!data.success) {
            this.showToast(data.message || 'Gagal meminta revisi.', 'red');
            return;
        }
        this.showToast('Revisi diminta — job kembali antri, draf lama tersimpan di riwayat.', 'emerald');
        await this.renderOffice();
        this.renderAiJobs();
    } catch (e) {
        this.showToast(e.message || 'Gagal meminta revisi.', 'red');
    }
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

/** Hapus satu job dari Work Board (admin/approver; status aktif dilindungi server). */
app.deleteOfficeJob = async function (jobId) {
    if (!jobId) return false;
    if (!confirm('Hapus job ini dari Work Board? Tindakan tidak bisa dibatalkan.')) return false;
    try {
        const data = await api.delete(`/api/ai/jobs/${jobId}`);
        if (!data.success) {
            this.showToast(data.message || 'Gagal menghapus job.', 'red');
            return false;
        }
        this.showToast('🗑️ Job dihapus dari Work Board.', 'indigo');
        await this.loadOfficeFromServer();
        await this.renderOffice();
        this.renderAiJobs();
        return true;
    } catch (e) {
        this.showToast('Gagal menghapus job.', 'red');
        return false;
    }
};

/** Jalankan tugas umum (taskType) dari modal — bukan jalur publish. */
app.executeOfficeTask = async function (jobId) {
    if (!jobId) return;
    try {
        const data = await api.post(`/api/ai/jobs/${jobId}/execute`, {});
        if (data.awaitingApproval) {
            this.showToast('Tugas keluar menunggu approval (otonomi).', 'amber');
        } else if (data.needsInfo) {
            this.showToast('Input tugas belum lengkap — lihat pertanyaan di job.', 'amber');
        } else if (data.success) {
            this.showToast(data.result?.simulated ? 'Tugas selesai (mode simulasi).' : 'Tugas selesai.', 'emerald');
        } else {
            this.showToast(data.message || 'Tugas gagal dijalankan.', 'red');
        }
        await this.loadOfficeFromServer();
        await this.renderOffice();
        this.renderAiJobs();
    } catch (e) {
        this.showToast('Gagal menjalankan tugas.', 'red');
    }
};

/** Bersihkan massal: hapus job done/failed sesudah konfirmasi jumlah (dry-run dulu). */
app.cleanupOfficeJobs = async function () {
    try {
        const probe = await api.post('/api/ai/jobs/cleanup', { dryRun: true, statuses: ['done', 'failed'] });
        if (!probe.success) {
            this.showToast(probe.message || 'Bersih-bersih hanya untuk admin/approver.', 'red');
            return;
        }
        if (!probe.matched) {
            this.showToast('Tidak ada job selesai/gagal untuk dibersihkan.', 'indigo');
            return;
        }
        if (!confirm(`Hapus ${probe.matched} job selesai/gagal dari Work Board? Tindakan tidak bisa dibatalkan.`)) return;
        const data = await api.post('/api/ai/jobs/cleanup', { statuses: ['done', 'failed'] });
        if (!data.success) {
            this.showToast(data.message || 'Gagal membersihkan job.', 'red');
            return;
        }
        this.showToast(`🧹 ${data.deleted} job dibersihkan dari Work Board.`, 'emerald');
        await this.loadOfficeFromServer();
        await this.renderOffice();
        this.renderAiJobs();
    } catch (e) {
        this.showToast('Gagal membersihkan job.', 'red');
    }
};

app.approveOfficeJob = async function () {
    const jobId = appState.office.selectedJobId;
    if (!jobId) return;
    try {
        const currentJob = (appState.aiJobs || []).find(j => j.id === jobId);
        const approve = await api.post(`/api/ai/jobs/${jobId}/approve`, {
            note: 'Disetujui dari UI Kantor AI',
            expectedVersion: currentJob?.version
        });
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
    const blPlatform = document.getElementById('browser-login-platform');
    if (blPlatform) {
        blPlatform.addEventListener('change', () => app._syncBrowserLoginOauthHint());
    }
    const oauthBtn = document.getElementById('browser-login-oauth-btn');
    if (oauthBtn) {
        oauthBtn.addEventListener('click', () => {
            window.location.href = '/api/auth/meta';
        });
    }
};

app._syncBrowserLoginOauthHint = function () {
    const sel = document.getElementById('browser-login-platform');
    const hint = document.getElementById('browser-login-oauth-hint');
    if (!sel || !hint) return;
    const p = sel.value;
    const show = p === 'instagram' || p === 'facebook';
    hint.classList.toggle('hidden', !show);
};

app.openBrowserLoginModal = async function (platform) {
    const modal = document.getElementById('browser-login-modal');
    const sel = document.getElementById('browser-login-platform');
    if (platform && sel) sel.value = platform;
    document.getElementById('browser-login-username').value = '';
    document.getElementById('browser-login-password').value = '';
    document.getElementById('browser-login-status').classList.add('hidden');
    document.getElementById('browser-login-submit-btn').disabled = false;
    document.getElementById('browser-login-submit-text').innerText = 'Masuk Sekarang';
    this._syncBrowserLoginOauthHint();
    modal.classList.remove('hidden');
    lucide.createIcons();
    try {
        const st = await api.get('/api/auth/browser-login/status');
        if (st && st.success === false) return;
        if (st && st.available === false) {
            const statusBox = document.getElementById('browser-login-status');
            const statusText = document.getElementById('browser-login-status-text');
            if (statusBox && statusText) {
                statusBox.classList.remove('hidden');
                statusText.innerText = st.hint || 'Browser login tidak tersedia di lingkungan ini.';
                statusBox.style.background = 'rgba(245,158,11,0.08)';
                statusBox.style.borderColor = 'rgba(245,158,11,0.3)';
            }
        }
    } catch {
        /* ignore */
    }
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
            if (result.useOAuth) this._syncBrowserLoginOauthHint();
            this.showToast(result.message || `Login ${platform} gagal`, 'red');
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
            const timeVal = this._formatTime24(post.publishDate);
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
    const timeStr = this._formatTime24(pDate);
    const platformsHtml = post.platforms.map(p => { const info = appState.platforms[p]; return info ? `<div class="platform-pill ${info.colorClass}"><i data-lucide="${info.icon}"></i></div>` : ''; }).join('');
    const statusMap = {
        scheduled: 'Dijadwalkan',
        posted: 'Diterbitkan',
        partial: 'Sebagian berhasil',
        draft: 'Draf',
        failed: 'Gagal'
    };
    let mediaHtml = '';
    if (post.mediaUrl) {
        mediaHtml = post.mediaType === 'video'
            ? `<div class="details-media-box"><video src="${post.mediaUrl}" controls></video></div>`
            : `<div class="details-media-box"><img src="${post.mediaUrl}" alt="Media post"></div>`;
    }

    const recon = post.publishReconciliation;
    let reconHtml = '';
    if (recon && recon.summary) {
        const badgeClass = recon.aggregateStatus === 'posted'
            ? 'badge-emerald'
            : recon.aggregateStatus === 'partial'
                ? 'badge-amber'
                : 'badge-red';
        reconHtml = `<div style="margin-bottom:8px;"><span class="badge ${badgeClass}">${statusMap[recon.aggregateStatus] || recon.aggregateStatus}</span>
            <span class="font-xs text-secondary" style="margin-left:8px;">${recon.summary}</span></div>`;
    }

    // Tampilkan hasil publikasi per platform jika ada
    let resultsHtml = '';
    if (post.publishResults && Object.keys(post.publishResults).length > 0) {
        resultsHtml = `<div style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:4px;">
            <p class="font-xs text-secondary" style="margin-bottom:8px;">Hasil Publikasi per platform:</p>
            ${reconHtml}
            ${Object.entries(post.publishResults).map(([plat, res]) => `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                    <span style="text-transform:capitalize;font-size:0.8125rem;font-weight:600;">${plat}</span>
                    <span class="badge ${res.status === 'success' ? 'badge-emerald' : 'badge-red'}">${res.status === 'success' ? '✓ Sukses' : '✗ ' + (res.message || 'Gagal')}</span>
                    ${res.pending ? `<span class="badge badge-amber">Pending poll</span>` : ''}
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
    const jobDetailCloseBtn = document.getElementById('job-detail-close-btn');
    if (jobDetailCloseBtn) jobDetailCloseBtn.addEventListener('click', () => this.closeJobDetailModal());
};

// ============================================================
// Analisis Konten
// ============================================================
app.renderAnalytics = function () {
    const tbody = document.getElementById('analytics-posts-tbody');
    tbody.innerHTML = '';
    const publishedPosts = appState.posts
        .filter(p => p.status === 'posted' || p.status === 'partial')
        .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const indonesianMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    let mockCount = 0;
    let liveCount = 0;
    publishedPosts.forEach(p => {
        const src = (p.stats && p.stats.statsSource) || (p.stats ? 'mock' : 'none');
        if (src === 'live') liveCount += 1;
        else if (src !== 'none') mockCount += 1;
    });
    const sourceLabel = document.getElementById('analytics-source-label');
    const sourceNote = document.getElementById('analytics-source-note');
    if (sourceLabel) {
        if (liveCount > 0 && mockCount === 0) sourceLabel.textContent = 'Live (Insights platform)';
        else if (liveCount > 0) sourceLabel.textContent = `Campuran — ${liveCount} live, ${mockCount} mock`;
        else if (mockCount > 0) sourceLabel.textContent = `Mock lokal (${mockCount} post) — bukan metrics resmi`;
        else sourceLabel.textContent = 'Belum ada stats';
    }
    if (sourceNote) {
        sourceNote.textContent = liveCount === 0
            ? 'Angka di tabel berasal dari generateMockStats setelah publish. Live path: GET /api/analytics/live (API jika token ada; gagal = unavailable, bukan klaim live).'
            : 'Sebagian post memakai stats live; mock tetap ditandai di kolom Sumber.';
    }

    if (publishedPosts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary" style="padding:32px;">Belum ada postingan yang diterbitkan. Kirim konten untuk melihat analitik.</td></tr>`;
    } else {
        publishedPosts.forEach(post => {
            const d = new Date(post.publishDate);
            const dateStr = `${d.getDate()} ${indonesianMonths[d.getMonth()]} ${this._formatTime24(d)}`;
            const platformPills = (post.platforms || []).map(p => { const info = appState.platforms[p]; return info ? `<div class="platform-pill ${info.colorClass}" style="width:24px;height:24px;" title="${info.name}"><i data-lucide="${info.icon}" style="width:12px;height:12px;"></i></div>` : ''; }).join('');
            const thumbHtml = post.mediaUrl ? (post.mediaType === 'video' ? `<i data-lucide="video" style="color:var(--indigo);"></i>` : `<img src="${post.mediaUrl}" alt="Thumb" class="cell-thumbnail">`) : '<i data-lucide="image"></i>';
            const src = (post.stats && post.stats.statsSource) || (post.stats ? 'mock' : '—');
            const srcBadge = src === 'live'
                ? '<span class="badge badge-emerald">live</span>'
                : src === 'mock'
                    ? '<span class="badge badge-amber">mock</span>'
                    : '<span class="badge">—</span>';
            const statusBadge = post.status === 'partial'
                ? '<span class="badge badge-amber"><span class="badge-dot"></span>Sebagian</span>'
                : '<span class="badge badge-emerald"><span class="badge-dot"></span>Diterbitkan</span>';
            tbody.innerHTML += `
                <tr>
                    <td><div class="analytics-post-cell"><div class="cell-thumbnail">${thumbHtml}</div><div><div class="cell-caption">${post.caption || 'Tanpa Keterangan'}</div><span class="font-xs text-muted">${dateStr} WIB</span></div></div></td>
                    <td><div class="cell-platforms-list">${platformPills}</div></td>
                    <td>${statusBadge}</td>
                    <td>${srcBadge}</td>
                    <td class="font-bold">${post.stats ? Number(post.stats.reach || 0).toLocaleString('id-ID') : '0'}</td>
                    <td class="text-indigo font-bold">${post.stats ? Number(post.stats.engagement || 0).toLocaleString('id-ID') : '0'}</td>
                    <td>${post.stats ? Number(post.stats.clicks || 0).toLocaleString('id-ID') : '0'}</td>
                </tr>`;
        });
    }
    this.renderAnalyticsCharts();
    lucide.createIcons();
};

app.renderAnalyticsCharts = function () {
    const reachCtx = document.getElementById('analytics-reach-chart');
    // Chart garis = ilustrasi UI saja (bukan live). Angka nyata ada di tabel postingan.
    const demoNote = ' (demo, bukan live)';
    if (reachCtx) {
        if (appState.charts.analyticsReach) appState.charts.analyticsReach.destroy();
        appState.charts.analyticsReach = new Chart(reachCtx, {
            type: 'line',
            data: {
                labels: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
                datasets: [
                    { label: 'Instagram' + demoNote, data: [12, 19, 15, 25, 22, 30, 34], borderColor: '#e1306c', backgroundColor: 'rgba(225,48,108,0.05)', tension: 0.35, fill: true },
                    { label: 'Facebook' + demoNote, data: [22, 24, 27, 21, 29, 38, 42], borderColor: '#1877f2', backgroundColor: 'rgba(24,119,242,0.05)', tension: 0.35, fill: true },
                    { label: 'TikTok' + demoNote, data: [5, 12, 28, 31, 42, 56, 68], borderColor: '#0f172a', backgroundColor: 'rgba(15,23,42,0.04)', tension: 0.35, fill: true }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#64748b', font: { family: 'Inter', size: 11 } } } }, scales: { x: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#94a3b8' } }, y: { grid: { color: 'rgba(15,23,42,0.06)' }, ticks: { color: '#94a3b8' } } } }
        });
    }
    const healthCtx = document.getElementById('analytics-health-chart');
    if (healthCtx) {
        if (appState.charts.analyticsHealth) appState.charts.analyticsHealth.destroy();
        const posts = appState.posts || [];
        const ok = posts.filter(p => p.status === 'posted').length;
        const partial = posts.filter(p => p.status === 'partial').length;
        const pending = posts.filter(p => p.status === 'scheduled' || p.status === 'draft').length;
        const failed = posts.filter(p => p.status === 'failed').length;
        const totalDone = ok + partial + failed;
        const pctEl = document.getElementById('analytics-health-pct');
        if (pctEl) {
            pctEl.textContent = totalDone
                ? `${(((ok + partial * 0.5) / totalDone) * 100).toFixed(1)}%`
                : '—';
        }
        appState.charts.analyticsHealth = new Chart(healthCtx, {
            type: 'doughnut',
            data: {
                labels: ['Berhasil', 'Sebagian', 'Tertunda / Draf', 'Gagal'],
                datasets: [{
                    data: [ok || 0, partial || 0, pending || 0, failed || 0],
                    backgroundColor: ['#059669', '#d97706', '#4f46e5', '#dc2626'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
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
