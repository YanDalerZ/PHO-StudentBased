import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import pool from '../database/db.js';
import { applyPhase1Release, classifyPhase1StartingState } from '../database/phase1Release.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

function databaseFile(...segments: string[]): string {
    return fs.readFileSync(path.join(process.cwd(), 'database', ...segments), 'utf8');
}

async function resetToPhase4(client: PoolClient): Promise<void> {
    await client.query(`
        DROP TABLE IF EXISTS REGISTRATION_SUBMISSION_EVENTS CASCADE;
        DROP TABLE IF EXISTS REGISTRATION_SUBMISSIONS CASCADE;
        DROP TABLE IF EXISTS REGISTRATION_INVITATIONS CASCADE;
        DROP TABLE IF EXISTS REPORT_EXPORTS CASCADE;
        DROP TABLE IF EXISTS PHO_SCHEMA_MIGRATIONS CASCADE;
        DROP TABLE IF EXISTS AUDIT_EVENTS CASCADE;
        DROP TABLE IF EXISTS USER_MODULE_PERMISSIONS CASCADE;
        DROP TABLE IF EXISTS USER_SCHOOL_ASSIGNMENTS CASCADE;
        DROP TABLE IF EXISTS VITAL_SIGNS CASCADE;
        DROP TABLE IF EXISTS IMMUNIZATION CASCADE;
        DROP TABLE IF EXISTS DEWORMING CASCADE;
        DROP TABLE IF EXISTS ORAL_HEALTH CASCADE;
        DROP TABLE IF EXISTS ANIMAL_BITES CASCADE;
        DROP TABLE IF EXISTS PATIENT_INFO CASCADE;
        DROP TABLE IF EXISTS STUDENTS CASCADE;
        DROP TABLE IF EXISTS MODULES CASCADE;
        DROP TABLE IF EXISTS SCHOOLS CASCADE;
        DROP TABLE IF EXISTS USERS CASCADE;
        DROP TABLE IF EXISTS BARANGAYS CASCADE;
        DROP TABLE IF EXISTS MUNICIPALITIES CASCADE;
        DROP TABLE IF EXISTS PROVINCES CASCADE;
        DROP TABLE IF EXISTS REGIONS CASCADE;
        DROP TABLE IF EXISTS COUNTRIES CASCADE;
        DROP TYPE IF EXISTS portal_role_enum CASCADE;
        DROP TYPE IF EXISTS user_role CASCADE;
        DROP TYPE IF EXISTS gender_enum CASCADE;
        DROP TYPE IF EXISTS service_location_enum CASCADE;
        DROP TYPE IF EXISTS visit_type_enum CASCADE;
        DROP TYPE IF EXISTS school_type_enum CASCADE;
    `);
    await client.query(databaseFile('schema.sql'));
    await client.query(databaseFile('seed.sql'));
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 10);
    await client.query(`
        INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
        VALUES
          ('admin.phase1@example.invalid', $1, 'admin', 'Phase1', 'Admin', TRUE),
          ('staff.phase1@example.invalid', $1, 'teacher', 'Phase1', 'Staff', TRUE),
          ('super.phase1@example.invalid', $1, 'superuser', 'Phase1', 'Superuser', TRUE)
    `, [passwordHash]);
}

