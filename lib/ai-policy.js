/**
 * Kebijakan Tim Konten: otonomi, high-risk, daily cap, duplikat caption, brand memory.
 */

const AUTONOMY_LEVELS = ['suggest_only', 'require_approval', 'limited_autonomous'];

const ALL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'];

const DEFAULT_AI_SETTINGS = {
    autonomyLevel: 'limited_autonomous',
    emergencyPause: false,
    dailyPostCap: 10,
    accountOverrides: {},
    notifications: { email: null, whatsappWebhookUrl: null, enabled: false },
    /** roleId → allowedPlatforms[]; role tanpa key = tidak dibatasi */
    rolePermissions: {},
    /** roleId → skillId[]; role tanpa key = tidak dibatasi (pola sama seperti rolePermissions) */
    roleSkills: {},
    /** Sesi standup konten aktif/terakhir (lib/standup.js); null = belum ada */
    standupSession: null,
    insightsEnabled: true,
    /** Chat CEO → LLM (apiKeyEnc disimpan terenkripsi; jangan expose di API publik) */
    llm: {
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        apiKeyEnc: null
    },
    /** Arahan posisi karyawan 3D dari Chat CEO (per peran di byRole) */
    crewPresence: {
        byRole: {},
        lastAction: null,
        updatedAt: null
    },
    /** Jadwal perintah posisi: [{ id, at, mode, roleIds, note }] */
    crewPresenceSchedules: []
};

/** Skill Cursor yang dikenal + peran pemilik baku (untuk allowlist roleSkills). */
const KNOWN_SKILLS = [
    { id: 'piks-digital-lab-ai-employee', label: 'PiK\'s Digital Lab — Tim Konten', ownerRoleId: 'manager' },
    { id: 'caption-hook', label: 'Caption & Hook (Dimas)', ownerRoleId: 'copywriter' },
    { id: 'compliance-check', label: 'Compliance Check (Nadira)', ownerRoleId: 'compliance' },
    { id: 'analytics-next-brief', label: 'Analytics → Brief Berikutnya (Bimo → Rani)', ownerRoleId: 'analyst' }
];
const KNOWN_SKILL_IDS = KNOWN_SKILLS.map(s => s.id);

const DEFAULT_BRAND_MEMORY = {
    tone: '',
    emojiOk: true,
    bannedWords: [],
    audience: '',
    pillars: [],
    bestExamples: [],
    promoCalendar: [],
    topicBans: [],
    competitors: []
};

const BRIEF_TEMPLATES = [
    {
        id: 'product-launch',
        label: 'Peluncuran produk',
        brief: {
            goal: 'Peluncuran produk/fitur baru',
            platforms: ['instagram', 'facebook'],
            date: '',
            tone: 'antusias, jelas, benefit-first',
            cta: 'Coba sekarang / daftar gratis',
            assets: '',
            notes: 'Sebutkan nama produk, 1–3 benefit utama, dan tanggal rilis.'
        },
        text: 'Peluncuran produk: [NAMA]. Benefit: [1], [2], [3]. CTA: coba gratis. Platform Instagram & Facebook. Tone antusias.'
    },
    {
        id: 'monthly-promo',
        label: 'Promo bulanan',
        brief: {
            goal: 'Promo / diskon bulanan',
            platforms: ['instagram', 'facebook', 'tiktok'],
            date: '',
            tone: 'urgent tapi tidak spammy',
            cta: 'Klaim promo / belanja sekarang',
            assets: '',
            notes: 'Sebutkan persen diskon, kode, dan batas waktu. High-risk → butuh approval.'
        },
        text: 'Promo bulanan: diskon [%] untuk [produk]. Kode [KODE], berlaku sampai [TANGGAL]. CTA klaim sekarang. Platform IG/FB/TikTok.'
    },
    {
        id: 'education',
        label: 'Edukasi',
        brief: {
            goal: 'Konten edukasi / tips',
            platforms: ['instagram', 'youtube'],
            date: '',
            tone: 'ramah, membantu, mudah dicerna',
            cta: 'Simpan postingan / ikuti untuk tips lain',
            assets: '',
            notes: 'Satu tip utama + 2–3 langkah praktis.'
        },
        text: 'Edukasi: tips [TOPIK] untuk [AUDIENCE]. 3 langkah praktis. CTA simpan & share. Tone ramah. Platform Instagram.'
    }
];

