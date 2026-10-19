/**
 * Rate limiter in-memory ringan (single process / satu instance).
 * Cukup untuk login + publish abuse di lab; bukan distributed limiter.
 */

function createRateLimiter(options = {}) {
    const windowMs = options.windowMs != null ? options.windowMs : 15 * 60 * 1000;
    const max = options.max != null ? options.max : 20;
    const message = options.message || 'Terlalu banyak permintaan. Coba lagi nanti.';
    const hits = new Map();

    function prune(now) {
        if (hits.size < 500) return;
        for (const [k, v] of hits) {
            if (now - v.start > windowMs) hits.delete(k);
        }
    }

    function keyFrom(req) {
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        const user = req.user?.id || 'anon';
        return `${String(ip).split(',')[0].trim()}:${user}:${req.path}`;
    }

    function middleware(req, res, next) {
        const now = Date.now();
        prune(now);
        const key = keyFrom(req);
        let entry = hits.get(key);
        if (!entry || now - entry.start > windowMs) {
            entry = { start: now, count: 0 };
            hits.set(key, entry);
        }
        entry.count += 1;
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
        if (entry.count > max) {
            return res.status(429).json({ success: false, message });
        }
        return next();
    }

    middleware._hits = hits;
    middleware.reset = () => hits.clear();
    return middleware;
}

module.exports = { createRateLimiter };
