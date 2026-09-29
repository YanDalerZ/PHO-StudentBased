import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { readPublicRegistrationPolicy } from '../config/publicRegistration.js';
import { publicRegistrationPayloadSchema } from '../types/registration.types.js';

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

function unavailable(res: Response): void {
    res.status(503).json({
        error: {
            code: 'PUBLIC_REGISTRATION_POLICY_UNAVAILABLE',
            message: 'Public registration is temporarily unavailable',
        },
    });
}

export function validatePublicRegistrationInput(req: Request, res: Response, next: NextFunction): void {
    const parsed = publicRegistrationPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request parameters',
                fieldErrors: parsed.error.flatten().fieldErrors,
            },
        });
        return;
    }
    next();
}

function consume(key: string, limit: number, windowMs: number, now: number): boolean {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
}

export function publicRegistrationHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.set({
        'Cache-Control': 'no-store, max-age=0',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    });
    next();
}

export function publicRegistrationPageHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.set({
        'Cache-Control': 'no-store, max-age=0',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; base-uri 'none'; form-action 'self'",
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    });
    next();
}

export function requirePublicRegistrationPolicy(_req: Request, res: Response, next: NextFunction): void {
    const rawToken = Array.isArray(_req.params.token) ? _req.params.token[0] : _req.params.token;
    if (!rawToken || !/^[a-f0-9]{32}$/i.test(rawToken)) {
        next();
        return;
    }
    if (!readPublicRegistrationPolicy()) return unavailable(res);
    next();
}

export function protectPublicRegistrationSubmission(req: Request, res: Response, next: NextFunction): void {
    const rawToken = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    if (!rawToken || !/^[a-f0-9]{32}$/i.test(rawToken)) {
        next();
        return;
    }
    const policy = readPublicRegistrationPolicy();
    if (!policy) return unavailable(res);

    const contentLength = Number(req.header('content-length') ?? 0);
    const actualLength = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
    if ((Number.isFinite(contentLength) && contentLength > policy.maxBodyBytes)
        || actualLength > policy.maxBodyBytes) {
        res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
        return;
    }

    const invitationKey = crypto.createHash('sha256').update(rawToken ?? '').digest('hex');
    const ipKey = crypto.createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
    const now = Date.now();
    const allowedIp = consume(`ip:${ipKey}`, policy.rateLimitPerIp, policy.rateWindowMs, now);
    const allowedInvitation = consume(
        `invitation:${invitationKey}`,
        policy.rateLimitPerInvitation,
        policy.rateWindowMs,
        now,
    );
    if (!allowedIp || !allowedInvitation) {
        res.set('Retry-After', String(Math.ceil(policy.rateWindowMs / 1_000)));
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many registration attempts' } });
        return;
    }
    next();
}

export function resetPublicRegistrationRateLimitsForTests(): void {
    buckets.clear();
}
