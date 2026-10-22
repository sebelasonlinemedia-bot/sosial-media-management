/**
 * Menu utama PiK's Digital Lab — SATU sumber kebenaran untuk struktur
 * navigasi (item teratas My Office + 5 grup, 17 item). Dipakai bersama
 * oleh menu global di kiri, sidebar legacy, dan menu hamburger di top
 * bar, supaya tidak ada dua menu yang berbeda. Item tanpa halaman nyata
 * memakai SATU view generik `placeholder` yang judul & ikonnya berubah
 * mengikuti item yang diklik.
 */
(function () {
    const GROUPS = [
        { label: '', items: [
            { key: 'my-office', label: 'My Office', icon: 'building', view: 'mission' }
        ] },
        { label: 'DAILY', items: [
            { key: 'chat', label: 'Chat', icon: 'message-square', view: 'chat' },
            { key: 'tasks', label: 'Tasks', icon: 'file-text', view: 'tasks-replica' },
            { key: 'drive', label: 'Drive', icon: 'hard-drive', view: 'drive-replica' },
            { key: 'inbox', label: 'Inbox', icon: 'inbox', view: 'placeholder' },
            { key: 'crm', label: 'CRM', icon: 'contact-round', view: 'crm-replica' }
        ] },
        { label: 'EMPLOYEE', items: [
            { key: 'tools', label: 'Tools', icon: 'wrench', view: 'tools-replica' },
            { key: 'skills', label: 'Skills', icon: 'sparkles', view: 'settings', action: 'skills' },
            { key: 'duties', label: 'Duties', icon: 'clipboard-list', view: 'office' },
            { key: 'schedules', label: 'Schedules', icon: 'calendar-days', view: 'calendar-replica' },
            { key: 'profile', label: 'Profile', icon: 'circle-user-round', view: 'placeholder' }
        ] },
        { label: 'DASHBOARDS', items: [
            { key: 'team', label: 'Team', icon: 'bar-chart-3', view: 'placeholder' },
        ] },
        { label: 'COMPANY', items: [
            { key: 'training', label: 'Training', icon: 'graduation-cap', view: 'placeholder' },
            { key: 'business', label: 'Business', icon: 'building-2', view: 'marketplace' },
            { key: 'employees', label: 'Employees', icon: 'users', view: 'employees-replica' },
            { key: 'routine', label: 'Routine', icon: 'repeat', view: 'routine-replica' }
        ] },
        { label: 'CONFIG', items: [
            { key: 'activity', label: 'Activity', icon: 'activity', view: 'activity' },
            { key: 'settings', label: 'Settings', icon: 'settings', view: 'settings' }
        ] }
    ];
    const ITEMS = GROUPS.flatMap(g => g.items.map(item => ({ ...item, group: g.label })));
    const BY_KEY = new Map(ITEMS.map(item => [item.key, item]));
    // View lama yang dibuka lewat hash langsung dipetakan ke item menu
    // terdekat agar pill aktif tetap masuk akal.
    const DEFAULT_KEY_BY_VIEW = {
        mission: 'my-office', tasks: 'tasks', 'tasks-replica': 'tasks', tools: 'tools', 'tools-replica': 'tools',
        settings: 'settings', office: 'duties', calendar: 'schedules', 'calendar-replica': 'schedules',
        marketplace: 'business', organization: 'employees', 'employees-replica': 'employees', 'routine-replica': 'routine', activity: 'activity', chat: 'chat', 'drive-replica': 'drive', 'crm-replica': 'crm'
    };

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function item(key) { return BY_KEY.get(key) || null; }
    function keyForView(view) { return DEFAULT_KEY_BY_VIEW[view] || null; }
    function isPlaceholder(key) { const it = item(key); return !!it && it.view === 'placeholder'; }

    function renderInto(root) {
        if (!root) return;
        root.innerHTML = GROUPS.map(group => `
            <div class="main-nav-group${group.label ? '' : ' is-top'}" role="group" aria-label="${esc(group.label || 'Utama')}">
                ${group.label ? `<p class="main-nav-group-label">${esc(group.label)}</p>` : ''}
                ${group.items.map(it => `<button type="button" class="main-nav-item" data-main-nav="${esc(it.key)}" data-main-view="${esc(it.view)}" title="${esc(it.label)}"><i data-lucide="${esc(it.icon)}"></i><span>${esc(it.label)}</span></button>`).join('')}
            </div>`).join('');
    }
    function renderAll() {
        document.querySelectorAll('[data-main-nav-list]').forEach(renderInto);
        if (window.lucide) lucide.createIcons();
    }
    function sync(activeKey) {
        document.querySelectorAll('[data-main-nav]').forEach(btn => {
            const on = btn.getAttribute('data-main-nav') === activeKey;
            btn.classList.toggle('is-active', on);
            btn.classList.toggle('active', on);
            if (on) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
        });
    }
    function renderPlaceholder(key) {
        const it = item(key);
        if (!it) return;
        const icon = document.getElementById('placeholder-icon');
        const title = document.getElementById('placeholder-title');
        const heading = document.getElementById('placeholder-heading');
        if (icon) icon.innerHTML = `<i data-lucide="${esc(it.icon)}"></i>`;
        if (title) title.textContent = it.label;
        if (heading) heading.textContent = it.label;
        if (window.lucide) lucide.createIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll); else renderAll();

    window.MainNav = { GROUPS, ITEMS, item, keyForView, isPlaceholder, renderAll, sync, renderPlaceholder };
})();
