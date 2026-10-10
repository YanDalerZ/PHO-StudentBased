import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';
import {
    approvedRegistrationOrigin, approvedRegistrationOrigins, loadInvitationPolicy,
} from '../config/publicRegistration.js';

const idSchema = z.coerce.number().int().positive().safe();
const listSchema = z.strictObject({
    school_id: z.coerce.number().int().positive().safe().optional(),
    status: z.enum(['active', 'revoked', 'expired']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const revokeSchema = z.strictObject({ reason: z.string().trim().min(1).max(500) });
const policySchema = z.strictObject({
    origin: z.url().max(200),
    rateWindowMs: z.number().int().min(1_000).max(86_400_000),
    rateLimitPerIp: z.number().int().min(1).max(10_000),
    rateLimitPerInvitation: z.number().int().min(1).max(100_000),
    maxBodyBytes: z.number().int().min(1_024).max(262_144),
    privacyNotice: z.string().trim().min(20).max(4_000),
    retentionNotice: z.string().trim().min(10).max(1_000),
    contact: z.string().trim().min(3).max(300),
    maxExpiryDays: z.number().int().min(1).max(7),
    maxSubmissionLimit: z.number().int().min(1).max(100),
});

function safeFailure(error: unknown): { name: string; code: unknown } {
    return error && typeof error === 'object'
        ? { name: String(Reflect.get(error, 'name') ?? 'Error'), code: Reflect.get(error, 'code') ?? null }
        : { name: 'Error', code: null };
}

export async function getAdminInvitationPolicy(_req: Request, res: Response): Promise<void> {
    try {
        const policy = await loadInvitationPolicy();
        if (!policy) { res.status(503).json({ error: 'Public registration policy is unavailable.' }); return; }
        res.json({ data: policy, approved_origins: approvedRegistrationOrigins() });
    } catch (error) {
        console.error('Admin invitation policy read failed', safeFailure(error));
        res.status(500).json({ error: 'Unable to read invitation policy.' });
    }
}

export async function updateAdminInvitationPolicy(req: Request, res: Response): Promise<void> {
    const parsed = policySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid invitation policy values.' }); return; }
    const origin = approvedRegistrationOrigin(parsed.data.origin);
    if (!origin) { res.status(400).json({ error: 'The public host must be a deployment-approved origin.' }); return; }
    if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT id FROM REGISTRATION_PUBLIC_POLICY WHERE id = 1 FOR UPDATE');
        if (!existing.rows[0]) throw new Error('Invitation policy row is missing.');
        await client.query(`
            UPDATE REGISTRATION_PUBLIC_POLICY SET
                origin_override = $1, rate_window_ms_override = $2,
                rate_limit_per_ip_override = $3, rate_limit_per_invitation_override = $4,
                max_body_bytes_override = $5, privacy_notice_override = $6,
                retention_notice_override = $7, contact_override = $8,
                max_expiry_days = $9, max_submission_limit = $10,
                updated_by = $11, updated_at = NOW()
            WHERE id = 1
        `, [origin, parsed.data.rateWindowMs, parsed.data.rateLimitPerIp,
            parsed.data.rateLimitPerInvitation, parsed.data.maxBodyBytes,
            parsed.data.privacyNotice, parsed.data.retentionNotice, parsed.data.contact,
            parsed.data.maxExpiryDays, parsed.data.maxSubmissionLimit, req.user.id]);
        await AuditService.logEvent({
            actor_id: req.user.id, portal_role: 'admin', action: 'UPDATE_REGISTRATION_INVITATION_POLICY',
            entity_type: 'REGISTRATION_PUBLIC_POLICY', entity_id: '1', ip_address: req.ip,
            details: { changed_fields: Object.keys(parsed.data) },
        }, client);
        await client.query('COMMIT');
        res.json({ data: { ...parsed.data, origin } });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Admin invitation policy update failed', safeFailure(error));
        res.status(500).json({ error: 'Unable to update invitation policy.' });
    } finally {
        client.release();
    }
}

export async function listAdminInvitations(req: Request, res: Response): Promise<void> {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid invitation filters.' }); return; }
    const { school_id, status, page, pageSize } = parsed.data;
    try {
        const result = await pool.query<{
            id: number; school_id: number; school_name: string; created_by: number;
            created_at: Date; expires_at: Date; status: string; submission_limit: number;
            submission_count: number; revoked_at: Date | null; revoked_by: number | null;
            total_count: number;
        }>(`
            WITH invitations AS (
                SELECT i.id, i.school_id, s.name AS school_name, i.created_by,
                       i.created_at, i.expires_at, i.submission_limit,
                       i.submission_count, i.revoked_at, i.revoked_by,
                       CASE WHEN i.status = 'active' AND i.expires_at <= NOW()
                            THEN 'expired' ELSE i.status END AS status
                FROM REGISTRATION_INVITATIONS i
                JOIN SCHOOLS s ON s.id = i.school_id
            )
            SELECT *, COUNT(*) OVER()::int AS total_count
            FROM invitations
            WHERE ($1::int IS NULL OR school_id = $1)
              AND ($2::text IS NULL OR status = $2)
            ORDER BY created_at DESC, id DESC
            LIMIT $3 OFFSET $4
        `, [school_id ?? null, status ?? null, pageSize, (page - 1) * pageSize]);
        const total = result.rows[0]?.total_count ?? (await pool.query<{ count: number }>(`
            SELECT COUNT(*)::int AS count FROM REGISTRATION_INVITATIONS i
            WHERE ($1::int IS NULL OR i.school_id = $1)
              AND ($2::text IS NULL OR
                   CASE WHEN i.status = 'active' AND i.expires_at <= NOW()
                        THEN 'expired' ELSE i.status END = $2)
        `, [school_id ?? null, status ?? null])).rows[0]?.count ?? 0;
        res.json({
            data: result.rows.map(({ total_count: _count, ...row }) => row),
            meta: { page, pageSize, total },
        });
    } catch (error) {
        console.error('Admin invitation listing failed', safeFailure(error));
        res.status(500).json({ error: 'Unable to list invitation metadata.' });
    }
}

export async function revokeAdminInvitation(req: Request, res: Response): Promise<void> {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = raw && /^\d+$/.test(raw) ? idSchema.safeParse(raw) : null;
    const parsed = revokeSchema.safeParse(req.body);
    if (!id?.success || !parsed.success) {
        res.status(400).json({ error: 'A valid invitation ID and revocation reason are required.' });
        return;
    }
    if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query<{ id: number; school_id: number; status: string; expires_at: Date }>(
            'SELECT id, school_id, status, expires_at FROM REGISTRATION_INVITATIONS WHERE id = $1 FOR UPDATE', [id.data],
        );
        const row = existing.rows[0];
        if (!row) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Invitation not found.' }); return; }
        if (row.status !== 'active' || new Date(row.expires_at) <= new Date()) {
            await client.query('ROLLBACK'); res.status(409).json({ error: 'Invitation is not active.' }); return;
        }
        const changed = await client.query<{
            id: number; school_id: number; status: string; revoked_at: Date; revoked_by: number;
        }>(`
            UPDATE REGISTRATION_INVITATIONS
            SET status = 'revoked', revoked_at = NOW(), revoked_by = $2,
                revocation_reason = $3
            WHERE id = $1
            RETURNING id, school_id, status, revoked_at, revoked_by
        `, [id.data, req.user.id, parsed.data.reason]);
        await AuditService.logEvent({
            actor_id: req.user.id, portal_role: 'admin',
            action: 'ADMIN_REVOKE_REGISTRATION_INVITATION',
            entity_type: 'REGISTRATION_INVITATION', entity_id: String(id.data),
            school_id: row.school_id, ip_address: req.ip,
            details: { prior_status: row.status, status: 'revoked' },
        }, client);
        await client.query('COMMIT');
        res.json({ data: changed.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Admin invitation revocation failed', safeFailure(error));
        res.status(500).json({ error: 'Unable to revoke invitation.' });
    } finally {
        client.release();
    }
}
