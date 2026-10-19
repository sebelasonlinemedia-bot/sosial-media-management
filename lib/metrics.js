/**
 * Analytics / metrics — bedakan mock vs live; stub hook untuk Insights API platform.
 * Jangan pernah mengklaim mock sebagai live.
 */

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

/**
 * Stub hook untuk metrics resmi (Meta Insights / YT Analytics / TikTok).
 * Belum di-wire ke API platform — selalu mengembalikan unavailable.
 *
 * @param {{ platform?: string, postId?: string, externalPostId?: string }} _opts
 * @returns {Promise<{ available: boolean, statsSource: 'live'|'unavailable', stats: null, note: string }>}
 */
async function fetchLiveMetricsStub(_opts = {}) {
    return {
        available: false,
        statsSource: 'unavailable',
        stats: null,
        note: 'Live metrics API belum di-wire. Stats postingan lokal saat ini mock (generateMockStats).'
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
    fetchLiveMetricsStub,
    resolvePostStats,
    summarizeStatsSources
};
