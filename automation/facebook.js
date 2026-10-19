/**
 * automation/facebook.js
 * Login & posting ke Facebook via browser automation (Puppeteer).
 * Mendukung: teks, foto, video.
 *
 * CATATAN: Tidak mendukung akun dengan 2FA aktif.
 */

const path = require('path');
const fs = require('fs');
const { newPageWithSession, saveSession } = require('./browser');

const FB_URL = 'https://www.facebook.com';

// ── Helpers ──────────────────────────────────────────────────────────────────

function debugDir() {
    const dir = path.join(__dirname, '..', 'sessions', 'debug');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function debugScreenshot(page, label) {
    try {
        await page.screenshot({ path: path.join(debugDir(), `${label}-${Date.now()}.png`), fullPage: false });
    } catch (_) {}
}

/** Coba dismiss cookie / consent banner */
async function dismissCookieBanner(page) {
    const cookieTexts = [
        'Allow all cookies', 'Accept All', 'Izinkan semua cookie',
        'Allow essential and optional cookies', 'Decline optional cookies',
        'Decline All'
    ];
    for (const text of cookieTexts) {
        try {
            const clicked = await page.evaluate((t) => {
                const els = [...document.querySelectorAll('button, [role="button"]')];
                const el = els.find(b => b.innerText && b.innerText.trim().includes(t));
                if (el) { el.click(); return true; }
                return false;
            }, text);
            if (clicked) {
                console.log(`[FB] Cookie banner dismissed: "${text}"`);
                await new Promise(r => setTimeout(r, 1000));
                return;
            }
        } catch (_) {}
    }
}

/** Tunggu elemen + isi teks */
async function fillField(page, selectors, text, timeout = 15000) {
    let el = null;
    for (const sel of selectors) {
        try {
            el = await page.waitForSelector(sel, { visible: true, timeout: 5000 });
            if (el) break;
        } catch (_) {}
    }
    if (!el) throw new Error(`Field input tidak ditemukan untuk selector: ${selectors.join(', ')}`);
    await el.click({ clickCount: 3 });
    await el.type(text, { delay: 60 });
    return el;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

async function loginFacebook(username, password) {
    console.log(`[FB] Memulai login untuk: ${username}`);
    const { page } = await newPageWithSession('facebook', false);

    try {
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        console.log('[FB] Navigasi ke halaman login...');
        await page.goto(`${FB_URL}/login/`, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        await new Promise(r => setTimeout(r, 3000));
        await dismissCookieBanner(page);
        await new Promise(r => setTimeout(r, 1000));

        await debugScreenshot(page, 'fb-01-loaded');

        // Isi username/email & password
        console.log('[FB] Mengisi form login...');
        await fillField(page, ['input[name="email"]', '#email', 'input[type="text"]'], username);
        await fillField(page, ['input[name="pass"]', '#pass', 'input[type="password"]'], password);

        await new Promise(r => setTimeout(r, 500));
        await debugScreenshot(page, 'fb-02-filled');

        // Klik tombol login
        const loginSubmitted = await page.evaluate(() => {
            const btn = document.querySelector('button[name="login"], #loginbutton, input[type="submit"], button[type="submit"]');
            if (btn) { btn.click(); return true; }
            return false;
        });

        if (!loginSubmitted) {
            // Fallback: press Enter
            await page.keyboard.press('Enter');
        }

        console.log('[FB] Form tersubmit, menunggu respons...');
        await new Promise(r => setTimeout(r, 6000));
        await debugScreenshot(page, 'fb-03-after-submit');

        // Cek error login
        const errorEl = await page.$('#error_box, [data-testid="royal_login_button"] + div, div[role="alert"]');
        if (errorEl) {
            const errText = await page.evaluate(el => el.innerText, errorEl);
            if (errText && errText.trim()) {
                throw new Error(`Login ditolak Facebook: ${errText.trim()}`);
            }
        }

        // Cek 2FA
        const twoFAEl = await page.$('input[name="approvals_code"], #approvals_code, input[aria-label*="code" i]');
        if (twoFAEl) {
            throw new Error('Akun ini menggunakan 2FA. Nonaktifkan 2FA untuk menggunakan fitur ini.');
        }

        // Cek redirect sukses
        const currentUrl = page.url();
        const isLoggedIn = currentUrl.includes('facebook.com') && !currentUrl.includes('/login');

        if (!isLoggedIn) {
            // Cek apakah ada element navigasi feed utama
            const feedCheck = await page.$('[aria-label="Account Controls and Settings"], [data-testid="nav-nested-tab-profile"], [role="navigation"]');
            if (!feedCheck) {
                await debugScreenshot(page, 'fb-04-verify-fail');
                throw new Error('Login tidak berhasil. Pastikan username/password benar.');
            }
        }

        // Ambil nama profil
        let name = username;
        let avatar = '';

        try {
            await page.goto(`${FB_URL}/me`, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await new Promise(r => setTimeout(r, 2000));
            name = await page.evaluate(() => {
                const h1 = document.querySelector('h1');
                return h1 ? h1.innerText.trim() : '';
            }).catch(() => username);
            
            avatar = await page.evaluate(() => {
                const img = document.querySelector('image[xlink\\:href], img[alt*="profile" i], img[alt*="foto" i]');
                return img ? (img.getAttribute('xlink:href') || img.src) : '';
            }).catch(() => '');
        } catch (_) {}

        await saveSession('facebook', page);
        await page.close();

        console.log(`[FB] ✅ Login berhasil: ${name}`);
        return {
            platform: 'facebook',
            name: name || username,
            handle: name || username,
            avatar,
            automationType: 'browser',
            fbUsername: username,
            connected: true
        };

    } catch (err) {
        await debugScreenshot(page, 'fb-error');
        await page.close().catch(() => {});
        throw err;
    }
}

// ── POSTING ───────────────────────────────────────────────────────────────────

async function postFacebook(account, post) {
    console.log(`[FB] Memulai posting untuk: ${account.name}`);

    const { page } = await newPageWithSession('facebook');

    try {
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
        await page.goto(`${FB_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        const isLoggedIn = await page.$('[aria-label="Account Controls and Settings"], [data-testid="nav-nested-tab-profile"]') !== null;
        if (!isLoggedIn) {
            throw new Error('Session Facebook sudah kedaluwarsa. Silakan login ulang.');
        }

        // Klik composer trigger
        const composerTrigger = await page.waitForSelector(
            '[placeholder*="What\'s on your mind"], [aria-label*="What\'s on your mind"], [data-testid="status-attachment-mentions-input"]',
            { timeout: 15000 }
        );
        await composerTrigger.click();
        await new Promise(r => setTimeout(r, 2000));

        if (post.mediaUrl) {
            const mediaPath = path.join(__dirname, '..', post.mediaUrl.replace(/^\//, ''));
            if (fs.existsSync(mediaPath)) {
                try {
                    const photoBtn = await page.waitForSelector(
                        '[data-testid="photo-video-button"], [aria-label*="Photo"], button::-p-text(Photo/Video)',
                        { timeout: 5000 }
                    );
                    await photoBtn.click();
                    await new Promise(r => setTimeout(r, 1500));

                    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000 });
                    await fileInput.uploadFile(mediaPath);
                    await new Promise(r => setTimeout(r, 3000));
                } catch (_) {
                    console.warn('[FB] Gagal mengklik tombol media, lanjut hanya teks.');
                }
            }
        }

        const textArea = await page.waitForSelector(
            '[data-testid="status-attachment-mentions-input"], [contenteditable="true"][role="textbox"]',
            { timeout: 10000 }
        );
        await textArea.click();
        await page.keyboard.type(post.caption || '', { delay: 30 });
        await new Promise(r => setTimeout(r, 1500));

        // Klik Post/Kirim
        const postBtn = await page.waitForSelector(
            '[data-testid="react-composer-post-button"], button::-p-text(Post), button::-p-text(Kirim)',
            { timeout: 10000 }
        );
        await postBtn.click();

        await new Promise(r => setTimeout(r, 6000));

        await saveSession('facebook', page);
        await page.close();

        console.log(`[FB] ✅ Posting berhasil untuk: ${account.name}`);
        return { status: 'success', message: 'Postingan berhasil dikirim ke Facebook.' };

    } catch (err) {
        await page.close().catch(() => {});
        throw err;
    }
}

module.exports = { loginFacebook, postFacebook };
