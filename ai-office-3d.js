/**
 * PiK's Digital Lab — Kantor AI 3D viewport (vanilla Three.js CDN).
 *
 * Adapted conceptually from yugienugraha/ruang (MIT License, Copyright 2026 yugienugraha):
 * multi-zone room layout, low-poly crew, status→placement, idle wander route,
 * aisle walking, typing/chat poses, and speech-bubble activity labels.
 * This is a compact single-floor adaptation for 7 Tim Konten roles — not a
 * full port of Ruang's multi-floor / Hermes mission-control scene.
 *
 * Work board remains the primary UI; this stage is decorative + focus helper.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'piks-digital-lab-office-3d';
    const IDLE_STOP_MS = 28000;
    const WALK_SPEED = 2.4;

    const STATUS_AURA = {
        idle: 0x64748b,
        needs_info: 0xf59e0b,
        awaiting_approval: 0xea580c,
        working: 0x0d9488,
        done: 0x10b981,
        failed: 0xef4444
    };

    const STATUS_LABEL = {
        idle: 'Siaga',
        needs_info: 'Perlu info',
        awaiting_approval: 'Approval',
        working: 'Kerja',
        done: 'Selesai',
        failed: 'Gagal'
    };

    /** Compact single-floor layout (inspired by Ruang zones, scaled for 7 roles). */
    const LAYOUT = {
        aisleZ: 0.85,
        desks: [
            [-4.2, -2.35], [-2.4, -2.35], [-0.6, -2.35], [1.2, -2.35],
            [-4.2, -0.95], [-2.4, -0.95], [-0.6, -0.95]
        ],
        meeting: [
            { x: 3.4, z: -0.4, facing: Math.PI / 2, seated: true },
            { x: 4.6, z: -0.4, facing: -Math.PI / 2, seated: true },
            { x: 4.0, z: 0.55, facing: Math.PI, seated: true },
            { x: 4.0, z: -1.35, facing: 0, seated: false }
        ],
        idleStops: [
            {
                key: 'lounge',
                label: 'Istirahat di lounge',
                spots: [
                    { x: 3.6, z: 2.15, facing: Math.PI, seated: true },
                    { x: 4.6, z: 2.15, facing: Math.PI, seated: true },
                    { x: 5.4, z: 1.55, facing: -Math.PI / 2, seated: true }
                ]
            },
            {
                key: 'break',
                label: 'Ambil air / coffee break',
                spots: [
                    { x: -5.1, z: 1.6, facing: Math.PI / 2, seated: false },
                    { x: -5.1, z: 2.2, facing: Math.PI / 2, seated: false }
                ]
            },
            {
                key: 'walk',
                label: 'Jalan di koridor',
                spots: [
                    { x: -1.5, z: 0.85, facing: Math.PI / 2, seated: false },
                    { x: 1.8, z: 0.85, facing: -Math.PI / 2, seated: false },
                    { x: 0.2, z: 2.4, facing: Math.PI, seated: false }
                ]
            },
            {
                key: 'chat',
                label: 'Ngobrol singkat',
                spots: [
                    { x: 3.2, z: 0.9, facing: Math.PI / 2, seated: false },
                    { x: 4.0, z: 0.9, facing: -Math.PI / 2, seated: false }
                ]
            }
        ],
        idleRoute: ['lounge', 'break', 'walk', 'chat', 'lounge', 'walk', 'break', 'chat']
    };

    let THREE = null;
    let renderer = null;
    let scene = null;
    let camera = null;
    let clock = null;
    let rafId = 0;
    let container = null;
    let canvas = null;
    let labelsRoot = null;
    let raycaster = null;
    let pointer = null;
    let characters = [];
    let roomProps = [];
    let enabled = true;
    let reduced = false;
    let paused = false;
    let onSelect = null;
    let onActivity = null;
    let resizeObserver = null;
    let visibilityHandler = null;
    let clickHandler = null;
    let orbitAngle = 0.42;
    let lastActivityDigest = '';
    let lastIdleStep = -1;
    let employeesCache = [];

    function loadPreference() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
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
        const st = emp.status || 'idle';
        const brief = (emp.latestJob && emp.latestJob.brief) ? String(emp.latestJob.brief).slice(0, 42) : '';
        if (st === 'working') return brief ? ('Kerja: ' + brief) : 'Mengerjakan brief…';
        if (st === 'needs_info') return 'Perlu info dari manusia';
        if (st === 'awaiting_approval') return 'Menunggu approval';
        if (st === 'failed') return emp.latestJob && emp.latestJob.lastError
            ? String(emp.latestJob.lastError).slice(0, 40)
            : 'Job gagal';
        if (st === 'done') return 'Selesai — siap brief berikutnya';
        return '';
    }

    /** Deterministic idle assignment (Ruang-style idlePlan, decorative only). */
    function idlePlan(seatIndexes, nowMs) {
        const plan = new Map();
        const taken = new Map();
        const step = Math.floor(nowMs / IDLE_STOP_MS);
        const stopAt = function (index) {
            const key = LAYOUT.idleRoute[index % LAYOUT.idleRoute.length];
            return LAYOUT.idleStops.find(function (s) { return s.key === key; });
        };
        seatIndexes.slice().sort(function (a, b) { return a - b; }).forEach(function (seat) {
            const start = step + seat * 2;
            let stop = stopAt(start);
            for (let offset = 0; offset < LAYOUT.idleRoute.length; offset += 1) {
                const candidate = stopAt(start + offset);
                if ((taken.get(candidate.key) || 0) < candidate.spots.length) {
                    stop = candidate;
                    break;
                }
            }
            const used = taken.get(stop.key) || 0;
            taken.set(stop.key, used + 1);
            plan.set(seat, { stop: stop, spot: stop.spots[used % stop.spots.length] });
        });
        return plan;
    }

    function aislePath(fromX, fromZ, toX, toZ) {
        const ax = fromX;
        const az = LAYOUT.aisleZ;
        const bx = toX;
        const bz = LAYOUT.aisleZ;
        const pts = [];
        if (Math.abs(fromZ - az) > 0.12) pts.push({ x: ax, z: az });
        if (Math.abs(ax - bx) > 0.12) pts.push({ x: bx, z: bz });
        pts.push({ x: toX, z: toZ });
        return pts;
    }

    function placementFor(emp, seatIndex, idleAssignment, meetingIndex) {
        const st = emp.status || 'idle';
        if (st === 'awaiting_approval') {
            const m = LAYOUT.meeting[meetingIndex % LAYOUT.meeting.length];
            return {
                x: m.x, z: m.z, facing: m.facing, seated: !!m.seated,
                pose: m.seated ? 'sit' : 'stand',
                activity: 'chat',
                speech: statusSpeech(emp),
                label: STATUS_LABEL[st]
            };
        }
        if (st === 'working' || st === 'needs_info' || st === 'failed' || st === 'done') {
            const desk = LAYOUT.desks[seatIndex % LAYOUT.desks.length];
            return {
                x: desk[0], z: desk[1] - 0.55, facing: 0,
                seated: st === 'working' || st === 'needs_info',
                pose: st === 'failed' ? 'slump' : (st === 'done' ? 'cheer' : 'sit'),
                activity: st === 'working' ? 'work' : (st === 'needs_info' ? 'review' : st),
                speech: statusSpeech(emp),
                label: STATUS_LABEL[st]
            };
        }
        // idle → wander
        if (idleAssignment) {
            const spot = idleAssignment.spot;
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
        const desk = LAYOUT.desks[seatIndex % LAYOUT.desks.length];
        return {
            x: desk[0], z: desk[1] - 0.55, facing: 0, seated: false,
            pose: 'stand', activity: 'idle', speech: '', label: STATUS_LABEL.idle
        };
    }

    function createLimb(mat, w, h, d) {
        const geo = new THREE.BoxGeometry(w, h, d);
        geo.translate(0, -h / 2, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    function createHumanoid(colorHex, look) {
        const root = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.55,
            metalness: 0.08
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: look && look.pants ? look.pants : 0x1e293b,
            roughness: 0.7,
            metalness: 0.05
        });
        const skinMat = new THREE.MeshStandardMaterial({
            color: look && look.skin ? look.skin : 0xd4a574,
            roughness: 0.65,
            metalness: 0.02
        });
        const hairMat = new THREE.MeshStandardMaterial({
            color: look && look.hair ? look.hair : 0x1d293c,
            roughness: 0.9,
            metalness: 0.02
        });

        const body = new THREE.Group();
        body.name = 'body';
        root.add(body);

        const torsoGeo = THREE.CapsuleGeometry
            ? new THREE.CapsuleGeometry(0.24, 0.42, 4, 8)
            : new THREE.CylinderGeometry(0.24, 0.24, 0.72, 10);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = 1.05;
        body.add(torso);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skinMat);
        head.position.y = 1.52;
        body.add(head);

        const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), hairMat);
        hair.position.y = 1.72;
        body.add(hair);

        const leftArm = createLimb(bodyMat, 0.11, 0.48, 0.12);
        leftArm.position.set(-0.3, 1.22, 0);
        leftArm.name = 'leftArm';
        body.add(leftArm);

        const rightArm = createLimb(bodyMat, 0.11, 0.48, 0.12);
        rightArm.position.set(0.3, 1.22, 0);
        rightArm.name = 'rightArm';
        body.add(rightArm);

        const leftLeg = createLimb(darkMat, 0.13, 0.55, 0.15);
        leftLeg.position.set(-0.11, 0.72, 0);
        leftLeg.name = 'leftLeg';
        body.add(leftLeg);

        const rightLeg = createLimb(darkMat, 0.13, 0.55, 0.15);
        rightLeg.position.set(0.11, 0.72, 0);
        rightLeg.name = 'rightLeg';
        body.add(rightLeg);

        const aura = new THREE.Mesh(
            new THREE.RingGeometry(0.4, 0.52, 24),
            new THREE.MeshBasicMaterial({
                color: STATUS_AURA.idle,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.03;
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
            skinMat: skinMat,
            parts: { leftArm: leftArm, rightArm: rightArm, leftLeg: leftLeg, rightLeg: rightLeg, aura: aura, torso: torso, head: head, body: body }
        };

        return root;
    }

    function hashName(name) {
        let hash = 2166136261;
        const s = String(name || '');
        for (let i = 0; i < s.length; i += 1) {
            hash ^= s.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function agentLook(id, avatarColor) {
        const HAIR = ['#1d293c', '#b54b45', '#6a4d8d', '#3b2a20', '#c9a24a', '#2f4f3a'];
        const SKIN = ['#e9b57d', '#c98e5a', '#f1c9a0', '#a8714a', '#dca06e'];
        const PANTS = ['#36475d', '#374052', '#344349', '#4a3b2f'];
        const hash = hashName(id);
        return {
            hair: HAIR[hash % HAIR.length],
            skin: SKIN[(hash >>> 4) % SKIN.length],
            pants: PANTS[(hash >>> 12) % PANTS.length],
            shirt: avatarColor || '#0d9488'
        };
    }

    function syncCharacter(ch, emp) {
        const ud = ch.userData;
        ud.roleId = emp.id;
        ud.status = emp.status || 'idle';
        const color = emp.avatarColor || '#0d9488';
        ud.bodyMat.color.set(color);
        const auraColor = STATUS_AURA[ud.status] || STATUS_AURA.idle;
        ud.parts.aura.material.color.setHex(auraColor);
        ud.parts.aura.material.opacity = ud.status === 'idle' ? 0.35 : 0.7;
    }

    function setDestination(ch, placement) {
        const ud = ch.userData;
        const key = [placement.x, placement.z, placement.activity, placement.pose].join('|');
        if (ud.placementKey === key) {
            ud.placement = placement;
            return;
        }
        const fromX = ch.position.x;
        const fromZ = ch.position.z;
        const dist = Math.hypot(placement.x - fromX, placement.z - fromZ);
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

    function rebuildLabels(employees) {
        if (!labelsRoot) return;
        labelsRoot.innerHTML = '';
        employees.forEach(function (emp) {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'office-3d-label';
            el.dataset.roleId = emp.id;
            el.innerHTML =
                '<span class="office-3d-speech hidden" aria-hidden="true"></span>' +
                '<span class="office-3d-label-row">' +
                '<span class="office-3d-label-name">' + escapeHtml(emp.name || emp.id) + '</span>' +
                '<span class="office-3d-label-status" data-status="' + escapeHtml(emp.status || 'idle') + '">' +
                escapeHtml(STATUS_LABEL[emp.status] || emp.status || 'Siaga') +
                '</span></span>';
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof onSelect === 'function') onSelect(emp.id);
            });
            labelsRoot.appendChild(el);
        });
    }

    function updateLabelPositions() {
        if (!labelsRoot || !camera || !renderer) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const labels = labelsRoot.querySelectorAll('.office-3d-label');
        characters.forEach(function (ch, i) {
            const el = labels[i];
            if (!el) return;
            const pos = ch.position.clone();
            pos.y = 2.05;
            pos.project(camera);
            const x = (pos.x * 0.5 + 0.5) * rect.width;
            const y = (-pos.y * 0.5 + 0.5) * rect.height;
            const visible = pos.z < 1;
            el.style.display = visible ? 'flex' : 'none';
            el.style.transform = 'translate(-50%, -100%) translate(' + x + 'px, ' + y + 'px)';

            const st = ch.userData.status || 'idle';
            const statusEl = el.querySelector('.office-3d-label-status');
            if (statusEl && statusEl.dataset.status !== st) {
                statusEl.dataset.status = st;
                statusEl.textContent = STATUS_LABEL[st] || st;
            }

            const placement = ch.userData.placement;
            const speechEl = el.querySelector('.office-3d-speech');
            if (speechEl) {
                const text = placement && placement.speech ? placement.speech : '';
                if (text) {
                    speechEl.textContent = text;
                    speechEl.classList.remove('hidden');
                    speechEl.classList.toggle('is-idle', st === 'idle');
                } else {
                    speechEl.textContent = '';
                    speechEl.classList.add('hidden');
                }
            }
        });
    }

    function applyPose(ch, t, walking) {
        const ud = ch.userData;
        const parts = ud.parts;
        const placement = ud.placement || {};
        const pose = placement.pose || 'stand';
        const activity = placement.activity || 'idle';
        const seated = !!placement.seated && !walking;

        if (walking) {
            const swing = Math.sin(t * 10 + ud.phase) * 0.55;
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

        if (activity === 'chat') {
            parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
            parts.leftArm.rotation.x = -0.45 + Math.sin(t * 3.2) * 0.28;
            parts.rightArm.rotation.x = -0.2;
            parts.body.position.y = seated ? -0.14 : Math.abs(Math.sin(t * 5)) * 0.025;
            parts.torso.rotation.z = 0;
            return;
        }

        // idle / lounge / break / walk stand or sit
        const breathe = Math.sin(t * 2 + ud.phase) * 0.015;
        parts.leftLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
        parts.rightLeg.rotation.x = seated ? -Math.PI / 2.2 : 0;
        parts.leftArm.rotation.x = Math.sin(t * 1.4 + ud.phase) * 0.08;
        parts.rightArm.rotation.x = -Math.sin(t * 1.4 + ud.phase) * 0.08;
        parts.body.position.y = (seated ? -0.14 : 0) + breathe;
        parts.head.rotation.y = Math.sin(t * 0.6 + ud.phase) * 0.12;
        parts.torso.rotation.z = 0;
    }

    function animateCharacter(ch, t, dt) {
        const ud = ch.userData;
        let walking = false;

        if (ud.path && ud.path.length) {
            const next = ud.path[0];
            const dx = next.x - ch.position.x;
            const dz = next.z - ch.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.05) {
                ud.path.shift();
            } else {
                walking = true;
                const step = Math.min(dist, dt * WALK_SPEED);
                ch.position.x += (dx / dist) * step;
                ch.position.z += (dz / dist) * step;
                const heading = Math.atan2(dx, dz);
                let dy = heading - ch.rotation.y;
                while (dy > Math.PI) dy -= Math.PI * 2;
                while (dy < -Math.PI) dy += Math.PI * 2;
                ch.rotation.y += dy * 0.22;
            }
        }

        if (!walking) {
            let dy = (ud.targetFacing || 0) - ch.rotation.y;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            ch.rotation.y += dy * 0.12;
        }

        applyPose(ch, t, walking);
        const auraPulse = ud.status === 'working' ? 1 + Math.sin(t * 4) * 0.08 : 1;
        ud.parts.aura.scale.setScalar(auraPulse);
    }

    function emitActivityIfChanged() {
        if (typeof onActivity !== 'function') return;
        const rows = characters.map(function (ch) {
            const p = ch.userData.placement || {};
            return {
                roleId: ch.userData.roleId,
                status: ch.userData.status,
                activity: p.activity || 'idle',
                speech: p.speech || '',
                label: p.label || STATUS_LABEL[ch.userData.status] || 'Siaga'
            };
        });
        const digest = rows.map(function (r) {
            return r.roleId + ':' + r.status + ':' + r.activity + ':' + r.speech;
        }).join('|');
        if (digest === lastActivityDigest) return;
        lastActivityDigest = digest;
        onActivity(rows);
    }

    function recomputePlacements() {
        const list = employeesCache;
        const now = Date.now();
        const idleSeats = [];
        list.forEach(function (emp, i) {
            if ((emp.status || 'idle') === 'idle') idleSeats.push(i);
        });
        const plan = idlePlan(idleSeats, now);
        let meetingIndex = 0;
        list.forEach(function (emp, i) {
            const ch = characters[i];
            if (!ch) return;
            const idle = (emp.status || 'idle') === 'idle' ? plan.get(i) : null;
            const meetIdx = (emp.status === 'awaiting_approval') ? meetingIndex++ : 0;
            const placement = placementFor(emp, i, idle, meetIdx);
            setDestination(ch, placement);
        });
        emitActivityIfChanged();
    }

    function layoutCharacters(employees) {
        employeesCache = employees.slice();
        employees.forEach(function (emp, i) {
            let ch = characters[i];
            if (!ch) {
                const look = agentLook(emp.id, emp.avatarColor);
                ch = createHumanoid(emp.avatarColor || look.shirt, look);
                const desk = LAYOUT.desks[i % LAYOUT.desks.length];
                ch.position.set(desk[0], 0, desk[1] - 0.55);
                scene.add(ch);
                characters.push(ch);
            }
            ch.userData.seat = i;
            syncCharacter(ch, emp);
        });

        while (characters.length > employees.length) {
            const ch = characters.pop();
            scene.remove(ch);
            disposeObject(ch);
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

    function addBox(x, y, z, w, h, d, color, roughness) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({
                color: color,
                roughness: roughness == null ? 0.85 : roughness,
                metalness: 0.04
            })
        );
        mesh.position.set(x, y, z);
        scene.add(mesh);
        roomProps.push(mesh);
        return mesh;
    }

    function buildScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xe8eef5);
        scene.fog = new THREE.Fog(0xe8eef5, 16, 32);

        camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
        camera.position.set(-1.2, 7.2, 10.5);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const key = new THREE.DirectionalLight(0xfff5e8, 0.95);
        key.position.set(5, 10, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xb8d4d0, 0.35);
        fill.position.set(-6, 4, -3);
        scene.add(fill);

        // Floor zones
        addBox(0, -0.02, -0.4, 12.5, 0.04, 7.2, 0xdce3ec, 0.95);
        // Workspace rug
        addBox(-1.5, 0.01, -1.65, 7.2, 0.02, 3.2, 0xc5d0dc, 1);
        // Lounge rug
        addBox(4.4, 0.01, 1.9, 3.4, 0.02, 2.2, 0xd4c4b0, 1);
        // Aisle strip
        addBox(0, 0.015, LAYOUT.aisleZ, 11.5, 0.01, 0.55, 0xb8c4d0, 1);

        // Back wall + partition hint
        addBox(0, 1.4, -3.55, 12.2, 2.8, 0.12, 0xe2e8f0, 1);
        addBox(2.5, 1.1, -0.2, 0.08, 2.2, 3.6, 0xcbd5e1, 0.6);

        // Desks + chairs markers
        LAYOUT.desks.forEach(function (d) {
            addBox(d[0], 0.42, d[1], 1.15, 0.08, 0.62, 0xa8b4c4, 0.75);
            addBox(d[0], 0.22, d[1] + 0.28, 0.08, 0.4, 0.08, 0x64748b, 0.8);
            addBox(d[0], 0.22, d[1] - 0.28, 0.08, 0.4, 0.08, 0x64748b, 0.8);
            addBox(d[0], 0.28, d[1] - 0.85, 0.42, 0.08, 0.42, 0x94a3b8, 0.85);
        });

        // Meeting table
        addBox(4.0, 0.4, -0.4, 2.2, 0.08, 1.4, 0x9aa8b8, 0.7);
        // Lounge sofa
        addBox(4.1, 0.28, 2.2, 2.4, 0.35, 0.7, 0x7c8fa6, 0.9);
        addBox(4.1, 0.55, 2.45, 2.4, 0.35, 0.18, 0x647890, 0.9);
        // Break counter / galon stand
        addBox(-5.15, 0.45, 1.9, 0.7, 0.9, 0.7, 0xb0bec9, 0.8);
        addBox(-5.15, 1.05, 1.9, 0.35, 0.35, 0.35, 0x90caf9, 0.4);

        // Brand plaque on back wall
        addBox(0, 2.35, -3.46, 2.8, 0.35, 0.04, 0x0f766e, 0.55);
    }

    function tick() {
        rafId = 0;
        if (!renderer || !scene || !camera || paused || !enabled) return;

        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        // Re-run idle wander when the decorative stop clock advances
        const idleStep = Math.floor(Date.now() / IDLE_STOP_MS);
        if (idleStep !== lastIdleStep) {
            lastIdleStep = idleStep;
            recomputePlacements();
        }

        if (!reduced) {
            orbitAngle += dt * 0.045;
        }
        const radius = 11.2;
        camera.position.x = Math.sin(orbitAngle) * radius * 0.38 - 0.4;
        camera.position.z = Math.cos(orbitAngle) * radius * 0.72 + 4.2;
        camera.position.y = 6.8;
        camera.lookAt(0.4, 0.9, -0.2);

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
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        const dpr = reduced ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function pick(clientX, clientY) {
        if (!renderer || !camera || !characters.length) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(characters, true);
        if (!hits.length) return null;
        let obj = hits[0].object;
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
        renderer.setClearColor(0xe8eef5, 1);
        if (!canvas) {
            canvas = renderer.domElement;
            container.appendChild(canvas);
        }

        handleResize();

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
            const roleId = pick(e.clientX, e.clientY);
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
            const p = ch.userData.placement || {};
            const emp = employeesCache.find(function (e) { return e.id === ch.userData.roleId; }) || {};
            return {
                roleId: ch.userData.roleId,
                name: emp.name || ch.userData.roleId,
                status: ch.userData.status,
                activity: p.activity || 'idle',
                speech: p.speech || '',
                label: p.label || STATUS_LABEL[ch.userData.status] || 'Siaga'
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
        roomProps = [];
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
        resize: handleResize
    };
})(typeof window !== 'undefined' ? window : globalThis);
