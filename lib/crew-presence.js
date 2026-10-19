/**
 * Arahan posisi karyawan di Kantor AI 3D (meja / idle / meeting).
 * Dipicu dari Chat CEO — independent dari job work board.
 */

const { listRoles, normalizeRoleId } = require('./ai-roles');

const PRESENCE_MODES = ['idle', 'at_desk', 'meeting'];

const DEFAULT_CREW_PRESENCE = {
    mode: 'idle',
    roleIds: null,
    note: '',
    updatedAt: null
};

function normalizeCrewPresence(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    let mode = String(p.mode || 'idle').toLowerCase();
    if (!PRESENCE_MODES.includes(mode)) mode = 'idle';
    let roleIds = null;
    if (Array.isArray(p.roleIds) && p.roleIds.length) {
        const all = listRoles().map(r => r.id);
        const mapped = p.roleIds
            .map(id => normalizeRoleId(String(id)))
            .filter(id => all.includes(id));
        roleIds = mapped.length ? [...new Set(mapped)] : null;
    }
    return {
        mode,
        roleIds,
        note: p.note ? String(p.note).slice(0, 160) : '',
        updatedAt: p.updatedAt || null
    };
}

function presenceAppliesToRole(presence, roleId) {
    const p = normalizeCrewPresence(presence);
    if (p.mode === 'idle' && !p.roleIds) return true;
    if (!p.roleIds || !p.roleIds.length) return true;
    return p.roleIds.includes(normalizeRoleId(roleId));
}

/**
 * Status visual untuk 3D/kartu jika ada arahan CEO dan job status idle.
 * Job aktif (working/needs_info/…) tetap menang.
 */
function applyPresenceToStatus(jobStatus, presence, roleId) {
    const p = normalizeCrewPresence(presence);
    if (!presenceAppliesToRole(p, roleId)) return { status: jobStatus, fromPresence: false };
    if (jobStatus && jobStatus !== 'idle' && jobStatus !== 'done') {
        return { status: jobStatus, fromPresence: false };
    }
    if (p.mode === 'at_desk') {
        return { status: 'standby', fromPresence: true, note: p.note || 'Siaga di meja' };
    }
    if (p.mode === 'meeting') {
        return { status: 'awaiting_approval', fromPresence: true, note: p.note || 'Rapat tim' };
    }
    return { status: jobStatus === 'done' ? 'done' : 'idle', fromPresence: p.mode === 'idle' };
}

/**
 * Heuristik dari pesan CEO (tanpa mengandalkan LLM).
 * @returns {{ mode, roleIds, note } | null}
 */
function inferCrewPresenceFromMessage(message) {
    const t = String(message || '').toLowerCase();
    if (!t.trim()) return null;

    const roleHits = [];
    for (const r of listRoles()) {
        const name = String(r.name || '').toLowerCase();
        const title = String(r.title || '').toLowerCase();
        if ((name && t.includes(name)) || (title && t.includes(title)) || t.includes(r.id)) {
            roleHits.push(r.id);
        }
    }

    const atDesk =
        /\b(duduk|meja|komputer|laptop|kerja|work\s*desk|siaga|standby|kembali ke meja|ke meja|depan komputer|monitor|work board)\b/i.test(t) ||
        /siaga.*meja|meja.*kerja|duduk.*komputer|ke meja/i.test(t);
    const meeting = /\b(rapat|meeting|kumpul|briefing|meja bundar|conference)\b/i.test(t);
    const idle =
        /\b(istirahat|santai|idle|lounge|bebas|jalan[- ]?jalan|rekreasi|game|arcade|break|pulang)\b/i.test(t);

    let mode = null;
    if (atDesk && !idle) mode = 'at_desk';
    else if (meeting) mode = 'meeting';
    else if (idle) mode = 'idle';

    if (!mode) return null;

    const note =
        mode === 'at_desk'
            ? 'Siaga di meja (perintah CEO)'
            : mode === 'meeting'
              ? 'Rapat (perintah CEO)'
              : 'Istirahat (perintah CEO)';

    return {
        mode,
        roleIds: roleHits.length ? roleHits : null,
        note,
        updatedAt: new Date().toISOString()
    };
}

/** Gabungkan hasil LLM officeAction + heuristik pesan (heuristik menang jika LLM kosong). */
function resolveCrewPresenceUpdate(ceoMessage, officeAction) {
    const fromLlm = officeAction && typeof officeAction === 'object'
        ? normalizeCrewPresence({
            mode: officeAction.mode,
            roleIds: officeAction.roleIds === 'all' || officeAction.all
                ? null
                : officeAction.roleIds,
            note: officeAction.note || '',
            updatedAt: new Date().toISOString()
        })
        : null;

    const fromMsg = inferCrewPresenceFromMessage(ceoMessage);

    if (fromLlm && fromLlm.mode && PRESENCE_MODES.includes(fromLlm.mode)) {
        // Jika LLM bilang idle tapi pesan jelas minta duduk → pakai heuristik
        if (fromMsg && fromMsg.mode === 'at_desk' && fromLlm.mode === 'idle') {
            return fromMsg;
        }
        return {
            ...fromLlm,
            note: fromLlm.note || (fromMsg && fromMsg.note) || '',
            roleIds: fromLlm.roleIds || (fromMsg && fromMsg.roleIds) || null,
            updatedAt: new Date().toISOString()
        };
    }
    return fromMsg;
}

module.exports = {
    PRESENCE_MODES,
    DEFAULT_CREW_PRESENCE,
    normalizeCrewPresence,
    presenceAppliesToRole,
    applyPresenceToStatus,
    inferCrewPresenceFromMessage,
    resolveCrewPresenceUpdate
};
