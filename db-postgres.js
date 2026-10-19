/**
 * PiK's Digital Lab — Neon Postgres adapter (semua method async)
 */
const { neon } = require('@neondatabase/serverless');
const { normalizeAiSettings, DEFAULT_AI_SETTINGS } = require('./lib/ai-policy');
const { encryptAccountTokens, decryptAccountTokens } = require('./lib/token-crypto');
const {
    DEFAULT_WORKSPACE_ID,
    defaultWorkspaceRecord,
    normalizeWorkspaceId,
    withWorkspaceId,
    filterByWorkspace
} = require('./lib/workspace');
const { migrateAccountsTenantSchema } = require('./lib/accounts-tenant');

function getSql() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL tidak diset');
    return neon(url);
}

function rowToAccount(r) {
    const data = typeof r.data === 'object' && r.data ? r.data : {};
    const workspaceId = normalizeWorkspaceId(
        r.workspace_id || data.workspaceId || DEFAULT_WORKSPACE_ID
    );
    return decryptAccountTokens({
        id: r.id,
        platform: r.platform,
        connected: r.connected,
        ...data,
        workspaceId,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    });
}

function rowToPost(r) {
    const data = typeof r.data === 'object' && r.data ? r.data : {};
    return {
        id: r.id,
        ...data,
        status: r.status || data.status,
        publishDate: r.publish_date || data.publishDate,
        createdBy: r.created_by || data.createdBy,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
}

function rowToAiJob(r) {
    const data = typeof r.data === 'object' && r.data ? r.data : {};
    return {
        id: r.id,
        ...data,
        brief: r.brief != null ? r.brief : data.brief,
        status: r.status || data.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
}

class PostgresDatabase {
    async load() {
        const sql = getSql();
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                workspace_id TEXT NOT NULL DEFAULT 'default',
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                connected BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT,
                publish_date TIMESTAMPTZ,
                created_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_posts_status_publish ON posts (status, publish_date)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_accounts_connected ON accounts (connected)`;
        // P3: UNIQUE (workspace_id, platform); drop UNIQUE(platform) lama jika ada
        await migrateAccountsTenantSchema(sql);
        await sql`
            CREATE TABLE IF NOT EXISTS ai_jobs (
                id TEXT PRIMARY KEY,
                brief TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs (status)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_ai_jobs_created ON ai_jobs (created_at DESC)`;
        await sql`
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                actor TEXT,
                action TEXT,
                target TEXT,
                detail JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC)`;
        // Multi-tenant: workspaces + workspace_id di accounts
        await sql`
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql`
            INSERT INTO workspaces (id, name, data)
            VALUES (${DEFAULT_WORKSPACE_ID}, ${'Default'}, ${{}})
            ON CONFLICT (id) DO NOTHING
        `;
        console.log('✅ [DB] Terhubung ke Neon Postgres (tenant UNIQUE workspace+platform)');
        return this;
    }

    async getWorkspaces() {
        const sql = getSql();
        const rows = await sql`SELECT id, name, data, created_at FROM workspaces ORDER BY created_at`;
        if (!rows.length) {
            const def = defaultWorkspaceRecord();
            await sql`
                INSERT INTO workspaces (id, name, data)
                VALUES (${def.id}, ${def.name}, ${{}})
                ON CONFLICT (id) DO NOTHING
            `;
            return [def];
        }
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            ...(typeof r.data === 'object' && r.data ? r.data : {}),
            createdAt: r.created_at
        }));
    }

    async save() {}

    async getUsers() {
        const sql = getSql();
        const rows = await sql`SELECT id, data, created_at FROM users ORDER BY created_at`;
        return rows.map(r => ({ id: r.id, ...(r.data || {}), createdAt: r.created_at }));
    }

    async getUserByEmail(email) {
        const users = await this.getUsers();
        return users.find(u => (u.email || '').toLowerCase() === String(email).toLowerCase()) || null;
    }

    async addUser(userData) {
        const sql = getSql();
        const id = 'user-' + Date.now();
        const createdAt = new Date().toISOString();
        const { id: _i, createdAt: _c, ...rest } = userData;
        await sql`INSERT INTO users (id, data, created_at) VALUES (${id}, ${rest}, ${createdAt})`;
        return { id, ...rest, createdAt };
    }

    async updateUser(id, updates) {
        const sql = getSql();
        const rows = await sql`SELECT id, data, created_at FROM users WHERE id = ${id} LIMIT 1`;
        if (!rows[0]) return null;
        const { id: _id, createdAt: _c, ...safe } = updates || {};
        const merged = {
            ...(rows[0].data || {}),
            ...safe,
            updatedAt: new Date().toISOString()
        };
        await sql`UPDATE users SET data = ${merged} WHERE id = ${id}`;
        return { id, ...merged, createdAt: rows[0].created_at };
    }

    async getAccounts(opts = {}) {
        const sql = getSql();
        let rows;
        if (opts.workspaceId) {
            const wid = normalizeWorkspaceId(opts.workspaceId);
            if (wid === DEFAULT_WORKSPACE_ID) {
                // default: include legacy rows tanpa workspace_id / missing di JSON
                rows = await sql`
                    SELECT id, platform, workspace_id, data, connected, created_at, updated_at
                    FROM accounts
                    WHERE workspace_id = ${wid}
                       OR workspace_id IS NULL
                       OR COALESCE(TRIM(data->>'workspaceId'), '') = ''
                       OR data->>'workspaceId' = ${DEFAULT_WORKSPACE_ID}
                    ORDER BY created_at
                `;
            } else {
                rows = await sql`
                    SELECT id, platform, workspace_id, data, connected, created_at, updated_at
                    FROM accounts
                    WHERE workspace_id = ${wid}
                    ORDER BY created_at
                `;
            }
        } else {
            rows = await sql`
                SELECT id, platform, workspace_id, data, connected, created_at, updated_at
                FROM accounts ORDER BY created_at
            `;
        }
        let list = rows.map(rowToAccount);
        if (opts.workspaceId) {
            list = filterByWorkspace(list, opts.workspaceId, {
                includeMissing: normalizeWorkspaceId(opts.workspaceId) === DEFAULT_WORKSPACE_ID
            });
        }
        return list;
    }

    async getAccountByPlatform(platform, opts = {}) {
        const list = await this.getAccounts(opts.workspaceId ? opts : { workspaceId: DEFAULT_WORKSPACE_ID });
        return list.find(a => a.platform === platform) || null;
    }

    async upsertAccount(accountData) {
        const sql = getSql();
        const workspaceId = normalizeWorkspaceId(accountData.workspaceId || DEFAULT_WORKSPACE_ID);
        const payload = withWorkspaceId({ ...accountData, workspaceId }, workspaceId);
        const existing = await this.getAccountByPlatform(payload.platform, { workspaceId });
        const now = new Date().toISOString();

        if (existing) {
            const merged = encryptAccountTokens({
                ...existing,
                ...payload,
                workspaceId,
                updatedAt: now
            });
            const { id, platform, connected, createdAt, updatedAt, workspaceId: _w, ...data } = merged;
            data.workspaceId = workspaceId;
            await sql`
                UPDATE accounts
                SET data = ${data},
                    workspace_id = ${workspaceId},
                    connected = ${merged.connected !== false},
                    updated_at = ${now}
                WHERE id = ${existing.id}
            `;
            return this.getAccountByPlatform(payload.platform, { workspaceId });
        }

        const sealed = encryptAccountTokens(payload);
        const id = 'acc-' + sealed.platform + '-' + workspaceId + '-' + Date.now();
        const {
            id: _id,
            platform: _p,
            connected: _c,
            createdAt: _ca,
            updatedAt: _ua,
            workspaceId: _w,
            ...data
        } = sealed;
        data.workspaceId = workspaceId;
        await sql`
            INSERT INTO accounts (id, platform, workspace_id, data, connected, created_at, updated_at)
            VALUES (${id}, ${sealed.platform}, ${workspaceId}, ${data}, ${true}, ${now}, ${now})
        `;
        return this.getAccountByPlatform(sealed.platform, { workspaceId });
    }

    async disconnectAccount(platform, opts = {}) {
        const workspaceId = normalizeWorkspaceId(opts.workspaceId || DEFAULT_WORKSPACE_ID);
        const existing = await this.getAccountByPlatform(platform, { workspaceId });
        if (!existing) return false;
        const sql = getSql();
        const now = new Date().toISOString();
        const { id, platform: p, connected, createdAt, updatedAt, workspaceId: _w, ...data } = existing;
        data.accessToken = null;
        data.refreshToken = null;
        data.pageToken = null;
        data.sessionState = null;
        data.password = null;
        data.workspaceId = workspaceId;
        await sql`
            UPDATE accounts
            SET connected = false, data = ${data}, workspace_id = ${workspaceId}, updated_at = ${now}
            WHERE id = ${existing.id}
        `;
        return true;
    }

    async getPosts(opts = {}) {
        const sql = getSql();
        const rows = await sql`
            SELECT id, data, status, publish_date, created_by, created_at, updated_at
            FROM posts ORDER BY created_at
        `;
        let list = rows.map(rowToPost);
        if (opts.workspaceId) {
            list = filterByWorkspace(list, opts.workspaceId, {
                includeMissing: normalizeWorkspaceId(opts.workspaceId) === DEFAULT_WORKSPACE_ID
            });
        }
        return list;
    }

    async getPostById(id) {
        const sql = getSql();
        const rows = await sql`
            SELECT id, data, status, publish_date, created_by, created_at, updated_at
            FROM posts WHERE id = ${id} LIMIT 1
        `;
        return rows[0] ? rowToPost(rows[0]) : null;
    }

    async addPost(postData) {
        const sql = getSql();
        const id = 'post-' + Date.now();
        const createdAt = new Date().toISOString();
        const workspaceId = normalizeWorkspaceId(postData.workspaceId || DEFAULT_WORKSPACE_ID);
        const post = { ...withWorkspaceId(postData, workspaceId), workspaceId, id, createdAt };
        const { id: _i, status, publishDate, createdBy, createdAt: _c, ...rest } = post;
        const data = { ...rest, status, publishDate, createdBy, workspaceId };
        await sql`
            INSERT INTO posts (id, data, status, publish_date, created_by, created_at)
            VALUES (${id}, ${data}, ${status || null}, ${publishDate || null}, ${createdBy || null}, ${createdAt})
        `;
        return post;
    }

    async updatePost(id, updates) {
        const existing = await this.getPostById(id);
        if (!existing) return null;
        const sql = getSql();
        const now = new Date().toISOString();
        const merged = { ...existing, ...updates, updatedAt: now };
        const { id: _i, status, publishDate, createdBy, createdAt, updatedAt, ...rest } = merged;
        const data = { ...rest, status, publishDate, createdBy };
        await sql`
            UPDATE posts
            SET data = ${data},
                status = ${status || null},
                publish_date = ${publishDate || null},
                created_by = ${createdBy || null},
                updated_at = ${now}
            WHERE id = ${id}
        `;
        return this.getPostById(id);
    }

    async deletePost(id) {
        const sql = getSql();
        const rows = await sql`DELETE FROM posts WHERE id = ${id} RETURNING id`;
        return rows.length > 0;
    }

    async getDueScheduledPosts() {
        const sql = getSql();
        const now = new Date().toISOString();
        const rows = await sql`
            SELECT id, data, status, publish_date, created_by, created_at, updated_at
            FROM posts
            WHERE status = 'scheduled' AND publish_date <= ${now}
        `;
        return rows.map(rowToPost);
    }

    async getAiJobs(opts = {}) {
        const sql = getSql();
        const rows = await sql`
            SELECT id, brief, status, data, created_at, updated_at
            FROM ai_jobs ORDER BY created_at DESC
        `;
        let list = rows.map(rowToAiJob);
        if (opts.workspaceId) {
            list = filterByWorkspace(list, opts.workspaceId, {
                includeMissing: normalizeWorkspaceId(opts.workspaceId) === DEFAULT_WORKSPACE_ID
            });
        }
        return list;
    }

    async getAiJobById(id) {
        const sql = getSql();
        const rows = await sql`
            SELECT id, brief, status, data, created_at, updated_at
            FROM ai_jobs WHERE id = ${id} LIMIT 1
        `;
        return rows[0] ? rowToAiJob(rows[0]) : null;
    }

    async addAiJob(jobData) {
        const sql = getSql();
        const id = 'job-' + Date.now();
        const now = new Date().toISOString();
        const workspaceId = normalizeWorkspaceId(jobData.workspaceId || DEFAULT_WORKSPACE_ID);
        const job = {
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
            id,
            createdAt: now,
            updatedAt: now
        };
        const { id: _i, brief, status, createdAt, updatedAt, ...rest } = job;
        const data = { ...rest, brief, status, workspaceId };
        await sql`
            INSERT INTO ai_jobs (id, brief, status, data, created_at, updated_at)
            VALUES (${id}, ${brief || ''}, ${status || 'queued'}, ${data}, ${now}, ${now})
        `;
        return job;
    }

    async updateAiJob(id, updates) {
        const existing = await this.getAiJobById(id);
        if (!existing) return null;
        const sql = getSql();
        const now = new Date().toISOString();
        const merged = { ...existing, ...updates, updatedAt: now };
        const { id: _i, brief, status, createdAt, updatedAt, ...rest } = merged;
        const data = { ...rest, brief, status };
        await sql`
            UPDATE ai_jobs
            SET brief = ${brief || ''},
                status = ${status || 'queued'},
                data = ${data},
                updated_at = ${now}
            WHERE id = ${id}
        `;
        return this.getAiJobById(id);
    }

    async getAiSettings() {
        const sql = getSql();
        const rows = await sql`
            SELECT data FROM app_meta WHERE key = 'ai_settings' LIMIT 1
        `;
        if (!rows[0]) return normalizeAiSettings(DEFAULT_AI_SETTINGS);
        let data = rows[0].data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                data = {};
            }
        }
        return normalizeAiSettings(data);
    }

    async updateAiSettings(partial) {
        const sql = getSql();
        const current = await this.getAiSettings();
        const p = partial || {};
        const llmPatch = p.llm && typeof p.llm === 'object' ? p.llm : null;
        const { llm: _drop, ...rest } = p;
        const next = { ...current, ...rest };
        if (llmPatch) {
            next.llm = {
                ...current.llm,
                ...llmPatch,
                apiKeyEnc: Object.prototype.hasOwnProperty.call(llmPatch, 'apiKeyEnc')
                    ? llmPatch.apiKeyEnc
                    : current.llm.apiKeyEnc
            };
        }
        const merged = normalizeAiSettings(next);
        const now = new Date().toISOString();
        await sql`
            INSERT INTO app_meta (key, data, updated_at)
            VALUES ('ai_settings', ${merged}, ${now})
            ON CONFLICT (key) DO UPDATE SET data = ${merged}, updated_at = ${now}
        `;
        return merged;
    }

    async getAiChatMessages({ limit = 80 } = {}) {
        const sql = getSql();
        await sql`
            CREATE TABLE IF NOT EXISTS ai_chat (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 80));
        const all = await sql`
            SELECT id, data, created_at FROM ai_chat
            ORDER BY created_at DESC
            LIMIT ${lim}
        `;
        return all.reverse().map(r => ({
            id: r.id,
            ...(r.data || {}),
            createdAt: r.created_at
        }));
    }

    async appendAiChatMessage(msg) {
        const sql = getSql();
        await sql`
            CREATE TABLE IF NOT EXISTS ai_chat (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        const id = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const createdAt = new Date().toISOString();
        const row = {
            id,
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: String(msg.content || '').slice(0, 8000),
            roleId: msg.roleId || null,
            employeeName: msg.employeeName || null,
            jobId: msg.jobId || null,
            meta: msg.meta || {},
            createdAt
        };
        const { id: _i, createdAt: _c, ...data } = row;
        await sql`
            INSERT INTO ai_chat (id, data, created_at)
            VALUES (${id}, ${data}, ${createdAt})
        `;
        return row;
    }

    async clearAiChat() {
        const sql = getSql();
        await sql`CREATE TABLE IF NOT EXISTS ai_chat (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`;
        await sql`DELETE FROM ai_chat`;
        return true;
    }

    async appendAuditLog(entry) {
        const sql = getSql();
        const id = 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const createdAt = new Date().toISOString();
        const row = {
            id,
            actor: entry.actor || 'system',
            action: entry.action || 'unknown',
            target: entry.target || '',
            detail: entry.detail || {},
            createdAt
        };
        await sql`
            INSERT INTO audit_log (id, actor, action, target, detail, created_at)
            VALUES (${row.id}, ${row.actor}, ${row.action}, ${row.target}, ${row.detail}, ${createdAt})
        `;
        return row;
    }

    async getAuditLog({ limit = 50, offset = 0 } = {}) {
        const sql = getSql();
        const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const off = Math.max(0, parseInt(offset, 10) || 0);
        const rows = await sql`
            SELECT id, actor, action, target, detail, created_at
            FROM audit_log
            ORDER BY created_at DESC
            LIMIT ${lim} OFFSET ${off}
        `;
        return rows.map(r => ({
            id: r.id,
            actor: r.actor,
            action: r.action,
            target: r.target,
            detail: r.detail || {},
            createdAt: r.created_at
        }));
    }
}

module.exports = new PostgresDatabase();
