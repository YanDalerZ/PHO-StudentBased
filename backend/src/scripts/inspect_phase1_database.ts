import pool from '../database/db.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

interface NamedRow extends Record<string, unknown> {
    name: string;
}

interface LedgerRow extends Record<string, unknown> {
    version: string;
    name: string;
    checksum: string;
    applied_at: Date;
}

async function inspect(): Promise<void> {
    const policy = requireDisposableDatabase();
    const client = await pool.connect();
    try {
        const identity = await verifyConnectedDatabaseIdentity(client, policy);
        await client.query('BEGIN READ ONLY');

        const tables = await client.query<NamedRow>(`
            SELECT table_name AS name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        const tableNames = new Set(tables.rows.map(row => row.name.toLowerCase()));
        const hasAuthorizationTables = tableNames.has('users')
            && tableNames.has('modules')
            && tableNames.has('user_module_permissions')
            && tableNames.has('user_school_assignments');

        const migrationLedgers = await client.query<NamedRow>(`
            SELECT table_name AS name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND lower(table_name) IN (
                  'schema_migrations', 'migrations', 'migration_history',
                  'knex_migrations', 'pho_schema_migrations'
              )
            ORDER BY table_name
        `);
        const authorizationIndexes = await client.query(`
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename IN ('user_module_permissions', 'user_school_assignments')
            ORDER BY tablename, indexname
        `);
        const portalRoleValues = await client.query(`
            SELECT e.enumlabel AS value
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = 'portal_role_enum'
            ORDER BY e.enumsortorder
        `);

        const emptyRows = { rows: [] as Record<string, unknown>[] };
        const phase1Ledger = tableNames.has('pho_schema_migrations')
            ? await client.query<LedgerRow>(`
                SELECT version, name, checksum, applied_at
                FROM PHO_SCHEMA_MIGRATIONS
                ORDER BY version
            `)
            : { rows: [] as LedgerRow[] };
        const activeGrantDuplicates = hasAuthorizationTables ? await client.query(`
            SELECT user_id, module_id, COUNT(*)::int AS active_rows
            FROM user_module_permissions WHERE revoked_at IS NULL
            GROUP BY user_id, module_id HAVING COUNT(*) > 1 ORDER BY user_id, module_id
        `) : emptyRows;
        const activeAssignmentDuplicates = hasAuthorizationTables ? await client.query(`
            SELECT user_id, school_id, COUNT(*)::int AS active_rows
            FROM user_school_assignments WHERE revoked_at IS NULL
            GROUP BY user_id, school_id HAVING COUNT(*) > 1 ORDER BY user_id, school_id
        `) : emptyRows;
        const invalidApprovalGrants = hasAuthorizationTables ? await client.query(`
            SELECT u.portal_role, m.slug, COUNT(*)::int AS grant_count
            FROM user_module_permissions ump
            JOIN users u ON u.id = ump.user_id JOIN modules m ON m.id = ump.module_id
            WHERE ump.revoked_at IS NULL AND ump.can_approve_registration = TRUE
              AND (u.portal_role <> 'school_staff' OR m.slug <> 'patient-info')
            GROUP BY u.portal_role, m.slug ORDER BY u.portal_role, m.slug
        `) : emptyRows;
        const adminClinicalGrants = hasAuthorizationTables ? await client.query(`
            SELECT m.slug, COUNT(*)::int AS grant_count
            FROM user_module_permissions ump
            JOIN users u ON u.id = ump.user_id JOIN modules m ON m.id = ump.module_id
            WHERE ump.revoked_at IS NULL AND u.portal_role = 'admin'
            GROUP BY m.slug ORDER BY m.slug
        `) : emptyRows;
        const grantShapes = hasAuthorizationTables ? await client.query(`
            SELECT u.portal_role, m.slug, ump.can_view, ump.can_create, ump.can_edit,
                   ump.can_approve_registration, ump.can_report, ump.can_export,
                   COUNT(*)::int AS grant_count,
                   COUNT(*) FILTER (WHERE ump.granted_by IS NULL)::int AS missing_actor_count,
                   MIN(ump.granted_at) AS earliest_grant, MAX(ump.granted_at) AS latest_grant
            FROM user_module_permissions ump
            JOIN users u ON u.id = ump.user_id JOIN modules m ON m.id = ump.module_id
            WHERE ump.revoked_at IS NULL
            GROUP BY u.portal_role, m.slug, ump.can_view, ump.can_create, ump.can_edit,
                     ump.can_approve_registration, ump.can_report, ump.can_export
            ORDER BY u.portal_role, m.slug
        `) : emptyRows;
        const invitationConstraints = tableNames.has('registration_invitations') ? await client.query(`
            SELECT conname AS name, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conrelid = to_regclass('public.registration_invitations')
            ORDER BY conname
        `) : emptyRows;
        const submissionConstraints = tableNames.has('registration_submissions') ? await client.query(`
            SELECT conname AS name, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conrelid = to_regclass('public.registration_submissions')
            ORDER BY conname
        `) : emptyRows;

        await client.query('ROLLBACK');
        const knownMigrations = ['001_oral_health_dmft_expansion', '002_v5_authorization_foundation',
            '003_v5_qr_and_submissions', '004_v5_authorization_correction', '005_v5_grant_baseline_correction'];
        console.log(JSON.stringify({
            target: formatSafeDatabaseIdentity(identity),
            access: 'read-only transaction',
            migrationHistory: migrationLedgers.rows.length > 0
                ? {
                    status: 'partial-ledger',
                    ledgerTables: migrationLedgers.rows.map(row => row.name),
                    recordedMigrations: phase1Ledger.rows,
                    legacyStatus: 'Exact execution history for migrations 001-005 is not recorded; prerequisites are accepted from schema evidence only.',
                }
                : { status: 'unknown', reason: 'No recognized migration ledger table exists.', filesInRepository: knownMigrations },
            tables: tables.rows.map(row => row.name),
            schemaEvidence: {
                portalRoleEnumValues: portalRoleValues.rows,
                authorizationIndexes: authorizationIndexes.rows,
                reportExportMetadataTablePresent: tableNames.has('report_exports'),
            },
            findings: {
                duplicateActiveModuleGrants: activeGrantDuplicates.rows,
                duplicateActiveSchoolAssignments: activeAssignmentDuplicates.rows,
                invalidApprovalGrantGroups: invalidApprovalGrants.rows,
                activeAdminClinicalGrantGroups: adminClinicalGrants.rows,
                activeGrantShapesForProvenanceReview: grantShapes.rows,
                invitationConstraints: invitationConstraints.rows,
                submissionConstraints: submissionConstraints.rows,
            },
        }, null, 2));
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* preserve the inspection error */ }
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

await inspect();
