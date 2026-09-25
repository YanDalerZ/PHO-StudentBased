import pool from '../database/db.js';
import { classifyPhase1StartingState } from '../database/phase1Release.js';
import { formatSafeDatabaseTarget, readSafeDatabaseIdentity } from '../utils/productionDatabase.js';

interface CountRow extends Record<string, unknown> {
    count: number;
}

const requiredColumns: Record<string, string[]> = {
    users: ['id', 'email', 'password_hash', 'portal_role', 'job_title', 'is_active', 'failed_login_attempts'],
    user_school_assignments: ['user_id', 'school_id', 'assigned_by', 'assigned_at', 'revoked_at', 'revoked_by'],
    user_module_permissions: [
        'user_id', 'module_id', 'can_view', 'can_create', 'can_edit',
        'can_approve_registration', 'can_report', 'can_export', 'granted_by', 'granted_at', 'revoked_at', 'revoked_by',
    ],
    audit_events: ['actor_id', 'portal_role', 'action', 'entity_type', 'details', 'created_at'],
    registration_invitations: ['token_hash', 'school_id', 'created_by', 'expires_at', 'status'],
    registration_submissions: ['invitation_id', 'school_id', 'payload', 'status', 'reviewed_by'],
    registration_submission_events: ['submission_id', 'event_type', 'actor_id'],
    report_exports: ['requested_by', 'module_id', 'format', 'filters', 'status', 'expires_at'],
    pho_schema_migrations: ['version', 'name', 'checksum', 'applied_at'],
};

const requiredIndexes = [
    'unique_active_user_module',
    'unique_active_user_school',
    'idx_reg_invitations_token',
    'idx_reg_submissions_school',
    'idx_report_exports_requester_created',
];

const client = await pool.connect();
try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const identity = await readSafeDatabaseIdentity(client);
    const tableResult = await client.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name
    `);
    const tables = new Set(tableResult.rows.map(row => row.table_name.toLowerCase()));

    let startingState: string;
    try {
        startingState = await classifyPhase1StartingState(client);
    } catch (error) {
        startingState = `unknown: ${error instanceof Error ? error.message : String(error)}`;
    }

    const schemaObjects: Record<string, unknown> = {};
    for (const [table, columns] of Object.entries(requiredColumns)) {
        const actual = tables.has(table)
            ? await client.query<{ column_name: string }>(`
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
            `, [table])
            : { rows: [] as { column_name: string }[] };
        const actualNames = new Set(actual.rows.map(row => row.column_name));
        schemaObjects[table] = {
            present: tables.has(table),
            missingColumns: columns.filter(column => !actualNames.has(column)),
        };
    }

    const indexes = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `);
    const indexNames = new Set(indexes.rows.map(row => row.indexname));
    const userColumnNames = tables.has('users')
        ? await client.query<{ column_name: string }>(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users'
        `)
        : { rows: [] as { column_name: string }[] };
    const usersHas = new Set(userColumnNames.rows.map(row => row.column_name));

    const empty = { rows: [] as Record<string, unknown>[] };
    const legacyRoles = usersHas.has('role') ? await client.query(`
        SELECT role::text AS role, is_active, COUNT(*)::int AS account_count
        FROM users GROUP BY role::text, is_active ORDER BY role::text, is_active DESC
    `) : empty;
    const portalRoles = usersHas.has('portal_role') ? await client.query(`
        SELECT portal_role::text AS portal_role, is_active, COUNT(*)::int AS account_count
        FROM users GROUP BY portal_role::text, is_active ORDER BY portal_role::text, is_active DESC
    `) : empty;
    const lockedAccounts = usersHas.has('failed_login_attempts') ? await client.query<CountRow>(`
        SELECT COUNT(*)::int AS count FROM users
        WHERE is_active = FALSE OR failed_login_attempts > 0
    `) : { rows: [] as CountRow[] };

    const hasAccessTables = tables.has('users') && tables.has('user_module_permissions')
        && tables.has('user_school_assignments');
    const accessReadiness = hasAccessTables ? await client.query(`
        WITH grants AS (
            SELECT user_id, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE granted_by IS NULL)::int AS missing_actor
            FROM user_module_permissions WHERE revoked_at IS NULL GROUP BY user_id
        ), schools AS (
            SELECT user_id, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE assigned_by IS NULL)::int AS missing_actor
            FROM user_school_assignments WHERE revoked_at IS NULL GROUP BY user_id
        )
        SELECT u.portal_role::text AS portal_role,
               COUNT(*)::int AS active_accounts,
               COUNT(*) FILTER (WHERE COALESCE(g.count, 0) = 0)::int AS accounts_without_grants,
               COUNT(*) FILTER (WHERE u.portal_role = 'school_staff' AND COALESCE(s.count, 0) = 0)::int
                   AS staff_without_school,
               COUNT(*) FILTER (WHERE COALESCE(g.missing_actor, 0) > 0)::int AS accounts_with_unaudited_grants,
               COUNT(*) FILTER (WHERE COALESCE(s.missing_actor, 0) > 0)::int AS accounts_with_unaudited_assignments
        FROM users u LEFT JOIN grants g ON g.user_id = u.id LEFT JOIN schools s ON s.user_id = u.id
        WHERE u.is_active = TRUE GROUP BY u.portal_role::text ORDER BY u.portal_role::text
    `) : empty;
    const adminClinicalGrants = hasAccessTables ? await client.query<CountRow>(`
        SELECT COUNT(*)::int AS count FROM user_module_permissions ump
        JOIN users u ON u.id = ump.user_id
        WHERE u.portal_role = 'admin' AND ump.revoked_at IS NULL
    `) : { rows: [] as CountRow[] };
    const invalidApprovalGrants = hasAccessTables && tables.has('modules') ? await client.query<CountRow>(`
        SELECT COUNT(*)::int AS count FROM user_module_permissions ump
        JOIN users u ON u.id = ump.user_id JOIN modules m ON m.id = ump.module_id
        WHERE ump.revoked_at IS NULL AND ump.can_approve_registration = TRUE
          AND (u.portal_role <> 'school_staff' OR m.slug <> 'patient-info')
    `) : { rows: [] as CountRow[] };
    const migrationHistory = tables.has('pho_schema_migrations') ? await client.query(`
        SELECT version, name, checksum, applied_at FROM pho_schema_migrations ORDER BY version
    `) : empty;

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
        target: formatSafeDatabaseTarget(identity),
        transaction: 'READ ONLY',
        schemaVersion: startingState,
        requiredSchema: schemaObjects,
        requiredIndexes: requiredIndexes.map(name => ({ name, present: indexNames.has(name) })),
        rolesAndAccountStatus: {
            legacyRoles: legacyRoles.rows,
            portalRoles: portalRoles.rows,
            lockedOrFailedLoginAccounts: lockedAccounts.rows[0]?.count ?? null,
        },
        accessReadiness: accessReadiness.rows,
        adminClinicalGrantCount: adminClinicalGrants.rows[0]?.count ?? null,
        invalidApprovalGrantCount: invalidApprovalGrants.rows[0]?.count ?? null,
        migrationHistory: migrationHistory.rows,
        privacy: 'No credentials, email addresses, names, patient records, or clinical payloads are emitted.',
    }, null, 2));
} catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* retain original error */ }
    throw error;
} finally {
    client.release();
    await pool.end();
}
