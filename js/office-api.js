/**
 * Kantor AI / office API helpers (P3 modularize — diekstrak dari app.js).
 * Bergantung pada globals: api, appState.
 */
(function (global) {
    'use strict';

    const OfficeApi = {
        async loadOfficeFromServer(app) {
            try {
                // credentials: 'include' via api.get — cookie session / Bearer
                const data = await api.get('/api/ai/office');
                if (data.success) {
                    appState.office.employees = data.employees || [];
                    appState.office.board = data.board || {};
                    appState.office.jobCounts = data.jobCounts || {};
                    appState.office.settings = data.settings || null;
                    appState.office.briefTemplates = data.briefTemplates || [];
                    appState.office.crewPresence = data.crewPresence || null;
                    if (data.platforms) appState.office.platforms = data.platforms;
                } else if (data.authRequired) {
                    console.warn('[APP] Kantor AI butuh sesi login:', data.message);
                    appState.office.employees = [];
                }
                if (app && typeof app.loadAiJobsFromServer === 'function') {
                    await app.loadAiJobsFromServer();
                }
            } catch (e) {
                console.error('[APP] Gagal memuat Kantor AI:', e);
            }
        },

        async loadAndRenderInsights(app, containerId) {
            const el = document.getElementById(containerId);
            if (!el) return;
            try {
                const data = await api.get('/api/ai/insights?days=30');
                if (!data.success) {
                    el.innerHTML = `<p class="text-secondary font-sm">${app._escapeHtml(data.message || 'Gagal memuat insights.')}</p>`;
                    return;
                }
                appState.office.insights = data;
                app.renderNextUpPanel(el, data);
            } catch (e) {
                el.innerHTML = '<p class="text-secondary font-sm">Gagal memuat insights.</p>';
            }
        },

        async fetchLiveMetrics(platform, externalPostId) {
            const q = new URLSearchParams({ platform });
            if (externalPostId) q.set('externalPostId', externalPostId);
            return api.get(`/api/analytics/live?${q.toString()}`);
        }
    };

    global.PiksOfficeApi = OfficeApi;
})(typeof window !== 'undefined' ? window : globalThis);