const HIGH_RISK_PATTERNS = [
    /\b(promo|diskon|sale|gratis|free|giveaway|undian|cashback|voucher|kode\s*promo)\b/i,
    /\b(klaim|menyembuhkan|jaminan|100\s*%|paling\s*ampuh|terbaik\s*di\s*dunia|tanpa\s*efek\s*samping)\b/i,
    /\b(keluhan|komplain|refund|pengembalian|scam|penipuan|rugi|marah)\b/i,
    /\b(politik|agama|SARA|seks|narkoba|judi|minuman\s*keras)\b/i,
    /\b(harga|rp\.?\s*\d|\$\d|bayar|cicilan)\b/i
];

function emptyBrandMemory() {
    return JSON.parse(JSON.stringify(DEFAULT_BRAND_MEMORY));
}

function normalizeBrandMemory(raw) {
    const base = emptyBrandMemory();
    if (!raw || typeof raw !== 'object') return base;
    return {
        tone: String(raw.tone || ''),
        emojiOk: raw.emojiOk !== false,
        bannedWords: Array.isArray(raw.bannedWords) ? raw.bannedWords.map(String) : [],
        audience: String(raw.audience || ''),
        pillars: Array.isArray(raw.pillars) ? raw.pillars.map(String) : [],
        bestExamples: Array.isArray(raw.bestExamples) ? raw.bestExamples.map(String) : [],
        promoCalendar: Array.isArray(raw.promoCalendar) ? raw.promoCalendar : [],
        topicBans: Array.isArray(raw.topicBans) ? raw.topicBans.map(String) : [],
        competitors: Array.isArray(raw.competitors) ? raw.competitors.map(String) : []
    };
}

function summarizeBrandMemory(bm) {
    const m = normalizeBrandMemory(bm);
    const parts = [];
    if (m.tone) parts.push(`tone: ${m.tone}`);
    parts.push(`emoji: ${m.emojiOk ? 'ok' : 'hindari'}`);
    if (m.audience) parts.push(`audience: ${m.audience}`);
    if (m.pillars.length) parts.push(`pillars: ${m.pillars.slice(0, 5).join(', ')}`);
    if (m.bannedWords.length) parts.push(`banned: ${m.bannedWords.slice(0, 8).join(', ')}`);
    if (m.topicBans.length) parts.push(`topicBans: ${m.topicBans.slice(0, 5).join(', ')}`);
    if (m.competitors.length) parts.push(`competitors: ${m.competitors.slice(0, 5).join(', ')}`);
    if (m.bestExamples.length) parts.push(`examples: ${m.bestExamples.length} tersimpan`);
    if (m.promoCalendar.length) parts.push(`promoCalendar: ${m.promoCalendar.length} item`);
    return parts.join(' · ') || '(brand memory kosong)';
}

function normalizeAiSettings(raw) {
    const s = { ...DEFAULT_AI_SETTINGS, ...(raw || {}) };
    if (!AUTONOMY_LEVELS.includes(s.autonomyLevel)) {
        s.autonomyLevel = DEFAULT_AI_SETTINGS.autonomyLevel;
    }
    s.emergencyPause = !!s.emergencyPause;
    s.dailyPostCap = Math.max(0, parseInt(s.dailyPostCap, 10) || DEFAULT_AI_SETTINGS.dailyPostCap);
    s.accountOverrides = s.accountOverrides && typeof s.accountOverrides === 'object'
        ? s.accountOverrides
        : {};
    const nIn = s.notifications || {};
    s.notifications = {
        enabled: !!nIn.enabled,
        email: nIn.email ? String(nIn.email).trim() : null,
        whatsappWebhookUrl: (nIn.whatsappWebhookUrl || nIn.whatsapp)
            ? String(nIn.whatsappWebhookUrl || nIn.whatsapp).trim()
            : null
    };
    s.rolePermissions = normalizeRolePermissions(s.rolePermissions);
    s.roleSkills = normalizeRoleSkills(s.roleSkills);
    // Sesi standup disimpan apa adanya (bentuk divalidasi lib/standup.js).
    s.standupSession = s.standupSession && typeof s.standupSession === 'object' ? s.standupSession : null;
    s.insightsEnabled = s.insightsEnabled !== false;
    const llmIn = s.llm && typeof s.llm === 'object' ? s.llm : {};
    let provider = String(llmIn.provider || 'gemini').toLowerCase();
    const allowedLlm = ['openai', 'anthropic', 'gemini', 'groq', 'cursor'];
    if (!allowedLlm.includes(provider)) provider = 'gemini';
    const defaultModels = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-sonnet-4-20250514',
        gemini: 'gemini-2.5-flash-lite',
        groq: 'llama-3.3-70b-versatile',
        cursor: 'composer-2.5'
    };
    let model = llmIn.model ? String(llmIn.model).trim() : defaultModels[provider];
    // Model Gemini yang sudah shutdown (404) → remap
    const geminiDead = {
        'gemini-2.0-flash': 'gemini-2.5-flash',
        'gemini-2.0-flash-001': 'gemini-2.5-flash',
        'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
        'gemini-1.5-flash': 'gemini-2.5-flash',
        'gemini-1.5-pro': 'gemini-2.5-flash'
    };
    if (provider === 'gemini' && geminiDead[model]) model = geminiDead[model];
    s.llm = {
        provider,
        model: model || defaultModels[provider],
        apiKeyEnc: llmIn.apiKeyEnc ? String(llmIn.apiKeyEnc) : null
    };
    const { normalizeCrewPresence, normalizeSchedules } = require('./crew-presence');
    s.crewPresence = normalizeCrewPresence(s.crewPresence);
    s.crewPresenceSchedules = normalizeSchedules(s.crewPresenceSchedules);
    return s;
}

