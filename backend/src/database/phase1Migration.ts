import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const PHASE1_MIGRATION_VERSION = '006';
export const PHASE1_MIGRATION_NAME = '006_v5_phase1_schema_reconciliation';

interface MigrationRow {
    checksum: string;
}

interface PrerequisiteRow {
    users: string | null;
    modules: string | null;
    permissions: string | null;
    assignments: string | null;
    audit_events: string | null;
    invitations: string | null;
    submissions: string | null;
    submission_events: string | null;
    unique_module_grant_index: string | null;
    unique_school_assignment_index: string | null;
}

export interface MigrationResult {
    applied: boolean;
    checksum: string;
}

function migrationPath(): string {
    return path.join(process.cwd(), 'database', 'migrations', `${PHASE1_MIGRATION_NAME}.sql`);
}

function loadMigration(): { sql: string; checksum: string } {
    const sql = fs.readFileSync(migrationPath(), 'utf8');
    return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

async function assertPrerequisites(client: PoolClient): Promise<void> {
    const result = await client.query<PrerequisiteRow>(`
        SELECT to_regclass('public.users')::text AS users,
               to_regclass('public.modules')::text AS modules,
               to_regclass('public.user_module_permissions')::text AS permissions,
               to_regclass('public.user_school_assignments')::text AS assignments,
               to_regclass('public.audit_events')::text AS audit_events,
               to_regclass('public.registration_invitations')::text AS invitations,
               to_regclass('public.registration_submissions')::text AS submissions,
               to_regclass('public.registration_submission_events')::text AS submission_events,
               to_regclass('public.unique_active_user_module')::text AS unique_module_grant_index,
               to_regclass('public.unique_active_user_school')::text AS unique_school_assignment_index
    `);
    const row = result.rows[0];
    if (!row || Object.values(row).some(value => value === null)) {
        throw new Error(
            'Migration 006 prerequisites do not match the expected post-005 schema; migration history is unknown or conflicting.',
        );
    }

    const enumResult = await client.query<{ values: string[] }>(`
        SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS values
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'portal_role_enum'
    `);
    const expected = ['school_staff', 'superuser', 'admin'];
    const actual = enumResult.rows[0]?.values;
    if (!actual || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
        throw new Error('portal_role_enum does not match the approved Phase 1 role contract.');
    }
}

export async function applyPhase1ReconciliationMigration(client: PoolClient): Promise<MigrationResult> {
    const { sql, checksum } = loadMigration();
    await client.query('BEGIN');
    try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        await assertPrerequisites(client);
        await client.query(`
            CREATE TABLE IF NOT EXISTS PHO_SCHEMA_MIGRATIONS (
                version VARCHAR(20) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const recorded = await client.query<MigrationRow>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1',
            [PHASE1_MIGRATION_VERSION],
        );
        const existing = recorded.rows[0];
        if (existing) {
            if (existing.checksum.trim() !== checksum) {
                throw new Error(`Migration ${PHASE1_MIGRATION_VERSION} checksum differs from the applied migration.`);
            }
            await client.query('COMMIT');
            return { applied: false, checksum };
        }

        await client.query(sql);
        await client.query(
            `INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum)
             VALUES ($1, $2, $3)`,
            [PHASE1_MIGRATION_VERSION, PHASE1_MIGRATION_NAME, checksum],
        );
        await client.query('COMMIT');
        return { applied: true, checksum };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
