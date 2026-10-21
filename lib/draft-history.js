/**
 * Riwayat draf & versi job AI — adopsi pola "draft history" dari kantor-ai:
 * setiap draf/revisi tersimpan sebagai versi, revisi mengembalikan job ke antrean
 * dengan draf sebelumnya tetap tersimpan, dan approve dapat memakai expectedVersion
 * agar draf lama yang sudah berubah tidak ikut disetujui (stale guard).
 *
 * Modul murni: tidak menyentuh DB. Penyimpanan tetap di job.draftHistory (server.js).
 */

const HISTORY_TYPE_LABELS = {
    created: 'Job dibuat',
    answer: 'Jawaban klarifikasi',
    draft: 'Draf diserahkan',
    revision: 'Revisi diminta',
    approved: 'Disetujui',
    run_start: 'Mulai publish',
    run_done: 'Publish selesai',
    run_failed: 'Publish gagal'
};

/** Label versi baku: 1 → 'v1' (dibatasi v99, pola draftVersionLabel server). */
function draftVersionLabel(version) {
    const v = Math.max(1, parseInt(version, 10) || 1);
    return 'v' + Math.min(v, 99);
}

/** Angka versi dari label/angka campuran: 'v3' → 3, 3 → 3, null → null. */
function parseVersion(value) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.trunc(value));
    const m = String(value).trim().match(/^v?(\d+)$/i);
    return m ? Math.max(1, parseInt(m[1], 10)) : null;
}

/** Normalisasi satu entri riwayat agar aman ditampilkan UI. */
function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const type = HISTORY_TYPE_LABELS[entry.type] ? entry.type : 'draft';
    return {
        at: entry.at || null,
        type,
        typeLabel: HISTORY_TYPE_LABELS[type],
        version: entry.version || null,
        versionNumber: parseVersion(entry.version),
        caption: entry.caption ? String(entry.caption) : '',
        brief: entry.brief ? String(entry.brief) : '',
        note: entry.note || entry.complianceNote || null,
        revisionNote: entry.revisionNote ? String(entry.revisionNote) : '',
        previousCaption: entry.previousCaption ? String(entry.previousCaption) : '',
        answers: Array.isArray(entry.answers) ? entry.answers.map(a => String(a)) : [],
        actor: entry.actor ? String(entry.actor) : '',
        lastError: entry.lastError || null,
        publishStatus: entry.publishStatus || null
    };
}

/** Riwayat ternormalisasi milik job (urutan kronologis, entri rusak dibuang). */
function listDraftHistory(job) {
    const raw = Array.isArray(job?.draftHistory) ? job.draftHistory : [];
    return raw.map(normalizeHistoryEntry).filter(Boolean);
}

/** Hanya entri yang merupakan versi draf (untuk daftar versi & perbandingan). */
function listDraftVersions(job) {
    return listDraftHistory(job).filter(e => ['created', 'answer', 'draft', 'revision'].includes(e.type));
}

/** Versi aktif job saat ini (angka). */
function currentVersion(job) {
    return Math.max(1, parseInt(job?.version, 10) || 1);
}

/**
 * Penjaga versi basi: expectedVersion (dari UI saat modal dibuka) harus sama
 * dengan versi job sekarang. Tanpa expectedVersion → selalu ok (kompatibel lama).
 */
function checkExpectedVersion(job, expectedVersion) {
    const expected = parseVersion(expectedVersion);
    if (expected == null) return { ok: true, expected: null, current: currentVersion(job) };
    const current = currentVersion(job);
    if (expected !== current) {
        return {
            ok: false,
            expected,
            current,
            message: `Draf sudah berubah ke ${draftVersionLabel(current)} sejak Anda membuka halaman ini (Anda melihat ${draftVersionLabel(expected)}). Segarkan lalu periksa versi terbaru sebelum menyetujui.`
        };
    }
    return { ok: true, expected, current };
}

/**
 * Bangun data revisi: versi naik, entri riwayat menyimpan komentar revisi +
 * snapshot caption sebelumnya, job kembali ke antrean menunggu draf baru.
 */
function buildRevision(job, { note, actor = 'user', now = new Date() } = {}) {
    const revisionNote = String(note || '').trim();
    if (!revisionNote) {
        return { ok: false, message: 'Isi komentar revisi dulu — agen perlu tahu apa yang harus diubah.' };
    }
    const nextVersion = currentVersion(job) + 1;
    const entry = {
        at: now.toISOString(),
        type: 'revision',
        version: draftVersionLabel(nextVersion),
        revisionNote,
        previousCaption: job.caption ? String(job.caption) : '',
        caption: job.caption ? String(job.caption) : '',
        actor: String(actor || 'user')
    };
    return { ok: true, nextVersion, entry, revisionNote };
}

module.exports = {
    HISTORY_TYPE_LABELS,
    draftVersionLabel,
    parseVersion,
    normalizeHistoryEntry,
    listDraftHistory,
    listDraftVersions,
    currentVersion,
    checkExpectedVersion,
    buildRevision
};
