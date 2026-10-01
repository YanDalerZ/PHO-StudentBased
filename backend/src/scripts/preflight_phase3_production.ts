import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pool from '../database/db.js';
import {
    isRecognizedPhase3ReportingChecksum,
    PHASE3_REPORTING_MIGRATION_NAME,
    readPhase3ReportingMigration,
} from '../database/phase3ReportingMigration.js';
import { formatSafeDatabaseTarget, readSafeDatabaseIdentity } from '../utils/productionDatabase.js';

interface LedgerRow {
    version: string;
    name: string;
    checksum: string;
    applied_at: Date | string;
}

function migrationChecksum(filename: string): string {
    const sql = fs.readFileSync(path.join(process.cwd(), 'database', 'migrations', filename), 'utf8');
    return createHash('sha256').update(sql.replace(/\r\n?/g, '\n')).digest('hex');
}

const client = await pool.connect();
try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const identity = await readSafeDatabaseIdentity(client);
    const ledger = await client.query<LedgerRow>(`
        SELECT version, name, checksum, applied_at
        FROM PHO_SCHEMA_MIGRATIONS
        WHERE version IN ('010', '011')
        ORDER BY version
    `);
    const byVersion = new Map(ledger.rows.map(row => [row.version, row]));
    const baseline = byVersion.get('010');
    if (!baseline || baseline.name !== '010_v5_phase2_public_intake_controls') {
        throw new Error('Production Phase 3 migration requires migration 010 in the checksum ledger.');
    }
    const expectedBaselineChecksum = migrationChecksum('010_v5_phase2_public_intake_controls.sql');
    if (baseline.checksum.trim() !== expectedBaselineChecksum) {
        throw new Error('Migration 010 checksum does not match the reviewed repository migration.');
    }

    const phase3 = byVersion.get('011');
    const expectedPhase3 = readPhase3ReportingMigration();
    if (phase3 && (
        phase3.name !== PHASE3_REPORTING_MIGRATION_NAME
        || !isRecognizedPhase3ReportingChecksum(phase3.checksum, expectedPhase3.sql)
    )) {
        throw new Error('Migration 011 ledger entry does not match the reviewed repository migration.');
    }

    const schema = await client.query<{
        deworming_targets: string | null;
        referral_column_count: number;
        constraint_count: number;
    }>(`
        SELECT
            to_regclass('public.deworming_targets')::text AS deworming_targets,
            (
                SELECT COUNT(*)::int FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'vital_signs'
                  AND column_name IN ('referral_needed', 'referral_reason', 'referral_date', 'referral_facility')
            ) AS referral_column_count,
            (
                SELECT COUNT(*)::int FROM pg_constraint
                WHERE conname IN ('vital_signs_referral_details_v5_check', 'vital_signs_referral_date_v5_check')
                  AND conrelid = 'vital_signs'::regclass
            ) AS constraint_count
    `);
    const objects = schema.rows[0];
    const complete = Boolean(objects?.deworming_targets)
        && objects?.referral_column_count === 4
        && objects.constraint_count === 2;
    if (phase3 && !complete) {
        throw new Error('Migration 011 is recorded but its required schema objects are incomplete.');
    }

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
        target: formatSafeDatabaseTarget(identity),
        transaction: 'READ ONLY',
        baselineMigration: {
            version: baseline.version,
            name: baseline.name,
            checksumVerified: true,
        },
        phase3Migration: {
            version: '011',
            name: PHASE3_REPORTING_MIGRATION_NAME,
            status: phase3 ? 'applied-and-verified' : complete ? 'schema-present-ledger-missing' : 'pending',
            checksum: expectedPhase3.checksum,
        },
        schema: objects,
        privacy: 'No credentials, account identities, patient records, or clinical payloads are emitted.',
    }, null, 2));
} catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve the original error */ }
    throw error;
} finally {
    client.release();
    await pool.end();
}
