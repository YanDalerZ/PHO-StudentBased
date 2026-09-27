import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pool from '../database/db.js';
import { formatSafeDatabaseTarget, readSafeDatabaseIdentity } from '../utils/productionDatabase.js';

const REQUIRED_ACK = '--ack=INITIALIZE_EMPTY_AIVEN_V5';
const applicationTables = new Set([
    'countries', 'regions', 'provinces', 'municipalities', 'barangays', 'schools',
    'users', 'modules', 'students', 'patient_info', 'animal_bites', 'oral_health',
    'deworming', 'immunization', 'vital_signs', 'user_school_assignments',
    'user_module_permissions', 'audit_events', 'registration_invitations',
    'registration_submissions', 'registration_submission_events', 'report_exports',
    'pho_schema_migrations',
]);

function readDatabaseFile(...segments: string[]): string {
    return fs.readFileSync(path.join(process.cwd(), 'database', ...segments), 'utf8');
}

function checksum(sql: string): string {
    return createHash('sha256').update(sql).digest('hex');
}

function withoutTransactionWrapper(sql: string): string {
    return sql
        .replace(/^\s*BEGIN\s*;\s*/i, '')
        .replace(/\s*COMMIT\s*;\s*$/i, '');
}

if (!process.argv.includes(REQUIRED_ACK)) {
    throw new Error(`Fresh Aiven bootstrap requires the explicit argument ${REQUIRED_ACK}.`);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const hostname = new URL(databaseUrl).hostname.toLowerCase();
if (!hostname.endsWith('.aivencloud.com')) {
    throw new Error('Fresh bootstrap is restricted to the explicitly configured Aiven service.');
}

const client = await pool.connect();
try {
    const identity = await readSafeDatabaseIdentity(client);
    if (!identity.serverAddress || ['127.0.0.1', '::1', 'localhost'].includes(identity.serverAddress)) {
        throw new Error('Fresh Aiven bootstrap refuses a local PostgreSQL target.');
    }

    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '5min'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_fresh_aiven_v5_bootstrap'))");

        const existing = await client.query<{ table_name: string }>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        const conflicting = existing.rows
            .map(row => row.table_name.toLowerCase())
            .filter(table => applicationTables.has(table));
        if (existing.rows.length > 0 || conflicting.length > 0) {
            throw new Error(
                `Fresh bootstrap requires zero public tables; found ${existing.rows.length}. No SQL was applied.`,
            );
        }

        // The repository seed contains approved geography, school, and module
        // reference records. Its USERS section is intentionally empty.
        await client.query(readDatabaseFile('schema.sql'));
        await client.query(readDatabaseFile('seed.sql'));

        for (const file of [
            '001_oral_health_dmft_expansion.sql',
            '002_v5_authorization_foundation.sql',
            '003_v5_qr_and_submissions.sql',
            '004_v5_authorization_correction.sql',
            '005_v5_grant_baseline_correction.sql',
        ]) {
            const sql = readDatabaseFile('migrations', file);
            await client.query(withoutTransactionWrapper(sql));
        }

        await client.query(`
            CREATE TABLE PHO_SCHEMA_MIGRATIONS (
                version VARCHAR(20) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        for (const file of [
            '006_v5_phase1_schema_reconciliation.sql',
            '007_v5_phase1_release_reconciliation.sql',
            '008_v5_phase2_contract_reconciliation.sql',
            '009_v5_phase2_concurrency_controls.sql',
            '010_v5_phase2_public_intake_controls.sql',
        ]) {
            const sql = readDatabaseFile('migrations', file);
            const match = /^(\d{3})_(.+)\.sql$/.exec(file);
            if (!match) throw new Error(`Invalid migration filename: ${file}`);
            const version = match[1];
            const name = file.replace(/\.sql$/, '');
            await client.query(sql);
            await client.query(
                `INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum)
                 VALUES ($1, $2, $3)`,
                [version, name, checksum(sql)],
            );
        }

        const verification = await client.query<{
            required_tables: number;
            module_count: number;
            user_count: number;
            latest_migration: string | null;
        }>(`
            SELECT
                (SELECT COUNT(*)::int FROM information_schema.tables
                 WHERE table_schema = 'public'
                   AND table_name = ANY($1::text[])) AS required_tables,
                (SELECT COUNT(*)::int FROM modules) AS module_count,
                (SELECT COUNT(*)::int FROM users) AS user_count,
                (SELECT MAX(version) FROM pho_schema_migrations) AS latest_migration
        `, [Array.from(applicationTables)]);
        const result = verification.rows[0];
        if (!result
            || result.required_tables !== applicationTables.size
            || result.module_count !== 5
            || result.user_count !== 0
            || result.latest_migration !== '010') {
            throw new Error('Fresh bootstrap verification failed; the transaction will be rolled back.');
        }

        await client.query('COMMIT');
        console.log(JSON.stringify({
            status: 'initialized',
            target: formatSafeDatabaseTarget(identity),
            requiredTables: result.required_tables,
            modules: result.module_count,
            users: result.user_count,
            latestMigration: result.latest_migration,
            nextStep: 'Provision the first designated administrator through a controlled account bootstrap.',
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
} finally {
    client.release();
    await pool.end();
}
