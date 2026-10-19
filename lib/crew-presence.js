/**
 * Arahan posisi karyawan di Kantor AI 3D (meja / idle / meeting).
 * Presence disimpan PER PERAN agar perintah "hanya Salsa" tidak menimpa tim lain.
 */

const { listRoles, normalizeRoleId } = require('./ai-roles');

const PRESENCE_MODES = ['idle', 'at_desk', 'meeting'];

function emptyByRole() {
    const byRole = {};
    for (const r of listRoles()) {
        byRole[r.id] = { mode: 'idle', note: '' };
    }
    return byRole;
}

const DEFAULT_CREW_PRESENCE = {
    byRole: {},
    lastAction: null,
    updatedAt: null
};

function normalizeRoleEntry(entry) {
    const e = entry && typeof entry === 'object' ? entry : {};
    let mode = String(e.mode || 'idle').toLowerCase();
    if (!PRESENCE_MODES.includes(mode)) mode = 'idle';
    return {
        mode,
        note: e.note ? String(e.note).slice(0, 160) : ''
    };
}

/**
 * Normalisasi + migrasi format lama { mode, roleIds, note }.
 */
function normalizeCrewPresence(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const byRole = emptyByRole();

    // Format baru
    if (p.byRole && typeof p.byRole === 'object') {
        for (const id of Object.keys(byRole)) {
            if (p.byRole[id]) byRole[id] = normalizeRoleEntry(p.byRole[id]);
        }
    } else if (p.mode) {
        // Format lama: satu mode global
        let mode = String(p.mode || 'idle').toLowerCase();
        if (!PRESENCE_MODES.includes(mode)) mode = 'idle';
        let roleIds = null;
        if (Array.isArray(p.roleIds) && p.roleIds.length) {
            const all = Object.keys(byRole);
            roleIds = [...new Set(
                p.roleIds.map(id => normalizeRoleId(String(id))).filter(id => all.includes(id))
            )];
            if (!roleIds.length) roleIds = null;
        }
        const note = p.note ? String(p.note).slice(0, 160) : '';
        const targets = roleIds || Object.keys(byRole);
        for (const id of targets) {
            byRole[id] = { mode, note };
        }
    }

    return {
        byRole,
        lastAction: p.lastAction && typeof p.lastAction === 'object'
            ? {
                mode: PRESENCE_MODES.includes(p.lastAction.mode) ? p.lastAction.mode : null,
                roleIds: Array.isArray(p.lastAction.roleIds) ? p.lastAction.roleIds : null,
                note: p.lastAction.note ? String(p.lastAction.note).slice(0, 160) : '',
                updatedAt: p.lastAction.updatedAt || null
            }
            : null,
        updatedAt: p.updatedAt || null,
        // ringkas untuk UI lama
        mode: p.lastAction?.mode || null,
        roleIds: p.lastAction?.roleIds || null,
        note: p.lastAction?.note || ''
    };
}

function modeForRole(presence, roleId) {
    const p = normalizeCrewPresence(presence);
    const id = normalizeRoleId(roleId);
    return p.byRole[id] || { mode: 'idle', note: '' };
}

/**
 * Status visual untuk 3D/kartu. Job aktif tetap menang.
 */
function applyPresenceToStatus(jobStatus, presence, roleId) {
    if (jobStatus && jobStatus !== 'idle' && jobStatus !== 'done') {
        return { status: jobStatus, fromPresence: false };
    }
    const entry = modeForRole(presence, roleId);
    if (entry.mode === 'at_desk') {
        return { status: 'standby', fromPresence: true, note: entry.note || 'Siaga di meja' };
    }
    if (entry.mode === 'meeting') {
        return { status: 'awaiting_approval', fromPresence: true, note: entry.note || 'Rapat tim' };
    }
    if (entry.mode === 'idle') {
        return {
            status: jobStatus === 'done' ? 'done' : 'idle',
            fromPresence: !!entry.note,
            note: entry.note || ''
        };
    }
    return { status: jobStatus === 'done' ? 'done' : 'idle', fromPresence: false };
}

/** Deteksi nama/peran yang disebut di pesan CEO. */
function detectMentionedRoles(message) {
    const t = String(message || '').toLowerCase();
    const hits = [];
    for (const r of listRoles()) {
        const name = String(r.name || '').toLowerCase();
        const title = String(r.title || '').toLowerCase();
        const id = r.id;
        if (
            (name && t.includes(name)) ||
            (title && t.includes(title)) ||
            t.includes(id) ||
            t.includes(id.replace(/-/g, ' '))
        ) {
            hits.push(r.id);
        }
    }
    // Alias singkat umum
    const aliases = {
        maya: 'manager',
        rani: 'strategist',
        dimas: 'copywriter',
        salsa: 'visual-producer',
        titin: 'community-manager',
        bimo: 'analyst',
        nadira: 'compliance'
    };
    for (const [alias, roleId] of Object.entries(aliases)) {
        if (new RegExp(`\\b${alias}\\b`, 'i').test(t) && !hits.includes(roleId)) {
            hits.push(roleId);
        }
    }
    return hits;
}

/**
 * Heuristik dari pesan CEO.
 * @returns {{ mode, roleIds, note } | null}  patch (bukan state penuh)
 */
