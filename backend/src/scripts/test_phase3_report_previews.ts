import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { protectBreakdown } from '../services/report-preview.service.js';
import type { ModuleSlug, PortalRole } from '../types/auth.types.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');

const stamp = Date.now();
const userIds: number[] = [];
const studentIds: number[] = [];
const schoolIds: number[] = [];
let municipalityId: number | undefined;
let barangayId: number | undefined;
let server: ReturnType<typeof app.listen> | undefined;
const originalModuleStates = new Map<number, boolean>();

function token(id: number, email: string, role: PortalRole): string {
    return jwt.sign({ id, email, portal_role: role }, secret!, { expiresIn: '10m' });
}

async function addUser(role: PortalRole, label: string): Promise<{ id: number; token: string }> {
    const email = `phase3_m3_${label}_${stamp}@pho.test`;
    const legacyRole = role === 'school_staff' ? 'teacher' : role;
    const result = await pool.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', $2, $3, 'QA Fixture', 'Phase', 'Three', TRUE)
        RETURNING id
    `, [email, legacyRole, role]);
    const id = result.rows[0]?.id;
    assert.ok(id);
    userIds.push(id);
    return { id, token: token(id, email, role) };
}

async function addStudent(schoolId: number, actorId: number, suffix: string, sex: 'Male' | 'Female'): Promise<number> {
    const result = await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS
            (first_name, last_name, sex, date_of_birth, student_lrn, school_id, grade_level, registered_by,
             municipality_id, barangay_id, is_4ps_member, is_pwd, is_philhealth_member, is_indigenous)
        VALUES ('Preview', $1, $2, '2014-03-04', $3, $4, 'Grade 4', $5, $6, $7, TRUE, TRUE, TRUE, TRUE)
        RETURNING id
    `, [suffix, sex, `P3M3-${stamp}-${suffix}`, schoolId, actorId, municipalityId, barangayId]);
    const id = result.rows[0]?.id;
    assert.ok(id);
    studentIds.push(id);
    return id;
}

async function request(base: string, path: string, authToken?: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${base}${path}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
}

