import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { PoolClient } from 'pg';

export const RELEASE_MIGRATION_VERSION = '007';
export const RELEASE_MIGRATION_NAME = '007_v5_phase1_release_reconciliation';

const permissionSchema = z.object({
    can_view: z.boolean().default(false),
    can_create: z.boolean().default(false),
    can_edit: z.boolean().default(false),
    can_approve_registration: z.boolean().default(false),
    can_report: z.boolean().default(false),
    can_export: z.boolean().default(false),
}).strict();

const manifestSchema = z.object({
    approved_by_admin_email: z.string().email(),
    users: z.array(z.object({
        email: z.string().email(),
        school_ids: z.array(z.number().int().positive()).default([]),
        module_permissions: z.record(z.string(), permissionSchema),
    }).strict()),
}).strict();

export type SupportedStartingState = 'phase4-clean' | 'partial-v5' | 'phase1-release';

interface LedgerRow {
    version: string;
    name: string;
    checksum: string;
}

interface MigrationResult {
    applied: boolean;
    checksum: string;
    startingState: SupportedStartingState;
}

const requiredExistingColumns: Record<string, string[]> = {
    user_school_assignments: ['id', 'user_id', 'school_id', 'assigned_by', 'assigned_at', 'revoked_at', 'revoked_by'],
    user_module_permissions: [
        'id', 'user_id', 'module_id', 'can_view', 'can_create', 'can_edit',
        'can_approve_registration', 'can_report', 'can_export', 'granted_by', 'granted_at', 'revoked_at', 'revoked_by',
    ],
    audit_events: ['id', 'action', 'entity_type', 'details', 'created_at'],
    registration_invitations: ['id', 'token_hash', 'school_id', 'created_by', 'expires_at', 'status'],
    registration_submissions: ['id', 'invitation_id', 'school_id', 'payload', 'status'],
    registration_submission_events: ['id', 'submission_id', 'event_type'],
    report_exports: ['id', 'requested_by', 'module_id', 'format', 'filters', 'status'],
};

function migrationFile(version: string, name: string): string {
    return path.join(process.cwd(), 'database', 'migrations', `${version}_${name.replace(/^\d+_/, '')}.sql`);
}

function releaseMigration(): { sql: string; checksum: string } {
    const sql = fs.readFileSync(migrationFile(RELEASE_MIGRATION_VERSION, RELEASE_MIGRATION_NAME), 'utf8');
    return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

function knownMigrationChecksums(): Map<string, { name: string; checksum: string }> {
    const known = new Map<string, { name: string; checksum: string }>();
    for (const file of fs.readdirSync(path.join(process.cwd(), 'database', 'migrations'))) {
        const match = /^(00[2-7])_(.+)\.sql$/.exec(file);
        if (!match?.[1] || !match[2]) continue;
        const sql = fs.readFileSync(path.join(process.cwd(), 'database', 'migrations', file), 'utf8');
        known.set(match[1], {
            name: file.replace(/\.sql$/, ''),
            checksum: createHash('sha256').update(sql).digest('hex'),
        });
    }
    return known;
}

async function tableNames(client: PoolClient): Promise<Set<string>> {
    const result = await client.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
    `);
    return new Set(result.rows.map(row => row.table_name.toLowerCase()));
}

async function assertExistingTableShapes(client: PoolClient, tables: Set<string>): Promise<void> {
    for (const [table, required] of Object.entries(requiredExistingColumns)) {
        if (!tables.has(table)) continue;
        const columns = await client.query<{ column_name: string }>(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
        `, [table]);
        const actual = new Set(columns.rows.map(row => row.column_name));
        const missing = required.filter(column => !actual.has(column));
        if (missing.length > 0) {
            throw new Error(`Unknown schema: ${table} is missing required columns: ${missing.join(', ')}.`);
        }
    }
}

