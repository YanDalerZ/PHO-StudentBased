import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import { adminTransaction } from './admin.service.js';
import { AuditService } from './AuditService.js';

export function setupTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export async function completeAccountSetup(token: string, password: string, ip?: string): Promise<boolean> {
    const digest = setupTokenHash(token);
    // Reject unknown and expired links before doing expensive password hashing.
    const validLink = await pool.query(`
        SELECT 1 FROM SUPPORT_ACCOUNT_NOTIFICATIONS
        WHERE setup_token_hash = $1 AND setup_expires_at > clock_timestamp()
    `, [digest]);
    if (!validLink.rowCount) return false;
    const passwordHash = await bcrypt.hash(password, 12);
    return adminTransaction(async client => {
        const match = await client.query<{ id: number; portal_role: 'school_staff' | 'superuser'; request_id: string }>(`
            SELECT u.id, u.portal_role, r.id AS request_id
            FROM USERS u JOIN SUPPORT_ACCOUNT_REQUESTS r ON r.created_user_id = u.id
            JOIN SUPPORT_ACCOUNT_NOTIFICATIONS n ON n.request_id = r.id
            WHERE n.setup_token_hash = $1 AND n.setup_expires_at > clock_timestamp()
              AND r.status = 'approved' AND lower(u.email) = r.work_email
              AND u.password_setup_pending AND NOT u.is_active
              AND u.portal_role IN ('school_staff', 'superuser')
            FOR UPDATE OF u
        `, [digest]);
        const account = match.rows[0];
        if (!account) return false;
        // Recheck after taking the user lock in case an administrator rotated the link.
        const consumed = await client.query(`
            UPDATE SUPPORT_ACCOUNT_NOTIFICATIONS
            SET setup_token_hash = NULL, setup_expires_at = NULL, setup_completed_at = clock_timestamp()
            WHERE request_id = $1 AND setup_token_hash = $2 AND setup_expires_at > clock_timestamp()
              AND setup_completed_at IS NULL
        `, [account.request_id, digest]);
        if (!consumed.rowCount) return false;
        await client.query(`
            UPDATE USERS SET password_hash = $2, is_active = TRUE, password_setup_pending = FALSE,
                failed_login_attempts = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [account.id, passwordHash]);
        await AuditService.logEvent({
            actor_id: account.id, portal_role: account.portal_role, action: 'ACCOUNT_SETUP_COMPLETED',
            entity_type: 'USER', entity_id: String(account.id), ip_address: ip,
        }, client);
        return true;
    });
}
