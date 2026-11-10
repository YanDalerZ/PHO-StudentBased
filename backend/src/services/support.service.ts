import { randomBytes, randomUUID } from 'node:crypto';
import pool from '../database/db.js';
import type { ModulePermissionReplacement } from '../types/admin.types.js';
import { AuditService } from './AuditService.js';
import { AdminServiceError, adminTransaction, createUser, updateModulePermissions, updateSchoolAssignments, type CreateUserInput } from './admin.service.js';
import { attemptAccountNotification } from './supportNotification.js';

export async function submitProblem(input: {
    name: string; reply_email: string; category: string; description: string; page_or_module?: string | undefined;
}): Promise<string> {
    const reference = randomUUID();
    await pool.query(`
        INSERT INTO SUPPORT_REPORTS (id, name, reply_email, category, description, page_or_module)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [reference, input.name, input.reply_email, input.category, input.description, input.page_or_module || null]);
    return reference;
}

export async function submitAccountRequest(input: {
    name: string; work_email: string; contact_no: string; job_title: string; school_or_office: string; reason: string;
}): Promise<void> {
    await pool.query(`
        INSERT INTO SUPPORT_ACCOUNT_REQUESTS (id, name, work_email, contact_no, job_title, school_or_office, reason)
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (SELECT 1 FROM USERS WHERE lower(email) = $3)
        ON CONFLICT (work_email) WHERE status = 'pending' DO NOTHING
    `, [randomUUID(), input.name, input.work_email, input.contact_no, input.job_title, input.school_or_office, input.reason]);
}

const accountProjection = `SELECT r.id, r.name, r.work_email, r.contact_no, r.job_title, r.school_or_office,
    r.reason, r.status, r.decision_note, r.created_at, r.decided_at, r.created_user_id,
    n.status AS notification_status, n.attempt_count, n.error_code AS notification_error,
    n.attempted_at AS notification_attempted_at, n.provider_id AS notification_provider_id,
    COALESCE(n.setup_required, FALSE) AS setup_required, n.setup_expires_at, n.setup_completed_at,
    COALESCE(u.password_setup_pending, FALSE) AS setup_pending
    FROM SUPPORT_ACCOUNT_REQUESTS r LEFT JOIN SUPPORT_ACCOUNT_NOTIFICATIONS n ON n.request_id = r.id
    LEFT JOIN USERS u ON u.id = r.created_user_id`;

export async function listSupport(kind: 'reports' | 'accounts', status: string | undefined, page: number) {
    const select = kind === 'accounts' ? accountProjection
        : 'SELECT r.id, r.name, r.reply_email, r.category, r.description, r.page_or_module, r.status, r.resolution_notes, r.created_at, r.updated_at FROM SUPPORT_REPORTS r';
    const result = await pool.query(`${select} WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC, r.id LIMIT 21 OFFSET $2`, [status ?? null, (page - 1) * 20]);
    return { data: result.rows.slice(0, 20), hasMore: result.rows.length > 20 };
}

export async function getAccountRequest(id: string) {
    const result = await pool.query(`${accountProjection} WHERE r.id = $1`, [id]);
    if (!result.rows[0]) throw new AdminServiceError(404, 'Account request not found.');
    return result.rows[0];
}

export async function updateReport(id: string, status: string, notes: string | undefined, actorId: number, ip?: string) {
    await adminTransaction(async client => {
        const result = await client.query(`
            UPDATE SUPPORT_REPORTS SET status = $2, resolution_notes = $3, reviewed_by = $4, updated_at = NOW()
            WHERE id = $1
        `, [id, status, notes || null, actorId]);
        if (!result.rowCount) throw new AdminServiceError(404, 'Problem report not found.');
        await AuditService.logEvent({
            actor_id: actorId, portal_role: 'admin', action: 'SUPPORT_REPORT_UPDATED',
            entity_type: 'SUPPORT_REPORT', entity_id: id, ip_address: ip, details: { status },
        }, client);
    });
}

export async function rejectAccountRequest(id: string, note: string, actorId: number, ip?: string) {
    await adminTransaction(async client => {
        const result = await client.query(`
            UPDATE SUPPORT_ACCOUNT_REQUESTS
            SET status = 'rejected', decision_note = $2, decided_by = $3, decided_at = NOW()
            WHERE id = $1 AND status = 'pending'
        `, [id, note, actorId]);
        if (!result.rowCount) throw new AdminServiceError(409, 'The request is no longer pending.');
        await AuditService.logEvent({
            actor_id: actorId, portal_role: 'admin', action: 'SUPPORT_ACCOUNT_REQUEST_REJECTED',
            entity_type: 'SUPPORT_ACCOUNT_REQUEST', entity_id: id, ip_address: ip, details: { status: 'rejected' },
        }, client);
    });
}

export async function provisionAccountRequest(
    id: string, user: Omit<CreateUserInput, 'password'>, schoolIds: number[], permissions: ModulePermissionReplacement[],
    actorId: number, ip?: string,
) {
    const created = await adminTransaction(async client => {
        const request = await client.query<{ work_email: string }>(`
            SELECT work_email FROM SUPPORT_ACCOUNT_REQUESTS WHERE id = $1 AND status = 'pending' FOR UPDATE
        `, [id]);
        const email = request.rows[0]?.work_email;
        if (!email) throw new AdminServiceError(409, 'The request is no longer pending.');
        if (user.email.trim().toLowerCase() !== email) {
            throw new AdminServiceError(400, 'The account email must match the request.');
        }
        if (user.role === 'school_staff' && !schoolIds.length) {
            throw new AdminServiceError(400, 'Select at least one school for school staff.');
        }
        if ((await client.query('SELECT 1 FROM USERS WHERE lower(email) = $1', [email])).rowCount) {
            throw new AdminServiceError(409, 'An account already uses this email.');
        }
        const account = await createUser({ ...user, email, password: randomBytes(32).toString('base64url') }, actorId, ip, client, true);
        await updateSchoolAssignments(account.id, schoolIds, actorId, client);
        await updateModulePermissions(account.id, permissions, actorId, client);
        await client.query(`
            UPDATE SUPPORT_ACCOUNT_REQUESTS SET status = 'approved', decided_by = $2, decided_at = NOW(),
                created_user_id = $3 WHERE id = $1
        `, [id, actorId, account.id]);
        await client.query('INSERT INTO SUPPORT_ACCOUNT_NOTIFICATIONS (request_id, setup_required) VALUES ($1, TRUE)', [id]);
        await AuditService.logEvent({
            actor_id: actorId, portal_role: 'admin', action: 'SUPPORT_ACCOUNT_REQUEST_APPROVED',
            entity_type: 'SUPPORT_ACCOUNT_REQUEST', entity_id: id, ip_address: ip,
            details: { status: 'approved', user_id: account.id },
        }, client);
        return account;
    });
    // The account and notification intent are committed. Provider or bookkeeping
    // failure must not turn a successful account creation into an apparent rollback.
    try { await attemptAccountNotification(id); }
    catch { console.error('Could not record support account notification outcome.'); }
    return created;
}
