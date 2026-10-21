/**
 * PiK's Digital Lab — Kantor AI 3D viewport (vanilla Three.js CDN).
 *
 * Startup office matching the reference illustration: isometric cut-away on a
 * green lot with sidewalk & street, wood-floor work area, round meeting table,
 * lounge, game room (ping pong + arcade), kitchen corner, trees & street lamps.
 * Crew are glossy chibi robots built procedurally from shared primitives.
 *
 * Work board remains the primary UI; this stage is decorative + focus helper.
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'piks-digital-lab-office-3d';
    var IDLE_STOP_MS = 28000;
    var WALK_SPEED = 2.6;
    /* Navigasi anti-tabrakan: robot dianggap lingkaran berjari-jari ini;
       jalur dicari dengan A* di grid lantai, lalu antar-robot saling
       menghindar dengan steering pemisah setiap frame. */
    var ROBOT_RADIUS = 0.3;
    var NAV_CELL = 0.3;
    var AGENT_MIN_DIST = 0.58;

    var STATUS_AURA = {
        idle: 0x64748b,
        needs_info: 0xf59e0b,
        awaiting_approval: 0xea580c,
        working: 0x0d9488,
        standby: 0x38bdf8,
        done: 0x10b981,
        failed: 0xef4444
    };

    var STATUS_LABEL = {
        idle: 'Idle',
        needs_info: 'Reviewing',
        awaiting_approval: 'Reviewing',
        working: 'Working',
        standby: 'At desk',
        done: 'Done',
        failed: 'Failed'
    };

    /* --- Kehidupan kantor (adopsi kantor-ai, Fase 1) ---
       Pencahayaan mengikuti jam perangkat (bisa override manual) dan rutinitas
       sosial agen idle: ngobrol berpasangan, telepon, minum kopi, peregangan.
       Maksimal 4 agen meninggalkan meja sekaligus; agen sibuk tidak ikut rutinitas. */
    var LIGHTING_STORAGE_KEY = 'piks-office-lighting-mode';
    var ROUTINE_STORAGE_KEY = 'piks-office-routine';
    var MAX_ROUTINE_AWAY = 4;
    var LIGHTING_PALETTES = {
        pagi: { bg: 0xa8d4ec, clear: 0xb8d4e8, ambient: [0xffffff, 0.72], key: [0xfff5e8, 1.05], fill: [0xa8c8e0, 0.4], hemi: [0xd8ecff, 0x8fbc8f, 0.35] },
        siang: { bg: 0x9ccdf2, clear: 0xa9d6f2, ambient: [0xffffff, 0.84], key: [0xffffff, 1.28], fill: [0xbdd8ee, 0.48], hemi: [0xe2f2ff, 0x9cc48f, 0.42] },
        sore: { bg: 0xf4c795, clear: 0xf0c090, ambient: [0xffe3c2, 0.6], key: [0xffa95e, 0.98], fill: [0xe8a37c, 0.32], hemi: [0xffd9ae, 0xb98a5a, 0.28] },
        malam: { bg: 0x22344d, clear: 0x1d2c42, ambient: [0xbdd2ff, 0.46], key: [0x8fb4ff, 0.55], fill: [0x46586e, 0.28], hemi: [0x8fb0e8, 0x2c3a2a, 0.2] }
    };

    function resolveLightingPeriod(date) {
        var h = (date instanceof Date ? date : new Date(date || Date.now())).getHours();
        if (h >= 6 && h < 12) return 'pagi';
        if (h >= 12 && h < 16) return 'siang';
        if (h >= 16 && h < 19) return 'sore';
        return 'malam';
    }

    function loadLightingMode() {
        try {
            var raw = localStorage.getItem(LIGHTING_STORAGE_KEY);
            if (raw && (raw === 'auto' || LIGHTING_PALETTES[raw])) return raw;
        } catch (_) { /* ignore */ }
        return 'auto';
    }

    function loadRoutinePreference() {
        try {
            var raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
            if (raw === '0') return false;
            if (raw === '1') return true;
        } catch (_) { /* ignore */ }
        if (typeof matchMedia === 'function' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return false;
        }
        return true;
    }

    /* Startup office — match illustration (y-up, +z toward front). */
    var PARTITION_X = 0.7;
    var AISLE_Z = -0.1;
    var WALL_H = 2.55;
    /* Dinding belakang selalu tinggi penuh — slider layout hanya
       berlaku untuk dinding kiri & kanan (dan partisi interior). */
    var BACK_WALL_H = 2.55;
    var WALL = 0x2b3648;
    var WALL_TOP = 0x14b8a6;
    var TEAL = 0x2dd4bf;
    var YELLOW = 0xfbbf24;
    var ORANGE = 0xfb923c;

    /* Layout default hasil rekonstruksi screenshot Layout Kantor
       (22.8 x 11.0 m, pusat gedung dipertahankan di (0.7,-0.4)):
       AREA KERJA kiri (meja menyebar, beberapa terputar), MEETING
       tengah-atas, lounge sofa-U tengah-kiri, GAME kanan-atas,
       DAPUR/kopi kanan-bawah.
       Dideklarasikan SEBELUM buildLayout pertama agar tidak undefined. */
    var DEFAULT_BUILDING = { minX: -15.7, maxX: 17.1, minZ: -6.5, maxZ: 5.5 };
    var DEFAULT_MEETING = { x: 0.7, z: -4.2, radius: 1.05, enabled: true };
    /* Meja meeting MEMANJANG (elips sumbu-X): radius = skala lebar;
       setengah-panjang a = radius*1.6 (±3.2x lebar), setengah-lebar b. */
    var MEETING_LONG = 'elongated-meeting-v1';

    /* Studio per departemen — urutan mengikuti registry peran
       (lib/ai-roles.js: field `department`; lib/ai-departments.js).
       Meja ke-i ditempati peran ke-i, jadi zona diturunkan dari posisi meja.
       Dideklarasikan sebelum buildLayout pertama (dipakai di dalamnya). */
    var ROLE_STUDIO = [
        { roleId: 'manager', studio: 'Operations', color: 0xe11d48 },
        { roleId: 'strategist', studio: 'Marketing', color: 0x0d9488 },
        { roleId: 'copywriter', studio: 'Marketing', color: 0x0d9488 },
        { roleId: 'visual-producer', studio: 'Design', color: 0x7c3aed },
        { roleId: 'community-manager', studio: 'Support', color: 0x059669 },
        { roleId: 'analyst', studio: 'Data', color: 0xd97706 },
        { roleId: 'compliance', studio: 'Legal', color: 0x64748b },
        { roleId: 'sales', studio: 'Sales', color: 0x0284c7 },
        { roleId: 'finance', studio: 'Finance', color: 0x65a30d },
        { roleId: 'product', studio: 'Product', color: 0xdb2777 },
        { roleId: 'people', studio: 'People', color: 0x9333ea }
    ];

    function meetingDims(table) {
        var r = (table && Number(table.radius)) || 1.05;
        return { r: r, a: r * 1.6, b: r * 0.62 };
    }

    var LAYOUT = buildLayout(7, null);
    var CUSTOM_LAYOUT = null;

    /** Mebel bawaan scene (denah 4 studio ala referensi gambar 2: lobi
       sofa-U di depan-tengah, dapur + bar kopi di barat-bawah, area
       olahraga pingpong di kedua sudut bawah, rak server + TV di dinding
       belakang tengah di atas meja meeting). */
    function defaultFurniture() {
        return [
            /* Lobi: sofa-U di depan-tengah menghadap meja kopi. */
            { id: 'sofa-1', type: 'sofa', x: 0.7, z: 4.6, rotY: 0 },
            { id: 'sofa-2', type: 'sofa', x: -0.6, z: 3.5, rotY: Math.PI / 2 },
            { id: 'sofa-3', type: 'sofa', x: 2.0, z: 3.5, rotY: Math.PI / 2 },
            { id: 'coffee-table', type: 'coffeetable', x: 0.7, z: 3.5, rotY: Math.PI / 2 },
            /* TV + rak server di dinding belakang tengah (area meeting). */
            { id: 'tv-1', type: 'tv', x: 0.7, z: -6.32, rotY: 0 },
            { id: 'bookshelf-1', type: 'bookshelf', x: -0.9, z: -6.32, rotY: 0 },
            { id: 'bookshelf-2', type: 'bookshelf', x: 2.3, z: -6.32, rotY: 0 },
            { id: 'arcade-1', type: 'arcade', x: 16.75, z: -6.15, rotY: 0 },
            /* Area olahraga: pingpong di kedua sudut bawah + beanbag. */
            { id: 'pingpong', type: 'pingpong', x: 13.5, z: 3.8, rotY: 0 },
            { id: 'pingpong-2', type: 'pingpong', x: -12.3, z: 2.4, rotY: 0 },
            { id: 'beanbag-1', type: 'beanbag', x: 11.3, z: 2.7, rotY: 0 },
            { id: 'beanbag-2', type: 'beanbag', x: 15.6, z: 2.9, rotY: 0 },
            /* Dapur + bar kopi di barat-bawah. */
            { id: 'coffeebar', type: 'coffeebar', x: -13.2, z: 4.95, rotY: 0 },
            { id: 'stool-1', type: 'stool', x: -13.9, z: 4.25, rotY: 0 },
            { id: 'stool-2', type: 'stool', x: -12.5, z: 4.25, rotY: 0 },
            { id: 'pantry', type: 'pantry', x: -15.4, z: 1.8, rotY: -Math.PI / 2 },
            { id: 'fridge', type: 'fridge', x: -15.35, z: 3.1, rotY: -Math.PI / 2 },
            { id: 'galon', type: 'galon', x: -14.9, z: 2.4, rotY: 0 },
            { id: 'plant-1', type: 'plant', x: -15.4, z: -6.3, rotY: 0 },
            { id: 'plant-2', type: 'plant', x: -15.4, z: 5.2, rotY: 0 },
            { id: 'plant-3', type: 'plant', x: 16.8, z: 5.2, rotY: 0 },
            { id: 'tree-1', type: 'tree', x: -12.0, z: -9.8, rotY: 0 },
            { id: 'tree-2', type: 'tree', x: -5.0, z: -9.6, rotY: 0 },
            { id: 'tree-3', type: 'tree', x: 2.0, z: -9.6, rotY: 0 },
            { id: 'tree-4', type: 'tree', x: 9.0, z: -9.6, rotY: 0 },
            { id: 'tree-5', type: 'tree', x: -19.5, z: -0.5, rotY: 0 },
            { id: 'tree-6', type: 'tree', x: 20.8, z: -0.5, rotY: 0 },
            { id: 'lamp-1', type: 'lamp', x: -18.5, z: 7.0, rotY: 0 },
            { id: 'lamp-2', type: 'lamp', x: 20.0, z: 6.8, rotY: 0 },
            { id: 'lamp-3', type: 'lamp', x: 18.0, z: -8.5, rotY: 0 }
        ];
    }

    function defaultLayoutData() {
        return {
            wallHeight: 2.55,
            building: { minX: DEFAULT_BUILDING.minX, maxX: DEFAULT_BUILDING.maxX, minZ: DEFAULT_BUILDING.minZ, maxZ: DEFAULT_BUILDING.maxZ },
            /* Denah 4 studio persis referensi: tiap studio 7 meja — 1 meja
               lead/manager MENEMPEL dinding belakang + 3 meja agen MENEMPEL
               dinding/partisi kaca kiri (agen menghadap dinding, kursi di
               sisi ruang) + 3 meja agen MENEMPEL dinding/partisi kanan.
               Tepi meja rapat ke dinding (pusat = dinding ± 0,36 m).
               Meeting bundar di tengah, lobi di depan-tengah, dapur
               barat-bawah, olahraga di sudut bawah.
               Studio 1 Marketing · Studio 2 Sales · Studio 3 Operational ·
               Studio 4 Support. Indeks meja 0..10 ditempati peran
               (ROLE_STUDIO); meja 11..27 workstation kosong siap pakai. */
            desks: [
                /* 0 Maya — lead Studio 1 */ [-12.45, -6.1, 0],
                /* 1 Rani — lead Studio 2 */ [-5.95, -6.1, 0],
                /* 2 Dimas — S2 kiri */ [-8.84, -4.6, -Math.PI / 2],
                /* 3 Salsa — S2 kanan */ [-3.06, -4.6, Math.PI / 2],
                /* 4 Titin — lead Studio 3 */ [7.35, -6.1, 0],
                /* 5 Bimo — S1 kiri */ [-15.34, -3.1, -Math.PI / 2],
                /* 6 Nadira — S3 kiri */ [4.46, -4.6, -Math.PI / 2],
                /* 7 Reno — S3 kanan */ [10.24, -4.6, Math.PI / 2],
                /* 8 Fajar — lead Studio 4 */ [13.85, -6.1, 0],
                /* 9 Prama — S4 kiri */ [10.96, -4.6, -Math.PI / 2],
                /* 10 Kirana — S4 kanan */ [16.74, -4.6, Math.PI / 2],
                /* Workstation kosong Studio 1 */
                [-15.34, -4.6, -Math.PI / 2], [-15.34, -1.6, -Math.PI / 2],
                [-9.56, -4.6, Math.PI / 2], [-9.56, -3.1, Math.PI / 2], [-9.56, -1.6, Math.PI / 2],
                /* Workstation kosong Studio 2 */
                [-8.84, -3.1, -Math.PI / 2], [-8.84, -1.6, -Math.PI / 2],
                [-3.06, -3.1, Math.PI / 2], [-3.06, -1.6, Math.PI / 2],
                /* Workstation kosong Studio 3 */
                [4.46, -3.1, -Math.PI / 2], [4.46, -1.6, -Math.PI / 2],
                [10.24, -3.1, Math.PI / 2], [10.24, -1.6, Math.PI / 2],
                /* Workstation kosong Studio 4 */
                [10.96, -3.1, -Math.PI / 2], [10.96, -1.6, -Math.PI / 2],
                [16.74, -3.1, Math.PI / 2], [16.74, -1.6, Math.PI / 2]
            ],
            furniture: defaultFurniture(),
            partitions: {
                /* Dinding kaca tiap studio: pembatas vertikal antar-studio +
                   kaca depan dengan celah pintu 1,6 m di tengah tiap studio.
                   Tengah gedung (x -2.7..4.1) terbuka untuk meeting. */
                segments: [
                    { axis: 'v', at: -9.2, from: -6.3, to: -0.9 },
                    { axis: 'v', at: -2.7, from: -6.3, to: -0.9 },
                    { axis: 'v', at: 4.1, from: -6.3, to: -0.9 },
                    { axis: 'v', at: 10.6, from: -6.3, to: -0.9 },
                    { axis: 'h', at: -0.9, from: -15.5, to: -13.25 },
                    { axis: 'h', at: -0.9, from: -11.65, to: -9.4 },
                    { axis: 'h', at: -0.9, from: -9.0, to: -6.75 },
                    { axis: 'h', at: -0.9, from: -5.15, to: -2.9 },
                    { axis: 'h', at: -0.9, from: 4.3, to: 6.55 },
                    { axis: 'h', at: -0.9, from: 8.15, to: 10.4 },
                    { axis: 'h', at: -0.9, from: 10.8, to: 13.05 },
                    { axis: 'h', at: -0.9, from: 14.65, to: 16.9 }
                ]
            },
            meetingTable: { x: DEFAULT_MEETING.x, z: DEFAULT_MEETING.z, radius: DEFAULT_MEETING.radius, enabled: true }
        };
    }

    /** Spot DUDUK mengelilingi meja meeting memanjang — sejumlah agen.
     *  Posisi spot persis = posisi kursi yang digambar (addElongatedMeetingTable). */
    function meetingSpotsAround(table, agentCount) {
        var dims = meetingDims(table);
        var n = Math.max(1, Math.min(12, Math.round(agentCount) || 7));
        var spots = [];
        var i;
        for (i = 0; i < n; i += 1) {
            var th = -Math.PI / 2 + (i * Math.PI * 2) / n;
            var ox = (dims.a + 0.52) * Math.cos(th);
            var oz = (dims.b + 0.52) * Math.sin(th);
            spots.push({
                x: Math.round((table.x + ox) * 100) / 100,
                z: Math.round((table.z + oz) * 100) / 100,
                facing: Math.round(Math.atan2(-ox, -oz) * 1000) / 1000,
                seated: true, seatY: 0.3
            });
        }
        return spots;
    }

    /* --- Geometri lokal→dunia (rotasi Y Three.js: x'=lx·cos+lz·sin, z'=-lx·sin+lz·cos) --- */
    function rotLocal(rot, lx, lz) {
        var c = Math.cos(rot || 0);
        var s = Math.sin(rot || 0);
        return { x: lx * c + lz * s, z: -lx * s + lz * c };
    }
    function round2(n) { return Math.round(n * 100) / 100; }

    /** Info meja agen dari format [x,z] lama, [x,z,rotY] baru, atau {x,z,rotY|rot}. */
    function deskInfo(d) {
        if (Array.isArray(d)) return { x: Number(d[0]) || 0, z: Number(d[1]) || 0, rot: Number(d[2]) || 0 };
        d = d || {};
        return { x: Number(d.x) || 0, z: Number(d.z) || 0, rot: Number(d.rotY != null ? d.rotY : d.rot) || 0 };
    }
    /** Spot duduk meja agen: offset kursi lokal (0,-0.78) DIROTASIKAN rotY meja;
     *  robot menghadap meja (arah lokal +z yang terotasi). */
    function deskSeatSpot(d) {
        var info = deskInfo(d);
        var off = rotLocal(info.rot, 0, -0.78);
        return {
            x: round2(info.x + off.x), z: round2(info.z + off.z),
            facing: Math.round(info.rot * 1000) / 1000, seated: true, seatY: 0.3
        };
    }

    /** Zona studio dari daftar meja: kelompokkan meja per studio peran,
     *  pad = bounding box meja anggotanya + margin, dibatasi gedung. */
    function computeStudioZones(desks, bounds) {
        var groups = {};
        var order = [];
        (desks || []).forEach(function (d, i) {
            var meta = ROLE_STUDIO[i];
            if (!meta) return;
            var info = deskInfo(d);
            if (!groups[meta.studio]) {
                groups[meta.studio] = {
                    id: meta.studio.toLowerCase(), studio: meta.studio, color: meta.color,
                    minX: info.x, maxX: info.x, minZ: info.z, maxZ: info.z, desks: 0
                };
                order.push(meta.studio);
            }
            var g = groups[meta.studio];
            g.minX = Math.min(g.minX, info.x); g.maxX = Math.max(g.maxX, info.x);
            g.minZ = Math.min(g.minZ, info.z); g.maxZ = Math.max(g.maxZ, info.z);
            g.desks += 1;
        });
        return order.map(function (name) {
            var g = groups[name];
            var minX = g.minX - 1.55, maxX = g.maxX + 1.55;
            var minZ = g.minZ - 1.35, maxZ = g.maxZ + 1.35;
            if (bounds) {
                minX = Math.max(bounds.minX + 0.15, minX); maxX = Math.min(bounds.maxX - 0.15, maxX);
                minZ = Math.max(bounds.minZ + 0.15, minZ); maxZ = Math.min(bounds.maxZ - 0.15, maxZ);
            }
            return {
                id: g.id, studio: g.studio, color: g.color, desks: g.desks,
                cx: round2((minX + maxX) / 2), cz: round2((minZ + maxZ) / 2),
                w: round2(maxX - minX), d: round2(maxZ - minZ)
            };
        });
    }

    /** Spot dari titik lokal furnitur + arah hadap lokal furnitur itu sendiri. */
    function localSpot(item, lx, lz, faceDx, faceDz, seated, seatY) {
        var rot = Number(item.rotY) || 0;
        var off = rotLocal(rot, lx, lz);
        var f = rotLocal(rot, faceDx, faceDz);
        return {
            x: round2((Number(item.x) || 0) + off.x), z: round2((Number(item.z) || 0) + off.z),
            facing: Math.round(Math.atan2(f.x, f.z) * 1000) / 1000,
            seated: !!seated, seatY: seatY || 0
        };
    }

    /** Spot idle DITURUNKAN DARI DATA FURNITUR layout aktif — robot duduk persis
     *  di bantalan/dudukan furnitur (bukan koordinat tebak). Zona tanpa furnitur
     *  di layout custom dilewati dengan aman (stop tidak dibuat). */
    function deriveIdleStops(furniture) {
        var byType = {};
        (furniture || []).forEach(function (f) {
            if (!f || !f.type) return;
            (byType[f.type] = byType[f.type] || []).push(f);
        });
        function items(type) { return byType[type] || []; }
        var lounge = [];
        items('beanbag').forEach(function (f) { lounge.push(localSpot(f, 0, 0, 0, 1, true, 0.22)); });
        /* Bantalan sofa: dua titik per sofa di lokal (±0.5, 0.05) — lihat addSofa. */
        var sofaSpots = [];
        items('sofa').forEach(function (f) {
            sofaSpots.push(localSpot(f, -0.5, 0.05, 0, 1, true, 0.28));
            sofaSpots.push(localSpot(f, 0.5, 0.05, 0, 1, true, 0.28));
        });
        /* Stop sofa-TV: hanya bila ada sofa DAN tv di layout aktif. Titik duduk
           tetap persis di bantalan sofa, tetapi arah hadap dihitung menuju TV
           terdekat agar robot menonton TV. Bantalan sofa lalu TIDAK diulang di
           stop lounge (robot lain menyebar ke bean bag/dll, tak menumpuk). */
        var tvSpots = [];
        var tvs = items('tv');
        if (tvs.length && sofaSpots.length) {
            tvSpots = sofaSpots.map(function (spot) {
                var tv = null;
                var best = Infinity;
                tvs.forEach(function (t) {
                    var dd = Math.hypot(t.x - spot.x, t.z - spot.z);
                    if (dd < best) { best = dd; tv = t; }
                });
                return {
                    x: spot.x, z: spot.z,
                    facing: Math.round(Math.atan2(tv.x - spot.x, tv.z - spot.z) * 1000) / 1000,
                    seated: true, seatY: spot.seatY
                };
            });
        } else {
            sofaSpots.forEach(function (s) { lounge.push(s); });
        }
        items('armchair').forEach(function (f) { lounge.push(localSpot(f, 0, 0, 0, 1, true, 0.3)); });
        items('chair').forEach(function (f) { lounge.push(localSpot(f, 0, 0, 0, 1, true, 0.3)); });

        var bars = items('coffeebar');
        var coffee = [];
        items('stool').forEach(function (f) {
            /* Duduk tepat di atas stool, menghadap tegak-lurus counter terdekat. */
            var spot = localSpot(f, 0, 0, 0, 1, true, 0.55);
            var bar = null;
            var best = Infinity;
            bars.forEach(function (b) {
                var dd = Math.hypot(b.x - f.x, b.z - f.z);
                if (dd < best) { best = dd; bar = b; }
            });
            if (bar && best < 3) {
                var inBar = rotLocal(-(Number(bar.rotY) || 0), f.x - bar.x, f.z - bar.z);
                var face = rotLocal(Number(bar.rotY) || 0, 0, inBar.z < 0 ? 1 : -1);
                spot.facing = Math.round(Math.atan2(face.x, face.z) * 1000) / 1000;
            }
            coffee.push(spot);
        });
        bars.forEach(function (bar) {
            /* Berdiri di depan counter: sisi stool terdekat (fallback sisi lokal -z),
               bergeser 0.75 m menyamping agar tidak menabrak stool. */
            var front = null;
            var best = Infinity;
            items('stool').forEach(function (s) {
                var dd = Math.hypot(s.x - bar.x, s.z - bar.z);
                if (dd < best) { best = dd; front = { x: s.x - bar.x, z: s.z - bar.z }; }
            });
            if (front && best > 0.01) { var fl = Math.hypot(front.x, front.z); front = { x: front.x / fl, z: front.z / fl }; }
            else front = rotLocal(Number(bar.rotY) || 0, 0, -1);
            var lat = { x: -front.z, z: front.x };
            coffee.push({
                x: round2(bar.x + front.x * 0.78 + lat.x * 0.75),
                z: round2(bar.z + front.z * 0.78 + lat.z * 0.75),
                facing: Math.round(Math.atan2(-front.x, -front.z) * 1000) / 1000,
                seated: false, seatY: 0
            });
        });

        var game = [];
        items('pingpong').forEach(function (f) {
            /* Berdiri di luar kedua ujung meja (setengah panjang 1.37 + 0.5). */
            game.push(localSpot(f, -1.87, 0, 1, 0, false, 0));
            game.push(localSpot(f, 1.87, 0, -1, 0, false, 0));
        });
        items('arcade').forEach(function (f) { game.push(localSpot(f, 0, 0.85, 0, -1, false, 0)); });

        var kitchen = [];
        items('pantry').forEach(function (f) {
            /* Berdiri di depan counter dapur (sisi lokal +z, 0.3+0.48 dari pusat). */
            kitchen.push(localSpot(f, -0.55, 0.78, 0, -1, false, 0));
            kitchen.push(localSpot(f, 0.55, 0.78, 0, -1, false, 0));
        });
        items('fridge').forEach(function (f) { kitchen.push(localSpot(f, 0, 0.88, 0, -1, false, 0)); });

        var stops = [];
        if (tvSpots.length) stops.push({ key: 'tv', label: 'Watching TV', spots: tvSpots });
        if (lounge.length) stops.push({ key: 'lounge', label: 'Relaxing in the lounge', spots: lounge });
        if (coffee.length) stops.push({ key: 'coffee', label: 'At the coffee bar', spots: coffee });
        if (game.length) stops.push({ key: 'game', label: 'Playing ping pong', spots: game });
        if (kitchen.length) stops.push({ key: 'kitchen', label: 'In the kitchen', spots: kitchen });
        stops.push({
            key: 'chat', label: 'Chatting in the aisle',
            spots: [
                { x: -0.1, z: -0.1, facing: Math.PI / 2, seated: false },
                { x: 1.5, z: -0.1, facing: -Math.PI / 2, seated: false }
            ]
        });
        stops.push({
            key: 'jalan', label: 'Walking the aisle',
            spots: [
                { x: -1.4, z: AISLE_Z, facing: 0, seated: false },
                { x: 2.6, z: AISLE_Z, facing: Math.PI, seated: false },
                /* (5.2, 0.3): di celah utara ujung partisi x=5.3 (mulai z=1.0)
                   denah bawaan — titik lama (5.2, 1.0) menempel ujung partisi. */
                { x: 5.2, z: 0.3, facing: 0, seated: false }
            ]
        });
        return stops;
    }

    /* Bawaan meja generasi lama: (a) 7 meja sebelum spesialis baru,
       (b) 11 meja menyebar sebelum denah pod, (c) 11 meja pod dua-baris
       sebelum denah klaster studio. Layout yang masih persis salah satu
       bawaan ini (belum dikustom user) dimigrasikan. */
    var LEGACY_DESK_SETS = [
        [
            [-9.0, 3.6, Math.PI / 2], [-9.1, 1.1, Math.PI / 2], [-9.2, -1.5, Math.PI / 2],
            [-8.5, -3.8, Math.PI / 4], [-5.9, -4.3, 0], [-3.1, -4.3, 0],
            [3.7, 2.7, -Math.PI / 2]
        ],
        [
            [-9.0, 3.6, Math.PI / 2], [-9.1, 1.1, Math.PI / 2], [-9.2, -1.5, Math.PI / 2],
            [-8.5, -3.8, Math.PI / 4], [-5.9, -4.3, 0], [-3.1, -4.3, 0],
            [3.7, 2.7, -Math.PI / 2], [-0.3, -4.3, 0], [2.5, -4.3, 0],
            [5.6, -4.3, 0], [10.9, 3.4, -Math.PI / 2]
        ],
        [
            [-9.3, -4.35, 0], [-6.5, -4.35, 0], [-3.7, -4.35, 0],
            [-0.9, -4.35, 0], [1.9, -4.35, 0], [4.7, -4.35, 0],
            [-9.3, -1.55, 0], [-6.5, -1.55, 0], [-3.7, -1.55, 0],
            [-0.9, -1.55, 0], [1.9, -1.55, 0]
        ],
        [
            [-9.6, -4.4, 0], [-5.2, -4.4, 0], [-2.6, -4.4, 0],
            [-3.9, -1.2, Math.PI], [3.2, -4.4, 0], [-7.0, -4.4, 0],
            [5.8, -4.4, 0], [4.5, -1.2, Math.PI], [7.6, -4.4, 0],
            [10.2, -4.4, 0], [8.9, -1.2, Math.PI]
        ],
        [
            [-12.45, -5.5, 0], [-5.95, -5.5, 0], [-8.4, -4.6, Math.PI / 2],
            [-3.5, -4.6, -Math.PI / 2], [7.35, -5.5, 0], [-14.9, -3.1, Math.PI / 2],
            [4.9, -4.6, Math.PI / 2], [9.8, -4.6, -Math.PI / 2], [13.85, -5.5, 0],
            [11.4, -4.6, Math.PI / 2], [16.3, -4.6, -Math.PI / 2],
            [-14.9, -4.6, Math.PI / 2], [-14.9, -1.6, Math.PI / 2],
            [-10.0, -4.6, -Math.PI / 2], [-10.0, -3.1, -Math.PI / 2], [-10.0, -1.6, -Math.PI / 2],
            [-8.4, -3.1, Math.PI / 2], [-8.4, -1.6, Math.PI / 2],
            [-3.5, -3.1, -Math.PI / 2], [-3.5, -1.6, -Math.PI / 2],
            [4.9, -3.1, Math.PI / 2], [4.9, -1.6, Math.PI / 2],
            [9.8, -3.1, -Math.PI / 2], [9.8, -1.6, -Math.PI / 2],
            [11.4, -3.1, Math.PI / 2], [11.4, -1.6, Math.PI / 2],
            [16.3, -3.1, -Math.PI / 2], [16.3, -1.6, -Math.PI / 2]
        ]
    ];
    function isLegacyDefaultDesks(desks) {
        if (!Array.isArray(desks)) return false;
        return LEGACY_DESK_SETS.some(function (set) {
            if (desks.length !== set.length) return false;
            return desks.every(function (d, i) {
                var a = deskInfo(d);
                var b = set[i];
                return Math.abs(a.x - b[0]) < 0.02 && Math.abs(a.z - b[1]) < 0.02 && Math.abs(a.rot - b[2]) < 0.02;
            });
        });
    }
    /* Set partisi bawaan generasi sebelumnya: (a) sebelum kaca studio,
       (b) denah pod dua-baris. */
    var LEGACY_SEGMENT_SETS = [
        [
            { axis: 'v', at: -1.4, from: -5.9, to: -2.9 },
            { axis: 'v', at: 7.2, from: -5.9, to: -1.8 },
            { axis: 'h', at: 0.3, from: 7.4, to: 12.1 },
            { axis: 'v', at: 5.3, from: 1.0, to: 5.1 }
        ],
        [
            { axis: 'h', at: -2.95, from: -8.1, to: 3.3 },
            { axis: 'v', at: 3.3, from: -5.6, to: -3.3 },
            { axis: 'v', at: 6.05, from: -5.6, to: -3.3 }
        ],
        [
            { axis: 'v', at: -6.1, from: -5.7, to: -0.35 },
            { axis: 'v', at: -1.7, from: -5.7, to: -0.35 },
            { axis: 'v', at: 2.3, from: -5.7, to: -0.35 },
            { axis: 'v', at: 6.7, from: -5.7, to: -0.35 }
        ],
        [
            { axis: 'v', at: -9.2, from: -6.3, to: -0.9 },
            { axis: 'v', at: -2.7, from: -6.3, to: -0.9 },
            { axis: 'v', at: 4.1, from: -6.3, to: -0.9 },
            { axis: 'v', at: 10.6, from: -6.3, to: -0.9 },
            { axis: 'h', at: -0.9, from: -15.5, to: -13.25 },
            { axis: 'h', at: -0.9, from: -11.65, to: -9.4 },
            { axis: 'h', at: -0.9, from: -9.0, to: -6.75 },
            { axis: 'h', at: -0.9, from: -5.15, to: -2.9 },
            { axis: 'h', at: -0.9, from: 4.3, to: 6.55 },
            { axis: 'h', at: -0.9, from: 8.15, to: 10.4 },
            { axis: 'h', at: -0.9, from: 10.8, to: 13.05 },
            { axis: 'h', at: -0.9, from: 14.65, to: 16.9 }
        ]
    ];
    function isLegacyDefaultSegments(segs) {
        if (!Array.isArray(segs)) return false;
        return LEGACY_SEGMENT_SETS.some(function (set) {
            if (segs.length !== set.length) return false;
            return segs.every(function (s, i) {
                var b = set[i];
                return s.axis === b.axis && Math.abs(s.at - b.at) < 0.02 &&
                    Math.abs(s.from - b.from) < 0.02 && Math.abs(s.to - b.to) < 0.02;
            });
        });
    }
    /* Tanda tangan furniture bawaan generasi sebelumnya [id, type, x, z]:
       (a) sebelum denah pod, (b) denah pod dua-baris. */
    var LEGACY_FURNITURE_SIGS = [
        [
            ['sofa-1', 'sofa', -3.1, -0.2], ['sofa-2', 'sofa', -5.0, 1.9], ['sofa-3', 'sofa', -1.2, 1.9],
            ['coffee-table', 'coffeetable', -3.1, 1.9], ['tv-1', 'tv', 3.0, -5.7],
            ['bookshelf-1', 'bookshelf', 0.5, -5.7], ['bookshelf-2', 'bookshelf', 5.5, -5.7],
            ['arcade-1', 'arcade', 7.9, -5.6], ['pingpong', 'pingpong', 10.0, -3.3],
            ['beanbag-1', 'beanbag', 9.0, -0.7], ['beanbag-2', 'beanbag', 11.1, -0.7],
            ['coffeebar', 'coffeebar', 8.1, 4.6], ['stool-1', 'stool', 7.4, 3.9], ['stool-2', 'stool', 8.8, 3.9],
            ['pantry', 'pantry', 11.9, 3.0], ['fridge', 'fridge', 11.0, 4.4], ['galon', 'galon', 10.6, 2.7],
            ['plant-1', 'plant', -10.4, -5.8], ['plant-2', 'plant', -10.5, 4.8], ['plant-3', 'plant', 11.8, -5.7],
            ['tree-1', 'tree', -8.2, -9.5], ['tree-2', 'tree', -2.9, -9.3], ['tree-3', 'tree', 3.0, -9.2],
            ['tree-4', 'tree', 8.2, -9.2], ['tree-5', 'tree', -14.0, -0.6], ['tree-6', 'tree', 15.2, -0.6],
            ['lamp-1', 'lamp', -13.5, 6.7], ['lamp-2', 'lamp', 14.7, 6.5], ['lamp-3', 'lamp', 13.2, -7.1]
        ],
        [
            ['sofa-1', 'sofa', 5.6, 1.2], ['sofa-2', 'sofa', 3.9, 2.9], ['sofa-3', 'sofa', 7.3, 2.9],
            ['coffee-table', 'coffeetable', 5.6, 2.9], ['tv-1', 'tv', 3.4, -5.7],
            ['bookshelf-1', 'bookshelf', -9.9, -5.7], ['bookshelf-2', 'bookshelf', 6.4, -5.7],
            ['arcade-1', 'arcade', 7.9, -5.6], ['pingpong', 'pingpong', 10.0, -3.3],
            ['beanbag-1', 'beanbag', 9.0, -0.7], ['beanbag-2', 'beanbag', 11.1, -0.7],
            ['coffeebar', 'coffeebar', 8.1, 4.6], ['stool-1', 'stool', 7.4, 3.9], ['stool-2', 'stool', 8.8, 3.9],
            ['pantry', 'pantry', 11.9, 3.0], ['fridge', 'fridge', 11.0, 4.4], ['galon', 'galon', 10.6, 2.7],
            ['plant-1', 'plant', -10.4, -5.8], ['plant-2', 'plant', -10.5, 4.8], ['plant-3', 'plant', 11.8, -5.7],
            ['tree-1', 'tree', -8.2, -9.5], ['tree-2', 'tree', -2.9, -9.3], ['tree-3', 'tree', 3.0, -9.2],
            ['tree-4', 'tree', 8.2, -9.2], ['tree-5', 'tree', -14.0, -0.6], ['tree-6', 'tree', 15.2, -0.6],
            ['lamp-1', 'lamp', -13.5, 6.7], ['lamp-2', 'lamp', 14.7, 6.5], ['lamp-3', 'lamp', 13.2, -7.1]
        ],
        [
            ['sofa-1', 'sofa', 0.25, 4.35], ['sofa-2', 'sofa', -1.1, 3.3], ['sofa-3', 'sofa', 1.6, 3.3],
            ['coffee-table', 'coffeetable', 0.25, 3.3], ['tv-1', 'tv', 0.3, -5.72],
            ['bookshelf-1', 'bookshelf', -1.3, -5.7], ['bookshelf-2', 'bookshelf', 1.9, -5.7],
            ['arcade-1', 'arcade', 11.55, -5.5], ['pingpong', 'pingpong', 9.9, 3.5],
            ['beanbag-1', 'beanbag', 8.3, 2.6], ['beanbag-2', 'beanbag', 7.5, 4.0],
            ['coffeebar', 'coffeebar', -9.7, 4.55], ['stool-1', 'stool', -10.4, 3.85], ['stool-2', 'stool', -9.0, 3.85],
            ['pantry', 'pantry', 11.9, 0.9], ['fridge', 'fridge', 11.5, 2.6], ['galon', 'galon', 11.3, 1.9],
            ['plant-1', 'plant', -10.4, -5.8], ['plant-2', 'plant', -10.5, 4.8], ['plant-3', 'plant', 11.8, -5.7],
            ['tree-1', 'tree', -8.2, -9.5], ['tree-2', 'tree', -2.9, -9.3], ['tree-3', 'tree', 3.0, -9.2],
            ['tree-4', 'tree', 8.2, -9.2], ['tree-5', 'tree', -14.0, -0.6], ['tree-6', 'tree', 15.2, -0.6],
            ['lamp-1', 'lamp', -13.5, 6.7], ['lamp-2', 'lamp', 14.7, 6.5], ['lamp-3', 'lamp', 13.2, -7.1]
        ],
        [
            ['sofa-1', 'sofa', 0.7, 4.6], ['sofa-2', 'sofa', -0.6, 3.5], ['sofa-3', 'sofa', 2.0, 3.5],
            ['coffee-table', 'coffeetable', 0.7, 3.5], ['tv-1', 'tv', 0.7, -6.32],
            ['bookshelf-1', 'bookshelf', -0.9, -6.32], ['bookshelf-2', 'bookshelf', 2.3, -6.32],
            ['arcade-1', 'arcade', 16.75, -6.15], ['pingpong', 'pingpong', 13.5, 3.8],
            ['pingpong-2', 'pingpong', -12.3, 2.4],
            ['beanbag-1', 'beanbag', 11.3, 2.7], ['beanbag-2', 'beanbag', 15.6, 2.9],
            ['coffeebar', 'coffeebar', -13.2, 4.95], ['stool-1', 'stool', -13.9, 4.25], ['stool-2', 'stool', -12.5, 4.25],
            ['pantry', 'pantry', -15.4, 1.8], ['fridge', 'fridge', -15.35, 3.1], ['galon', 'galon', -14.9, 2.4],
            ['plant-1', 'plant', -15.4, -6.3], ['plant-2', 'plant', -15.4, 5.2], ['plant-3', 'plant', 16.8, 5.2],
            ['tree-1', 'tree', -12.0, -9.8], ['tree-2', 'tree', -5.0, -9.6], ['tree-3', 'tree', 2.0, -9.6],
            ['tree-4', 'tree', 9.0, -9.6], ['tree-5', 'tree', -19.5, -0.5], ['tree-6', 'tree', 20.8, -0.5],
            ['lamp-1', 'lamp', -18.5, 7.0], ['lamp-2', 'lamp', 20.0, 6.8], ['lamp-3', 'lamp', 18.0, -8.5]
        ]
    ];
    function isLegacyDefaultFurniture(list) {
        if (!Array.isArray(list)) return false;
        return LEGACY_FURNITURE_SIGS.some(function (set) {
            if (list.length !== set.length) return false;
            return set.every(function (sig) {
                return list.some(function (f) {
                    return f.id === sig[0] && f.type === sig[1] &&
                        Math.abs((Number(f.x) || 0) - sig[2]) < 0.02 && Math.abs((Number(f.z) || 0) - sig[3]) < 0.02;
                });
            });
        });
    }

    function buildLayout(agentCount, custom) {
        var cfg = custom && typeof custom === 'object' ? custom : null;
        var desks = (cfg && Array.isArray(cfg.desks) && cfg.desks.length
            ? cfg.desks.map(function (d) {
                var info = deskInfo(d);
                return [info.x, info.z, round2(info.rot)];
            })
            : defaultLayoutData().desks
        );
        /* Migrasi denah pod studio: layout yang masih persis bawaan lama
           (meja + partisi generasi sebelumnya, belum dikustom user) dinaikkan
           utuh ke denah baru; layout kustom tidak disentuh sama sekali. */
        var migrated = false;
        var migrateFull = false;
        if (cfg && isLegacyDefaultDesks(desks)) {
            desks = defaultLayoutData().desks.map(function (d) {
                var info = deskInfo(d);
                return [info.x, info.z, round2(info.rot)];
            });
            migrated = true;
            migrateFull = isLegacyDefaultSegments(cfg.partitions && cfg.partitions.segments);
        }
        /* Layout bawaan/migrasi mempertahankan SELURUH meja denah (11 meja
           pertama ditempati peran; sisanya workstation kosong tiap studio),
           juga saat setLayout dipanggil sebelum daftar karyawan dimuat. */
        var keepDesks = (!cfg || migrated)
            ? Math.max(agentCount, desks.length)
            : Math.max(1, agentCount);
        desks = desks.slice(0, Math.max(1, keepDesks));

        var building = cfg && cfg.building
            ? {
                minX: Number(cfg.building.minX) || DEFAULT_BUILDING.minX,
                maxX: Number(cfg.building.maxX) || DEFAULT_BUILDING.maxX,
                minZ: Number(cfg.building.minZ) || DEFAULT_BUILDING.minZ,
                maxZ: Number(cfg.building.maxZ) || DEFAULT_BUILDING.maxZ
            }
            : { minX: DEFAULT_BUILDING.minX, maxX: DEFAULT_BUILDING.maxX, minZ: DEFAULT_BUILDING.minZ, maxZ: DEFAULT_BUILDING.maxZ };
        if (migrateFull) {
            building = { minX: DEFAULT_BUILDING.minX, maxX: DEFAULT_BUILDING.maxX, minZ: DEFAULT_BUILDING.minZ, maxZ: DEFAULT_BUILDING.maxZ };
        }

        var furniture = cfg && Array.isArray(cfg.furniture) ? cfg.furniture : defaultFurniture();
        if (migrateFull && isLegacyDefaultFurniture(cfg && cfg.furniture)) {
            furniture = defaultFurniture();
        }
        var wallHeight = cfg && Number(cfg.wallHeight) ? Number(cfg.wallHeight) : 2.55;

        var meetingTable = cfg && cfg.meetingTable && typeof cfg.meetingTable === 'object'
            ? {
                x: Number(cfg.meetingTable.x) || DEFAULT_MEETING.x,
                z: Number(cfg.meetingTable.z) || DEFAULT_MEETING.z,
                radius: Number(cfg.meetingTable.radius) || DEFAULT_MEETING.radius,
                enabled: cfg.meetingTable.enabled !== false
            }
            : { x: DEFAULT_MEETING.x, z: DEFAULT_MEETING.z, radius: DEFAULT_MEETING.radius, enabled: true };
        if (migrateFull) {
            meetingTable = { x: DEFAULT_MEETING.x, z: DEFAULT_MEETING.z, radius: DEFAULT_MEETING.radius, enabled: true };
        }
        var meeting = meetingSpotsAround(meetingTable, agentCount);

        var partitions = cfg && cfg.partitions && Array.isArray(cfg.partitions.segments)
            ? cfg.partitions
            : defaultLayoutData().partitions;
        if (migrateFull) partitions = defaultLayoutData().partitions;

        /* Spot idle diturunkan dari furnitur layout aktif (deriveIdleStops):
           bean bag/sofa/stool persis di dudukannya, pingpong/dapur titik berdiri. */
        var idleStops = deriveIdleStops(furniture);
        var idleRoute = ['tv', 'lounge', 'coffee', 'game', 'chat', 'kitchen', 'jalan']
            .filter(function (k) { return idleStops.some(function (s) { return s.key === k; }); });
        if (!idleRoute.length) idleRoute = ['chat'];

        return {
            aisleZ: AISLE_Z,
            desks: desks,
            building: building,
            wallHeight: wallHeight,
            furniture: furniture,
            partitions: partitions,
            meeting: meeting,
            meetingTable: meetingTable,
            cameraTarget: [0.7, 0.4, -0.4],
            cameraOffset: [-8, 18, 19],
            /* Batas geser kamera mengikuti ukuran gedung aktif agar gedung
               lebar (slider editor kini sampai 50 m) tetap bisa dijelajahi. */
            pan: {
                minX: Math.round((building.minX - 2) * 100) / 100,
                maxX: Math.round((building.maxX + 2) * 100) / 100,
                minZ: Math.round((building.minZ - 3) * 100) / 100,
                maxZ: Math.round((building.maxZ + 3) * 100) / 100
            },
            idleStops: idleStops,
            idleRoute: idleRoute
        };
    }

    var THREE = null;
    var renderer = null;
    var scene = null;
    var camera = null;
    var clock = null;
    var rafId = 0;
    var container = null;
    var canvas = null;
    var labelsRoot = null;
    var hudRoot = null;
    var raycaster = null;
    var pointer = null;
    var characters = [];
    var roomRoot = null;
    var enabled = true;
    var reduced = false;
    var paused = false;
    var onSelect = null;
    var onActivity = null;
    var resizeObserver = null;
    var visibilityHandler = null;
    var clickHandler = null;
    var keyHandler = null;
    var lastActivityDigest = '';
    var lastIdleStep = -1;
    var employeesCache = [];
    var lightRefs = null;
    var lightingMode = (typeof localStorage !== 'undefined') ? loadLightingMode() : 'auto';
    var lightingPeriodApplied = '';
    var lastLightingMinute = -1;
    var routineOn = (typeof localStorage !== 'undefined') ? loadRoutinePreference() : true;
    /* Fase 2: kucing kantor Piko + kamera follow/first-person + tur kamera. */
    var cat = null;
    var cameraMode = 'orbit';
    var followRoleId = null;
    var cameraTour = { active: false, startedAt: 0 };
    var CAT_NAME = 'Piko';
    /* Label: cache elemen (dibuat sekali per rebuild, bukan per frame),
       agen terfokus untuk prioritas tampilan, dan vektor coret dipakai ulang. */
    var labelEls = [];
    var catLabelEl = null;
    var focusedRoleId = null;
    var _scratchV = null;
    var _scratchV2 = null;

    /* Orbit / pan / zoom (Ruang-like OrbitControls subset) */
    var orbit = {
        target: null,
        spherical: { radius: 34, phi: 0.95, theta: 0.42 },
        defaults: { radius: 34, phi: 0.95, theta: 0.42, target: [0.7, 0.4, -0.4] },
        dragging: false,
        panning: false,
        moved: false,
        lastX: 0,
        lastY: 0,
        listeners: null
    };

    function loadPreference() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw === '0') return false;
            if (raw === '1') return true;
        } catch (_) { /* ignore */ }
        if (typeof matchMedia === 'function' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return false;
        }
        return true;
    }

    function savePreference(on) {
        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    /** Terapkan palet pencahayaan periode aktif (auto = ikut jam perangkat). */
    function applyLighting(force) {
        if (!scene) return '';
        var period = lightingMode === 'auto' ? resolveLightingPeriod(new Date()) : lightingMode;
        if (!force && period === lightingPeriodApplied) return period;
        var pal = LIGHTING_PALETTES[period];
        if (!pal) return period;
        lightingPeriodApplied = period;
        if (scene.background && scene.background.set) scene.background.set(pal.bg);
        else scene.background = new THREE.Color(pal.bg);
        if (scene.fog && scene.fog.color) scene.fog.color.set(pal.bg);
        if (renderer) renderer.setClearColor(pal.clear, 1);
        if (lightRefs) {
            lightRefs.ambient.color.set(pal.ambient[0]);
            lightRefs.ambient.intensity = pal.ambient[1];
            lightRefs.key.color.set(pal.key[0]);
            lightRefs.key.intensity = pal.key[1];
            lightRefs.fill.color.set(pal.fill[0]);
            lightRefs.fill.intensity = pal.fill[1];
            lightRefs.hemi.color.set(pal.hemi[0]);
            lightRefs.hemi.groundColor.set(pal.hemi[1]);
            lightRefs.hemi.intensity = pal.hemi[2];
        }
        return period;
    }

    function setLightingMode(mode) {
        var next = (mode && (mode === 'auto' || LIGHTING_PALETTES[mode])) ? mode : 'auto';
        lightingMode = next;
        try { localStorage.setItem(LIGHTING_STORAGE_KEY, next); } catch (_) { /* ignore */ }
        lightingPeriodApplied = '';
        applyLighting(true);
        var sel = container ? container.querySelector('#office-3d-lighting') : null;
        if (sel) sel.value = next;
        return next;
    }

    function setRoutineEnabled(on) {
        routineOn = !!on;
        try { localStorage.setItem(ROUTINE_STORAGE_KEY, routineOn ? '1' : '0'); } catch (_) { /* ignore */ }
        var btn = container ? container.querySelector('#office-3d-routine') : null;
        if (btn) {
            btn.textContent = routineOn ? 'Routine: On' : 'Routine: Off';
            btn.setAttribute('aria-pressed', routineOn ? 'true' : 'false');
        }
        lastIdleStep = -1;
        recomputePlacements();
        return routineOn;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function statusSpeech(emp) {
        var st = emp.status || 'idle';
        var anim = emp.animationState || (emp.animation && emp.animation.state) || '';
        if (anim === 'thinking') return 'Thinking…';
        if (anim === 'waiting') return 'Waiting — needs human';
        if (anim === 'overloaded') return 'Overloaded — too many jobs';
        if (anim === 'blocked') return 'Blocked — job failed';
        var brief = (emp.latestJob && emp.latestJob.brief) ? String(emp.latestJob.brief).slice(0, 42) : '';
        if (st === 'standby') return emp.presenceNote || 'At desk — awaiting orders';
        if (st === 'working') return brief ? ('Building: ' + brief) : 'Working on brief…';
        if (st === 'needs_info') return 'Needs info from human';
        if (st === 'awaiting_approval') {
            if (emp.fromPresence) return emp.presenceNote || 'Team meeting';
            return 'Awaiting approval';
        }
        if (st === 'failed') return emp.latestJob && emp.latestJob.lastError
            ? String(emp.latestJob.lastError).slice(0, 40)
            : 'Job failed';
        if (st === 'done') return 'Done — ready for next brief';
        return '';
    }

    function idlePlan(seatIndexes, nowMs) {
        var plan = new Map();
        if (!routineOn) return plan;
        var taken = new Map();
        var step = Math.floor(nowMs / IDLE_STOP_MS);
        function stopAt(index) {
            var key = LAYOUT.idleRoute[index % LAYOUT.idleRoute.length];
            return LAYOUT.idleStops.find(function (s) { return s.key === key; });
        }
        /* Maksimal MAX_ROUTINE_AWAY agen meninggalkan meja sekaligus (pola kantor-ai);
           sisanya tetap siaga di meja. Agen sibuk tidak masuk daftar ini sama sekali. */
        var away = seatIndexes.slice().sort(function (a, b) { return a - b; }).slice(0, MAX_ROUTINE_AWAY);
        /* Setiap langkah genap, dua agen pertama dipasangkan di stop chat
           (dua spot saling berhadapan) agar ngobrol benar-benar berpasangan. */
        var paired = {};
        if (step % 2 === 0 && away.length >= 2) {
            var chatStop = LAYOUT.idleStops.find(function (s) { return s.key === 'chat'; });
            if (chatStop && chatStop.spots.length >= 2) {
                plan.set(away[0], { stop: chatStop, spot: chatStop.spots[0], activity: 'social', speech: 'Chatting with a teammate' });
                plan.set(away[1], { stop: chatStop, spot: chatStop.spots[1], activity: 'social', speech: 'Chatting with a teammate' });
                paired[away[0]] = true;
                paired[away[1]] = true;
                taken.set('chat', 2);
            }
        }
        away.forEach(function (seat) {
            if (paired[seat]) return;
            var start = step + seat * 2;
            var stop = stopAt(start);
            var offset;
            for (offset = 0; offset < LAYOUT.idleRoute.length; offset += 1) {
                var candidate = stopAt(start + offset);
                if ((taken.get(candidate.key) || 0) < candidate.spots.length) {
                    stop = candidate;
                    break;
                }
            }
            var used = taken.get(stop.key) || 0;
            taken.set(stop.key, used + 1);
            /* Aktivitas sosial diturunkan dari zona tujuan + rotasi langkah:
               coffee/kitchen → minum; chat → ngobrol; jalan → bergantian
               telepon / peregangan / ngobrol. */
            var activity = stop.key;
            var speech = stop.label;
            if (stop.key === 'coffee' || stop.key === 'kitchen') {
                activity = 'coffee';
                speech = stop.key === 'coffee' ? 'Coffee break' : 'Getting a drink';
            } else if (stop.key === 'chat') {
                activity = 'social';
                speech = 'Chatting with a teammate';
            } else if (stop.key === 'jalan') {
                var pick = (step + seat) % 3;
                if (pick === 0) { activity = 'phone'; speech = 'On a quick call'; }
                else if (pick === 1) { activity = 'stretch'; speech = 'Stretching a bit'; }
                else { activity = 'social'; speech = 'Chatting with a teammate'; }
            }
            plan.set(seat, { stop: stop, spot: stop.spots[used % stop.spots.length], activity: activity, speech: speech });
        });
        return plan;
    }

    /* ---------- Navigasi anti-tabrakan (statis: furnitur; dinamis: robot lain) ---------- */

    var FURNITURE_FOOTPRINT = {
        desk: [1.45, 1.6], workdesk: [1.95, 1.6], chair: [0.62, 0.62],
        sofa: [2.45, 1.0], armchair: [0.95, 0.9], coffeetable: [1.35, 0.75],
        pantry: [2.05, 0.7], fridge: [0.85, 0.8], galon: [0.5, 0.5],
        bookshelf: [1.45, 0.45], tv: [2.05, 0.25], stool: [0.4, 0.4],
        arcade: [0.8, 0.7], coffeebar: [2.25, 0.65], pingpong: [2.8, 1.58],
        meetingtable: [3.4, 1.3]
    };
    var FURNITURE_CIRCLE = { beanbag: 0.44, roundtable: 0.52, plant: 0.3, tree: 0.35, lamp: 0.18 };

    var navCache = null;

    /** Daftar rintangan dari layout aktif: kotak (AABB dunia) + lingkaran. */
    function buildNavObstacles() {
        var boxes = [];
        var circles = [];
        function addBox(cx, cz, w, d, rot) {
            var c = Math.abs(Math.cos(rot || 0));
            var s = Math.abs(Math.sin(rot || 0));
            var ew = w * c + d * s;
            var ed = w * s + d * c;
            boxes.push({ minX: cx - ew / 2, maxX: cx + ew / 2, minZ: cz - ed / 2, maxZ: cz + ed / 2 });
        }
        (LAYOUT.desks || []).forEach(function (d) { var di = deskInfo(d); addBox(di.x, di.z, 1.42, 0.76, di.rot); });
        (LAYOUT.furniture || []).forEach(function (item) {
            if (!item || !item.type) return;
            var x = Number(item.x) || 0;
            var z = Number(item.z) || 0;
            if (FURNITURE_CIRCLE[item.type]) {
                circles.push({ x: x, z: z, r: FURNITURE_CIRCLE[item.type] });
            } else if (FURNITURE_FOOTPRINT[item.type]) {
                var fp = FURNITURE_FOOTPRINT[item.type];
                addBox(x, z, fp[0], fp[1], Number(item.rotY) || 0);
            }
        });
        if (LAYOUT.meetingTable && LAYOUT.meetingTable.enabled !== false) {
            /* Meja memanjang didekati 3 lingkaran sepanjang sumbu-X agar
               kursi diagonal di sudut elips tidak dianggap menabrak. */
            var md = meetingDims(LAYOUT.meetingTable);
            var mOff = Math.max(0, md.a - md.b);
            [-mOff, 0, mOff].forEach(function (off) {
                circles.push({ x: LAYOUT.meetingTable.x + off, z: LAYOUT.meetingTable.z, r: md.b + 0.03 });
            });
        }
        (LAYOUT.partitions && LAYOUT.partitions.segments || []).forEach(function (seg) {
            if (seg.axis === 'h') addBox((seg.from + seg.to) / 2, seg.at, Math.abs(seg.to - seg.from), 0.26, 0);
            else addBox(seg.at, (seg.from + seg.to) / 2, 0.26, Math.abs(seg.to - seg.from), 0);
        });
        /* Kabinet rendah di dinding belakang TIDAK dijadikan rintangan:
           kursi baris belakang memang menempel tepat di depannya. */
        return { boxes: boxes, circles: circles };
    }

    function getNavObstacles() {
        if (!navCache) navCache = buildNavObstacles();
        return navCache;
    }

    /** Titik (x,z) menabrak furnitur? `pad` = tambahan jarak aman di luar jari-jari robot.
     *  `extra` = lingkaran rintangan tambahan (mis. posisi robot lain saat jalur-ulang). */
    function pointBlocked(x, z, pad, extra) {
        var nav = getNavObstacles();
        var p = (pad || 0) + ROBOT_RADIUS;
        var i;
        for (i = 0; i < nav.boxes.length; i += 1) {
            var b = nav.boxes[i];
            if (x > b.minX - p && x < b.maxX + p && z > b.minZ - p && z < b.maxZ + p) return true;
        }
        var circles = extra && extra.length ? nav.circles.concat(extra) : nav.circles;
        for (i = 0; i < circles.length; i += 1) {
            var c = circles[i];
            var dx = x - c.x;
            var dz = z - c.z;
            var rr = c.r + p;
            if (dx * dx + dz * dz < rr * rr) return true;
        }
        return false;
    }

    function segmentHitsBox(x1, z1, x2, z2, b, p) {
        var minX = b.minX - p;
        var maxX = b.maxX + p;
        var minZ = b.minZ - p;
        var maxZ = b.maxZ + p;
        var dx = x2 - x1;
        var dz = z2 - z1;
        var tmin = 0;
        var tmax = 1;
        var t;
        if (Math.abs(dx) < 1e-9) { if (x1 < minX || x1 > maxX) return false; }
        else {
            t = (minX - x1) / dx;
            var t2 = (maxX - x1) / dx;
            if (t > t2) { var tt = t; t = t2; t2 = tt; }
            tmin = Math.max(tmin, t); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return false;
        }
        if (Math.abs(dz) < 1e-9) { if (z1 < minZ || z1 > maxZ) return false; }
        else {
            t = (minZ - z1) / dz;
            var t3 = (maxZ - z1) / dz;
            if (t > t3) { var t4 = t; t = t3; t3 = t4; }
            tmin = Math.max(tmin, t); tmax = Math.min(tmax, t3);
            if (tmin > tmax) return false;
        }
        return true;
    }

    /** Garis lurus dari (x1,z1) ke (x2,z2) menabrak furnitur? */
    function segmentBlocked(x1, z1, x2, z2, pad, extra) {
        var nav = getNavObstacles();
        var p = (pad || 0) + ROBOT_RADIUS;
        var i;
        for (i = 0; i < nav.boxes.length; i += 1) {
            if (segmentHitsBox(x1, z1, x2, z2, nav.boxes[i], p)) return true;
        }
        var circles = extra && extra.length ? nav.circles.concat(extra) : nav.circles;
        for (i = 0; i < circles.length; i += 1) {
            var c = circles[i];
            var dx = x2 - x1;
            var dz = z2 - z1;
            var len2 = dx * dx + dz * dz || 1e-9;
            var t = ((c.x - x1) * dx + (c.z - z1) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
            var px = x1 + dx * t - c.x;
            var pz = z1 + dz * t - c.z;
            var rr = c.r + p;
            if (px * px + pz * pz < rr * rr) return true;
        }
        return false;
    }

    /** Cari jalur bebas furnitur dengan A* di grid lantai, lalu luruskan
     *  (line-of-sight shortcut). Sel awal & tujuan selalu dianggap bebas —
     *  tujuan memang bisa menempel furnitur (kursi meja, bean bag, stool). */
    function navPath(fromX, fromZ, toX, toZ, extraCircles) {
        var b = LAYOUT.building;
        var minX = b.minX + ROBOT_RADIUS + 0.08;
        var maxX = b.maxX - ROBOT_RADIUS - 0.08;
        var minZ = b.minZ + ROBOT_RADIUS + 0.08;
        var maxZ = b.maxZ - ROBOT_RADIUS - 0.08;
        var cols = Math.max(2, Math.ceil((maxX - minX) / NAV_CELL));
        var rows = Math.max(2, Math.ceil((maxZ - minZ) / NAV_CELL));
        function cellOf(x, z) {
            var cx = Math.max(0, Math.min(cols - 1, Math.floor((x - minX) / NAV_CELL)));
            var cz = Math.max(0, Math.min(rows - 1, Math.floor((z - minZ) / NAV_CELL)));
            return cz * cols + cx;
        }
        function centerOf(idx) {
            return { x: minX + (idx % cols + 0.5) * NAV_CELL, z: minZ + (Math.floor(idx / cols) + 0.5) * NAV_CELL };
        }
        var total = cols * rows;
        var blocked = new Uint8Array(total);
        var i;
        for (i = 0; i < total; i += 1) {
            var cc = centerOf(i);
            if (pointBlocked(cc.x, cc.z, 0, extraCircles)) blocked[i] = 1;
        }
        /* Titik awal/tujuan bisa berada DI zona furnitur (duduk di bean bag,
           stool, kursi menempel meja): sel persisnya dikelilingi sel terblokir
           sehingga tak terjangkau A*. Maka bidik sel bebas terdekat, dan
           pendekatan akhir ke titik persisnya ditempuh lurus (diizinkan oleh
           pengecualian dekat-tujuan & aturan keluar di navPositionFree). */
        function nearestFreeCell(x, z) {
            var best = -1;
            var bestD = Infinity;
            for (var k = 0; k < total; k += 1) {
                if (blocked[k]) continue;
                var c = centerOf(k);
                var d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
                if (d < bestD) { bestD = d; best = k; }
            }
            return best;
        }
        var start = cellOf(fromX, fromZ);
        if (blocked[start]) start = nearestFreeCell(fromX, fromZ);
        var goal = cellOf(toX, toZ);
        if (blocked[goal]) goal = nearestFreeCell(toX, toZ);
        if (start === -1 || goal === -1) return null;
        blocked[start] = 0;
        blocked[goal] = 0;
        var gScore = new Float32Array(total).fill(Infinity);
        var came = new Int32Array(total).fill(-1);
        var closed = new Uint8Array(total);
        var open = [start];
        gScore[start] = 0;
        var goalC = centerOf(goal);
        function heur(idx) {
            var c = centerOf(idx);
            return Math.hypot(c.x - goalC.x, c.z - goalC.z);
        }
        var found = start === goal;
        while (open.length && !found) {
            var bestI = 0;
            var bestF = Infinity;
            for (i = 0; i < open.length; i += 1) {
                var f = gScore[open[i]] + heur(open[i]);
                if (f < bestF) { bestF = f; bestI = i; }
            }
            var cur = open.splice(bestI, 1)[0];
            if (cur === goal) { found = true; break; }
            if (closed[cur]) continue;
            closed[cur] = 1;
            var cxI = cur % cols;
            var czI = Math.floor(cur / cols);
            var dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
            dirs.forEach(function (d) {
                var nx = cxI + d[0];
                var nz = czI + d[1];
                if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) return;
                var nIdx = nz * cols + nx;
                if (blocked[nIdx] || closed[nIdx]) return;
                /* Jangan memotong sudut furnitur secara diagonal. */
                if (d[0] && d[1] && (blocked[czI * cols + nx] || blocked[nz * cols + cxI])) return;
                var g = gScore[cur] + d[2] * NAV_CELL;
                if (g < gScore[nIdx]) {
                    gScore[nIdx] = g;
                    came[nIdx] = cur;
                    open.push(nIdx);
                }
            });
        }
        if (!found) {
            /* Tujuan persis terkurung furnitur (sel bebas terdekat pun bisa
               berada di kantong terisolasi): berhenti di sel terjangkau yang
               paling dekat dengan tujuan, pendekatan akhirnya ditempuh lurus. */
            var bestGoal = -1;
            var bestGD = Infinity;
            for (i = 0; i < total; i += 1) {
                if (!closed[i] && i !== start) continue;
                var gc = centerOf(i);
                var gd = (gc.x - toX) * (gc.x - toX) + (gc.z - toZ) * (gc.z - toZ);
                if (gd < bestGD) { bestGD = gd; bestGoal = i; }
            }
            if (bestGoal === -1) return null;
            goal = bestGoal;
            found = true;
        }
        var cells = [];
        var node = goal;
        while (node !== -1) { cells.push(node); node = came[node]; }
        cells.reverse();
        var pts = [{ x: fromX, z: fromZ }];
        cells.forEach(function (idx) { pts.push(centerOf(idx)); });
        pts.push({ x: toX, z: toZ });
        /* Pelurusan: lompat ke titik terjauh yang terlihat langsung. */
        var out = [];
        var anchor = pts[0];
        var ai = 0;
        while (ai < pts.length - 1) {
            var far = ai + 1;
            var j;
            for (j = pts.length - 1; j > ai + 1; j -= 1) {
                if (!segmentBlocked(anchor.x, anchor.z, pts[j].x, pts[j].z, 0, extraCircles)) { far = j; break; }
            }
            anchor = pts[far];
            out.push({ x: anchor.x, z: anchor.z });
            ai = far;
        }
        return out;
    }

    function aislePath(fromX, fromZ, toX, toZ) {
        var nav = navPath(fromX, fromZ, toX, toZ);
        if (nav && nav.length) return nav;
        /* Cadangan bila A* gagal: jalur lorong tengah lama. */
        var az = LAYOUT.aisleZ;
        var pts = [];
        if (Math.abs(fromZ - az) > 0.12) pts.push({ x: fromX, z: az });
        if (Math.abs(fromX - toX) > 0.12) pts.push({ x: toX, z: az });
        pts.push({ x: toX, z: toZ });
        return pts;
    }

    /** Seberapa dalam titik ini masuk ke zona rintangan (0 = bebas). */
    function blockedDepth(x, z) {
        var nav = getNavObstacles();
        var depth = 0;
        var i;
        for (i = 0; i < nav.boxes.length; i += 1) {
            var b = nav.boxes[i];
            if (x > b.minX - ROBOT_RADIUS && x < b.maxX + ROBOT_RADIUS &&
                z > b.minZ - ROBOT_RADIUS && z < b.maxZ + ROBOT_RADIUS) {
                var dIn = Math.min(
                    x - (b.minX - ROBOT_RADIUS), (b.maxX + ROBOT_RADIUS) - x,
                    z - (b.minZ - ROBOT_RADIUS), (b.maxZ + ROBOT_RADIUS) - z
                );
                if (dIn > depth) depth = dIn;
            }
        }
        for (i = 0; i < nav.circles.length; i += 1) {
            var c = nav.circles[i];
            var dc = (c.r + ROBOT_RADIUS) - Math.hypot(x - c.x, z - c.z);
            if (dc > depth) depth = dc;
        }
        return depth;
    }

    /** Posisi kandidat aman? Tidak menabrak furnitur & tidak terlalu dekat
     *  robot lain. Dekat titik tujuan akhir tetap diizinkan (spot menempel furnitur). */
    function navPositionFree(selfCh, x, z) {
        var ud = selfCh.userData;
        var nearGoal = ud.placement && Math.hypot(x - ud.placement.x, z - ud.placement.z) < 0.42;
        if (!nearGoal && pointBlocked(x, z, 0)) {
            /* Pengecualian keluar: robot yang sedang duduk DI spot furnitur
               (bean bag, stool, ujung meja pingpong) posisinya sendiri berada
               di zona rintangan — izinkan bergerak bila makin keluar. */
            var curDepth = blockedDepth(selfCh.position.x, selfCh.position.z);
            var escaping = curDepth > 0 && blockedDepth(x, z) < curDepth - 0.001;
            /* Pengecualian masuk: pendekatan akhir ke spot furnitur — kandidat
               adalah langkah terakhir, dekat tujuan, dan makin mendekat. */
            var finalApproach = false;
            if (ud.placement && ud.path && ud.path.length <= 1) {
                var dCand = Math.hypot(x - ud.placement.x, z - ud.placement.z);
                var dCur = Math.hypot(selfCh.position.x - ud.placement.x, selfCh.position.z - ud.placement.z);
                /* Ambang 1,05: zona tiup furnitur tujuan (mis. bean bag r 0,74)
                   mulai memblokir sebelum robot cukup dekat ke titik duduknya. */
                finalApproach = dCand < 1.05 && dCand < dCur;
            }
            if (!escaping && !finalApproach) return false;
        }
        var b = LAYOUT.building;
        if (x < b.minX + ROBOT_RADIUS || x > b.maxX - ROBOT_RADIUS ||
            z < b.minZ + ROBOT_RADIUS || z > b.maxZ - ROBOT_RADIUS) return false;
        for (var i = 0; i < characters.length; i += 1) {
            var o = characters[i];
            if (o === selfCh) continue;
            if (Math.hypot(x - o.position.x, z - o.position.z) < AGENT_MIN_DIST) return false;
        }
        return true;
    }

    function placementFor(emp, seatIndex, idleAssignment, meetingIndex) {
        var st = emp.status || 'idle';
        var anim = emp.animationState || (emp.animation && emp.animation.state) || '';
        // Pose baru tersuling (#3): berpikir & kelebihan beban selalu di meja.
        if (anim === 'thinking' || anim === 'overloaded') {
            var seatAnim = deskSeatSpot(LAYOUT.desks[seatIndex % LAYOUT.desks.length]);
            return {
                x: seatAnim.x, z: seatAnim.z, facing: seatAnim.facing, seated: true, seatY: seatAnim.seatY,
                pose: anim === 'thinking' ? 'thinking' : 'tired',
                activity: anim,
                speech: statusSpeech(emp),
                label: anim === 'thinking' ? 'Thinking' : 'Overloaded'
            };
        }
        if (anim === 'waiting' && st !== 'awaiting_approval') {
            var seatWait = deskSeatSpot(LAYOUT.desks[seatIndex % LAYOUT.desks.length]);
            return {
                x: seatWait.x, z: seatWait.z, facing: seatWait.facing, seated: true, seatY: seatWait.seatY,
                pose: 'waiting', activity: 'waiting',
                speech: statusSpeech(emp), label: 'Waiting'
            };
        }
        if (st === 'awaiting_approval') {
            var m = LAYOUT.meeting[meetingIndex % LAYOUT.meeting.length];
            return {
                x: m.x, z: m.z, facing: m.facing, seated: !!m.seated, seatY: m.seatY || 0,
                pose: m.seated ? 'sit' : 'stand',
                activity: 'chat',
                speech: statusSpeech(emp),
                label: STATUS_LABEL[st]
            };
        }
        if (st === 'working' || st === 'standby' || st === 'needs_info' || st === 'failed' || st === 'done') {
            var seatDesk = deskSeatSpot(LAYOUT.desks[seatIndex % LAYOUT.desks.length]);
            return {
                x: seatDesk.x, z: seatDesk.z, facing: seatDesk.facing, seatY: seatDesk.seatY,
                seated: st === 'working' || st === 'standby' || st === 'needs_info',
                pose: st === 'failed' ? 'slump' : (st === 'done' ? 'cheer' : 'sit'),
                activity: st === 'working' || st === 'standby' ? 'work' : (st === 'needs_info' ? 'review' : st),
                speech: statusSpeech(emp),
                label: STATUS_LABEL[st] || STATUS_LABEL.working
            };
        }
        if (idleAssignment) {
            var spot = idleAssignment.spot;
            return {
                x: spot.x, z: spot.z, facing: spot.facing, seatY: spot.seatY || 0,
                seated: !!spot.seated,
                pose: spot.seated ? 'sit' : 'stand',
                activity: idleAssignment.activity || idleAssignment.stop.key,
                speech: idleAssignment.speech || idleAssignment.stop.label,
                label: STATUS_LABEL.idle,
                idleKey: idleAssignment.stop.key
            };
        }
        var seatIdle = deskSeatSpot(LAYOUT.desks[seatIndex % LAYOUT.desks.length]);
        return {
            x: seatIdle.x, z: seatIdle.z, facing: seatIdle.facing, seated: false,
            pose: 'stand', activity: 'idle', speech: '', label: STATUS_LABEL.idle
        };
    }

    /* ---------- Mesh helpers ---------- */

    function mat(color, roughness, metalness, opts) {
        var o = opts || {};
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness == null ? 0.75 : roughness,
            metalness: metalness == null ? 0.04 : metalness,
            transparent: o.opacity != null,
            opacity: o.opacity != null ? o.opacity : 1,
            emissive: o.emissive != null ? o.emissive : 0x000000,
            emissiveIntensity: o.emissiveIntensity != null ? o.emissiveIntensity : 0,
            flatShading: !!o.flatShading,
            side: o.side != null ? o.side : THREE.FrontSide,
            depthWrite: o.depthWrite != null ? o.depthWrite : true
        });
    }

    function box(parent, x, y, z, w, h, d, color, roughness, metalness, opts) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, roughness, metalness, opts));
        mesh.position.set(x, y, z);
        /* Bayangan selektif: hanya mesh yang meminta lewat opts.cast yang
           melempar bayangan (hemat GPU); semua box tetap menerima. */
        mesh.castShadow = !!(opts && opts.cast);
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    function cyl(parent, x, y, z, r, h, color, roughness, metalness, opts) {
        var top = opts && opts.top != null ? opts.top : r;
        var mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(top, r, h, (opts && opts.segments) || 16),
            mat(color, roughness, metalness, opts)
        );
        mesh.position.set(x, y, z);
        if (opts && opts.rotX) mesh.rotation.x = opts.rotX;
        if (opts && opts.rotZ) mesh.rotation.z = opts.rotZ;
        parent.add(mesh);
        return mesh;
    }

    function groupAt(parent, x, y, z, rotY) {
        var g = new THREE.Group();
        g.position.set(x, y || 0, z);
        if (rotY) g.rotation.y = rotY;
        parent.add(g);
        return g;
    }

    function addFloorPlane(parent, x, y, z, w, d, color, roughness) {
        var mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            mat(color, roughness == null ? 0.85 : roughness, 0.02)
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    /** Dinding keliling gedung FULL KACA (bukan tembok): panel transparan
       setinggi dinding + rel bawah grafit, rel atas teal menyala, dan tiang
       mullion ramping tiap ±3 m agar terbaca sebagai dinding kaca. */
    function addGlassWall(parent, x1, z1, x2, z2, height) {
        var h = height == null ? WALL_H : height;
        var len = Math.hypot(x2 - x1, z2 - z1);
        var angle = Math.atan2(z2 - z1, x2 - x1);
        var g = groupAt(parent, (x1 + x2) / 2, 0, (z1 + z2) / 2, -angle);
        box(g, 0, 0.06, 0, len + 0.04, 0.12, 0.1, 0x334155, 0.4, 0.5);
        var gh = Math.max(0.1, h - 0.18);
        var glass = box(g, 0, 0.12 + gh / 2, 0, len, gh, 0.06, 0x9fd4e8, 0.12, 0.15, {
            opacity: 0.28, emissive: 0x0e7490, emissiveIntensity: 0.08
        });
        glass.castShadow = false;
        box(g, 0, h - 0.025, 0, len + 0.04, 0.05, 0.1, TEAL, 0.4, 0.2, {
            emissive: 0x14b8a6, emissiveIntensity: 0.35
        });
        var n = Math.max(1, Math.floor(len / 3));
        var i;
        for (i = 0; i <= n; i += 1) {
            box(g, -len / 2 + (i * len) / n, h / 2, 0, 0.07, h, 0.09, 0x334155, 0.4, 0.5);
        }
        return g;
    }

    /** Partisi kaca futuristik: panel transparan + rel atas/bawah teal-grafit. */
    function addGlassPartition(parent, x1, z1, x2, z2) {
        var len = Math.hypot(x2 - x1, z2 - z1);
        var angle = Math.atan2(z2 - z1, x2 - x1);
        var g = groupAt(parent, (x1 + x2) / 2, 0, (z1 + z2) / 2, -angle);
        var glass = box(g, 0, 1.12, 0, len, 1.94, 0.06, 0x9fd4e8, 0.12, 0.15, {
            opacity: 0.32, emissive: 0x0e7490, emissiveIntensity: 0.08
        });
        glass.castShadow = false;
        box(g, 0, 2.12, 0, len + 0.04, 0.05, 0.1, TEAL, 0.4, 0.2, {
            emissive: 0x14b8a6, emissiveIntensity: 0.35
        });
        box(g, 0, 0.06, 0, len + 0.04, 0.12, 0.1, 0x334155, 0.4, 0.5);
        return g;
    }

    /* Nama 4 studio fisik (barat → timur) sesuai layout final. */
    var STUDIO_ROOM_NAMES = ['Marketing', 'Sales', 'Operational', 'Support'];

    /** Ruang studio fisik dari gedung + pembatas kaca vertikal: rentang X
     *  antar-pembatas (di sisi belakang) yang berisi meja. Label dijangkar
     *  di tepi belakang ruang. Tanpa pad warna di bawah meja. */
    function computeStudioRooms(layout) {
        var b = (layout && layout.building) || DEFAULT_BUILDING;
        var desks = (layout && layout.desks) || [];
        var segs = (layout && layout.partitions && layout.partitions.segments) || [];
        var dividers = [];
        segs.forEach(function (s) {
            if (s.axis === 'v' && Number(s.from) <= b.minZ + 1) dividers.push(Number(s.at));
        });
        dividers.sort(function (a, c) { return a - c; });
        var edges = [b.minX].concat(dividers, [b.maxX]);
        var rooms = [];
        var i;
        for (i = 0; i < edges.length - 1; i += 1) {
            var x1 = edges[i];
            var x2 = edges[i + 1];
            var hasDesk = desks.some(function (d) {
                var info = deskInfo(d);
                return info.z < -0.6 && info.x > x1 + 0.2 && info.x < x2 - 0.2;
            });
            if (!hasDesk) continue;
            var idx = rooms.length;
            var name = STUDIO_ROOM_NAMES[idx] || ('Studio ' + (idx + 1));
            rooms.push({
                id: 'studio-' + (idx + 1),
                studio: 'Studio ' + (idx + 1) + ' · ' + name,
                name: name,
                cx: round2((x1 + x2) / 2),
                cz: round2(b.minZ + 0.6),
                w: round2(x2 - x1),
                d: round2(-0.9 - b.minZ)
            });
        }
        return rooms;
    }

    var studioZones = [];
    var zoneLabelEls = [];
    function addStudioZones(parent) {
        /* Layout final: TANPA warna/pad grup di bawah meja — zona hanya
           dipakai untuk label nama studio fisik di mode overview. */
        studioZones = computeStudioRooms(LAYOUT);
    }

    function addPlant(parent, x, z, size) {
        var s = size || 1;
        var g = groupAt(parent, x, 0, z);
        g.scale.setScalar(s);
        cyl(g, 0, 0.22, 0, 0.2, 0.44, 0xb0643a, 0.8, 0, { top: 0.26 });
        [[0, 0.75, 0, 0.32], [0.14, 0.95, 0.05, 0.22], [-0.12, 0.92, -0.06, 0.24], [0, 1.12, 0, 0.18]].forEach(function (p) {
            var leaf = new THREE.Mesh(
                new THREE.IcosahedronGeometry(p[3], 1),
                mat(0x4f8a4a, 0.85, 0, { flatShading: true })
            );
            leaf.position.set(p[0], p[1], p[2]);
            g.add(leaf);
        });
    }

    function addTree(parent, x, z, size) {
        var g = groupAt(parent, x, 0, z);
        g.scale.setScalar(size || 1);
        cyl(g, 0, 0.9, 0, 0.16, 1.8, 0x6b4a32, 0.9, 0, { top: 0.12 });
        [[0, 2.2, 0, 1], [0.5, 1.9, 0.2, 0.7], [-0.45, 2.0, -0.2, 0.75], [0.1, 2.7, 0.1, 0.7]].forEach(function (p) {
            var canopy = new THREE.Mesh(
                new THREE.IcosahedronGeometry(p[3], 1),
                mat(0x3f7a3c, 0.9, 0, { flatShading: true })
            );
            canopy.position.set(p[0], p[1], p[2]);
            canopy.castShadow = true;
            canopy.receiveShadow = true;
            g.add(canopy);
        });
    }

    function addStreetLamp(parent, x, z) {
        var g = groupAt(parent, x, 0, z);
        cyl(g, 0, 1.6, 0, 0.06, 3.2, 0x2f3336, 0.4, 0.5);
        box(g, 0.35, 3.15, 0, 0.8, 0.06, 0.06, 0x2f3336, 0.4, 0.5);
        box(g, 0.7, 3.05, 0, 0.3, 0.12, 0.2, 0xf5e6b8, 0.5, 0, { emissive: 0xffd98a, emissiveIntensity: 0.25 });
    }

    /* Kursi futuristik: cangkang putih glossy melengkung (sphere terpipih),
       bantalan warna aksen, tiang krom, dan alas cakram melayang bercincin
       cahaya cyan. Dipakai meja kerja, meja meeting, dan workdesk. */
    function addFutureChair(parent, x, z, rotY, color) {
        /* Kursi kerja ergonomis ala referensi workstation: bantalan biru
           royal, rangka & sandaran tangan hitam, kaki bintang + roda. */
        var g = groupAt(parent, x, 0, z, rotY || 0);
        var BLUE = 0x2456e0;
        var DARK = 0x11151c;
        /* Kaki bintang hitam: hub + 5 jari + roda kecil */
        cyl(g, 0, 0.07, 0, 0.06, 0.08, DARK, 0.4, 0.5);
        var si;
        for (si = 0; si < 5; si += 1) {
            var a = (si / 5) * Math.PI * 2;
            var spoke = box(g, Math.sin(a) * 0.17, 0.045, Math.cos(a) * 0.17, 0.05, 0.03, 0.32, DARK, 0.4, 0.5);
            spoke.rotation.y = a;
            box(g, Math.sin(a) * 0.31, 0.03, Math.cos(a) * 0.31, 0.055, 0.05, 0.055, 0x1c222c, 0.4, 0.4);
        }
        /* Gas lift hitam */
        cyl(g, 0, 0.27, 0, 0.032, 0.36, 0x232a35, 0.3, 0.7);
        /* Dudukan biru */
        var seat = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 12), mat(BLUE, 0.55, 0.02));
        seat.scale.set(1.02, 0.34, 0.95);
        seat.position.y = 0.44;
        seat.castShadow = true;
        g.add(seat);
        /* Sandaran: rangka hitam di belakang, bantalan biru di depan */
        var backShell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), mat(DARK, 0.45, 0.2));
        backShell.scale.set(0.98, 1.22, 0.24);
        backShell.position.set(0, 0.92, -0.235);
        backShell.rotation.x = -0.09;
        g.add(backShell);
        var backPad = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), mat(BLUE, 0.55, 0.02));
        backPad.scale.set(0.88, 1.1, 0.18);
        backPad.position.set(0, 0.92, -0.195);
        backPad.rotation.x = -0.09;
        g.add(backPad);
        /* Sandaran tangan hitam (tiang + bantalan) */
        [-0.31, 0.31].forEach(function (sx) {
            box(g, sx, 0.58, -0.03, 0.04, 0.24, 0.04, DARK, 0.4, 0.4);
            box(g, sx, 0.71, 0.0, 0.065, 0.03, 0.27, DARK, 0.45, 0.3);
        });
        return g;
    }

    function addOfficeChair(parent, x, z, rotY, color) {
        return addFutureChair(parent, x, z, rotY, color);
    }

    function addWorkDesk(parent, x, z, active) {
        var g = groupAt(parent, x, 0, z);
        /* Workdesk biru royal + LED putih (gaya workstation yang sama) */
        var BLUE = 0x2242c8;
        box(g, 0, 0.74, 0, 1.9, 0.06, 0.95, BLUE, 0.38, 0.08, { cast: true });
        box(g, 0, 0.715, -0.482, 1.9, 0.016, 0.016, 0xf8fafc, 0.4, 0.1, {
            emissive: 0xf8fafc, emissiveIntensity: 1.1
        });
        box(g, -0.9, 0.36, 0, 0.07, 0.72, 0.8, BLUE, 0.38, 0.08);
        box(g, 0.9, 0.36, 0, 0.07, 0.72, 0.8, BLUE, 0.38, 0.08);
        box(g, 0.62, 0.31, -0.05, 0.22, 0.56, 0.46, 0x0b0e14, 0.4, 0.3);
        box(g, 0, 1.13, 0.22, 1.24, 0.52, 0.03, 0x0f172a, 0.25, 0.4);
        var screen = new THREE.Mesh(
            new THREE.PlaneGeometry(1.18, 0.46),
            mat(active ? 0x1a3a42 : 0x0a1014, 0.3, 0.1, {
                emissive: active ? 0x2a8aa0 : 0x000000,
                emissiveIntensity: active ? 0.7 : 0
            })
        );
        screen.position.set(0, 1.13, 0.194);
        screen.rotation.y = Math.PI;
        g.add(screen);
        cyl(g, 0, 0.88, 0.25, 0.03, 0.22, 0x2a2f33, 0.4);
        box(g, 0, 0.785, 0.28, 0.3, 0.02, 0.18, 0x2a2f33, 0.4);
        box(g, 0, 0.79, -0.18, 0.56, 0.025, 0.18, 0x3a4046, 0.5);
        box(g, 0.42, 0.79, -0.18, 0.07, 0.03, 0.11, 0x3a4046, 0.5);
        cyl(g, -0.65, 0.84, -0.1, 0.05, 0.12, 0xf4efe6, 0.7);
        cyl(g, -0.65, 0.901, -0.1, 0.043, 0.005, 0x3b2415, 0.8);
        addOfficeChair(g, 0, -0.78, 0);
    }

    function addSofa(parent, x, z, rotY) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        var c = 0x5b6f8c;
        box(g, 0, 0.28, 0, 2.4, 0.36, 0.9, c, 0.9, 0.02, { cast: true });
        box(g, 0, 0.66, -0.36, 2.4, 0.62, 0.2, c, 0.9, 0.02, { cast: true });
        box(g, -1.12, 0.52, 0, 0.2, 0.42, 0.9, c, 0.95);
        box(g, 1.12, 0.52, 0, 0.2, 0.42, 0.9, c, 0.95);
        box(g, -0.5, 0.5, 0.05, 0.95, 0.14, 0.7, 0x6e83a2, 0.95);
        box(g, 0.5, 0.5, 0.05, 0.95, 0.14, 0.7, 0x6e83a2, 0.95);
        box(g, -0.7, 0.72, -0.18, 0.38, 0.34, 0.14, 0xe0a43a, 0.95);
    }

    function addArmchair(parent, x, z, rotY, color) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        box(g, 0, 0.3, 0, 0.9, 0.4, 0.85, color, 0.95);
        box(g, 0, 0.66, -0.34, 0.9, 0.52, 0.18, color, 0.95);
    }

    function addCoffeeTable(parent, x, z) {
        var g = groupAt(parent, x, 0, z);
        box(g, 0, 0.36, 0, 1.3, 0.07, 0.7, 0x8a5a3a, 0.5);
        [[-0.55, -0.27], [0.55, -0.27], [-0.55, 0.27], [0.55, 0.27]].forEach(function (p) {
            cyl(g, p[0], 0.17, p[1], 0.03, 0.34, 0x2a2f33, 0.5);
        });
    }

    function addTelevision(parent, x, y, z) {
        var g = groupAt(parent, x, y, z);
        box(g, 0, 0, 0, 2, 1.15, 0.08, 0x111416, 0.3);
        var screen = new THREE.Mesh(
            new THREE.PlaneGeometry(1.88, 1.03),
            mat(0x1d5a6b, 0.2, 0.1, { emissive: 0x2a8aa0, emissiveIntensity: 0.55 })
        );
        screen.position.z = 0.045;
        g.add(screen);
    }

    /* Meja meeting MEMANJANG (elongated-meeting-v1): top elips glossy sumbu-X
       + tepi cahaya cyan. Kursi digambar dari spot yang SAMA dengan spot
       duduk robot (meetingSpotsAround) agar sinkron jumlah & posisinya. */
    function addElongatedMeetingTable(parent, x, z, radius, spots, spotsLocal) {
        var g = groupAt(parent, x, 0, z);
        var dims = meetingDims({ radius: radius });
        var top = cyl(g, 0, 0.74, 0, 1, 0.06, 0xf8fafc, 0.3, 0.06, { segments: 36 });
        top.scale.set(dims.a, 1, dims.b);
        top.castShadow = true;
        top.receiveShadow = true;
        var rim = cyl(g, 0, 0.705, 0, 1, 0.02, 0x22d3ee, 0.4, 0.1, {
            segments: 36, emissive: 0x22d3ee, emissiveIntensity: 0.7
        });
        rim.scale.set(dims.a + 0.015, 1, dims.b + 0.015);
        cyl(g, -dims.a * 0.55, 0.37, 0, 0.09, 0.66, 0x334155, 0.3, 0.7);
        cyl(g, dims.a * 0.55, 0.37, 0, 0.09, 0.66, 0x334155, 0.3, 0.7);
        box(g, 0, 0.06, 0, dims.a * 1.25, 0.05, 0.42, 0x1f2937, 0.35, 0.6);
        var chairColors = [TEAL, YELLOW, TEAL, YELLOW, TEAL, YELLOW, TEAL];
        var useSpots = (spots && spots.length)
            ? spots
            : meetingSpotsAround({ x: 0, z: 0, radius: radius }, (LAYOUT.meeting || []).length || 7);
        useSpots.forEach(function (s, i) {
            /* Spot meja utama absolut -> lokal; spot furnitur editor sudah lokal. */
            var lx = spotsLocal ? s.x : s.x - x;
            var lz = spotsLocal ? s.z : s.z - z;
            addOfficeChair(g, lx, lz, s.facing, chairColors[i % chairColors.length]);
        });
        return g;
    }
    function addRoundMeetingTable(parent, x, z, radius) {
        return addElongatedMeetingTable(parent, x, z, radius);
    }

    function addPantryCounter(parent, x, z, rotY) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        box(g, 0, 0.45, 0, 2, 0.9, 0.6, 0xf2eee6, 0.75, 0.02, { cast: true });
        box(g, 0, 0.92, 0, 2.05, 0.05, 0.65, 0x3a3f44, 0.3, 0.2);
        cyl(g, -0.6, 1.07, 0, 0.16, 0.24, 0xf5f5f2, 0.5);
        cyl(g, -0.6, 1.2, 0, 0.14, 0.05, 0xd64545, 0.5, 0, { top: 0.1 });
        cyl(g, 0.1, 1.05, 0, 0.1, 0.2, 0xdfe8e6, 0.2, 0, { opacity: 0.5 });
        cyl(g, 0.62, 1.06, 0, 0.12, 0.22, 0xb9c0c4, 0.25, 0.7, { top: 0.08 });
        /* sink basin */
        box(g, 0.2, 0.88, 0.05, 0.35, 0.04, 0.28, 0x9aa2a6, 0.3, 0.4);
    }

    function addFridge(parent, x, z, rotY) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        box(g, 0, 0.9, 0, 0.75, 1.8, 0.7, 0xdfe3e4, 0.4, 0.15, { cast: true });
        box(g, 0.28, 1.0, 0.37, 0.03, 0.4, 0.03, 0x9aa2a6, 0.4, 0.4);
    }

    function addGalon(parent, x, z, rotY) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        box(g, 0, 0.5, 0, 0.42, 1, 0.42, 0xeef0ee, 0.4);
        cyl(g, 0, 1.33, 0, 0.19, 0.52, 0x5fb4f2, 0.08, 0, { opacity: 0.55, segments: 20 });
        cyl(g, 0, 1.05, 0, 0.06, 0.1, 0x5fb4f2, 0.08, 0, { top: 0.17, opacity: 0.6 });
    }

    function addPingPong(parent, x, z) {
        var g = groupAt(parent, x, 0, z);
        box(g, 0, 0.74, 0, 2.74, 0.05, 1.52, 0x1f5f8b, 0.5, 0.02, { cast: true });
        box(g, 0, 0.768, 0, 2.7, 0.004, 0.03, 0xffffff, 0.5);
        box(g, 0, 0.768, 0, 0.02, 0.004, 1.48, 0xffffff, 0.5);
        box(g, 0, 0.85, 0, 0.02, 0.16, 1.62, 0xf4f4f0, 0.4, 0, { opacity: 0.75 });
        [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].forEach(function (p) {
            cyl(g, p[0], 0.36, p[1], 0.035, 0.72, 0x2a2f33, 0.5);
        });
    }

    function addArcade(parent, x, z, color) {
        var g = groupAt(parent, x, 0, z);
        box(g, 0, 0.85, 0, 0.72, 1.7, 0.62, color, 0.55, 0.02, { cast: true });
        box(g, 0, 0.95, 0.32, 0.66, 0.06, 0.22, 0x1c1f24, 0.4);
        var screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.56, 0.44),
            mat(0x111827, 0.3, 0.1, { emissive: 0x22c55e, emissiveIntensity: 0.55 })
        );
        screen.position.set(0, 1.35, 0.315);
        g.add(screen);
        box(g, 0, 1.66, 0.3, 0.66, 0.14, 0.04, 0xf4d35e, 0.4, 0, { emissive: 0xf4d35e, emissiveIntensity: 0.5 });
    }

    function addBeanbag(parent, x, z, color) {
        var g = groupAt(parent, x, 0, z);
        var base = new THREE.Mesh(
            new THREE.SphereGeometry(0.42, 16, 12),
            mat(color, 0.95)
        );
        base.position.set(0, 0.24, 0);
        base.scale.set(1, 0.62, 1);
        g.add(base);
        var back = new THREE.Mesh(
            new THREE.SphereGeometry(0.36, 14, 10),
            mat(color, 0.95)
        );
        back.position.set(0, 0.36, -0.18);
        back.scale.set(1, 0.9, 0.55);
        g.add(back);
    }

    function addAirConditioner(parent, x, y, z, rotY) {
        var g = groupAt(parent, x, y, z, rotY || 0);
        box(g, 0, 0, 0.13, 1.05, 0.32, 0.24, 0xf6f7f5, 0.35);
        box(g, 0, -0.03, 0.255, 0.95, 0.02, 0.01, 0xdfe3e4, 0.4);
    }

    function addBookshelf(parent, x, z, rotY) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        box(g, 0, 1, 0, 1.4, 2, 0.4, 0x6b4a32, 0.75, 0.02, { cast: true });
        var colors = [0xb54b45, 0x2f6f8f, 0xe0a43a, 0x4f8a4a, 0x6a4d8d, 0xdcd6c8];
        var shelf;
        for (shelf = 0; shelf < 3; shelf += 1) {
            var bi;
            for (bi = 0; bi < 6; bi += 1) {
                var bh = 0.26 + ((shelf * 6 + bi) % 5) * 0.03;
                box(g, -0.5 + bi * 0.2, 0.35 + shelf * 0.6 + bh / 2, 0.08, 0.14, bh, 0.26, colors[bi % 6], 0.8);
            }
        }
    }

    /* ---------- Scene ---------- */

    /** Gambar satu item mebel dari layout (dipakai bawaan & custom).
     *  Semua mebel digambar di dalam grup pembungkus yang diputar rotY,
     *  jadi rotasi dari editor berlaku untuk SEMUA jenis mebel. */
    var furnitureDeskIndex = 0;
    function addFurnitureItem(parent, item) {
        if (!item || !item.type) return;
        var x = Number(item.x) || 0;
        var z = Number(item.z) || 0;
        var rot = Number(item.rotY) || 0;
        var g = groupAt(parent, x, 0, z, rot);
        switch (item.type) {
            case 'desk': {
                var colors = [TEAL, YELLOW];
                addStartupDesk(g, 0, 0, colors[furnitureDeskIndex++ % colors.length]);
                break;
            }
            case 'workdesk': addWorkDesk(g, 0, 0, false); break;
            case 'chair': addOfficeChair(g, 0, 0, 0); break;
            case 'sofa': addSofa(g, 0, 0, 0); break;
            case 'armchair': addArmchair(g, 0, 0, 0, 0x7a6a9a); break;
            case 'beanbag': addBeanBag(g, 0, 0, ORANGE); break;
            case 'coffeetable': addCoffeeTable(g, 0, 0); break;
            case 'roundtable': addRoundLoungeTable(g, 0, 0); break;
            case 'meetingtable': addElongatedMeetingTable(g, 0, 0, 1.05, meetingSpotsAround({ x: 0, z: 0, radius: 1.05 }, (LAYOUT.meeting || []).length || 7), true); break;
            case 'pingpong': addPingPong(g, 0, 0); break;
            case 'arcade': addArcade(g, 0, 0, 0xb54b45); break;
            case 'coffeebar': addCoffeeBar(g, 0, 0); break;
            case 'pantry': addPantryCounter(g, 0, 0, 0); break;
            case 'fridge': addFridge(g, 0, 0, 0); break;
            case 'galon': addGalon(g, 0, 0, 0); break;
            case 'bookshelf': addBookshelf(g, 0, 0, 0); break;
            case 'tv': addTelevision(g, 0, 1.55, 0); break;
            case 'plant': addPlant(g, 0, 0, 0.7); break;
            case 'stool': addColorStool(g, 0, 0, TEAL); break;
            case 'tree': addTree(g, 0, 0, 1.1); break;
            case 'lamp': addStreetLamp(g, 0, 0); break;
            default: break;
        }
    }

    function buildScene() {
        WALL_H = LAYOUT.wallHeight || 2.55;
        furnitureDeskIndex = 0;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xa8d4ec);
        scene.fog = new THREE.Fog(0xa8d4ec, 40, 75);

        var ct = LAYOUT.cameraTarget;
        camera = new THREE.PerspectiveCamera(40, 1, 0.4, 160);
        orbit.target = new THREE.Vector3(ct[0], ct[1], ct[2]);
        orbit.defaults.target = [ct[0], ct[1], ct[2]];
        /* Jarak kamera awal mengikuti lebar gedung agar seluruh denah
           (mis. gedung 32,8 m denah 4 studio) masuk bingkai. */
        var bw = LAYOUT.building ? (LAYOUT.building.maxX - LAYOUT.building.minX) : 22.8;
        orbit.defaults.radius = Math.round(Math.max(34, bw * 1.28));
        orbit.spherical.radius = orbit.defaults.radius;
        applyOrbitToCamera();

        var ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
        scene.add(ambientLight);
        var key = new THREE.DirectionalLight(0xfff5e8, 1.05);
        key.position.set(8, 18, 10);
        /* Bayangan fisik (Three r160): satu directional light saja, peta
           2048, frustum pas gedung — dimatikan pada mode reduced. */
        key.castShadow = !reduced;
        if (key.shadow) {
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.camera.left = -17;
            key.shadow.camera.right = 17;
            key.shadow.camera.top = 14;
            key.shadow.camera.bottom = -14;
            key.shadow.camera.near = 2;
            key.shadow.camera.far = 48;
            key.shadow.bias = -0.0004;
            key.shadow.normalBias = 0.02;
        }
        scene.add(key);
        var fill = new THREE.DirectionalLight(0xa8c8e0, 0.4);
        fill.position.set(-10, 8, -6);
        scene.add(fill);
        var hemi = new THREE.HemisphereLight(0xd8ecff, 0x8fbc8f, 0.35);
        scene.add(hemi);
        lightRefs = { ambient: ambientLight, key: key, fill: fill, hemi: hemi };
        lightingPeriodApplied = '';
        applyLighting(true);

        roomRoot = new THREE.Group();
        scene.add(roomRoot);

        var b = LAYOUT.building;

        var cx = (b.minX + b.maxX) / 2;
        var cz = (b.minZ + b.maxZ) / 2;

        /* --- Lingkungan luar gelap (gedung melayang seperti referensi):
           tanah gelap, trotoar slate, jalan aspal gelap + marka --- */
        addFloorPlane(roomRoot, cx, -0.09, cz, 64, 44, 0x141c28, 1);
        /* Trotoar keliling gedung */
        addFloorPlane(roomRoot, cx, -0.045, cz,
            (b.maxX - b.minX) + 3.6, (b.maxZ - b.minZ) + 3.6, 0x27313f, 0.95);
        /* Jalan aspal di depan (+z) + marka putus-putus */
        var roadZ = b.maxZ + 4.6;
        addFloorPlane(roomRoot, cx, -0.04, roadZ, 64, 5.4, 0x11161f, 0.95);
        var laneX;
        for (laneX = -24; laneX <= 24; laneX += 4) {
            box(roomRoot, laneX, -0.02, roadZ, 1.8, 0.012, 0.16, 0xf5f0dc, 0.8);
        }
        /* Pohon, lampu jalan & gerobak digambar dari daftar mebel layout (bisa custom). */

        /* --- Lantai futuristik gelap ala referensi: ubin slate + grid --- */
        addFloorPlane(roomRoot, cx, 0.004, cz,
            b.maxX - b.minX, b.maxZ - b.minZ, 0x232c38, 0.85);
        var gridZ;
        for (gridZ = b.minZ + 1.1; gridZ < b.maxZ - 0.2; gridZ += 1.1) {
            box(roomRoot, cx, 0.012, gridZ, b.maxX - b.minX - 0.1, 0.006, 0.02, 0x31405a, 0.8);
        }
        var gridX;
        for (gridX = b.minX + 1.1; gridX < b.maxX - 0.2; gridX += 1.1) {
            box(roomRoot, gridX, 0.012, cz, 0.02, 0.006, b.maxZ - b.minZ - 0.1, 0x2c3a4f, 0.8);
        }
        /* Strip cahaya cyan di jalur masuk (sisi terbuka +z) */
        var glowX;
        for (glowX = -8; glowX <= 10.5; glowX += 3) {
            box(roomRoot, glowX, 0.02, b.maxZ - 0.55, 1.7, 0.014, 0.07, 0x22d3ee, 0.4, 0.1, {
                emissive: 0x22d3ee, emissiveIntensity: 0.7
            });
        }

        /* Kerangka gedung — front open for dollhouse, sekeliling FULL KACA
           (bukan tembok): belakang selalu tinggi penuh (BACK_WALL_H),
           kiri & kanan mengikuti slider tinggi dinding (WALL_H), segmen
           depan rendah sebagai railing kaca. */
        addGlassWall(roomRoot, b.minX, b.minZ, b.maxX, b.minZ, BACK_WALL_H);
        addGlassWall(roomRoot, b.minX, b.minZ, b.minX, b.maxZ);
        addGlassWall(roomRoot, b.maxX, b.minZ, b.maxX, b.maxZ);
        addGlassWall(roomRoot, b.minX, b.maxZ, b.minX + 2.2, b.maxZ, 0.5);

        /* Partisi ruangan dari layout (bisa digeser/diperpendek/dihapus di editor).
           Gaya futuristik: panel kaca + rel teal; navigasi agen tetap memakai
           data segmen layout (bukan mesh), jadi tampilan aman diubah. */
        (LAYOUT.partitions && LAYOUT.partitions.segments || []).forEach(function (seg) {
            if (seg.axis === 'h') {
                addGlassPartition(roomRoot, seg.from, seg.at, seg.to, seg.at);
            } else {
                addGlassPartition(roomRoot, seg.at, seg.from, seg.at, seg.to);
            }
        });

        /* Tanpa jendela & ornamen dinding (dihapus atas permintaan):
           dinding polos bersih, termasuk tanpa tulisan STARTUP & bingkai lukisan. */

        /* Meja kabinet rendah hard-coded di (-4.6,-3.9) DIHAPUS: meja lepas
           di luar data layout (digambar selalu, tak bisa dihapus di editor)
           yang tampak menempel/menghalangi area meja meeting di screenshot
           dan footprint-nya menimpa meja agen A3. Tumpukan buku di atasnya
           ikut dibersihkan agar tidak melayang tanpa kabinet. Tanaman lantai
           hard-coded di (-5.4,-3.85) juga dihapus: tidak ada di data layout
           dan pada denah bawaan kini menimpa area meja agen A5 — semua
           tanaman kini hanya dari daftar mebel layout. */

        /* Zona studio per departemen (pad lantai berwarna di bawah klaster meja) */
        addStudioZones(roomRoot);

        /* Work desks + colorful chairs */
        var chairColors = [TEAL, YELLOW, TEAL, YELLOW, TEAL, YELLOW, TEAL];
        LAYOUT.desks.forEach(function (d, i) {
            var di = deskInfo(d);
            addStartupDesk(roomRoot, di.x, di.z, chairColors[i % chairColors.length], di.rot);
        });
        /* Meja meeting memanjang — hanya bila belum dihapus dari layout */
        if (LAYOUT.meetingTable && LAYOUT.meetingTable.enabled !== false) {
            addElongatedMeetingTable(roomRoot, LAYOUT.meetingTable.x, LAYOUT.meetingTable.z, LAYOUT.meetingTable.radius, LAYOUT.meeting);
        }
        /* Semua mebel lain dari layout (bawaan atau custom dari Layout Kantor).
           Tanpa lampu gantung & gerobak (dihapus atas permintaan). */
        (LAYOUT.furniture || []).forEach(function (item) {
            addFurnitureItem(roomRoot, item);
        });

        spawnCat();
    }

    function addLowCabinet(parent, x, z, w) {
        box(parent, x, 0.35, z, w, 0.7, 0.45, 0xe8d5b5, 0.5);
        box(parent, x, 0.72, z, w + 0.04, 0.04, 0.48, 0xddc49a, 0.45);
    }

    function addBookStack(parent, x, z) {
        box(parent, x, 0.82, z, 0.28, 0.08, 0.2, 0x3b82f6, 0.7);
        box(parent, x, 0.9, z, 0.26, 0.07, 0.18, 0xf97316, 0.7);
        box(parent, x, 0.97, z, 0.24, 0.06, 0.16, 0xeab308, 0.7);
    }

    function addStartupDesk(parent, x, z, seatColor, rotY) {
        /* Workstation ala referensi: meja biru royal rangka-U dengan LED
           strip putih menyala di tepi, satu monitor ultrawide memanjang,
           PC tower di bawah meja, kursi ergonomis biru.
           Agen duduk di sisi -z menghadap +z: keyboard dekat agen (-z),
           monitor lebih jauh (+z) dengan layar menghadap agen (-z). */
        var g = groupAt(parent, x, 0, z, rotY || 0);
        var BLUE = 0x2242c8;
        var LED = { emissive: 0xf8fafc, emissiveIntensity: 1.25 };
        /* Permukaan meja biru matte + panel kaki samping (rangka U) */
        box(g, 0, 0.73, 0, 1.5, 0.06, 0.7, BLUE, 0.38, 0.08, { cast: true });
        box(g, -0.69, 0.36, 0, 0.07, 0.72, 0.64, BLUE, 0.38, 0.08);
        box(g, 0.69, 0.36, 0, 0.07, 0.72, 0.64, BLUE, 0.38, 0.08);
        /* LED strip putih: tepi depan permukaan + turun di kedua kaki depan */
        box(g, 0, 0.715, 0.352, 1.5, 0.016, 0.016, 0xf8fafc, 0.4, 0.1, LED);
        box(g, -0.69, 0.37, 0.328, 0.016, 0.68, 0.016, 0xf8fafc, 0.4, 0.1, LED);
        box(g, 0.69, 0.37, 0.328, 0.016, 0.68, 0.016, 0xf8fafc, 0.4, 0.1, LED);
        /* Alas meja (desk mat) gelap + manajemen kabel tersembunyi */
        box(g, 0, 0.763, 0.03, 1.0, 0.01, 0.36, 0x0d1120, 0.6, 0.05);
        box(g, 0, 0.6, 0.27, 0.9, 0.08, 0.06, 0x0d1120, 0.5, 0.2);
        /* PC tower hitam di bawah meja kanan + slit LED cyan */
        box(g, 0.44, 0.31, -0.02, 0.22, 0.56, 0.46, 0x0b0e14, 0.4, 0.3);
        box(g, 0.44, 0.34, 0.212, 0.014, 0.34, 0.008, 0x22d3ee, 0.4, 0.1, {
            emissive: 0x22d3ee, emissiveIntensity: 1.0
        });
        /* Satu monitor ultrawide memanjang (layar dashboard menyala) */
        box(g, 0, 0.86, 0.18, 0.05, 0.22, 0.05, 0x11151c, 0.35, 0.5);
        box(g, 0, 0.766, 0.18, 0.2, 0.012, 0.14, 0x11151c, 0.35, 0.5);
        box(g, 0, 1.03, 0.17, 1.18, 0.36, 0.018, 0x0a0d13, 0.25, 0.4);
        box(g, 0, 1.03, 0.158, 1.12, 0.32, 0.006, 0x38bdf8, 0.3, 0.05, {
            emissive: 0x38bdf8, emissiveIntensity: 0.6
        });
        /* Keyboard + mouse gelap di depan agen */
        box(g, 0, 0.766, -0.14, 0.46, 0.014, 0.17, 0x11151c, 0.4, 0.3);
        box(g, 0.33, 0.766, -0.14, 0.06, 0.012, 0.1, 0x11151c, 0.4, 0.3);
        /* Kursi ergonomis biru — sisi yang sama dengan posisi duduk agen */
        addFutureChair(g, 0, -0.68, 0, seatColor);
        addPlant(g, 0.6, 0.2, 0.32);
    }

    function addCoffeeBar(parent, x, z) {
        box(parent, x, 0.45, z, 2.2, 0.9, 0.55, 0xe8d5b5, 0.5);
        box(parent, x, 0.92, z, 2.25, 0.05, 0.58, 0xf5e6c8, 0.4);
        /* Espresso machine */
        box(parent, x + 0.55, 1.2, z, 0.35, 0.5, 0.28, 0x1f2937, 0.45);
        box(parent, x + 0.55, 1.42, z + 0.05, 0.2, 0.08, 0.12, 0x374151, 0.5);
        /* Mugs */
        cyl(parent, x - 0.35, 1.02, z + 0.05, 0.06, 0.1, 0xffffff, 0.5);
        cyl(parent, x - 0.55, 1.02, z + 0.05, 0.06, 0.1, 0xffffff, 0.5);
        addPlant(parent, x - 0.85, z, 0.4);
    }

    function addColorStool(parent, x, z, color) {
        var g = new THREE.Group();
        g.position.set(x, 0, z);
        box(g, 0, 0.5, 0, 0.06, 1.0, 0.06, 0xf8fafc, 0.4);
        box(g, 0, 1.05, 0, 0.34, 0.07, 0.34, color, 0.65);
        parent.add(g);
    }

    function addBeanBag(parent, x, z, color) {
        var g = new THREE.Group();
        g.position.set(x, 0, z);
        var bag = new THREE.Mesh(
            THREE.SphereGeometry
                ? new THREE.SphereGeometry(0.42, 14, 10)
                : new THREE.BoxGeometry(0.7, 0.45, 0.7),
            mat(color, 0.85, 0.02)
        );
        bag.position.y = 0.28;
        bag.scale.set(1.15, 0.72, 1.05);
        g.add(bag);
        parent.add(g);
    }

    function addRoundLoungeTable(parent, x, z) {
        cyl(parent, x, 0.38, z, 0.42, 0.06, 0xe8d5b5, 0.5);
        cyl(parent, x, 0.18, z, 0.08, 0.36, 0xf8fafc, 0.4);
        cyl(parent, x - 0.12, 0.48, z, 0.05, 0.08, 0xffffff, 0.5);
        cyl(parent, x + 0.12, 0.48, z, 0.05, 0.08, 0xffffff, 0.5);
        addPlant(parent, x, z + 0.05, 0.28);
    }

    /* ---------- Characters (robot chibi glossy — prosedural, tanpa model/teksur eksternal) ----------
     * Referensi: kepala bulat sangat besar, visor hitam mengkilap, mata ring menyala,
     * ear-pod samping, badan putih kecil, sendi & tangan hitam.
     * Hemat memori: SEMUA geometri + material bodi dibuat SEKALI (cache modul
     * `robotAssets`) lalu dipakai bersama oleh 7 agen. Per agen hanya dibuat
     * 1 material aksen (mata/ear-pod/garis dada — mengikuti warna peran, sekaligus
     * disimpan sebagai `bodyMat` agar syncCharacter tetap bekerja) + 1 material
     * aura status. Geometri/material bersama ditandai `sharedAsset` agar
     * disposeObject tidak membuangnya saat satu agen dihapus. */

    var robotAssets = null;

    function getRobotAssets() {
        if (robotAssets) return robotAssets;
        function sharedGeo(geo) { geo.userData.sharedAsset = true; return geo; }
        function sharedMat(m) { m.userData.sharedAsset = true; return m; }
        function capsule(r, len, seg) {
            return THREE.CapsuleGeometry
                ? new THREE.CapsuleGeometry(r, len, 4, seg || 10)
                : new THREE.CylinderGeometry(r, r, len + r * 2, seg || 10);
        }
        /* Geometri lengan/kaki digeser sekali di sini: titik putar (pivot)
           berada di bahu/pinggul, mesh menjulur ke bawah — sama seperti
           kontrak createLimb lama yang dirotasikan kode animasi. */
        var armGeo = capsule(0.048, 0.3, 10); armGeo.translate(0, -0.19, 0);
        var legGeo = capsule(0.06, 0.22, 10); legGeo.translate(0, -0.16, 0);

        robotAssets = {
            geo: {
                skull: sharedGeo(new THREE.SphereGeometry(0.34, 24, 18)),
                visor: sharedGeo(new THREE.SphereGeometry(0.3, 24, 18)),
                visorRim: sharedGeo(new THREE.TorusGeometry(0.252, 0.009, 8, 32)),
                eyeRing: sharedGeo(new THREE.TorusGeometry(0.055, 0.013, 8, 20)),
                strip: sharedGeo(new THREE.BoxGeometry(0.13, 0.028, 0.012)),
                earOuter: sharedGeo(new THREE.CylinderGeometry(0.095, 0.095, 0.055, 20)),
                earInner: sharedGeo(new THREE.CylinderGeometry(0.056, 0.056, 0.06, 16)),
                torso: sharedGeo(capsule(0.21, 0.22, 14)),
                pelvis: sharedGeo(new THREE.SphereGeometry(0.185, 18, 12)),
                neck: sharedGeo(new THREE.CylinderGeometry(0.068, 0.078, 0.1, 12)),
                joint: sharedGeo(new THREE.SphereGeometry(0.068, 12, 10)),
                arm: sharedGeo(armGeo),
                leg: sharedGeo(legGeo),
                foot: sharedGeo(new THREE.SphereGeometry(0.09, 14, 10)),
                aura: sharedGeo(new THREE.RingGeometry(0.32, 0.42, 28))
            },
            mats: {
                /* Putih glossy (kesan realistis dari pantulan lampu scene yang
                   sudah ada — tanpa lampu tambahan per agen). */
                white: sharedMat(mat(0xf7f9fb, 0.3, 0.02)),
                dark: sharedMat(mat(0x171a1e, 0.62, 0.08)),
                visor: sharedMat(mat(0x05080c, 0.12, 0.12))
            }
        };
        return robotAssets;
    }

    function robotPart(geo, material, x, y, z) {
        var mesh = new THREE.Mesh(geo, material);
        mesh.position.set(x || 0, y || 0, z || 0);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    function createRobotArm(assets, side) {
        var arm = new THREE.Group();
        arm.add(robotPart(assets.geo.joint, assets.mats.dark, 0, 0, 0));
        arm.add(robotPart(assets.geo.arm, assets.mats.white, 0, 0, 0));
        var elbow = robotPart(assets.geo.joint, assets.mats.dark, 0, -0.26, 0);
        elbow.scale.setScalar(0.72);
        arm.add(elbow);
        var hand = robotPart(assets.geo.joint, assets.mats.dark, 0, -0.44, 0);
        hand.scale.set(0.85, 1, 0.85);
        arm.add(hand);
        arm.position.set(0.27 * side, 1.02, 0);
        return arm;
    }

    function createRobotLeg(assets, side) {
        var leg = new THREE.Group();
        leg.add(robotPart(assets.geo.joint, assets.mats.dark, 0, 0, 0));
        leg.add(robotPart(assets.geo.leg, assets.mats.white, 0, 0, 0));
        var foot = robotPart(assets.geo.foot, assets.mats.white, 0, -0.44, 0.035);
        foot.scale.set(1, 0.58, 1.45);
        leg.add(foot);
        leg.position.set(0.1 * side, 0.54, 0);
        return leg;
    }

    /* Nama dipertahankan (dipanggil layoutCharacters): kini membangun robot.
       `look` lama (rambut/kulit/celana) tak lagi dipakai — identitas agen kini
       dari warna aksen peran; parameter dibiarkan agar pemanggil tak berubah. */
    function createHumanoid(colorHex, look) { // eslint-disable-line no-unused-vars
        var assets = getRobotAssets();
        var root = new THREE.Group();
        /* Satu-satunya material unik per agen: aksen menyala warna peran. */
        var bodyMat = mat(colorHex, 0.35, 0.02, {
            emissive: colorHex, emissiveIntensity: 1.35
        });

        var body = new THREE.Group();
        body.name = 'body';
        root.add(body);

        /* Pinggul + torso putih ramping */
        var pelvis = robotPart(assets.geo.pelvis, assets.mats.white, 0, 0.58, 0);
        pelvis.scale.set(1.05, 0.72, 0.85);
        body.add(pelvis);

        var torso = new THREE.Group();
        torso.name = 'torso';
        torso.position.y = 0.88;
        var chest = robotPart(assets.geo.torso, assets.mats.white, 0, 0, 0);
        chest.scale.set(1, 1, 0.82);
        chest.castShadow = true;
        torso.add(chest);
        /* Garis aksen menyala di dada (warna peran) */
        torso.add(robotPart(assets.geo.strip, bodyMat, 0, 0.07, 0.168));
        body.add(torso);

        var neck = robotPart(assets.geo.neck, assets.mats.dark, 0, 1.13, 0);
        body.add(neck);

        /* Kepala robot: grup (diputar kode animasi lewat parts.head) */
        var head = new THREE.Group();
        head.name = 'head';
        head.position.y = 1.44;
        var skull = robotPart(assets.geo.skull, assets.mats.white, 0, 0, 0);
        skull.scale.set(1, 0.94, 0.96);
        skull.castShadow = true;
        head.add(skull);
        var visor = robotPart(assets.geo.visor, assets.mats.visor, 0, -0.03, 0.115);
        visor.scale.set(0.86, 0.74, 0.72);
        head.add(visor);
        var rim = robotPart(assets.geo.visorRim, bodyMat, 0, -0.03, 0.312);
        rim.scale.set(1, 0.85, 1);
        head.add(rim);
        [-1, 1].forEach(function (side) {
            head.add(robotPart(assets.geo.eyeRing, bodyMat, 0.105 * side, 0.015, 0.318));
            var ear = robotPart(assets.geo.earOuter, assets.mats.dark, 0.335 * side, 0.02, 0);
            ear.rotation.z = Math.PI / 2;
            head.add(ear);
            var earGlow = robotPart(assets.geo.earInner, bodyMat, 0.345 * side, 0.02, 0);
            earGlow.rotation.z = Math.PI / 2;
            head.add(earGlow);
        });
        /* Mulut kecil di visor */
        var mouth = robotPart(assets.geo.strip, bodyMat, 0, -0.125, 0.3);
        mouth.scale.set(0.35, 0.4, 1);
        head.add(mouth);
        body.add(head);

        var leftArm = createRobotArm(assets, -1);
        leftArm.name = 'leftArm';
        body.add(leftArm);
        var rightArm = createRobotArm(assets, 1);
        rightArm.name = 'rightArm';
        body.add(rightArm);

        var leftLeg = createRobotLeg(assets, -1);
        leftLeg.name = 'leftLeg';
        body.add(leftLeg);
        var rightLeg = createRobotLeg(assets, 1);
        rightLeg.name = 'rightLeg';
        body.add(rightLeg);

        var aura = new THREE.Mesh(
            assets.geo.aura,
            new THREE.MeshBasicMaterial({
                color: STATUS_AURA.idle,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.02;
        aura.name = 'aura';
        root.add(aura);

        root.userData = {
            roleId: null,
            status: 'idle',
            seat: 0,
            phase: Math.random() * Math.PI * 2,
            path: [],
            targetFacing: 0,
            placementKey: '',
            placement: null,
            bodyMat: bodyMat,
            parts: {
                leftArm: leftArm, rightArm: rightArm, leftLeg: leftLeg, rightLeg: rightLeg,
                aura: aura, torso: torso, head: head, body: body
            }
        };
        return root;
    }

    function hashName(name) {
        var hash = 2166136261;
        var s = String(name || '');
        var i;
        for (i = 0; i < s.length; i += 1) {
            hash ^= s.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function agentLook(id, avatarColor) {
        var HAIR = [0x1d293c, 0xb54b45, 0x6a4d8d, 0x3b2a20, 0xc9a24a, 0x2f4f3a];
        var SKIN = [0xe9b57d, 0xc98e5a, 0xf1c9a0, 0xa8714a, 0xdca06e];
        var PANTS = [0x36475d, 0x374052, 0x344349, 0x4a3b2f];
        var hash = hashName(id);
        return {
            hair: HAIR[hash % HAIR.length],
            skin: SKIN[(hash >>> 4) % SKIN.length],
            pants: PANTS[(hash >>> 12) % PANTS.length],
            shirt: avatarColor || '#0d9488'
        };
    }

    function syncCharacter(ch, emp) {
        var ud = ch.userData;
        ud.roleId = emp.id;
        ud.status = emp.status || 'idle';
        ud.bodyMat.color.set(emp.avatarColor || '#0d9488');
        /* Aksen robot menyala: samakan emissive dengan warna peran terbaru. */
        if (ud.bodyMat.emissive) ud.bodyMat.emissive.set(emp.avatarColor || '#0d9488');
        var auraColor = STATUS_AURA[ud.status] || STATUS_AURA.idle;
        ud.parts.aura.material.color.setHex(auraColor);
        ud.parts.aura.material.opacity = ud.status === 'idle' ? 0.35 : 0.7;
    }

    function setDestination(ch, placement) {
        var ud = ch.userData;
        var key = [placement.x, placement.z, placement.activity, placement.pose].join('|');
        if (ud.placementKey === key) {
            ud.placement = placement;
            return;
        }
        var fromX = ch.position.x;
        var fromZ = ch.position.z;
        var dist = Math.hypot(placement.x - fromX, placement.z - fromZ);
        ud.placementKey = key;
        ud.placement = placement;
        ud.targetFacing = placement.facing || 0;
        if (dist < 0.18 || reduced) {
            ch.position.x = placement.x;
            ch.position.z = placement.z;
            ud.path = [];
            return;
        }
        ud.path = aislePath(fromX, fromZ, placement.x, placement.z);
    }

    function roleBadge(emp) {
        /* Black role chip mirrors Ruang (role id / short slug). */
        return String(emp.id || emp.name || 'agent').slice(0, 16);
    }

    function setFocusedRole(roleId) {
        focusedRoleId = roleId || null;
        labelEls.forEach(function (el) {
            el.classList.toggle('is-focused', !!focusedRoleId && el.dataset.roleId === focusedRoleId);
        });
        if (catLabelEl) catLabelEl.classList.remove('is-focused');
        return focusedRoleId;
    }

    function createZoneLabels() {
        zoneLabelEls = [];
        if (!labelsRoot) return;
        studioZones.forEach(function (zone) {
            var el = document.createElement('div');
            el.className = 'office-3d-zone-label';
            el.dataset.studio = zone.id;
            el.textContent = zone.studio.toUpperCase();
            el.style.display = 'none';
            labelsRoot.appendChild(el);
            zoneLabelEls.push(el);
        });
    }

    function rebuildLabels(employees) {
        if (!labelsRoot) return;
        labelsRoot.innerHTML = '';
        labelEls = [];
        zoneLabelEls = [];
        catLabelEl = null;
        /* Pilihan agen untuk kamera follow/first-person ikut daftar karyawan. */
        var camAgentSel = container ? container.querySelector('#office-3d-cam-agent') : null;
        if (camAgentSel) {
            var prevAgent = camAgentSel.value;
            camAgentSel.innerHTML = employees.map(function (emp) {
                return '<option value="' + escapeHtml(emp.id) + '">' + escapeHtml(emp.name || emp.id) + '</option>';
            }).join('');
            camAgentSel.value = employees.some(function (e) { return e.id === prevAgent; })
                ? prevAgent
                : (followRoleId || (employees[0] && employees[0].id) || '');
        }

        employees.forEach(function (emp) {
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'office-3d-label';
            el.dataset.roleId = emp.id;
            if (focusedRoleId && emp.id === focusedRoleId) el.classList.add('is-focused');
            el.innerHTML =
                '<span class="office-3d-action hidden" aria-hidden="true"></span>' +
                '<span class="office-3d-status-pill" data-status="' + escapeHtml(emp.status || 'idle') + '">' +
                escapeHtml(STATUS_LABEL[emp.status] || emp.status || 'Idle') +
                '</span>' +
                '<span class="office-3d-role-badge">' + escapeHtml(roleBadge(emp)) + '</span>';
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                setFocusedRole(emp.id);
                if (typeof onSelect === 'function') onSelect(emp.id);
            });
            labelsRoot.appendChild(el);
            labelEls.push(el);
        });

        var catEl = document.createElement('button');
        catEl.type = 'button';
        catEl.className = 'office-3d-label office-3d-cat-label';
        catEl.dataset.cat = '1';
        catEl.innerHTML =
            '<span class="office-3d-action hidden" aria-hidden="true"></span>' +
            '<span class="office-3d-status-pill" data-status="cat">🐱 ' + CAT_NAME + '</span>';
        catEl.addEventListener('click', function (e) {
            e.stopPropagation();
            petCat();
        });
        labelsRoot.appendChild(catEl);
        catLabelEl = catEl;

        createZoneLabels();
    }

    /* Prioritas penempatan label: terfokus → status aktif → selesai/siaga → idle. */
    function labelPriority(ch) {
        if (focusedRoleId && ch.userData.roleId === focusedRoleId) return 0;
        var st = ch.userData.status || 'idle';
        if (st === 'working' || st === 'needs_info' || st === 'awaiting_approval' || st === 'failed') return 1;
        if (st === 'done' || st === 'standby') return 2;
        return 3;
    }

    function updateLabelPositions() {
        if (!labelsRoot || !camera || !renderer) return;
        if (!_scratchV) { _scratchV = new THREE.Vector3(); _scratchV2 = new THREE.Vector3(); }
        var rect = renderer.domElement.getBoundingClientRect();
        /* Zoom jauh (radius besar) = mode overview: label ringkas, teks aksi
           hanya untuk label prioritas; dekat = detail penuh. */
        var overview = !cameraTour.active && cameraMode === 'orbit' && orbit.spherical.radius > 26;
        labelsRoot.classList.toggle('is-overview', overview);

        /* Urutan penempatan deterministik berdasarkan prioritas — label penting
           menempati posisi alaminya, label lain digeser ke atas / disembunyikan
           (overview) bila bertabrakan. Tidak ada DOM baru per frame. */
        var order = characters.map(function (ch, i) { return i; });
        order.sort(function (a, b) {
            return labelPriority(characters[a]) - labelPriority(characters[b]) || a - b;
        });
        var placed = [];
        var labelW = overview ? 88 : 118;
        var labelH = overview ? 26 : 46;

        function claim(x, y, allowHide) {
            var tries = [0, -labelH - 6, -2 * (labelH + 6)];
            for (var ti = 0; ti < tries.length; ti += 1) {
                var cy = y + tries[ti];
                if (cy - labelH < 24) continue;
                var hit = false;
                for (var pi = 0; pi < placed.length; pi += 1) {
                    var p = placed[pi];
                    if (Math.abs(p.x - x) < (p.w + labelW) / 2 && Math.abs(p.y - cy) < (p.h + labelH) / 2) { hit = true; break; }
                }
                if (!hit) {
                    placed.push({ x: x, y: cy, w: labelW, h: labelH });
                    return cy;
                }
            }
            return allowHide ? null : y - 2 * (labelH + 6);
        }

        order.forEach(function (i) {
            var ch = characters[i];
            var el = labelEls[i];
            if (!el || !ch) return;
            _scratchV.copy(ch.position);
            _scratchV.y = 2.05;
            _scratchV.project(camera);
            if (_scratchV.z >= 1) {
                el.style.display = 'none';
                return;
            }
            var x = (_scratchV.x * 0.5 + 0.5) * rect.width;
            var y = (-_scratchV.y * 0.5 + 0.5) * rect.height;
            x = Math.min(rect.width - labelW / 2 - 4, Math.max(labelW / 2 + 4, x));
            y = Math.min(rect.height - 4, Math.max(labelH + 26, y));

            var st = ch.userData.status || 'idle';
            var focused = focusedRoleId && ch.userData.roleId === focusedRoleId;
            var cy = claim(x, y, overview && !focused);
            if (cy == null) {
                el.style.display = 'none';
                return;
            }
            el.style.display = 'flex';
            el.style.transform = 'translate(-50%, -100%) translate(' + x.toFixed(1) + 'px, ' + cy.toFixed(1) + 'px)';
            el.style.zIndex = focused ? '5' : String(4 - labelPriority(ch));

            var pill = el.querySelector('.office-3d-status-pill');
            if (pill && pill.dataset.status !== st) {
                pill.dataset.status = st;
                pill.textContent = STATUS_LABEL[st] || st;
            }

            var placement = ch.userData.placement;
            var actionEl = el.querySelector('.office-3d-action');
            if (actionEl) {
                var text = placement && placement.speech ? placement.speech : '';
                /* Overview: teks aksi hanya untuk agen terfokus / berstatus aktif. */
                if (text && (!overview || focused || labelPriority(ch) <= 1)) {
                    if (actionEl.textContent !== text) actionEl.textContent = text;
                    actionEl.classList.remove('hidden');
                    actionEl.classList.toggle('is-idle', st === 'idle');
                } else {
                    actionEl.textContent = '';
                    actionEl.classList.add('hidden');
                }
            }
        });

        if (catLabelEl && cat && cat.group) {
            _scratchV2.copy(cat.group.position);
            _scratchV2.y = 1.05;
            _scratchV2.project(camera);
            if (_scratchV2.z >= 1) {
                catLabelEl.style.display = 'none';
            } else {
                var cx = (_scratchV2.x * 0.5 + 0.5) * rect.width;
                var cy2 = (-_scratchV2.y * 0.5 + 0.5) * rect.height;
                cx = Math.min(rect.width - 48, Math.max(48, cx));
                cy2 = Math.min(rect.height - 4, Math.max(50, cy2));
                catLabelEl.style.display = 'flex';
                catLabelEl.style.transform = 'translate(-50%, -100%) translate(' + cx.toFixed(1) + 'px, ' + cy2.toFixed(1) + 'px)';
                var catAction = catLabelEl.querySelector('.office-3d-action');
                if (catAction) {
                    var catText = overview ? '' : catStateText(Date.now());
                    if (catAction.textContent !== catText) catAction.textContent = catText;
                    catAction.classList.toggle('hidden', !catText);
                }
            }
        }

        /* Label zona studio: hanya mode overview, tanpa interaksi (CSS
           pointer-events:none) — diproyeksikan dari jangkar lantai zona. */
        if (zoneLabelEls.length !== studioZones.length && labelsRoot) createZoneLabels();
        zoneLabelEls.forEach(function (el, zi) {
            var zone = studioZones[zi];
            if (!zone || !overview) { el.style.display = 'none'; return; }
            _scratchV.set(zone.cx, 0.05, zone.cz);
            _scratchV.project(camera);
            if (_scratchV.z >= 1) { el.style.display = 'none'; return; }
            var zx = (_scratchV.x * 0.5 + 0.5) * rect.width;
            var zy = (-_scratchV.y * 0.5 + 0.5) * rect.height;
            zx = Math.min(rect.width - 40, Math.max(40, zx));
            zy = Math.min(rect.height - 10, Math.max(30, zy));
            el.style.display = 'block';
            el.style.transform = 'translate(-50%, -50%) translate(' + zx.toFixed(1) + 'px, ' + zy.toFixed(1) + 'px)';
        });
    }

    function updateHud() {
        if (!hudRoot && container) {
            hudRoot = container.querySelector('#office-3d-hud') || container.querySelector('.office-3d-hud');
        }
        if (!hudRoot) return;
        var list = employeesCache;
        var total = list.length;
        var active = list.filter(function (e) {
            var s = e.status || 'idle';
            return s === 'working' || s === 'needs_info' || s === 'awaiting_approval';
        }).length;
        var running = list.filter(function (e) { return e.status === 'working'; }).length;
        var open = list.filter(function (e) {
            return e.status === 'needs_info' || e.status === 'awaiting_approval';
        }).length;
        var crewEl = hudRoot.querySelector('[data-hud="crew"]');
        var tasksEl = hudRoot.querySelector('[data-hud="tasks"]');
        if (crewEl) crewEl.textContent = active + '/' + total;
        if (tasksEl) {
            tasksEl.textContent = running + ' running · ' + open + ' open';
        }
    }

    function applyPose(ch, t, walking) {
        var ud = ch.userData;
        var parts = ud.parts;
        var placement = ud.placement || {};
        var pose = placement.pose || 'stand';
        var activity = placement.activity || 'idle';
        var seated = !!placement.seated && !walking;

        /* Kepala robot besar: reset dulu agar tak mewarisi putaran pose sebelumnya
           (pose thinking/review/waiting menimpanya lagi di bawah). */
        parts.head.rotation.y = 0;
        parts.head.rotation.x = 0;
        if (walking) {
            var swing = Math.sin(t * 10 + ud.phase) * 0.55;
            parts.head.rotation.y = Math.sin(t * 5 + ud.phase) * 0.06;
            parts.leftLeg.rotation.x = swing;
            parts.rightLeg.rotation.x = -swing;
            parts.leftArm.rotation.x = -swing * 0.85;
            parts.rightArm.rotation.x = swing * 0.85;
            parts.body.position.y = Math.abs(Math.sin(t * 10 + ud.phase)) * 0.02;
            parts.torso.rotation.z = 0;
            return;
        }

        if (pose === 'slump' || activity === 'failed') {
            /* Blocked/gagal: bahu jatuh + kepala menunduk — beda jelas dari idle. */
            parts.leftArm.rotation.x = 0.35;
            parts.rightArm.rotation.x = 0.35;
            parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.body.position.y = seated ? -0.12 : 0;
            parts.head.rotation.x = 0.3;
            parts.torso.rotation.z = -0.1;
            return;
        }

        if (pose === 'cheer' || activity === 'done') {
            parts.leftArm.rotation.x = -1.4;
            parts.rightArm.rotation.x = -1.2 + Math.sin(t * 4) * 0.15;
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            parts.body.position.y = Math.abs(Math.sin(t * 3)) * 0.04;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'work') {
            /* Mengetik: ayunan lengan kecil bergantian per fase agen (tidak
               sinkron antaragen), kepala sedikit menunduk ke layar/keyboard. */
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = -1.02 + Math.sin(t * 9 + ud.phase) * 0.07;
            parts.rightArm.rotation.x = -1.02 + Math.cos(t * 10.5 + ud.phase) * 0.08;
            parts.head.rotation.x = 0.14;
            parts.head.rotation.y = Math.sin(t * 0.8 + ud.phase) * 0.05;
            parts.body.position.y = -0.14;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'review' || activity === 'needs_info') {
            /* Review: satu tangan terangkat membaca, kepala memindai perlahan. */
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = -0.35;
            parts.rightArm.rotation.x = -1.15;
            parts.head.rotation.x = 0.08;
            parts.head.rotation.y = Math.sin(t * 1.4 + ud.phase) * 0.25;
            parts.body.position.y = -0.14;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'coffee') {
            /* Minum: tangan kanan naik ke mulut berkala, tangan kiri santai. */
            parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.leftArm.rotation.x = -0.25;
            parts.rightArm.rotation.x = -1.85 + Math.sin(t * 1.1 + ud.phase) * 0.22;
            parts.head.rotation.y = Math.sin(t * 0.8 + ud.phase) * 0.1;
            parts.body.position.y = seated ? -0.14 : 0;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'phone') {
            /* Telepon: tangan kanan di telinga, kepala sedikit miring. */
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            parts.leftArm.rotation.x = -0.3 + Math.sin(t * 1.6 + ud.phase) * 0.06;
            parts.rightArm.rotation.x = -2.25;
            parts.head.rotation.y = Math.sin(t * 1.2 + ud.phase) * 0.08;
            parts.body.position.y = Math.sin(t * 1.6 + ud.phase) * 0.006;
            parts.torso.rotation.z = 0.05;
            return;
        }

        if (activity === 'stretch') {
            /* Peregangan: kedua tangan ke atas dengan ayunan halus. */
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            parts.leftArm.rotation.x = -2.65 + Math.sin(t * 1.8 + ud.phase) * 0.12;
            parts.rightArm.rotation.x = -2.5 - Math.sin(t * 1.8 + ud.phase) * 0.12;
            parts.head.rotation.y = 0;
            parts.body.position.y = Math.abs(Math.sin(t * 1.8 + ud.phase)) * 0.02;
            parts.torso.rotation.z = Math.sin(t * 0.9 + ud.phase) * 0.04;
            return;
        }

        if (activity === 'chat' || activity === 'social' || activity === 'game' || activity === 'arcade') {
            parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.leftArm.rotation.x = -0.45 + Math.sin(t * 3.2) * 0.28;
            parts.rightArm.rotation.x = -0.2;
            parts.body.position.y = seated ? -0.14 : Math.abs(Math.sin(t * 5)) * 0.025;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'thinking') {
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = -0.9;
            parts.rightArm.rotation.x = -1.5;
            parts.head.rotation.y = Math.sin(t * 0.9 + ud.phase) * 0.18;
            parts.body.position.y = -0.14 + Math.sin(t * 2) * 0.01;
            parts.torso.rotation.z = 0.04;
            return;
        }

        if (activity === 'waiting') {
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = -0.25;
            parts.rightArm.rotation.x = -0.25;
            parts.head.rotation.y = Math.sin(t * 0.7 + ud.phase) * 0.3;
            parts.body.position.y = -0.14;
            parts.torso.rotation.z = 0;
            return;
        }

        if (pose === 'tired' || activity === 'overloaded') {
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = 0.5;
            parts.rightArm.rotation.x = 0.5;
            parts.head.rotation.y = 0;
            parts.body.position.y = -0.18 + Math.sin(t * 1.2) * 0.008;
            parts.torso.rotation.z = -0.14;
            return;
        }

        var breathe = Math.sin(t * 2 + ud.phase) * 0.015;
        parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
        parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
        parts.leftArm.rotation.x = Math.sin(t * 1.4 + ud.phase) * 0.08;
        parts.rightArm.rotation.x = -Math.sin(t * 1.4 + ud.phase) * 0.08;
        parts.body.position.y = (seated ? -0.14 : 0) + breathe;
        parts.head.rotation.y = Math.sin(t * 0.6 + ud.phase) * 0.12;
        parts.torso.rotation.z = 0;
    }

    function animateCharacter(ch, t, dt) {
        var ud = ch.userData;
        var walking = false;

        if (ud.path && ud.path.length) {
            var next = ud.path[0];
            var dx = next.x - ch.position.x;
            var dz = next.z - ch.position.z;
            var dist = Math.hypot(dx, dz);
            if (dist < 0.05) {
                ud.path.shift();
            } else {
                var step = Math.min(dist, dt * WALK_SPEED);
                var mx = (dx / dist) * step;
                var mz = (dz / dist) * step;
                /* Steering pemisah: menjauh halus dari robot lain di sekitar. */
                var sx = 0;
                var sz = 0;
                characters.forEach(function (o) {
                    if (o === ch) return;
                    var ox = ch.position.x - o.position.x;
                    var oz = ch.position.z - o.position.z;
                    var od = Math.hypot(ox, oz);
                    if (od > 0.001 && od < 0.95) {
                        var push = (0.95 - od) * step * 1.35;
                        sx += (ox / od) * push;
                        sz += (oz / od) * push;
                    }
                });
                /* Coba gerak penuh, lalu geser sumbu X saja / Z saja bila
                   kandidat menabrak furnitur atau terlalu dekat robot lain. */
                var tries = [
                    [mx + sx, mz + sz],
                    [mx, mz],
                    [mx + sx, 0],
                    [0, mz + sz],
                    [-(mz + sz) * 0.7, (mx + sx) * 0.7]
                ];
                var moved = false;
                for (var ti = 0; ti < tries.length; ti += 1) {
                    var nx = ch.position.x + tries[ti][0];
                    var nz = ch.position.z + tries[ti][1];
                    if (Math.hypot(tries[ti][0], tries[ti][1]) < 0.001) continue;
                    if (navPositionFree(ch, nx, nz)) {
                        ch.position.x = nx;
                        ch.position.z = nz;
                        moved = true;
                        break;
                    }
                }
                /* Semua arah buntu (robot lain menghalangi): menunggu di tempat
                   dengan pose berdiri, bukan memaksa menembus. Bila buntu
                   >0,6 dtk, hitung jalur baru yang mengelilingi robot lain. */
                walking = moved;
                if (!moved) {
                    ud.blockedFor = (ud.blockedFor || 0) + dt;
                    if (ud.blockedFor > 0.6 && ud.placement) {
                        ud.blockedFor = 0;
                        var extra = [];
                        characters.forEach(function (o) {
                            if (o !== ch) extra.push({ x: o.position.x, z: o.position.z, r: 0.26 });
                        });
                        var repath = navPath(ch.position.x, ch.position.z, ud.placement.x, ud.placement.z, extra);
                        if (repath && repath.length) ud.path = repath;
                    }
                } else {
                    ud.blockedFor = 0;
                }
                if (moved) {
                    /* Putaran menghadap berbasis delta-time: kecepatan putar
                       sama di semua frame rate (dulu faktor tetap per frame). */
                    var heading = Math.atan2(dx, dz);
                    var dy = heading - ch.rotation.y;
                    while (dy > Math.PI) dy -= Math.PI * 2;
                    while (dy < -Math.PI) dy += Math.PI * 2;
                    ch.rotation.y += dy * Math.min(1, (dt || 0.016) * 11);
                }
            }
        }

        if (!walking) {
            var dy2 = (ud.targetFacing || 0) - ch.rotation.y;
            while (dy2 > Math.PI) dy2 -= Math.PI * 2;
            while (dy2 < -Math.PI) dy2 += Math.PI * 2;
            ch.rotation.y += dy2 * Math.min(1, (dt || 0.016) * 7);
        }

        applyPose(ch, t, walking);
        /* Tinggi duduk mengikuti furnitur (bean bag rendah, stool tinggi). */
        var seatTargetY = (!walking && ud.placement && ud.placement.seated) ? (Number(ud.placement.seatY) || 0) : 0;
        ch.position.y += (seatTargetY - ch.position.y) * Math.min(1, (dt || 0.016) * 8);
        var auraPulse = ud.status === 'working' ? 1 + Math.sin(t * 4) * 0.08 : 1;
        ud.parts.aura.scale.setScalar(auraPulse);
    }

    function emitActivityIfChanged() {
        if (typeof onActivity !== 'function') return;
        var rows = characters.map(function (ch) {
            var p = ch.userData.placement || {};
            return {
                roleId: ch.userData.roleId,
                status: ch.userData.status,
                activity: p.activity || 'idle',
                speech: p.speech || '',
                label: p.label || STATUS_LABEL[ch.userData.status] || 'Idle'
            };
        });
        var digest = rows.map(function (r) {
            return r.roleId + ':' + r.status + ':' + r.activity + ':' + r.speech;
        }).join('|');
        if (digest === lastActivityDigest) return;
        lastActivityDigest = digest;
        onActivity(rows);
    }

    function recomputePlacements() {
        var list = employeesCache;
        var now = Date.now();
        var idleSeats = [];
        list.forEach(function (emp, i) {
            if ((emp.status || 'idle') === 'idle') idleSeats.push(i);
        });
        var plan = idlePlan(idleSeats, now);
        var meetingIndex = 0;
        list.forEach(function (emp, i) {
            var ch = characters[i];
            if (!ch) return;
            var idle = (emp.status || 'idle') === 'idle' ? plan.get(i) : null;
            var meetIdx = (emp.status === 'awaiting_approval') ? meetingIndex++ : 0;
            var placement = placementFor(emp, i, idle, meetIdx);
            setDestination(ch, placement);
        });
        emitActivityIfChanged();
        updateHud();
    }

    /* ---------- Kucing kantor Piko (adopsi kantor-ai Fase 2) ---------- */

    function createCat() {
        var g = new THREE.Group();
        var fur = mat(0xfb923c, 0.85, 0);
        var cream = mat(0xfff7ed, 0.9, 0);
        var dark = mat(0x292524, 0.8, 0);

        var body = new THREE.Group();
        g.add(body);
        var torso = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), fur);
        torso.scale.set(0.85, 0.78, 1.45);
        torso.position.set(0, 0.34, 0);
        torso.castShadow = true;
        body.add(torso);
        var chest = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), cream);
        chest.scale.set(0.8, 0.75, 0.9);
        chest.position.set(0, 0.3, 0.16);
        body.add(chest);

        var head = new THREE.Group();
        head.position.set(0, 0.47, 0.32);
        var skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), fur);
        head.add(skull);
        [-1, 1].forEach(function (side) {
            var ear = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.055, 0.13, 10), fur);
            ear.position.set(0.09 * side, 0.15, 0);
            head.add(ear);
            var eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), dark);
            eye.position.set(0.055 * side, 0.02, 0.135);
            head.add(eye);
        });
        var nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mat(0xf472b6, 0.7, 0));
        nose.position.set(0, -0.02, 0.15);
        head.add(nose);
        body.add(head);

        var tail = new THREE.Group();
        tail.position.set(0, 0.42, -0.3);
        var tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.42, 10), fur);
        tailMesh.position.set(0, 0.19, -0.04);
        tailMesh.rotation.x = 0.5;
        tail.add(tailMesh);
        body.add(tail);

        var legs = [];
        [[-0.1, 0.17], [0.1, 0.17], [-0.1, -0.17], [0.1, -0.17]].forEach(function (p) {
            var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.24, 8), fur);
            leg.position.set(p[0], 0.12, p[1]);
            body.add(leg);
            legs.push(leg);
        });

        g.userData.isCat = true;
        return { group: g, body: body, head: head, tail: tail, legs: legs, path: [], waitUntil: 0, sleepUntil: 0, petUntil: 0, restY: 0, targetY: 0 };
    }

    function spawnCat() {
        if (cat && cat.group && scene) scene.remove(cat.group);
        cat = createCat();
        var start = (LAYOUT.idleStops.find(function (s) { return s.key === 'lounge'; }) || {}).spots;
        var spot = (start && start[0]) || { x: 0.7, z: 0.6 };
        cat.group.position.set(spot.x, 0, spot.z);
        cat.waitUntil = Date.now() + 5000;
        scene.add(cat.group);
        return cat;
    }

    function catStateText(now) {
        if (!cat) return '';
        if (now < cat.petUntil) return '♥ Purr…';
        if (now < cat.sleepUntil) return 'Zzz… sleeping';
        if (cat.path && cat.path.length) return 'Wandering around';
        return 'Meow';
    }

    function chooseCatDestination(now) {
        var spots = [];
        (LAYOUT.idleStops || []).forEach(function (s) {
            (s.spots || []).forEach(function (sp) { spots.push({ x: sp.x, z: sp.z, seatY: sp.seatY || 0, key: s.key }); });
        });
        if (!spots.length) return;
        var spot = spots[Math.floor(Math.random() * spots.length)];
        if (Math.hypot(spot.x - cat.group.position.x, spot.z - cat.group.position.z) < 0.4) return;
        var path = navPath(cat.group.position.x, cat.group.position.z, spot.x, spot.z, null);
        cat.path = (path && path.length) ? path : [{ x: spot.x, z: spot.z }];
        cat.dest = spot;
        cat.targetY = 0;
        cat.waitUntil = now + 6000;
    }

    function petCat() {
        if (!cat) return false;
        var now = Date.now();
        cat.petUntil = now + 2600;
        cat.sleepUntil = 0;
        cat.waitUntil = now + 9000;
        return true;
    }

    function updateCat(dt, t) {
        if (!cat || !cat.group) return;
        var now = Date.now();
        var g = cat.group;

        if (now < cat.petUntil) {
            cat.tail.rotation.y = Math.sin(t * 16) * 0.55;
            g.position.y += (((cat.targetY || 0) + Math.abs(Math.sin(t * 6)) * 0.02) - g.position.y) * Math.min(1, dt * 8);
            return;
        }
        if (now < cat.sleepUntil) {
            cat.tail.rotation.y = Math.sin(t * 1.4) * 0.12;
            cat.body.rotation.z = 0.12;
            g.position.y += ((cat.targetY || 0) - g.position.y) * Math.min(1, dt * 4);
            return;
        }
        cat.body.rotation.z = 0;

        if (cat.path && cat.path.length) {
            var next = cat.path[0];
            var dx = next.x - g.position.x;
            var dz = next.z - g.position.z;
            var dist = Math.hypot(dx, dz);
            if (dist < 0.06) {
                cat.path.shift();
                if (!cat.path.length) {
                    /* Sampai tujuan: kadang tidur di sofa/lounge, kadang menunggu. */
                    if (cat.dest && (cat.dest.key === 'lounge' || cat.dest.key === 'tv') && Math.random() < 0.55) {
                        cat.targetY = cat.dest.seatY || 0;
                        cat.sleepUntil = now + 14000;
                    }
                    cat.waitUntil = now + 5000 + Math.random() * 7000;
                }
            } else {
                var step = Math.min(dist, dt * 1.15);
                g.position.x += (dx / dist) * step;
                g.position.z += (dz / dist) * step;
                var heading = Math.atan2(dx, dz);
                var dy = heading - g.rotation.y;
                while (dy > Math.PI) dy -= Math.PI * 2;
                while (dy < -Math.PI) dy += Math.PI * 2;
                g.rotation.y += dy * 0.18;
                cat.legs.forEach(function (leg, i) {
                    leg.rotation.x = Math.sin(t * 13 + (i % 2) * Math.PI) * 0.45;
                });
                cat.tail.rotation.y = Math.sin(t * 6) * 0.3;
                cat.targetY = 0;
            }
        } else {
            cat.legs.forEach(function (leg) { leg.rotation.x = 0; });
            cat.tail.rotation.y = Math.sin(t * 2.2) * 0.22;
            if (routineOn && now > cat.waitUntil) chooseCatDestination(now);
        }
        g.position.y += ((cat.targetY || 0) - g.position.y) * Math.min(1, (dt || 0.016) * 6);
    }

    /* ---------- Kamera follow / first-person / tur (Fase 2) ---------- */

    function tourKeyframes() {
        var b = LAYOUT.building;
        var cx = (b.minX + b.maxX) / 2;
        var cz = (b.minZ + b.maxZ) / 2;
        var desk0 = LAYOUT.desks[0] ? deskInfo(LAYOUT.desks[0]) : { x: cx, z: cz };
        var mt = LAYOUT.meetingTable || { x: cx, z: cz };
        var wide = Math.round(Math.max(34, (b.maxX - b.minX) * 1.28));
        return [
            { target: [cx, 0.4, cz], radius: wide, phi: 0.95, theta: 0.42 },
            { target: [desk0.x, 0.6, desk0.z], radius: 9, phi: 1.02, theta: 0.9 },
            { target: [mt.x, 0.5, mt.z], radius: 8.5, phi: 1.05, theta: 2.2 },
            { target: [cx - 3, 0.5, cz + 2], radius: 11, phi: 1.0, theta: 3.4 },
            { target: [cx, 0.4, cz], radius: wide + 8, phi: 0.78, theta: 5.2 }
        ];
    }

    function setCameraMode(mode, roleId) {
        var next = ['orbit', 'follow', 'first'].includes(mode) ? mode : 'orbit';
        cameraMode = next;
        if (roleId) followRoleId = roleId;
        if (next !== 'orbit' && !followRoleId && employeesCache.length) followRoleId = employeesCache[0].id;
        if (next !== 'orbit') stopTour();
        var sel = container ? container.querySelector('#office-3d-cam-mode') : null;
        if (sel) sel.value = next;
        var agentSel = container ? container.querySelector('#office-3d-cam-agent') : null;
        if (agentSel && followRoleId) agentSel.value = followRoleId;
        return next;
    }

    function startTour() {
        setCameraMode('orbit');
        cameraTour.active = true;
        cameraTour.startedAt = Date.now();
        var btn = container ? container.querySelector('#office-3d-tour') : null;
        if (btn) btn.textContent = 'Tour: On';
        return true;
    }

    function stopTour() {
        if (!cameraTour.active) return;
        cameraTour.active = false;
        var btn = container ? container.querySelector('#office-3d-tour') : null;
        if (btn) btn.textContent = 'Tour: Off';
    }

    function updateTour(now) {
        if (!cameraTour.active) return;
        var frames = tourKeyframes();
        if (!frames.length) return;
        var segMs = 4200;
        var elapsed = now - cameraTour.startedAt;
        var idx = Math.floor(elapsed / segMs) % frames.length;
        var p = (elapsed % segMs) / segMs;
        var smooth = p * p * (3 - 2 * p);
        var a = frames[idx];
        var b = frames[(idx + 1) % frames.length];
        orbit.target.set(
            a.target[0] + (b.target[0] - a.target[0]) * smooth,
            a.target[1] + (b.target[1] - a.target[1]) * smooth,
            a.target[2] + (b.target[2] - a.target[2]) * smooth
        );
        orbit.spherical.radius = a.radius + (b.radius - a.radius) * smooth;
        orbit.spherical.phi = a.phi + (b.phi - a.phi) * smooth;
        orbit.spherical.theta = a.theta + (b.theta - a.theta) * smooth;
        applyOrbitToCamera();
    }

    function updateFollowCamera(dt) {
        if (cameraMode === 'orbit' || !camera) return;
        var ch = characters.find(function (c) { return c.userData.roleId === followRoleId; }) || characters[0];
        if (!ch) return;
        var pos = ch.position;
        var fwd = { x: Math.sin(ch.rotation.y), z: Math.cos(ch.rotation.y) };
        var k = Math.min(1, (dt || 0.016) * 5);
        if (cameraMode === 'follow') {
            var dest = {
                x: pos.x - fwd.x * 3.1,
                y: pos.y + 2.1,
                z: pos.z - fwd.z * 3.1
            };
            camera.position.x += (dest.x - camera.position.x) * k;
            camera.position.y += (dest.y - camera.position.y) * k;
            camera.position.z += (dest.z - camera.position.z) * k;
            camera.lookAt(pos.x, pos.y + 1.0, pos.z);
        } else {
            camera.position.set(pos.x + fwd.x * 0.38, pos.y + 1.52, pos.z + fwd.z * 0.38);
            camera.lookAt(pos.x + fwd.x * 5, pos.y + 1.3, pos.z + fwd.z * 5);
        }
    }

    function layoutCharacters(employees) {
        employeesCache = employees.slice();
        employees.forEach(function (emp, i) {
            var ch = characters[i];
            if (!ch) {
                var look = agentLook(emp.id, emp.avatarColor);
                ch = createHumanoid(emp.avatarColor || look.shirt, look);
                var seat0 = deskSeatSpot(LAYOUT.desks[i % LAYOUT.desks.length]);
                ch.position.set(seat0.x, 0, seat0.z);
                scene.add(ch);
                characters.push(ch);
            }
            ch.userData.seat = i;
            syncCharacter(ch, emp);
        });

        while (characters.length > employees.length) {
            var ch2 = characters.pop();
            scene.remove(ch2);
            disposeObject(ch2);
        }

        rebuildLabels(employees);
        recomputePlacements();
    }

    function disposeObject(obj) {
        obj.traverse(function (child) {
            /* Geometri/material robot dipakai bersama 7 agen — jangan dibuang. */
            if (child.geometry && !(child.geometry.userData && child.geometry.userData.sharedAsset)) {
                child.geometry.dispose();
            }
            if (child.material) {
                var disposeMat = function (m) {
                    if (!(m.userData && m.userData.sharedAsset)) m.dispose();
                };
                if (Array.isArray(child.material)) child.material.forEach(disposeMat);
                else disposeMat(child.material);
            }
        });
    }

    /* ---------- Orbit ---------- */

    function applyOrbitToCamera() {
        if (!camera || !orbit.target) return;
        var s = orbit.spherical;
        var sinPhi = Math.sin(s.phi);
        camera.position.set(
            orbit.target.x + s.radius * sinPhi * Math.sin(s.theta),
            orbit.target.y + s.radius * Math.cos(s.phi),
            orbit.target.z + s.radius * sinPhi * Math.cos(s.theta)
        );
        camera.lookAt(orbit.target);
    }

    function clampPan() {
        var p = LAYOUT.pan;
        orbit.target.x = Math.min(p.maxX, Math.max(p.minX, orbit.target.x));
        orbit.target.z = Math.min(p.maxZ, Math.max(p.minZ, orbit.target.z));
    }

    function resetView() {
        stopTour();
        if (cameraMode !== 'orbit') setCameraMode('orbit');
        var d = orbit.defaults;
        orbit.spherical.radius = d.radius;
        orbit.spherical.phi = d.phi;
        orbit.spherical.theta = d.theta;
        if (orbit.target) {
            orbit.target.set(d.target[0], d.target[1], d.target[2]);
        }
        applyOrbitToCamera();
    }

    var forcePanMode = false;

    function setPanMode(on) {
        forcePanMode = !!on;
        return forcePanMode;
    }

    function isPanMode() {
        return !!forcePanMode;
    }

    function bindOrbit(el) {
        unbindOrbit();
        function onDown(e) {
            /* Interaksi manual mengambil alih dari tur / kamera follow. */
            if (cameraTour.active) stopTour();
            if (cameraMode !== 'orbit') setCameraMode('orbit');
            if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.shiftKey || forcePanMode))) {
                orbit.panning = true;
            } else if (e.button === 0) {
                orbit.dragging = true;
            } else {
                return;
            }
            orbit.moved = false;
            orbit.lastX = e.clientX;
            orbit.lastY = e.clientY;
            el.setPointerCapture(e.pointerId);
            e.preventDefault();
        }
        function onMove(e) {
            if (!orbit.dragging && !orbit.panning) return;
            var dx = e.clientX - orbit.lastX;
            var dy = e.clientY - orbit.lastY;
            if (Math.abs(dx) + Math.abs(dy) > 3) orbit.moved = true;
            orbit.lastX = e.clientX;
            orbit.lastY = e.clientY;
            if (orbit.panning) {
                var panScale = orbit.spherical.radius * 0.0018;
                var right = new THREE.Vector3();
                var forward = new THREE.Vector3();
                camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
                orbit.target.addScaledVector(right, -dx * panScale);
                orbit.target.addScaledVector(forward, dy * panScale);
                clampPan();
            } else {
                orbit.spherical.theta -= dx * 0.005;
                orbit.spherical.phi = Math.min(1.32, Math.max(0.25, orbit.spherical.phi + dy * 0.004));
            }
            applyOrbitToCamera();
        }
        function onUp(e) {
            orbit.dragging = false;
            orbit.panning = false;
            try { el.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
        function onWheel(e) {
            e.preventDefault();
            if (cameraTour.active) stopTour();
            if (cameraMode !== 'orbit') setCameraMode('orbit');
            var factor = e.deltaY > 0 ? 1.08 : 0.92;
            orbit.spherical.radius = Math.min(64, Math.max(8, orbit.spherical.radius * factor));
            applyOrbitToCamera();
        }
        function onContext(e) { e.preventDefault(); }

        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('contextmenu', onContext);
        orbit.listeners = { el: el, onDown: onDown, onMove: onMove, onUp: onUp, onWheel: onWheel, onContext: onContext };
    }

    function unbindOrbit() {
        var L = orbit.listeners;
        if (!L) return;
        L.el.removeEventListener('pointerdown', L.onDown);
        L.el.removeEventListener('pointermove', L.onMove);
        L.el.removeEventListener('pointerup', L.onUp);
        L.el.removeEventListener('pointercancel', L.onUp);
        L.el.removeEventListener('wheel', L.onWheel);
        L.el.removeEventListener('contextmenu', L.onContext);
        orbit.listeners = null;
        orbit.dragging = false;
        orbit.panning = false;
    }

    /* ---------- Loop / lifecycle ---------- */

    function tick() {
        rafId = 0;
        if (!renderer || !scene || !camera || paused || !enabled) return;

        var dt = Math.min(clock.getDelta(), 0.05);
        var t = clock.elapsedTime;

        var idleStep = Math.floor(Date.now() / IDLE_STOP_MS);
        if (idleStep !== lastIdleStep) {
            lastIdleStep = idleStep;
            recomputePlacements();
        }

        /* Pencahayaan mode auto diperiksa ulang tiap menit (transisi jam). */
        var minute = Math.floor(Date.now() / 60000);
        if (minute !== lastLightingMinute) {
            lastLightingMinute = minute;
            applyLighting(false);
        }

        characters.forEach(function (ch) { animateCharacter(ch, t, dt); });
        updateCat(dt, t);
        if (cameraTour.active) updateTour(Date.now());
        else updateFollowCamera(dt);
        updateLabelPositions();
        renderer.render(scene, camera);

        rafId = requestAnimationFrame(tick);
    }

    function startLoop() {
        if (rafId || !enabled || paused) return;
        clock.start();
        rafId = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    function handleResize() {
        if (!container || !renderer || !camera) return;
        var w = container.clientWidth || 1;
        var h = container.clientHeight || 1;
        var dpr = reduced ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function pick(clientX, clientY) {
        if (!renderer || !camera || !characters.length) return null;
        var rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        var hits = raycaster.intersectObjects(characters, true);
        if (!hits.length) return null;
        var obj = hits[0].object;
        while (obj && !obj.userData.roleId) obj = obj.parent;
        return obj && obj.userData.roleId ? obj.userData.roleId : null;
    }

    var lastInitEl = null;
    var lastInitOptions = null;

    /** Terapkan layout kantor custom (dari halaman Layout Kantor); rebuild scene bila sedang tampil. */
    function setLayout(cfg) {
        CUSTOM_LAYOUT = cfg && typeof cfg === 'object' ? cfg : null;
        LAYOUT = buildLayout(Math.max(1, employeesCache.length || 7), CUSTOM_LAYOUT);
        navCache = null;
        if (!scene || !lastInitEl) return false;
        var emps = employeesCache.slice();
        var el = lastInitEl;
        var opts = lastInitOptions;
        init(el, opts);
        if (emps.length) updateEmployees(emps);
        return true;
    }

    function getLayout() {
        return JSON.parse(JSON.stringify({
            wallHeight: LAYOUT.wallHeight || 2.55,
            building: LAYOUT.building,
            desks: LAYOUT.desks,
            furniture: LAYOUT.furniture || [],
            partitions: LAYOUT.partitions || { segments: [] },
            meetingTable: LAYOUT.meetingTable || { x: DEFAULT_MEETING.x, z: DEFAULT_MEETING.z, radius: 1.05, enabled: true }
        }));
    }

    function init(el, options) {
        options = options || {};
        lastInitEl = el;
        lastInitOptions = options;
        THREE = global.THREE;
        if (!THREE) {
            console.warn('[AiOffice3D] THREE belum dimuat');
            return false;
        }
        if (!el) return false;

        dispose();

        container = el;
        canvas = options.canvas || el.querySelector('canvas');
        labelsRoot = options.labelsRoot || el.querySelector('.office-3d-labels');
        hudRoot = el.querySelector('#office-3d-hud') || el.querySelector('.office-3d-hud');
        onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
        onActivity = typeof options.onActivity === 'function' ? options.onActivity : null;
        reduced = !!(options.reduced ||
            (typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches));
        enabled = options.enabled != null ? !!options.enabled : loadPreference();

        buildScene();
        clock = new THREE.Clock();
        raycaster = new THREE.Raycaster();
        pointer = new THREE.Vector2();

        renderer = new THREE.WebGLRenderer({
            canvas: canvas || undefined,
            antialias: !reduced,
            alpha: false,
            powerPreference: 'low-power'
        });
        /* Manajemen warna & bayangan (Three r160): output sRGB + tone mapping
           ACES yang ditahan agar warna material tidak pucat; bayangan PCF soft
           hanya di mode penuh (reduced = layar kecil/hemat). */
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        if (THREE.ACESFilmicToneMapping) {
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.06;
        }
        if (renderer.shadowMap) {
            renderer.shadowMap.enabled = !reduced;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        renderer.setClearColor(0xb8d4e8, 1);
        if (!canvas) {
            canvas = renderer.domElement;
            container.appendChild(canvas);
        }

        handleResize();
        bindOrbit(renderer.domElement);

        var resetBtn = container.querySelector('#office-3d-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function (e) {
                e.preventDefault();
                resetView();
            });
        }

        var lightingSel = container.querySelector('#office-3d-lighting');
        if (lightingSel) {
            lightingSel.value = lightingMode;
            lightingSel.addEventListener('change', function () {
                setLightingMode(lightingSel.value);
            });
        }
        var routineBtn = container.querySelector('#office-3d-routine');
        if (routineBtn) {
            routineBtn.textContent = routineOn ? 'Routine: On' : 'Routine: Off';
            routineBtn.setAttribute('aria-pressed', routineOn ? 'true' : 'false');
            routineBtn.addEventListener('click', function (e) {
                e.preventDefault();
                setRoutineEnabled(!routineOn);
            });
        }

        var camAgentSel = container.querySelector('#office-3d-cam-agent');
        if (camAgentSel) {
            camAgentSel.addEventListener('change', function () {
                followRoleId = camAgentSel.value || null;
                if (cameraMode === 'orbit') setCameraMode('follow', followRoleId);
                else setCameraMode(cameraMode, followRoleId);
            });
        }
        var camModeSel = container.querySelector('#office-3d-cam-mode');
        if (camModeSel) {
            camModeSel.value = cameraMode;
            camModeSel.addEventListener('change', function () {
                setCameraMode(camModeSel.value, followRoleId);
            });
        }
        var tourBtn = container.querySelector('#office-3d-tour');
        if (tourBtn) {
            tourBtn.textContent = cameraTour.active ? 'Tour: On' : 'Tour: Off';
            tourBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (cameraTour.active) stopTour();
                else startTour();
            });
        }
        var petBtn = container.querySelector('#office-3d-pet');
        if (petBtn) {
            petBtn.addEventListener('click', function (e) {
                e.preventDefault();
                petCat();
            });
        }

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(function () { handleResize(); });
            resizeObserver.observe(container);
        } else {
            window.addEventListener('resize', handleResize);
        }

        visibilityHandler = function () {
            paused = document.hidden;
            if (paused) stopLoop();
            else if (enabled) startLoop();
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        keyHandler = function (e) {
            if (e.key !== 'Escape') return;
            if (cameraTour.active) stopTour();
            if (cameraMode !== 'orbit') setCameraMode('orbit');
        };
        document.addEventListener('keydown', keyHandler);

        clickHandler = function (e) {
            if (orbit.moved) return;
            if (cat && cat.group && renderer && camera) {
                var rect0 = renderer.domElement.getBoundingClientRect();
                pointer.x = ((e.clientX - rect0.left) / rect0.width) * 2 - 1;
                pointer.y = -((e.clientY - rect0.top) / rect0.height) * 2 + 1;
                raycaster.setFromCamera(pointer, camera);
                if (raycaster.intersectObject(cat.group, true).length) {
                    petCat();
                    return;
                }
            }
            var roleId = pick(e.clientX, e.clientY);
            if (roleId && typeof onSelect === 'function') onSelect(roleId);
        };
        renderer.domElement.addEventListener('click', clickHandler);

        container.classList.toggle('is-3d-off', !enabled);
        if (enabled) startLoop();
        return true;
    }

    function updateEmployees(employees) {
        if (!scene) return;
        layoutCharacters(Array.isArray(employees) ? employees : []);
    }

    function getActivitySnapshot() {
        return characters.map(function (ch) {
            var p = ch.userData.placement || {};
            var emp = employeesCache.find(function (e) { return e.id === ch.userData.roleId; }) || {};
            return {
                roleId: ch.userData.roleId,
                name: emp.name || ch.userData.roleId,
                status: ch.userData.status,
                activity: p.activity || 'idle',
                speech: p.speech || '',
                label: p.label || STATUS_LABEL[ch.userData.status] || 'Idle'
            };
        });
    }

    function setEnabled(on) {
        enabled = !!on;
        savePreference(enabled);
        if (container) container.classList.toggle('is-3d-off', !enabled);
        if (!enabled) {
            stopLoop();
            if (labelsRoot) labelsRoot.innerHTML = '';
        } else if (scene) {
            handleResize();
            recomputePlacements();
            startLoop();
        }
    }

    function isEnabled() {
        return enabled;
    }

    function dispose() {
        stopLoop();
        unbindOrbit();
        forcePanMode = false;
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
        }
        if (keyHandler) {
            document.removeEventListener('keydown', keyHandler);
            keyHandler = null;
        }
        if (clickHandler && renderer) {
            renderer.domElement.removeEventListener('click', clickHandler);
            clickHandler = null;
        }
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        } else {
            window.removeEventListener('resize', handleResize);
        }
        characters.forEach(function (ch) {
            if (scene) scene.remove(ch);
            disposeObject(ch);
        });
        characters = [];
        employeesCache = [];
        lastActivityDigest = '';
        lastIdleStep = -1;
        if (labelsRoot) labelsRoot.innerHTML = '';
        if (scene) {
            scene.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
                    else child.material.dispose();
                }
            });
        }
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene = null;
        camera = null;
        clock = null;
        lightRefs = null;
        lightingPeriodApplied = '';
        lastLightingMinute = -1;
        cat = null;
        cameraMode = 'orbit';
        followRoleId = null;
        cameraTour.active = false;
        labelEls = [];
        zoneLabelEls = [];
        catLabelEl = null;
        container = null;
        canvas = null;
        labelsRoot = null;
        hudRoot = null;
        roomRoot = null;
        onActivity = null;
    }

    global.AiOffice3D = {
        init: init,
        dispose: dispose,
        updateEmployees: updateEmployees,
        setEnabled: setEnabled,
        isEnabled: isEnabled,
        loadPreference: loadPreference,
        getActivitySnapshot: getActivitySnapshot,
        resize: handleResize,
        resetView: resetView,
        setPanMode: setPanMode,
        isPanMode: isPanMode,
        setLayout: setLayout,
        getLayout: getLayout,
        setLightingMode: setLightingMode,
        getLightingMode: function () { return lightingMode; },
        getLightingPeriod: function () { return lightingPeriodApplied; },
        setRoutineEnabled: setRoutineEnabled,
        isRoutineEnabled: function () { return routineOn; },
        petCat: petCat,
        getCatState: function () {
            if (!cat) return null;
            return {
                name: CAT_NAME,
                state: catStateText(Date.now()),
                position: cat.group ? cat.group.position.toArray() : null,
                wandering: !!(cat.path && cat.path.length)
            };
        },
        setCameraMode: setCameraMode,
        getCameraState: function () {
            return { mode: cameraMode, followRoleId: followRoleId, tourActive: !!cameraTour.active };
        },
        setFocusedRole: setFocusedRole,
        getFocusedRole: function () { return focusedRoleId; },
        getLabelState: function () {
            return {
                count: labelEls.length,
                hasCat: !!catLabelEl,
                focusedRoleId: focusedRoleId,
                overview: !!(labelsRoot && labelsRoot.classList.contains('is-overview'))
            };
        },
        getZoneState: function () {
            return {
                count: studioZones.length,
                labels: zoneLabelEls.length,
                zones: studioZones.map(function (z) { return z.id; })
            };
        },
        startTour: startTour,
        stopTour: stopTour,
        __test: {
            buildLayout: buildLayout, deskSeatSpot: deskSeatSpot, deskInfo: deskInfo,
            deriveIdleStops: deriveIdleStops, navPath: navPath, pointBlocked: pointBlocked,
            resolveLightingPeriod: resolveLightingPeriod,
            computeStudioZones: computeStudioZones,
            computeStudioRooms: computeStudioRooms,
            isLegacyDefaultDesks: isLegacyDefaultDesks,
            isLegacyDefaultSegments: isLegacyDefaultSegments,
            isLegacyDefaultFurniture: isLegacyDefaultFurniture,
            getLayoutRef: function () { return LAYOUT; }
        },
        getDefaultLayout: defaultLayoutData,
        /**
         * Migrasi layout bawaan lama → denah klaster studio saat ini.
         * Dipakai editor Layout Kantor (app.js) agar layout tersimpan yang
         * masih persis bawaan lama tampil sebagai denah baru; layout kustom
         * dikembalikan apa adanya. Mengembalikan {layout, migrated}.
         */
        migrateLegacyLayout: function (cfg) {
            if (!cfg || typeof cfg !== 'object' || !isLegacyDefaultDesks(cfg.desks)) {
                return { layout: cfg, migrated: false };
            }
            var built = buildLayout(ROLE_STUDIO.length, cfg);
            var out = {};
            Object.keys(cfg).forEach(function (k) { out[k] = cfg[k]; });
            out.desks = built.desks;
            out.partitions = built.partitions;
            out.meetingTable = built.meetingTable;
            out.furniture = built.furniture;
            out.building = built.building;
            return { layout: out, migrated: true };
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