async function assertNoActiveDuplicates(client: PoolClient, tables: Set<string>): Promise<void> {
    if (tables.has('user_module_permissions')) {
        const duplicates = await client.query(`
            SELECT 1 FROM user_module_permissions WHERE revoked_at IS NULL
            GROUP BY user_id, module_id HAVING COUNT(*) > 1 LIMIT 1
        `);
        if ((duplicates.rowCount ?? 0) > 0) {
            throw new Error('Unknown schema: duplicate active module grants require owner review before migration.');
        }
    }
    if (tables.has('user_school_assignments')) {
        const duplicates = await client.query(`
            SELECT 1 FROM user_school_assignments WHERE revoked_at IS NULL
            GROUP BY user_id, school_id HAVING COUNT(*) > 1 LIMIT 1
        `);
        if ((duplicates.rowCount ?? 0) > 0) {
            throw new Error('Unknown schema: duplicate active school assignments require owner review before migration.');
        }
    }
}

export async function classifyPhase1StartingState(client: PoolClient): Promise<SupportedStartingState> {
    const tables = await tableNames(client);
    for (const required of ['users', 'schools', 'modules', 'students']) {
        if (!tables.has(required)) throw new Error(`Unknown schema: required Phase 4 table ${required} is absent.`);
    }
    await assertExistingTableShapes(client, tables);
    await assertNoActiveDuplicates(client, tables);

    const userColumns = await client.query<{ column_name: string; udt_name: string }>(`
        SELECT column_name, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name IN ('role', 'portal_role', 'job_title')
    `);
    const columns = new Map(userColumns.rows.map(row => [row.column_name, row.udt_name]));
    const hasPortalRole = columns.has('portal_role');
    if (!hasPortalRole) {
        if (!columns.has('role')) throw new Error('Unknown schema: users has neither role nor portal_role.');
        const unexpectedV5Tables = [...tables].filter(table => Object.hasOwn(requiredExistingColumns, table));
        if (unexpectedV5Tables.length > 0) {
            throw new Error(`Unknown schema: v5 tables exist before users.portal_role: ${unexpectedV5Tables.join(', ')}.`);
        }
        return 'phase4-clean';
    }
    if (columns.get('portal_role') !== 'portal_role_enum') {
        throw new Error('Unknown schema: users.portal_role is not portal_role_enum.');
    }

    const roles = await client.query<{ portal_role: string | null }>(
        'SELECT DISTINCT portal_role::text AS portal_role FROM users ORDER BY portal_role::text NULLS FIRST',
    );
    const allowed = new Set(['school_staff', 'superuser', 'admin']);
    if (roles.rows.some(row => row.portal_role === null || !allowed.has(row.portal_role))) {
        throw new Error('Unknown schema: users contains a null or unsupported portal role.');
    }
    return tables.has('report_exports') && tables.has('pho_schema_migrations') ? 'phase1-release' : 'partial-v5';
}

async function verifyKnownLedger(client: PoolClient, tables: Set<string>): Promise<void> {
    if (!tables.has('pho_schema_migrations')) return;
    const ledger = await client.query<LedgerRow>(
        'SELECT version, name, checksum FROM pho_schema_migrations ORDER BY version',
    );
    const known = knownMigrationChecksums();
    for (const row of ledger.rows) {
        const expected = known.get(row.version);
        if (!expected || expected.name !== row.name || expected.checksum !== row.checksum.trim()) {
            throw new Error(`Unknown migration ledger entry or checksum mismatch at version ${row.version}.`);
        }
    }
}

