/**
 * Mekanisme bersama SEMUA halaman replika (.chat-replica).
 * - Panel Organization dapat digeser: lebar via var --rx-org-w pada section,
 *   disimpan di localStorage `piks-replica-org-width-v1`, berlaku di semua
 *   halaman replika (min 140px, maks 340px). Pegangan = .rx-org-handle
 *   di dalam pembungkus .rx-org-wrap (org + handle berdampingan, handle
 *   selalu setinggi panel dan tidak ikut scroll).
 * - Lencana hitungan merah gaya crop: jumlah karyawan pada judul
 *   Organization, dan jumlah talenta pada tab Marketplace Employees
 *   (mode Hire di dalam halaman — isinya tidak diubah).
 * - Tab "3D Office" ([data-rx-office3d]) membuka kantor AI 3D lewat jalur
 *   menu yang sudah ada: app.openMainMenu('my-office') (view mission /
 *   Mission Control 3D), keluar dari mode replika seperti nav replika lain.
 * - Tooltip judul untuk tombol menu kiri saat rel hanya menampilkan ikon.
 */
(function () {
    var STORAGE_KEY = 'piks-replica-org-width-v1';
    var MIN_W = 140, MAX_W = 340;

    function clamp(w) { return Math.max(MIN_W, Math.min(MAX_W, Math.round(w))); }
    function storedWidth() {
        try { var v = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10); return isFinite(v) ? clamp(v) : null; }
        catch (_) { return null; }
    }
    function applyWidth(w, save) {
        var width = clamp(w);
        document.querySelectorAll('section.chat-replica').forEach(function (sec) {
            sec.style.setProperty('--rx-org-w', width + 'px');
        });
        if (save) { try { localStorage.setItem(STORAGE_KEY, String(width)); } catch (_) {} }
        return width;
    }
    function currentWidth(section) {
        var wrap = section && section.querySelector('.rx-org-wrap');
        if (wrap) return wrap.getBoundingClientRect().width;
        var org = section && section.querySelector('.cr-org');
        return org ? org.getBoundingClientRect().width : 168;
    }

    function setupOrg(section) {
        var org = section.querySelector('.cr-org');
        if (!org || org.closest('.rx-org-wrap')) return;
        var wrap = document.createElement('div');
        wrap.className = 'rx-org-wrap';
        org.parentNode.insertBefore(wrap, org);
        wrap.appendChild(org);
        var handle = document.createElement('div');
        handle.className = 'rx-org-handle';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', 'Ubah lebar panel Organization');
        handle.setAttribute('title', 'Seret untuk mengubah lebar panel Organization');
        handle.tabIndex = 0;
        wrap.appendChild(handle);

        var startX = 0, startW = 0;
        function onMove(e) { applyWidth(startW + (e.clientX - startX), false); }
        function onUp(e) {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.body.classList.remove('rx-org-dragging');
            section.classList.remove('is-org-dragging');
            applyWidth(currentWidth(section), true);
            if (e && e.clientX != null) applyWidth(startW + (e.clientX - startX), true);
        }
        handle.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            startX = e.clientX; startW = currentWidth(section);
            document.body.classList.add('rx-org-dragging');
            section.classList.add('is-org-dragging');
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
        handle.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            applyWidth(currentWidth(section) + (e.key === 'ArrowRight' ? 12 : -12), true);
        });
        handle.addEventListener('dblclick', function () {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
            document.querySelectorAll('section.chat-replica').forEach(function (sec) { sec.style.removeProperty('--rx-org-w'); });
        });

        // Lencana hitungan merah pada judul Organization (jumlah karyawan).
        var headSpan = org.querySelector('.cr-org-head span');
        if (headSpan && !headSpan.querySelector('.rx-count-badge')) {
            var badge = document.createElement('span');
            badge.className = 'rx-count-badge';
            badge.setAttribute('data-rx-org-count', '');
            badge.textContent = '0';
            headSpan.appendChild(badge);
            var update = function () {
                var n = org.querySelectorAll('.cr-employees .cr-emp, .cr-employees > *').length;
                badge.textContent = String(n);
            };
            update();
            var box = org.querySelector('.cr-employees');
            if (box && window.MutationObserver) new MutationObserver(update).observe(box, { childList: true });
            setTimeout(update, 600); setTimeout(update, 2000);
        }
    }

    function setupSection(section) {
        setupOrg(section);
        // Tooltip saat menu kiri hanya menampilkan ikon.
        section.querySelectorAll('.cr-side-nav button').forEach(function (btn) {
            if (!btn.getAttribute('title')) {
                var label = (btn.textContent || '').trim();
                if (label) btn.setAttribute('title', label);
            }
        });
        // Lencana merah pada tab Marketplace Employees (hitungan talenta nyata).
        var mktTab = section.querySelector('[data-em-main-tab="marketplace"]');
        if (mktTab && !mktTab.querySelector('.rx-count-badge')) {
            var b = document.createElement('span');
            b.className = 'rx-count-badge';
            b.textContent = '17';
            mktTab.appendChild(b);
            var sync = function () {
                var c = document.getElementById('em-market-count');
                if (c && c.textContent.trim()) b.textContent = c.textContent.trim();
            };
            setTimeout(sync, 600); setTimeout(sync, 2000);
        }
    }

    function init() {
        document.querySelectorAll('section.chat-replica').forEach(setupSection);
        var w = storedWidth();
        if (w) applyWidth(w, false);
    }

    // Klik "3D Office" dari halaman replika mana pun -> kantor AI 3D.
    document.addEventListener('click', function (event) {
        var target = event.target.closest && event.target.closest('[data-rx-office3d]');
        if (!target) return;
        event.preventDefault();
        if (typeof app !== 'undefined' && app.openMainMenu) app.openMainMenu('my-office');
        else if (typeof app !== 'undefined' && app.switchView) app.switchView('mission');
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

    window.ReplicaCommon = {
        applyOrgWidth: function (w) { return applyWidth(w, true); },
        getOrgWidth: function () { return storedWidth(); },
        MIN_W: MIN_W, MAX_W: MAX_W, STORAGE_KEY: STORAGE_KEY
    };
})();
