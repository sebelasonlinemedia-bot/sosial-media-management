/**
 * Registry target gerakan kantor — satu-satunya pemetaan target skill/trigger
 * ke zona yang SUDAH dikenal ai-office-3d.js (desk / meeting / idle stops).
 * Target konten baru dipetakan ke zona existing; tidak ada ruangan 3D baru.
 *
 * - desk           → meja kerja peran (mode presence at_desk)
 * - meeting        → meja bundar rapat (mode presence meeting)
 * - review         → sudut review Nadira (compliance) = meja kerjanya sendiri
 *                    (mode at_desk, peran baku compliance bila tidak disebut lain)
 * - analyst-board  → papan analitik Bimo = meja kerja analyst (mode at_desk,
 *                    peran baku analyst bila tidak disebut lain)
 * - lounge         → idle stop "lounge" (bean bag) di ai-office-3d.js (mode idle)
 */

const OFFICE_PLACES = {
    desk: { target: 'desk', zone: 'desk', presenceMode: 'at_desk', idleStop: null, defaultRoleId: null, label: 'Meja kerja' },
    meeting: { target: 'meeting', zone: 'meeting', presenceMode: 'meeting', idleStop: null, defaultRoleId: null, label: 'Area rapat' },
    review: { target: 'review', zone: 'desk', presenceMode: 'at_desk', idleStop: null, defaultRoleId: 'compliance', label: 'Sudut review (meja Nadira)' },
    'analyst-board': { target: 'analyst-board', zone: 'desk', presenceMode: 'at_desk', idleStop: null, defaultRoleId: 'analyst', label: 'Papan analitik (meja Bimo)' },
    lounge: { target: 'lounge', zone: 'idle', presenceMode: 'idle', idleStop: 'lounge', defaultRoleId: null, label: 'Lounge / bean bag' }
};

function normalizePlaceTarget(target) {
    const t = String(target || '').trim().toLowerCase().replace(/_/g, '-');
    if (!t) return null;
    if (OFFICE_PLACES[t]) return t;
    const alias = { 'meja': 'desk', 'kerja': 'desk', 'rapat': 'meeting', 'istirahat': 'lounge', 'santai': 'lounge' };
    return alias[t] || null;
}

function getPlace(target) {
    const key = normalizePlaceTarget(target);
    return key ? { ...OFFICE_PLACES[key] } : null;
}

function listPlaceTargets() {
    return Object.keys(OFFICE_PLACES);
}

function presenceModeForTarget(target) {
    const place = getPlace(target);
    return place ? place.presenceMode : null;
}

module.exports = { OFFICE_PLACES, normalizePlaceTarget, getPlace, listPlaceTargets, presenceModeForTarget };
