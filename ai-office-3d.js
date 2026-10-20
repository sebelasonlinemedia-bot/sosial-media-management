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

    /* Startup office — match illustration (y-up, +z toward front). */
    var PARTITION_X = 0.7;
    var AISLE_Z = -0.1;
    var WALL_H = 2.55;
    /* Dinding belakang selalu tinggi penuh — slider layout hanya
       berlaku untuk dinding kiri & kanan (dan partisi interior). */
    var BACK_WALL_H = 2.55;
    var WALL = 0xffffff;
    var WALL_TOP = 0xf1f5f9;
    var TEAL = 0x2dd4bf;
    var YELLOW = 0xfbbf24;
    var ORANGE = 0xfb923c;

    /* Layout default hasil rekonstruksi screenshot Layout Kantor
       (22.8 x 11.0 m, pusat gedung dipertahankan di (0.7,-0.4)):
       AREA KERJA kiri, MEETING kiri-bawah, LOUNGE·GAME·DAPUR kanan.
       Dideklarasikan SEBELUM buildLayout pertama agar tidak undefined. */
    var DEFAULT_BUILDING = { minX: -10.7, maxX: 12.1, minZ: -5.9, maxZ: 5.1 };
    var DEFAULT_MEETING = { x: -5.6, z: 3.0, radius: 1.05, enabled: true };
    /* Meja meeting MEMANJANG (elips sumbu-X): radius = skala lebar;
       setengah-panjang a = radius*1.6 (±3.2x lebar), setengah-lebar b. */
    var MEETING_LONG = 'elongated-meeting-v1';
    function meetingDims(table) {
        var r = (table && Number(table.radius)) || 1.05;
        return { r: r, a: r * 1.6, b: r * 0.62 };
    }

    var LAYOUT = buildLayout(7, null);
    var CUSTOM_LAYOUT = null;

    /** Mebel bawaan scene (posisi mengikuti denah screenshot). */
    function defaultFurniture() {
        return [
            { id: 'sofa-1', type: 'sofa', x: 1.9, z: -3.6, rotY: Math.PI / 2 },
            { id: 'sofa-2', type: 'sofa', x: 4.1, z: -3.6, rotY: Math.PI / 2 },
            { id: 'coffee-table', type: 'coffeetable', x: 3.0, z: -3.6, rotY: Math.PI / 2 },
            /* TV lounge di sisi timur sofa (layar menghadap -x ke sofa):
               dasar stop idle sofa-TV — lihat deriveIdleStops. */
            { id: 'tv-1', type: 'tv', x: 5.4, z: -4.2, rotY: -Math.PI / 2 },
            { id: 'beanbag-1', type: 'beanbag', x: 6.8, z: 0.4, rotY: 0 },
            { id: 'beanbag-2', type: 'beanbag', x: 8.6, z: 0.4, rotY: 0 },
            { id: 'pingpong', type: 'pingpong', x: 7.6, z: -2.7, rotY: 0 },
            { id: 'arcade-1', type: 'arcade', x: 10.9, z: -4.9, rotY: 0 },
            { id: 'arcade-2', type: 'arcade', x: 9.8, z: -4.9, rotY: 0 },
            { id: 'coffeebar', type: 'coffeebar', x: 6.0, z: 4.35, rotY: 0 },
            { id: 'stool-1', type: 'stool', x: 5.4, z: 3.65, rotY: 0 },
            { id: 'stool-2', type: 'stool', x: 6.1, z: 3.65, rotY: 0 },
            { id: 'pantry', type: 'pantry', x: 9.4, z: 3.0, rotY: -Math.PI / 2 },
            { id: 'fridge', type: 'fridge', x: 10.7, z: 4.3, rotY: -Math.PI / 2 },
            { id: 'galon', type: 'galon', x: 10.7, z: 1.3, rotY: 0 },
            { id: 'bookshelf', type: 'bookshelf', x: -10.15, z: 2.2, rotY: Math.PI / 2 },
            { id: 'plant-1', type: 'plant', x: -10.0, z: -5.2, rotY: 0 },
            { id: 'plant-2', type: 'plant', x: -0.1, z: -5.3, rotY: 0 },
            { id: 'plant-3', type: 'plant', x: 11.5, z: 0.6, rotY: 0 },
            { id: 'plant-4', type: 'plant', x: -10.0, z: 4.6, rotY: 0 },
            { id: 'tree-1', type: 'tree', x: -8.0, z: -7.8, rotY: 0 },
            { id: 'tree-2', type: 'tree', x: -3.0, z: -7.8, rotY: 0 },
            { id: 'tree-3', type: 'tree', x: 3.0, z: -7.8, rotY: 0 },
            { id: 'tree-4', type: 'tree', x: 8.0, z: -7.8, rotY: 0 },
            { id: 'tree-5', type: 'tree', x: -12.6, z: -0.5, rotY: 0 },
            { id: 'tree-6', type: 'tree', x: 14.0, z: -0.5, rotY: 0 },
            { id: 'lamp-1', type: 'lamp', x: -9.0, z: 6.8, rotY: 0 },
            { id: 'lamp-2', type: 'lamp', x: 0.7, z: 6.8, rotY: 0 },
            { id: 'lamp-3', type: 'lamp', x: 9.0, z: 6.8, rotY: 0 }
        ];
    }

    function defaultLayoutData() {
        return {
            wallHeight: 2.55,
            building: { minX: DEFAULT_BUILDING.minX, maxX: DEFAULT_BUILDING.maxX, minZ: DEFAULT_BUILDING.minZ, maxZ: DEFAULT_BUILDING.maxZ },
            desks: [
                [-8.6, -3.7, 0], [-6.4, -3.7, 0], [-4.2, -3.7, 0], [-2.0, -3.7, 0],
                [-7.5, -1.5, 0], [-5.3, -1.5, 0], [-3.1, -1.5, 0]
            ],
            furniture: defaultFurniture(),
            partitions: {
                /* Celah pintu sengaja dibiarkan: v x=0.7 celah z -1.0..0.8,
                   h meeting celah x -2.0..0.7, h dapur celah x 0.7..3.5. */
                segments: [
                    { axis: 'v', at: 0.7, from: -5.9, to: -1.0 },
                    { axis: 'v', at: 0.7, from: 0.8, to: 1.8 },
                    { axis: 'h', at: 1.2, from: -10.7, to: -2.0 },
                    { axis: 'h', at: 1.8, from: 3.5, to: 12.1 },
                    { axis: 'h', at: 0.3, from: -10.7, to: -7.8 }
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
                { x: 5.2, z: 1.0, facing: 0, seated: false }
            ]
        });
        return stops;
    }

    function buildLayout(agentCount, custom) {
        var cfg = custom && typeof custom === 'object' ? custom : null;
        var desks = (cfg && Array.isArray(cfg.desks) && cfg.desks.length
            ? cfg.desks.map(function (d) {
                var info = deskInfo(d);
                return [info.x, info.z, round2(info.rot)];
            })
            : defaultLayoutData().desks
        ).slice(0, Math.max(1, agentCount));

        var building = cfg && cfg.building
            ? {
                minX: Number(cfg.building.minX) || DEFAULT_BUILDING.minX,
                maxX: Number(cfg.building.maxX) || DEFAULT_BUILDING.maxX,
                minZ: Number(cfg.building.minZ) || DEFAULT_BUILDING.minZ,
                maxZ: Number(cfg.building.maxZ) || DEFAULT_BUILDING.maxZ
            }
            : { minX: DEFAULT_BUILDING.minX, maxX: DEFAULT_BUILDING.maxX, minZ: DEFAULT_BUILDING.minZ, maxZ: DEFAULT_BUILDING.maxZ };

        var furniture = cfg && Array.isArray(cfg.furniture) ? cfg.furniture : defaultFurniture();
        var wallHeight = cfg && Number(cfg.wallHeight) ? Number(cfg.wallHeight) : 2.55;

        var meetingTable = cfg && cfg.meetingTable && typeof cfg.meetingTable === 'object'
            ? {
                x: Number(cfg.meetingTable.x) || DEFAULT_MEETING.x,
                z: Number(cfg.meetingTable.z) || DEFAULT_MEETING.z,
                radius: Number(cfg.meetingTable.radius) || DEFAULT_MEETING.radius,
                enabled: cfg.meetingTable.enabled !== false
            }
            : { x: DEFAULT_MEETING.x, z: DEFAULT_MEETING.z, radius: DEFAULT_MEETING.radius, enabled: true };
        var meeting = meetingSpotsAround(meetingTable, agentCount);

        var partitions = cfg && cfg.partitions && Array.isArray(cfg.partitions.segments)
            ? cfg.partitions
            : defaultLayoutData().partitions;

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
            pan: { minX: -12.5, maxX: 13.5, minZ: -8, maxZ: 8 },
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
    var lastActivityDigest = '';
    var lastIdleStep = -1;
    var employeesCache = [];

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
        var taken = new Map();
        var step = Math.floor(nowMs / IDLE_STOP_MS);
        function stopAt(index) {
            var key = LAYOUT.idleRoute[index % LAYOUT.idleRoute.length];
            return LAYOUT.idleStops.find(function (s) { return s.key === key; });
        }
        seatIndexes.slice().sort(function (a, b) { return a - b; }).forEach(function (seat) {
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
            plan.set(seat, { stop: stop, spot: stop.spots[used % stop.spots.length] });
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
                activity: idleAssignment.stop.key,
                speech: idleAssignment.stop.label,
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
        mesh.castShadow = false;
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

    function addWall(parent, x1, z1, x2, z2, height) {
        var h = height == null ? WALL_H : height;
        var thick = 0.25;
        var len = Math.hypot(x2 - x1, z2 - z1);
        var angle = Math.atan2(z2 - z1, x2 - x1);
        var g = groupAt(parent, (x1 + x2) / 2, 0, (z1 + z2) / 2, -angle);
        box(g, 0, h / 2, 0, len + thick, h, thick, WALL, 0.9);
        box(g, 0, h + 0.02, 0, len + thick + 0.02, 0.05, thick + 0.04, WALL_TOP, 0.85);
        return g;
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
        var g = groupAt(parent, x, 0, z, rotY || 0);
        var c = color == null ? 0x2f3a44 : color;
        /* Alas cakram + cincin cahaya */
        cyl(g, 0, 0.045, 0, 0.27, 0.05, 0x1f2937, 0.35, 0.6);
        cyl(g, 0, 0.075, 0, 0.275, 0.014, 0x22d3ee, 0.4, 0.1, {
            emissive: 0x22d3ee, emissiveIntensity: 0.85
        });
        /* Tiang tengah krom */
        cyl(g, 0, 0.26, 0, 0.035, 0.38, 0x9aa5b1, 0.25, 0.85);
        /* Cangkang dudukan putih + bantalan aksen */
        var shell = new THREE.Mesh(new THREE.SphereGeometry(0.29, 18, 12), mat(0xf8fafc, 0.22, 0.08));
        shell.scale.set(1.02, 0.34, 0.98);
        shell.position.y = 0.35;
        g.add(shell);
        var seat = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), mat(c, 0.35, 0.05));
        seat.scale.set(0.95, 0.36, 0.9);
        seat.position.y = 0.385;
        g.add(seat);
        /* Sandaran: cangkang putih di belakang, bantalan aksen di depan */
        var backShell = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 12), mat(0xf8fafc, 0.22, 0.08));
        backShell.scale.set(0.98, 1.18, 0.3);
        backShell.position.set(0, 0.84, -0.215);
        backShell.rotation.x = -0.1;
        g.add(backShell);
        var backPad = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), mat(c, 0.35, 0.05));
        backPad.scale.set(0.88, 1.05, 0.2);
        backPad.position.set(0, 0.84, -0.175);
        backPad.rotation.x = -0.1;
        g.add(backPad);
        return g;
    }

    function addOfficeChair(parent, x, z, rotY, color) {
        return addFutureChair(parent, x, z, rotY, color);
    }

    function addWorkDesk(parent, x, z, active) {
        var g = groupAt(parent, x, 0, z);
        /* Workdesk futuristik: top putih glossy melayang + tepi cahaya cyan */
        box(g, 0, 0.74, 0, 1.9, 0.06, 0.95, 0xf8fafc, 0.22, 0.08);
        box(g, 0, 0.715, -0.485, 1.9, 0.018, 0.018, 0x22d3ee, 0.4, 0.1, {
            emissive: 0x22d3ee, emissiveIntensity: 0.85
        });
        var legL = box(g, -0.88, 0.36, 0, 0.06, 0.7, 0.7, 0x334155, 0.32, 0.65);
        legL.rotation.z = 0.07;
        var legR = box(g, 0.88, 0.36, 0, 0.06, 0.7, 0.7, 0x334155, 0.32, 0.65);
        legR.rotation.z = -0.07;
        box(g, 0, 1.13, 0.22, 0.86, 0.52, 0.03, 0x0f172a, 0.25, 0.4);
        var screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.46),
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
        box(g, 0, 0.28, 0, 2.4, 0.36, 0.9, c, 0.95);
        box(g, 0, 0.66, -0.36, 2.4, 0.62, 0.2, c, 0.95);
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
        var top = cyl(g, 0, 0.74, 0, 1, 0.06, 0xf8fafc, 0.22, 0.08, { segments: 36 });
        top.scale.set(dims.a, 1, dims.b);
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
        box(g, 0, 0.45, 0, 2, 0.9, 0.6, 0xf2eee6, 0.7);
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
        box(g, 0, 0.9, 0, 0.75, 1.8, 0.7, 0xdfe3e4, 0.35, 0.2);
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
        box(g, 0, 0.74, 0, 2.74, 0.05, 1.52, 0x1f5f8b, 0.45);
        box(g, 0, 0.768, 0, 2.7, 0.004, 0.03, 0xffffff, 0.5);
        box(g, 0, 0.768, 0, 0.02, 0.004, 1.48, 0xffffff, 0.5);
        box(g, 0, 0.85, 0, 0.02, 0.16, 1.62, 0xf4f4f0, 0.4, 0, { opacity: 0.75 });
        [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].forEach(function (p) {
            cyl(g, p[0], 0.36, p[1], 0.035, 0.72, 0x2a2f33, 0.5);
        });
    }

    function addArcade(parent, x, z, color) {
        var g = groupAt(parent, x, 0, z);
        box(g, 0, 0.85, 0, 0.72, 1.7, 0.62, color, 0.5);
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
        box(g, 0, 1, 0, 1.4, 2, 0.4, 0x6b4a32, 0.7);
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
        camera = new THREE.PerspectiveCamera(40, 1, 0.4, 120);
        orbit.target = new THREE.Vector3(ct[0], ct[1], ct[2]);
        orbit.defaults.target = [ct[0], ct[1], ct[2]];
        orbit.spherical.radius = orbit.defaults.radius;
        applyOrbitToCamera();

        scene.add(new THREE.AmbientLight(0xffffff, 0.72));
        var key = new THREE.DirectionalLight(0xfff5e8, 1.05);
        key.position.set(8, 18, 10);
        scene.add(key);
        var fill = new THREE.DirectionalLight(0xa8c8e0, 0.4);
        fill.position.set(-10, 8, -6);
        scene.add(fill);
        var hemi = new THREE.HemisphereLight(0xd8ecff, 0x8fbc8f, 0.35);
        scene.add(hemi);

        roomRoot = new THREE.Group();
        scene.add(roomRoot);

        var b = LAYOUT.building;

        var cx = (b.minX + b.maxX) / 2;
        var cz = (b.minZ + b.maxZ) / 2;

        /* --- Lingkungan luar: rumput, trotoar, jalan (seperti referensi) --- */
        addFloorPlane(roomRoot, cx, -0.09, cz, 64, 44, 0x79c25f, 1);
        /* Trotoar keliling gedung */
        addFloorPlane(roomRoot, cx, -0.045, cz,
            (b.maxX - b.minX) + 3.6, (b.maxZ - b.minZ) + 3.6, 0xc9cdd1, 0.95);
        /* Jalan aspal di depan (+z) + marka putus-putus */
        var roadZ = b.maxZ + 4.6;
        addFloorPlane(roomRoot, cx, -0.04, roadZ, 64, 5.4, 0x3c4147, 0.95);
        var laneX;
        for (laneX = -24; laneX <= 24; laneX += 4) {
            box(roomRoot, laneX, -0.02, roadZ, 1.8, 0.012, 0.16, 0xf5f0dc, 0.8);
        }
        /* Pohon, lampu jalan & gerobak digambar dari daftar mebel layout (bisa custom). */

        /* --- Lantai kayu kantor (papan-papan) --- */
        addFloorPlane(roomRoot, cx, 0.004, cz,
            b.maxX - b.minX, b.maxZ - b.minZ, 0xdcbc90, 0.8);
        var plankZ;
        for (plankZ = b.minZ + 0.55; plankZ < b.maxZ - 0.2; plankZ += 0.55) {
            box(roomRoot, cx, 0.012, plankZ, b.maxX - b.minX - 0.1, 0.006, 0.025, 0xc9a876, 0.85);
        }

        /* White room shell — front open for dollhouse.
           Belakang: selalu tinggi penuh (BACK_WALL_H).
           Kiri & kanan: mengikuti slider tinggi dinding (WALL_H). */
        addWall(roomRoot, b.minX, b.minZ, b.maxX, b.minZ, BACK_WALL_H);
        addWall(roomRoot, b.minX, b.minZ, b.minX, b.maxZ);
        addWall(roomRoot, b.maxX, b.minZ, b.maxX, b.maxZ);
        addWall(roomRoot, b.minX, b.maxZ, b.minX + 2.2, b.maxZ, 0.5);

        /* Partisi ruangan dari layout (bisa digeser/diperpendek/dihapus di editor) */
        (LAYOUT.partitions && LAYOUT.partitions.segments || []).forEach(function (seg) {
            if (seg.axis === 'h') {
                addWall(roomRoot, seg.from, seg.at, seg.to, seg.at);
            } else {
                addWall(roomRoot, seg.at, seg.from, seg.at, seg.to);
            }
        });

        /* Tanpa jendela & ornamen dinding (dihapus atas permintaan):
           dinding polos bersih, termasuk tanpa tulisan STARTUP & bingkai lukisan. */

        /* Meja kabinet rendah hard-coded di (-4.6,-3.9) DIHAPUS: meja lepas
           di luar data layout (digambar selalu, tak bisa dihapus di editor)
           yang tampak menempel/menghalangi area meja meeting di screenshot
           dan footprint-nya menimpa meja agen A3. Tumpukan buku di atasnya
           ikut dibersihkan agar tidak melayang tanpa kabinet. */
        addPlant(roomRoot, -5.4, -3.85, 0.55);

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
        var g = groupAt(parent, x, 0, z, rotY || 0);
        /* Meja futuristik: slab putih glossy melayang, kaki panel grafit
           miring, dan strip cahaya cyan di tepi depan + bawah meja. */
        box(g, 0, 0.72, 0, 1.35, 0.06, 0.72, 0xf8fafc, 0.22, 0.08);
        box(g, 0, 0.7, 0.365, 1.35, 0.018, 0.018, 0x22d3ee, 0.4, 0.1, {
            emissive: 0x22d3ee, emissiveIntensity: 0.9
        });
        box(g, 0, 0.675, 0, 1.05, 0.014, 0.4, 0x164e63, 0.4, 0.1, {
            emissive: 0x0e7490, emissiveIntensity: 0.5
        });
        var legL = box(g, -0.56, 0.35, 0, 0.06, 0.68, 0.56, 0x334155, 0.32, 0.65);
        legL.rotation.z = 0.08;
        var legR = box(g, 0.56, 0.35, 0, 0.06, 0.68, 0.56, 0x334155, 0.32, 0.65);
        legR.rotation.z = -0.08;
        /* Monitor ultra-tipis + layar menyala + keyboard slab.
           Agen duduk di sisi -z menghadap +z: keyboard dekat agen (-z),
           monitor lebih jauh (+z) dengan layar menghadap agen (-z). */
        cyl(g, 0, 0.8, 0.18, 0.025, 0.14, 0x64748b, 0.28, 0.85);
        box(g, 0, 0.94, 0.17, 0.54, 0.35, 0.018, 0x0f172a, 0.25, 0.4);
        box(g, 0, 0.94, 0.158, 0.5, 0.31, 0.006, 0x38bdf8, 0.3, 0.05, {
            emissive: 0x38bdf8,
            emissiveIntensity: 0.55
        });
        box(g, 0, 0.758, -0.15, 0.44, 0.014, 0.17, 0x1e293b, 0.4, 0.3);
        /* Kursi futuristik — sisi yang sama dengan posisi duduk agen (z - 0.68) */
        addFutureChair(g, 0, -0.68, 0, seatColor);
        addPlant(g, 0.52, 0.18, 0.35);
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

    function rebuildLabels(employees) {
        if (!labelsRoot) return;
        labelsRoot.innerHTML = '';
        employees.forEach(function (emp) {
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'office-3d-label';
            el.dataset.roleId = emp.id;
            el.innerHTML =
                '<span class="office-3d-action hidden" aria-hidden="true"></span>' +
                '<span class="office-3d-status-pill" data-status="' + escapeHtml(emp.status || 'idle') + '">' +
                escapeHtml(STATUS_LABEL[emp.status] || emp.status || 'Idle') +
                '</span>' +
                '<span class="office-3d-role-badge">' + escapeHtml(roleBadge(emp)) + '</span>';
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof onSelect === 'function') onSelect(emp.id);
            });
            labelsRoot.appendChild(el);
        });
    }

    function updateLabelPositions() {
        if (!labelsRoot || !camera || !renderer) return;
        var rect = renderer.domElement.getBoundingClientRect();
        var labels = labelsRoot.querySelectorAll('.office-3d-label');
        characters.forEach(function (ch, i) {
            var el = labels[i];
            if (!el) return;
            var pos = ch.position.clone();
            pos.y = 2.05;
            pos.project(camera);
            var x = (pos.x * 0.5 + 0.5) * rect.width;
            var y = (-pos.y * 0.5 + 0.5) * rect.height;
            var visible = pos.z < 1;
            el.style.display = visible ? 'flex' : 'none';
            el.style.transform = 'translate(-50%, -100%) translate(' + x + 'px, ' + y + 'px)';

            var st = ch.userData.status || 'idle';
            var pill = el.querySelector('.office-3d-status-pill');
            if (pill && pill.dataset.status !== st) {
                pill.dataset.status = st;
                pill.textContent = STATUS_LABEL[st] || st;
            }

            var placement = ch.userData.placement;
            var actionEl = el.querySelector('.office-3d-action');
            if (actionEl) {
                var text = placement && placement.speech ? placement.speech : '';
                if (text) {
                    actionEl.textContent = text;
                    actionEl.classList.remove('hidden');
                    actionEl.classList.toggle('is-idle', st === 'idle');
                } else {
                    actionEl.textContent = '';
                    actionEl.classList.add('hidden');
                }
            }
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
        if (walking) {
            var swing = Math.sin(t * 10 + ud.phase) * 0.55;
            parts.head.rotation.y = Math.sin(t * 5 + ud.phase) * 0.06;
            parts.leftLeg.rotation.x = swing;
            parts.rightLeg.rotation.x = -swing;
            parts.leftArm.rotation.x = -swing * 0.85;
            parts.rightArm.rotation.x = swing * 0.85;
            parts.body.position.y = 0;
            parts.torso.rotation.z = 0;
            return;
        }

        if (pose === 'slump' || activity === 'failed') {
            parts.leftArm.rotation.x = 0.35;
            parts.rightArm.rotation.x = 0.35;
            parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.body.position.y = seated ? -0.12 : 0;
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
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = -1.05 + Math.sin(t * 14) * 0.12;
            parts.rightArm.rotation.x = -1.05 + Math.cos(t * 14) * 0.12;
            parts.body.position.y = -0.14;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'review' || activity === 'needs_info') {
            parts.leftLeg.rotation.x = -Math.PI / 2.2;
            parts.rightLeg.rotation.x = -Math.PI / 2.2;
            parts.leftArm.rotation.x = -0.35;
            parts.rightArm.rotation.x = -1.15;
            parts.head.rotation.y = Math.sin(t * 1.4 + ud.phase) * 0.25;
            parts.body.position.y = -0.14;
            parts.torso.rotation.z = 0;
            return;
        }

        if (activity === 'chat' || activity === 'game' || activity === 'arcade') {
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
                    var heading = Math.atan2(dx, dz);
                    var dy = heading - ch.rotation.y;
                    while (dy > Math.PI) dy -= Math.PI * 2;
                    while (dy < -Math.PI) dy += Math.PI * 2;
                    ch.rotation.y += dy * 0.22;
                }
            }
        }

        if (!walking) {
            var dy2 = (ud.targetFacing || 0) - ch.rotation.y;
            while (dy2 > Math.PI) dy2 -= Math.PI * 2;
            while (dy2 < -Math.PI) dy2 += Math.PI * 2;
            ch.rotation.y += dy2 * 0.12;
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

        characters.forEach(function (ch) { animateCharacter(ch, t, dt); });
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

        clickHandler = function (e) {
            if (orbit.moved) return;
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
        __test: {
            buildLayout: buildLayout, deskSeatSpot: deskSeatSpot, deskInfo: deskInfo,
            deriveIdleStops: deriveIdleStops, navPath: navPath, pointBlocked: pointBlocked,
            getLayoutRef: function () { return LAYOUT; }
        },
        getDefaultLayout: defaultLayoutData
    };
})(typeof window !== 'undefined' ? window : globalThis);
