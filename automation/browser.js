/**
 * automation/browser.js
 * Puppeteer browser singleton dengan stealth mode + session cookie manager.
 * Mendukung reuse instance browser agar tidak membuka tab baru setiap posting.
 */

const fs = require('fs');
const path = require('path');

let puppeteerExtra, StealthPlugin;
try {
    puppeteerExtra = require('puppeteer-extra');
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());
} catch (e) {
    console.error('[BROWSER] puppeteer-extra tidak ditemukan. Jalankan: npm install puppeteer-extra puppeteer-extra-plugin-stealth puppeteer');
}

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

let browserInstance = null;

/**
 * Mendapatkan instance browser (buat baru jika belum ada / sudah tertutup)
 */
async function getBrowser(headless = true) {
    if (browserInstance && browserInstance.isConnected && browserInstance.isConnected()) {
        return browserInstance;
    }
    if (!puppeteerExtra) throw new Error('puppeteer-extra tidak terinstall.');

    browserInstance = await puppeteerExtra.launch({
        headless: false, // Menampilkan browser asli sesuai permintaan user
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--lang=id-ID,id',
            '--window-size=1280,800'
        ],
        defaultViewport: { width: 1280, height: 800 }
    });

    browserInstance.on('disconnected', () => { browserInstance = null; });
    return browserInstance;
}

/**
 * Buka tab baru dengan session cookies yang tersimpan (jika ada)
 */
async function newPageWithSession(platform, headless = true) {
    const browser = await getBrowser(headless);
    const page = await browser.newPage();

    // Set User-Agent mobile/desktop yang normal
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Muat cookies session jika tersedia
    const sessionFile = path.join(SESSIONS_DIR, `${platform}.json`);
    if (fs.existsSync(sessionFile)) {
        try {
            const cookies = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            await page.setCookie(...cookies);
        } catch (e) {
            console.warn(`[BROWSER] Gagal memuat session ${platform}:`, e.message);
        }
    }

    return { browser, page };
}

/**
 * Simpan cookies session ke file agar tidak perlu login berulang
 */
async function saveSession(platform, page) {
    try {
        const cookies = await page.cookies();
        const sessionFile = path.join(SESSIONS_DIR, `${platform}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));
        console.log(`[BROWSER] Session ${platform} tersimpan.`);
    } catch (e) {
        console.warn(`[BROWSER] Gagal menyimpan session ${platform}:`, e.message);
    }
}

/**
 * Hapus session (logout)
 */
function clearSession(platform) {
    const sessionFile = path.join(SESSIONS_DIR, `${platform}.json`);
    if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
        console.log(`[BROWSER] Session ${platform} dihapus.`);
    }
}

/**
 * Cek apakah session tersimpan untuk platform tertentu
 */
function hasSession(platform) {
    return fs.existsSync(path.join(SESSIONS_DIR, `${platform}.json`));
}

/**
 * Tunggu elemen muncul + klik (dengan retry)
 */
async function waitAndClick(page, selector, timeout = 10000) {
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.click(selector);
}

/**
 * Tunggu elemen + ketik teks (clear dulu)
 */
async function waitAndType(page, selector, text, timeout = 10000) {
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, text, { delay: 50 });
}

/**
 * Tutup browser
 */
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

module.exports = {
    getBrowser,
    newPageWithSession,
    saveSession,
    clearSession,
    hasSession,
    waitAndClick,
    waitAndType,
    closeBrowser
};
