import assert from 'node:assert/strict';
import pool from '../database/db.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    const migration = await client.query<{ version: string }>(
        "SELECT version FROM PHO_SCHEMA_MIGRATIONS WHERE version = '008'",
    );
    assert.equal(migration.rows[0]?.version, '008');
    const constraints = await client.query<{ name: string }>(`
        SELECT conname AS name
        FROM pg_constraint
        WHERE conname = ANY($1::text[])
    `, [[
        'registration_invitations_limit_positive_v5',
        'registration_invitations_count_valid_v5',
        'registration_submissions_payload_object_v5',
    ]]);
    assert.equal(constraints.rowCount, 3);
    const indexes = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_indexes
        WHERE indexname = ANY($1::text[])
    `, [[
        'idx_reg_invitations_school_created',
        'idx_reg_submissions_school_status_submitted',
    ]]);
    assert.equal(indexes.rowCount, 2);
    console.log(`Phase 2 contract schema verified on ${formatSafeDatabaseIdentity(identity)}.`);
} finally {
    client.release();
    await pool.end();
}

