/**
 * Analytics / metrics — bedakan mock vs live; konektor Meta/YT/TikTok (P3).
 * Jangan pernah mengklaim mock / gagal API sebagai live.
 */

const axios = require('axios');

/**
 * Statistik lokal acak — selalu bertanda statsSource: 'mock'.
 */
function generateMockStats() {
    return {
        reach: Math.floor(Math.random() * 5000) + 100,
        engagement: Math.floor(Math.random() * 800) + 12,
        clicks: Math.floor(Math.random() * 150),
        statsSource: 'mock',
        fetchedAt: new Date().toISOString()
    };
}

function unavailable(note, platform) {
    return {
        available: false,
        statsSource: 'unavailable',
        stats: null,
        platform: platform || null,
        note: note || 'Live metrics tidak tersedia.'
    };
}

function liveOk(stats, platform, note) {
    return {
        available: true,
        statsSource: 'live',
        stats: {
            ...stats,
            statsSource: 'live',
            fetchedAt: new Date().toISOString()
        },
        platform: platform || null,
        note: note || 'Metrik dari API platform.'
    };
}

async function fetchMetaInsights({ account, externalPostId, axiosInstance = axios } = {}) {
    const token = account?.pageToken || account?.accessToken;
    if (!token) return unavailable('Token Meta/IG tidak ada.', 'meta');

    try {
        // Prefer media/post insights jika ada external id
        if (externalPostId) {
            const res = await axiosInstance.get(`https://graph.facebook.com/v19.0/${externalPostId}/insights`, {
                params: {
                    metric: 'impressions,reach,engagement',
                    access_token: token
                },
                timeout: 12000
            });
            const rows = res.data?.data || [];
            const byName = Object.fromEntries(rows.map(r => [r.name, (r.values && r.values[0] && r.values[0].value) || 0]));
            return liveOk({
                reach: Number(byName.reach) || 0,
                engagement: Number(byName.engagement) || 0,
                clicks: 0,
                impressions: Number(byName.impressions) || 0
            }, account.platform || 'meta', 'Graph insights media/post.');
        }

        const pageId = account.pageId || account.igUserId;
        if (!pageId) return unavailable('pageId/igUserId kosong — tidak bisa fetch page insights.', account.platform || 'meta');

        const res = await axiosInstance.get(`https://graph.facebook.com/v19.0/${pageId}/insights`, {
            params: {
                metric: 'page_impressions,page_post_engagements',
                period: 'day',
                access_token: token
            },
            timeout: 12000
        });
        const rows = res.data?.data || [];
        const byName = Object.fromEntries(rows.map(r => {
            const vals = r.values || [];
            const last = vals[vals.length - 1];
            return [r.name, last ? last.value : 0];
        }));
        return liveOk({
            reach: Number(byName.page_impressions) || 0,
            engagement: Number(byName.page_post_engagements) || 0,
            clicks: 0
        }, account.platform || 'meta', 'Graph page insights (agregat harian).');
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        return unavailable(`Meta Insights gagal: ${msg}`, account.platform || 'meta');
    }
}

async function fetchYouTubeStats({ account, externalPostId, axiosInstance = axios } = {}) {
    const token = account?.accessToken;
    if (!token) return unavailable('Token YouTube tidak ada.', 'youtube');
    if (!externalPostId) return unavailable('videoId (externalPostId) diperlukan untuk YT statistics.', 'youtube');

    try {
        const res = await axiosInstance.get('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'statistics', id: externalPostId },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 12000
        });
        const item = res.data?.items && res.data.items[0];
        if (!item) return unavailable('Video tidak ditemukan di YouTube API.', 'youtube');
        const s = item.statistics || {};
        const views = Number(s.viewCount) || 0;
        const likes = Number(s.likeCount) || 0;
        const comments = Number(s.commentCount) || 0;
        return liveOk({
            reach: views,
            engagement: likes + comments,
            clicks: 0,
            views,
            likes,
            comments
        }, 'youtube', 'YouTube Data API statistics.');
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        return unavailable(`YouTube stats gagal: ${msg}`, 'youtube');
    }
}

