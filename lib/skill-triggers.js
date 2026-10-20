/**
 * Parser kontrak `## Trigger` pada SKILL.md (pola diadaptasi dari ide trigger
 * deklaratif, ditulis ulang untuk repo ini).
 *
 * Blok yang dicari:
 *   ## Trigger
 *   ```json
 *   { "activation": { "anyPhrases": ["..."] }, "movement": { "target": "desk", "skipIfAlreadyThere": true } }
 *   ```
 * Pencocokan: case-insensitive, frasa TERPANJANG yang cocok menang.
 */

const ROLE_NAME_TO_ID = {
    maya: 'manager', rani: 'strategist', dimas: 'copywriter', salsa: 'visual-producer',
    titin: 'community-manager', bimo: 'analyst', nadira: 'compliance'
};

function extractTriggerConfig(markdown) {
    const md = String(markdown || '');
    if (!md) return null;
    // Ambil seksi "## Trigger" secara prosedural (hindari lookahead regex multiline).
    let scope = md;
    const lines = md.split(/\r?\n/);
    const start = lines.findIndex(l => /^##\s+Trigger\s*$/.test(l));
    if (start >= 0) {
        let end = lines.length;
        for (let i = start + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i])) { end = i; break; }
        }
        scope = lines.slice(start + 1, end).join('\n');
    }
    const fence = scope.match(/```json\s*([\s\S]*?)```/i) || scope.match(/```\s*([\s\S]*?)```/);
    if (!fence) return null;
    try {
        const cfg = JSON.parse(fence[1]);
        if (!cfg || typeof cfg !== 'object') return null;
        const phrases = cfg.activation && Array.isArray(cfg.activation.anyPhrases)
            ? cfg.activation.anyPhrases.map(p => String(p).trim()).filter(Boolean)
            : [];
        const movement = cfg.movement && typeof cfg.movement === 'object' ? cfg.movement : {};
        return {
            activation: { anyPhrases: phrases },
            movement: {
                target: movement.target ? String(movement.target) : null,
                skipIfAlreadyThere: movement.skipIfAlreadyThere !== false,
                targetsByPhrase: movement.targetsByPhrase && typeof movement.targetsByPhrase === 'object'
                    ? movement.targetsByPhrase
                    : {}
            },
            skillId: cfg.skillId ? String(cfg.skillId) : null
        };
    } catch {
        return null;
    }
}

function detectRoleIdsInText(text) {
    const t = String(text || '').toLowerCase();
    const hits = [];
    for (const [name, roleId] of Object.entries(ROLE_NAME_TO_ID)) {
        // "Salsa", "Kak Salsa"
        if (new RegExp(`\\b(?:kak\\s+)?${name}\\b`, 'i').test(t) && !hits.includes(roleId)) hits.push(roleId);
    }
    return hits;
}

/**
 * @returns {{ target: string|null, roleIds: string[]|null, matchedPhrase: string, skipIfAlreadyThere: boolean, skillId: string|null } | null}
 */
function matchSkillTrigger(text, config) {
    if (!config || !config.activation) return null;
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return null;
    const phrases = [...(config.activation.anyPhrases || [])]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length); // terpanjang dulu
    for (const phrase of phrases) {
        if (t.includes(phrase.toLowerCase())) {
            const roleIds = detectRoleIdsInText(text);
            const placeRole = null; // default peran dari target diisi office-places di lapisan intent
            const byPhrase = (config.movement && config.movement.targetsByPhrase) || {};
            const mapped = byPhrase[phrase] || byPhrase[phrase.toLowerCase()] || null;
            return {
                target: mapped || (config.movement ? config.movement.target : null),
                roleIds: roleIds.length ? roleIds : placeRole,
                matchedPhrase: phrase,
                skipIfAlreadyThere: config.movement ? config.movement.skipIfAlreadyThere !== false : true,
                skillId: config.skillId || null
            };
        }
    }
    return null;
}

function loadTriggerConfigFromFile(filePath, fsModule) {
    try {
        const fs = fsModule || require('fs');
        return extractTriggerConfig(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

module.exports = { extractTriggerConfig, matchSkillTrigger, detectRoleIdsInText, loadTriggerConfigFromFile, ROLE_NAME_TO_ID };
