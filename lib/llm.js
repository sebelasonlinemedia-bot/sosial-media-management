/**
 * Client LLM untuk Chat CEO → karyawan AI.
 * Provider: openai | anthropic | gemini | groq | cursor
 * Jangan log apiKey.
 */

const axios = require('axios');
const path = require('path');

const PROVIDERS = {
    openai: {
        id: 'openai',
        label: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
        hint: 'Berbayar / trial — key dari platform.openai.com'
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        defaultModel: 'claude-sonnet-4-20250514',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
        hint: 'Berbayar / trial — key dari console.anthropic.com'
    },
    gemini: {
        id: 'gemini',
        label: 'Google Gemini (gratis cloud)',
        defaultModel: 'gemini-2.5-flash-lite',
        models: [
            'gemini-2.5-flash-lite',
            'gemini-2.5-flash',
            'gemini-3.5-flash-lite',
            'gemini-3.8-flash',
            'gemini-flash-latest'
        ],
        hint: 'Free tier — aistudio.google.com (lite lebih jarang overload)'
    },
    groq: {
        id: 'groq',
        label: 'Groq (gratis cloud)',
        defaultModel: 'llama-3.3-70b-versatile',
        models: [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'gemma2-9b-it',
            'mixtral-8x7b-32768'
        ],
        hint: 'Free tier — key dari console.groq.com'
    },
    cursor: {
        id: 'cursor',
        label: 'Cursor (SDK / API key)',
        defaultModel: 'composer-2.5',
        models: ['composer-2.5', 'composer-2', 'gpt-5.2', 'claude-4.6-sonnet-medium'],
        hint: 'CURSOR_API_KEY dari Cursor Dashboard → Integrations / API'
    }
};

const ALLOWED = new Set(Object.keys(PROVIDERS));

function listProviders() {
    return Object.values(PROVIDERS).map(p => ({
        id: p.id,
        label: p.label,
        defaultModel: p.defaultModel,
        models: p.models,
        hint: p.hint
    }));
}

function normalizeProvider(id) {
    const p = String(id || 'openai').toLowerCase();
    return ALLOWED.has(p) ? p : 'openai';
}

function defaultModelFor(provider) {
    return PROVIDERS[normalizeProvider(provider)]?.defaultModel || 'gpt-4o-mini';
}

async function chatOpenAiCompatible(baseUrl, apiKey, model, system, messages, extra = {}) {
    const res = await axios.post(
        `${baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
            model,
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: system },
                ...messages.map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: String(m.content || '')
                }))
            ],
            ...extra
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 90000
        }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Respons LLM kosong.');
    return text;
}

/** Model Gemini yang sudah di-shutdown → alias ke model aktif. */
const GEMINI_MODEL_ALIASES = {
    'gemini-2.0-flash': 'gemini-2.5-flash',
    'gemini-2.0-flash-001': 'gemini-2.5-flash',
    'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite-001': 'gemini-2.5-flash-lite',
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-flash'
};

function resolveGeminiModel(model) {
    const raw = String(model || PROVIDERS.gemini.defaultModel).trim();
    return GEMINI_MODEL_ALIASES[raw] || raw;
}

function isGeminiCapacityError(status, msg) {
    const m = String(msg || '').toLowerCase();
    return (
        status === 429 ||
        status === 503 ||
        m.includes('high demand') ||
        m.includes('overloaded') ||
        m.includes('resource exhausted') ||
        m.includes('try again later') ||
        m.includes('quota')
    );
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function chatGemini(apiKey, model, system, messages) {
    const contents = [];
    for (const m of messages) {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content || '') }]
        });
    }
    // Pastikan giliran terakhir = user
    if (!contents.length || contents[contents.length - 1].role !== 'user') {
        contents.push({ role: 'user', parts: [{ text: 'Lanjutkan.' }] });
    }

    const resolved = resolveGeminiModel(model);
    // Urutan: model user → lite (lebih longgar) → flash lain → alias latest
    const fallbacks = [
        resolved,
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest'
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let lastErr;
    for (let i = 0; i < fallbacks.length; i++) {
        const tryModel = fallbacks[i];
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(tryModel)}:generateContent` +
            `?key=${encodeURIComponent(apiKey)}`;
        const res = await axios.post(
            url,
            {
                systemInstruction: { parts: [{ text: system }] },
                contents,
                generationConfig: {
                    temperature: 0.4,
                    responseMimeType: 'application/json'
                }
            },
            { timeout: 90000, validateStatus: () => true }
        );
        const msg =
            res.data?.error?.message ||
            res.data?.message ||
            `HTTP ${res.status}`;

        if (res.status === 404 || isGeminiCapacityError(res.status, msg)) {
            lastErr = new Error(`Gemini (${tryModel}): ${msg}`);
            if (i < fallbacks.length - 1) await sleep(400);
            continue;
        }
        if (res.status >= 400) {
            throw new Error(`Gemini (${tryModel}): ${msg}`);
        }
        const parts = res.data?.candidates?.[0]?.content?.parts || [];
        const text = parts.map(p => p.text || '').join('');
        if (!text) {
            const block = res.data?.promptFeedback || res.data?.candidates?.[0]?.finishReason;
            throw new Error(`Respons Gemini kosong${block ? ` (${JSON.stringify(block)})` : ''}.`);
        }
        return text;
    }
    throw lastErr || new Error('Gemini gagal: semua model fallback penuh/tidak tersedia. Coba lagi atau ganti ke Groq.');
}