try {
    const protectedRows = protectBreakdown([
        { key: 'small', label: 'Small', count: 3 },
        { key: 'large', label: 'Large', count: 10 },
        { key: 'largest', label: 'Largest', count: 20 },
    ]);
    assert.deepEqual(protectedRows.map(row => row.count.suppression_reason), ['primary', 'complementary', undefined]);
    assert.equal(protectedRows[0]?.count.value, null);
    assert.equal(protectedRows[1]?.count.value, null);
    assert.equal(protectedRows[2]?.count.value, 20);

    const municipality = await pool.query<{ id: number }>(
        `INSERT INTO MUNICIPALITIES (name, province_id)
         SELECT $1, id FROM PROVINCES ORDER BY id LIMIT 1
         RETURNING id`,
        [`P3 M3 Municipality ${stamp}`],
    );
    municipalityId = municipality.rows[0]?.id;
    assert.ok(municipalityId);
    const barangay = await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`P3 M3 Barangay ${stamp}`, municipalityId],
    );
    barangayId = barangay.rows[0]?.id;
    assert.ok(barangayId);
    for (const label of ['Assigned', 'Outside']) {
        const schoolResult: { rows: Array<{ id: number }> } = await pool.query<{ id: number }>(
            'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
            [`P3 M3 ${label} ${stamp}`, barangayId],
        );
        const id: number | undefined = schoolResult.rows[0]?.id;
        assert.ok(id);
        schoolIds.push(id);
    }

    const admin = await addUser('admin', 'admin');
    const staff = await addUser('school_staff', 'staff');
    const unassignedStaff = await addUser('school_staff', 'unassigned');
    const superuser = await addUser('superuser', 'superuser');
    await pool.query(
        'INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)',
        [staff.id, schoolIds[0], admin.id],
    );

    const moduleRows = await pool.query<{ id: number; slug: ModuleSlug; is_active: boolean }>(`
        SELECT id, slug, is_active FROM MODULES
        WHERE slug = ANY($1::text[])
        ORDER BY id
    `, [[ 'patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs' ]]);
    assert.equal(moduleRows.rows.length, 5);
    for (const module of moduleRows.rows) {
        originalModuleStates.set(module.id, module.is_active);
        await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [module.id]);
        await pool.query(`
            INSERT INTO USER_MODULE_PERMISSIONS
                (user_id, module_id, can_view, can_report, granted_by)
            VALUES ($1, $2, TRUE, TRUE, $3)
        `, [superuser.id, module.id, admin.id]);
        if (module.slug === 'patient-info') {
            for (const userId of [staff.id, unassignedStaff.id]) {
                await pool.query(`
                    INSERT INTO USER_MODULE_PERMISSIONS
                        (user_id, module_id, can_view, can_report, granted_by)
                    VALUES ($1, $2, TRUE, TRUE, $3)
                `, [userId, module.id, admin.id]);
            }
        }
    }

    const assignedStudent = await addStudent(schoolIds[0]!, admin.id, 'Assigned', 'Female');
    const outsideStudent = await addStudent(schoolIds[1]!, admin.id, 'Outside', 'Male');
    for (const studentId of [assignedStudent, outsideStudent]) {
        await pool.query('INSERT INTO PATIENT_INFO (student_id, recorded_by, created_at) VALUES ($1, $2, $3)', [studentId, admin.id, '2026-08-10']);
        await pool.query(`
            INSERT INTO ORAL_HEALTH
                (student_id, date_examined, is_rpoc_complete, has_oral_screening, service_location, visit_type, total_dmft, total_dmft_primary, recorded_by)
            VALUES ($1, '2026-08-11', TRUE, TRUE, 'FACILITY', '1ST VISIT', 2, 1, $2)
        `, [studentId, admin.id]);
        await pool.query(`
            INSERT INTO DEWORMING (student_id, date_dewormed, age_group, is_dewormed, school_type, in_school, school_id, recorded_by)
            VALUES ($1, '2026-08-12', '10-14', TRUE, 'public', TRUE, $2, $3)
        `, [studentId, studentId === assignedStudent ? schoolIds[0] : schoolIds[1], admin.id]);
        await pool.query(`
            INSERT INTO IMMUNIZATION
                (student_id, immunization_date, vaccine_hpv1, consent_given, school_id, recorded_by)
            VALUES ($1, '2026-08-13', TRUE, TRUE, $2, $3)
        `, [studentId, studentId === assignedStudent ? schoolIds[0] : schoolIds[1], admin.id]);
        await pool.query(`
            INSERT INTO VITAL_SIGNS
                (student_id, date_checked, blood_pressure_systolic, blood_pressure_diastolic,
                 heart_rate, respiratory_rate, temperature, weight_kg, height_cm, bmi, recorded_by)
            VALUES ($1, '2026-08-14', 110, 70, 80, 18, 36.8, 35, 140, 17.86, $2)
        `, [studentId, admin.id]);
    }
    for (const [index, schoolId] of schoolIds.entries()) {
        await pool.query(`
            INSERT INTO DEWORMING_TARGETS
                (school_id, period, baseline_target_count, created_by, updated_by)
            VALUES ($1, '2026-SY-R1', $2, $3, $3)
        `, [schoolId, index === 0 ? 10 : 20, admin.id]);
    }

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve);
        server!.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const query = '?period=2026-SY-R1&page=1&pageSize=25';

    assert.equal((await request(base, `/api/v1/reports/patient-info${query}`)).status, 401);
    assert.equal((await request(base, `/api/v1/reports/not-a-module${query}`, superuser.token)).status, 404);
    assert.equal((await request(base, `/api/v1/reports/oral-health${query}`, staff.token)).status, 403);
    assert.equal((await request(base, `/api/v1/reports/patient-info${query}&school_id=${schoolIds[1]}`, staff.token)).status, 403);
    assert.equal((await request(base, '/api/v1/reports/patient-info?period=2026-H1', staff.token)).status, 400);

    const staffPreview = await request(base, `/api/v1/reports/patient-info${query}`, staff.token);
    assert.equal(staffPreview.status, 200);
    const staffData = staffPreview.body.data as Record<string, unknown>;
    assert.equal((staffData.summary as Record<string, unknown>).official_registration_students, 1);
    assert.deepEqual((staffData.scope as Record<string, unknown>).school_ids, [schoolIds[0]]);

    const emptyScopePreview = await request(base, `/api/v1/reports/patient-info${query}`, unassignedStaff.token);
    assert.equal(emptyScopePreview.status, 200);
    const emptyScopeData = emptyScopePreview.body.data as Record<string, unknown>;
    assert.equal((emptyScopeData.summary as Record<string, unknown>).official_registration_students, 0);
    assert.deepEqual((emptyScopeData.scope as Record<string, unknown>).school_ids, []);

    for (const slug of ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'] as ModuleSlug[]) {
        const result = await request(base, `/api/reports/${slug}${query}`, superuser.token);
        assert.equal(result.status, 200, `${slug} preview should succeed under compatibility mount`);
        assert.equal((result.body.data as Record<string, unknown>).module, slug);
        if (slug === 'vital-signs') {
            const classifications = (result.body.data as Record<string, unknown>).classifications as Record<string, Record<string, unknown>>;
            assert.equal(classifications.blood_pressure?.classification_status, 'unavailable');
            assert.equal(classifications.bmi_for_age?.classification_status, 'unavailable');
        }
    }

    const deworming = await request(base, `/api/v1/reports/deworming${query}`, superuser.token);
    const dewormingCoverage = ((deworming.body.data as Record<string, unknown>).coverage as Record<string, unknown>);
    assert.equal(dewormingCoverage.status, 'available');
    assert.equal(dewormingCoverage.target, 30);
    assert.equal(dewormingCoverage.accomplishment_percentage, 6.7);

    const audit = await pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND action = 'REPORT_VIEWED' AND entity_type = 'CONSOLIDATED_REPORT'
    `, [superuser.id]);
    assert.ok((audit.rows[0]?.count ?? 0) >= 5);

    console.log('Phase 3 Milestone 3 canonical report preview checks passed.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
    if (schoolIds.length) await pool.query('DELETE FROM DEWORMING_TARGETS WHERE school_id = ANY($1::int[])', [schoolIds]);
    if (studentIds.length) {
        await pool.query('DELETE FROM VITAL_SIGNS WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM IMMUNIZATION WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM DEWORMING WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM ORAL_HEALTH WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1::int[])', [studentIds]);
    }
    if (userIds.length) {
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    for (const [moduleId, isActive] of originalModuleStates) {
        await pool.query('UPDATE MODULES SET is_active = $1 WHERE id = $2', [isActive, moduleId]);
    }
    if (schoolIds.length) await pool.query('DELETE FROM SCHOOLS WHERE id = ANY($1::int[])', [schoolIds]);
    if (barangayId) await pool.query('DELETE FROM BARANGAYS WHERE id = $1', [barangayId]);
    if (municipalityId) await pool.query('DELETE FROM MUNICIPALITIES WHERE id = $1', [municipalityId]);
    const cleanup = await pool.query<{ users: number; students: number; schools: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM USERS WHERE id = ANY($1::int[])) AS users,
            (SELECT COUNT(*)::int FROM STUDENTS WHERE id = ANY($2::int[])) AS students,
            (SELECT COUNT(*)::int FROM SCHOOLS WHERE id = ANY($3::int[])) AS schools
    `, [userIds, studentIds, schoolIds]);
    assert.deepEqual(cleanup.rows[0], { users: 0, students: 0, schools: 0 });
    await pool.end();
}
