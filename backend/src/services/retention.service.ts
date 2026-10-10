import type { PoolClient } from 'pg';
import { AuditService } from './AuditService.js';

export interface RetentionCounts {
    pending: number;
    rejected: number;
    auditEvents: number;
}

/** Test fixtures can restrict a run to known IDs on a disposable database. */
export interface RetentionTestScope {
    submissionIds: number[];
    auditEventIds: number[];
    auditLabel: string;
}

export async function countEligibleRetentionRows(client: PoolClient): Promise<RetentionCounts> {
    const result = await client.query<RetentionCounts>(`
        SELECT
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSIONS s
             WHERE s.status = 'pending' AND s.submitted_at < NOW() - INTERVAL '72 hours'
               AND NOT EXISTS (SELECT 1 FROM RETENTION_HOLDS h
                               WHERE h.submission_id = s.id AND h.released_at IS NULL)) AS pending,
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSIONS s
             WHERE s.status = 'rejected' AND s.reviewed_at < NOW() - INTERVAL '30 days'
               AND NOT EXISTS (SELECT 1 FROM RETENTION_HOLDS h
                               WHERE h.submission_id = s.id AND h.released_at IS NULL)) AS rejected,
            (SELECT COUNT(*)::int FROM AUDIT_EVENTS a
             WHERE a.created_at < NOW() - INTERVAL '2 years'
               AND NOT EXISTS (SELECT 1 FROM RETENTION_HOLDS h
                               WHERE h.audit_event_id = a.id AND h.released_at IS NULL)) AS "auditEvents"
    `);
    return result.rows[0] ?? { pending: 0, rejected: 0, auditEvents: 0 };
}

/** Deletes at most `limit` rows per category in one transaction. */
export async function runRetentionBatch(
    client: PoolClient, limit = 100, testScope?: RetentionTestScope,
): Promise<RetentionCounts> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw new Error('Retention batch limit must be an integer from 1 to 500.');
    }
    if (testScope && process.env.NODE_ENV !== 'test') {
        throw new Error('A retention test scope is allowed only in the disposable test environment.');
    }
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_retention_v5'))");

        const pending = await client.query<{ id: number }>(`
            SELECT s.id FROM REGISTRATION_SUBMISSIONS s
            WHERE s.status = 'pending' AND s.submitted_at < NOW() - INTERVAL '72 hours'
              AND ($2::int[] IS NULL OR s.id = ANY($2::int[]))
              AND NOT EXISTS (SELECT 1 FROM RETENTION_HOLDS h
                              WHERE h.submission_id = s.id AND h.released_at IS NULL)
            ORDER BY s.submitted_at, s.id
            LIMIT $1 FOR UPDATE OF s SKIP LOCKED
        `, [limit, testScope?.submissionIds ?? null]);
        const rejected = await client.query<{ id: number }>(`
            SELECT s.id FROM REGISTRATION_SUBMISSIONS s
            WHERE s.status = 'rejected' AND s.reviewed_at < NOW() - INTERVAL '30 days'
              AND ($2::int[] IS NULL OR s.id = ANY($2::int[]))
              AND NOT EXISTS (SELECT 1 FROM RETENTION_HOLDS h
                              WHERE h.submission_id = s.id AND h.released_at IS NULL)
            ORDER BY s.reviewed_at, s.id
            LIMIT $1 FOR UPDATE OF s SKIP LOCKED
        `, [limit, testScope?.submissionIds ?? null]);
        const submissionIds = [...pending.rows, ...rejected.rows].map(row => row.id);
        if (submissionIds.length > 0) {
            // The existing event FK is restrictive. Delete dependent staged
            // events and their parent rows atomically; never touch STUDENTS.
            await client.query(
                'DELETE FROM REGISTRATION_SUBMISSION_EVENTS WHERE submission_id = ANY($1::int[])',
                [submissionIds],
            );
            await client.query(
                'DELETE FROM REGISTRATION_SUBMISSIONS WHERE id = ANY($1::int[])',
                [submissionIds],
            );
        }

        const audit = await client.query<{ id: number }>(`
            SELECT a.id FROM AUDIT_EVENTS a
            WHERE a.created_at < NOW() - INTERVAL '2 years'
              AND ($2::int[] IS NULL OR a.id = ANY($2::int[]))
              AND NOT EXISTS (SELECT 1 FROM RETENTION_HOLDS h
                              WHERE h.audit_event_id = a.id AND h.released_at IS NULL)
            ORDER BY a.created_at, a.id
            LIMIT $1 FOR UPDATE OF a SKIP LOCKED
        `, [limit, testScope?.auditEventIds ?? null]);
        const auditIds = audit.rows.map(row => row.id);
        if (auditIds.length > 0) {
            await client.query('DELETE FROM AUDIT_EVENTS WHERE id = ANY($1::int[])', [auditIds]);
        }

        const counts: RetentionCounts = {
            pending: pending.rows.length,
            rejected: rejected.rows.length,
            auditEvents: auditIds.length,
        };
        if (submissionIds.length > 0 || auditIds.length > 0) {
            await AuditService.logEvent({
                actor_id: null,
                action: 'RETENTION_PURGE',
                entity_type: 'system',
                details: { ...counts, ...(testScope ? { test_label: testScope.auditLabel } : {}) },
            }, client);
        }
        await client.query('COMMIT');
        return counts;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