/** Settings aman untuk dikirim ke client (tanpa raw API key). */
function publicAiSettings(settings) {
    const s = normalizeAiSettings(settings);
    const { maskApiKey } = require('./llm');
    const { resolveLlmApiKey, llmKeyStatus } = require('./llm-keys');
    const resolved = resolveLlmApiKey(s);
    const status = llmKeyStatus(s);
    const configured = status.configured;
    return {
        ...s,
        llm: {
            provider: s.llm.provider,
            model: s.llm.model,
            configured,
            apiKeyMasked: configured ? maskApiKey(resolved.apiKey) : null,
            keySource: resolved.source || null,
            decryptFailed: !!status.decryptFailed,
            encryptionEnabled: status.encryptionEnabled,
            hint: status.hint
        }
    };
}

function normalizeRoleSkills(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [roleId, skills] of Object.entries(raw)) {
        if (!roleId || !Array.isArray(skills)) continue;
        out[roleId] = [...new Set(
            skills.map(s => String(s).trim()).filter(s => KNOWN_SKILL_IDS.includes(s))
        )];
    }
    return out;
}

/** null = tidak dibatasi; array = hanya skill tersebut. */
function getAllowedSkillsForRole(settings, roleId) {
    const s = normalizeAiSettings(settings);
    if (!roleId || !Object.prototype.hasOwnProperty.call(s.roleSkills, roleId)) return null;
    return s.roleSkills[roleId];
}

/**
 * Enforce allowlist skill per peran (pola enforceRolePlatforms).
 * @returns {{ ok: boolean, allowed: string[]|null, message: string|null }}
 */
function enforceRoleSkill(settings, roleId, skillId) {
    const skill = String(skillId || '').trim();
    if (!skill) return { ok: true, allowed: null, message: null };
    if (!KNOWN_SKILL_IDS.includes(skill)) {
        return { ok: false, allowed: null, message: `Skill tidak dikenal: ${skill}. Skill dikenal: ${KNOWN_SKILL_IDS.join(', ')}.` };
    }
    const allowed = getAllowedSkillsForRole(settings, roleId);
    if (allowed == null) return { ok: true, allowed: null, message: null };
    if (!allowed.includes(skill)) {
        return {
            ok: false,
            allowed,
            message: `Peran ${roleId || '-'} tidak diizinkan memakai skill ${skill}. Izin: ${allowed.length ? allowed.join(', ') : '(tidak ada)'}.`
        };
    }
    return { ok: true, allowed, message: null };
}

function normalizeRolePermissions(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [roleId, plats] of Object.entries(raw)) {
        if (!roleId || !Array.isArray(plats)) continue;
        out[roleId] = [...new Set(
            plats.map(p => String(p).toLowerCase()).filter(p => ALL_PLATFORMS.includes(p))
        )];
    }
    return out;
}

/**
 * null = tidak dibatasi; array = hanya platform tersebut.
 */
function getAllowedPlatformsForRole(settings, roleId) {
    const s = normalizeAiSettings(settings);
    if (!roleId || !Object.prototype.hasOwnProperty.call(s.rolePermissions, roleId)) {
        return null;
    }
    return s.rolePermissions[roleId];
}

/**
 * Enforce izin peran vs target platforms.
 * @returns {{ ok: boolean, platforms: string[], denied: string[], allowed: string[]|null, message: string|null }}
 */
