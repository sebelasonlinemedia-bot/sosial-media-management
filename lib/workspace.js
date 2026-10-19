/**
 * Multi-tenant scaffolding (non-breaking).
 * workspaceId opsional di accounts/posts/jobs; default "default".
 * Belum mengubah UNIQUE(platform) — multi-account per platform = P3.
 */

const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_WORKSPACE_NAME = 'Default';

function normalizeWorkspaceId(raw) {
    const id = String(raw || '').trim();
    if (!id) return DEFAULT_WORKSPACE_ID;
    // aman untuk path/query: alfanumerik, dash, underscore
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return DEFAULT_WORKSPACE_ID;
    return id;
}

function resolveWorkspaceId(req) {
    if (!req) return DEFAULT_WORKSPACE_ID;
    const fromHeader = req.get && req.get('x-workspace-id');
    const fromQuery = req.query && req.query.workspaceId;
    const fromBody = req.body && req.body.workspaceId;
    return normalizeWorkspaceId(fromHeader || fromQuery || fromBody);
}

function defaultWorkspaceRecord() {
    return {
        id: DEFAULT_WORKSPACE_ID,
        name: DEFAULT_WORKSPACE_NAME,
        createdAt: new Date().toISOString()
    };
}

function withWorkspaceId(entity, workspaceId) {
    const wid = normalizeWorkspaceId(workspaceId);
    if (!entity || typeof entity !== 'object') return { workspaceId: wid };
    if (entity.workspaceId) return entity;
    return { ...entity, workspaceId: wid };
}

function filterByWorkspace(list, workspaceId, { includeMissing = true } = {}) {
    const wid = normalizeWorkspaceId(workspaceId);
    return (list || []).filter(row => {
        const rowWid = row && row.workspaceId;
        if (!rowWid) return includeMissing; // legacy rows → visible di default
        return rowWid === wid;
    });
}

module.exports = {
    DEFAULT_WORKSPACE_ID,
    DEFAULT_WORKSPACE_NAME,
    normalizeWorkspaceId,
    resolveWorkspaceId,
    defaultWorkspaceRecord,
    withWorkspaceId,
    filterByWorkspace
};
