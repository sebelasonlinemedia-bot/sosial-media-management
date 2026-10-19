/**
 * PiK's Digital Lab — Kantor AI 3D viewport (vanilla Three.js CDN).
 *
 * Cut-away isometric office inspired by corporate floor illustrations:
 * light grey flooring, wood desks + dual monitors, glass meeting room,
 * kitchen island, planter dividers, soft blue sky. Crew are stylized
 * humanoids (capsule + sphere — not blocky boxes). Activity labels + orbit.
 *
 * Work board remains the primary UI; this stage is decorative + focus helper.
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'piks-digital-lab-office-3d';
    var IDLE_STOP_MS = 28000;
    var WALK_SPEED = 2.6;

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

    /* Ruang-inspired world units (y up, +z toward street). Sized for 7 agents. */
    var PARTITION_X = 0.4;
    var LOUNGE_PARTITION_END_Z = -0.5;
    var GAME_ROOM = { minX: 9.5, maxX: 15.5, minZ: -5.2, maxZ: 0.6 };
    var PING_PONG = [12.6, 0, -1.4];
    var ARCADES = [[10.6, 0, -4.75], [11.6, 0, -4.75]];
    var BEANBAGS = [[13.7, 0, -4.35], [14.7, 0, -4.35]];
    var TV = [4.6, 0, -4.8];
    var SOFA = [4.6, 0, -1.3];
    var COFFEE_TABLE = [4.6, 0, -2.9];
    var AISLE_Z = 0.4;
    var WALL_H = 2.6;
    var WALL = 0xf4f6f8;
    var WALL_TOP = 0xe2e8f0;

    var LAYOUT = buildLayout(7);

    function buildLayout(agentCount) {
        var deskCount = Math.max(1, agentCount);
        var columns = Math.max(3, Math.ceil(deskCount / 2));
        var DESK_RIGHT_X = -2;
        var DESK_PITCH = 2.6;
        var DESK_ROWS_Z = [-3.5, -1];
        var desks = [];
        var i;
        for (i = 0; i < deskCount; i += 1) {
            var row = i < columns ? 0 : 1;
            var column = row === 0 ? i : i - columns;
            desks.push([DESK_RIGHT_X - column * DESK_PITCH, DESK_ROWS_Z[row]]);
        }
        var minX = DESK_RIGHT_X - (columns - 1) * DESK_PITCH - 2.3;
        var building = { minX: minX, maxX: 9.5, minZ: -5.2, maxZ: 4.2 };
        var meetingCenterX = (minX - 3.2) / 2;
        if (meetingCenterX > -4.5) meetingCenterX = -5.5;

        var meeting = [
            { x: meetingCenterX - 0.85, z: 2.55, facing: Math.PI / 2, seated: true },
            { x: meetingCenterX + 0.85, z: 2.55, facing: -Math.PI / 2, seated: true },
            { x: meetingCenterX, z: 3.35, facing: Math.PI, seated: true },
            { x: meetingCenterX, z: 1.75, facing: 0, seated: false }
        ];

        var idleStops = [
            {
                key: 'lounge',
                label: 'Relaxing in the lounge',
                spots: [
                    { x: 5.2, z: -1.6, facing: Math.PI, seated: true },
                    { x: 3.8, z: -2.4, facing: Math.PI / 2, seated: true }
                ]
            },
            {
                key: 'kitchen',
                label: 'Coffee break at the island',
                spots: [
                    { x: 7.6, z: 1.15, facing: Math.PI, seated: true },
                    { x: 8.2, z: 1.15, facing: Math.PI, seated: true },
                    { x: 8.8, z: 1.15, facing: Math.PI, seated: true }
                ]
            },
            {
                key: 'galon',
                label: 'Getting water from the cooler',
                spots: [
                    { x: 8.9, z: -0.55, facing: Math.PI / 2, seated: false },
                    { x: 8.75, z: -1.15, facing: 2.2, seated: false }
                ]
            },
            {
                key: 'dapur',
                label: 'In the kitchen',
                spots: [
                    { x: 8.25, z: 2.6, facing: Math.PI / 2, seated: false },
                    { x: 8.3, z: 0.65, facing: Math.PI / 2, seated: false }
                ]
            },
            {
                key: 'meeting',
                label: 'Chatting in the glass room',
                spots: [
                    { x: meetingCenterX - 0.9, z: 2.55, facing: Math.PI / 2, seated: true },
                    { x: meetingCenterX + 0.9, z: 2.55, facing: -Math.PI / 2, seated: true },
                    { x: meetingCenterX, z: 3.25, facing: Math.PI, seated: true }
                ]
            },
            {
                key: 'jalan',
                label: 'Walking the aisle',
                spots: [
                    { x: 1.2, z: AISLE_Z, facing: 0, seated: false },
                    { x: -2.5, z: AISLE_Z, facing: Math.PI, seated: false },
                    { x: 4.5, z: AISLE_Z, facing: 0, seated: false }
                ]
            }
        ];

        return {
            aisleZ: AISLE_Z,
            desks: desks,
            building: building,
            meeting: meeting,
            meetingTable: { x: meetingCenterX, z: 2.55, radius: 0.95 },
            cameraTarget: [(minX + 9.5) / 2, 0.55, 0.1],
            cameraOffset: [-4.2, 14.8, 17.5],
            pan: { minX: minX - 3, maxX: 12, minZ: -6, maxZ: 8 },
            idleStops: idleStops,
            idleRoute: ['lounge', 'kitchen', 'galon', 'meeting', 'dapur', 'jalan', 'lounge']
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
        spherical: { radius: 24, phi: 0.92, theta: 0.42 },
        defaults: { radius: 24, phi: 0.92, theta: 0.42, target: [0, 0.6, 0.2] },
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

    function aislePath(fromX, fromZ, toX, toZ) {
        var az = LAYOUT.aisleZ;
        var pts = [];
        if (Math.abs(fromZ - az) > 0.12) pts.push({ x: fromX, z: az });
        if (Math.abs(fromX - toX) > 0.12) pts.push({ x: toX, z: az });
        pts.push({ x: toX, z: toZ });
        return pts;
    }

    function placementFor(emp, seatIndex, idleAssignment, meetingIndex) {
        var st = emp.status || 'idle';
        if (st === 'awaiting_approval') {
            var m = LAYOUT.meeting[meetingIndex % LAYOUT.meeting.length];
            return {
                x: m.x, z: m.z, facing: m.facing, seated: !!m.seated,
                pose: m.seated ? 'sit' : 'stand',
                activity: 'chat',
                speech: statusSpeech(emp),
                label: STATUS_LABEL[st]
            };
        }
        if (st === 'working' || st === 'standby' || st === 'needs_info' || st === 'failed' || st === 'done') {
            var desk = LAYOUT.desks[seatIndex % LAYOUT.desks.length];
            return {
                x: desk[0], z: desk[1] - 0.78, facing: 0,
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
                x: spot.x, z: spot.z, facing: spot.facing,
                seated: !!spot.seated,
                pose: spot.seated ? 'sit' : 'stand',
                activity: idleAssignment.stop.key,
                speech: idleAssignment.stop.label,
                label: STATUS_LABEL.idle,
                idleKey: idleAssignment.stop.key
            };
        }
        var desk2 = LAYOUT.desks[seatIndex % LAYOUT.desks.length];
        return {
            x: desk2[0], z: desk2[1] - 0.78, facing: 0, seated: false,
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

    function addWindow(parent, x, y, z, width, rotY) {
        var g = groupAt(parent, x, y, z, rotY || 0);
        var w = width || 1.8;
        box(g, 0, 0, 0, w + 0.12, 1.22, 0.12, 0x5a4636, 0.8);
        var glass = new THREE.Mesh(
            new THREE.PlaneGeometry(w, 1.1),
            mat(0x9fd3ea, 0.05, 0.2, { emissive: 0x6fb6d6, emissiveIntensity: 0.35 })
        );
        glass.position.z = 0.065;
        g.add(glass);
        box(g, 0, 0, 0.08, 0.05, 1.1, 0.03, 0x5a4636, 0.8);
        return g;
    }

    function addGlassX(parent, x, fromZ, toZ, bottom) {
        var top = WALL_H - 0.2;
        box(parent, x, (bottom + top) / 2, (fromZ + toZ) / 2,
            0.05, top - bottom, Math.abs(toZ - fromZ),
            0xcfe8ee, 0.05, 0.1, { opacity: 0.28 });
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

    function addOfficeChair(parent, x, z, rotY, color) {
        var g = groupAt(parent, x, 0, z, rotY || 0);
        var c = color || 0x2f3a44;
        box(g, 0, 0.48, 0, 0.52, 0.09, 0.5, c, 0.9);
        box(g, 0, 0.85, -0.23, 0.5, 0.6, 0.07, c, 0.9);
        cyl(g, 0, 0.25, 0, 0.035, 0.42, 0x8b9297, 0.3, 0.6);
        var spoke;
        for (spoke = 0; spoke < 5; spoke += 1) {
            var a = (spoke / 5) * Math.PI * 2;
            var sb = box(g, Math.sin(a) * 0.2, 0.05, Math.cos(a) * 0.2, 0.05, 0.04, 0.42, 0x2a2f33, 0.6);
            sb.rotation.y = a;
        }
    }

    function addWorkDesk(parent, x, z, active) {
        var g = groupAt(parent, x, 0, z);
        box(g, 0, 0.74, 0, 1.9, 0.07, 0.95, 0xf2f0ea, 0.55);
        box(g, -0.9, 0.37, 0, 0.06, 0.72, 0.85, 0xe7e2d8, 0.7);
        box(g, 0.9, 0.37, 0, 0.06, 0.72, 0.85, 0xe7e2d8, 0.7);
        box(g, 0.55, 0.52, 0.02, 0.42, 0.4, 0.8, 0xe7e2d8, 0.7);
        box(g, 0, 1.13, 0.22, 0.86, 0.52, 0.05, 0x1c2024, 0.4);
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

    function addRoundMeetingTable(parent, x, z, radius) {
        var g = groupAt(parent, x, 0, z);
        var r = radius || 1.05;
        cyl(g, 0, 0.72, 0, r, 0.07, 0x6e4a30, 0.4, 0.05, { segments: 28 });
        cyl(g, 0, 0.36, 0, 0.12, 0.68, 0x2a2f33, 0.5, 0.3);
        cyl(g, 0, 0.06, 0, 0.55, 0.06, 0x2a2f33, 0.5);
        addOfficeChair(g, -r * 0.85, 0, Math.PI / 2);
        addOfficeChair(g, r * 0.85, 0, -Math.PI / 2);
        addOfficeChair(g, 0, r * 0.8, Math.PI);
        addOfficeChair(g, 0, -r * 0.8, 0);
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

    function addFoodStall(parent, x, z) {
        var g = groupAt(parent, x, 0, z, Math.PI / 2);
        box(g, 0, 0.72, 0, 1.6, 0.8, 0.75, 0xf3efe4, 0.6);
        box(g, 0, 0.34, 0, 1.65, 0.06, 0.8, 0xc62828, 0.5);
        box(g, 0, 1.14, 0, 1.65, 0.05, 0.8, 0xc62828, 0.5);
        [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].forEach(function (p) {
            cyl(g, p[0], 1.7, p[1], 0.025, 1.1, 0x6b4a32, 0.8);
        });
        box(g, 0, 2.28, 0, 1.9, 0.08, 1.0, 0xc62828, 0.5);
        /* simple vendor */
        box(g, -1.35, 0.98, 0, 0.42, 0.55, 0.28, 0xf1f1ec, 0.85);
        box(g, -1.35, 1.48, 0, 0.36, 0.36, 0.34, 0xc98e5a, 0.7);
        box(g, -1.35, 1.72, 0, 0.34, 0.12, 0.32, 0x1b1d20, 0.9);
        /* bike hint */
        var bike = groupAt(parent, x + 1.2, 0, z + 1.4);
        var w1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 20), mat(0x1f2326, 0.8));
        w1.position.set(-0.45, 0.3, 0);
        w1.rotation.y = Math.PI / 2;
        bike.add(w1);
        var w2 = w1.clone();
        w2.position.x = 0.45;
        bike.add(w2);
        box(bike, 0, 0.55, 0, 0.9, 0.04, 0.04, 0x3d7fd6, 0.4, 0.3);
    }

    function addOfficeLight(parent, x, y, z) {
        var g = groupAt(parent, x, y, z);
        box(g, 0, 0, 0, 1.4, 0.06, 0.16, 0xd9dde0, 0.35, 0.4);
        var glow = new THREE.Mesh(
            new THREE.PlaneGeometry(1.32, 0.11),
            mat(0xffffff, 0.5, 0, { emissive: 0xf2f6ff, emissiveIntensity: 0.9, side: THREE.DoubleSide })
        );
        glow.position.y = -0.032;
        glow.rotation.x = Math.PI / 2;
        g.add(glow);
    }

    /* ---------- Scene ---------- */

    function buildScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xb8d4e8);
        scene.fog = new THREE.Fog(0xb8d4e8, 28, 55);

        var ct = LAYOUT.cameraTarget;
        camera = new THREE.PerspectiveCamera(40, 1, 0.4, 120);
        orbit.target = new THREE.Vector3(ct[0], ct[1], ct[2]);
        orbit.defaults.target = [ct[0], ct[1], ct[2]];
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
        var mx = LAYOUT.meetingTable.x;
        var mz = LAYOUT.meetingTable.z;

        /* Soft ground under cut-away (illustration sky show-through) */
        addFloorPlane(roomRoot, (b.minX + b.maxX) / 2, -0.04, (b.minZ + b.maxZ) / 2,
            40, 32, 0x9ec9e8, 1);

        /* Main office — light grey corporate floor */
        addFloorPlane(roomRoot, (b.minX + b.maxX) / 2, 0.005, (b.minZ + b.maxZ) / 2,
            b.maxX - b.minX + 0.4, b.maxZ - b.minZ + 0.4, 0xd8dde3, 0.42);

        /* Cut-away exterior walls (white) */
        addWall(roomRoot, b.minX, b.minZ, b.maxX, b.minZ);
        addWall(roomRoot, b.minX, b.minZ, b.minX, b.maxZ);
        addWall(roomRoot, b.maxX, b.minZ, b.maxX, b.maxZ);
        /* Front partially open for dollhouse view */
        addWall(roomRoot, b.minX, b.maxZ, (b.minX + b.maxX) * 0.35, b.maxZ, 0.55);

        /* Windows along back wall */
        [-6.5, -3.2, 0.5, 4.2, 7.2].forEach(function (wx) {
            if (wx > b.minX + 0.8 && wx < b.maxX - 0.8) {
                addWindow(roomRoot, wx, 1.5, b.minZ + 0.12, 1.7, 0);
            }
        });

        /* Glass meeting room (black frame + glass) */
        addGlassMeetingRoom(roomRoot, mx, mz, 3.6, 2.9);

        /* Long conference table + chairs */
        addConferenceTable(roomRoot, mx, mz, 2.4, 0.9);
        addMeetingChair(roomRoot, mx - 0.85, mz - 0.55, 0);
        addMeetingChair(roomRoot, mx, mz - 0.55, 0);
        addMeetingChair(roomRoot, mx + 0.85, mz - 0.55, 0);
        addMeetingChair(roomRoot, mx - 0.85, mz + 0.55, Math.PI);
        addMeetingChair(roomRoot, mx + 0.85, mz + 0.55, Math.PI);
        addTelevision(roomRoot, mx, 1.4, mz - 1.35);

        /* Planter dividers (illustration cue) */
        addPlanterBox(roomRoot, -1.2, -0.2, 2.8, 0.45);
        addPlanterBox(roomRoot, 2.4, -3.8, 3.2, 0.4);
        addPlanterBox(roomRoot, 5.5, 0.2, 0.45, 2.4);

        /* Work desks — light wood */
        LAYOUT.desks.forEach(function (d) {
            addCorporateDesk(roomRoot, d[0], d[1]);
        });

        /* Lounge — blue armchair + low table */
        addArmchair(roomRoot, 5.2, -1.55, Math.PI, 0x3b6ea5);
        addCoffeeTable(roomRoot, 5.2, -2.5);
        addPlant(roomRoot, 6.4, -3.9, 1.05);
        addPlant(roomRoot, 3.9, -3.85, 0.95);

        /* Kitchen: counter, fridge, island + bar stools */
        addFridge(roomRoot, b.maxX - 0.55, 2.8, -Math.PI / 2);
        addPantryCounter(roomRoot, b.maxX - 0.5, 1.5, -Math.PI / 2);
        addGalon(roomRoot, b.maxX - 0.5, -0.5, -Math.PI / 2);
        addKitchenIsland(roomRoot, 8.2, 1.55);
        addBarStool(roomRoot, 7.55, 1.05);
        addBarStool(roomRoot, 8.2, 1.05);
        addBarStool(roomRoot, 8.85, 1.05);

        /* Accent plants */
        addPlant(roomRoot, b.minX + 0.55, -4.4, 1.1);
        addPlant(roomRoot, b.minX + 0.55, 3.6, 1.0);
        addPlant(roomRoot, 1.0, 3.5, 0.85);
        addPlant(roomRoot, b.maxX - 0.7, -4.3, 1.05);
        addBookshelf(roomRoot, b.minX + 0.4, 0.4, Math.PI / 2);

        LAYOUT.desks.forEach(function (d) {
            addOfficeLight(roomRoot, d[0], 2.45, d[1] + 0.15);
        });
        addOfficeLight(roomRoot, mx, 2.45, mz);
        addOfficeLight(roomRoot, 8.2, 2.45, 1.5);
        addOfficeLight(roomRoot, 5.2, 2.45, -2.0);

        /* Brand plaque */
        box(roomRoot, 1.5, 2.35, b.minZ + 0.12, 2.4, 0.28, 0.04, 0x1e3a5f, 0.5);
    }

    function addGlassMeetingRoom(parent, cx, cz, w, d) {
        var hw = w / 2;
        var hd = d / 2;
        var frame = 0x1f2937;
        var gh = WALL_H * 0.92;
        addFloorPlane(parent, cx, 0.012, cz, w - 0.15, d - 0.15, 0xeef2f6, 0.48);
        /* Thin black frames */
        box(parent, cx - hw, gh / 2, cz, 0.05, gh, d, frame, 0.55);
        box(parent, cx + hw, gh / 2, cz, 0.05, gh, d, frame, 0.55);
        box(parent, cx, gh / 2, cz - hd, w, gh, 0.05, frame, 0.55);
        box(parent, cx - hw * 0.25, gh / 2, cz + hd, w * 0.5, gh, 0.05, frame, 0.55);
        /* Glass panes */
        addGlassX(parent, cx - hw + 0.04, cz - hd + 0.05, cz + hd - 0.05, 0.35);
        addGlassX(parent, cx + hw - 0.04, cz - hd + 0.05, cz + hd - 0.05, 0.35);
        addGlassZ(parent, cx - hw + 0.05, cx + hw - 0.05, cz - hd + 0.04, 0.9);
        addGlassZ(parent, cx - hw + 0.05, cx - 0.15, cz + hd - 0.04, 0.7);
    }

    function addGlassZ(parent, x0, x1, z, opacity) {
        var w = Math.abs(x1 - x0);
        var glass = new THREE.Mesh(
            new THREE.BoxGeometry(w, WALL_H * 0.85, 0.04),
            mat(0xb8d4e8, 0.15, 0.05, {
                transparent: true,
                opacity: opacity == null ? 0.28 : opacity * 0.35,
                side: THREE.DoubleSide
            })
        );
        glass.position.set((x0 + x1) / 2, WALL_H * 0.5, z);
        parent.add(glass);
    }

    function addConferenceTable(parent, x, z, w, d) {
        box(parent, x, 0.72, z, w, 0.06, d, 0xc4a574, 0.45);
        box(parent, x - w * 0.35, 0.36, z - d * 0.3, 0.08, 0.72, 0.08, 0x3a3a3a, 0.5);
        box(parent, x + w * 0.35, 0.36, z - d * 0.3, 0.08, 0.72, 0.08, 0x3a3a3a, 0.5);
        box(parent, x - w * 0.35, 0.36, z + d * 0.3, 0.08, 0.72, 0.08, 0x3a3a3a, 0.5);
        box(parent, x + w * 0.35, 0.36, z + d * 0.3, 0.08, 0.72, 0.08, 0x3a3a3a, 0.5);
    }

    function addMeetingChair(parent, x, z, rotY) {
        var g = new THREE.Group();
        g.position.set(x, 0, z);
        if (rotY) g.rotation.y = rotY;
        box(g, 0, 0.42, 0, 0.42, 0.06, 0.42, 0x2c3e50, 0.7);
        box(g, 0, 0.72, -0.16, 0.42, 0.55, 0.06, 0x2c3e50, 0.7);
        parent.add(g);
    }

    function addPlanterBox(parent, x, z, w, d) {
        box(parent, x, 0.22, z, w, 0.44, d, 0xe8eaed, 0.55);
        box(parent, x, 0.46, z, w - 0.08, 0.08, d - 0.08, 0x3d6b4f, 0.85);
        var i;
        for (i = 0; i < 3; i += 1) {
            addPlant(parent, x - w * 0.3 + i * (w * 0.3), z, 0.55 + (i % 2) * 0.12);
        }
    }

    function addCorporateDesk(parent, x, z) {
        /* Light wood desk + dual monitors + chair */
        box(parent, x, 0.72, z, 1.35, 0.05, 0.7, 0xd4b896, 0.5);
        box(parent, x - 0.55, 0.36, z - 0.25, 0.06, 0.72, 0.06, 0x2a2a2a, 0.55);
        box(parent, x + 0.55, 0.36, z - 0.25, 0.06, 0.72, 0.06, 0x2a2a2a, 0.55);
        box(parent, x - 0.55, 0.36, z + 0.25, 0.06, 0.72, 0.06, 0x2a2a2a, 0.55);
        box(parent, x + 0.55, 0.36, z + 0.25, 0.06, 0.72, 0.06, 0x2a2a2a, 0.55);
        /* Privacy screen */
        box(parent, x, 1.05, z - 0.32, 1.2, 0.55, 0.04, 0x5b7fa6, 0.65);
        addMonitor(parent, x - 0.28, z - 0.12);
        addMonitor(parent, x + 0.28, z - 0.12);
        /* Chair */
        var ch = new THREE.Group();
        ch.position.set(x, 0, z + 0.72);
        box(ch, 0, 0.4, 0, 0.4, 0.08, 0.4, 0x1e293b, 0.7);
        box(ch, 0, 0.7, -0.14, 0.4, 0.5, 0.06, 0x334155, 0.7);
        parent.add(ch);
    }

    function addMonitor(parent, x, z) {
        box(parent, x, 0.95, z, 0.42, 0.28, 0.03, 0x111827, 0.4);
        box(parent, x, 0.95, z + 0.01, 0.36, 0.22, 0.01, 0x38bdf8, 0.3, 0.05, {
            emissive: 0x0ea5e9,
            emissiveIntensity: 0.35
        });
        box(parent, x, 0.78, z, 0.06, 0.12, 0.04, 0x374151, 0.5);
    }

    function addKitchenIsland(parent, x, z) {
        box(parent, x, 0.45, z, 2.0, 0.9, 0.7, 0x4a5568, 0.55);
        box(parent, x, 0.92, z, 2.05, 0.06, 0.75, 0xf1f5f9, 0.4);
        box(parent, x + 0.5, 1.05, z - 0.1, 0.35, 0.22, 0.28, 0xcbd5e1, 0.5);
    }

    function addBarStool(parent, x, z) {
        var g = new THREE.Group();
        g.position.set(x, 0, z);
        box(g, 0, 0.55, 0, 0.08, 1.1, 0.08, 0x2d3748, 0.5);
        box(g, 0, 1.12, 0, 0.36, 0.06, 0.36, 0x38a169, 0.7);
        parent.add(g);
    }

    /* ---------- Characters (stylized realistic — capsule/sphere, not boxes) ---------- */

    function createLimb(matBody, radius, length) {
        var geo;
        if (THREE.CapsuleGeometry) {
            geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 8);
        } else {
            geo = new THREE.CylinderGeometry(radius, radius, length, 8);
        }
        geo.translate(0, -length / 2, 0);
        return new THREE.Mesh(geo, matBody);
    }

    function createHumanoid(colorHex, look) {
        var root = new THREE.Group();
        var bodyMat = mat(colorHex, 0.62, 0.06);
        var darkMat = mat(look && look.pants ? look.pants : 0x2c3e50, 0.78, 0.04);
        var skinMat = mat(look && look.skin ? look.skin : 0xe0b089, 0.72, 0.02);
        var hairMat = mat(look && look.hair ? look.hair : 0x2a2118, 0.88, 0.02);
        var shoeMat = mat(0x1a1a1a, 0.55, 0.15);

        var body = new THREE.Group();
        body.name = 'body';
        root.add(body);

        /* Hips + torso (business-casual proportions) */
        var hips = new THREE.Mesh(
            THREE.CapsuleGeometry
                ? new THREE.CapsuleGeometry(0.16, 0.12, 4, 10)
                : new THREE.CylinderGeometry(0.16, 0.16, 0.28, 10),
            darkMat
        );
        hips.position.y = 0.78;
        body.add(hips);

        var torso = new THREE.Mesh(
            THREE.CapsuleGeometry
                ? new THREE.CapsuleGeometry(0.2, 0.36, 6, 12)
                : new THREE.CylinderGeometry(0.2, 0.22, 0.62, 12),
            bodyMat
        );
        torso.position.y = 1.12;
        body.add(torso);

        /* Head — sphere + soft jaw */
        var head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14), skinMat);
        head.position.y = 1.58;
        head.scale.set(0.95, 1.08, 0.92);
        body.add(head);

        var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skinMat);
        neck.position.y = 1.425;
        body.add(neck);

        /* Hair cap */
        var hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
        hair.position.y = 1.64;
        hair.scale.set(1.02, 0.85, 1.05);
        body.add(hair);

        /* Simple eyes */
        var eyeMat = mat(0x1e293b, 0.4, 0.1);
        var leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
        leftEye.position.set(-0.045, 1.59, 0.13);
        body.add(leftEye);
        var rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
        rightEye.position.set(0.045, 1.59, 0.13);
        body.add(rightEye);

        var leftArm = createLimb(bodyMat, 0.055, 0.5);
        leftArm.position.set(-0.26, 1.32, 0);
        leftArm.name = 'leftArm';
        body.add(leftArm);

        var rightArm = createLimb(bodyMat, 0.055, 0.5);
        rightArm.position.set(0.26, 1.32, 0);
        rightArm.name = 'rightArm';
        body.add(rightArm);

        var leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skinMat);
        leftHand.position.set(-0.26, 0.8, 0);
        body.add(leftHand);
        var rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skinMat);
        rightHand.position.set(0.26, 0.8, 0);
        body.add(rightHand);

        var leftLeg = createLimb(darkMat, 0.065, 0.58);
        leftLeg.position.set(-0.09, 0.72, 0);
        leftLeg.name = 'leftLeg';
        body.add(leftLeg);

        var rightLeg = createLimb(darkMat, 0.065, 0.58);
        rightLeg.position.set(0.09, 0.72, 0);
        rightLeg.name = 'rightLeg';
        body.add(rightLeg);

        var leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), shoeMat);
        leftShoe.position.set(-0.09, 0.04, 0.02);
        body.add(leftShoe);
        var rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), shoeMat);
        rightShoe.position.set(0.09, 0.04, 0.02);
        body.add(rightShoe);

        var aura = new THREE.Mesh(
            new THREE.RingGeometry(0.32, 0.42, 28),
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

        if (walking) {
            var swing = Math.sin(t * 10 + ud.phase) * 0.55;
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
                walking = true;
                var step = Math.min(dist, dt * WALK_SPEED);
                ch.position.x += (dx / dist) * step;
                ch.position.z += (dz / dist) * step;
                var heading = Math.atan2(dx, dz);
                var dy = heading - ch.rotation.y;
                while (dy > Math.PI) dy -= Math.PI * 2;
                while (dy < -Math.PI) dy += Math.PI * 2;
                ch.rotation.y += dy * 0.22;
            }
        }

        if (!walking) {
            var dy2 = (ud.targetFacing || 0) - ch.rotation.y;
            while (dy2 > Math.PI) dy2 -= Math.PI * 2;
            while (dy2 < -Math.PI) dy2 += Math.PI * 2;
            ch.rotation.y += dy2 * 0.12;
        }

        applyPose(ch, t, walking);
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
                var desk = LAYOUT.desks[i % LAYOUT.desks.length];
                ch.position.set(desk[0], 0, desk[1] - 0.78);
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
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
                else child.material.dispose();
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
            orbit.spherical.radius = Math.min(48, Math.max(8, orbit.spherical.radius * factor));
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

    function init(el, options) {
        options = options || {};
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
        isPanMode: isPanMode
    };
})(typeof window !== 'undefined' ? window : globalThis);
