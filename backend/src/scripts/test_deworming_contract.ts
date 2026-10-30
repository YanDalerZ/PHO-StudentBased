import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import { app } from '../index.js';
import { calculateAgeGroup } from '../controllers/DewormingController.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const cleanupStamp = process.argv[2] === '--cleanup-stamp' ? process.argv[3] : undefined;
if (cleanupStamp) {
    if (!/^\d{13}$/.test(cleanupStamp)) throw new Error('A 13-digit fixture stamp is required for cleanup.');
    try {
        const oldUsers = await pool.query<{ id: number; portal_role: string }>(
            'SELECT id, portal_role FROM USERS WHERE email = ANY($1::text[])',
            [['admin', 'school_staff', 'superuser'].map(role => `deworming_qa_${role}_${cleanupStamp}@pho.test`)]);
        const ids = oldUsers.rows.map(row => row.id);
        const qaSchool = await pool.query<{ id: number; barangay_id: number }>(
            'SELECT id, barangay_id FROM SCHOOLS WHERE name = $1', [`Deworming QA School ${cleanupStamp}`]);
        const qaMunicipality = await pool.query<{ id: number }>(
            'SELECT id FROM MUNICIPALITIES WHERE name = $1', [`Deworming QA ${cleanupStamp}`]);
        if (ids.length && qaSchool.rows[0]) {
            const school = qaSchool.rows[0];
            await pool.query('DELETE FROM DEWORMING WHERE recorded_by = ANY($1::int[]) AND school_id = $2', [ids, school.id]);
            await pool.query('DELETE FROM STUDENTS WHERE registered_by = ANY($1::int[]) AND school_id = $2', [ids, school.id]);
        }
        if (ids.length) {
            await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [ids]);
            await pool.query('DELETE FROM PORTAL_SESSIONS WHERE user_id = ANY($1::int[])', [ids]);
            await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [ids]);
            await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [ids]);
            await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [ids]);
        }
        if (qaSchool.rows[0]) {
            await pool.query('DELETE FROM SCHOOLS WHERE id = $1', [qaSchool.rows[0].id]);
            await pool.query('DELETE FROM BARANGAYS WHERE id = $1', [qaSchool.rows[0].barangay_id]);
        }
        if (qaMunicipality.rows[0]) await pool.query('DELETE FROM MUNICIPALITIES WHERE id = $1', [qaMunicipality.rows[0].id]);
        console.log(`Cleaned local Deworming QA fixture ${cleanupStamp}.`);
    } finally { await pool.end(); }
    process.exit(0);
}
const stamp = Date.now();
const browserMode = process.argv.includes('--browser');
const users: number[] = [];
const students: number[] = [];
const records: number[] = [];
let municipalityId: number | undefined;
let barangayId: number | undefined;
let schoolId: number | undefined;
let server: ReturnType<typeof app.listen> | undefined;
let originalModuleActive: boolean | undefined;
let moduleId: number | undefined;

type ApiResult = { status: number; body: Record<string, unknown> };
async function request(base: string, method: string, route: string, token?: string, payload?: unknown): Promise<ApiResult> {
    const response = await fetch(`${base}${route}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
}
function data(result: ApiResult): Record<string, unknown> {
    return result.body.data as Record<string, unknown>;
}
function expectStatus(result: ApiResult, status: number, label: string): void {
    assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`);
}