async function fetchTikTokStats({ account, externalPostId, axiosInstance = axios } = {}) {
    const token = account?.accessToken;
    if (!token) return unavailable('Token TikTok tidak ada.', 'tiktok');
    if (!externalPostId) return unavailable('video_id diperlukan untuk TikTok query.', 'tiktok');

    try {
        const res = await axiosInstance.post(
            'https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count',
            { filters: { video_ids: [externalPostId] } },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            }
        );
        const list = res.data?.data?.videos || res.data?.data?.list || [];
        const v = list[0];
        if (!v) return unavailable('Video TikTok tidak ditemukan.', 'tiktok');
        const views = Number(v.view_count) || 0;
        const likes = Number(v.like_count) || 0;
        const comments = Number(v.comment_count) || 0;
        const shares = Number(v.share_count) || 0;
        return liveOk({
            reach: views,
            engagement: likes + comments + shares,
            clicks: 0,
            views,
            likes,
            comments,
            shares
        }, 'tiktok', 'TikTok video query API.');
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        return unavailable(`TikTok stats gagal: ${msg}`, 'tiktok');
    }
}

/**
 * Path nyata: panggil API platform jika token ada; gagal → unavailable (bukan live).
 *
 * @param {{ platform?: string, account?: object, postId?: string, externalPostId?: string, axiosInstance?: any }} opts
 */
async function fetchLiveMetrics(opts = {}) {
    const platform = String(opts.platform || opts.account?.platform || '').toLowerCase();
    if (!platform) {
        return unavailable('platform diperlukan untuk live metrics.');
    }
    if (!opts.account || !(opts.account.accessToken || opts.account.pageToken)) {
        return unavailable(`Akun ${platform} tidak terhubung / tanpa token.`, platform);
    }

    if (platform === 'facebook' || platform === 'instagram' || platform === 'meta') {
        return fetchMetaInsights(opts);
    }
    if (platform === 'youtube') {
        return fetchYouTubeStats(opts);
    }
    if (platform === 'tiktok') {
        return fetchTikTokStats(opts);
    }
    return unavailable(`Platform tidak didukung untuk live metrics: ${platform}`, platform);
}

/**
 * Alias stub lama → path nyata (tetap aman jika tanpa token).
 * @deprecated gunakan fetchLiveMetrics
 */
async function fetchLiveMetricsStub(opts = {}) {
    if (!opts.account && !opts.platform) {
        return unavailable(
            'Live metrics path aktif (P3). Sertakan platform + account ber-token, atau panggil /api/analytics/live.'
        );
    }
    return fetchLiveMetrics(opts);
}

/**
 * Coba live untuk beberapa akun; kembalikan ringkasan tanpa klaim palsu.
 */
async function fetchLiveMetricsForAccounts(accounts = [], opts = {}) {
    const results = [];
    for (const account of accounts) {
        if (!account || !account.connected) continue;
        const r = await fetchLiveMetrics({
            ...opts,
            platform: account.platform,
            account
        });
        results.push(r);
    }
    const live = results.filter(r => r.available && r.statsSource === 'live');
    const failed = results.filter(r => !r.available);
    return {
        results,
        liveCount: live.length,
        unavailableCount: failed.length,
        statsSource: live.length > 0 && failed.length === 0
            ? 'live'
            : live.length > 0
                ? 'mixed'
                : 'unavailable',
        note: live.length === 0
            ? 'Tidak ada metrik live — token hilang atau API gagal (bukan klaim live).'
            : failed.length === 0
                ? 'Semua konektor live berhasil.'
                : 'Sebagian live, sebagian unavailable.'
    };
}

/**
 * Pilih stats untuk post: live jika ada, else mock, else null.
 */
function resolvePostStats(post) {
    const stats = post && post.stats;
    if (!stats) {
        return { stats: null, statsSource: 'none', isMock: false, isLive: false };
    }
    const source = stats.statsSource || 'mock';
    return {
        stats,
        statsSource: source,
        isMock: source === 'mock' || !stats.statsSource,
        isLive: source === 'live'
    };
}

function summarizeStatsSources(posts = []) {
    let mock = 0;
    let live = 0;
    let none = 0;
    for (const p of posts) {
        const r = resolvePostStats(p);
        if (r.statsSource === 'none') none += 1;
        else if (r.isLive) live += 1;
        else mock += 1;
    }
    const overall = live > 0 && mock === 0
        ? 'live'
        : live > 0
            ? 'mixed'
            : mock > 0
                ? 'mock'
                : 'none';
    return {
        overall,
        mock,
        live,
        none,
        note: overall === 'live'
            ? 'Metrik dari Insights API platform.'
            : overall === 'mixed'
                ? 'Campuran mock lokal dan live platform.'
                : overall === 'mock'
                    ? 'Metrik lokal mock — bukan angka resmi platform.'
                    : 'Belum ada stats.'
    };
}

module.exports = {
    generateMockStats,
    fetchLiveMetrics,
    fetchLiveMetricsStub,
    fetchLiveMetricsForAccounts,
    fetchMetaInsights,
    fetchYouTubeStats,
    fetchTikTokStats,
    resolvePostStats,
    summarizeStatsSources
};
