/**
 * Standup Konten Terstruktur — sesi berfase dengan urutan bicara tetap:
 * Maya → Rani → Dimas → Salsa → Titin → Bimo → Nadira.
 *
 * Fase: gathering (semua berkumpul / meeting) → in_progress (giliran bicara)
 * → complete (selesai; follow-up bisa dijadikan job beneran oleh server).
 * Modul ini murni: membangun kartu & memajukan fase tanpa menyentuh DB.
 * Penyimpanan sesi di aiSettings.standupSession (oleh server.js).
 */

const { listRoles } = require('./ai-roles');

const STANDUP_PHASES = ['gathering', 'in_progress', 'complete'];
const SPEAKER_ORDER = ['manager', 'strategist', 'copywriter', 'visual-producer', 'community-manager', 'analyst', 'compliance'];
const ACTIVE_STATUSES = ['queued', 'needs_info', 'publishing', 'awaiting_approval'];

function roleOrder() {
    const roles = listRoles();
    return SPEAKER_ORDER
        .map(id => roles.find(r => r.id === id))
        .filter(Boolean);
}

function jobsForRole(jobs, role) {
    return (jobs || []).filter(j =>
        j.roleId === role.id ||
        (j.employeeName && String(j.employeeName).toLowerCase() === role.name.toLowerCase())
    );
}

/** Kartu standup per peran dari job aktif, blocker, dan rekomendasi nextUp. */
function buildStandupCards({ jobs = [], insights = null } = {}) {
    const recs = insights && insights.nextUp && Array.isArray(insights.nextUp.recommendations)
        ? insights.nextUp.recommendations
        : [];
    return roleOrder().map(role => {
        const mine = jobsForRole(jobs, role);
        const active = mine.filter(j => ACTIVE_STATUSES.includes(j.status));
        const blockers = mine.filter(j => j.status === 'needs_info' || j.status === 'failed');
        const myRecs = recs.filter(r => r.roleId === role.id);
        const headline = active.length
            ? `${active.length} job aktif (${active.map(j => j.status).join(', ')})`
            : 'Tidak ada job aktif';
        const followUp = myRecs.length
            ? {
                roleId: role.id,
                brief: `${myRecs[0].cta || 'Konten lanjutan'} — ${myRecs[0].reason || ''} Platform: ${(myRecs[0].platforms || []).join(', ') || 'instagram'}. CTA jelas. Tone sesuai brand memory.`,
                source: 'insights'
            }
            : blockers.length
                ? {
                    roleId: role.id,
                    brief: `Tindak lanjuti blocker: ${(blockers[0].brief || blockers[0].lastError || 'job bermasalah').slice(0, 140)}`,
                    source: 'blocker'
                }
                : null;
        return {
            roleId: role.id,
            name: role.name,
            title: role.title,
            emoji: role.emoji,
            headline,
            activeJobIds: active.map(j => j.id),
            blockers: blockers.map(j => ({
                id: j.id,
                status: j.status,
                brief: (j.brief || '').slice(0, 140),
                questions: j.questions || [],
                lastError: j.lastError || null
            })),
            nextUp: myRecs.map(r => ({ cta: r.cta || '', reason: r.reason || '', platforms: r.platforms || [] })),
            followUp
        };
    });
}

function createStandupSession({ jobs = [], insights = null, now = new Date() } = {}) {
    const cards = buildStandupCards({ jobs, insights });
    return {
        id: `standup-${now.getTime()}`,
        phase: 'gathering',
        speakerIndex: 0,
        speakerOrder: cards.map(c => c.roleId),
        cards,
        createdJobIds: [],
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        finishedAt: null
    };
}

function normalizeStandupSession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        id: raw.id || null,
        phase: STANDUP_PHASES.includes(raw.phase) ? raw.phase : 'gathering',
        speakerIndex: Math.max(0, parseInt(raw.speakerIndex, 10) || 0),
        speakerOrder: Array.isArray(raw.speakerOrder) && raw.speakerOrder.length ? raw.speakerOrder : [...SPEAKER_ORDER],
        cards: Array.isArray(raw.cards) ? raw.cards : [],
        createdJobIds: Array.isArray(raw.createdJobIds) ? raw.createdJobIds : [],
        startedAt: raw.startedAt || null,
        updatedAt: raw.updatedAt || null,
        finishedAt: raw.finishedAt || null
    };
}

function currentSpeaker(session) {
    const s = normalizeStandupSession(session);
    if (!s) return null;
    const roleId = s.speakerOrder[s.speakerIndex] || null;
    return {
        roleId,
        card: s.cards.find(c => c.roleId === roleId) || null,
        index: s.speakerIndex,
        total: s.speakerOrder.length
    };
}

/** Maju satu langkah: gathering → in_progress → pembicara berikutnya → complete. */
function advanceStandupSession(session, now = new Date()) {
    const s = normalizeStandupSession(session);
    if (!s) return null;
    if (s.phase === 'gathering') {
        s.phase = 'in_progress';
        s.speakerIndex = 0;
    } else if (s.phase === 'in_progress') {
        if (s.speakerIndex >= s.speakerOrder.length - 1) {
            s.phase = 'complete';
            s.finishedAt = now.toISOString();
        } else {
            s.speakerIndex += 1;
        }
    }
    s.updatedAt = now.toISOString();
    return s;
}

function finishStandupSession(session, now = new Date()) {
    const s = normalizeStandupSession(session);
    if (!s) return null;
    s.phase = 'complete';
    s.finishedAt = now.toISOString();
    s.updatedAt = now.toISOString();
    return s;
}

/** Follow-up items yang siap dijadikan job (satu per peran, bila ada). */
function collectFollowUps(session) {
    const s = normalizeStandupSession(session);
    if (!s) return [];
    return s.cards
        .filter(c => c.followUp && c.followUp.brief)
        .map(c => ({ roleId: c.followUp.roleId || c.roleId, brief: c.followUp.brief, source: c.followUp.source || 'standup' }));
}

module.exports = {
    STANDUP_PHASES,
    SPEAKER_ORDER,
    buildStandupCards,
    createStandupSession,
    normalizeStandupSession,
    currentSpeaker,
    advanceStandupSession,
    finishStandupSession,
    collectFollowUps
};
