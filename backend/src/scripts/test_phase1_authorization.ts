import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { AuditService } from '../services/AuditService.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);

type Role = 'admin' | 'superuser' | 'school_staff';
type Json = Record<string, unknown>;
type FixtureUser = { id: number; email: string; role: Role; token: string };

const stamp = Date.now();
const userIds: number[] = [];
const schoolIds: number[] = [];
const studentIds: number[] = [];
let server: ReturnType<typeof app.listen> | undefined;
let patientModuleWasActive = true;

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');

function authToken(id: number, email: string, role: Role): string {
    return jwt.sign({ id, email, portal_role: role }, secret!, { expiresIn: '10m' });
}

async function addUser(role: Role, label: string): Promise<FixtureUser> {
    const email = `phase1_m4_${label}_${stamp}@pho.test`;
    const legacyRole = role === 'school_staff' ? 'teacher' : role;
    const result = await pool.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active, failed_login_attempts)
        VALUES ($1, 'test-only-hash', $2, $3, 'QA Fixture', 'Phase', 'Four', TRUE, 0)
        RETURNING id
    `, [email, legacyRole, role]);
    const id = result.rows[0]?.id;
    assert.ok(id);
    userIds.push(id);
    return { id, email, role, token: authToken(id, email, role) };
}

async function grant(userId: number, moduleIds: number[], actorId: number, actions = true): Promise<void> {
    for (const moduleId of moduleIds) {
        await pool.query(`
            INSERT INTO USER_MODULE_PERMISSIONS
                (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export, granted_by)
            VALUES ($1, $2, TRUE, $4, $4, FALSE, $4, $4, $3)
        `, [userId, moduleId, actorId, actions]);
    }
}

async function assign(userId: number, schools: number[], actorId: number): Promise<void> {
    for (const schoolId of schools) {
        await pool.query(`
            INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by)
            VALUES ($1, $2, $3)
        `, [userId, schoolId, actorId]);
    }
}

async function addStudent(schoolId: number, actorId: number, suffix: string): Promise<number> {
    const result = await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS (first_name, last_name, sex, date_of_birth, student_lrn, school_id, registered_by)
        VALUES ('M4', $3, 'Male', '2012-01-01', $1, $2, $4)
        RETURNING id
    `, [`M4-${stamp}-${suffix}`, schoolId, suffix, actorId]);
    const id = result.rows[0]?.id;
    assert.ok(id);
    studentIds.push(id);
    return id;
}

async function request(base: string, method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: Json; text: string }> {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let json: Json = {};
    try { json = text ? JSON.parse(text) as Json : {}; } catch { /* status remains testable */ }
    return { status: response.status, json, text };
}

function dataId(result: { json: Json }): number {
    const data = result.json.data as Record<string, unknown> | undefined;
    const patientInfo = data?.patient_info as Record<string, unknown> | undefined;
    const id = Number(data?.id ?? patientInfo?.id);
    assert.ok(Number.isInteger(id) && id > 0, `Expected response data.id, got ${JSON.stringify(result.json)}`);
    return id;
}

