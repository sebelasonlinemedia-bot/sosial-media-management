/**
 * Unit smoke office-life (adopsi kantor-ai Fase 1): periode pencahayaan per jam.
 * Usage: node scripts/test-office-life.js
 */
require('../ai-office-3d.js');
const A = globalThis.AiOffice3D;

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed += 1;
    } else {
        console.log('PASS:', msg);
    }
}

assert(!!A, 'AiOffice3D termuat');
const resolve = A.__test.resolveLightingPeriod;
assert(typeof resolve === 'function', 'resolveLightingPeriod tersedia');

const at = (h) => new Date(2026, 9, 21, h, 0, 0);
assert(resolve(at(6)) === 'pagi', '06.00 → pagi');
assert(resolve(at(9)) === 'pagi', '09.00 → pagi');
assert(resolve(at(12)) === 'siang', '12.00 → siang');
assert(resolve(at(15)) === 'siang', '15.00 → siang');
assert(resolve(at(16)) === 'sore', '16.00 → sore');
assert(resolve(at(18)) === 'sore', '18.00 → sore');
assert(resolve(at(19)) === 'malam', '19.00 → malam');
assert(resolve(at(23)) === 'malam', '23.00 → malam');
assert(resolve(at(3)) === 'malam', '03.00 → malam');

assert(typeof A.setLightingMode === 'function', 'setLightingMode tersedia');
assert(typeof A.setRoutineEnabled === 'function', 'setRoutineEnabled tersedia');

if (failed) {
    console.error(`\n${failed} assertion gagal`);
    process.exit(1);
}
console.log('\nSemua assertion lolos.');
