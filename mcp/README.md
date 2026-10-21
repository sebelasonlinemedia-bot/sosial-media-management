# MCP Server — PiK's Digital Lab

Menghubungkan PiK's Digital Lab ke klien MCP (Cursor, Claude Desktop, dll.)
lewat 11 tool: `office_context`, `list_roles`, `list_jobs`, `get_job`,
`create_job`, `answer_job`, `request_revision`, `approve_job`, `run_job`,
`get_insights`, `list_accounts`.

Semua tool meneruskan panggilan ke REST API dengan `Authorization: Bearer
<session token>`, jadi auth, peran, `emergencyPause`, otonomi, gate publish,
dan penjaga versi basi tetap berlaku. Token OAuth platform tidak pernah
diekspos.

## Lokal (stdio, untuk Cursor)

Sudah didaftarkan di `.cursor/mcp.json` proyek:

```json
{
  "mcpServers": {
    "piks-digital-lab": {
      "command": "node",
      "args": ["mcp/server.js"],
      "env": { "PIKS_BASE_URL": "http://localhost:3000" }
    }
  }
}
```

Pastikan `npm run dev` jalan. `mcp/server.js` login otomatis memakai
`ADMIN_EMAIL`/`ADMIN_PASSWORD` dari `.env`, atau pakai token langsung lewat
env `PIKS_TOKEN` (hasil `POST /api/auth/login`). Restart Cursor setelah
mengubah `mcp.json`.

## Production (Streamable HTTP)

Endpoint `POST /mcp` di deployment yang sama (wajib auth). Contoh pendaftaran
klien jarak jauh:

```json
{
  "mcpServers": {
    "piks-digital-lab": {
      "url": "https://sosial-media-management-three.vercel.app/mcp",
      "headers": { "Authorization": "Bearer <session-token>" }
    }
  }
}
```

Session token didapat dari `POST /api/auth/login` (`token` pada respons).
Jangan commit token ke repo.

## Uji cepat

Dengan server lokal menyala:

```sh
npx @modelcontextprotocol/inspector node mcp/server.js
```

atau jalankan test bawaan repo lain (`npm run test:office-life` dsb.) untuk
regresi aplikasi utama — MCP sendiri teruji lewat SDK client (tools/list,
list_roles, create_job, get_job pada kedua transport).
