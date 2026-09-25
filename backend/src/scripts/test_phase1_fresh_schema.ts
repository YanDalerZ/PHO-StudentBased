import fs from 'node:fs';
import path from 'node:path';
import pool from '../database/db.js';
import { applyPhase1ReconciliationMigration } from '../database/phase1Migration.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

function readDatabaseFile(...segments: string[]): string {
    return fs.readFileSync(path.join(process.cwd(), 'database', ...segments), 'utf8');
}

const policy = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    console.log(`Verified disposable PostgreSQL target: ${formatSafeDatabaseIdentity(identity)}`);

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

    await client.query(readDatabaseFile('schema.sql'));
    await client.query(readDatabaseFile('seed.sql'));
    for (const migration of [
        '001_oral_health_dmft_expansion.sql',
        '002_v5_authorization_foundation.sql',
        '003_v5_qr_and_submissions.sql',
        '004_v5_authorization_correction.sql',
        '005_v5_grant_baseline_correction.sql',
    ]) {
        await client.query(readDatabaseFile('migrations', migration));
    }
    await applyPhase1ReconciliationMigration(client);

    const admin = await client.query<{ id: number }>(
        "SELECT id FROM USERS WHERE portal_role = 'admin' ORDER BY id LIMIT 1",
    );
    const adminId = admin.rows[0]?.id;
    if (!adminId) throw new Error('Fresh seed did not create the required admin fixture.');

    await client.query(`
        INSERT INTO USER_MODULE_PERMISSIONS (
            user_id, module_id, can_view, can_create, can_edit,
            can_approve_registration, can_report, can_export, granted_by
        )
        SELECT u.id, m.id, TRUE, TRUE, TRUE,
               (m.slug = 'patient-info'), FALSE, FALSE, $1
        FROM USERS u
        CROSS JOIN MODULES m
        WHERE u.portal_role = 'school_staff' AND m.slug = 'patient-info'
    `, [adminId]);
    await client.query(`
        INSERT INTO USER_MODULE_PERMISSIONS (
            user_id, module_id, can_view, can_create, can_edit,
            can_approve_registration, can_report, can_export, granted_by
        )
        SELECT u.id, m.id, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, $1
        FROM USERS u
        CROSS JOIN MODULES m
        WHERE u.portal_role = 'superuser'
    `, [adminId]);

    console.log('Fresh Phase 1 schema path completed through migration 006.');
} finally {
    client.release();
    await pool.end();
}
