import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');

type Role = 'admin' | 'superuser' | 'school_staff';
interface TestUser { id: number; token: string }
interface ApiResult { status: number; body: Record<string, unknown> }

const stamp = Date.now();
const userIds: number[] = [];
const studentIds: number[] = [];
const schoolIds: number[] = [];
const clinicalIds: Record<string, number[]> = {
    PATIENT_INFO: [], ORAL_HEALTH: [], DEWORMING: [], IMMUNIZATION: [], VITAL_SIGNS: [],
};
const moduleStates = new Map<number, boolean>();
let municipalityId: number | undefined;
let barangayId: number | undefined;
let server: ReturnType<typeof app.listen> | undefined;

function token(id: number, email: string, role: Role): string {
    return jwt.sign({ id, email, portal_role: role }, secret!, { expiresIn: '10m' });
}

async function addUser(role: Role, label: string): Promise<TestUser> {
    const email = `phase3_m6_${label}_${stamp}@pho.test`;
    const result = await pool.query<{ id: number }>(`
        INSERT INTO USERS
            (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', $2, $3, 'QA Fixture', 'Phase', 'Six', TRUE)
        RETURNING id
    `, [email, role === 'school_staff' ? 'teacher' : role, role]);
    const id = result.rows[0]?.id;
    assert.ok(id);
    userIds.push(id);
    return { id, token: token(id, email, role) };
}

