/**
 * Test Struktur Departemen/Studio — registry 10 departemen, pemetaan peran,
 * dan 4 spesialis baru (Sales/Finance/Product/People).
 * Jalankan: npm run test:departments
 */
const assert = require('assert');
const { AI_DEPARTMENTS, getDepartmentById, buildDepartmentTree, listDepartments } = require('../lib/ai-departments');
const { AI_ROLES, listRoles, getRoleById, normalizeRoleId } = require('../lib/ai-roles');

let passed = 0;
function ok(name, fn) {
    return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); });
}

(async () => {
    console.log('test-departments');

    await ok('10 departemen sesuai daftar studio', () => {
        const ids = AI_DEPARTMENTS.map(d => d.id);
        assert.deepStrictEqual(ids, ['operations', 'marketing', 'design', 'support', 'data', 'legal', 'sales', 'finance', 'product', 'people']);
        assert.strictEqual(new Set(ids).size, 10);
        for (const d of AI_DEPARTMENTS) {
            assert.ok(d.name && d.studio && d.description, `field lengkap: ${d.id}`);
        }
        assert.strictEqual(listDepartments().length, 10);
        assert.strictEqual(getDepartmentById('sales').name, 'Sales');
        assert.strictEqual(getDepartmentById('hantu'), null);
    });

    await ok('11 peran unik, semua terpetakan ke departemen valid', () => {
        const roles = listRoles();
        assert.strictEqual(roles.length, 11);
        assert.strictEqual(new Set(roles.map(r => r.id)).size, 11);
        for (const r of roles) {
            assert.ok(getDepartmentById(r.department), `${r.id} → departemen ${r.department} valid`);
            assert.ok(r.systemBrief && r.outputs, `${r.id} punya systemBrief & outputs`);
        }
    });

    await ok('pemetaan 7 peran awal tidak berubah', () => {
        const map = Object.fromEntries(listRoles().map(r => [r.id, r.department]));
        assert.strictEqual(map.manager, 'operations');
        assert.strictEqual(map.strategist, 'marketing');
        assert.strictEqual(map.copywriter, 'marketing');
        assert.strictEqual(map['visual-producer'], 'design');
        assert.strictEqual(map['community-manager'], 'support');
        assert.strictEqual(map.analyst, 'data');
        assert.strictEqual(map.compliance, 'legal');
    });

    await ok('4 spesialis baru mengisi departemen kosong', () => {
        assert.strictEqual(getRoleById('sales').name, 'Reno');
        assert.strictEqual(getRoleById('finance').name, 'Fajar');
        assert.strictEqual(getRoleById('product').name, 'Prama');
        assert.strictEqual(getRoleById('people').name, 'Kirana');
    });

    await ok('alias peran lama tetap jalan', () => {
        assert.strictEqual(normalizeRoleId('social-media'), 'strategist');
        assert.strictEqual(getRoleById('content-writer').id, 'copywriter');
    });

    await ok('buildDepartmentTree: semua studio terisi', () => {
        const tree = buildDepartmentTree();
        assert.strictEqual(tree.length, 10);
        for (const dept of tree) {
            assert.ok(Array.isArray(dept.specialists), dept.id);
            assert.ok(dept.specialists.length >= 1, `${dept.id} punya spesialis`);
            assert.strictEqual(dept.comingSoon, false, `${dept.id} bukan coming soon lagi`);
            for (const sp of dept.specialists) {
                assert.ok(sp.id && sp.name && sp.title, `spesialis lengkap di ${dept.id}`);
            }
        }
        const marketing = tree.find(d => d.id === 'marketing');
        assert.deepStrictEqual(marketing.specialists.map(s => s.id).sort(), ['copywriter', 'strategist']);
    });

    await ok('AI_ROLES mentah konsisten dengan listRoles', () => {
        assert.strictEqual(AI_ROLES.length, listRoles().length);
    });

    console.log(`\n${passed} grup asserts lolos.`);
})().catch(err => { console.error('✗ GAGAL:', err.message); process.exit(1); });
