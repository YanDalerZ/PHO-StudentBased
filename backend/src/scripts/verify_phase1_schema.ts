import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import pool from '../database/db.js';
import { PHASE1_MIGRATION_VERSION } from '../database/phase1Migration.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();

async function expectCheckViolation(
    connection: PoolClient,
    name: string,
    sql: string,
    values: unknown[],
): Promise<void> {
    await connection.query(`SAVEPOINT ${name}`);
    try {
        await connection.query(sql, values);
        assert.fail(`${name} should have been rejected by a CHECK constraint.`);
    } catch (error) {
        assert.equal(
            typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined,
            '23514',
            `${name} must fail with a PostgreSQL CHECK violation.`,
        );
    } finally {
        await connection.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await connection.query(`RELEASE SAVEPOINT ${name}`);
    }
}

try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    await client.query('BEGIN');

    const ledger = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1',
        [PHASE1_MIGRATION_VERSION],
    );
    assert.equal(ledger.rows[0]?.count, 1, 'Migration 006 must have one ledger row.');

    const exportColumns = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'report_exports'
        ORDER BY ordinal_position
    `);
    assert.deepEqual(exportColumns.rows.map(row => row.column_name), [
        'id', 'requested_by', 'module_id', 'format', 'filters', 'status', 'row_count',
        'storage_reference', 'error_code', 'created_at', 'started_at', 'completed_at', 'expires_at',
    ]);

    const constraints = await client.query<{ conname: string }>(`
        SELECT conname FROM pg_constraint
        WHERE conname IN (
            'registration_invitations_status_v5_check',
            'registration_submissions_status_v5_check',
            'registration_submission_events_type_v5_check'
        ) AND convalidated = TRUE
        ORDER BY conname
    `);
    assert.equal(constraints.rowCount, 3, 'All reconciled QR constraints must be validated.');

    const implicitGrants = await client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM USER_MODULE_PERMISSIONS ump
        JOIN USERS u ON u.id = ump.user_id
        JOIN MODULES m ON m.id = ump.module_id
        WHERE ump.revoked_at IS NULL
          AND ump.granted_by IS NULL
          AND (
            (u.portal_role = 'school_staff' AND ump.can_view AND ump.can_create AND ump.can_edit
             AND ump.can_report AND NOT ump.can_export
             AND ump.can_approve_registration = (m.slug = 'patient-info'))
            OR
            (u.portal_role = 'superuser' AND ump.can_view AND ump.can_create AND ump.can_edit
             AND NOT ump.can_approve_registration AND ump.can_report AND ump.can_export)
          )
    `);
    assert.equal(implicitGrants.rows[0]?.count, 0, 'Implicit migration-002 grants must not remain active.');

    const deliberateGrants = await client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM USER_MODULE_PERMISSIONS
        WHERE revoked_at IS NULL AND granted_by IS NOT NULL
    `);
    assert.ok((deliberateGrants.rows[0]?.count ?? 0) > 0, 'Actor-attributed fixture grants must remain active.');

    const audit = await client.query<{ revoked_count: number }>(`
        SELECT (details->>'revoked_count')::int AS revoked_count
        FROM AUDIT_EVENTS
        WHERE action = 'migration_revoke_implicit_grants'
          AND details->>'migration' = '006_v5_phase1_schema_reconciliation'
        ORDER BY id DESC LIMIT 1
    `);
    assert.ok((audit.rows[0]?.revoked_count ?? 0) > 0, 'Migration must audit the implicit grant cleanup.');

    const fixtures = await client.query<{ user_id: number; school_id: number; module_id: number }>(`
        SELECT u.id AS user_id, s.id AS school_id, m.id AS module_id
        FROM USERS u CROSS JOIN SCHOOLS s CROSS JOIN MODULES m
        ORDER BY u.id, s.id, m.id LIMIT 1
    `);
    const fixture = fixtures.rows[0];
    assert.ok(fixture, 'Schema verification requires seeded user, school, and module fixtures.');

    await expectCheckViolation(client, 'invalid_invitation_status', `
        INSERT INTO REGISTRATION_INVITATIONS
            (token_hash, school_id, created_by, expires_at, status)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day', 'invalid')
    `, ['a'.repeat(64), fixture.school_id, fixture.user_id]);

    const invitation = await client.query<{ id: number }>(`
        INSERT INTO REGISTRATION_INVITATIONS
            (token_hash, school_id, created_by, expires_at, status)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day', 'active')
        RETURNING id
    `, ['b'.repeat(64), fixture.school_id, fixture.user_id]);
    const invitationId = invitation.rows[0]?.id;
    assert.ok(invitationId);

    await expectCheckViolation(client, 'invalid_submission_status', `
        INSERT INTO REGISTRATION_SUBMISSIONS
            (invitation_id, school_id, payload, status)
        VALUES ($1, $2, '{}'::jsonb, 'invalid')
    `, [invitationId, fixture.school_id]);

    const submission = await client.query<{ id: number }>(`
        INSERT INTO REGISTRATION_SUBMISSIONS
            (invitation_id, school_id, payload, status)
        VALUES ($1, $2, '{}'::jsonb, 'pending')
        RETURNING id
    `, [invitationId, fixture.school_id]);
    const submissionId = submission.rows[0]?.id;
    assert.ok(submissionId);

    await expectCheckViolation(client, 'invalid_submission_event_type', `
        INSERT INTO REGISTRATION_SUBMISSION_EVENTS (submission_id, event_type)
        VALUES ($1, 'invalid')
    `, [submissionId]);
    await expectCheckViolation(client, 'invalid_export_format', `
        INSERT INTO REPORT_EXPORTS (requested_by, module_id, format, filters)
        VALUES ($1, $2, 'pdf', '{}'::jsonb)
    `, [fixture.user_id, fixture.module_id]);
    await expectCheckViolation(client, 'invalid_export_status', `
        INSERT INTO REPORT_EXPORTS (requested_by, module_id, format, filters, status)
        VALUES ($1, $2, 'csv', '{}'::jsonb, 'invalid')
    `, [fixture.user_id, fixture.module_id]);
    await expectCheckViolation(client, 'invalid_export_filters', `
        INSERT INTO REPORT_EXPORTS (requested_by, module_id, format, filters)
        VALUES ($1, $2, 'xlsx', '[]'::jsonb)
    `, [fixture.user_id, fixture.module_id]);

    await client.query('ROLLBACK');
    console.log(`Phase 1 schema verification passed on ${formatSafeDatabaseIdentity(identity)}.`);
} catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve verification error */ }
    throw error;
} finally {
    client.release();
    await pool.end();
}
