/**
 * Derivasi state visual tersuling untuk avatar 3D (dua tahap: latch + hold).
 *
 * Tahap 1 — LATCH "thinking": saat job peran transisi queued→publishing,
 * state `thinking` ditahan selama THINKING_LATCH_MS sejak transisi terlihat,
 * supaya avatar sempat "berpikir" sebelum pose publish/kerja penuh.
 * Logika waktunya murni: latch disimpan sebagai { key, at } di Map yang
 * diberikan pemanggil (server menyimpannya in-memory per proses).
 *
 * Tahap 2 — HOLD: state hasil derivasi ditahan stabil oleh klien sampai
 * payload /api/ai/office berikutnya (tidak ada flicker per frame).
 *
 * Ambang overloaded: OVERLOADED_ACTIVE_THRESHOLD = 4 job aktif per peran.
 * Alasan: 1–3 job aktif masih wajar untuk satu peran (antri + approval +
 * needs_info); ≥4 berarti antrean menumpuk dan avatar tampil lelah.
 */

const { summarizeWorkload } = require('./ai-roles');

const THINKING_LATCH_MS = 4000;
const OVERLOADED_ACTIVE_THRESHOLD = 4;

const ANIMATION_LABELS = {
    idle: 'Siaga',
    working: 'Bekerja',
    waiting: 'Menunggu',
    blocked: 'Terhambat',
    overloaded: 'Kelebihan beban',
    meeting: 'Rapat',
    at_desk: 'Di meja',
    thinking: 'Berpikir…'
};

const ACTIVE_STATUSES = ['queued', 'needs_info', 'publishing', 'awaiting_approval'];

/**
 * Murni: apakah latch thinking masih aktif?
 * @param {{ at: number|string }|null} latch
 * @param {number} nowMs
 * @param {number} [latchMs]
 */
function isThinkingLatched(latch, nowMs, latchMs = THINKING_LATCH_MS) {
    if (!latch || latch.at == null) return false;
    const at = typeof latch.at === 'number' ? latch.at : new Date(latch.at).getTime();
    if (Number.isNaN(at)) return false;
    const elapsed = nowMs - at;
    return elapsed >= 0 && elapsed < latchMs;
}

/**
 * Catat transisi queued→publishing ke dalam Map latch (kunci bebas, mis. roleId).
 * Mengembalikan latch aktif atau null. Fungsi ini memutasi Map yang diberikan
 * secara sengaja (store dipegang pemanggil), logika keputusannya tetap murni
 * terhadap (status, now).
 */
function updateThinkingLatch(latchMap, key, prevStatus, nextStatus, nowMs = Date.now()) {
    if (!(latchMap instanceof Map) || !key) return null;
    if (prevStatus === 'queued' && nextStatus === 'publishing') {
        latchMap.set(key, { at: nowMs, from: prevStatus, to: nextStatus });
    }
    const latch = latchMap.get(key) || null;
    if (latch && !isThinkingLatched(latch, nowMs)) {
        latchMap.delete(key);
        return null;
    }
    return latch;
}

/**
 * Derivasi state visual per peran.
 * @param {object} input
 * @param {string} [input.status] status karyawan hasil deriveEmployeeStatus/presence
 * @param {object[]} [input.jobs] job milik peran (terbaru dulu bila ada)
 * @param {object} [input.workload] hasil summarizeWorkload (dihitung ulang bila kosong)
 * @param {string|null} [input.presenceMode] mode presence per peran (idle|at_desk|meeting)
 * @param {object|null} [input.latch] latch thinking aktif (dari updateThinkingLatch)
 * @param {number} [input.now] timestamp ms
 */
function deriveRoleAnimation(input = {}) {
    const jobs = Array.isArray(input.jobs) ? input.jobs : [];
    const workload = input.workload || summarizeWorkload(jobs);
    const activeCount = workload.activeCount || 0;
    const byStatus = workload.byStatus || {};
    const now = typeof input.now === 'number' ? input.now : Date.now();

    let state;
    // Prioritas (jelas & teruji): thinking > blocked > waiting > overloaded >
    // working > meeting > at_desk > idle.
    if (isThinkingLatched(input.latch, now)) state = 'thinking';
    else if (input.status === 'failed' || jobs.some(j => j.status === 'failed' && j === jobs[0])) state = 'blocked';
    else if ((byStatus.needs_info || 0) > 0 || (byStatus.awaiting_approval || 0) > 0 ||
        input.status === 'needs_info' || (input.status === 'awaiting_approval' && input.presenceMode !== 'meeting')) state = 'waiting';
    else if (activeCount >= OVERLOADED_ACTIVE_THRESHOLD) state = 'overloaded';
    else if ((byStatus.publishing || 0) > 0 || (byStatus.queued || 0) > 0 || input.status === 'working') state = 'working';
    else if (input.presenceMode === 'meeting' || input.status === 'awaiting_approval') state = 'meeting';
    else if (input.presenceMode === 'at_desk' || input.status === 'standby') state = 'at_desk';
    else state = 'idle';

    const pose = { thinking: 'thinking', waiting: 'waiting', overloaded: 'tired', blocked: 'slump' }[state] ||
        (state === 'working' ? 'work' : state === 'meeting' ? 'stand' : state === 'at_desk' ? 'sit' : 'stand');

    return {
        state,
        pose,
        label: ANIMATION_LABELS[state] || state,
        activeCount,
        overloadedThreshold: OVERLOADED_ACTIVE_THRESHOLD,
        thinkingUntil: state === 'thinking' && input.latch
            ? new Date((typeof input.latch.at === 'number' ? input.latch.at : new Date(input.latch.at).getTime()) + THINKING_LATCH_MS).toISOString()
            : null
    };
}

module.exports = {
    THINKING_LATCH_MS,
    OVERLOADED_ACTIVE_THRESHOLD,
    ANIMATION_LABELS,
    ACTIVE_STATUSES,
    isThinkingLatched,
    updateThinkingLatch,
    deriveRoleAnimation
};
