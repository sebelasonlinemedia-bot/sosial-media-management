/**
 * PiK's Digital Lab — Database facade
 * - Lokal tanpa DATABASE_URL → db.json (file)
 * - Vercel / Neon → Postgres via DATABASE_URL
 *
 * Semua method async agar API seragam.
 */

const fs = require('fs');
const path = require('path');
const { normalizeAiSettings, DEFAULT_AI_SETTINGS } = require('./lib/ai-policy');
const { encryptAccountTokens, decryptAccountTokens } = require('./lib/token-crypto');
const {
    DEFAULT_WORKSPACE_ID,
    defaultWorkspaceRecord,
    normalizeWorkspaceId,
    withWorkspaceId,
    filterByWorkspace
} = require('./lib/workspace');

const DB_PATH = path.join(__dirname, 'db.json');
const DEFAULT_DB = {
    users: [],
    workspaces: [defaultWorkspaceRecord()],
    accounts: [],
    posts: [],
    aiJobs: [],
    aiSettings: { ...DEFAULT_AI_SETTINGS },
    auditLog: []
};

class JsonDatabase {
    constructor() {
        this._data = null;
    }

    async load() {
        try {
            if (fs.existsSync(DB_PATH)) {
                this._data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
                if (!this._data.users) this._data.users = [];
                if (!this._data.workspaces) this._data.workspaces = [];
                if (!this._data.accounts) this._data.accounts = [];
                if (!this._data.posts) this._data.posts = [];
                if (!this._data.aiJobs) this._data.aiJobs = [];
                if (!this._data.aiSettings) this._data.aiSettings = { ...DEFAULT_AI_SETTINGS };
                if (!this._data.auditLog) this._data.auditLog = [];
                await this._ensureDefaultWorkspace();
            } else {
                this._data = JSON.parse(JSON.stringify(DEFAULT_DB));
                await this.save();
            }
        } catch (e) {
            console.error('[DB] Gagal memuat db.json, memakai default.', e.message);
            this._data = JSON.parse(JSON.stringify(DEFAULT_DB));
        }
        console.log('✅ [DB] Mode file db.json (lokal)');
        return this;
    }

    async _ensureDefaultWorkspace() {
        if (!this._data.workspaces) this._data.workspaces = [];
        const hasDefault = this._data.workspaces.some(w => w.id === DEFAULT_WORKSPACE_ID);
        if (!hasDefault) {
            this._data.workspaces.unshift(defaultWorkspaceRecord());
            await this.save();
        }
    }

