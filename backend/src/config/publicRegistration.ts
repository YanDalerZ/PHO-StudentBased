import { z } from 'zod';
import pool from '../database/db.js';

const policySchema = z.object({
    PUBLIC_REGISTRATION_ORIGIN: z.url().max(200),
    PUBLIC_REGISTRATION_RATE_WINDOW_MS: z.coerce.number().int().min(1_000).max(86_400_000),
    PUBLIC_REGISTRATION_RATE_LIMIT_PER_IP: z.coerce.number().int().min(1).max(10_000),
    PUBLIC_REGISTRATION_RATE_LIMIT_PER_INVITATION: z.coerce.number().int().min(1).max(100_000),
    PUBLIC_REGISTRATION_MAX_BODY_BYTES: z.coerce.number().int().min(1_024).max(262_144),
    PUBLIC_REGISTRATION_PRIVACY_NOTICE: z.string().trim().min(20).max(4_000),
    PUBLIC_REGISTRATION_RETENTION_NOTICE: z.string().trim().min(10).max(1_000),
    PUBLIC_REGISTRATION_CONTACT: z.string().trim().min(3).max(300),
});

export interface PublicRegistrationPolicy {
    origin: string;
    rateWindowMs: number;
    rateLimitPerIp: number;
    rateLimitPerInvitation: number;
    maxBodyBytes: number;
    privacyNotice: string;
    retentionNotice: string;
    contact: string;
}

export interface EffectiveInvitationPolicy extends PublicRegistrationPolicy {
    maxExpiryDays: number;
    maxSubmissionLimit: number;
}

interface InvitationPolicyRow {
    origin_override: string | null;
    rate_window_ms_override: number | null;
    rate_limit_per_ip_override: number | null;
    rate_limit_per_invitation_override: number | null;
    max_body_bytes_override: number | null;
    privacy_notice_override: string | null;
    retention_notice_override: string | null;
    contact_override: string | null;
    max_expiry_days: number;
    max_submission_limit: number;
}

export function approvedRegistrationOrigin(value: string): string | null {
    let candidate: URL;
    try { candidate = new URL(value); } catch { return null; }
    if (candidate.username || candidate.password || candidate.search || candidate.hash
        || candidate.pathname !== '/' || value.length > 200) return null;
    const local = process.env.NODE_ENV !== 'production'
        && ['localhost', '127.0.0.1'].includes(candidate.hostname);
    if (candidate.protocol !== 'https:' && !(local && candidate.protocol === 'http:')) return null;
    const configured = [process.env.PUBLIC_REGISTRATION_ORIGIN,
        ...(process.env.PUBLIC_REGISTRATION_ALLOWED_ORIGINS ?? '').split(',')]
        .map(item => item?.trim()).filter((item): item is string => Boolean(item));
    const allowed = configured.some(item => {
        try { return new URL(item).origin === candidate.origin; } catch { return false; }
    });
    return allowed ? candidate.origin : null;
}

export function approvedRegistrationOrigins(): string[] {
    const configured = [process.env.PUBLIC_REGISTRATION_ORIGIN,
        ...(process.env.PUBLIC_REGISTRATION_ALLOWED_ORIGINS ?? '').split(',')];
    return [...new Set(configured.map(value => value?.trim()).filter((value): value is string => Boolean(value))
        .map(value => approvedRegistrationOrigin(value)).filter((value): value is string => Boolean(value)))];
}

export function readPublicRegistrationPolicy(): PublicRegistrationPolicy | null {
    const parsed = policySchema.safeParse(process.env);
    if (!parsed.success) return null;

    const origin = approvedRegistrationOrigin(parsed.data.PUBLIC_REGISTRATION_ORIGIN);
    if (!origin) return null;

    return {
        origin,
        rateWindowMs: parsed.data.PUBLIC_REGISTRATION_RATE_WINDOW_MS,
        rateLimitPerIp: parsed.data.PUBLIC_REGISTRATION_RATE_LIMIT_PER_IP,
        rateLimitPerInvitation: parsed.data.PUBLIC_REGISTRATION_RATE_LIMIT_PER_INVITATION,
        maxBodyBytes: parsed.data.PUBLIC_REGISTRATION_MAX_BODY_BYTES,
        privacyNotice: parsed.data.PUBLIC_REGISTRATION_PRIVACY_NOTICE,
        retentionNotice: parsed.data.PUBLIC_REGISTRATION_RETENTION_NOTICE,
        contact: parsed.data.PUBLIC_REGISTRATION_CONTACT,
    };
}

/** Loads the current admin-approved overlay for every new public request. */
export async function loadInvitationPolicy(): Promise<EffectiveInvitationPolicy | null> {
    const base = readPublicRegistrationPolicy();
    if (!base) return null;
    let row: InvitationPolicyRow | undefined;
    try {
        row = (await pool.query<InvitationPolicyRow>(
            'SELECT * FROM REGISTRATION_PUBLIC_POLICY WHERE id = 1',
        )).rows[0];
    } catch (error) {
        // The deploy baseline remains usable until migration 012 is applied.
        if (!error || typeof error !== 'object' || Reflect.get(error, 'code') !== '42P01') throw error;
    }
    if (!row) return { ...base, maxExpiryDays: 7, maxSubmissionLimit: 100 };
    const origin = row.origin_override ? approvedRegistrationOrigin(row.origin_override) : base.origin;
    if (!origin) return null;
    return {
        origin,
        rateWindowMs: row.rate_window_ms_override ?? base.rateWindowMs,
        rateLimitPerIp: row.rate_limit_per_ip_override ?? base.rateLimitPerIp,
        rateLimitPerInvitation: row.rate_limit_per_invitation_override ?? base.rateLimitPerInvitation,
        maxBodyBytes: row.max_body_bytes_override ?? base.maxBodyBytes,
        privacyNotice: row.privacy_notice_override ?? base.privacyNotice,
        retentionNotice: row.retention_notice_override ?? base.retentionNotice,
        contact: row.contact_override ?? base.contact,
        maxExpiryDays: row.max_expiry_days,
        maxSubmissionLimit: row.max_submission_limit,
    };
}

export function buildRegistrationUrl(policy: PublicRegistrationPolicy, token: string): string {
    return new URL(`/register/${encodeURIComponent(token)}`, policy.origin).toString();
}
