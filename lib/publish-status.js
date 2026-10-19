/**
 * Agregasi hasil publish per-platform (partial success eksplisit).
 */

/**
 * @param {Record<string, { status?: string, message?: string }>} results
 * @returns {{
 *   aggregateStatus: 'posted'|'partial'|'failed',
 *   ok: string[],
 *   failed: Array<{ platform: string, message: string }>,
 *   successCount: number,
 *   errorCount: number,
 *   total: number,
 *   summary: string
 * }}
 */
function reconcilePublishResults(results = {}) {
    const entries = Object.entries(results || {});
    if (!entries.length) {
        return {
            aggregateStatus: 'failed',
            ok: [],
            failed: [],
            successCount: 0,
            errorCount: 0,
            total: 0,
            summary: 'Tidak ada hasil platform.'
        };
    }

    const ok = [];
    const failed = [];
    for (const [platform, res] of entries) {
        if (res && res.status === 'success') {
            ok.push(platform);
        } else {
            failed.push({
                platform,
                message: (res && res.message) || 'gagal'
            });
        }
    }

    let aggregateStatus = 'posted';
    if (ok.length === 0) aggregateStatus = 'failed';
    else if (failed.length > 0) aggregateStatus = 'partial';

    const summary = aggregateStatus === 'posted'
        ? `Semua platform berhasil (${ok.length}/${entries.length}).`
        : aggregateStatus === 'partial'
            ? `Sebagian berhasil (${ok.length}/${entries.length}): OK ${ok.join(', ')}; gagal ${failed.map(f => f.platform).join(', ')}.`
            : `Semua platform gagal (${failed.length}/${entries.length}).`;

    return {
        aggregateStatus,
        ok,
        failed,
        successCount: ok.length,
        errorCount: failed.length,
        total: entries.length,
        summary
    };
}

/** Patch fields untuk updatePost setelah publish. */
function publishOutcomeFields(results, { statsFactory } = {}) {
    const recon = reconcilePublishResults(results);
    const fields = {
        status: recon.aggregateStatus,
        publishResults: results,
        publishReconciliation: recon
    };
    if (recon.errorCount > 0) {
        fields.lastError = recon.failed.map(f => `${f.platform}: ${f.message}`).join('; ');
    } else {
        fields.lastError = null;
    }
    if (typeof statsFactory === 'function' && recon.successCount > 0) {
        fields.stats = statsFactory();
    } else if (recon.successCount === 0) {
        fields.stats = null;
    }
    return { fields, reconciliation: recon };
}

module.exports = {
    reconcilePublishResults,
    publishOutcomeFields
};
