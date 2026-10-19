/**
 * PostSphere — Database facade
 * - Lokal tanpa DATABASE_URL → db.json (file)
 * - Vercel / Neon → Postgres via DATABASE_URL
 *
 * Semua method async agar API seragam.
 */

const fs = require('fs');
const path = require('path');
const { normalizeAiSettings, DEFAULT_AI_SETTINGS } = require('./lib/ai-policy');
const { encryptAccountTokens, decryptAccountTokens } = require('./lib/token-crypto');

const DB_PATH = path.join(__dirname, 'db.json');
const DEFAULT_DB = {
    users: [],
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
                if (!this._data.accounts) this._data.accounts = [];
                if (!this._data.posts) this._data.posts = [];
                if (!this._data.aiJobs) this._data.aiJobs = [];
                if (!this._data.aiSettings) this._data.aiSettings = { ...DEFAULT_AI_SETTINGS };
                if (!this._data.auditLog) this._data.auditLog = [];
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

    async getAccounts() {
        return (this._data.accounts || []).map(decryptAccountTokens);
    }

    async getAccountByPlatform(platform) {
        const row = (this._data.accounts || []).find(a => a.platform === platform) || null;
        return row ? decryptAccountTokens(row) : null;
    }

    async upsertAccount(accountData) {
        const idx = this._data.accounts.findIndex(a => a.platform === accountData.platform);
        if (idx !== -1) {
            const merged = {
                ...this._data.accounts[idx],
                ...accountData,
                updatedAt: new Date().toISOString()
            };
            // Re-encrypt tokens (decrypt-on-read → encrypt-on-write)
            this._data.accounts[idx] = encryptAccountTokens(merged);
        } else {
            this._data.accounts.push(encryptAccountTokens({
                id: 'acc-' + accountData.platform + '-' + Date.now(),
                ...accountData,
                connected: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
        }
        await this.save();
        return this.getAccountByPlatform(accountData.platform);
    }

    async disconnectAccount(platform) {
        const idx = this._data.accounts.findIndex(a => a.platform === platform);
        if (idx === -1) return false;
        this._data.accounts[idx].connected = false;
        this._data.accounts[idx].accessToken = null;
        this._data.accounts[idx].updatedAt = new Date().toISOString();
        await this.save();
        return true;
    }

    async getPosts() {
        return this._data.posts || [];
    }

    async getPostById(id) {
        return (this._data.posts || []).find(p => p.id === id) || null;
    }

    async addPost(postData) {
        const post = { id: 'post-' + Date.now(), ...postData, createdAt: new Date().toISOString() };
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

    async getAiJobs() {
        return this._data.aiJobs || [];
    }

    async getAiJobById(id) {
        return (this._data.aiJobs || []).find(j => j.id === id) || null;
    }

    async addAiJob(jobData) {
        const now = new Date().toISOString();
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