function enforceRolePlatforms(settings, roleId, platforms = []) {
    const targets = [...new Set((platforms || []).map(p => String(p).toLowerCase()))];
    const allowed = getAllowedPlatformsForRole(settings, roleId);
    if (allowed == null) {
        return { ok: true, platforms: targets, denied: [], allowed: null, message: null };
    }
    const denied = targets.filter(p => !allowed.includes(p));
    const filtered = targets.filter(p => allowed.includes(p));
    if (denied.length) {
        return {
            ok: false,
            platforms: filtered,
            denied,
            allowed,
            message: `Peran ${roleId} tidak diizinkan memposting ke: ${denied.join(', ')}. Izin: ${allowed.length ? allowed.join(', ') : '(tidak ada)'}.`
        };
    }
    return { ok: true, platforms: filtered, denied: [], allowed, message: null };
}

function resolveAutonomy(settings, platform) {
    const s = normalizeAiSettings(settings);
    const override = platform && s.accountOverrides[platform]
        ? s.accountOverrides[platform]
        : null;
    const level = (override && AUTONOMY_LEVELS.includes(override.autonomyLevel))
        ? override.autonomyLevel
        : s.autonomyLevel;
    const dailyPostCap = override && override.dailyPostCap != null
        ? Math.max(0, parseInt(override.dailyPostCap, 10) || 0)
        : s.dailyPostCap;
    return { autonomyLevel: level, dailyPostCap, emergencyPause: s.emergencyPause };
}

function isHighRiskContent(text, brandMemory) {
    const t = String(text || '');
    if (!t.trim()) return { highRisk: false, reasons: [] };
    const reasons = [];
    for (const re of HIGH_RISK_PATTERNS) {
        if (re.test(t)) {
            reasons.push(`pola high-risk: ${re.source.slice(0, 40)}`);
            break;
        }
    }
    const bm = normalizeBrandMemory(brandMemory);
    const lower = t.toLowerCase();
    for (const w of bm.bannedWords) {
        if (w && lower.includes(String(w).toLowerCase())) {
            reasons.push(`banned word: ${w}`);
        }
    }
    for (const topic of bm.topicBans) {
        if (topic && lower.includes(String(topic).toLowerCase())) {
            reasons.push(`topic ban: ${topic}`);
        }
    }
    return { highRisk: reasons.length > 0, reasons };
}

function normalizeCaption(caption) {
    return String(caption || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '')
        .replace(/#[\w]+/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function simpleHash(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return 'h' + (h >>> 0).toString(16);
}

function captionFingerprint(caption) {
    const norm = normalizeCaption(caption);
    return { normalized: norm, hash: simpleHash(norm) };
}

function findDuplicateCaption(caption, posts = []) {
    const { normalized, hash } = captionFingerprint(caption);
    if (!normalized || normalized.length < 12) return null;
    for (const p of posts) {
        const prev = captionFingerprint(p.caption || '');
        if (prev.hash === hash || (prev.normalized && prev.normalized === normalized)) {
            return { postId: p.id, createdAt: p.createdAt, hash };
        }
    }
    return null;
}

function countPostsToday(posts, platform) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (posts || []).filter(p => {
        if (!['posted', 'scheduled'].includes(p.status) && p.status !== 'posted') {
            /* count successful publishes */
        }
        const when = new Date(p.publishDate || p.createdAt || 0);
        if (when < start) return false;
        if (p.status === 'failed') return false;
        if (platform && Array.isArray(p.platforms) && !p.platforms.includes(platform)) return false;
        return true;
    }).length;
}

/**
 * Putuskan apakah agen boleh auto-publish.
 * @returns {{ allowPublish: boolean, statusIfBlocked: string|null, policy: string, reasons: string[], duplicateWarning: object|null }}
 */
