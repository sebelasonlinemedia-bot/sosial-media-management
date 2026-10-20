/**
 * Arahan posisi karyawan di Kantor AI 3D (meja / idle / meeting).
 * Presence disimpan PER PERAN agar perintah "hanya Salsa" tidak menimpa tim lain.
 */

const { listRoles, normalizeRoleId } = require('./ai-roles');
// Lapisan intent tunggal (#2) — heuristik/deteksi peran/jam kini hidup di
// office-intent.js; modul ini mengonsumsinya dan tetap me-re-export nama lama.
const {
    resolveOfficeIntent,
    detectMentionedRoles,
    parseScheduleTime,
    formatClock24
} = require('./office-intent');

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

/**
 * Heuristik dari pesan CEO — kini delegasi ke lapisan intent tunggal
 * (lib/office-intent.js). Bentuk hasil dipertahankan untuk pemanggil lama.
 * @returns {{ mode, roleIds, note, scheduleAt?: string, triggerTarget?: string } | null}
 */
function inferCrewPresenceFromMessage(message, now = new Date()) {
    const intent = resolveOfficeIntent(message, { now });
    if (!intent || !intent.mode) return null;
    const patch = {
        mode: intent.mode,
        roleIds: intent.roleIds,
        note: intent.note,
        updatedAt: new Date().toISOString()
    };
    if (intent.scheduleAt) patch.scheduleAt = intent.scheduleAt;
    if (intent.triggerTarget) patch.triggerTarget = intent.triggerTarget;
    return patch;
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

const IMMEDIATE_SCHEDULE_MS = 15000; // ≤15 dtk → anggap sekarang

function normalizeSchedules(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(s => s && s.at && s.mode && PRESENCE_MODES.includes(s.mode))
        .map(s => ({
            id: s.id || (`sch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
            at: String(s.at),
            mode: s.mode,
            roleIds: Array.isArray(s.roleIds) && s.roleIds.length ? s.roleIds : null,
            note: s.note ? String(s.note).slice(0, 160) : '',
            createdAt: s.createdAt || null
        }))
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .slice(0, 40);
}

/**
 * Gabungkan LLM + heuristik.
 * @returns {{ presence: object|null, schedule: object|null, schedules?: object[] } | null}
 * - presence: state baru jika diterapkan sekarang
 * - schedule: item baru jika ditunda ke jam tertentu
 */
function resolveCrewPresenceUpdate(ceoMessage, officeAction, currentPresence, now = new Date()) {
    const mentioned = detectMentionedRoles(ceoMessage);
    const fromMsg = inferCrewPresenceFromMessage(ceoMessage, now);

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
            // LLM boleh kirim scheduleAt "22:39" atau ISO
            if (officeAction.scheduleAt) {
                const raw = String(officeAction.scheduleAt).trim();
                let at = null;
                if (/^\d{1,2}[:.]\d{2}$/.test(raw)) {
                    at = parseScheduleTime(`jam ${raw}`, now);
                } else {
                    const d = new Date(raw);
                    if (!Number.isNaN(d.getTime())) at = d;
                }
                if (at) fromLlm.scheduleAt = at.toISOString();
            }
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

    // Heuristik mode / jam lebih dipercaya jika bentrok dengan LLM
    if (fromMsg && fromLlm) {
        if (fromMsg.mode !== fromLlm.mode) {
            patch.mode = fromMsg.mode;
            patch.note = fromMsg.note || patch.note;
        }
        if (fromMsg.scheduleAt) patch.scheduleAt = fromMsg.scheduleAt;
    }

    // Jam di pesan CEO selalu menang (meski LLM bilang "sekarang")
    const msgTime = parseScheduleTime(ceoMessage, now);
    if (msgTime) patch.scheduleAt = msgTime.toISOString();

    const scheduleAt = patch.scheduleAt ? new Date(patch.scheduleAt) : null;
    const delay = scheduleAt ? scheduleAt.getTime() - now.getTime() : 0;

    if (scheduleAt && !Number.isNaN(scheduleAt.getTime()) && delay > IMMEDIATE_SCHEDULE_MS) {
        const item = {
            id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            at: scheduleAt.toISOString(),
            mode: patch.mode,
            roleIds: patch.roleIds || null,
            note: patch.note || '',
            createdAt: new Date().toISOString()
        };
        return { presence: null, schedule: item, immediate: false };
    }

    return {
        presence: mergeCrewPresence(currentPresence, patch),
        schedule: null,
        immediate: true
    };
}

/** Terapkan jadwal yang sudah jatuh tempo. */
function applyDueCrewPresenceSchedules(currentPresence, schedules, now = new Date()) {
    const list = normalizeSchedules(schedules);
    const due = [];
    const pending = [];
    for (const s of list) {
        if (new Date(s.at).getTime() <= now.getTime() + 500) due.push(s);
        else pending.push(s);
    }
    let presence = normalizeCrewPresence(currentPresence);
    for (const s of due) {
        presence = mergeCrewPresence(presence, {
            mode: s.mode,
            roleIds: s.roleIds,
            note: s.note || `Terjadwal ${formatClock24(s.at)}`
        });
    }
    return {
        presence,
        schedules: pending,
        applied: due,
        changed: due.length > 0
    };
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

function summarizeSchedule(schedule) {
    if (!schedule || !schedule.at) return null;
    const where =
        schedule.mode === 'at_desk' ? 'di meja komputer'
            : schedule.mode === 'meeting' ? 'di area rapat'
                : 'mode istirahat';
    const who = schedule.roleIds?.length ? schedule.roleIds.join(', ') : 'seluruh tim';
    return {
        who,
        where,
        clock: formatClock24(schedule.at),
        at: schedule.at,
        mode: schedule.mode
    };
}

module.exports = {
    PRESENCE_MODES,
    DEFAULT_CREW_PRESENCE,
    normalizeCrewPresence,
    normalizeSchedules,
    applyPresenceToStatus,
    inferCrewPresenceFromMessage,
    parseScheduleTime,
    formatClock24,
    detectMentionedRoles,
    mergeCrewPresence,
    resolveCrewPresenceUpdate,
    applyDueCrewPresenceSchedules,
    summarizePresenceAction,
    summarizeSchedule,
    modeForRole
};
