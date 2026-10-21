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

    await ok('zona studio 3D dari posisi meja (computeStudioZones)', () => {
        require('../ai-office-3d.js');
        const zones3d = globalThis.AiOffice3D.__test.computeStudioZones;
        assert.strictEqual(typeof zones3d, 'function');
        const desks = [
            [-9, 3.6, 0], [-9.1, 1.1, 0], [-9.2, -1.5, 0], [-8.5, -3.8, 0],
            [-5.9, -4.3, 0], [-3.1, -4.3, 0], [3.7, 2.7, 0], [-0.3, -4.3, 0],
            [2.5, -4.3, 0], [5.6, -4.3, 0], [10.9, 3.4, 0]
        ];
        const bounds = { minX: -10.7, maxX: 12.1, minZ: -5.9, maxZ: 5.1 };
        const zones = zones3d(desks, bounds);
        assert.strictEqual(zones.length, 10, 'semua studio punya zona');
        const marketing = zones.find(z => z.id === 'marketing');
        assert.strictEqual(marketing.desks, 2, 'Marketing = 2 meja (Rani+Dimas)');
        for (const z of zones) {
            assert.ok(z.w > 0 && z.d > 0, `zona ${z.id} berukuran valid`);
            assert.ok(z.cx - z.w / 2 >= bounds.minX - 0.01 && z.cx + z.w / 2 <= bounds.maxX + 0.01,
                `zona ${z.id} di dalam gedung (x)`);
            assert.ok(z.cz - z.d / 2 >= bounds.minZ - 0.01 && z.cz + z.d / 2 <= bounds.maxZ + 0.01,
                `zona ${z.id} di dalam gedung (z)`);
        }
        assert.deepStrictEqual(zones3d([], bounds), [], 'tanpa meja → tanpa zona');
        assert.strictEqual(typeof globalThis.AiOffice3D.getZoneState, 'function');

        const isLegacy = globalThis.AiOffice3D.__test.isLegacyDefaultDesks;
        const legacy = [
            [-9.0, 3.6, Math.PI / 2], [-9.1, 1.1, Math.PI / 2], [-9.2, -1.5, Math.PI / 2],
            [-8.5, -3.8, Math.PI / 4], [-5.9, -4.3, 0], [-3.1, -4.3, 0], [3.7, 2.7, -Math.PI / 2]
        ];
        assert.strictEqual(isLegacy(legacy), true, 'layout bawaan lama (7) terdeteksi untuk migrasi');
        const scattered11 = [...legacy, [-0.3, -4.3, 0], [2.5, -4.3, 0], [5.6, -4.3, 0], [10.9, 3.4, -Math.PI / 2]];
        assert.strictEqual(isLegacy(scattered11), true, 'layout 11 meja menyebar terdeteksi untuk migrasi');
        const custom = legacy.map(d => [...d]); custom[0] = [0, 0, 0];
        assert.strictEqual(isLegacy(custom), false, 'layout kustom tidak ditimpa migrasi');

        const isLegacySeg = globalThis.AiOffice3D.__test.isLegacyDefaultSegments;
        assert.strictEqual(isLegacySeg([
            { axis: 'v', at: -1.4, from: -5.9, to: -2.9 }, { axis: 'v', at: 7.2, from: -5.9, to: -1.8 },
            { axis: 'h', at: 0.3, from: 7.4, to: 12.1 }, { axis: 'v', at: 5.3, from: 1.0, to: 5.1 }
        ]), true, 'partisi bawaan lama terdeteksi');
        assert.strictEqual(isLegacySeg([{ axis: 'h', at: -2.95, from: -8.1, to: 3.3 }]), false, 'partisi baru/kustom aman');

        const defLayout = globalThis.AiOffice3D.getDefaultLayout();
        assert.strictEqual(defLayout.desks.length, 11, 'denah klaster baru: 11 meja');
        assert.strictEqual(defLayout.partitions.segments.length, 4, 'denah klaster baru: 4 pembatas kaca vertikal');
        // Migrasi: denah pod dua-baris (bawaan sebelumnya) → denah klaster
        const legacyPod = JSON.parse(JSON.stringify(defLayout));
        legacyPod.desks = [
            [-9.3, -4.35, 0], [-6.5, -4.35, 0], [-3.7, -4.35, 0],
            [-0.9, -4.35, 0], [1.9, -4.35, 0], [4.7, -4.35, 0],
            [-9.3, -1.55, 0], [-6.5, -1.55, 0], [-3.7, -1.55, 0],
            [-0.9, -1.55, 0], [1.9, -1.55, 0]
        ];
        legacyPod.partitions = { segments: [
            { axis: 'h', at: -2.95, from: -8.1, to: 3.3 },
            { axis: 'v', at: 3.3, from: -5.6, to: -3.3 },
            { axis: 'v', at: 6.05, from: -5.6, to: -3.3 }
        ] };
        const mig = globalThis.AiOffice3D.migrateLegacyLayout(legacyPod);
        assert.strictEqual(mig.migrated, true, 'migrasi pod → klaster terdeteksi');
        assert.strictEqual(mig.layout.partitions.segments.length, 4, 'hasil migrasi: 4 pembatas kaca');
        const customCfg = globalThis.AiOffice3D.migrateLegacyLayout({ desks: [[0, 0, 0]] });
        assert.strictEqual(customCfg.migrated, false, 'layout kustom tidak dimigrasi');

        // Gedung lebar 50 m (slider sumbu X editor): batas pan kamera mengikuti gedung
        const wide = globalThis.AiOffice3D.__test.buildLayout(11, {
            building: { minX: -24.3, maxX: 25.7, minZ: -5.9, maxZ: 5.1 }
        });
        assert.ok(wide.pan.minX <= -24.3 && wide.pan.maxX >= 25.7, 'pan kamera mencakup gedung 50 m');
    });

    console.log(`\n${passed} grup asserts lolos.`);
})().catch(err => { console.error('✗ GAGAL:', err.message); process.exit(1); });
