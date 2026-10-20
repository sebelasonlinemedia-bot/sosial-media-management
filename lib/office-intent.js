/**
 * Lapisan intent kantor TUNGGAL (Bahasa Indonesia).
 *
 * Menggabungkan:
 *  (a) heuristik frasa yang dulu hidup di crew-presence.js,
 *  (b) parser trigger skill (#1, blok ## Trigger di SKILL.md utama),
 *  (c) penyebutan nama peran (Maya/Rani/Dimas/Salsa/Titin/Bimo/Nadira + "Kak X").
 *
 * Konsumen: lib/crew-presence.js (presence + jadwal) dan lib/ceo-chat.js
 * (fallback officeAction bila LLM tidak mengisi). Modul ini murni — tanpa DB.
 */

const fs = require('fs');
const path = require('path');
const { listRoles, normalizeRoleId } = require('./ai-roles');
const { extractTriggerConfig, matchSkillTrigger, detectRoleIdsInText } = require('./skill-triggers');
const { getPlace, presenceModeForTarget } = require('./office-places');

let cachedMainTrigger = undefined; // undefined = belum dicoba dibaca

function defaultTriggerConfig() {
    if (cachedMainTrigger !== undefined) return cachedMainTrigger;
    try {
        const file = path.join(__dirname, '..', '.cursor', 'skills', 'piks-digital-lab-ai-employee', 'SKILL.md');
        cachedMainTrigger = extractTriggerConfig(fs.readFileSync(file, 'utf8'));
    } catch {
        cachedMainTrigger = null;
    }
    return cachedMainTrigger;
}

/** Untuk test: suntik / reset cache konfigurasi trigger. */
function _setTriggerConfigForTest(cfg) { cachedMainTrigger = cfg; }

/** Deteksi nama/peran yang disebut di pesan (nama, title, id, "Kak X"). */
function detectMentionedRoles(message) {
    const t = String(message || '').toLowerCase();
    const hits = [];
    for (const r of listRoles()) {
        const name = String(r.name || '').toLowerCase();
        const title = String(r.title || '').toLowerCase();
        const id = r.id;
        if (
            (name && (t.includes(name) || t.includes(`kak ${name}`))) ||
            (title && t.includes(title)) ||
            t.includes(id) ||
            t.includes(id.replace(/-/g, ' '))
        ) {
            hits.push(r.id);
        }
    }
    for (const roleId of detectRoleIdsInText(t)) {
        if (!hits.includes(roleId)) hits.push(roleId);
    }
    return hits;
}

