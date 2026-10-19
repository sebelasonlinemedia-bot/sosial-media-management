/**
 * Auth UI helpers (P3 modularize — diekstrak dari app.js).
 * Bergantung pada globals: api, appState.
 */
(function (global) {
    'use strict';

    const AuthUI = {
        setupLoginGate(app) {
            const form = document.getElementById('app-login-form');
            const logoutBtn = document.getElementById('app-logout-btn');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await app.submitLogin();
                });
            }
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await api.post('/api/auth/logout', {});
                    appState.user = null;
                    app.showLoginGate('Anda telah keluar.');
                });
            }
        },

        showLoginGate(app, message) {
            document.body.classList.remove('is-mission-mode');
            const missionEl = document.getElementById('view-mission');
            if (missionEl) missionEl.classList.add('hidden');
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
            AuthUI.updateLoginBootstrapHint(appState.authStatus);
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

        async submitLogin(app) {
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
        }
    };

    global.PiksAuthUI = AuthUI;
})(typeof window !== 'undefined' ? window : globalThis);
