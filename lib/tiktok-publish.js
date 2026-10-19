/**
 * TikTok Content Posting — poll status sampai terminal atau timeout (INT-06 / P3).
 * Tidak memulai publish baru; hanya fetch status publish_id.
 *
 * Timeout default 45s (dokumentasi: serverless/Vercel ~60s limit — sisakan headroom).
 */

const axios = require('axios');

const TERMINAL_OK = new Set(['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX']);
const TERMINAL_FAIL = new Set(['FAILED', 'PUBLISH_FAILED', 'ERROR']);

const DEFAULT_POLL = {
    maxAttempts: 15,
    intervalMs: 3000,
    /** total wall ≈ 45s */
    timeoutMs: 45000
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyStatus(raw) {
    const status = String(raw || '').toUpperCase();
    if (TERMINAL_OK.has(status)) return { terminal: true, ok: true, status };
    if (TERMINAL_FAIL.has(status)) return { terminal: true, ok: false, status };
    return { terminal: false, ok: false, status: status || 'UNKNOWN' };
}

/**
 * Poll TikTok publish status.
 * @param {{ accessToken: string, publishId: string, axiosInstance?: typeof axios, poll?: Partial<typeof DEFAULT_POLL> }} opts
 */
async function pollTikTokPublishStatus(opts = {}) {
    const {
        accessToken,
        publishId,
        axiosInstance = axios,
        poll = {}
    } = opts;
    const cfg = { ...DEFAULT_POLL, ...poll };
    const started = Date.now();

    if (!accessToken || !publishId) {
        return {
            ok: false,
            pending: true,
            pollStatus: 'skipped',
            status: null,
            attempts: 0,
            elapsedMs: 0,
            message: 'publish_id atau token kosong — poll dilewati.',
            timeoutMs: cfg.timeoutMs
        };
    }

    let lastStatus = null;
    let attempts = 0;
    let lastPayload = null;

    while (attempts < cfg.maxAttempts && (Date.now() - started) < cfg.timeoutMs) {
        attempts += 1;
        try {
            const res = await axiosInstance.post(
                'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
                { publish_id: publishId },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json; charset=UTF-8'
                    },
                    timeout: 10000
                }
            );
            lastPayload = res.data;
            const statusRaw = res.data?.data?.status || res.data?.data?.publish_status;
            lastStatus = statusRaw;
            const classified = classifyStatus(statusRaw);
            if (classified.terminal) {
                return {
                    ok: classified.ok,
                    pending: false,
                    pollStatus: classified.ok ? 'complete' : 'failed',
                    status: classified.status,
                    attempts,
                    elapsedMs: Date.now() - started,
                    message: classified.ok
                        ? 'TikTok publish selesai (terminal OK).'
                        : `TikTok publish gagal: ${classified.status}`,
                    timeoutMs: cfg.timeoutMs,
                    raw: lastPayload
                };
            }
        } catch (err) {
            lastPayload = err.response?.data || { error: err.message };
            // network/API error: lanjut retry sampai timeout
        }
        if (attempts < cfg.maxAttempts && (Date.now() - started) < cfg.timeoutMs) {
            await sleep(cfg.intervalMs);
        }
    }

    return {
        ok: false,
        pending: true,
        pollStatus: 'timeout',
        status: lastStatus,
        attempts,
        elapsedMs: Date.now() - started,
        message: `Poll timeout setelah ~${cfg.timeoutMs}ms / ${attempts} attempt (status terakhir: ${lastStatus || 'n/a'}). Init mungkin tetap diproses di sisi TikTok.`,
        timeoutMs: cfg.timeoutMs,
        raw: lastPayload
    };
}

module.exports = {
    TERMINAL_OK,
    TERMINAL_FAIL,
    DEFAULT_POLL,
    classifyStatus,
    pollTikTokPublishStatus
};