function evaluatePublishGate({
    settings,
    platforms = [],
    caption = '',
    brief = '',
    brandMemories = {},
    recentPosts = [],
    forcePublish = false
} = {}) {
    const s = normalizeAiSettings(settings);
    const reasons = [];
    const text = `${brief}\n${caption}`;

    if (s.emergencyPause) {
        return {
            allowPublish: false,
            statusIfBlocked: 'awaiting_approval',
            policy: 'emergency_pause',
            reasons: ['Jeda darurat aktif — semua publish agen dihentikan.'],
            duplicateWarning: null
        };
    }

    const primaryPlatform = platforms[0] || null;
    const { autonomyLevel, dailyPostCap } = resolveAutonomy(s, primaryPlatform);

    let combinedHighRisk = false;
    const riskReasons = [];
    for (const plat of (platforms.length ? platforms : [null])) {
        const bm = brandMemories[plat] || brandMemories._default || {};
        const risk = isHighRiskContent(text, bm);
        if (risk.highRisk) {
            combinedHighRisk = true;
            riskReasons.push(...risk.reasons);
        }
    }

    const dup = findDuplicateCaption(caption || brief, recentPosts);
    const duplicateWarning = dup
        ? { message: 'Caption mirip postingan sebelumnya (peringatan saja).', ...dup }
        : null;

    const todayCount = countPostsToday(recentPosts, null);
    if (dailyPostCap > 0 && todayCount >= dailyPostCap) {
        reasons.push(`Daily post cap tercapai (${todayCount}/${dailyPostCap}).`);
        return {
            allowPublish: false,
            statusIfBlocked: 'awaiting_approval',
            policy: autonomyLevel,
            reasons,
            duplicateWarning
        };
    }

    if (combinedHighRisk && !forcePublish) {
        reasons.push('Konten high-risk (promo/klaim/sensitif/keluhan) — selalu butuh approval.');
        reasons.push(...riskReasons.slice(0, 3));
        return {
            allowPublish: false,
            statusIfBlocked: 'awaiting_approval',
            policy: autonomyLevel,
            reasons,
            duplicateWarning
        };
    }

    if (autonomyLevel === 'suggest_only' && !forcePublish) {
        reasons.push('Otonomi suggest_only — AI hanya draft; manusia yang publish.');
        return {
            allowPublish: false,
            statusIfBlocked: 'awaiting_approval',
            policy: autonomyLevel,
            reasons,
            duplicateWarning
        };
    }

    if (autonomyLevel === 'require_approval' && !forcePublish) {
        reasons.push('Otonomi require_approval — menunggu Setujui.');
        return {
            allowPublish: false,
            statusIfBlocked: 'awaiting_approval',
            policy: autonomyLevel,
            reasons,
            duplicateWarning
        };
    }

    const note = forcePublish
        ? 'Publish setelah approval manusia.'
        : (combinedHighRisk
            ? 'High-risk + forcePublish.'
            : 'Low-risk + limited_autonomous — auto-publish diizinkan.');
    return {
        allowPublish: true,
        statusIfBlocked: null,
        policy: autonomyLevel,
        reasons: [note],
        duplicateWarning
    };
}

/**
 * Gate untuk publish manual (UI/API posts) — manusia yang menekan publish.
 * Hormati emergencyPause + dailyPostCap; otonomi suggest_only/require_approval
 * tidak memblokir (itu untuk agen AI). High-risk → peringatan, tetap boleh.
 */
function evaluateManualPublishGate({
    settings,
    platforms = [],
    caption = '',
    brief = '',
    brandMemories = {},
    recentPosts = []
} = {}) {
    const s = normalizeAiSettings(settings);
    const warnings = [];
    const text = `${brief}\n${caption}`;

    if (s.emergencyPause) {
        return {
            allowPublish: false,
            policy: 'emergency_pause',
            reasons: ['Jeda darurat aktif — semua publish dihentikan.'],
            warnings: [],
            duplicateWarning: null
        };
    }

    const primaryPlatform = platforms[0] || null;
    const { autonomyLevel, dailyPostCap } = resolveAutonomy(s, primaryPlatform);

    const todayCount = countPostsToday(recentPosts, null);
    if (dailyPostCap > 0 && todayCount >= dailyPostCap) {
        return {
            allowPublish: false,
            policy: autonomyLevel,
            reasons: [`Daily post cap tercapai (${todayCount}/${dailyPostCap}).`],
            warnings: [],
            duplicateWarning: null
        };
    }

    let combinedHighRisk = false;
    const riskReasons = [];
    for (const plat of (platforms.length ? platforms : [null])) {
        const bm = brandMemories[plat] || brandMemories._default || {};
        const risk = isHighRiskContent(text, bm);
        if (risk.highRisk) {
            combinedHighRisk = true;
            riskReasons.push(...risk.reasons);
        }
    }
    if (combinedHighRisk) {
        warnings.push('Konten high-risk — publish manual oleh manusia (bukan agen AI).');
        warnings.push(...riskReasons.slice(0, 3));
    }

    if (autonomyLevel === 'suggest_only' || autonomyLevel === 'require_approval') {
        warnings.push(
            `Otonomi AI ${autonomyLevel} — gate agen dilewati karena ini publish manual manusia.`
        );
    }

    const dup = findDuplicateCaption(caption || brief, recentPosts);
    const duplicateWarning = dup
        ? { message: 'Caption mirip postingan sebelumnya (peringatan saja).', ...dup }
        : null;

    return {
        allowPublish: true,
        policy: autonomyLevel,
        reasons: ['Publish manual diizinkan (emergency pause & daily cap OK).'],
        warnings,
        duplicateWarning
    };
}

