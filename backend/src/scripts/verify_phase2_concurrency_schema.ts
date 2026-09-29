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
    const migration = await client.query<{ version: string }>(`
        SELECT version FROM PHO_SCHEMA_MIGRATIONS
        WHERE version = '009' AND name = '009_v5_phase2_concurrency_controls'
    `);
    assert.equal(migration.rows[0]?.version, '009');
    const index = await client.query<{ indexdef: string }>(`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'unique_pending_registration_lrn'
    `);
    assert.equal(index.rowCount, 1);
    assert.match(index.rows[0]!.indexdef, /UNIQUE INDEX/i);
    assert.match(index.rows[0]!.indexdef, /status.*pending/i);
    const idempotency = await client.query<{ constraint_name: string }>(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'registration_submissions'
          AND constraint_type = 'UNIQUE'
          AND constraint_name = 'registration_submissions_idempotency_key_key'
    `);
    assert.equal(idempotency.rowCount, 1);
    console.log(`Phase 2 concurrency schema verified on ${formatSafeDatabaseIdentity(identity)}.`);
} finally {
    client.release();
    await pool.end();
}
