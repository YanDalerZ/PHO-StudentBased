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
        WHERE version = '011' AND name = '011_v5_phase3_reporting_foundation'
    `);
    assert.equal(migration.rows[0]?.version, '011');

    const targetColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'deworming_targets'
    `);
    assert.deepEqual(
        new Set(targetColumns.rows.map(row => row.column_name)),
        new Set([
            'id', 'school_id', 'period', 'baseline_target_count', 'baseline_source',
            'override_target_count', 'override_reason', 'created_by', 'updated_by',
            'created_at', 'updated_at',
        ]),
    );

    const referralColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vital_signs'
          AND column_name = ANY($1::text[])
    `, [[
        'referral_needed', 'referral_reason', 'referral_date', 'referral_facility',
    ]]);
    assert.equal(referralColumns.rowCount, 4);

    const constraints = await client.query<{ conname: string; validated: boolean }>(`
        SELECT conname, convalidated AS validated
        FROM pg_constraint
        WHERE conname = ANY($1::text[])
    `, [[
        'deworming_targets_period_v5_check',
        'deworming_targets_override_reason_v5_check',
        'deworming_targets_school_period_v5_unique',
        'vital_signs_referral_details_v5_check',
        'vital_signs_referral_date_v5_check',
    ]]);
    assert.equal(constraints.rowCount, 5);
    assert.equal(constraints.rows.every(row => row.validated), true);

    console.log(`Phase 3 reporting schema verified on ${formatSafeDatabaseIdentity(identity)}.`);
} finally {
    client.release();
    await pool.end();
}