try {
    const admin = await addUser('admin', 'admin');
    const staffA = await addUser('school_staff', 'staff_a');
    const staffSameSchool = await addUser('school_staff', 'staff_same');
    const staffBoth = await addUser('school_staff', 'staff_both');
    const staffNoSchool = await addUser('school_staff', 'staff_none');
    const staffNoGrant = await addUser('school_staff', 'staff_no_grant');
    const superPatientOnly = await addUser('superuser', 'super_patient');

    const barangay = await pool.query<{ id: number }>('SELECT id FROM BARANGAYS ORDER BY id LIMIT 1');
    const barangayId = barangay.rows[0]?.id;
    assert.ok(barangayId, 'An existing barangay fixture is required.');
    for (const label of ['A', 'B']) {
        const result = await pool.query<{ id: number }>(`
            INSERT INTO SCHOOLS (name, address, barangay_id, district, is_active)
            VALUES ($1, 'Test only', $2, 'QA', TRUE) RETURNING id
        `, [`Phase 1 M4 School ${label} ${stamp}`, barangayId]);
        schoolIds.push(result.rows[0]!.id);
    }
    const [schoolA, schoolB] = schoolIds;
    assert.ok(schoolA && schoolB);

    const modules = await pool.query<{ id: number; slug: string; is_active: boolean }>('SELECT id, slug, is_active FROM MODULES');
    const moduleId = (slug: string): number => {
        const id = modules.rows.find(row => row.slug === slug)?.id;
        assert.ok(id, `Missing module ${slug}`);
        return id;
    };
    const slugs = ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'];
    const allModuleIds = slugs.map(moduleId);
    patientModuleWasActive = modules.rows.find(row => row.slug === 'patient-info')?.is_active ?? true;

    await grant(staffA.id, allModuleIds, admin.id);
    await grant(staffSameSchool.id, allModuleIds, admin.id);
    await grant(staffBoth.id, allModuleIds, admin.id);
    await grant(staffNoSchool.id, allModuleIds, admin.id);
    await grant(superPatientOnly.id, [moduleId('patient-info')], admin.id, false);
    await assign(staffA.id, [schoolA], admin.id);
    await assign(staffSameSchool.id, [schoolA], admin.id);
    await assign(staffBoth.id, [schoolA, schoolB], admin.id);
    await assign(staffNoGrant.id, [schoolA], admin.id);

    const studentA = await addStudent(schoolA, staffA.id, 'A');
    const studentB = await addStudent(schoolB, staffBoth.id, 'B');

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve);
        server!.once('error', reject);
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const api = `${origin}/api`;
    const v1 = `${origin}/api/v1`;

    assert.equal((await request(api, 'GET', '/lookup/modules')).status, 401);
    assert.equal((await request(v1, 'GET', '/lookup/modules')).status, 401);
    assert.equal((await request(api, 'GET', '/users', admin.token)).status, 404);
    assert.equal((await request(v1, 'GET', '/users', admin.token)).status, 404);

    const schools = await request(v1, 'GET', `/lookup/schools/${barangayId}`, staffA.token);
    assert.equal(schools.status, 200);
    assert.match(schools.text, new RegExp(`"id":${schoolA}`));
    assert.doesNotMatch(schools.text, new RegExp(`"id":${schoolB}`));

    assert.equal((await request(api, 'GET', `/students/${studentA}`, admin.token)).status, 403);
    assert.equal((await request(v1, 'GET', `/students/${studentA}`, staffNoGrant.token)).status, 403);
    assert.equal((await request(api, 'GET', `/students/${studentA}`, staffSameSchool.token)).status, 200,
        'Access is based on current school assignment, not registered_by ownership.');
    assert.equal((await request(v1, 'GET', `/students/${studentB}`, staffA.token)).status, 403,
        'Out-of-scope student records are forbidden.');

    const listing = await request(api, 'GET', '/students', staffA.token);
    assert.equal(listing.status, 200);
    assert.match(listing.text, new RegExp(`"id":${studentA}`));
    assert.doesNotMatch(listing.text, new RegExp(`"id":${studentB}`));

    const createBodies: Record<string, Json> = {
        'patient-info': { student_id: studentB },
        'oral-health': { student_id: studentB, date_examined: '2026-01-10' },
        deworming: { student_id: studentB, date_dewormed: '2026-01-10' },
        immunization: { student_id: studentB, immunization_date: '2026-01-10', vaccine_td1: true },
        'vital-signs': { student_id: studentB, date_checked: '2026-01-10' },
    };
    for (const slug of slugs) {
        const forged: Json = { ...(createBodies[slug] ?? {}), school_id: schoolA };
        assert.equal((await request(v1, 'POST', `/modules/${slug}`, staffA.token, forged)).status, 403,
            `${slug} must resolve scope from the stored student relation.`);
        assert.equal((await request(api, 'GET', `/modules/${slug}/student/${studentB}`, staffA.token)).status, 403);
    }

    const profile = await request(v1, 'GET', `/students/${studentA}/profile`, superPatientOnly.token);
    assert.equal(profile.status, 200);
    const profileModules = ((profile.json.data as Record<string, unknown>)?.modules ?? {}) as Record<string, unknown>;
    for (const key of ['oral_health', 'deworming', 'immunization', 'vital_signs']) {
        assert.equal(profileModules[key], null, `${key} must be filtered without a grant.`);
    }

    for (const slug of slugs) {
        assert.equal((await request(api, 'GET', `/modules/${slug}/dashboard?school_id=${schoolB}`, staffA.token)).status, 403);
        assert.equal((await request(v1, 'GET', `/modules/${slug}/dashboard?school_id=${schoolA}`, staffA.token)).status, 200);
        assert.equal((await request(api, 'GET', `/modules/${slug}/dashboard`, staffNoSchool.token)).status, 200,
            'An empty school assignment must produce an empty dashboard, never province-wide access.');
    }

    assert.equal((await request(v1, 'PUT', `/students/${studentA}`, staffA.token, { school_id: schoolB })).status, 403);
    assert.equal((await request(api, 'PUT', `/students/${studentA}`, staffBoth.token, { school_id: schoolB })).status, 200);
    assert.equal((await request(v1, 'PUT', `/students/${studentA}`, staffBoth.token, { school_id: schoolA })).status, 200);

    const successBodies: Record<string, Json> = {
        'patient-info': { student_id: studentA },
        'oral-health': { student_id: studentA, date_examined: '2026-01-10' },
        deworming: { student_id: studentA, date_dewormed: '2026-01-10' },
        immunization: { student_id: studentA, immunization_date: '2026-01-10', vaccine_td1: true },
        'vital-signs': { student_id: studentA, date_checked: '2026-01-10' },
    };
    const created: Record<string, number> = {};
    for (const slug of slugs) {
        const result = await request(api, 'POST', `/modules/${slug}`, staffA.token, successBodies[slug]);
        assert.equal(result.status, 201, `${slug} create should succeed: ${result.text}`);
        created[slug] = dataId(result);
        const updateBody = slug === 'patient-info' ? { file_no: `M4-${stamp}` }
            : slug === 'oral-health' ? { remarks: 'updated' }
            : slug === 'deworming' ? { remarks: 'updated' }
            : slug === 'immunization' ? { remarks: 'updated' }
            : { remarks: 'updated' };
        assert.equal((await request(v1, 'PUT', `/modules/${slug}/${created[slug]}`, staffSameSchool.token, updateBody)).status, 200,
            `${slug} same-school update must not depend on registered_by.`);
    }

    const biteCreate = await request(v1, 'POST', '/modules/patient-info/animal-bites', staffA.token, {
        student_id: studentA, patient_info_id: created['patient-info'], animal_type: 'Dog',
    });
    assert.equal(biteCreate.status, 201, biteCreate.text);
    const biteId = dataId(biteCreate);
    assert.equal((await request(api, 'PUT', `/modules/patient-info/animal-bites/${biteId}`, staffSameSchool.token, { is_active_case: true })).status, 200);
    assert.equal((await request(v1, 'POST', '/modules/patient-info/animal-bites', staffA.token, {
        student_id: studentB, patient_info_id: created['patient-info'], school_id: schoolA,
    })).status, 403);

    const overview = await request(v1, 'GET', '/dashboard/overview', superPatientOnly.token);
    assert.equal(overview.status, 200);
    const completion = ((overview.json.data as Record<string, unknown>)?.module_completion ?? []) as Array<Record<string, unknown>>;
    assert.deepEqual(completion.map(item => item.module), ['Patient Info'],
        'Overview completion must include only modules granted to the current superuser.');
    assert.equal((await request(api, 'GET', `/dashboard/overview?school_id=${schoolB}`, staffA.token)).status, 403);

    const expectedAuditActions = [
        'PATIENT_INFO_CREATED', 'PATIENT_INFO_UPDATED', 'ANIMAL_BITE_CREATED', 'ANIMAL_BITE_UPDATED',
        'ORAL_HEALTH_CREATED', 'ORAL_HEALTH_UPDATED', 'DEWORMING_RECORD_CREATED', 'DEWORMING_RECORD_UPDATED',
        'IMMUNIZATION_CREATED', 'IMMUNIZATION_UPDATED', 'VITAL_SIGNS_CREATED', 'VITAL_SIGNS_UPDATED',
    ];
    const auditActions = await pool.query<{ action: string }>(`
        SELECT action FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[]) AND action = ANY($2::text[])
    `, [[staffA.id, staffSameSchool.id], expectedAuditActions]);
    assert.deepEqual(new Set(auditActions.rows.map(row => row.action)), new Set(expectedAuditActions));

    const beforeFailedAudit = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM VITAL_SIGNS WHERE student_id = $1', [studentA],
    );
    const originalLogEvent = AuditService.logEvent;
    const originalControllerError = console.error;
    AuditService.logEvent = async () => { throw new Error('forced clinical audit failure'); };
    console.error = () => undefined;
    try {
        assert.equal((await request(v1, 'POST', '/modules/vital-signs', staffA.token, {
            student_id: studentA, date_checked: '2026-02-10',
        })).status, 500);
    } finally {
        AuditService.logEvent = originalLogEvent;
        console.error = originalControllerError;
    }
    const afterFailedAudit = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM VITAL_SIGNS WHERE student_id = $1', [studentA],
    );
    assert.equal(afterFailedAudit.rows[0]?.count, beforeFailedAudit.rows[0]?.count,
        'A failed clinical audit write must roll back the clinical mutation.');

    await pool.query("UPDATE MODULES SET is_active = FALSE WHERE slug = 'patient-info'");
    const disabledStudent = await request(api, 'POST', '/students', staffA.token, {
        first_name: 'Disabled', last_name: 'Module', sex: 'Male', date_of_birth: '2012-01-01',
        student_lrn: `M4-disabled-${stamp}`, school_id: schoolA,
    });
    assert.equal(disabledStudent.status, 422);
    assert.equal((disabledStudent.json.error as Record<string, unknown>)?.code, 'MODULE_DISABLED');
    assert.equal((await request(v1, 'POST', '/modules/patient-info', staffA.token, { student_id: studentA })).status, 422);
    assert.equal((await request(api, 'GET', `/students/${studentA}`, staffA.token)).status, 200,
        'Disabled modules remain readable for continuity.');
    await pool.query("UPDATE MODULES SET is_active = TRUE WHERE slug = 'patient-info'");

    await pool.query('UPDATE USERS SET is_active = FALSE WHERE id = $1', [staffA.id]);
    assert.equal((await request(v1, 'GET', `/students/${studentA}`, staffA.token)).status, 401);
    await pool.query("UPDATE USERS SET is_active = TRUE, portal_role = 'admin', role = 'admin' WHERE id = $1", [staffA.id]);
    assert.equal((await request(api, 'GET', `/students/${studentA}`, staffA.token)).status, 403);
    await pool.query("UPDATE USERS SET portal_role = 'school_staff', role = 'teacher' WHERE id = $1", [staffA.id]);

    await pool.query(`UPDATE USER_MODULE_PERMISSIONS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
        WHERE user_id = $1 AND revoked_at IS NULL AND module_id = $3`, [staffA.id, admin.id, moduleId('patient-info')]);
    assert.equal((await request(v1, 'GET', `/students/${studentA}`, staffA.token)).status, 403);
    await grant(staffA.id, [moduleId('patient-info')], admin.id);
    await pool.query(`UPDATE USER_SCHOOL_ASSIGNMENTS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
        WHERE user_id = $1 AND school_id = $3 AND revoked_at IS NULL`, [staffA.id, admin.id, schoolA]);
    assert.equal((await request(api, 'GET', `/students/${studentA}`, staffA.token)).status, 403);

    const marker = `sensitive-${stamp}`;
    await request(v1, 'GET', `/students/${studentB}?search=${marker}`, staffSameSchool.token);
    const denial = await pool.query<{ details: Json }>(`
        SELECT details FROM AUDIT_EVENTS WHERE actor_id = $1 AND action = 'AUTHORIZATION_DENIED'
        ORDER BY id DESC LIMIT 1
    `, [staffSameSchool.id]);
    const denialText = JSON.stringify(denial.rows[0]?.details ?? {});
    assert.doesNotMatch(denialText, new RegExp(marker));
    assert.doesNotMatch(denialText, /assigned.*school/i);

    const originalError = console.error;
    const messages: string[] = [];
    console.error = (...args: unknown[]) => { messages.push(args.map(String).join(' ')); };
    try {
        await AuditService.logEvent({
            actor_id: 999999999,
            action: 'EXPECTED_TEST_FAILURE',
            entity_type: 'test',
            details: { token: marker, first_name: marker },
        });
    } finally {
        console.error = originalError;
    }
    assert.doesNotMatch(messages.join(' '), new RegExp(marker));

    console.log('Phase 1 Milestone 4 authorization and audit integration checks passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await pool.query("UPDATE MODULES SET is_active = $1 WHERE slug = 'patient-info'", [patientModuleWasActive]);
    if (studentIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[]) OR school_id = ANY($2::int[])', [userIds, schoolIds]);
        await pool.query('DELETE FROM ANIMAL_BITES WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM ORAL_HEALTH WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM DEWORMING WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM IMMUNIZATION WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM VITAL_SIGNS WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1::int[])', [studentIds]);
    }
    if (userIds.length) {
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    if (schoolIds.length) await pool.query('DELETE FROM SCHOOLS WHERE id = ANY($1::int[])', [schoolIds]);
    await pool.end();
}
