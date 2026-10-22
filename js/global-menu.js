/**
 * Menu kiri global — sidebar berlabel 5 grup / 16 item (struktur di
 * js/main-nav.js, satu sumber untuk menu global, sidebar legacy, dan
 * menu hamburger). Item aktif berbentuk pill menyala mengikuti menu
 * yang dipilih, bukan sekadar view (Chat & Team sama-sama membuka
 * Mission Control, tetapi pill-nya berbeda).
 */
(function () {
    function sync(view, menuKey) {
        let key = menuKey || null;
        if (!key && window.MainNav) key = MainNav.keyForView(view);
        if (!key && window.MainNav && MainNav.item(view)) key = view;
        if (window.MainNav) MainNav.sync(key);
        // Kompatibilitas pemanggil lama berbasis view.
        document.querySelectorAll('[data-gm-nav]').forEach(btn => {
            const on = btn.getAttribute('data-gm-nav') === view;
            btn.classList.toggle('is-active', on);
            if (on) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
        });
    }
    // Panel tim lama sudah tidak ada; fungsi dipertahankan agar pemanggil
    // lama yang menutup/membuka panel tidak error.
    function setPanel() { document.body.classList.remove('gm-roster-open', 'gm-roster-collapsed'); }
    function closePanel() { setPanel(); }
    function setCollapsed() { setPanel(); }

    function bind() {
        if (window.MainNav) MainNav.renderAll();
        // Top bar bisa membungkus jadi lebih tinggi dari --app-shell-topbar-h
        // (mis. pil Mission Control); geser menu mengikuti tinggi nyatanya
        // agar grup pertama (DAILY/Chat) tidak tertutup top bar.
        // Nilai nyata yang sama juga diterbitkan sebagai
        // --app-shell-topbar-actual: shell Mission (styles.css) memakainya
        // untuk mulai tepat di bawah top bar, sehingga rel menu global di
        // Mission sejajar dengan kontennya persis seperti di halaman lain
        // (sebelumnya shell Mission tetap di 56px dan bagian atasnya —
        // kepala panel kiri/kanan & panggung 3D — tertutup top bar 125px,
        // sementara menu saja yang turun mengikuti top bar).
        const menu = document.getElementById('global-side-menu');
        const topbar = document.getElementById('app-shell-topbar');
        const syncTop = () => {
            if (!topbar || topbar.classList.contains('hidden') || !topbar.offsetHeight) return;
            document.documentElement.style.setProperty('--app-shell-topbar-actual', `${topbar.offsetHeight}px`);
            if (menu) menu.style.top = `${topbar.offsetHeight}px`;
        };
        if (topbar && window.ResizeObserver) new ResizeObserver(syncTop).observe(topbar);
        syncTop();
        setTimeout(syncTop, 300);
        sync((location.hash || '').replace(/^#/, '') || 'mission');
        document.addEventListener('click', (event) => {
            const nav = event.target.closest('[data-main-nav]');
            if (!nav) return;
            const key = nav.getAttribute('data-main-nav');
            if (typeof app !== 'undefined' && app.openMainMenu) {
                app.openMainMenu(key);
            } else if (typeof app !== 'undefined' && app.switchView && window.MainNav) {
                const it = MainNav.item(key);
                if (it) app.switchView(it.view);
            }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
    window.GlobalSideMenu = { sync, setCollapsed, setPanel, openPanel: () => setPanel(true), closePanel, refresh: () => { if (window.MainNav) MainNav.renderAll(); } };
})();
