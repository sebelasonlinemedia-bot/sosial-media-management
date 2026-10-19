/**
 * Redaksi secret sebelum log — jangan pernah log token/password.
 */

const SENSITIVE_KEY = /^(password|passwd|pwd|access[_-]?token|refresh[_-]?token|page[_-]?token|authorization|client[_-]?secret|session[_-]?secret|cron[_-]?secret|token|api[_-]?key|sessionstate|session_state)$/i;

function redactValue(value) {
    if (value == null) return value;
    if (typeof value === 'string') {
        if (value.length > 12 && /^(ya29\.|EAAG|act\.|Bearer\s)/i.test(value)) {
            return '[REDACTED]';
        }
        if (/^enc:v1:/i.test(value)) return '[REDACTED_CIPHER]';
        return value;
    }
    if (Array.isArray(value)) return value.map(redactValue);
    if (typeof value === 'object') return redactSecrets(value);
    return value;
}

function redactSecrets(input) {
    if (input == null) return input;
    if (typeof input !== 'object') return redactValue(input);
    if (Array.isArray(input)) return input.map(redactSecrets);

    const out = {};
    for (const [key, val] of Object.entries(input)) {
        if (SENSITIVE_KEY.test(key)) {
            out[key] = val == null || val === '' ? val : '[REDACTED]';
        } else {
            out[key] = redactSecrets(val);
        }
    }
    return out;
}

/** Log aman: redaksi argumen objek. */
function safeLog(level, label, payload) {
    const fn = console[level] || console.log;
    if (payload === undefined) {
        fn(label);
        return;
    }
    try {
        fn(label, typeof payload === 'object' ? redactSecrets(payload) : redactValue(payload));
    } catch (_) {
        fn(label, '[unserializable]');
    }
}

module.exports = {
    redactSecrets,
    redactValue,
    safeLog
};