async function writeManifest(client: PoolClient): Promise<string> {
    const school = await client.query<{ id: number }>('SELECT id FROM schools WHERE is_active = TRUE ORDER BY id LIMIT 1');
    const schoolId = school.rows[0]?.id;
    assert.ok(schoolId, 'A seeded active school is required.');
    const manifestPath = path.join(os.tmpdir(), `pho-phase1-access-${process.pid}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify({
        approved_by_admin_email: 'admin.phase1@example.invalid',
        users: [
            {
                email: 'staff.phase1@example.invalid',
                school_ids: [schoolId],
                module_permissions: {
                    'patient-info': {
                        can_view: true, can_create: true, can_edit: true,
                        can_approve_registration: true, can_report: true, can_export: false,
                    },
                },
            },
            {
                email: 'super.phase1@example.invalid',
                school_ids: [],
                module_permissions: {
                    'oral-health': {
                        can_view: true, can_create: false, can_edit: false,
                        can_approve_registration: false, can_report: true, can_export: false,
                    },
                },
            },
        ],
    }), { encoding: 'utf8', mode: 0o600 });
    return manifestPath;
}

async function verifyRelease(client: PoolClient): Promise<void> {
    const users = await client.query<{
        portal_role: string;
        grants: number;
        schools: number;
        missing_grant_actor: number;
        missing_school_actor: number;
    }>(`
        SELECT u.portal_role::text AS portal_role,
               COUNT(DISTINCT ump.id)::int AS grants,
               COUNT(DISTINCT usa.id)::int AS schools,
               COUNT(DISTINCT ump.id) FILTER (WHERE ump.granted_by IS NULL)::int AS missing_grant_actor,
               COUNT(DISTINCT usa.id) FILTER (WHERE usa.assigned_by IS NULL)::int AS missing_school_actor
        FROM users u
        LEFT JOIN user_module_permissions ump ON ump.user_id = u.id AND ump.revoked_at IS NULL
        LEFT JOIN user_school_assignments usa ON usa.user_id = u.id AND usa.revoked_at IS NULL
        WHERE u.is_active = TRUE GROUP BY u.id, u.portal_role ORDER BY u.portal_role
    `);
    const admin = users.rows.find(row => row.portal_role === 'admin');
    const staff = users.rows.find(row => row.portal_role === 'school_staff');
    const superuser = users.rows.find(row => row.portal_role === 'superuser');
    assert.equal(admin?.grants, 0, 'Admin must not inherit clinical grants.');
    assert.equal(admin?.schools, 0, 'Admin must not receive a school assignment.');
    assert.equal(staff?.grants, 1);
    assert.equal(staff?.schools, 1);
    assert.equal(superuser?.grants, 1);
    assert.equal(superuser?.schools, 0);
    assert.ok(users.rows.every(row => row.missing_grant_actor === 0 && row.missing_school_actor === 0));

    const ledger = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM pho_schema_migrations WHERE version = '007'",
    );
    assert.equal(ledger.rows[0]?.count, 1);
}

const policy = requireDisposableDatabase();
const client = await pool.connect();
let manifestPath: string | undefined;
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    console.log(`Verified disposable PostgreSQL target: ${formatSafeDatabaseIdentity(identity)}`);

    await resetToPhase4(client);
    assert.equal(await classifyPhase1StartingState(client), 'phase4-clean');
    manifestPath = await writeManifest(client);
    const cleanResult = await applyPhase1Release(client, manifestPath);
    assert.equal(cleanResult.startingState, 'phase4-clean');
    assert.equal(cleanResult.applied, true);
    await verifyRelease(client);
    const repeat = await applyPhase1Release(client);
    assert.equal(repeat.applied, false, 'Migration must be repeatable through its checksum ledger.');
    console.log('Scenario A passed: clean Phase 4 -> Phase 1 release.');

    await resetToPhase4(client);
    for (const migration of [
        '002_v5_authorization_foundation.sql',
        '003_v5_qr_and_submissions.sql',
        '004_v5_authorization_correction.sql',
        '005_v5_grant_baseline_correction.sql',
    ]) {
        await client.query(databaseFile('migrations', migration));
    }
    assert.equal(await classifyPhase1StartingState(client), 'partial-v5');
    if (manifestPath) fs.rmSync(manifestPath, { force: true });
    manifestPath = await writeManifest(client);
    const partialResult = await applyPhase1Release(client, manifestPath);
    assert.equal(partialResult.startingState, 'partial-v5');
    assert.equal(partialResult.applied, true);
    await verifyRelease(client);
    const implicit = await client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count FROM user_module_permissions
        WHERE revoked_at IS NULL AND granted_by IS NULL
    `);
    assert.equal(implicit.rows[0]?.count, 0);
    console.log('Scenario B passed: partial earlier v5 attempt -> Phase 1 release.');
} finally {
    if (manifestPath) fs.rmSync(manifestPath, { force: true });
    client.release();
    await pool.end();
}
