/**
 * PostSphere - Database Manager (JSON file-based)
 * Menyimpan akun terhubung, token akses, antrean post, dan riwayat posting
 * ke dalam file db.json agar tidak perlu database eksternal.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

// Struktur database awal jika db.json belum ada
const DEFAULT_DB = {
    users: [],
    accounts: [],
    posts: []
};

class Database {
    constructor() {
        this._data = null;
    }

    /**
     * Memuat data dari db.json ke memori
     */
    load() {
        try {
            if (fs.existsSync(DB_PATH)) {
                const raw = fs.readFileSync(DB_PATH, 'utf-8');
                this._data = JSON.parse(raw);
                // Pastikan struktur lengkap
                if (!this._data.users) this._data.users = [];
                if (!this._data.accounts) this._data.accounts = [];
                if (!this._data.posts) this._data.posts = [];
            } else {
                this._data = JSON.parse(JSON.stringify(DEFAULT_DB));
                this.save();
            }
        } catch (e) {
            console.error('[DB] Gagal memuat db.json, menggunakan data default.', e.message);
            this._data = JSON.parse(JSON.stringify(DEFAULT_DB));
        }
        return this;
    }

    /**
     * Menulis data dari memori ke db.json
     */
    save() {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(this._data, null, 2), 'utf-8');
        } catch (e) {
            console.error('[DB] Gagal menyimpan ke db.json:', e.message);
        }
    }

    // ----------------------------------------------------------------
    // USERS
    // ----------------------------------------------------------------
    getUsers() {
        return this._data.users || [];
    }

    getUserByEmail(email) {
        return (this._data.users || []).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    }

    addUser(userData) {
        const user = {
            id: 'user-' + Date.now(),
            ...userData,
            createdAt: new Date().toISOString()
        };
        this._data.users.push(user);
        this.save();
        return user;
    }

    // ----------------------------------------------------------------
    // ACCOUNTS
    // ----------------------------------------------------------------
    getAccounts() {
        return this._data.accounts || [];
    }

    getAccountByPlatform(platform) {
        return (this._data.accounts || []).find(a => a.platform === platform) || null;
    }

    upsertAccount(accountData) {
        const idx = this._data.accounts.findIndex(a => a.platform === accountData.platform);
        if (idx !== -1) {
            this._data.accounts[idx] = { ...this._data.accounts[idx], ...accountData, updatedAt: new Date().toISOString() };
        } else {
            this._data.accounts.push({
                id: 'acc-' + accountData.platform + '-' + Date.now(),
                ...accountData,
                connected: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        this.save();
        return this.getAccountByPlatform(accountData.platform);
    }

    disconnectAccount(platform) {
        const idx = this._data.accounts.findIndex(a => a.platform === platform);
        if (idx !== -1) {
            this._data.accounts[idx].connected = false;
            this._data.accounts[idx].accessToken = null;
            this._data.accounts[idx].updatedAt = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    // ----------------------------------------------------------------
    // POSTS
    // ----------------------------------------------------------------
    getPosts() {
        return this._data.posts || [];
    }

    getPostById(id) {
        return (this._data.posts || []).find(p => p.id === id) || null;
    }

    addPost(postData) {
        const post = {
            id: 'post-' + Date.now(),
            ...postData,
            createdAt: new Date().toISOString()
        };
        this._data.posts.push(post);
        this.save();
        return post;
    }

    updatePost(id, updates) {
        const idx = this._data.posts.findIndex(p => p.id === id);
        if (idx !== -1) {
            this._data.posts[idx] = { ...this._data.posts[idx], ...updates, updatedAt: new Date().toISOString() };
            this.save();
            return this._data.posts[idx];
        }
        return null;
    }

    deletePost(id) {
        const before = this._data.posts.length;
        this._data.posts = this._data.posts.filter(p => p.id !== id);
        if (this._data.posts.length < before) {
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Mengambil semua postingan yang dijadwalkan dan sudah melewati waktu rilis
     */
    getDueScheduledPosts() {
        const now = new Date();
        return (this._data.posts || []).filter(p => {
            if (p.status !== 'scheduled') return false;
            return new Date(p.publishDate) <= now;
        });
    }
}

// Export singleton instance
const db = new Database();
module.exports = db;