async function applyAccessManifest(client: PoolClient, manifestPath: string): Promise<void> {
    const parsed = manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    const actorResult = await client.query<{ id: number }>(`
        SELECT id FROM users
        WHERE lower(email) = lower($1) AND portal_role = 'admin' AND is_active = TRUE
    `, [parsed.approved_by_admin_email]);
    const actorId = actorResult.rows[0]?.id;
    if (!actorId) throw new Error('Access manifest approver must be an active admin account.');

    const seenEmails = new Set<string>();
    for (const entry of parsed.users) {
        const normalizedEmail = entry.email.toLowerCase();
        if (seenEmails.has(normalizedEmail)) throw new Error(`Duplicate access manifest user: ${entry.email}.`);
        seenEmails.add(normalizedEmail);

        const userResult = await client.query<{ id: number; portal_role: string }>(`
            SELECT id, portal_role::text AS portal_role FROM users
            WHERE lower(email) = lower($1) AND is_active = TRUE
        `, [entry.email]);
        const user = userResult.rows[0];
        if (!user) throw new Error(`Access manifest user is missing or inactive: ${entry.email}.`);
        if (user.portal_role === 'admin') throw new Error('Admins cannot receive clinical access through the manifest.');
        if (user.portal_role !== 'school_staff' && entry.school_ids.length > 0) {
            throw new Error(`Only school_staff may receive school assignments: ${entry.email}.`);
        }
        if (new Set(entry.school_ids).size !== entry.school_ids.length) {
            throw new Error(`Duplicate school id in access manifest for ${entry.email}.`);
        }

        const moduleEntries = Object.entries(entry.module_permissions);
        if (moduleEntries.length === 0) throw new Error(`At least one module grant is required for ${entry.email}.`);
        const moduleSlugs = moduleEntries.map(([slug]) => slug);
        const modules = await client.query<{ id: number; slug: string }>(`
            SELECT id, slug FROM modules WHERE slug = ANY($1::text[]) AND is_active = TRUE
        `, [moduleSlugs]);
        if (modules.rows.length !== moduleSlugs.length) {
            throw new Error(`Access manifest contains an unknown or inactive module for ${entry.email}.`);
        }
        if (entry.school_ids.length > 0) {
            const schools = await client.query<{ count: number }>(`
                SELECT COUNT(*)::int AS count FROM schools WHERE id = ANY($1::int[]) AND is_active = TRUE
            `, [entry.school_ids]);
            if (schools.rows[0]?.count !== entry.school_ids.length) {
                throw new Error(`Access manifest contains an unknown or inactive school for ${entry.email}.`);
            }
        }

        await client.query(`
            UPDATE user_module_permissions SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
            WHERE user_id = $1 AND revoked_at IS NULL
        `, [user.id, actorId]);
        await client.query(`
            UPDATE user_school_assignments SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
            WHERE user_id = $1 AND revoked_at IS NULL
        `, [user.id, actorId]);

        for (const module of modules.rows) {
            const permission = parsed.users.find(item => item.email.toLowerCase() === normalizedEmail)
                ?.module_permissions[module.slug];
            if (!permission) throw new Error(`Missing parsed permission for ${module.slug}.`);
            if (permission.can_approve_registration
                && (user.portal_role !== 'school_staff' || module.slug !== 'patient-info')) {
                throw new Error(`Invalid approve-registration grant for ${entry.email}/${module.slug}.`);
            }
            if (!Object.values(permission).some(Boolean)) {
                throw new Error(`Empty module grant is not allowed for ${entry.email}/${module.slug}.`);
            }
            await client.query(`
                INSERT INTO user_module_permissions (
                    user_id, module_id, can_view, can_create, can_edit,
                    can_approve_registration, can_report, can_export, granted_by
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            `, [user.id, module.id, permission.can_view, permission.can_create, permission.can_edit,
                permission.can_approve_registration, permission.can_report, permission.can_export, actorId]);
        }
        for (const schoolId of entry.school_ids) {
            await client.query(`
                INSERT INTO user_school_assignments (user_id, school_id, assigned_by)
                VALUES ($1, $2, $3)
            `, [user.id, schoolId, actorId]);
        }
        await client.query(`
            INSERT INTO audit_events (actor_id, portal_role, action, entity_type, entity_id, details)
            VALUES ($1, 'admin', 'MIGRATION_APPLY_EXPLICIT_ACCESS', 'USER', $2,
                    jsonb_build_object('module_count', $3::int, 'school_count', $4::int,
                                       'migration', $5::text))
        `, [actorId, String(user.id), moduleEntries.length, entry.school_ids.length, RELEASE_MIGRATION_NAME]);
    }
}

