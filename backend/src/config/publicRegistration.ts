import { z } from 'zod';

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

export function readPublicRegistrationPolicy(): PublicRegistrationPolicy | null {
    const parsed = policySchema.safeParse(process.env);
    if (!parsed.success) return null;

    const url = new URL(parsed.data.PUBLIC_REGISTRATION_ORIGIN);
    const localDevelopment = process.env.NODE_ENV !== 'production'
        && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !localDevelopment) return null;
    if (url.username || url.password || url.search || url.hash) return null;

    return {
        origin: url.origin,
        rateWindowMs: parsed.data.PUBLIC_REGISTRATION_RATE_WINDOW_MS,
        rateLimitPerIp: parsed.data.PUBLIC_REGISTRATION_RATE_LIMIT_PER_IP,
        rateLimitPerInvitation: parsed.data.PUBLIC_REGISTRATION_RATE_LIMIT_PER_INVITATION,
        maxBodyBytes: parsed.data.PUBLIC_REGISTRATION_MAX_BODY_BYTES,
        privacyNotice: parsed.data.PUBLIC_REGISTRATION_PRIVACY_NOTICE,
        retentionNotice: parsed.data.PUBLIC_REGISTRATION_RETENTION_NOTICE,
        contact: parsed.data.PUBLIC_REGISTRATION_CONTACT,
    };
}

export function buildRegistrationUrl(policy: PublicRegistrationPolicy, token: string): string {
    return new URL(`/register/${encodeURIComponent(token)}`, policy.origin).toString();
}
