#!/usr/bin/env node
/**
 * MCP Server PiK's Digital Lab — transport stdio (lokal, untuk Cursor /
 * Claude Desktop di mesin ini). Daftarkan lewat .cursor/mcp.json.
 *
 * Env:
 *   PIKS_BASE_URL   alamat aplikasi (bawaan http://localhost:3000)
 *   PIKS_TOKEN      session token dari POST /api/auth/login (disarankan), atau
 *   PIKS_EMAIL + PIKS_PASSWORD  untuk login otomatis saat server MCP start.
 *
 * Catatan: stdout dipakai protokol MCP — log hanya ke stderr.
 */
const path = require('path');
try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch { /* dotenv opsional; env dari klien MCP tetap dipakai */ }

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createPiksMcpServer, resolveToken } = require('./create-server');

async function main() {
    const baseUrl = (process.env.PIKS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const token = await resolveToken({
        baseUrl,
        token: process.env.PIKS_TOKEN,
        email: process.env.PIKS_EMAIL || process.env.ADMIN_EMAIL,
        password: process.env.PIKS_PASSWORD || process.env.ADMIN_PASSWORD
    });
    if (!token) {
        console.error('[piks-mcp] PIKS_TOKEN kosong dan PIKS_EMAIL/PIKS_PASSWORD tidak tersedia — tool akan ditolak API (401).');
    }
    const server = createPiksMcpServer({ baseUrl, token });
    await server.connect(new StdioServerTransport());
    console.error(`[piks-mcp] terhubung via stdio → ${baseUrl}`);
}

main().catch(err => {
    console.error('[piks-mcp] gagal start:', err.message);
    process.exit(1);
});
