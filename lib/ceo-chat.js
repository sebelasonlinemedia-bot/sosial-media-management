/**
 * Orkestrasi Chat CEO → LLM karyawan → opsional create AI job.
 */

const { chatCompletion } = require('./llm');
const { listRoles, getRoleById } = require('./ai-roles');
const { decryptSecret } = require('./token-crypto');

function buildSystemPrompt(roleId) {
    const roles = listRoles();
    const role = getRoleById(roleId) || getRoleById('manager') || roles[0];
    const roster = roles.map(r => `- ${r.id}: ${r.name} (${r.title}) — ${r.task || r.systemBrief || ''}`).join('\n');

    return `Anda adalah ${role.name}, ${role.title} di Tim Konten AI PiK's Digital Lab.
Peran Anda: ${role.systemBrief || role.task || role.title}

Tim:
${roster}

CEO berbicara kepada Anda lewat chat webapp. Tugas Anda:
1. Pahami perintah CEO.
2. Jika brief kurang jelas, tanya singkat (jangan bertele-tele).
3. Jika cukup untuk membuat tugas konten, siapkan brief kerja.

WAJIB balas HANYA JSON valid (tanpa markdown) dengan skema:
{
  "reply": "pesan ke CEO (bahasa Indonesia, profesional, singkat)",
  "createJob": true|false,
  "roleId": "manager|strategist|copywriter|visual-producer|community-manager|analyst|compliance",
  "brief": "teks brief untuk work board jika createJob",
  "caption": "opsional draft caption jika siap",
  "platforms": ["instagram","facebook"] 
}

Aturan:
- createJob=true hanya jika perintah jelas untuk konten/publish/jadwal.
- Default roleId = manager jika perintah umum ke tim.
- Jangan mengarang API key atau kredensial.
- Jangan klaim sudah publish jika createJob saja.`;
}

function parseLlmJson(text) {
    let raw = String(text || '').trim();
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    try {
        return JSON.parse(raw);
    } catch {
        return {
            reply: raw.slice(0, 2000) || 'Maaf, saya belum bisa memproses perintah itu.',
            createJob: false
        };
    }
}

/**
 * @param {object} opts
 * @param {object} opts.settings - ai settings (dengan llmApiKeyEnc)
 * @param {string} opts.ceoMessage
 * @param {string} [opts.roleId]
 * @param {Array} [opts.history]
 */
async function runCeoChatTurn(opts) {
    const settings = opts.settings || {};
    const llm = settings.llm || {};
    const provider = llm.provider || 'gemini';
    const model = llm.model || '';
    const apiKey = decryptSecret(llm.apiKeyEnc || '') || '';
    if (!apiKey) {
        const err = new Error('API key LLM belum diatur. Buka Pengaturan LLM di Kantor AI.');
        err.code = 'LLM_NOT_CONFIGURED';
        throw err;
    }

    const roleId = opts.roleId || 'manager';
    const history = (opts.history || []).slice(-12).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
    }));
    history.push({ role: 'user', content: String(opts.ceoMessage || '').trim() });

    const text = await chatCompletion({
        provider,
        model,
        apiKey,
        system: buildSystemPrompt(roleId),
        messages: history
    });

    const parsed = parseLlmJson(text);
    const safeRole = getRoleById(parsed.roleId) ? parsed.roleId : roleId;

    return {
        reply: String(parsed.reply || '').trim() || 'Siap, CEO.',
        createJob: !!parsed.createJob,
        roleId: safeRole,
        brief: String(parsed.brief || opts.ceoMessage || '').trim(),
        caption: parsed.caption ? String(parsed.caption).trim() : '',
        platforms: Array.isArray(parsed.platforms)
            ? parsed.platforms.map(p => String(p).toLowerCase())
            : [],
        provider,
        model: model || undefined
    };
}

module.exports = {
    buildSystemPrompt,
    parseLlmJson,
    runCeoChatTurn
};
