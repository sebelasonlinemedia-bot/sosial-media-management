const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');

const sessionsDir = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

async function saveSession(ig, username) {
    const state = await ig.state.serialize();
    delete state.constants; 
    fs.writeFileSync(path.join(sessionsDir, `${username}-ig-state.json`), JSON.stringify(state));
}

async function loadSession(ig, username) {
    const sessionPath = path.join(sessionsDir, `${username}-ig-state.json`);
    if (fs.existsSync(sessionPath)) {
        const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        await ig.state.deserialize(state);
        return true;
    }
    return false;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

async function loginInstagram(username, password) {
    console.log(`[IG] Memulai login (Private API) untuk: ${username}`);
    
    const ig = new IgApiClient();
    ig.state.generateDevice(username);
    
    try {
        await ig.simulate.preLoginFlow();
        const loggedInUser = await ig.account.login(username, password);
        process.nextTick(async () => {
            try {
                await ig.simulate.postLoginFlow();
            } catch (err) {
                console.log('[IG] Peringatan: postLoginFlow gagal (bisa diabaikan):', err.message);
            }
        });
        
        await saveSession(ig, username);
        
        console.log(`[IG] ✅ Login berhasil: @${loggedInUser.username}`);
        return {
            platform: 'instagram',
            name: loggedInUser.full_name || username,
            handle: `@${loggedInUser.username}`,
            avatar: loggedInUser.profile_pic_url,
            automationType: 'private_api',
            igUsername: username,
            connected: true
        };
    } catch (err) {
        if (err.name === 'IgCheckpointError') {
            console.error('[IG] Checkpoint error - akun membutuhkan verifikasi.');
            throw new Error('Instagram mendeteksi login tidak biasa (Checkpoint). Harap buka aplikasi Instagram di HP Anda untuk menyetujui login ini, lalu coba lagi.');
        } else if (err.name === 'IgLoginTwoFactorRequiredError') {
            throw new Error('Akun ini meminta 2FA/Kode Keamanan. Matikan 2FA sementara atau gunakan sandi aplikasi jika didukung.');
        } else if (err.name === 'IgResponseError' && err.message.includes('password')) {
            throw new Error('Login ditolak: Password salah.');
        }
        console.error('[IG] Error Login:', err.message);
        throw new Error(`Gagal masuk ke Instagram via API: ${err.message}`);
    }
}

// ── POSTING ───────────────────────────────────────────────────────────────────

async function postInstagram(account, post) {
    console.log(`[IG] Memulai posting (Private API) untuk: ${account.handle}`);

    if (!post.mediaUrl) throw new Error('Instagram memerlukan media (foto).');

    const mediaPath = path.join(__dirname, '..', post.mediaUrl.replace(/^\//, ''));
    if (!fs.existsSync(mediaPath)) throw new Error(`File media tidak ditemukan: ${mediaPath}`);

    const ig = new IgApiClient();
    ig.state.generateDevice(account.igUsername);
    
    const hasSession = await loadSession(ig, account.igUsername);
    if (!hasSession) {
        throw new Error('Session Instagram tidak ditemukan. Harap login ulang.');
    }

    try {
        const imageBuffer = fs.readFileSync(mediaPath);
        
        // publish photo
        const publishResult = await ig.publish.photo({
            file: imageBuffer,
            caption: post.caption || '',
        });

        console.log(`[IG] ✅ Posting berhasil: ${account.handle}`);
        return { 
            status: 'success', 
            message: 'Postingan berhasil dikirim ke Instagram (via API).',
            postId: publishResult.media.id
        };
    } catch (err) {
        console.error('[IG] Error Posting:', err.message);
        throw new Error(`Gagal memposting ke Instagram: ${err.message}`);
    }
}

module.exports = { loginInstagram, postInstagram };