function inferCrewPresenceFromMessage(message) {
    const t = String(message || '').toLowerCase();
    if (!t.trim()) return null;

    const roleHits = detectMentionedRoles(t);
    const onlyTarget =
        /\b(hanya|cuma|cuman|doang|sendiri|aja)\b/i.test(t) ||
        roleHits.length > 0;

    const atDesk =
        /\b(duduk|meja|komputer|laptop|kerja|work\s*desk|siaga|standby|kembali ke meja|ke meja|depan komputer|monitor|work board)\b/i.test(t) ||
        /siaga.*meja|meja.*kerja|duduk.*komputer|ke meja/i.test(t);
    const meeting = /\b(rapat|meeting|kumpul|briefing|meja bundar|conference)\b/i.test(t);
    const idle =
        /\b(istirahat|santai|idle|lounge|bebas|jalan[- ]?jalan|rekreasi|game|arcade|break|pulang|minum|galon|kopi|teh|air|ngopi|nongkrong)\b/i.test(t);

    let mode = null;
    if (atDesk && !idle) mode = 'at_desk';
    else if (meeting && !idle) mode = 'meeting';
    else if (idle) mode = 'idle';

    if (!mode) return null;

    // Nama disebut → HANYA mereka (jangan seluruh tim)
    const roleIds = onlyTarget && roleHits.length ? roleHits : (roleHits.length ? roleHits : null);

    const note =
        mode === 'at_desk'
            ? 'Siaga di meja (perintah CEO)'
            : mode === 'meeting'
              ? 'Rapat (perintah CEO)'
              : roleHits.length
                ? `Istirahat — ${roleHits.join(', ')}`
                : 'Istirahat (perintah CEO)';

    return {
        mode,
        roleIds,
        note,
        updatedAt: new Date().toISOString()
    };
}

/**
 * Terapkan patch ke state presence (merge per peran).
 * roleIds null = seluruh tim.
 */
function mergeCrewPresence(current, patch) {
    const base = normalizeCrewPresence(current);
    if (!patch || !patch.mode || !PRESENCE_MODES.includes(patch.mode)) return base;

    const allIds = Object.keys(base.byRole);
    let targets = allIds;
    if (Array.isArray(patch.roleIds) && patch.roleIds.length) {
        targets = [...new Set(
            patch.roleIds.map(id => normalizeRoleId(String(id))).filter(id => allIds.includes(id))
        )];
        if (!targets.length) targets = allIds;
    }

    const note = patch.note ? String(patch.note).slice(0, 160) : '';
    for (const id of targets) {
        base.byRole[id] = { mode: patch.mode, note };
    }

    base.lastAction = {
        mode: patch.mode,
        roleIds: Array.isArray(patch.roleIds) && patch.roleIds.length ? targets : null,
        note,
        updatedAt: new Date().toISOString()
    };
    base.updatedAt = base.lastAction.updatedAt;
    base.mode = base.lastAction.mode;
    base.roleIds = base.lastAction.roleIds;
    base.note = note;
    return base;
}

/** Gabungkan LLM + heuristik → patch, lalu merge ke state. */
function resolveCrewPresenceUpdate(ceoMessage, officeAction, currentPresence) {
    const mentioned = detectMentionedRoles(ceoMessage);
    const fromMsg = inferCrewPresenceFromMessage(ceoMessage);

    let fromLlm = null;
    if (officeAction && typeof officeAction === 'object' && officeAction.mode) {
        let mode = String(officeAction.mode).toLowerCase();
        if (mode === 'null' || mode === 'none') mode = null;
        if (mode && PRESENCE_MODES.includes(mode)) {
            let roleIds = null;
            if (officeAction.roleIds === 'all' || officeAction.all === true) {
                roleIds = null;
            } else if (Array.isArray(officeAction.roleIds) && officeAction.roleIds.length) {
                roleIds = officeAction.roleIds;
            }
            fromLlm = {
                mode,
                roleIds,
                note: officeAction.note ? String(officeAction.note) : '',
                updatedAt: new Date().toISOString()
            };
        }
    }

    let patch = fromMsg || fromLlm;
    if (!patch) return null;

    // Nama di pesan selalu menang atas "seluruh tim" dari LLM
    if (mentioned.length) {
        patch = {
            ...patch,
            roleIds: mentioned,
            note: patch.note || `Perintah untuk ${mentioned.join(', ')}`
        };
    }

    // Heuristik mode lebih dipercaya jika bentrok dengan LLM
    if (fromMsg && fromLlm && fromMsg.mode !== fromLlm.mode) {
        patch.mode = fromMsg.mode;
        patch.note = fromMsg.note || patch.note;
    }

    return mergeCrewPresence(currentPresence, patch);
}

/** Ringkas untuk pesan chat. */
function summarizePresenceAction(presence) {
    const p = normalizeCrewPresence(presence);
    const a = p.lastAction;
    if (!a || !a.mode) return null;
    const where =
        a.mode === 'at_desk' ? 'di meja komputer'
            : a.mode === 'meeting' ? 'di area rapat'
                : 'mode istirahat';
    const who = a.roleIds?.length ? a.roleIds.join(', ') : 'seluruh tim';
    return { who, where, mode: a.mode, roleIds: a.roleIds };
}

module.exports = {
    PRESENCE_MODES,
    DEFAULT_CREW_PRESENCE,
    normalizeCrewPresence,
    applyPresenceToStatus,
    inferCrewPresenceFromMessage,
    detectMentionedRoles,
    mergeCrewPresence,
    resolveCrewPresenceUpdate,
    summarizePresenceAction,
    modeForRole
};
