import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pool from '../database/db.js';
import { applyRetentionMigration } from '../database/retentionMigration.js';
import { runRetentionBatch } from '../services/retention.service.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const marker = `retention_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
const submissionIds: number[] = [];
const auditEventIds: number[] = [];
let userId: number | null = null;
let invitationId: number | null = null;
const client = await pool.connect();

try {
    await applyRetentionMigration(client);
    const school = await client.query<{ id: number }>('SELECT id FROM SCHOOLS ORDER BY id LIMIT 1');
    if (!school.rows[0]) throw new Error('The disposable test database needs a baseline school.');
    const user = await client.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', 'admin', 'admin', 'QA', 'Retention', 'Fixture', TRUE)
        RETURNING id
    `, [`${marker}@pho.test`]);
    userId = user.rows[0]!.id;
    const invitation = await client.query<{ id: number }>(`
        INSERT INTO REGISTRATION_INVITATIONS
            (token_hash, school_id, created_by, expires_at, status)
        VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', 'revoked') RETURNING id
    `, [randomBytes(32).toString('hex'), school.rows[0].id, userId]);
    invitationId = invitation.rows[0]!.id;

    async function submission(status: 'pending' | 'rejected', age: string): Promise<number> {
        const row = await client.query<{ id: number }>(`
            INSERT INTO REGISTRATION_SUBMISSIONS
                (invitation_id, school_id, payload, consent_metadata, status, submitted_at, reviewed_at)
            VALUES ($1, $2, '{}'::jsonb,
                    '{"guardian_consent":true,"privacy_notice_version":"test","recorded_at":"test"}'::jsonb,
                    $3::text, NOW() - $4::interval,
                    CASE WHEN $3::text = 'rejected' THEN NOW() - $4::interval ELSE NULL END)
            RETURNING id
        `, [invitationId, school.rows[0]!.id, status, age]);
        const id = row.rows[0]!.id;
        submissionIds.push(id);
        await client.query(
            "INSERT INTO REGISTRATION_SUBMISSION_EVENTS (submission_id, event_type, actor_id) VALUES ($1, 'submitted', $2)",
            [id, userId],
        );
        return id;
    }
    const oldPending = await submission('pending', '73 hours');
    const newPending = await submission('pending', '71 hours');
    const oldRejected = await submission('rejected', '31 days');
    const newRejected = await submission('rejected', '29 days');
    const heldPending = await submission('pending', '80 hours');

    async function audit(age: string): Promise<number> {
        const row = await client.query<{ id: number }>(`
            INSERT INTO AUDIT_EVENTS (actor_id, action, entity_type, entity_id, created_at)
            VALUES ($1, 'RETENTION_TEST', 'system', $2, NOW() - $3::interval) RETURNING id
        `, [userId, marker, age]);
        const id = row.rows[0]!.id;
        auditEventIds.push(id);
        return id;
    }
    const oldAudit = await audit('2 years 1 day');
    const newAudit = await audit('1 year');
    const heldAudit = await audit('2 years 2 days');
    await client.query(
        'INSERT INTO RETENTION_HOLDS (submission_id, reason, created_by) VALUES ($1, $2, $3)',
        [heldPending, 'Test hold', userId],
    );
    await client.query(
        'INSERT INTO RETENTION_HOLDS (audit_event_id, reason, created_by) VALUES ($1, $2, $3)',
        [heldAudit, 'Test hold', userId],
    );
    await assert.rejects(
        client.query('DELETE FROM RETENTION_HOLDS WHERE submission_id = $1', [heldPending]),
        /Active retention holds cannot be deleted/,
    );

    const first = await runRetentionBatch(client, 20, {
        submissionIds, auditEventIds, auditLabel: marker,
    });
    assert.deepEqual(first, { pending: 1, rejected: 1, auditEvents: 1 });
    const remaining = await client.query<{ id: number }>(
        'SELECT id FROM REGISTRATION_SUBMISSIONS WHERE id = ANY($1::int[]) ORDER BY id', [submissionIds],
    );
    assert.deepEqual(remaining.rows.map(row => row.id), [newPending, newRejected, heldPending].sort((a, b) => a - b));
    const deletedEvents = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM REGISTRATION_SUBMISSION_EVENTS WHERE submission_id = ANY($1::int[])',
        [[oldPending, oldRejected]],
    );
    assert.equal(deletedEvents.rows[0]?.count, 0);
    const auditRemaining = await client.query<{ id: number }>(
        'SELECT id FROM AUDIT_EVENTS WHERE id = ANY($1::int[]) ORDER BY id', [auditEventIds],
    );
    assert.deepEqual(auditRemaining.rows.map(row => row.id), [newAudit, heldAudit].sort((a, b) => a - b));
    assert.ok(oldAudit > 0);

    await client.query(`
        UPDATE RETENTION_HOLDS SET released_by = $1, released_at = NOW()
        WHERE created_by = $1 AND (submission_id = $2 OR audit_event_id = $3)
    `, [userId, heldPending, heldAudit]);
    const second = await runRetentionBatch(client, 20, {
        submissionIds, auditEventIds, auditLabel: marker,
    });
    assert.deepEqual(second, { pending: 1, rejected: 0, auditEvents: 1 });
    const holdAudit = await client.query<{ action: string; count: number }>(`
        SELECT action, COUNT(*)::int AS count FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND action IN ('CREATE_RETENTION_HOLD', 'RELEASE_RETENTION_HOLD')
        GROUP BY action
    `, [userId]);
    assert.deepEqual(new Map(holdAudit.rows.map(row => [row.action, row.count])),
        new Map([['CREATE_RETENTION_HOLD', 2], ['RELEASE_RETENTION_HOLD', 2]]));
    console.log('PASS: retention clocks, dependent-event deletion, active holds, release, and bounded scoped purge.');
} finally {
    try {
        if (userId !== null) {
            await client.query(`
                UPDATE RETENTION_HOLDS SET released_by = $1, released_at = NOW()
                WHERE created_by = $1 AND released_at IS NULL
            `, [userId]);
            await client.query('DELETE FROM RETENTION_HOLDS WHERE created_by = $1', [userId]);
            await client.query(
                'DELETE FROM REGISTRATION_SUBMISSION_EVENTS WHERE submission_id = ANY($1::int[])',
                [submissionIds],
            );
            await client.query('DELETE FROM REGISTRATION_SUBMISSIONS WHERE id = ANY($1::int[])', [submissionIds]);
            await client.query(
                "DELETE FROM AUDIT_EVENTS WHERE actor_id = $1 OR details->>'test_label' = $2",
                [userId, marker],
            );
        }
        if (invitationId !== null) {
            await client.query('DELETE FROM REGISTRATION_INVITATIONS WHERE id = $1', [invitationId]);
        }
        if (userId !== null) await client.query('DELETE FROM USERS WHERE id = $1', [userId]);
    } finally {
        client.release();
        await pool.end();
    }
}