/**
 * Brief terstruktur: klarifikasi hanya field kosong yang wajib.
 */
function assessStructuredBrief(briefInput) {
    let structured = null;
    let text = '';

    if (briefInput && typeof briefInput === 'object' && !Array.isArray(briefInput)) {
        structured = {
            goal: String(briefInput.goal || '').trim(),
            platforms: Array.isArray(briefInput.platforms)
                ? briefInput.platforms.map(p => String(p).toLowerCase())
                : [],
            date: String(briefInput.date || '').trim(),
            tone: String(briefInput.tone || '').trim(),
            cta: String(briefInput.cta || '').trim(),
            assets: String(briefInput.assets || '').trim(),
            notes: String(briefInput.notes || '').trim()
        };
        text = [
            structured.goal,
            structured.platforms.length ? `Platform: ${structured.platforms.join(', ')}` : '',
            structured.date ? `Tanggal: ${structured.date}` : '',
            structured.tone ? `Tone: ${structured.tone}` : '',
            structured.cta ? `CTA: ${structured.cta}` : '',
            structured.assets ? `Assets: ${structured.assets}` : '',
            structured.notes
        ].filter(Boolean).join('\n');
    } else {
        text = String(briefInput || '').trim();
    }

    const questions = [];
    const words = text.split(/\s+/).filter(Boolean);

    if (!text) {
        questions.push('goal: Apa topik, produk, atau acara yang ingin diposting?');
        questions.push('platforms: Platform mana (instagram/facebook/tiktok/youtube)?');
        return { thin: true, questions, structured, text };
    }

    if (structured) {
        if (!structured.goal) questions.push('goal: Isi tujuan/pesan inti konten.');
        if (!structured.cta && structured.goal.length < 20) {
            questions.push('cta: Apa call-to-action yang diinginkan?');
        }
        if (!structured.platforms.length) {
            questions.push('platforms: Platform mana yang dituju? (opsional — default akun terhubung)');
        }
    } else {
        if (text.length < 40 || words.length < 6) {
            questions.push('Brief terlalu pendek. Jelaskan topik/produk, sudut pesan, dan CTA.');
        }
        const hasFactCue = /\b(produk|promo|diskon|event|launch|rilis|brand|aplikasi|fitur|tips|cara|tutorial|harga|lokasi|tanggal|jam|link|hashtag|instagram|facebook|tiktok|youtube|caption)\b/i.test(text)
            || /\d/.test(text)
            || words.length >= 12;
        if (!hasFactCue) {
            questions.push('Tambahkan minimal satu fakta konkret (nama produk/event, tanggal, harga, CTA, atau audience).');
        }
        if (!/\b(instagram|facebook|tiktok|youtube|semua|all)\b/i.test(text) && words.length < 10) {
            questions.push('platforms: Platform mana yang dituju? (opsional)');
        }
    }

    return { thin: questions.length > 0, questions, structured, text };
}

function appendDecision(log, entry) {
    const list = Array.isArray(log) ? [...log] : [];
    list.push({
        at: new Date().toISOString(),
        ...entry
    });
    return list.slice(-50);
}

module.exports = {
    AUTONOMY_LEVELS,
    ALL_PLATFORMS,
    DEFAULT_AI_SETTINGS,
    DEFAULT_BRAND_MEMORY,
    BRIEF_TEMPLATES,
    emptyBrandMemory,
    normalizeBrandMemory,
    summarizeBrandMemory,
    normalizeAiSettings,
    publicAiSettings,
    normalizeRolePermissions,
    getAllowedPlatformsForRole,
    enforceRolePlatforms,
    KNOWN_SKILLS,
    KNOWN_SKILL_IDS,
    normalizeRoleSkills,
    getAllowedSkillsForRole,
    enforceRoleSkill,
    resolveAutonomy,
    isHighRiskContent,
    normalizeCaption,
    captionFingerprint,
    findDuplicateCaption,
    countPostsToday,
    evaluatePublishGate,
    evaluateManualPublishGate,
    assessStructuredBrief,
    appendDecision
};
