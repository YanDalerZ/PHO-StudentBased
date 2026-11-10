import pool from '../database/db.js';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AdminServiceError } from './admin.service.js';
import { setupTokenHash } from './accountSetup.js';

type SendResult = { providerId?: string; errorCode?: never } | { providerId?: never; errorCode: string };

function setupEmailConfig() {
    const serviceId = process.env.SUPPORT_EMAILJS_SERVICE_ID?.trim();
    const templateId = process.env.SUPPORT_EMAILJS_TEMPLATE_ID?.trim();
    const publicKey = process.env.SUPPORT_EMAILJS_PUBLIC_KEY?.trim();
    const privateKey = process.env.SUPPORT_EMAILJS_PRIVATE_KEY?.trim();
    const origin = process.env.SUPPORT_SETUP_ORIGIN?.trim();
    if (!serviceId || !templateId || !publicKey || !privateKey || !origin) return null;
    try {
        const url = new URL(origin);
        const localHttp = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((!localHttp && url.protocol !== 'https:') || url.origin !== origin.replace(/\/$/, '')) return null;
        return { serviceId, templateId, publicKey, privateKey, origin: url.origin };
    } catch { return null; }
}

async function sendSetupNotice(config: ReturnType<typeof setupEmailConfig>, recipient: string, token: string): Promise<SendResult> {
    if (!config) return { errorCode: 'SETUP_EMAIL_NOT_CONFIGURED' };
    try {
        // The fragment stays out of server access logs. The form sends it in the POST body.
        const link = new URL('/account-setup', config.origin);
        link.hash = new URLSearchParams({ token }).toString();
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(8_000),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: config.serviceId,
                template_id: config.templateId,
                user_id: config.publicKey,
                accessToken: config.privateKey,
                template_params: { to_email: recipient, setup_link: link.toString() },
            }),
        });
        const accepted = response.ok;
        await response.body?.cancel();
        if (accepted) return {};
        return { errorCode: response.status >= 500 ? 'DELIVERY_UNCONFIRMED' : 'PROVIDER_REJECTED' };
    } catch { return { errorCode: 'DELIVERY_UNCONFIRMED' }; }
}
async function sendAccountNotice(requestId: string, recipient: string, generation: number): Promise<SendResult> {
    const key = process.env.SUPPORT_RESEND_API_KEY?.trim();
    const from = process.env.SUPPORT_EMAIL_FROM?.trim();
    if (!key || !from) return { errorCode: 'NOT_CONFIGURED' };
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(8_000),
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `pho-account-created/${requestId}/${generation}`,
            },
            body: JSON.stringify({
                from,
                to: [recipient],
                subject: 'Your PHO portal account has been created',
                text: [
                    'A PHO administrator has created your portal account.',
                    '',
                    `Sign-in email (username): ${recipient}`,
                    'Use this email address on the PHO portal sign-in page.',
                    '',
                    'If you need your initial password, contact your PHO administrator through your usual verified channel. Never share your password by email.',
                ].join('\n'),
            }),
        });
        if (!response.ok) {
            await response.body?.cancel();
            return { errorCode: response.status >= 500 || response.status === 409 ? 'DELIVERY_UNCONFIRMED' : 'PROVIDER_REJECTED' };
        }
        const result = z.object({ id: z.uuid() }).safeParse(await response.json());
        return result.success ? { providerId: result.data.id } : { errorCode: 'DELIVERY_UNCONFIRMED' };
    } catch {
        return { errorCode: 'DELIVERY_UNCONFIRMED' };
    }
}

