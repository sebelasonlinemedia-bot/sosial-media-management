/**
 * Resolusi API key LLM: settings terenkripsi → env fallback.
 * Jangan log nilai key.
 */

const { decryptSecret, isEncryptionEnabled } = require('./token-crypto');

const ENV_BY_PROVIDER = {
    gemini: ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY'],
    groq: ['GROQ_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    cursor: ['CURSOR_API_KEY']
};

function envKeyForProvider(provider) {
    const keys = ENV_BY_PROVIDER[String(provider || '').toLowerCase()] || [];
    for (const name of keys) {
        const v = process.env[name];
        if (v && String(v).trim().length > 4) return String(v).trim();
    }
    return '';
}

/**
 * @returns {{ apiKey: string, source: 'settings'|'env'|'', decryptFailed: boolean }}
 */
function resolveLlmApiKey(settings) {
    const llm = (settings && settings.llm) || {};
    const provider = String(llm.provider || 'gemini').toLowerCase();
    const enc = llm.apiKeyEnc || '';
    let decryptFailed = false;

    if (enc) {
        const plain = decryptSecret(enc);
        if (plain && String(plain).trim().length > 4 && !String(plain).startsWith('enc:v1:')) {
            return { apiKey: String(plain).trim(), source: 'settings', decryptFailed: false };
        }
        // Ada blob tersimpan tapi tidak bisa dibuka
        if (String(enc).startsWith('enc:v1:')) decryptFailed = true;
    }

    const fromEnv = envKeyForProvider(provider);
    if (fromEnv) {
        return { apiKey: fromEnv, source: 'env', decryptFailed };
    }

    return { apiKey: '', source: '', decryptFailed };
}

function llmKeyStatus(settings) {
    const r = resolveLlmApiKey(settings);
    return {
        configured: !!r.apiKey,
        source: r.source || null,
        decryptFailed: r.decryptFailed,
        encryptionEnabled: isEncryptionEnabled(),
        hint: r.decryptFailed
            ? 'Key tersimpan tetapi tidak bisa dibuka — TOKEN_ENCRYPTION_KEY di Vercel mungkin berubah. Simpan ulang API key di Pengaturan → LLM, atau set GEMINI_API_KEY di env.'
            : (!r.apiKey
                ? 'Belum ada API key. Isi di Pengaturan → LLM, atau set GEMINI_API_KEY / GROQ_API_KEY di Vercel env.'
                : null)
    };
}

module.exports = {
    ENV_BY_PROVIDER,
    envKeyForProvider,
    resolveLlmApiKey,
    llmKeyStatus
};
