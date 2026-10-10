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
import { readRetentionMigration, RETENTION_MIGRATION_NAME } from '../database/retentionMigration.js';

const migrations = [
    { version: '012', name: '012_v5_phase4b_invitation_policy' },
    { version: '013', name: '013_v5_phase4b_audit_browser_indexes' },
] as const;
const requiredIndexes = [
    ['idx_audit_events_browse', '(created_at DESC NULLS LAST, id DESC)'],
    ['idx_audit_events_actor_browse', '(actor_id, created_at DESC NULLS LAST, id DESC)'],
    ['idx_audit_events_action_browse', '(action, created_at DESC NULLS LAST, id DESC)'],
    ['idx_audit_events_entity_browse', '(entity_type, created_at DESC NULLS LAST, id DESC)'],
] as const;

function acceptedChecksums(name: string): Set<string> {
    const sql = fs.readFileSync(path.join(process.cwd(), 'database', 'migrations', `${name}.sql`), 'utf8');
    const normalized = sql.replace(/\r\n?/g, '\n');
    return new Set([normalized, sql, normalized.replace(/\n/g, '\r\n')]
        .map(value => createHash('sha256').update(value).digest('hex')));
}

const client = await pool.connect();
try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const identity = await readSafeDatabaseIdentity(client);
    const ledger = await client.query<{ version: string; name: string; checksum: string }>(`
        SELECT version, name, checksum FROM PHO_SCHEMA_MIGRATIONS
        WHERE version IN ('011', '012', '013', '014') ORDER BY version
    `);
    const byVersion = new Map(ledger.rows.map(row => [row.version, row]));
    const phase3 = byVersion.get('011');
    const phase3File = readPhase3ReportingMigration();
    if (!phase3 || phase3.name !== PHASE3_REPORTING_MIGRATION_NAME
        || !isRecognizedPhase3ReportingChecksum(phase3.checksum, phase3File.sql)) {
        throw new Error('Migration 011 is missing or differs from the reviewed Phase 3 baseline.');
    }
    for (const migration of migrations) {
        const row = byVersion.get(migration.version);
        if (!row || row.name !== migration.name || !acceptedChecksums(migration.name).has(row.checksum.trim())) {
            throw new Error(`Migration ${migration.version} is missing or differs from the reviewed file.`);
        }
    }

    const policyTable = await client.query<{ name: string | null }>(
        "SELECT to_regclass('public.registration_public_policy')::text AS name",
    );
    if (!policyTable.rows[0]?.name) throw new Error('Registration policy table is missing.');
    const policy = await client.query<{ singleton_count: number; invalid_count: number }>(`
        SELECT COUNT(*)::int AS singleton_count,
               COUNT(*) FILTER (WHERE id <> 1 OR max_expiry_days NOT BETWEEN 1 AND 7
                   OR max_submission_limit NOT BETWEEN 1 AND 100)::int AS invalid_count
        FROM REGISTRATION_PUBLIC_POLICY
    `);
    if (policy.rows[0]?.singleton_count !== 1 || policy.rows[0].invalid_count !== 0) {
        throw new Error('Registration policy singleton is missing or invalid.');
    }

    const indexes = await client.query<{ indexname: string; indexdef: string; indisvalid: boolean }>(`
        SELECT pi.indexname, pi.indexdef, i.indisvalid
        FROM pg_indexes pi
        JOIN pg_class c ON c.relname = pi.indexname AND c.relnamespace = 'public'::regnamespace
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE pi.schemaname = 'public' AND pi.tablename = 'audit_events'
          AND pi.indexname = ANY($1::text[])
    `, [requiredIndexes.map(([name]) => name)]);
    const byName = new Map(indexes.rows.map(row => [row.indexname, row]));
    for (const [name, columns] of requiredIndexes) {
        const index = byName.get(name);
        if (!index?.indisvalid || !index.indexdef.includes(columns)) {
            throw new Error(`Audit browser index ${name} is missing, invalid, or has unexpected columns.`);
        }
    }

    const retention = byVersion.get('014');
    if (retention) {
        const expected = readRetentionMigration();
        if (retention.name !== RETENTION_MIGRATION_NAME
            || retention.checksum.trim() !== expected.checksum) {
            throw new Error('Migration 014 differs from the reviewed retention migration.');
        }
        const table = await client.query<{ name: string | null }>(
            "SELECT to_regclass('public.retention_holds')::text AS name",
        );
        if (!table.rows[0]?.name) throw new Error('Migration 014 is recorded but retention holds are missing.');
        const controls = await client.query<{ index_count: number; trigger_count: number }>(`
            SELECT
                (SELECT COUNT(*)::int FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND indexname IN ('retention_active_submission_hold_unique',
                       'retention_active_audit_hold_unique', 'retention_pending_candidates',
                       'retention_rejected_candidates')) AS index_count,
                (SELECT COUNT(*)::int FROM pg_trigger
                 WHERE tgrelid = 'public.retention_holds'::regclass
                   AND tgname = 'retention_hold_guard_v5' AND NOT tgisinternal) AS trigger_count
        `);
        if (controls.rows[0]?.index_count !== 4 || controls.rows[0].trigger_count !== 1) {
            throw new Error('Migration 014 is recorded but retention indexes or hold guard are incomplete.');
        }
    }

    const dependencies = await client.query<{ parent_table: string; referencing_table: string }>(`
        SELECT parent.relname AS parent_table, child.relname AS referencing_table
        FROM pg_constraint fk
        JOIN pg_class parent ON parent.oid = fk.confrelid
        JOIN pg_class child ON child.oid = fk.conrelid
        WHERE fk.contype = 'f'
          AND fk.confrelid IN ('public.registration_submissions'::regclass,
                               'public.audit_events'::regclass)
        ORDER BY parent.relname, child.relname
    `);
    for (const dependency of dependencies.rows) {
        const allowed = dependency.parent_table === 'registration_submissions'
            ? ['registration_submission_events', 'retention_holds']
            : ['retention_holds'];
        if (!allowed.includes(dependency.referencing_table)) {
            throw new Error(`Unexpected dependent table ${dependency.referencing_table} blocks retention review.`);
        }
    }

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
        target: formatSafeDatabaseTarget(identity),
        transaction: 'READ ONLY',
        migrations: ['011', '012', '013'].map(version => ({ version, checksumVerified: true })),
        registrationPolicy: 'singleton verified',
        auditBrowserIndexes: requiredIndexes.map(([name]) => name),
        retentionMigration: retention ? 'applied-and-verified' : 'pending',
        retentionDependencies: dependencies.rows,
        privacy: 'No credentials, account identities, patient records, or clinical payloads are emitted.',
    }, null, 2));
} catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
} finally {
    client.release();
    await pool.end();
}