/** Parse jam 24 jam: "jam 22:39", "pukul 09.00" → Date lokal (besok bila sudah lewat >2 mnt). */
function parseScheduleTime(message, now = new Date()) {
    const t = String(message || '');
    const m =
        t.match(/(?:jam|pukul|pk\.?|at)\s*(\d{1,2})\s*[:.·]\s*(\d{2})\b/i) ||
        t.match(/\b(\d{1,2})\s*[:.·]\s*(\d{2})\b/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
    const at = new Date(now.getTime());
    at.setSeconds(0, 0);
    at.setHours(h, min, 0, 0);
    if (at.getTime() - now.getTime() < -120000) at.setDate(at.getDate() + 1);
    return at;
}

function formatClock24(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Heuristik mode dari frasa Indonesia (perilaku lama crew-presence, dipertahankan). */
function heuristicMode(text) {
    const t = String(text || '').toLowerCase();
    const atDesk =
        /\b(duduk|meja|komputer|laptop|kerja|work\s*desk|siaga|standby|kembali ke meja|ke meja|depan komputer|monitor|work board)\b/i.test(t) ||
        /siaga.*meja|meja.*kerja|duduk.*komputer|ke meja/i.test(t);
    const meeting = /\b(rapat|meeting|kumpul|briefing|meja bundar|conference|standup)\b/i.test(t);
    const idle =
        /\b(istirahat|santai|idle|lounge|bebas|jalan[- ]?jalan|rekreasi|game|arcade|break|pulang|minum|galon|kopi|teh|air|ngopi|nongkrong)\b/i.test(t);
    if (atDesk && !idle) return 'at_desk';
    if (meeting && !idle) return 'meeting';
    if (idle) return 'idle';
    return null;
}

function buildNote(mode, roleIds, clock) {
    if (mode === 'at_desk') return clock ? `Siaga di meja jam ${clock}` : 'Siaga di meja (perintah CEO)';
    if (mode === 'meeting') return clock ? `Rapat jam ${clock}` : 'Rapat (perintah CEO)';
    return roleIds && roleIds.length
        ? `Istirahat — ${roleIds.join(', ')}${clock ? ` jam ${clock}` : ''}`
        : (clock ? `Istirahat jam ${clock}` : 'Istirahat (perintah CEO)');
}

/**
 * Satu pintu resolusi intent kantor.
 * @param {string} text
 * @param {{ now?: Date, triggerConfig?: object|null, triggerConfigs?: object[] }} [context]
 * @returns {{ mode: 'at_desk'|'idle'|'meeting'|null, roleIds: string[]|null, scheduleAt: string|null, triggerTarget: string|null, matchedPhrase: string|null, source: string, note: string } | null}
 *   null bila tidak ada niat kantor sama sekali.
 */
function resolveOfficeIntent(text, context = {}) {
    const raw = String(text || '');
    if (!raw.trim()) return null;
    const now = context.now instanceof Date ? context.now : new Date();
    const roleHits = detectMentionedRoles(raw);

    // (b) Trigger skill — frasa terpanjang menang di dalam parser.
    let trigger = null;
    const configs = [];
    if (context.triggerConfig) configs.push(context.triggerConfig);
    if (Array.isArray(context.triggerConfigs)) configs.push(...context.triggerConfigs);
    if (!configs.length) {
        const def = defaultTriggerConfig();
        if (def) configs.push(def);
    }
    for (const cfg of configs) {
        trigger = matchSkillTrigger(raw, cfg);
        if (trigger) break;
    }

    // (a) Heuristik frasa.
    const heurMode = heuristicMode(raw);

    let mode = null;
    let triggerTarget = null;
    let source = null;
    if (trigger && trigger.target) {
        triggerTarget = trigger.target;
        mode = presenceModeForTarget(triggerTarget) || heurMode;
        source = 'skill-trigger';
    }
    if (heurMode) {
        // Heuristik eksplisit (duduk/rapat/istirahat + jam) tetap dipercaya untuk mode,
        // sama seperti aturan lama yang mendahulukan heuristik atas LLM.
        if (!mode || heurMode !== mode) { mode = heurMode; source = trigger ? 'skill-trigger+heuristic' : 'heuristic'; }
    }
    if (!mode) return null;

    // (c) Peran: nama disebut → hanya mereka. Target zona punya peran baku
    // (review→Nadira, analyst-board→Bimo) hanya bila tidak ada nama disebut.
    let roleIds = roleHits.length ? roleHits : null;
    if (!roleIds && triggerTarget) {
        const place = getPlace(triggerTarget);
        if (place && place.defaultRoleId) roleIds = [place.defaultRoleId];
    }
    if (trigger && Array.isArray(trigger.roleIds) && trigger.roleIds.length && !roleIds) {
        roleIds = trigger.roleIds.map(id => normalizeRoleId(id)).filter(Boolean);
    }

    const scheduleDate = parseScheduleTime(raw, now);
    const clock = scheduleDate ? formatClock24(scheduleDate) : null;
    return {
        mode,
        roleIds,
        scheduleAt: scheduleDate ? scheduleDate.toISOString() : null,
        triggerTarget,
        matchedPhrase: trigger ? trigger.matchedPhrase : null,
        source: source || 'heuristic',
        note: buildNote(mode, roleIds, clock)
    };
}

module.exports = {
    resolveOfficeIntent,
    detectMentionedRoles,
    parseScheduleTime,
    formatClock24,
    heuristicMode,
    defaultTriggerConfig,
    _setTriggerConfigForTest
};
