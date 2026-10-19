/**
 * Vercel serverless entry — Express app
 * Lazy-load + catch so boot failures return a clear 500 JSON instead of
 * FUNCTION_INVOCATION_FAILED with an opaque crash.
 */
let app;
let loadError;

try {
    app = require('../server');
} catch (err) {
    loadError = err;
    console.error('[api/index] Failed to load server:', err && err.stack ? err.stack : err);
}

module.exports = (req, res) => {
    if (loadError || !app) {
        const message = loadError ? loadError.message : 'Server module failed to load';
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            success: false,
            error: 'FUNCTION_BOOT_FAILED',
            message
        }));
        return;
    }
    return app(req, res);
};