try {
    for (const [age, expected] of [[4, ''], [5, '5-14'], [14, '5-14'],
        [15, '15-19'], [19, '15-19'], [20, '20+']] as const) {
        assert.equal(calculateAgeGroup(`${2026 - age}-01-01`, '2026-01-01'), expected);
    }
    assert.equal(calculateAgeGroup('2012-01-02', '2026-01-01'), '5-14', 'day before 14th birthday');
    assert.equal(calculateAgeGroup('2011-01-02', '2026-01-01'), '5-14', 'day before 15th birthday');

    const province = await pool.query<{ id: number }>('SELECT id FROM PROVINCES ORDER BY id LIMIT 1');
    assert.ok(province.rows[0]?.id, 'Local fixture requires a province');
    const municipality = await pool.query<{ id: number }>(
        'INSERT INTO MUNICIPALITIES (name, province_id) VALUES ($1, $2) RETURNING id',
        [`Deworming QA ${stamp}`, province.rows[0]!.id]);
    municipalityId = municipality.rows[0]!.id;
    const barangay = await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`Deworming QA ${stamp}`, municipalityId]);
    barangayId = barangay.rows[0]!.id;
    const school = await pool.query<{ id: number }>(
        'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
        [`Deworming QA School ${stamp}`, barangayId]);
    schoolId = school.rows[0]!.id;

    const module = await pool.query<{ id: number; is_active: boolean }>(
        "SELECT id, is_active FROM MODULES WHERE slug = 'deworming'");
    assert.ok(module.rows[0]?.id);
    moduleId = module.rows[0]!.id;
    originalModuleActive = module.rows[0]!.is_active;
    if (!originalModuleActive) await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [moduleId]);

    const hash = await bcrypt.hash('local-deworming-test-password', 8);
    const emails = new Map<string, string>();
    for (const role of ['admin', 'school_staff', 'superuser'] as const) {
        const email = `deworming_qa_${role}_${stamp}@pho.test`;
        emails.set(role, email);
        const result = await pool.query<{ id: number }>(`
            INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
            VALUES ($1, $2, $3, $4, 'QA Fixture', 'Deworming', 'Tester', TRUE) RETURNING id`,
        [email, hash, role === 'school_staff' ? 'teacher' : role, role]);
        users.push(result.rows[0]!.id);
    }
    const [adminId, staffId, superId] = users as [number, number, number];
    await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)',
        [staffId, schoolId, adminId]);
    for (const userId of [staffId, superId]) {
        await pool.query(`INSERT INTO USER_MODULE_PERMISSIONS
            (user_id, module_id, can_view, can_create, can_edit, can_report, can_export, granted_by)
            VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, $3)`, [userId, moduleId, adminId]);
    }

    server = app.listen(browserMode ? 3000 : 0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve);
        server!.once('error', reject);
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    async function login(role: string): Promise<string> {
        const result = await request(base, 'POST', '/auth/login', undefined,
            { email: emails.get(role), password: 'local-deworming-test-password' });
        expectStatus(result, 200, `${role} login`);
        return String(result.body.token);
    }
    const teacher = await login('school_staff');
    const superuser = await login('superuser');
    const admin = await login('admin');

    async function student(age: number): Promise<number> {
        const result = await pool.query<{ id: number }>(`
            INSERT INTO STUDENTS (student_lrn, first_name, last_name, sex, date_of_birth,
                school_id, municipality_id, barangay_id, registered_by)
            VALUES ($1, 'Synthetic', 'Deworming', 'Female', $2::date, $3, $4, $5, $6) RETURNING id`,
        [`${String(stamp).slice(-10)}${String(age).padStart(2, '0')}`, `${2026 - age}-01-01`, schoolId,
            municipalityId, barangayId, superId]);
        const id = result.rows[0]!.id;
        students.push(id);
        return id;
    }
    const ids = new Map<number, number>();
    for (const age of [4, 5, 14, 15, 19, 20]) ids.set(age, await student(age));

    const context = await request(base, 'GET', `/students/${ids.get(5)}/module-context?module=deworming`, teacher);
    expectStatus(context, 200, 'teacher canonical context');
    assert.equal(Number(data(context).id), ids.get(5));
    expectStatus(await request(base, 'GET', `/students/${ids.get(5)}/module-context?module=deworming`, superuser),
        200, 'superuser canonical context');
    expectStatus(await request(base, 'GET', `/students/${ids.get(5)}/module-context?module=deworming`, admin),
        403, 'admin clinical denial');

    const payload = (studentId: number, medication: string | null = 'Albendazole 400mg') => ({
        student_id: studentId, date_dewormed: '2026-01-01', is_dewormed: true,
        medication_given: medication, school_id: schoolId,
    });
    for (const [age, group] of [[5, '5-14'], [14, '5-14'], [15, '15-19'],
        [19, '15-19'], [20, '20+']] as const) {
        const result = await request(base, 'POST', '/modules/deworming', age % 2 ? teacher : superuser,
            payload(ids.get(age)!));
        expectStatus(result, 201, `create at age ${age}`);
        assert.equal(data(result).age_group, group);
        assert.equal(data(result).date_dewormed, '2026-01-01', 'birthday date must not shift');
        assert.equal(data(result).school_type, 'public');
        records.push(Number(data(result).id));
    }
    const underFive = await request(base, 'POST', '/modules/deworming', teacher,
        { ...payload(ids.get(4)!), age_group: '5-14' });
    expectStatus(underFive, 400, 'under-five cannot override age group');
    assert.match(String(underFive.body.message), /at least 5/);
    for (const [label, changes] of [
        ['missing medication for Yes', { medication_given: null }],
        ['unsupported medication', { medication_given: 'Albendazole' }],
        ['old age group', { age_group: '5-9' }],
        ['Private on create', { school_type: 'private' }],
        ['medication when No', { is_dewormed: false }],
    ] as const) {
        expectStatus(await request(base, 'POST', '/modules/deworming', teacher,
            { ...payload(ids.get(5)!), ...changes }), 400, label);
    }
    const noTreatment = await request(base, 'POST', '/modules/deworming', teacher,
        { ...payload(ids.get(5)!, null), is_dewormed: false });
    expectStatus(noTreatment, 201, 'No with blank medication');
    assert.equal(data(noTreatment).medication_given, '');
    records.push(Number(data(noTreatment).id));

    const teacherEdit = await request(base, 'PUT', `/modules/deworming/${records[0]}`, teacher,
        { medication_given: 'Mebendazole 500mg', remarks: 'Teacher correction' });
    expectStatus(teacherEdit, 200, 'teacher edit');
    assert.equal(data(teacherEdit).medication_given, 'Mebendazole 500mg');
    expectStatus(await request(base, 'PUT', `/modules/deworming/${records[0]}`, teacher,
        { is_dewormed: false }), 400, 'No requires clearing existing medication');
    const clearMedication = await request(base, 'PUT', `/modules/deworming/${records[0]}`, teacher,
        { is_dewormed: false, medication_given: null });
    expectStatus(clearMedication, 200, 'teacher No correction');
    assert.equal(data(clearMedication).medication_given, '');
    expectStatus(await request(base, 'PUT', `/modules/deworming/${records[0]}`, teacher,
        { is_dewormed: true }), 400, 'Yes requires medication after No');

    const superEdit = await request(base, 'PUT', `/modules/deworming/${records[2]}`, superuser,
        { medication_given: 'Mebendazole 500mg' });
    expectStatus(superEdit, 200, 'superuser edit');
    const movedDate = await request(base, 'PUT', `/modules/deworming/${records[1]}`, superuser,
        { date_dewormed: '2027-01-01' });
    expectStatus(movedDate, 200, 'recalculate after changing record date');
    assert.equal(data(movedDate).age_group, '15-19');
    const restoredDate = await request(base, 'PUT', `/modules/deworming/${records[1]}`, superuser,
        { date_dewormed: '2026-01-01' });
    expectStatus(restoredDate, 200, 'recalculate after restoring record date');
    assert.equal(data(restoredDate).age_group, '5-14');

    const legacy = await pool.query<{ id: number }>(`
        INSERT INTO DEWORMING (student_id, school_id, date_dewormed, age_group,
            medication_given, is_dewormed, school_type, recorded_by)
        VALUES ($1, $2, '2026-01-01', '5-9', 'Albendazole 400mg', TRUE, 'private', $3)
        RETURNING id`, [ids.get(5), schoolId, superId]);
    const legacyId = legacy.rows[0]!.id;
    records.push(legacyId);
    const preserved = await request(base, 'PUT', `/modules/deworming/${legacyId}`, superuser,
        { remarks: 'Historical classification preserved' });
    expectStatus(preserved, 200, 'legacy partial edit');
    assert.equal(data(preserved).school_type, 'private');
    assert.equal(data(preserved).age_group, '5-9');
    expectStatus(await request(base, 'PUT', `/modules/deworming/${legacyId}`, superuser,
        { school_type: 'private' }), 400, 'explicit Private update denied');
    const converted = await request(base, 'PUT', `/modules/deworming/${legacyId}`, superuser,
        { school_type: 'public', age_group: '5-14' });
    expectStatus(converted, 200, 'explicit legacy conversion');
    assert.equal(data(converted).school_type, 'public');
    assert.equal(data(converted).age_group, '5-14');

    const oldMedication = await pool.query<{ id: number }>(`
        INSERT INTO DEWORMING (student_id, school_id, date_dewormed, age_group,
            medication_given, is_dewormed, school_type, recorded_by)
        VALUES ($1, $2, '2026-01-01', '15-19', 'Albendazole', TRUE, 'public', $3)
        RETURNING id`, [ids.get(19), schoolId, superId]);
    records.push(oldMedication.rows[0]!.id);
    expectStatus(await request(base, 'PUT', `/modules/deworming/${oldMedication.rows[0]!.id}`, superuser,
        { remarks: 'Attempt without correcting old medication' }), 400, 'legacy medication requires approved replacement');
    expectStatus(await request(base, 'PUT', `/modules/deworming/${oldMedication.rows[0]!.id}`, superuser,
        { medication_given: 'Albendazole 400mg' }), 200, 'replace historical free-text medication');

    const historical = await pool.query<{ id: number }>(`
        INSERT INTO DEWORMING (student_id, school_id, date_dewormed, age_group,
            medication_given, is_dewormed, school_type, recorded_by)
        VALUES ($1, $2, '2026-01-01', '10-14', 'Mebendazole 500mg', TRUE, 'private', $3)
        RETURNING id`, [ids.get(14), schoolId, superId]);
    records.push(historical.rows[0]!.id);
    const historicalUnderFive = await pool.query<{ id: number }>(`
        INSERT INTO DEWORMING (student_id, school_id, date_dewormed, age_group,
            medication_given, is_dewormed, school_type, recorded_by)
        VALUES ($1, $2, '2026-01-01', '1-4', 'Albendazole 400mg', TRUE, 'public', $3)
        RETURNING id`, [ids.get(4), schoolId, superId]);
    records.push(historicalUnderFive.rows[0]!.id);
    const historicalView = await request(base, 'GET', `/modules/deworming/student/${ids.get(4)}`, teacher);
    expectStatus(historicalView, 200, 'historical under-five remains viewable');
    expectStatus(await request(base, 'PUT', `/modules/deworming/${historicalUnderFive.rows[0]!.id}`, teacher,
        { remarks: 'Attempt to edit under-five record' }), 400, 'under-five legacy edit denied');

    const dashboard = await request(base, 'GET',
        `/modules/deworming/dashboard?school_id=${schoolId}&date_from=2026-01-01&date_to=2026-01-31`, superuser);
    expectStatus(dashboard, 200, 'superuser dashboard');
    const distribution = data(dashboard).deworming_by_age_group as Array<{ age_group: string }>;
    assert.ok(distribution.some(row => row.age_group === '5-14'));
    assert.ok(distribution.some(row => row.age_group === '15-19'));
    assert.ok(distribution.some(row => row.age_group === '20+'));
    assert.ok(distribution.some(row => row.age_group === 'Historical under 5'));
    assert.ok(!distribution.some(row => row.age_group === '5-9'));
    assert.ok(!distribution.some(row => row.age_group === '10-14'));
    const report = await request(base, 'GET', `/reports/deworming?period=2026-01&school_id=${schoolId}`, superuser);
    expectStatus(report, 200, 'deworming municipality report');
    const reportColumns = data(report).columns as Array<{ key: string; label: string }>;
    assert.ok(reportColumns.some(column => column.key === 'age_5_14' && column.label === 'Age 5–14'));
    assert.ok(reportColumns.some(column => column.key === 'age_15_19'));
    assert.ok(reportColumns.some(column => column.key === 'age_20_plus'));
    assert.ok(!reportColumns.some(column => column.key === 'age_5_9' || column.key === 'age_10_14'));
    const masterlist = await request(base, 'GET', `/reports/deworming/masterlist?period=2026-01&school_id=${schoolId}`, superuser);
    expectStatus(masterlist, 200, 'deworming masterlist');
    const masterlistRows = data(masterlist).rows as Array<{ age_group: string }>;
    assert.ok(masterlistRows.some(row => row.age_group === '10-14 (historical)'));
    assert.ok(masterlistRows.some(row => row.age_group === '1-4 (historical)'));
    console.log('Deworming create/edit, medication, ages 4/5/14/15/19/20, roles, legacy Private, dashboard and reports passed.');
    if (browserMode) {
        console.log(`Browser fixture: http://127.0.0.1:5173/teacher/students/${ids.get(14)}/deworming`);
        console.log(`Superuser fixture: http://127.0.0.1:5173/superuser/students/${ids.get(14)}/deworming`);
        console.log(`Under-five fixture: http://127.0.0.1:5173/teacher/students/${ids.get(4)}/deworming`);
        console.log(`Local QA accounts: ${emails.get('school_staff')} and ${emails.get('superuser')}; password: local-deworming-test-password`);
        console.log('Press Enter to clean all synthetic browser fixtures and stop the local API.');
        await new Promise<void>(resolve => {
            process.stdin.resume();
            const timeout = setTimeout(resolve, 180_000);
            timeout.unref();
            process.stdin.once('data', () => { clearTimeout(timeout); process.stdin.pause(); resolve(); });
        });
    }
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (records.length) await pool.query('DELETE FROM DEWORMING WHERE id = ANY($1::int[])', [records]);
    if (students.length) await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1::int[])', [students]);
    if (users.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM PORTAL_SESSIONS WHERE user_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [users]);
    }
    if (moduleId && originalModuleActive !== undefined) await pool.query('UPDATE MODULES SET is_active = $1 WHERE id = $2',
        [originalModuleActive, moduleId]);
    if (schoolId) await pool.query('DELETE FROM SCHOOLS WHERE id = $1', [schoolId]);
    if (barangayId) await pool.query('DELETE FROM BARANGAYS WHERE id = $1', [barangayId]);
    if (municipalityId) await pool.query('DELETE FROM MUNICIPALITIES WHERE id = $1', [municipalityId]);
    await pool.end();
}
