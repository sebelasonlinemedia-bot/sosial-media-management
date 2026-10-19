/**
 * PostSphere — Neon Postgres adapter (semua method async)
 */
const { neon } = require('@neondatabase/serverless');

function getSql() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL tidak diset');
    return neon(url);
}

function rowToAccount(r) {
    return {
        id: r.id,
        platform: r.platform,
        connected: r.connected,
        ...(typeof r.data === 'object' && r.data ? r.data : {}),
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
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
                platform TEXT NOT NULL UNIQUE,
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
        console.log('✅ [DB] Terhubung ke Neon Postgres');
        return this;
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

    async getAccounts() {
        const sql = getSql();
        const rows = await sql`
            SELECT id, platform, data, connected, created_at, updated_at
            FROM accounts ORDER BY created_at
        `;
        return rows.map(rowToAccount);
    }

    async getAccountByPlatform(platform) {
        const sql = getSql();
        const rows = await sql`
            SELECT id, platform, data, connected, created_at, updated_at
            FROM accounts WHERE platform = ${platform} LIMIT 1
        `;
        return rows[0] ? rowToAccount(rows[0]) : null;
    }

    async upsertAccount(accountData) {
        const sql = getSql();
        const existing = await this.getAccountByPlatform(accountData.platform);
        const now = new Date().toISOString();

        if (existing) {
            const merged = { ...existing, ...accountData, updatedAt: now };
            const { id, platform, connected, createdAt, updatedAt, ...data } = merged;
            await sql`
                UPDATE accounts
                SET data = ${data},
                    connected = ${merged.connected !== false},
                    updated_at = ${now}
                WHERE platform = ${accountData.platform}
            `;
            return this.getAccountByPlatform(accountData.platform);
        }

        const id = 'acc-' + accountData.platform + '-' + Date.now();
        const { id: _id, platform: _p, connected: _c, createdAt: _ca, updatedAt: _ua, ...data } = accountData;
        await sql`
            INSERT INTO accounts (id, platform, data, connected, created_at, updated_at)
            VALUES (${id}, ${accountData.platform}, ${data}, ${true}, ${now}, ${now})
        `;
        return this.getAccountByPlatform(accountData.platform);
    }

    async disconnectAccount(platform) {
        const existing = await this.getAccountByPlatform(platform);
        if (!existing) return false;
        const sql = getSql();
        const now = new Date().toISOString();
        const { id, platform: p, connected, createdAt, updatedAt, ...data } = existing;
        data.accessToken = null;
        await sql`
            UPDATE accounts
            SET connected = false, data = ${data}, updated_at = ${now}
            WHERE platform = ${platform}
        `;
        return true;
    }

    async getPosts() {
        const sql = getSql();
        const rows = await sql`
            SELECT id, data, status, publish_date, created_by, created_at, updated_at
            FROM posts ORDER BY created_at
        `;
        return rows.map(rowToPost);
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
        const post = { ...postData, id, createdAt };
        const { id: _i, status, publishDate, createdBy, createdAt: _c, ...rest } = post;
        const data = { ...rest, status, publishDate, createdBy };
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
}

module.exports = new PostgresDatabase();