async function request(base: string, method: string, route: string, authToken?: string, body?: unknown): Promise<ApiResult> {
    const response = await fetch(`${base}${route}`, {
        method,
        headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
        status: response.status,
        body: response.status === 204 ? {} : await response.json() as Record<string, unknown>,
    };
}

function dataId(result: ApiResult, nested?: string): number {
    const data = result.body.data as Record<string, unknown> | undefined;
    const target = nested ? data?.[nested] as Record<string, unknown> | undefined : data;
    const id = Number(target?.id ?? result.body.id);
    assert.ok(Number.isInteger(id) && id > 0, `Expected an ID in ${JSON.stringify(result.body)}`);
    return id;
}

async function grant(userId: number, moduleId: number, grantedBy: number, actions: { view?: boolean; create?: boolean; edit?: boolean }): Promise<void> {
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS
            (user_id, module_id, can_view, can_create, can_edit, can_approve_registration,
             can_report, can_export, granted_by)
        VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, FALSE, $6)
    `, [userId, moduleId, actions.view ?? false, actions.create ?? false, actions.edit ?? false, grantedBy]);
}

try {
    const province = await pool.query<{ id: number }>('SELECT id FROM PROVINCES ORDER BY id LIMIT 1');
    assert.ok(province.rows[0]?.id, 'A province fixture is required.');
    const municipality = await pool.query<{ id: number }>(
        'INSERT INTO MUNICIPALITIES (name, province_id) VALUES ($1, $2) RETURNING id',
        [`Phase 3 M6 Municipality ${stamp}`, province.rows[0]!.id],
    );
    municipalityId = municipality.rows[0]!.id;
    const barangay = await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`Phase 3 M6 Barangay ${stamp}`, municipalityId],
    );
    barangayId = barangay.rows[0]!.id;
    for (const name of ['Alpha', 'Beta']) {
        const school = await pool.query<{ id: number }>(
            'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
            [`Phase 3 M6 School ${name} ${stamp}`, barangayId],
        );
        schoolIds.push(school.rows[0]!.id);
    }

    const admin = await addUser('admin', 'admin');
    const superuser = await addUser('superuser', 'superuser');
    const limitedSuperuser = await addUser('superuser', 'limited');
    const staff = await addUser('school_staff', 'staff');
    await pool.query(
        'INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)',
        [staff.id, schoolIds[0], admin.id],
    );

    const modules = await pool.query<{ id: number; slug: string; is_active: boolean }>(`
        SELECT id, slug, is_active FROM MODULES
        WHERE slug = ANY($1::text[]) ORDER BY id
    `, [['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs']]);
    assert.equal(modules.rows.length, 5);
    const moduleIds = new Map(modules.rows.map(row => [row.slug, row.id]));
    for (const module of modules.rows) {
        moduleStates.set(module.id, module.is_active);
        await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [module.id]);
        await grant(superuser.id, module.id, admin.id, { view: true, create: true, edit: true });
        await grant(staff.id, module.id, admin.id, { view: true, create: true, edit: true });
    }
    await grant(limitedSuperuser.id, moduleIds.get('patient-info')!, admin.id, { view: true });

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve);
        server!.once('error', reject);
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

    const allSchools = await request(base, 'GET', '/lookup/schools', superuser.token);
    assert.equal(allSchools.status, 200);
    const allSchoolRows = allSchools.body as unknown as Array<{ id: number }>;
    assert.ok(schoolIds.every(id => allSchoolRows.some(row => Number(row.id) === id)));
    const staffSchools = await request(base, 'GET', '/lookup/schools', staff.token);
    assert.equal(staffSchools.status, 200);
    const staffSchoolRows = staffSchools.body as unknown as Array<{ id: number }>;
    assert.ok(staffSchoolRows.some(row => Number(row.id) === schoolIds[0]));
    assert.ok(!staffSchoolRows.some(row => Number(row.id) === schoolIds[1]));

    const createStudent = async (schoolId: number, suffix: string): Promise<number> => {
        const result = await request(base, 'POST', '/students', superuser.token, {
            student_lrn: `${String(stamp).slice(-9)}${suffix.padStart(3, '0')}`,
            first_name: `Province${suffix}`,
            last_name: 'MilestoneSix',
            sex: suffix === '1' ? 'Female' : 'Male',
            date_of_birth: '2014-05-15',
            school_id: schoolId,
            municipality_id: municipalityId,
            barangay_id: barangayId,
            grade_level: 'Grade 6',
            section: 'A',
        });
        assert.equal(result.status, 201);
        const id = dataId(result);
        studentIds.push(id);
        return id;
    };
    const studentA = await createStudent(schoolIds[0]!, '1');
    const studentB = await createStudent(schoolIds[1]!, '2');

    const provinceList = await request(base, 'GET', '/students', superuser.token);
    assert.equal(provinceList.status, 200);
    const provinceStudents = provinceList.body.data as Array<{ id: number }>;
    assert.ok(provinceStudents.some(row => Number(row.id) === studentA));
    assert.ok(provinceStudents.some(row => Number(row.id) === studentB));
    const filteredList = await request(base, 'GET', `/students?school_id=${schoolIds[1]}`, superuser.token);
    assert.equal(filteredList.status, 200);
    assert.deepEqual((filteredList.body.data as Array<{ id: number }>).filter(row => studentIds.includes(Number(row.id))).map(row => Number(row.id)), [studentB]);
    const staffList = await request(base, 'GET', '/students', staff.token);
    assert.equal(staffList.status, 200);
    assert.ok((staffList.body.data as Array<{ id: number }>).some(row => Number(row.id) === studentA));
    assert.ok(!(staffList.body.data as Array<{ id: number }>).some(row => Number(row.id) === studentB));

    assert.equal((await request(base, 'GET', `/students/${studentB}`, superuser.token)).status, 200);
    const correctedStudent = await request(base, 'PUT', `/students/${studentB}`, superuser.token, { section: 'Corrected' });
    assert.equal(correctedStudent.status, 200);
    assert.equal(((correctedStudent.body.data as Record<string, unknown>).section), 'Corrected');
    assert.equal((await request(base, 'GET', `/students/${studentB}`, staff.token)).status, 403);
    assert.equal((await request(base, 'PUT', `/students/${studentB}`, staff.token, { section: 'Forbidden' })).status, 403);

    const patient = await request(base, 'POST', '/modules/patient-info', superuser.token, { student_id: studentB, file_no: `M6-${stamp}` });
    assert.equal(patient.status, 201);
    const patientId = dataId(patient, 'patient_info');
    clinicalIds.PATIENT_INFO!.push(patientId);
    assert.equal((await request(base, 'PUT', `/modules/patient-info/${patientId}`, superuser.token, { file_no: `M6-${stamp}-C` })).status, 200);
    assert.equal((await request(base, 'GET', `/modules/patient-info/student/${studentB}`, superuser.token)).status, 200);

    const oral = await request(base, 'POST', '/modules/oral-health', superuser.token, {
        student_id: studentB, date_examined: '2026-10-01', service_location: 'FACILITY',
        visit_type: '1ST VISIT', has_oral_screening: true, consent_given: true,
    });
    assert.equal(oral.status, 201);
    const oralId = dataId(oral); clinicalIds.ORAL_HEALTH!.push(oralId);
    assert.equal((await request(base, 'PUT', `/modules/oral-health/${oralId}`, superuser.token, { has_oral_prophylaxis: true })).status, 200);
    assert.equal((await request(base, 'GET', `/modules/oral-health/student/${studentB}`, superuser.token)).status, 200);

    const deworming = await request(base, 'POST', '/modules/deworming', superuser.token, {
        student_id: studentB, date_dewormed: '2026-10-01', school_id: schoolIds[1],
        medication_given: 'Albendazole 400mg', is_dewormed: true, school_type: 'public', in_school: true,
    });
    assert.equal(deworming.status, 201);
    const dewormingId = dataId(deworming); clinicalIds.DEWORMING!.push(dewormingId);
    assert.equal((await request(base, 'PUT', `/modules/deworming/${dewormingId}`, superuser.token, { remarks: 'Corrected' })).status, 200);
    assert.equal((await request(base, 'GET', `/modules/deworming/student/${studentB}`, superuser.token)).status, 200);

    const immunization = await request(base, 'POST', '/modules/immunization', superuser.token, {
        student_id: studentB, immunization_date: '2026-10-01', school_id: schoolIds[1],
        vaccine_td1: true, consent_given: true, is_refused: false, is_deferred: false,
    });
    assert.equal(immunization.status, 201);
    const immunizationId = dataId(immunization); clinicalIds.IMMUNIZATION!.push(immunizationId);
    assert.equal((await request(base, 'PUT', `/modules/immunization/${immunizationId}`, superuser.token, { vaccine_mr1: true })).status, 200);
    assert.equal((await request(base, 'GET', `/modules/immunization/student/${studentB}`, superuser.token)).status, 200);

    const vitalSigns = await request(base, 'POST', '/modules/vital-signs', superuser.token, {
        student_id: studentB, date_checked: '2026-10-01', blood_pressure_systolic: 110,
        blood_pressure_diastolic: 70, heart_rate: 75, respiratory_rate: 18,
        temperature: 36.6, weight_kg: 35, height_cm: 140,
    });
    assert.equal(vitalSigns.status, 201);
    const vitalSignsId = dataId(vitalSigns); clinicalIds.VITAL_SIGNS!.push(vitalSignsId);
    assert.equal((await request(base, 'PUT', `/modules/vital-signs/${vitalSignsId}`, superuser.token, { temperature: 36.8 })).status, 200);
    assert.equal((await request(base, 'GET', `/modules/vital-signs/student/${studentB}`, superuser.token)).status, 200);

    assert.equal((await request(base, 'GET', `/modules/oral-health/student/${studentB}`, limitedSuperuser.token)).status, 403);
    assert.equal((await request(base, 'POST', '/modules/oral-health', limitedSuperuser.token, { student_id: studentB, date_examined: '2026-10-02' })).status, 403);
    assert.equal((await request(base, 'GET', `/modules/oral-health/student/${studentB}`, staff.token)).status, 403);
    assert.equal((await request(base, 'POST', '/modules/oral-health', staff.token, { student_id: studentB, date_examined: '2026-10-02' })).status, 403);
    assert.equal((await request(base, 'PUT', `/modules/oral-health/${oralId}`, staff.token, { has_oral_prophylaxis: false })).status, 403);

    const audits = await pool.query<{ action: string; details: string }>(`
        SELECT action, COALESCE(details::text, '') AS details
        FROM AUDIT_EVENTS WHERE actor_id = $1
    `, [superuser.id]);
    const actions = new Set(audits.rows.map(row => row.action));
    for (const action of [
        'CREATE_STUDENT', 'UPDATE_STUDENT', 'PATIENT_INFO_CREATED', 'PATIENT_INFO_UPDATED',
        'ORAL_HEALTH_CREATED', 'ORAL_HEALTH_UPDATED', 'DEWORMING_RECORD_CREATED',
        'DEWORMING_RECORD_UPDATED', 'IMMUNIZATION_CREATED', 'IMMUNIZATION_UPDATED',
        'VITAL_SIGNS_CREATED', 'VITAL_SIGNS_UPDATED',
    ]) assert.ok(actions.has(action), `${action} audit event should exist`);
    for (const row of audits.rows) {
        assert.doesNotMatch(row.details, /student_lrn|first_name|last_name|contact_no|mobile|remarks.*Corrected|clinical_payload/i);
    }

    console.log('Phase 3 Milestone 6 province-wide superuser management checks passed.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
    for (const [table, ids] of Object.entries(clinicalIds)) {
        if (ids.length) await pool.query(`DELETE FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
    }
    if (studentIds.length) await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1::int[])', [studentIds]);
    if (userIds.length) {
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    for (const [moduleId, isActive] of moduleStates) {
        await pool.query('UPDATE MODULES SET is_active = $1 WHERE id = $2', [isActive, moduleId]);
    }
    if (schoolIds.length) await pool.query('DELETE FROM SCHOOLS WHERE id = ANY($1::int[])', [schoolIds]);
    if (barangayId) await pool.query('DELETE FROM BARANGAYS WHERE id = $1', [barangayId]);
    if (municipalityId) await pool.query('DELETE FROM MUNICIPALITIES WHERE id = $1', [municipalityId]);
    const residual = await pool.query<{ users: number; students: number; schools: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM USERS WHERE id = ANY($1::int[])) AS users,
            (SELECT COUNT(*)::int FROM STUDENTS WHERE id = ANY($2::int[])) AS students,
            (SELECT COUNT(*)::int FROM SCHOOLS WHERE id = ANY($3::int[])) AS schools
    `, [userIds, studentIds, schoolIds]);
    assert.deepEqual(residual.rows[0], { users: 0, students: 0, schools: 0 });
    await pool.end();
}
