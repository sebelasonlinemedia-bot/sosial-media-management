/**
 * Unit smoke draft-history (adopsi kantor-ai): versi, stale guard, revisi.
 * Usage: node scripts/test-draft-history.js
 */
const {
    draftVersionLabel,
    parseVersion,
    listDraftHistory,
    listDraftVersions,
    checkExpectedVersion,
    buildRevision
} = require('../lib/draft-history');

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed += 1;
    } else {
        console.log('PASS:', msg);
    }
}

assert(draftVersionLabel(1) === 'v1', 'label v1');
assert(draftVersionLabel(250) === 'v99', 'label capped v99');
assert(parseVersion('v3') === 3 && parseVersion(3) === 3 && parseVersion('x') === null, 'parseVersion');

const job = {
    version: 2,
    caption: 'Caption lama',
    draftHistory: [
        { at: '2026-10-21T00:00:00.000Z', type: 'created', version: 'v1', brief: 'Brief awal' },
        { at: '2026-10-21T01:00:00.000Z', type: 'draft', version: 'v2', caption: 'Caption lama' },
        null,
        { type: 'unknown-type', version: 'v2' }
    ]
};

const history = listDraftHistory(job);
assert(history.length === 3, 'history membuang entri rusak');
assert(history[0].typeLabel === 'Job dibuat', 'label tipe created');
assert(listDraftVersions(job).length === 3, 'draft versions termasuk fallback tipe');

assert(checkExpectedVersion(job, 2).ok === true, 'expectedVersion cocok');
assert(checkExpectedVersion(job, 'v2').ok === true, 'expectedVersion label cocok');
assert(checkExpectedVersion(job, 1).ok === false, 'expectedVersion basi ditolak');
assert(checkExpectedVersion(job, undefined).ok === true, 'tanpa expectedVersion tetap ok (kompatibel lama)');

const empty = buildRevision(job, { note: '  ' });
assert(empty.ok === false, 'revisi tanpa komentar ditolak');

const rev = buildRevision(job, { note: 'Hook kurang kuat, perbaiki CTA.', actor: 'ceo@test' });
assert(rev.ok === true && rev.nextVersion === 3, 'revisi naik ke v3');
assert(rev.entry.type === 'revision' && rev.entry.version === 'v3', 'entri revisi v3');
assert(rev.entry.previousCaption === 'Caption lama', 'snapshot caption sebelumnya tersimpan');
assert(rev.entry.revisionNote.includes('Hook'), 'komentar revisi tersimpan');

if (failed) {
    console.error(`\n${failed} assertion gagal`);
    process.exit(1);
}
console.log('\nSemua assertion lolos.');