export async function assertReleaseAccessReady(client: PoolClient): Promise<void> {
    const violations = await client.query<{ violation: string; count: number }>(`
        WITH active_grants AS (
            SELECT user_id, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE granted_by IS NULL)::int AS missing_actor
            FROM user_module_permissions WHERE revoked_at IS NULL GROUP BY user_id
        ), active_schools AS (
            SELECT user_id, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE assigned_by IS NULL)::int AS missing_actor
            FROM user_school_assignments WHERE revoked_at IS NULL GROUP BY user_id
        )
        SELECT violation, COUNT(*)::int AS count FROM (
            SELECT u.id, CASE
                WHEN u.portal_role = 'school_staff' AND COALESCE(g.count, 0) = 0 THEN 'school_staff_without_grant'
                WHEN u.portal_role = 'school_staff' AND COALESCE(s.count, 0) = 0 THEN 'school_staff_without_school'
                WHEN u.portal_role = 'superuser' AND COALESCE(g.count, 0) = 0 THEN 'superuser_without_grant'
                WHEN u.portal_role = 'admin' AND COALESCE(g.count, 0) > 0 THEN 'admin_with_clinical_grant'
                WHEN u.portal_role <> 'school_staff' AND COALESCE(s.count, 0) > 0 THEN 'non_staff_with_school'
                WHEN COALESCE(g.missing_actor, 0) > 0 THEN 'grant_without_actor'
                WHEN COALESCE(s.missing_actor, 0) > 0 THEN 'assignment_without_actor'
            END AS violation
            FROM users u LEFT JOIN active_grants g ON g.user_id = u.id
            LEFT JOIN active_schools s ON s.user_id = u.id WHERE u.is_active = TRUE
        ) checks WHERE violation IS NOT NULL GROUP BY violation ORDER BY violation
    `);
    if (violations.rows.length > 0) {
        const summary = violations.rows.map(row => `${row.violation}=${row.count}`).join(', ');
        throw new Error(`Explicit access release gate failed: ${summary}. Provide the approved access manifest.`);
    }
}

export async function applyPhase1Release(
    client: PoolClient,
    accessManifestPath?: string,
): Promise<MigrationResult> {
    const { sql, checksum } = releaseMigration();
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '5min'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_phase1_production_release'))");
        const startingState = await classifyPhase1StartingState(client);
        const tables = await tableNames(client);
        await verifyKnownLedger(client, tables);
        await client.query(`
            CREATE TABLE IF NOT EXISTS PHO_SCHEMA_MIGRATIONS (
                version VARCHAR(20) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const recorded = await client.query<LedgerRow>(
            'SELECT version, name, checksum FROM pho_schema_migrations WHERE version = $1',
            [RELEASE_MIGRATION_VERSION],
        );
        const existing = recorded.rows[0];
        if (existing) {
            if (existing.name !== RELEASE_MIGRATION_NAME || existing.checksum.trim() !== checksum) {
                throw new Error('Release migration 007 checksum or name differs from the applied ledger entry.');
            }
            await assertReleaseAccessReady(client);
            await client.query('COMMIT');
            return { applied: false, checksum, startingState };
        }

        await client.query(sql);
        if (accessManifestPath) await applyAccessManifest(client, accessManifestPath);
        await assertReleaseAccessReady(client);
        await client.query(`
            INSERT INTO pho_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)
        `, [RELEASE_MIGRATION_VERSION, RELEASE_MIGRATION_NAME, checksum]);
        await client.query(`
            INSERT INTO audit_events (action, entity_type, details)
            VALUES ('MIGRATION_APPLIED', 'SCHEMA',
                    jsonb_build_object('migration', $1::text, 'starting_state', $2::text, 'checksum', $3::text))
        `, [RELEASE_MIGRATION_NAME, startingState, checksum]);
        await client.query('COMMIT');
        return { applied: true, checksum, startingState };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
