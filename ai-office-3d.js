/**
 * PostSphere — lightweight Kantor AI 3D viewport (Three.js CDN).
 * One scene, simple floor, 5 low-poly humanoids. No life-sim / multi-floor.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'postsphere-office-3d';
    const STATUS_AURA = {
        idle: 0x64748b,
        needs_info: 0xf59e0b,
        working: 0x0d9488,
        done: 0x10b981,
        failed: 0xef4444
    };
    const STATUS_LABEL = {
        idle: 'Siaga',
        needs_info: 'Perlu info',
        working: 'Kerja',
        done: 'Selesai',
        failed: 'Gagal'
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
    let enabled = true;
    let reduced = false;
    let paused = false;
    let onSelect = null;
    let resizeObserver = null;
    let visibilityHandler = null;
    let clickHandler = null;
    let orbitAngle = 0.35;
    let orbitTargetY = 1.1;

    function loadPreference() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw === '0') return false;
            if (raw === '1') return true;
        } catch (_) { /* ignore */ }
        // Default ON everywhere (incl. mobile) so karyawan animasi langsung terlihat.
        // Only honor OS reduced-motion; explicit user toggle still persists via localStorage.
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

    function hexCss(n) {
        return '#' + (n >>> 0).toString(16).padStart(6, '0');
    }

    function createLimb(mat, w, h, d) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    function createHumanoid(colorHex) {
        const root = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.55,
            metalness: 0.08
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.7,
            metalness: 0.05
        });
        const skinMat = new THREE.MeshStandardMaterial({
            color: 0xd4a574,
            roughness: 0.65,
            metalness: 0.02
        });

        const torsoGeo = THREE.CapsuleGeometry
            ? new THREE.CapsuleGeometry(0.28, 0.55, 4, 8)
            : new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = 1.15;
        root.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skinMat);
        head.position.y = 1.78;
        root.add(head);

        const leftArm = createLimb(bodyMat, 0.12, 0.55, 0.12);
        leftArm.position.set(-0.42, 1.2, 0);
        leftArm.name = 'leftArm';
        root.add(leftArm);

        const rightArm = createLimb(bodyMat, 0.12, 0.55, 0.12);
        rightArm.position.set(0.42, 1.2, 0);
        rightArm.name = 'rightArm';
        root.add(rightArm);

        const leftLeg = createLimb(darkMat, 0.14, 0.55, 0.14);
        leftLeg.position.set(-0.14, 0.4, 0);
        leftLeg.name = 'leftLeg';
        root.add(leftLeg);

        const rightLeg = createLimb(darkMat, 0.14, 0.55, 0.14);
        rightLeg.position.set(0.14, 0.4, 0);
        rightLeg.name = 'rightLeg';
        root.add(rightLeg);

        const aura = new THREE.Mesh(
            new THREE.RingGeometry(0.45, 0.58, 24),
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
            phase: Math.random() * Math.PI * 2,
            homeX: 0,
            homeZ: 0,
            walkDir: 1,
            bodyMat,
            skinMat,
            parts: { leftArm, rightArm, leftLeg, rightLeg, aura, torso, head }
        };

        return root;
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

    function layoutCharacters(employees) {
        const n = Math.max(employees.length, 1);
        const spacing = 1.55;
        const startX = -((n - 1) * spacing) / 2;

        employees.forEach((emp, i) => {
            let ch = characters[i];
            if (!ch) {
                ch = createHumanoid(emp.avatarColor || '#0d9488');
                scene.add(ch);
                characters.push(ch);
            }
            const x = startX + i * spacing;
            ch.userData.homeX = x;
            ch.userData.homeZ = (i % 2 === 0 ? 0.15 : -0.15);
            ch.position.set(x, 0, ch.userData.homeZ);
            syncCharacter(ch, emp);
        });

        while (characters.length > employees.length) {
            const ch = characters.pop();
            scene.remove(ch);
            disposeObject(ch);
        }

        rebuildLabels(employees);
    }

    function disposeObject(obj) {
        obj.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                else child.material.dispose();
            }
        });
    }

    function rebuildLabels(employees) {
        if (!labelsRoot) return;
        labelsRoot.innerHTML = '';
        employees.forEach((emp) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'office-3d-label';
            el.dataset.roleId = emp.id;
            el.innerHTML =
                `<span class="office-3d-label-name">${escapeHtml(emp.name || emp.id)}</span>` +
                `<span class="office-3d-label-status" data-status="${escapeHtml(emp.status || 'idle')}">${escapeHtml(STATUS_LABEL[emp.status] || emp.status || 'Siaga')}</span>`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof onSelect === 'function') onSelect(emp.id);
            });
            labelsRoot.appendChild(el);
        });
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function updateLabelPositions() {
        if (!labelsRoot || !camera || !renderer) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const labels = labelsRoot.querySelectorAll('.office-3d-label');
        characters.forEach((ch, i) => {
            const el = labels[i];
            if (!el) return;
            const pos = ch.position.clone();
            pos.y = 2.15;
            pos.project(camera);
            const x = (pos.x * 0.5 + 0.5) * rect.width;
            const y = (-pos.y * 0.5 + 0.5) * rect.height;
            const visible = pos.z < 1;
            el.style.display = visible ? 'flex' : 'none';
            el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
            const st = ch.userData.status || 'idle';
            const statusEl = el.querySelector('.office-3d-label-status');
            if (statusEl && statusEl.dataset.status !== st) {
                statusEl.dataset.status = st;
                statusEl.textContent = STATUS_LABEL[st] || st;
            }
        });
    }

    function animateCharacter(ch, t, dt) {
        const ud = ch.userData;
        const parts = ud.parts;
        const phase = ud.phase + t * (ud.status === 'working' ? 5.5 : 2.2);

        if (ud.status === 'working') {
            const swing = Math.sin(phase) * 0.45;
            parts.leftLeg.rotation.x = swing;
            parts.rightLeg.rotation.x = -swing;
            parts.leftArm.rotation.x = -swing * 0.7;
            parts.rightArm.rotation.x = swing * 0.7;
            ch.position.x = ud.homeX + Math.sin(t * 0.9 + ud.phase) * 0.35;
            ch.position.z = ud.homeZ + Math.cos(t * 0.7 + ud.phase) * 0.2;
            ch.rotation.y = Math.atan2(
                Math.cos(t * 0.9 + ud.phase) * 0.2,
                Math.sin(t * 0.9 + ud.phase) * 0.35
            ) * 0.4;
            parts.aura.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
        } else if (ud.status === 'needs_info') {
            parts.leftArm.rotation.x = -1.1;
            parts.rightArm.rotation.x = -1.1;
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            ch.position.x = ud.homeX;
            ch.position.z = ud.homeZ;
            ch.rotation.y = Math.sin(t * 1.2 + ud.phase) * 0.15;
            parts.head.position.y = 1.78 + Math.sin(t * 3 + ud.phase) * 0.02;
            parts.aura.scale.setScalar(1.05 + Math.sin(t * 3) * 0.06);
        } else if (ud.status === 'done') {
            parts.leftArm.rotation.x = 0.15;
            parts.rightArm.rotation.x = -0.9;
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            ch.position.set(ud.homeX, 0, ud.homeZ);
            ch.rotation.y = 0.2;
            parts.aura.scale.setScalar(1.1);
        } else if (ud.status === 'failed') {
            parts.leftArm.rotation.x = 0.4;
            parts.rightArm.rotation.x = 0.4;
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            ch.position.set(ud.homeX, 0, ud.homeZ);
            ch.rotation.y = -0.25;
            parts.torso.rotation.z = -0.08;
            parts.aura.scale.setScalar(1);
        } else {
            // idle sway
            const bob = Math.sin(t * 1.6 + ud.phase) * 0.02;
            parts.torso.position.y = 1.15 + bob;
            parts.head.position.y = 1.78 + bob;
            parts.leftArm.rotation.x = Math.sin(t * 1.4 + ud.phase) * 0.08;
            parts.rightArm.rotation.x = -Math.sin(t * 1.4 + ud.phase) * 0.08;
            parts.leftLeg.rotation.x = 0;
            parts.rightLeg.rotation.x = 0;
            parts.torso.rotation.z = 0;
            ch.position.set(ud.homeX, 0, ud.homeZ);
            ch.rotation.y = Math.sin(t * 0.5 + ud.phase) * 0.12;
            parts.aura.scale.setScalar(1);
        }
    }

    function tick() {
        rafId = 0;
        if (!renderer || !scene || !camera || paused || !enabled) return;

        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        if (!reduced) {
            orbitAngle += dt * 0.08;
        }
        const radius = 7.2;
        camera.position.x = Math.sin(orbitAngle) * radius * 0.55;
        camera.position.z = Math.cos(orbitAngle) * radius;
        camera.position.y = 3.4;
        camera.lookAt(0, orbitTargetY, 0);

        characters.forEach((ch) => animateCharacter(ch, t, dt));
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

    function buildScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xeef2f7);
        scene.fog = new THREE.Fog(0xeef2f7, 12, 24);

        camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
        camera.position.set(0, 3.4, 7.2);

        const amb = new THREE.AmbientLight(0xffffff, 0.72);
        scene.add(amb);
        const key = new THREE.DirectionalLight(0xfff8f0, 0.9);
        key.position.set(4, 8, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xb8d4d0, 0.4);
        fill.position.set(-5, 3, -2);
        scene.add(fill);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(5.5, 48),
            new THREE.MeshStandardMaterial({
                color: 0xdce3ec,
                roughness: 0.92,
                metalness: 0.05
            })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = false;
        scene.add(floor);

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(4.6, 4.75, 64),
            new THREE.MeshBasicMaterial({
                color: 0x94a3b8,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        scene.add(ring);

        // subtle desk strip behind characters (single prop, not multi-floor)
        const desk = new THREE.Mesh(
            new THREE.BoxGeometry(7.2, 0.12, 0.9),
            new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8, metalness: 0.08 })
        );
        desk.position.set(0, 0.55, -1.35);
        scene.add(desk);

        const backdrop = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 4),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 1, metalness: 0 })
        );
        backdrop.position.set(0, 2, -2.1);
        scene.add(backdrop);
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
        renderer.setClearColor(0xeef2f7, 1);
        if (!canvas) {
            canvas = renderer.domElement;
            container.appendChild(canvas);
        }

        handleResize();

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => handleResize());
            resizeObserver.observe(container);
        } else {
            window.addEventListener('resize', handleResize);
        }

        visibilityHandler = () => {
            paused = document.hidden;
            if (paused) stopLoop();
            else if (enabled) startLoop();
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        clickHandler = (e) => {
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
        const list = Array.isArray(employees) ? employees : [];
        layoutCharacters(list);
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
        characters.forEach((ch) => {
            if (scene) scene.remove(ch);
            disposeObject(ch);
        });
        characters = [];
        if (labelsRoot) labelsRoot.innerHTML = '';
        if (scene) {
            scene.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
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
    }

    global.AiOffice3D = {
        init,
        dispose,
        updateEmployees,
        setEnabled,
        isEnabled,
        loadPreference,
        resize: handleResize
    };
})(typeof window !== 'undefined' ? window : globalThis);
