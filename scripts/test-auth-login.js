/**
 * Smoke test login bootstrap — tidak mencetak password / hash.
 * Usage: node scripts/test-auth-login.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const auth = require('../lib/auth');

async function main() {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const plain = process.env.ADMIN_PASSWORD;
    const hasHash = !!(process.env.ADMIN_PASSWORD_HASH || '').trim();

    if (!email || (!plain && !hasHash)) {
        console.error('FAIL: set ADMIN_EMAIL + ADMIN_PASSWORD (atau ADMIN_PASSWORD_HASH) di .env');
        process.exit(1);
    }

    const memoryDb = {
        _users: [],
        async getUsers() { return this._users; },
        async getUserByEmail(e) {
            return this._users.find(u => u.email.toLowerCase() === String(e).toLowerCase()) || null;
        },
        async addUser(data) {
            const user = { id: 'u-test', ...data, createdAt: new Date().toISOString() };
            this._users.push(user);
            return user;
        },
        async updateUser(id, updates) {
            const idx = this._users.findIndex(u => u.id === id);
            if (idx === -1) return null;
            this._users[idx] = { ...this._users[idx], ...updates };
            return this._users[idx];
        }
    };

    // 1) Create bootstrap with short password
    process.env.ADMIN_EMAIL = email;
    process.env.ADMIN_PASSWORD = plain || '123';
    delete process.env.ADMIN_PASSWORD_HASH;

    const created = await auth.ensureBootstrapAdmin(memoryDb);
    if (!created || created.email !== email) {
        console.error('FAIL: bootstrap create');
        process.exit(1);
    }

    const okCreate = await auth.verifyPassword(process.env.ADMIN_PASSWORD, created.passwordHash);
    if (!okCreate) {
        console.error('FAIL: verify after create');
        process.exit(1);
    }

    // 2) Sync when env password changes (short password OK)
    process.env.ADMIN_PASSWORD = '456';
    const synced = await auth.ensureBootstrapAdmin(memoryDb);
    const okSync = await auth.verifyPassword('456', synced.passwordHash);
    const oldRejected = !(await auth.verifyPassword(plain || '123', synced.passwordHash));
    if (!okSync || !oldRejected) {
        console.error('FAIL: password sync from env');
        process.exit(1);
    }

    // 3) Wrong password rejected
    const wrong = await auth.verifyPassword('wrong', synced.passwordHash);
    if (wrong) {
        console.error('FAIL: wrong password accepted');
        process.exit(1);
    }

    console.log('PASS: bootstrap create + short-password sync + verify');
}

main().catch(err => {
    console.error('FAIL:', err.message);
    process.exit(1);
});
