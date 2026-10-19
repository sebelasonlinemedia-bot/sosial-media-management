/**
 * Smoke P3: tenant uniqueness helpers, live metrics honesty, TikTok poll classify,
 * object-storage gate, multer major, frontend modules present.
 * Usage: node scripts/test-p3-hardening.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { findAccountIndex } = require('../lib/accounts-tenant');
const { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId, filterByWorkspace } = require('../lib/workspace');
const {
    generateMockStats,
    fetchLiveMetrics,
    fetchLiveMetricsStub,
    summarizeStatsSources
} = require('../lib/metrics');
const { classifyStatus, pollTikTokPublishStatus, DEFAULT_POLL } = require('../lib/tiktok-publish');
const { isBlobConfigured, persistUploadedFile } = require('../lib/object-storage');

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed += 1;
    } else {
        console.log('PASS:', msg);
    }
}

// --- Tenant / workspace isolation (JSON path) ---
const accounts = [
    { platform: 'instagram', workspaceId: 'default', id: 'a1' },
    { platform: 'instagram', workspaceId: 'acme', id: 'a2' },
    { platform: 'facebook', workspaceId: 'default', id: 'a3' }
];
assert(findAccountIndex(accounts, 'instagram', 'default') === 0, 'find default instagram');
assert(findAccountIndex(accounts, 'instagram', 'acme') === 1, 'find acme instagram (same platform OK)');
assert(findAccountIndex(accounts, 'tiktok', 'default') === -1, 'missing platform');
const onlyAcme = filterByWorkspace(accounts, 'acme', { includeMissing: false });
assert(onlyAcme.length === 1 && onlyAcme[0].id === 'a2', 'filter acme isolates');
assert(normalizeWorkspaceId('acme') === 'acme', 'workspace normalize');

// --- Metrics honesty ---
const mock = generateMockStats();
assert(mock.statsSource === 'mock', 'mock tagged');

(async () => {
    const noToken = await fetchLiveMetrics({ platform: 'instagram', account: { platform: 'instagram' } });
    assert(noToken.available === false && noToken.statsSource === 'unavailable', 'no token → unavailable (not live)');

    const stubCompat = await fetchLiveMetricsStub({});
    assert(stubCompat.statsSource === 'unavailable', 'stub without args → unavailable');

    const sum = summarizeStatsSources([
        { stats: { statsSource: 'mock' } },
        { stats: { statsSource: 'live' } }
    ]);
    assert(sum.overall === 'mixed', 'mixed sources');

    // --- TikTok poll classify + timeout docs ---
    assert(classifyStatus('PUBLISH_COMPLETE').terminal && classifyStatus('PUBLISH_COMPLETE').ok, 'TT complete');
    assert(classifyStatus('FAILED').terminal && !classifyStatus('FAILED').ok, 'TT failed');
    assert(!classifyStatus('PROCESSING_UPLOAD').terminal, 'TT processing non-terminal');
    assert(DEFAULT_POLL.timeoutMs === 45000, 'TT poll timeout documented 45s');

    const skipped = await pollTikTokPublishStatus({ accessToken: '', publishId: '' });
    assert(skipped.pollStatus === 'skipped', 'poll skipped without id');

    // Fake axios that returns complete on first call
    const fakeAxios = {
        async post() {
            return { data: { data: { status: 'PUBLISH_COMPLETE' } } };
        }
    };
    const done = await pollTikTokPublishStatus({
        accessToken: 'x',
        publishId: 'pid-1',
        axiosInstance: fakeAxios,
        poll: { maxAttempts: 3, intervalMs: 1, timeoutMs: 5000 }
    });
    assert(done.pollStatus === 'complete' && done.ok === true, 'poll complete via mock axios');

    // --- Object storage: no token required ---
    assert(typeof isBlobConfigured() === 'boolean', 'blob configured boolean');
    const tmp = path.join(__dirname, '..', 'uploads', `_p3_smoke_${Date.now()}.txt`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, 'p3-smoke');
    const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const localPersist = await persistUploadedFile({
        localPath: tmp,
        filename: path.basename(tmp),
        contentType: 'text/plain'
    });
    assert(localPersist.storage === 'local', 'without blob token → local storage');
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    if (prevBlob) process.env.BLOB_READ_WRITE_TOKEN = prevBlob;

    // --- multer major ≥ 2 ---
    const multerPkg = require('multer/package.json');
    const major = parseInt(String(multerPkg.version).split('.')[0], 10);
    assert(major >= 2, `multer major ≥ 2 (got ${multerPkg.version})`);

    // --- frontend modules exist ---
    const authUi = path.join(__dirname, '..', 'js', 'auth-ui.js');
    const officeApi = path.join(__dirname, '..', 'js', 'office-api.js');
    assert(fs.existsSync(authUi), 'js/auth-ui.js present');
    assert(fs.existsSync(officeApi), 'js/office-api.js present');

    // express-session should not be a direct runtime require in server (removed unused)
    let sessionRequired = false;
    try {
        require.resolve('express-session');
        // still may exist in lockfile transitively — only fail if server.js requires it
        const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        sessionRequired = /require\(['"]express-session['"]\)/.test(serverSrc);
    } catch {
        sessionRequired = false;
    }
    assert(!sessionRequired, 'server.js does not require express-session');

    if (failed) {
        console.error(`\n${failed} failure(s)`);
        process.exit(1);
    }
    console.log('\nAll P3 smoke checks passed.');
})().catch(err => {
    console.error('FAIL: async suite', err);
    process.exit(1);
});