async function chatCursor(apiKey, model, system, messages) {
    let Agent;
    try {
        const mod = await import('@cursor/sdk');
        Agent = mod.Agent;
    } catch (e) {
        throw new Error(
            'Paket @cursor/sdk belum terpasang atau gagal dimuat. Jalankan: npm install @cursor/sdk'
        );
    }

    const transcript = messages
        .map(m => `${m.role === 'assistant' ? 'Assistant' : 'CEO'}: ${m.content}`)
        .join('\n\n');

    const prompt =
        `${system}\n\n---\nPercakapan:\n${transcript}\n\n` +
        `Balas HANYA JSON valid sesuai skema di system prompt (tanpa markdown).`;

    const result = await Agent.prompt(prompt, {
        apiKey,
        model: { id: model || PROVIDERS.cursor.defaultModel },
        local: { cwd: path.join(__dirname, '..') }
    });

    if (result?.status === 'error') {
        throw new Error(`Cursor agent gagal (run ${result.id || '?'}).`);
    }

    const text =
        (typeof result?.result === 'string' && result.result) ||
        (typeof result?.text === 'string' && result.text) ||
        (result?.result && typeof result.result === 'object' && result.result.text) ||
        '';

    if (!text) {
        // Beberapa versi SDK mengembalikan objek — stringify aman
        const fallback = result?.result != null ? JSON.stringify(result.result) : '';
        if (!fallback) throw new Error('Respons Cursor kosong.');
        return fallback;
    }
    return String(text);
}

/**
 * @param {{ provider: string, model?: string, apiKey: string, system: string, messages: {role,content}[] }} opts
 * @returns {Promise<string>} assistant text
 */
async function chatCompletion(opts) {
    const provider = normalizeProvider(opts.provider);
    const apiKey = opts.apiKey;
    if (!apiKey) throw new Error('API key LLM belum dikonfigurasi.');
    const messages = Array.isArray(opts.messages) ? opts.messages : [];
    const system = opts.system || '';
    const model = opts.model || defaultModelFor(provider);

    try {
        if (provider === 'openai') {
            return await chatOpenAiCompatible('https://api.openai.com/v1', apiKey, model, system, messages);
        }
        if (provider === 'groq') {
            return await chatOpenAiCompatible('https://api.groq.com/openai/v1', apiKey, model, system, messages);
        }
        if (provider === 'anthropic') {
            const res = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model,
                    max_tokens: 2048,
                    temperature: 0.4,
                    system,
                    messages: messages.map(m => ({
                        role: m.role === 'assistant' ? 'assistant' : 'user',
                        content: String(m.content || '')
                    }))
                },
                {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    },
                    timeout: 90000
                }
            );
            const blocks = res.data?.content || [];
            const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
            if (!text) throw new Error('Respons Anthropic kosong.');
            return text;
        }
        if (provider === 'gemini') {
            return await chatGemini(apiKey, model, system, messages);
        }
        if (provider === 'cursor') {
            return await chatCursor(apiKey, model, system, messages);
        }
    } catch (e) {
        const apiMsg = e.response?.data?.error?.message || e.response?.data?.message;
        if (apiMsg) throw new Error(`${provider}: ${apiMsg}`);
        if (e.response?.status === 404) {
            throw new Error(`${provider}: model/endpoint tidak ditemukan (404). Cek nama model di pengaturan LLM.`);
        }
        throw e;
    }

    throw new Error(`Provider LLM tidak didukung: ${provider}.`);
}

function maskApiKey(key) {
    if (!key || typeof key !== 'string') return null;
    const s = key.trim();
    if (s.length < 8) return '••••';
    return s.slice(0, 3) + '…' + s.slice(-4);
}

module.exports = {
    PROVIDERS,
    ALLOWED,
    listProviders,
    normalizeProvider,
    defaultModelFor,
    chatCompletion,
    maskApiKey
};
