import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { inflateRawSync } from 'node:zlib';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import pool from '../database/db.js';
import { app } from '../index.js';
import type { ModuleSlug, PortalRole } from '../types/auth.types.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required for local reporting integration tests.');
const stamp = Date.now();
const formulaLrn = `=PHO_FORMULA_${stamp}`;
const modules: ModuleSlug[] = ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'];
let server: ReturnType<typeof app.listen> | undefined;
type Actor = { id: number; token: string };

async function actor(role: PortalRole, label: string): Promise<Actor> {
    const email = `redesign_${label}_${stamp}@pho.test`;
    const result = await pool.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', $2, $3, 'QA Fixture', 'Report', 'QA', TRUE) RETURNING id
    `, [email, role === 'school_staff' ? 'teacher' : role, role]);
    const id = result.rows[0]!.id;
    const sid = randomUUID();
    await pool.query('INSERT INTO PORTAL_SESSIONS (id, user_id) VALUES ($1, $2)', [sid, id]);
    return { id, token: jwt.sign({ id, sid, email, portal_role: role }, secret!, { expiresIn: '20m' }) };
}
async function request(base: string, route: string, user?: Actor, body?: unknown): Promise<Response> {
    return fetch(`${base}/api/v1${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
function zipEntry(zip: Buffer, name: string): string {
    let offset = 0;
    while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
        const compressed = zip.readUInt32LE(offset + 18);
        const nameLength = zip.readUInt16LE(offset + 26);
        const extraLength = zip.readUInt16LE(offset + 28);
        const fileName = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
        const start = offset + 30 + nameLength + extraLength;
        if (fileName === name) return inflateRawSync(zip.subarray(start, start + compressed)).toString('utf8');
        offset = start + compressed;
    }
    throw new Error(`XLSX entry ${name} was not found.`);
}
async function document(base: string, module: ModuleSlug, view: 'municipality' | 'masterlist',
    user: Actor, query: string) {
    const response = await request(base, `/reports/${module}${view === 'masterlist' ? '/masterlist' : ''}${query}`, user);
    if (response.status !== 200) throw new Error(`${module} ${view}: ${response.status} ${await response.text()}`);
    return (await response.json() as { data: { columns: Array<{ key: string; label: string }>;
        rows: Array<Record<string, unknown>>; empty: boolean; total_students: number | null } }).data;
}

try {
    const municipality = await pool.query<{ id: number }>(`
        INSERT INTO MUNICIPALITIES (name, province_id)
        SELECT $1, id FROM PROVINCES ORDER BY id LIMIT 1 RETURNING id
    `, [`Report QA Municipality ${stamp}`]);
    const municipalityId = municipality.rows[0]!.id;
    const barangay = await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`Report QA Barangay ${stamp}`, municipalityId]);
    const barangayId = barangay.rows[0]!.id;
    const schoolIds: number[] = [];
    for (const name of ['Assigned', 'Outside']) {
        const row = await pool.query<{ id: number }>(
            'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
            [`Report QA ${name} ${stamp}`, barangayId]);
        schoolIds.push(row.rows[0]!.id);
    }
    const admin = await actor('admin', 'admin');
    const staff = await actor('school_staff', 'staff');
    const exportOnly = await actor('school_staff', 'export_only');
    const denied = await actor('school_staff', 'denied');
    const superuser = await actor('superuser', 'superuser');
    for (const user of [staff, exportOnly, denied]) {
        await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)',
            [user.id, schoolIds[0], admin.id]);
    }
    for (const module of modules) {
        const moduleId = (await pool.query<{ id: number }>('SELECT id FROM MODULES WHERE slug = $1', [module])).rows[0]!.id;
        for (const [user, report, exportGrant, target, createGrant] of [
            [staff, true, true, true, true], [exportOnly, false, true, false, false],
            [denied, false, false, false, false], [superuser, true, true, false, false],
        ] as const) {
            await pool.query(`INSERT INTO USER_MODULE_PERMISSIONS
                (user_id, module_id, can_view, can_create, can_report, can_export, can_manage_targets, granted_by)
                VALUES ($1, $2, TRUE, $3, $4, $5, $6, $7)`,
            [user.id, moduleId, createGrant, report, exportGrant, target, admin.id]);
        }
    }
    const studentIds: number[] = [];
    for (const [schoolIndex, schoolId] of schoolIds.entries()) {
        for (let index = 0; index < 6; index += 1) {
            const lrn = index === 0 && schoolIndex === 0 ? formulaLrn : `QA-${stamp}-${schoolIndex}-${index}`;
            const result = await pool.query<{ id: number }>(`
                INSERT INTO STUDENTS (first_name, last_name, sex, date_of_birth, student_lrn,
                    school_id, grade_level, section, registered_by, municipality_id, barangay_id)
                VALUES ($1, $2, 'Male', '2014-03-04', $3, $4, 'Grade 4', 'A', $5, $6, $7)
                RETURNING id
            `, [index === 0 ? '+Formula' : 'Student', `QA-${schoolIndex}-${index}`, lrn,
                schoolId, admin.id, municipalityId, barangayId]);
            const id = result.rows[0]!.id;
            studentIds.push(id);
            await pool.query("INSERT INTO PATIENT_INFO (student_id, recorded_by, created_at) VALUES ($1, $2, '2026-08-10')", [id, admin.id]);
            await pool.query(`INSERT INTO ORAL_HEALTH (student_id, date_examined, is_rpoc_complete,
                has_oral_screening, total_dmft, total_dmft_primary, recorded_by)
                VALUES ($1, '2026-08-11', TRUE, TRUE, 2, 1, $2)`, [id, admin.id]);
            await pool.query(`INSERT INTO DEWORMING (student_id, date_dewormed, age_group, medication_given,
                is_dewormed, school_type, in_school, school_id, recorded_by)
                VALUES ($1, '2026-08-12', '10-14', 'Albendazole', TRUE, 'public', TRUE, $2, $3)`,
            [id, schoolId, admin.id]);
            await pool.query(`INSERT INTO IMMUNIZATION (student_id, immunization_date, vaccine_td1,
                lot_batch_td1, lot_batch_no, consent_given, school_id, recorded_by)
                VALUES ($1, '2026-08-13', TRUE, $2, $3, $4, $5, $6)`,
            [id, index === 0 && schoolIndex === 0 ? null : 'TD-LOT-2026',
                index === 0 && schoolIndex === 0 ? 'HISTORICAL-SHARED' : null,
                index === 0 && schoolIndex === 0 ? null : true, schoolId, admin.id]);
            await pool.query(`INSERT INTO VITAL_SIGNS (student_id, date_checked, blood_pressure_systolic,
                blood_pressure_diastolic, heart_rate, respiratory_rate, temperature, weight_kg,
                height_cm, bmi, recorded_by)
                VALUES ($1, '2026-08-14', 110, 70, 80, 18, 36.8, 35, 140, 17.86, $2)`, [id, admin.id]);
        }
    }
    const first = studentIds[0]!;
    await pool.query("INSERT INTO PATIENT_INFO (student_id, recorded_by, created_at) VALUES ($1, $2, '2026-08-20')", [first, admin.id]);
    await pool.query(`INSERT INTO ORAL_HEALTH (student_id, date_examined, is_rpoc_complete,
        has_oral_screening, total_dmft, total_dmft_primary, recorded_by)
        VALUES ($1, '2026-08-20', TRUE, TRUE, 4, 2, $2)`, [first, admin.id]);
    await pool.query(`INSERT INTO DEWORMING (student_id, date_dewormed, age_group, medication_given,
        is_dewormed, school_type, in_school, school_id, recorded_by)
        VALUES ($1, '2026-08-20', '10-14', NULL, FALSE, 'public', TRUE, $2, $3)`,
    [first, schoolIds[0], admin.id]);
    await pool.query(`INSERT INTO VITAL_SIGNS (student_id, date_checked, blood_pressure_systolic,
        blood_pressure_diastolic, heart_rate, respiratory_rate, temperature, weight_kg,
        height_cm, bmi, recorded_by)
        VALUES ($1, '2026-08-20', 120, 75, 81, 18, 36.9, 35, 140, 17.86, $2)`, [first, admin.id]);

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server!.once('listening', resolve); server!.once('error', reject); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const query = `?period=2026-08&municipality_id=${municipalityId}`;
    const staffQuery = `${query}&school_id=${schoolIds[0]}`;
    assert.equal((await request(base, `/reports/patient-info${query}`)).status, 401);
    assert.equal((await request(base, `/reports/patient-info${query}`, exportOnly)).status, 403);
    assert.equal((await request(base, `/reports/patient-info/masterlist${query}`, denied)).status, 403);
    assert.equal((await request(base, `/reports/patient-info/masterlist${query}&school_id=${schoolIds[1]}`, exportOnly)).status, 403);
    assert.equal((await request(base, `/reports/patient-info/masterlist${staffQuery}`, exportOnly)).status, 200);

    const period = { period: '2026-08' };
    for (const module of modules.filter(item => item !== 'immunization')) {
        const indicator = module === 'patient-info' ? 'registrations' : module === 'oral-health'
            ? 'examined_students' : module === 'deworming' ? 'eligible_students' : 'screened_students';
        const target = { ...period, school_id: schoolIds[0], indicator, target_count: 10,
            source_note: 'Local QA school target source' };
        assert.equal((await request(base, `/report-targets/${module}`, staff, target)).status, 201);
        assert.equal((await request(base, `/report-targets/${module}`, staff,
            { ...target, school_id: schoolIds[1] })).status, 403);
        const incomplete = await document(base, module, 'municipality', superuser, query);
        assert.equal(incomplete.rows[0]?.percentage, null, `${module} incomplete target`);
        assert.equal(incomplete.rows[0]?.target, null, `${module} missing target`);
        assert.equal((await request(base, `/report-targets/${module}`, admin,
            { ...target, school_id: schoolIds[1] })).status, 201);
        const complete = await document(base, module, 'municipality', superuser, query);
        assert.equal(complete.rows[0]?.accomplished, 12, `${module} municipality distinct numerator`);
        assert.equal(complete.rows[0]?.target, 20, `${module} target total`);
        assert.equal(complete.rows[0]?.percentage, 60, `${module} percentage`);
        assert.equal(complete.rows[1]?.accomplished, 12, `${module} province total`);
        const staffSummary = await document(base, module, 'municipality', staff, staffQuery);
        assert.equal(staffSummary.rows[0]?.accomplished, 6, `${module} assigned-school numerator`);
        assert.equal(staffSummary.rows[0]?.percentage, 60, `${module} assigned-school percentage`);
        const source = module === 'patient-info' ? 'PATIENT_INFO' : module === 'oral-health'
            ? 'ORAL_HEALTH' : module === 'deworming' ? 'DEWORMING' : 'VITAL_SIGNS';
        const date = module === 'patient-info' ? 'created_at' : module === 'oral-health'
            ? 'date_examined' : module === 'deworming' ? 'date_dewormed' : 'date_checked';
        const direct = await pool.query<{ count: number }>(`
            SELECT COUNT(DISTINCT r.student_id)::int AS count FROM ${source} r
            JOIN STUDENTS s ON s.id = r.student_id
            WHERE s.school_id = $1 AND r.${date}::date BETWEEN '2026-08-01' AND '2026-08-31'
            ${module === 'deworming' ? 'AND r.is_dewormed = TRUE' : ''}
        `, [schoolIds[0]]);
        assert.equal(staffSummary.rows[0]?.accomplished, direct.rows[0]?.count, `${module} SQL reconciliation`);
    }
    for (const indicator of ['mr_td_grade1', 'mr_td_grade7', 'hpv_grade4_female']) {
        for (const schoolId of schoolIds) {
            assert.equal((await request(base, '/report-targets/immunization', admin,
                { ...period, school_id: schoolId, indicator, target_count: 10,
                    source_note: 'Local QA cohort source' })).status, 201);
        }
    }
    const immun = await document(base, 'immunization', 'municipality', superuser, query);
    assert.equal(immun.rows[0]?.accomplished, 12);
    assert.equal(immun.rows[0]?.td1, 12);
    assert.equal(immun.rows[0]?.doses, 12);
    assert.equal(immun.rows[0]?.mr_td_grade1, 20);
    assert.equal(immun.rows[0]?.percentage, null);
    const immunSql = await pool.query<{ count: number }>(`
        SELECT COUNT(DISTINCT imm.student_id)::int AS count FROM IMMUNIZATION imm
        JOIN STUDENTS s ON s.id = imm.student_id
        WHERE s.school_id = ANY($1::int[]) AND imm.immunization_date BETWEEN '2026-08-01' AND '2026-08-31'
          AND imm.vaccine_td1 = TRUE
    `, [schoolIds]);
    assert.equal(immun.rows[0]?.accomplished, immunSql.rows[0]?.count);

    for (const module of modules) {
        const summary = await document(base, module, 'municipality', superuser, query);
        const masterlist = await document(base, module, 'masterlist', superuser, query);
        assert.equal(summary.rows.length, 2);
        assert.equal(masterlist.rows.length, 12, `${module} latest row per student`);
        assert.equal(masterlist.rows[0]?.row_no, 1);
        assert.ok(masterlist.columns.some(column => column.key === 'section'));
        assert.ok(masterlist.columns.some(column => column.key === 'school'));
        const filtered = await document(base, module, 'masterlist', staff, staffQuery);
        assert.equal(filtered.rows.length, 6, `${module} staff masterlist scope`);
        for (const view of ['municipality', 'masterlist'] as const) {
            const targetDocument = view === 'municipality' ? summary : masterlist;
            const printRoute = `/reports/${module}${view === 'masterlist' ? '/masterlist' : ''}/print-events`;
            assert.equal((await request(base, printRoute, superuser, { ...period, municipality_id: municipalityId, view })).status, 201);
            for (const format of ['csv', 'xlsx'] as const) {
                const response = await request(base, `/reports/${module}/exports`, superuser,
                    { format, view, filters: { ...period, municipality_id: municipalityId } });
                assert.equal(response.status, 200, `${module} ${view} ${format}`);
                const file = Buffer.from(await response.arrayBuffer());
                if (format === 'csv') {
                    const lines = file.toString('utf8').replace(/^\ufeff/, '').trimEnd().split('\r\n');
                    assert.equal(lines.length - 9, targetDocument.rows.length, `${module} ${view} CSV row parity`);
                    assert.ok(lines[8]?.includes(targetDocument.columns[0]!.label), `${module} CSV column parity`);
                    if (view === 'masterlist') assert.match(file.toString('utf8'), /'=PHO_FORMULA/);
                } else {
                    const sheet = zipEntry(file, 'xl/worksheets/sheet1.xml');
                    assert.equal((sheet.match(/<row r="\d+">/g) ?? []).length - 9,
                        targetDocument.rows.length, `${module} ${view} XLSX row parity`);
                    assert.ok(sheet.includes(targetDocument.columns[0]!.label));
                    if (view === 'masterlist') assert.match(sheet, /&apos;=PHO_FORMULA/);
                }
            }
        }
        console.log(`${module}: SQL/preview totals, latest masterlist, scope, print audit, CSV and XLSX PASS`);
    }
    const oral = await document(base, 'oral-health', 'masterlist', staff, staffQuery);
    assert.equal(oral.rows.find(row => row.lrn === formulaLrn)?.permanent_dmft, 4);
    const deworming = await document(base, 'deworming', 'masterlist', staff, staffQuery);
    assert.equal(deworming.rows.find(row => row.lrn === formulaLrn)?.accomplished, false);
    assert.equal(deworming.rows.find(row => row.lrn === formulaLrn)?.medication, null);
    const immunization = await document(base, 'immunization', 'masterlist', staff, staffQuery);
    assert.equal(immunization.rows.find(row => row.lrn === formulaLrn)?.td1_lot, null);
    assert.equal(immunization.rows.find(row => row.lrn === formulaLrn)?.legacy_shared_lot, 'HISTORICAL-SHARED');
    assert.equal(immunization.rows.find(row => row.lrn === formulaLrn)?.consent, null);
    const vital = await document(base, 'vital-signs', 'masterlist', staff, staffQuery);
    assert.equal(vital.rows.find(row => row.lrn === formulaLrn)?.systolic_bp, 120);
    const empty = await document(base, 'oral-health', 'masterlist', staff, `?period=2026-09&school_id=${schoolIds[0]}`);
    assert.equal(empty.empty, true);
    assert.equal(empty.rows.length, 0);
    const zeroTarget = { period: '2026-09', school_id: schoolIds[0], indicator: 'registrations',
        target_count: 0, source_note: 'Local QA zero target source' };
    assert.equal((await request(base, '/report-targets/patient-info', staff, zeroTarget)).status, 201);
    const zero = await document(base, 'patient-info', 'municipality', staff,
        `?period=2026-09&school_id=${schoolIds[0]}`);
    assert.equal(zero.rows[0]?.target, 0);
    assert.equal(zero.rows[0]?.percentage, null);
    assert.equal((await request(base, '/report-targets/patient-info', staff,
        { ...period, school_id: schoolIds[0], indicator: 'registrations', target_count: 12,
            source_note: 'Local QA corrected target source' })).status, 201);
    const revised = await document(base, 'patient-info', 'municipality', staff, staffQuery);
    assert.equal(revised.rows[0]?.target, 12);
    assert.equal(revised.rows[0]?.percentage, 50);
    const revisions = await request(base, '/report-targets/patient-info?period=2026-08', staff);
    assert.equal(revisions.status, 200);
    const revisionRows = (await revisions.json() as { data: Array<{ indicator: string; target_count: number }> }).data;
    assert.ok(revisionRows.some(row => row.indicator === 'registrations' && row.target_count === 10));
    assert.ok(revisionRows.some(row => row.indicator === 'registrations' && row.target_count === 12));
    assert.equal((await request(base, '/reports/patient-info/masterlist/print-events', exportOnly,
        { ...period, school_id: schoolIds[0] })).status, 201);
    assert.equal((await request(base, '/reports/patient-info/print-events', exportOnly,
        { ...period, school_id: schoolIds[0] })).status, 403);

    const smallMunicipality = (await pool.query<{ id: number }>(`
        INSERT INTO MUNICIPALITIES (name, province_id)
        SELECT $1, id FROM PROVINCES ORDER BY id LIMIT 1 RETURNING id
    `, [`Report QA Small ${stamp}`])).rows[0]!.id;
    const smallBarangay = (await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`Report QA Small Barangay ${stamp}`, smallMunicipality])).rows[0]!.id;
    const smallSchool = (await pool.query<{ id: number }>(
        'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
        [`Report QA Small School ${stamp}`, smallBarangay])).rows[0]!.id;
    const smallStudent = (await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS (first_name, last_name, sex, date_of_birth, student_lrn,
            school_id, grade_level, section, registered_by, municipality_id, barangay_id)
        VALUES ('Small', 'Cell', 'Male', '2014-03-04', $1, $2, 'Grade 4', 'A', $3, $4, $5)
        RETURNING id
    `, [`QA-small-${stamp}`, smallSchool, admin.id, smallMunicipality, smallBarangay])).rows[0]!.id;
    await pool.query("INSERT INTO PATIENT_INFO (student_id, recorded_by, created_at) VALUES ($1, $2, '2026-08-10')",
        [smallStudent, admin.id]);
    const suppressed = await document(base, 'patient-info', 'municipality', superuser,
        `?period=2026-08&municipality_id=${smallMunicipality}`);
    assert.equal(suppressed.rows[0]?.accomplished, 'Suppressed');
    assert.equal(suppressed.rows[1]?.accomplished, 'Suppressed');
    assert.equal(suppressed.total_students, null);
    const allMunicipalities = await document(base, 'patient-info', 'municipality', superuser,
        '?period=2026-08');
    const municipalityCount = (await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM MUNICIPALITIES')).rows[0]!.count;
    assert.equal(allMunicipalities.rows.length, municipalityCount + 1,
        'Province-wide summary has one row per municipality and one province total');
    const dewormInput = { student_id: first, date_dewormed: '2026-09-15',
        medication_given: 'Albendazole 400mg', school_id: schoolIds[0] };
    assert.equal((await request(base, '/modules/deworming', staff, dewormInput)).status, 400,
        'Deworming outcome must be explicit');
    assert.equal((await request(base, '/modules/deworming', staff,
        { ...dewormInput, is_dewormed: false })).status, 400,
    'Medication cannot accompany a no-treatment outcome');
    assert.equal((await request(base, '/modules/deworming', staff,
        { ...dewormInput, is_dewormed: true })).status, 201);
    const createdDeworming = await pool.query<{ is_dewormed: boolean; medication_given: string }>(`
        SELECT is_dewormed, medication_given FROM DEWORMING
        WHERE student_id = $1 AND date_dewormed = '2026-09-15' ORDER BY id DESC LIMIT 1
    `, [first]);
    assert.equal(createdDeworming.rows[0]?.is_dewormed, true);
    assert.equal(createdDeworming.rows[0]?.medication_given, 'Albendazole 400mg');
    const immunInput = { student_id: first, immunization_date: '2026-09-15',
        vaccine_td1: true, lot_batch_td1: '000123456789', consent_given: null,
        school_id: schoolIds[0] };
    assert.equal((await request(base, '/modules/immunization', staff,
        { ...immunInput, vaccine_td1: false })).status, 400,
    'Vaccine lot cannot be saved without its dose flag');
    assert.equal((await request(base, '/modules/immunization', staff, immunInput)).status, 201);
    const createdImmunization = await pool.query<{ lot_batch_td1: string; consent_given: boolean | null }>(`
        SELECT lot_batch_td1, consent_given FROM IMMUNIZATION
        WHERE student_id = $1 AND immunization_date = '2026-09-15' ORDER BY id DESC LIMIT 1
    `, [first]);
    assert.equal(createdImmunization.rows[0]?.lot_batch_td1, '000123456789');
    assert.equal(createdImmunization.rows[0]?.consent_given, null);
    const september = await document(base, 'immunization', 'masterlist', staff,
        `?period=2026-09&school_id=${schoolIds[0]}`);
    assert.equal(september.rows.find(row => row.lrn === formulaLrn)?.td1_lot, '000123456789');
    assert.equal((await request(base, '/modules/immunization', staff,
        { ...immunInput, student_id: studentIds[6] })).status, 403);
    console.log('Deworming and Immunization staff entry validation/storage PASS');
    const audit = await pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND action IN ('REPORT_VIEWED', 'REPORT_PRINT_INITIATED',
            'REPORT_EXPORT_REQUESTED', 'REPORT_EXPORT_COMPLETED', 'REPORT_EXPORT_DOWNLOADED')
    `, [superuser.id]);
    assert.ok((audit.rows[0]?.count ?? 0) >= 5);
    console.log('Reporting redesign local integration PASS.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    const ownedUsers = await pool.query<{ id: number }>('SELECT id FROM USERS WHERE email = ANY($1::text[])',
        [['admin', 'staff', 'export_only', 'denied', 'superuser'].map(label => `redesign_${label}_${stamp}@pho.test`)]);
    const ownedIds = ownedUsers.rows.map(row => row.id);
    if (ownedIds.length) {
        const ownedStudents = await pool.query<{ id: number }>('SELECT id FROM STUDENTS WHERE registered_by = ANY($1::int[])', [ownedIds]);
        const ids = ownedStudents.rows.map(row => row.id);
        for (const table of ['PATIENT_INFO', 'ORAL_HEALTH', 'DEWORMING', 'IMMUNIZATION', 'VITAL_SIGNS']) {
            await pool.query(`DELETE FROM ${table} WHERE student_id = ANY($1::int[])`, [ids]);
        }
        await pool.query('DELETE FROM REPORT_EXPORTS WHERE requested_by = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM REPORT_TARGET_REVISIONS WHERE changed_by = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM DEWORMING_TARGETS WHERE created_by = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1::int[])', [ids]);
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM PORTAL_SESSIONS WHERE user_id = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [ownedIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [ownedIds]);
    }
    const ownedGeography = await pool.query<{ id: number }>('SELECT id FROM MUNICIPALITIES WHERE name = ANY($1::text[])',
        [[`Report QA Municipality ${stamp}`, `Report QA Small ${stamp}`]]);
    const municipalityIds = ownedGeography.rows.map(row => row.id);
    await pool.query('DELETE FROM SCHOOLS WHERE barangay_id IN (SELECT id FROM BARANGAYS WHERE municipality_id = ANY($1::int[]))', [municipalityIds]);
    await pool.query('DELETE FROM BARANGAYS WHERE municipality_id = ANY($1::int[])', [municipalityIds]);
    await pool.query('DELETE FROM MUNICIPALITIES WHERE id = ANY($1::int[])', [municipalityIds]);
    await pool.end();
}