    async save() {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(this._data, null, 2), 'utf-8');
        } catch (e) {
            console.error('[DB] Gagal menyimpan db.json:', e.message);
        }
    }

    async getUsers() {
        return this._data.users || [];
    }

    async getUserByEmail(email) {
        return (this._data.users || []).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    }

    async addUser(userData) {
        const user = { id: 'user-' + Date.now(), ...userData, createdAt: new Date().toISOString() };
        this._data.users.push(user);
        await this.save();
        return user;
    }

    async updateUser(id, updates) {
        const idx = (this._data.users || []).findIndex(u => u.id === id);
        if (idx === -1) return null;
        const { id: _id, createdAt: _c, ...safe } = updates || {};
        this._data.users[idx] = {
            ...this._data.users[idx],
            ...safe,
            updatedAt: new Date().toISOString()
        };
        await this.save();
        return this._data.users[idx];
    }

    async getWorkspaces() {
        await this._ensureDefaultWorkspace();
        return this._data.workspaces || [];
    }

    async getAccounts(opts = {}) {
        let list = (this._data.accounts || []).map(decryptAccountTokens);
        if (opts.workspaceId) {
            list = filterByWorkspace(list, opts.workspaceId, {
                includeMissing: normalizeWorkspaceId(opts.workspaceId) === DEFAULT_WORKSPACE_ID
            });
        }
        return list;
    }

    async getAccountByPlatform(platform, opts = {}) {
        const list = await this.getAccounts(opts);
        return list.find(a => a.platform === platform) || null;
    }

    async upsertAccount(accountData) {
        const workspaceId = normalizeWorkspaceId(accountData.workspaceId || DEFAULT_WORKSPACE_ID);
        const payload = withWorkspaceId({ ...accountData, workspaceId }, workspaceId);
        const idx = this._data.accounts.findIndex(a => a.platform === payload.platform);
        if (idx !== -1) {
            const merged = {
                ...this._data.accounts[idx],
                ...payload,
                workspaceId,
                updatedAt: new Date().toISOString()
            };
            // Re-encrypt tokens (decrypt-on-read → encrypt-on-write)
            this._data.accounts[idx] = encryptAccountTokens(merged);
        } else {
            this._data.accounts.push(encryptAccountTokens({
                id: 'acc-' + payload.platform + '-' + Date.now(),
                ...payload,
                workspaceId,
                connected: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
        }
        await this.save();
        return this.getAccountByPlatform(payload.platform, { workspaceId });
    }

    async disconnectAccount(platform) {
        const idx = this._data.accounts.findIndex(a => a.platform === platform);
        if (idx === -1) return false;
        const row = this._data.accounts[idx];
        row.connected = false;
        row.accessToken = null;
        row.refreshToken = null;
        row.pageToken = null;
        row.sessionState = null;
        row.password = null;
        row.updatedAt = new Date().toISOString();
        await this.save();
        return true;
    }

    async getPosts(opts = {}) {
        let list = this._data.posts || [];
        if (opts.workspaceId) {
            list = filterByWorkspace(list, opts.workspaceId, {
                includeMissing: normalizeWorkspaceId(opts.workspaceId) === DEFAULT_WORKSPACE_ID
            });
        }
        return list;
    }

    async getPostById(id) {
        return (this._data.posts || []).find(p => p.id === id) || null;
    }

    async addPost(postData) {
        const workspaceId = normalizeWorkspaceId(postData.workspaceId || DEFAULT_WORKSPACE_ID);
        const post = {
            id: 'post-' + Date.now(),
            ...withWorkspaceId(postData, workspaceId),
            workspaceId,
            createdAt: new Date().toISOString()
        };
        this._data.posts.push(post);
        await this.save();
        return post;
    }

    async updatePost(id, updates) {
        const idx = this._data.posts.findIndex(p => p.id === id);
        if (idx === -1) return null;
        this._data.posts[idx] = {
            ...this._data.posts[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        await this.save();
        return this._data.posts[idx];
    }

    async deletePost(id) {
        const before = this._data.posts.length;
        this._data.posts = this._data.posts.filter(p => p.id !== id);
        if (this._data.posts.length < before) {
            await this.save();
            return true;
        }
        return false;
    }

    async getDueScheduledPosts() {
        if (!this._data) return [];
        const now = new Date();
        return (this._data.posts || []).filter(p => {
            if (p.status !== 'scheduled') return false;
            return new Date(p.publishDate) <= now;
        });
    }

    async getAiJobs(opts = {}) {
        let list = this._data.aiJobs || [];
        if (opts.workspaceId) {
            list = filterByWorkspace(list, opts.workspaceId, {
                includeMissing: normalizeWorkspaceId(opts.workspaceId) === DEFAULT_WORKSPACE_ID
            });
        }
        return list;
    }

    async getAiJobById(id) {
        return (this._data.aiJobs || []).find(j => j.id === id) || null;
    }

    async addAiJob(jobData) {
        const now = new Date().toISOString();
        const workspaceId = normalizeWorkspaceId(jobData.workspaceId || DEFAULT_WORKSPACE_ID);
        const job = {
            id: 'job-' + Date.now(),
            brief: '',
            structuredBrief: null,
            status: 'queued',
            questions: [],
            draftHistory: [],
            decisionLog: [],
            caption: '',
            platforms: [],
            mediaUrl: '',
            mediaType: '',
            employeeName: 'Karyawan AI',
            employeeRole: 'content',
            roleId: null,
            runId: null,
            version: 1,
            lastError: null,
            publishResults: {},
            ...jobData,
            workspaceId,
            createdAt: now,
            updatedAt: now
        };
        this._data.aiJobs.push(job);
        await this.save();
        return job;
    }

    async updateAiJob(id, updates) {
        const idx = (this._data.aiJobs || []).findIndex(j => j.id === id);
        if (idx === -1) return null;
        this._data.aiJobs[idx] = {
            ...this._data.aiJobs[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        await this.save();
        return this._data.aiJobs[idx];
    }

    async getAiSettings() {
        return normalizeAiSettings(this._data.aiSettings);
    }

    async updateAiSettings(partial) {
        const current = normalizeAiSettings(this._data.aiSettings);
        const merged = normalizeAiSettings({ ...current, ...partial });
        this._data.aiSettings = merged;
        await this.save();
        return merged;
    }

    async appendAuditLog(entry) {
        if (!this._data.auditLog) this._data.auditLog = [];
        const row = {
            id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            actor: entry.actor || 'system',
            action: entry.action || 'unknown',
            target: entry.target || '',
            detail: entry.detail || {},
            createdAt: new Date().toISOString()
        };
        this._data.auditLog.unshift(row);
        this._data.auditLog = this._data.auditLog.slice(0, 500);
        await this.save();
        return row;
    }

    async getAuditLog({ limit = 50, offset = 0 } = {}) {
        const list = this._data.auditLog || [];
        return list.slice(offset, offset + limit);
    }
}

const usePostgres = !!process.env.DATABASE_URL;
const db = usePostgres ? require('./db-postgres') : new JsonDatabase();

module.exports = db;
