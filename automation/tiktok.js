/**
 * automation/tiktok.js
 * Login & posting ke TikTok via browser automation (Puppeteer).
 * Mendukung: upload video + caption/hashtag.
 *
 * CATATAN: Tidak mendukung akun dengan 2FA aktif.
 */

const path = require('path');
const fs = require('fs');
const { newPageWithSession, saveSession, waitAndClick, waitAndType } = require('./browser');

const TT_URL = 'https://www.tiktok.com';
const TT_UPLOAD_URL = 'https://www.tiktok.com/upload';

/**
 * Login ke TikTok via form email/username + password.
 */
async function loginTikTok(username, password) {
    console.log(`[TT] Memulai login untuk: ${username}`);
    const { page } = await newPageWithSession('tiktok', false);

    try {
        await page.goto(`${TT_URL}/login/phone-or-email/email`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await new Promise(r => setTimeout(r, 2000));

        // Isi email/username
        await waitAndType(page, 'input[name="username"], input[placeholder*="email"], input[type="text"]', username);
        await new Promise(r => setTimeout(r, 500));

        // Isi password
        await waitAndType(page, 'input[type="password"]', password);
        await new Promise(r => setTimeout(r, 500));

        // Klik login
        await waitAndClick(page, 'button[type="submit"], button::-p-text(Log in), button::-p-text(Masuk)');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 3000));

        // Cek 2FA / CAPTCHA
        const captchaEl = await page.$('[class*="captcha"], iframe[src*="captcha"]');
        if (captchaEl) {
            throw new Error('TikTok meminta verifikasi CAPTCHA. Coba login ulang setelah beberapa menit.');
        }

        const twoFAEl = await page.$('input[placeholder*="kode"], [class*="verify-code"]');
        if (twoFAEl) {
            throw new Error('Akun ini menggunakan 2FA. Nonaktifkan 2FA untuk menggunakan fitur ini.');
        }

        // Ambil nama profil
        let handle = username;
        let name = handle;
        let avatar = '';
        try {
            await page.goto(TT_URL, { waitUntil: 'networkidle2', timeout: 20000 });
            await new Promise(r => setTimeout(r, 2000));
            
            // Cek data profil dari link navigasi "View profile"
            const userInfo = await page.evaluate(() => {
                let res = { handle: null, avatar: null };
                const profileLinks = Array.from(document.querySelectorAll('a[href*="/@"]'));
                // Biasanya link profil punya href = "/@username"
                if (profileLinks.length > 0) {
                    res.handle = profileLinks[0].getAttribute('href').replace('/', '');
                    const img = profileLinks[0].querySelector('img');
                    if (img) res.avatar = img.src;
                }
                return res;
            });
            
            if (userInfo.handle) {
                handle = userInfo.handle.replace('@', '');
                name = handle;
            }
            if (userInfo.avatar) avatar = userInfo.avatar;
            
        } catch (_) {}

        await saveSession('tiktok', page);
        await page.close();

        console.log(`[TT] Login berhasil: ${name}`);
        return {
            platform: 'tiktok',
            name: name || username,
            handle: `@${username}`,
            avatar,
            automationType: 'browser',
            ttUsername: username,
            connected: true
        };

    } catch (err) {
        await page.close();
        throw err;
    }
}

/**
 * Upload video ke TikTok.
 */
async function postTikTok(account, post) {
    console.log(`[TT] Memulai posting untuk: ${account.handle}`);

    if (!post.mediaUrl || post.mediaType !== 'video') {
        throw new Error('TikTok hanya mendukung upload video.');
    }

    const mediaPath = path.join(__dirname, '..', post.mediaUrl.replace(/^\//, ''));
    if (!fs.existsSync(mediaPath)) {
        throw new Error(`File video tidak ditemukan: ${mediaPath}`);
    }

    const { page } = await newPageWithSession('tiktok');

    try {
        // Buka halaman upload TikTok
        await page.goto(TT_UPLOAD_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // Cek masih login
        const loginBtn = await page.$('button::-p-text(Log in), a[href*="/login"]');
        if (loginBtn) {
            throw new Error('Session TikTok sudah kedaluwarsa. Silakan login ulang.');
        }

        // Upload file video
        const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 });
        await fileInput.uploadFile(mediaPath);

        // Tunggu video diproses
        await new Promise(r => setTimeout(r, 8000));
        await page.waitForSelector(
            '[class*="video-info"], [data-e2e="upload-desc-input"], textarea',
            { timeout: 60000 }
        );

        // Isi caption
        const captionBox = await page.$('[data-e2e="upload-desc-input"], textarea[placeholder*="caption"], div[contenteditable="true"]');
        if (captionBox) {
            await captionBox.click({ clickCount: 3 });
            await page.keyboard.type(post.caption || '', { delay: 30 });
        }

        await new Promise(r => setTimeout(r, 1500));

        // Klik Post / Unggah
        const postBtn = await page.waitForSelector(
            'button::-p-text(Post), button::-p-text(Unggah), [data-e2e="post-button"]',
            { timeout: 10000 }
        );
        await postBtn.click();

        // Tunggu konfirmasi upload selesai
        await new Promise(r => setTimeout(r, 10000));

        await saveSession('tiktok', page);
        await page.close();

        console.log(`[TT] Posting berhasil untuk: ${account.handle}`);
        return { status: 'success', message: 'Video berhasil dikirim ke TikTok.' };

    } catch (err) {
        await page.close();
        throw err;
    }
}

module.exports = { loginTikTok, postTikTok };
