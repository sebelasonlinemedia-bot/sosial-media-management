/**
 * Client LLM untuk Chat CEO → karyawan AI.
 * Provider: openai | anthropic (Claude).
 * Jangan log apiKey.
 */

const axios = require('axios');

const PROVIDERS = {
    openai: {
        id: 'openai',
        label: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1']
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        defaultModel: 'claude-sonnet-4-20250514',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest']
    }
};

function listProviders() {
    return Object.values(PROVIDERS).map(p => ({
        id: p.id,
        label: p.label,
        defaultModel: p.defaultModel,
        models: p.models
    }));
}

/**
 * @param {{ provider: string, model?: string, apiKey: string, system: string, messages: {role,content}[] }} opts
 * @returns {Promise<string>} assistant text
 */
async function chatCompletion(opts) {
    const provider = String(opts.provider || '').toLowerCase();
    const apiKey = opts.apiKey;
    if (!apiKey) throw new Error('API key LLM belum dikonfigurasi.');
    const messages = Array.isArray(opts.messages) ? opts.messages : [];
    const system = opts.system || '';

    if (provider === 'openai') {
        const model = opts.model || PROVIDERS.openai.defaultModel;
        const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
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
                ]
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
        if (!text) throw new Error('Respons OpenAI kosong.');
        return text;
    }

    if (provider === 'anthropic') {
        const model = opts.model || PROVIDERS.anthropic.defaultModel;
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

    throw new Error(`Provider LLM tidak didukung: ${provider}. Pakai openai atau anthropic.`);
}

function maskApiKey(key) {
    if (!key || typeof key !== 'string') return null;
    const s = key.trim();
    if (s.length < 8) return '••••';
    return s.slice(0, 3) + '…' + s.slice(-4);
}

module.exports = {
    PROVIDERS,
    listProviders,
    chatCompletion,
    maskApiKey
};
