/**
 * automation/youtube.js
 * Login & upload video ke YouTube via browser automation (Puppeteer).
 * Login menggunakan akun Google (email + password).
 *
 * CATATAN: Tidak mendukung akun dengan 2FA aktif.
 */

const path = require('path');
const fs = require('fs');
const { newPageWithSession, saveSession, waitAndClick, waitAndType } = require('./browser');

const YT_STUDIO_URL = 'https://studio.youtube.com';
const GOOGLE_LOGIN_URL = 'https://accounts.google.com/signin/v2/identifier';

/**
 * Login ke Google/YouTube.
 */
async function loginYouTube(email, password) {
    console.log(`[YT] Memulai login untuk: ${email}`);
    const { page } = await newPageWithSession('youtube', false);

    try {
        await page.goto(GOOGLE_LOGIN_URL + '?continue=https://studio.youtube.com', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Isi email
        await waitAndType(page, 'input[type="email"]', email);
        await waitAndClick(page, '#identifierNext, button::-p-text(Next), button::-p-text(Berikutnya)');

        // Tunggu field password muncul
        await page.waitForSelector('input[type="password"]', { visible: true, timeout: 15000 });
        await new Promise(r => setTimeout(r, 500));

        // Isi password
        await waitAndType(page, 'input[type="password"]', password);
        await waitAndClick(page, '#passwordNext, button::-p-text(Next), button::-p-text(Berikutnya)');

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // Cek 2FA
        const is2FA = await page.$('input[type="tel"], [data-challengetype="12"], #idvAnchorAt');
        if (is2FA) {
            throw new Error('Akun ini menggunakan 2FA. Nonaktifkan 2FA untuk menggunakan fitur ini.');
        }

        // Cek berhasil masuk ke YouTube Studio
        const currentUrl = page.url();
        if (!currentUrl.includes('studio.youtube.com') && !currentUrl.includes('youtube.com')) {
            throw new Error('Login Google gagal. Periksa email dan password.');
        }

        // Buka YouTube Studio untuk ambil info channel
        if (!currentUrl.includes('studio.youtube.com')) {
            await page.goto(YT_STUDIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        }

        // Ambil nama channel
        let name = email;
        let avatar = '';
        try {
            name = await page.$eval('[id="account-name"], yt-formatted-string#account-name', el => el.textContent.trim()).catch(() => email);
            avatar = await page.$eval('yt-img-shadow img, img#img', el => el.src).catch(() => '');
        } catch (_) {}

        await saveSession('youtube', page);
        await page.close();

        console.log(`[YT] Login berhasil: ${name}`);
        return {
            platform: 'youtube',
            name: name || email,
            handle: `@${name || email}`,
            avatar,
            automationType: 'browser',
            ytEmail: email,
            connected: true
        };

    } catch (err) {
        await page.close();
        throw err;
    }
}

/**
 * Upload video ke YouTube via YouTube Studio.
 */
async function postYouTube(account, post) {
    console.log(`[YT] Memulai upload untuk: ${account.name}`);

    if (!post.mediaUrl || post.mediaType !== 'video') {
        throw new Error('YouTube hanya mendukung upload video.');
    }

    const mediaPath = path.join(__dirname, '..', post.mediaUrl.replace(/^\//, ''));
    if (!fs.existsSync(mediaPath)) {
        throw new Error(`File video tidak ditemukan: ${mediaPath}`);
    }

    const { page } = await newPageWithSession('youtube');

    try {
        await page.goto(YT_STUDIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        // Cek masih login
        const loginBtn = await page.$('a[href*="accounts.google.com"]');
        if (loginBtn) {
            throw new Error('Session YouTube sudah kedaluwarsa. Silakan login ulang.');
        }

        // Klik tombol Upload
        const uploadBtn = await page.waitForSelector(
            '#upload-btn, [aria-label="Upload video"], ytcp-button[id="upload-btn"]',
            { timeout: 15000 }
        );
        await uploadBtn.click();

        await new Promise(r => setTimeout(r, 2000));

        // Upload file video
        const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
        await fileInput.uploadFile(mediaPath);

        // Tunggu dialog upload muncul
        await page.waitForSelector('ytcp-video-metadata-editor, [class*="metadata-editor"]', {
            timeout: 30000
        });
        await new Promise(r => setTimeout(r, 2000));

        // Isi judul video (dari caption, maks 100 karakter)
        const title = (post.caption || 'Video PostSphere').substring(0, 100);
        const titleInput = await page.$('[placeholder*="Add a title"], #textbox[aria-label*="Title"]');
        if (titleInput) {
            await titleInput.click({ clickCount: 3 });
            await page.keyboard.type(title, { delay: 20 });
        }

        // Isi deskripsi
        const descInput = await page.$('[placeholder*="Add a description"], #textbox[aria-label*="Description"]');
        if (descInput) {
            await descInput.click();
            await page.keyboard.type(post.caption || '', { delay: 20 });
        }

        // Pilih "Not made for kids" jika ada
        try {
            await waitAndClick(page, 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT"]', 3000);
        } catch (_) {}

        // Klik Next 3 kali
        for (let i = 0; i < 3; i++) {
            try {
                const nextBtn = await page.waitForSelector(
                    'ytcp-button[id="next-button"]:not([disabled])',
                    { timeout: 5000 }
                );
                await nextBtn.click();
                await new Promise(r => setTimeout(r, 1500));
            } catch (_) { break; }
        }

        // Pilih visibilitas Public
        try {
            await waitAndClick(page, 'tp-yt-paper-radio-button[name="PUBLIC"]', 5000);
        } catch (_) {}

        // Klik Publish / Save
        const publishBtn = await page.waitForSelector(
            'ytcp-button[id="done-button"], [aria-label="Publish"], [aria-label="Save"]',
            { timeout: 15000 }
        );
        await publishBtn.click();

        // Tunggu upload selesai dan dialog tertutup
        await new Promise(r => setTimeout(r, 8000));

        await saveSession('youtube', page);
        await page.close();

        console.log(`[YT] Upload berhasil untuk: ${account.name}`);
        return { status: 'success', message: 'Video berhasil diupload ke YouTube.' };

    } catch (err) {
        await page.close();
        throw err;
    }
}

module.exports = { loginYouTube, postYouTube };
