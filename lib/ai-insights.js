/**
 * Analitik penggerak agen — best/worst post, jam/format hint, saran frekuensi.
 * Dipakai GET /api/ai/insights dan panel "Apa berikutnya".
 */

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'];

function engagementOf(post) {
    const s = post?.stats;
    if (!s) return 0;
    return Number(s.engagement) || 0;
}

function reachOf(post) {
    const s = post?.stats;
    if (!s) return 0;
    return Number(s.reach) || 0;
}

function hourOf(post) {
    const when = post.publishDate || post.createdAt;
    if (!when) return null;
    const d = new Date(when);
    return Number.isNaN(d.getTime()) ? null : d.getHours();
}

function formatHint(post) {
    const t = String(post.mediaType || '').toLowerCase();
    if (t.includes('video') || t.includes('reel') || t.includes('short')) return 'video/reels';
    if (t.includes('image') || t.includes('photo') || t.includes('carousel')) return 'image';
    if (post.mediaUrl) return 'media';
    return 'text';
}

function captionSnippet(caption, max = 72) {
    const t = String(caption || '').replace(/\s+/g, ' ').trim();
    if (!t) return '(tanpa caption)';
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function countByPlatform(posts) {
    const counts = Object.fromEntries(PLATFORMS.map(p => [p, 0]));
    for (const p of posts) {
        for (const plat of p.platforms || []) {
            if (counts[plat] != null) counts[plat] += 1;
        }
    }
    return counts;
}

function topHour(posts) {
    const buckets = {};
    for (const p of posts) {
        const h = hourOf(p);
        if (h == null) continue;
        buckets[h] = (buckets[h] || 0) + engagementOf(p);
    }
    const entries = Object.entries(buckets);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return parseInt(entries[0][0], 10);
}

function topFormat(posts) {
    const buckets = {};
    for (const p of posts) {
        const f = formatHint(p);
        buckets[f] = (buckets[f] || 0) + engagementOf(p);
    }
    const entries = Object.entries(buckets);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
}

/**
 * @param {object[]} posts
 * @param {{ days?: number }} [opts]
 */
function buildInsights(posts = [], opts = {}) {
    const days = Math.max(1, parseInt(opts.days, 10) || 30);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = (posts || []).filter(p => {
        if (p.status === 'failed') return false;
        const when = new Date(p.publishDate || p.createdAt || 0).getTime();
        return when >= since;
    });

    const withStats = recent.filter(p => p.stats && (engagementOf(p) > 0 || reachOf(p) > 0));
    const ranked = [...(withStats.length ? withStats : recent)]
        .sort((a, b) => engagementOf(b) - engagementOf(a) || reachOf(b) - reachOf(a));

    const best = ranked[0] || null;
    const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
    const freq = countByPlatform(recent);
    const avgEng = withStats.length
        ? Math.round(withStats.reduce((s, p) => s + engagementOf(p), 0) / withStats.length)
        : 0;

    const bestHour = topHour(withStats.length ? withStats : recent);
    const bestFormat = topFormat(withStats.length ? withStats : recent);

    const insights = [];
    if (best) {
        insights.push({
            id: 'best-post',
            type: 'best',
            title: 'Postingan terbaik',
            summary: `${captionSnippet(best.caption)} · eng ${engagementOf(best)} · ${(best.platforms || []).join(', ') || '—'}`,
            postId: best.id,
            metrics: { engagement: engagementOf(best), reach: reachOf(best) }
        });
    }
    if (worst && worst.id !== best?.id) {
        insights.push({
            id: 'worst-post',
            type: 'worst',
            title: 'Perlu perbaikan',
            summary: `${captionSnippet(worst.caption)} · eng ${engagementOf(worst)}`,
            postId: worst.id,
            metrics: { engagement: engagementOf(worst), reach: reachOf(worst) }
        });
    }
    if (bestHour != null) {
        insights.push({
            id: 'best-hour',
            type: 'timing',
            title: 'Jam posting yang lebih kuat',
            summary: `Sekitar pukul ${String(bestHour).padStart(2, '0')}:00 (berdasarkan engagement ${days} hari).`
        });
    }
    if (bestFormat) {
        insights.push({
            id: 'best-format',
            type: 'format',
            title: 'Format yang unggul',
            summary: `Format ${bestFormat} cenderung lebih tinggi engagement.`
        });
    }

    const sortedFreq = Object.entries(freq).sort((a, b) => a[1] - b[1]);
    const underposted = sortedFreq.filter(([, n]) => n === 0).map(([p]) => p);
    const lowPosted = sortedFreq.filter(([, n]) => n > 0 && n < 3).map(([p]) => p);
    const overposted = sortedFreq.filter(([, n]) => n >= 8).map(([p]) => p);

    const recommendations = [];
    if (underposted.length) {
        recommendations.push({
            id: 'boost-underposted',
            priority: 'high',
            action: 'create_brief',
            cta: `Brief untuk ${underposted.slice(0, 2).join(' & ')}`,
            platforms: underposted.slice(0, 2),
            roleId: 'strategist',
            reason: `Belum ada posting di ${underposted.join(', ')} dalam ${days} hari.`
        });
    } else if (lowPosted.length) {
        recommendations.push({
            id: 'nudge-low',
            priority: 'medium',
            action: 'create_brief',
            cta: `Tambah konten ${lowPosted[0]}`,
            platforms: [lowPosted[0]],
            roleId: 'copywriter',
            reason: `${lowPosted[0]} masih jarang (${freq[lowPosted[0]]} post / ${days} hari).`
        });
    }
    if (best && bestFormat === 'video/reels') {
        recommendations.push({
            id: 'more-video',
            priority: 'medium',
            action: 'create_brief',
            cta: 'Brief Reels / Shorts',
            platforms: (best.platforms || []).slice(0, 2),
            roleId: 'visual-producer',
            reason: 'Post video/reels terbaik — ulangi format serupa.'
        });
    } else if (best) {
        recommendations.push({
            id: 'iterate-winner',
            priority: 'medium',
            action: 'create_brief',
            cta: 'Variasi hook dari pemenang',
            platforms: (best.platforms || []).slice(0, 2),
            roleId: 'copywriter',
            reason: 'Buat variasi A/B hook dari caption dengan engagement tertinggi.'
        });
    }
    if (overposted.length) {
        recommendations.push({
            id: 'pace-down',
            priority: 'low',
            action: 'review_calendar',
            cta: 'Cek kalender Strategist',
            platforms: overposted,
            roleId: 'strategist',
            reason: `${overposted.join(', ')} sudah padat — seimbangkan pillars.`
        });
    }
    if (!recommendations.length) {
        recommendations.push({
            id: 'seed-content',
            priority: 'medium',
            action: 'create_brief',
            cta: 'Kirim brief edukasi',
            platforms: ['instagram'],
            roleId: 'strategist',
            reason: recent.length
                ? 'Belum ada sinyal kuat — mulai dari templat edukasi.'
                : 'Belum ada postingan — buat brief pertama di Kantor AI.'
        });
    }

    const nextUp = {
        headline: recommendations[0]?.cta || 'Apa berikutnya',
        summary: recommendations[0]?.reason || 'Belum ada rekomendasi.',
        recommendations: recommendations.slice(0, 4)
    };

    const mockCount = withStats.filter(p => (p.stats && p.stats.statsSource === 'mock') || !p.stats?.statsSource).length;
    const liveCount = withStats.filter(p => p.stats && p.stats.statsSource === 'live').length;

    return {
        stub: false,
        statsSource: liveCount > 0 && mockCount === 0 ? 'live' : (liveCount > 0 ? 'mixed' : 'mock'),
        statsSourceNote: liveCount === 0
            ? 'Stats lokal sering mock (generateMockStats) — bukan metrics resmi platform.'
            : null,
        windowDays: days,
        sampleSize: recent.length,
        withStats: withStats.length,
        averageEngagement: avgEng,
        frequency: freq,
        bestHour,
        bestFormat,
        insights,
        recommendations: recommendations.slice(0, 6),
        nextUp,
        bestPost: best
            ? { id: best.id, caption: captionSnippet(best.caption, 120), engagement: engagementOf(best), platforms: best.platforms || [], statsSource: best.stats?.statsSource || 'mock' }
            : null,
        worstPost: worst && worst.id !== best?.id
            ? { id: worst.id, caption: captionSnippet(worst.caption, 120), engagement: engagementOf(worst), platforms: worst.platforms || [], statsSource: worst.stats?.statsSource || 'mock' }
            : null
    };
}

module.exports = {
    buildInsights,
    PLATFORMS
};
