/**
 * Test Tugas Umum Kantor AI (Fase A–D) — unit test lib/task-executors.js.
 * Tanpa server & tanpa jaringan: fetch/LLM disuntik palsu lewat ctx.
 * Jalankan: npm run test:tasks
 */
const assert = require('assert');
const {
    TASK_TYPES,
    normalizeTaskType,
    listTaskTypes,
    missingFields,
    parseCsv,
    toCsv,
    analyzeCsv,
    stripHtml,
    executeTask
} = require('../lib/task-executors');

let passed = 0;
function ok(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; console.log(`  ✓ ${name}`); });
}

(async () => {
    console.log('test-general-tasks');

    await ok('normalizeTaskType valid & invalid', () => {
        assert.strictEqual(normalizeTaskType('EMAIL'), 'email');
        assert.strictEqual(normalizeTaskType('terbang'), null);
        assert.strictEqual(listTaskTypes().length, 7);
        assert.strictEqual(TASK_TYPES.email.outward, true);
        assert.strictEqual(TASK_TYPES.research.outward, false);
    });

    await ok('missingFields per tipe', () => {
        assert.deepStrictEqual(missingFields('email', { to: 'a@b.c', subject: 'Halo' }), ['body']);
        assert.deepStrictEqual(missingFields('research', {}), ['urls']);
        assert.deepStrictEqual(missingFields('spreadsheet', {}), ['csv atau rows']);
        assert.deepStrictEqual(missingFields('spreadsheet', { csv: 'a\n1' }), []);
        assert.deepStrictEqual(missingFields('hantu', {}), ['taskType']);
    });

    await ok('parseCsv menangani kutip & koma di dalam sel', () => {
        const rows = parseCsv('nama,catatan\n"Budi, A","dia ""ok"""\nSari, biasa');
        assert.strictEqual(rows.length, 3);
        assert.strictEqual(rows[1][0], 'Budi, A');
        assert.strictEqual(rows[1][1], 'dia "ok"');
    });

    await ok('toCsv dari objek + roundtrip', () => {
        const csv = toCsv([{ nama: 'A,1', nilai: 5 }, { nama: 'B', nilai: 7 }]);
        const back = parseCsv(csv);
        assert.strictEqual(back[0].join(','), 'nama,nilai');
        assert.strictEqual(back[1][0], 'A,1');
        assert.strictEqual(back[2][1], '7');
    });

    await ok('analyzeCsv statistik kolom numerik', () => {
        const a = analyzeCsv('produk,terjual\nA,10\nB,20\nC,30');
        assert.strictEqual(a.rowCount, 3);
        assert.deepStrictEqual(a.columns, ['produk', 'terjual']);
        assert.strictEqual(a.stats.terjual.sum, 60);
        assert.strictEqual(a.stats.terjual.avg, 20);
        assert.strictEqual(a.stats.terjual.min, 10);
        assert.strictEqual(a.stats.terjual.max, 30);
        assert.strictEqual(a.stats.produk, undefined);
    });

    await ok('stripHtml membuang script & tag', () => {
        const text = stripHtml('<style>x</style><script>jahat()</script><p>Halo <b>dunia</b></p>');
        assert.strictEqual(text, 'Halo dunia');
    });

    await ok('executeTask tipe tak dikenal', async () => {
        const r = await executeTask('terbang', {}, {});
        assert.strictEqual(r.ok, false);
    });

    await ok('executeTask input kurang → missing', async () => {
        const r = await executeTask('whatsapp', { to: '62812' }, { env: {} });
        assert.strictEqual(r.ok, false);
        assert.deepStrictEqual(r.missing, ['message']);
    });

    await ok('email tanpa kredensial → simulasi jujur', async () => {
        const r = await executeTask('email', { to: 'a@b.c', subject: 'Halo', body: 'Isi' }, { env: {} });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.simulated, true);
        assert.match(r.summary, /SIMULASI/);
    });

    await ok('whatsapp tanpa kredensial → simulasi jujur', async () => {
        const r = await executeTask('whatsapp', { to: '62812', message: 'Halo' }, { env: {} });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.simulated, true);
    });

    await ok('image tanpa API key → placeholder SVG simulasi', async () => {
        const r = await executeTask('image', { prompt: 'kucing oranye di kantor' }, { env: {} });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.simulated, true);
        assert.ok(r.data.imageUrl.startsWith('data:image/svg+xml'));
    });

    await ok('general tanpa LLM → rencana simulasi', async () => {
        const r = await executeTask('general', { instruction: 'Buat SOP kasir' }, {});
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.simulated, true);
        assert.ok(Array.isArray(r.data.plan) && r.data.plan.length >= 3);
    });

    await ok('general dengan LLM → hasil asli diteruskan', async () => {
        const r = await executeTask('general', { instruction: 'Halo' }, {
            llmText: async () => 'Hasil LLM asli'
        });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.simulated, false);
        assert.strictEqual(r.data.result, 'Hasil LLM asli');
    });

    await ok('document membuat artefak md', async () => {
        const r = await executeTask('document', { title: 'Laporan Mingguan', content: 'Isi laporan' }, {});
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.artifact.filename, 'laporan-mingguan.md');
        assert.ok(r.artifact.content.includes('Isi laporan'));
    });

    await ok('spreadsheet: analisis CSV & buat CSV', async () => {
        const a = await executeTask('spreadsheet', { csv: 'x,y\n1,2\n3,4' }, {});
        assert.strictEqual(a.ok, true);
        assert.strictEqual(a.data.rowCount, 2);
        const b = await executeTask('spreadsheet', { rows: [{ a: 1 }, { a: 2 }] }, {});
        assert.strictEqual(b.artifact.filename, 'data.csv');
        assert.ok(b.artifact.content.includes('a\n1\n2'));
    });

    await ok('research dengan fetch palsu + ringkasan LLM', async () => {
        const fakeFetch = async () => ({
            status: 200,
            text: async () => '<html><body><h1>Judul</h1><p>Isi penting.</p></body></html>'
        });
        const r = await executeTask('research',
            { urls: ['https://contoh.id/a'], query: 'uji' },
            { fetch: fakeFetch, llmText: async () => 'Ringkasan: isi penting.' });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.summary, 'Ringkasan: isi penting.');
        assert.ok(r.data.sources[0].excerpt.includes('Isi penting'));
    });

    await ok('research URL non-http ditolak per sumber', async () => {
        const r = await executeTask('research', { urls: ['file:///rahasia'] }, {});
        assert.strictEqual(r.ok, false);
        assert.match(r.data.sources[0].error, /http/);
    });

    console.log(`\n${passed} asserts grup lolos.`);
})().catch(err => {
    console.error('✗ GAGAL:', err.message);
    process.exit(1);
});
