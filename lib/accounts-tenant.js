/**
 * Multi-tenant accounts helpers (P3).
 * UNIQUE (workspace_id, platform) — default workspace tetap kompatibel.
 */

const { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } = require('./workspace');

/**
 * Cari index akun di array JSON berdasarkan platform + workspace.
 */
function findAccountIndex(accounts, platform, workspaceId) {
    const wid = normalizeWorkspaceId(workspaceId || DEFAULT_WORKSPACE_ID);
    const plat = String(platform || '');
    return (accounts || []).findIndex(a => {
        if (!a || a.platform !== plat) return false;
        return normalizeWorkspaceId(a.workspaceId || DEFAULT_WORKSPACE_ID) === wid;
    });
}

/**
 * Migrasi Postgres non-destruktif: kolom workspace_id + UNIQUE (workspace_id, platform).
 * BREAKING (disengaja): drop UNIQUE(platform) lama agar 2 workspace bisa share platform.
 * Data existing di-backfill workspace_id = data->>'workspaceId' || 'default'.
 *
 * @param {Function} sql — neon tagged template
 */
async function migrateAccountsTenantSchema(sql) {
    // Kolom tenant (idempotent)
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS workspace_id TEXT`;
    await sql`
        UPDATE accounts
        SET workspace_id = COALESCE(
            NULLIF(TRIM(COALESCE(data->>'workspaceId', '')), ''),
            ${DEFAULT_WORKSPACE_ID}
        )
        WHERE workspace_id IS NULL OR TRIM(workspace_id) = ''
    `;
    // DDL: literal 'default' di SQL (bukan $1) agar Neon/Postgres aman
    try {
        await sql`ALTER TABLE accounts ALTER COLUMN workspace_id SET DEFAULT 'default'`;
    } catch (e) {
        console.warn('[DB] workspace_id DEFAULT skip:', e.message);
    }
    await sql`
        UPDATE accounts SET workspace_id = ${DEFAULT_WORKSPACE_ID} WHERE workspace_id IS NULL
    `;
    try {
        await sql`ALTER TABLE accounts ALTER COLUMN workspace_id SET NOT NULL`;
    } catch (e) {
        console.warn('[DB] workspace_id NOT NULL skip:', e.message);
    }

    // Drop UNIQUE(platform) lama (nama default Postgres / index)
    try {
        await sql`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_platform_key`;
    } catch (e) {
        console.warn('[DB] drop accounts_platform_key:', e.message);
    }
    try {
        await sql`DROP INDEX IF EXISTS accounts_platform_key`;
    } catch (e) {
        console.warn('[DB] drop index accounts_platform_key:', e.message);
    }

    // UNIQUE baru per workspace
    await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_workspace_platform
        ON accounts (workspace_id, platform)
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_accounts_workspace_id ON accounts (workspace_id)`;
}

module.exports = {
    findAccountIndex,
    migrateAccountsTenantSchema
};
