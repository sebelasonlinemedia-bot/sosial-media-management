/**
 * Notifier Tim Konten — email log + webhook WhatsApp (HTTP POST stub).
 * Gagal notifikasi tidak boleh menggagalkan alur job.
 */

const axios = require('axios');
const { normalizeAiSettings } = require('./ai-policy');

/**
 * @param {object} settings
 * @param {{ status: string, job: object, reason?: string, actor?: string }} payload
 * @param {{ appendAuditLog?: Function }} [deps]
 */
async function notifyJobAttention(settings, payload, deps = {}) {
    const s = normalizeAiSettings(settings);
    const n = s.notifications || {};
    if (!n.enabled) {
        return { sent: false, skipped: true, reason: 'notifications_disabled' };
    }

    const email = (n.email && String(n.email).trim()) || null;
    const webhook = (n.whatsappWebhookUrl && String(n.whatsappWebhookUrl).trim())
        || (n.whatsapp && String(n.whatsapp).trim())
        || null;

    if (!email && !webhook) {
        return { sent: false, skipped: true, reason: 'no_channels' };
    }

    const job = payload.job || {};
    const status = payload.status || job.status || 'unknown';
    const body = {
        source: 'postsphere-ai',
        event: status === 'needs_info' ? 'job_needs_info' : 'job_awaiting_approval',
        status,
        jobId: job.id,
        roleId: job.roleId || null,
        employeeName: job.employeeName || null,
        brief: String(job.brief || '').slice(0, 280),
        questions: (job.questions || []).slice(0, 5),
        reason: payload.reason || '',
        at: new Date().toISOString()
    };

    const channels = [];
    const errors = [];

    if (email) {
        // Stub: belum ada SMTP — catat ke audit saja
        channels.push({ channel: 'email', to: email, status: 'logged' });
        console.log(`🔔 [NOTIFY] email→${email} event=${body.event} job=${job.id}`);
    }

    if (webhook) {
        try {
            await axios.post(webhook, {
                ...body,
                text: `[PostSphere] ${body.event}: ${job.id} — ${body.reason || body.brief}`
            }, {
                timeout: 8000,
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'PostSphere-AI-Notify/1' },
                validateStatus: () => true
            });
            channels.push({ channel: 'whatsapp_webhook', to: webhook.slice(0, 64), status: 'posted' });
            console.log(`🔔 [NOTIFY] webhook POST job=${job.id} event=${body.event}`);
        } catch (e) {
            errors.push(e.message);
            channels.push({ channel: 'whatsapp_webhook', status: 'error', error: e.message });
            console.warn(`🔔 [NOTIFY] webhook gagal (diabaikan): ${e.message}`);
        }
    }

    if (typeof deps.appendAuditLog === 'function') {
        try {
            await deps.appendAuditLog({
                actor: payload.actor || 'system',
                action: 'notify_job_attention',
                target: job.id || 'unknown',
                detail: {
                    event: body.event,
                    channels: channels.map(c => ({
                        channel: c.channel,
                        status: c.status,
                        // jangan log alamat penuh yang sensitif berlebihan
                        to: c.to ? String(c.to).replace(/(.{3}).+(@.+)/, '$1***$2') : undefined,
                        error: c.error || undefined
                    })),
                    errors: errors.length ? errors : undefined
                }
            });
        } catch (e) {
            console.warn('🔔 [NOTIFY] audit gagal (diabaikan):', e.message);
        }
    }

    return {
        sent: channels.some(c => c.status === 'logged' || c.status === 'posted'),
        skipped: false,
        channels,
        errors
    };
}

module.exports = {
    notifyJobAttention
};
