/**
 * Smoke P2: workspace, publish reconcile, metrics mock flag, manual gate, safe-log, health shape.
 * Usage: node scripts/test-p2-hardening.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
    DEFAULT_WORKSPACE_ID,
    normalizeWorkspaceId,
    filterByWorkspace,
    withWorkspaceId
} = require('../lib/workspace');
const { reconcilePublishResults, publishOutcomeFields } = require('../lib/publish-status');
const { generateMockStats, fetchLiveMetricsStub, summarizeStatsSources } = require('../lib/metrics');
const { evaluateManualPublishGate, normalizeAiSettings } = require('../lib/ai-policy');
const { redactSecrets } = require('../lib/safe-log');

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed += 1;
    } else {
        console.log('PASS:', msg);
    }
}

// Workspace
assert(DEFAULT_WORKSPACE_ID === 'default', 'default workspace id');
assert(normalizeWorkspaceId('') === 'default', 'empty → default');
assert(normalizeWorkspaceId('evil space!') === 'default', 'invalid → default');
assert(normalizeWorkspaceId('acme-1') === 'acme-1', 'valid workspace id');
assert(withWorkspaceId({ a: 1 }, 'acme').workspaceId === 'acme', 'withWorkspaceId stamps');
const filtered = filterByWorkspace(
    [{ id: 1, workspaceId: 'default' }, { id: 2, workspaceId: 'other' }, { id: 3 }],
    'default',
    { includeMissing: true }
);
assert(filtered.length === 2 && filtered.every(r => !r.workspaceId || r.workspaceId === 'default'), 'filter default includes legacy');

// Publish reconcile
const allOk = reconcilePublishResults({
    instagram: { status: 'success' },
    facebook: { status: 'success' }
});
assert(allOk.aggregateStatus === 'posted' && allOk.successCount === 2, 'all success → posted');

const partial = reconcilePublishResults({
    instagram: { status: 'success' },
    facebook: { status: 'error', message: 'fail' }
});
assert(partial.aggregateStatus === 'partial' && partial.errorCount === 1, 'mixed → partial');

const allFail = reconcilePublishResults({
    instagram: { status: 'error', message: 'x' }
});
assert(allFail.aggregateStatus === 'failed', 'all error → failed');

const outcome = publishOutcomeFields({
    instagram: { status: 'success' },
    tiktok: { status: 'error', message: 'no' }
}, { statsFactory: generateMockStats });
assert(outcome.fields.status === 'partial', 'outcome fields status partial');
assert(outcome.fields.stats && outcome.fields.stats.statsSource === 'mock', 'stats mock tagged');
assert(outcome.fields.publishReconciliation.summary.includes('Sebagian'), 'summary mentions partial');

// Metrics
const mock = generateMockStats();
assert(mock.statsSource === 'mock', 'mock statsSource');
assert((async () => {
    const stub = await fetchLiveMetricsStub();
    return stub.available === false && stub.statsSource === 'unavailable';
})() instanceof Promise, 'live stub returns promise');

(async () => {
    const stub = await fetchLiveMetricsStub();
    assert(stub.available === false, 'live stub unavailable');
    const sum = summarizeStatsSources([
        { stats: { statsSource: 'mock' } },
        { stats: { statsSource: 'live' } }
    ]);
    assert(sum.overall === 'mixed', 'stats source mixed');

    // Manual gate
    const settings = normalizeAiSettings({
        emergencyPause: false,
        dailyPostCap: 10,
        autonomyLevel: 'suggest_only'
    });
    const gateOk = evaluateManualPublishGate({
        settings,
        platforms: ['instagram'],
        caption: 'Halo dunia edukasi rutin',
        recentPosts: []
    });
    assert(gateOk.allowPublish === true, 'manual allow on suggest_only');
    assert(gateOk.warnings.some(w => /suggest_only/.test(w)), 'manual warns autonomy');

    const paused = evaluateManualPublishGate({
        settings: normalizeAiSettings({ emergencyPause: true }),
        platforms: ['instagram'],
        caption: 'x',
        recentPosts: []
    });
    assert(paused.allowPublish === false && paused.policy === 'emergency_pause', 'manual blocks emergency');

    // Safe log redaction
    const red = redactSecrets({
        password: 'secret',
        accessToken: 'EAAG123',
        nested: { refreshToken: 'rt', ok: true },
        message: 'hello'
    });
    assert(red.password === '[REDACTED]', 'password redacted');
    assert(red.accessToken === '[REDACTED]', 'accessToken redacted');
    assert(red.nested.refreshToken === '[REDACTED]', 'nested refresh redacted');
    assert(red.message === 'hello' && red.nested.ok === true, 'non-secrets kept');

    if (failed) {
        console.error(`\n${failed} failure(s)`);
        process.exit(1);
    }
    console.log('\nAll P2 smoke checks passed.');
})().catch(err => {
    console.error('FAIL: async suite', err);
    process.exit(1);
});