export async function attemptAccountNotification(requestId: string, adminRetry = false): Promise<boolean> {
    // Claim before calling the provider; a crashed worker's claim can be retried.
    const token = randomBytes(32).toString('base64url');
    const config = setupEmailConfig();
    const claim = await pool.query<{ work_email: string; attempt_count: number; send_generation: number; setup_required: boolean }>(`
        UPDATE SUPPORT_ACCOUNT_NOTIFICATIONS n
        SET status = 'sending', attempt_count = attempt_count + 1, attempted_at = NOW(), error_code = NULL,
            setup_token_hash = CASE WHEN n.setup_required AND $3 THEN $2 END,
            setup_expires_at = CASE WHEN n.setup_required AND $3 THEN NOW() + INTERVAL '24 hours' END
        FROM SUPPORT_ACCOUNT_REQUESTS r JOIN USERS u ON u.id = r.created_user_id
        WHERE n.request_id = $1 AND r.id = n.request_id AND r.status = 'approved'
          AND lower(u.email) = r.work_email
          AND ((NOT n.setup_required AND u.is_active) OR
            (n.setup_required AND u.password_setup_pending AND NOT u.is_active
              AND n.setup_completed_at IS NULL AND n.error_code IS DISTINCT FROM 'SETUP_CANCELLED'))
          AND (n.status IN ('pending', 'failed') OR
            (n.status = 'sending' AND n.attempted_at < NOW() - INTERVAL '2 minutes') OR
            (n.setup_required AND $3 AND $4 AND n.status = 'accepted' AND n.attempted_at < NOW() - INTERVAL '1 minute'))
        RETURNING r.work_email, n.attempt_count, n.send_generation, n.setup_required
    `, [requestId, setupTokenHash(token), !!config, adminRetry]);
    const attempt = claim.rows[0];
    if (!attempt) return false;
    const { providerId, errorCode } = attempt.setup_required
        ? await sendSetupNotice(config, attempt.work_email, token)
        : await sendAccountNotice(requestId, attempt.work_email, attempt.send_generation);
    await pool.query(`
        UPDATE SUPPORT_ACCOUNT_NOTIFICATIONS
        SET status = $2, error_code = $3, accepted_at = CASE WHEN $3::text IS NULL THEN NOW() END, provider_id = $5,
            setup_token_hash = CASE WHEN $3::text = 'PROVIDER_REJECTED' THEN NULL ELSE setup_token_hash END,
            setup_expires_at = CASE WHEN $3::text = 'PROVIDER_REJECTED' THEN NULL ELSE setup_expires_at END
        WHERE request_id = $1 AND status = 'sending' AND attempt_count = $4
    `, [requestId, errorCode ? 'failed' : 'accepted', errorCode ?? null, attempt.attempt_count, providerId ?? null]);
    return true;
}

export async function refreshAccountDelivery(requestId: string): Promise<void> {
    const result = await pool.query<{ provider_id: string }>(`
        SELECT provider_id FROM SUPPORT_ACCOUNT_NOTIFICATIONS
        WHERE request_id = $1 AND status IN ('accepted', 'delivered') AND provider_id IS NOT NULL
    `, [requestId]);
    const providerId = result.rows[0]?.provider_id;
    if (!providerId) throw new AdminServiceError(409, 'There is no accepted notification to check.');
    const key = process.env.SUPPORT_RESEND_STATUS_API_KEY?.trim();
    if (!key) throw new AdminServiceError(503, 'Delivery lookup is not configured. Check the provider dashboard.');
    let event: unknown;
    try {
        const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`, {
            headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error('Provider lookup failed.');
        }
        event = (await response.json() as { last_event?: unknown })?.last_event;
    } catch {
        throw new AdminServiceError(502, 'Could not check delivery with the email provider.');
    }
    const failures: Record<string, string> = { bounced: 'BOUNCED', suppressed: 'SUPPRESSED', failed: 'PROVIDER_FAILED' };
    const failure = typeof event === 'string' && Object.hasOwn(failures, event) ? failures[event] : undefined;
    if (!failure && !['delivered', 'opened', 'clicked'].includes(String(event))) return;
    await pool.query(`
        UPDATE SUPPORT_ACCOUNT_NOTIFICATIONS
        SET status = $3, error_code = $4, send_generation = send_generation + CASE WHEN $4::text IS NULL THEN 0 ELSE 1 END
        WHERE request_id = $1 AND provider_id = $2 AND status IN ('accepted', 'delivered')
    `, [requestId, providerId, failure ? 'failed' : 'delivered', failure ?? null]);
}
