import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { sanitizeSpreadsheetString } from '../services/report-export.service.js';
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
let patientModuleId: number | undefined;
const moduleStates = new Map<number, boolean>();

type Role = 'admin' | 'superuser' | 'school_staff';

function authToken(id: number, email: string, role: Role): string {
    return jwt.sign({ id, email, portal_role: role }, secret!, { expiresIn: '10m' });
}

async function addUser(role: Role, label: string): Promise<{ id: number; token: string }> {
    const email = `phase3_m4_${label}_${stamp}@pho.test`;
    const result = await pool.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', $2, $3, 'QA Fixture', 'Phase', 'Four', TRUE)
        RETURNING id
    `, [email, role === 'school_staff' ? 'teacher' : role, role]);
    const id = result.rows[0]?.id;
    assert.ok(id);
    userIds.push(id);
    return { id, token: authToken(id, email, role) };
}

async function jsonRequest(base: string, method: string, route: string, token?: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${base}${route}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return { status: 204, body: {} };
    return { status: response.status, body: await response.json() as Record<string, unknown> };
}

try {
    assert.equal(sanitizeSpreadsheetString('  =1+1'), "'=1+1");
    assert.equal(sanitizeSpreadsheetString(' +cmd'), "'+cmd");
    assert.equal(sanitizeSpreadsheetString('-2'), "'-2");
    assert.equal(sanitizeSpreadsheetString('@user'), "'@user");
    assert.equal(sanitizeSpreadsheetString(' safe'), 'safe');

    const municipality = await pool.query<{ id: number }>(`
        INSERT INTO MUNICIPALITIES (name, province_id)
        SELECT $1, id FROM PROVINCES ORDER BY id LIMIT 1 RETURNING id
    `, [`P3 M4 Municipality ${stamp}`]);
    municipalityId = municipality.rows[0]?.id;
    assert.ok(municipalityId);
    const barangay = await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`P3 M4 Barangay ${stamp}`, municipalityId],
    );
    barangayId = barangay.rows[0]?.id;
    assert.ok(barangayId);
    for (const label of ['Assigned', 'Outside']) {
        const result: { rows: Array<{ id: number }> } = await pool.query<{ id: number }>(
            'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
            [`P3 M4 ${label} ${stamp}`, barangayId],
        );
        const id = result.rows[0]?.id;
        assert.ok(id);
        schoolIds.push(id);
    }

    const admin = await addUser('admin', 'admin');
    const staff = await addUser('school_staff', 'staff');
    const noExportStaff = await addUser('school_staff', 'no_export');
    const noReportStaff = await addUser('school_staff', 'no_report');
    await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)', [staff.id, schoolIds[0], admin.id]);
    await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)', [noExportStaff.id, schoolIds[0], admin.id]);
    await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)', [noReportStaff.id, schoolIds[0], admin.id]);
    const moduleResult = await pool.query<{ id: number; slug: string; is_active: boolean }>(`
        SELECT id, slug, is_active FROM MODULES
        WHERE slug = ANY($1::text[]) ORDER BY id
    `, [[ 'patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs' ]]);
    assert.equal(moduleResult.rows.length, 5);
    patientModuleId = moduleResult.rows.find(row => row.slug === 'patient-info')?.id;
    assert.ok(patientModuleId);
    for (const module of moduleResult.rows) {
        moduleStates.set(module.id, module.is_active);
        await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [module.id]);
        await pool.query(`
            INSERT INTO USER_MODULE_PERMISSIONS
                (user_id, module_id, can_view, can_report, can_export, granted_by)
            VALUES ($1, $2, TRUE, TRUE, TRUE, $3)
        `, [staff.id, module.id, admin.id]);
    }
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS
            (user_id, module_id, can_view, can_report, can_export, granted_by)
        VALUES ($1, $2, TRUE, TRUE, FALSE, $3)
    `, [noExportStaff.id, patientModuleId, admin.id]);
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS
            (user_id, module_id, can_view, can_report, can_export, granted_by)
        VALUES ($1, $2, TRUE, FALSE, FALSE, $3)
    `, [noReportStaff.id, patientModuleId, admin.id]);

    const student = await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS
            (first_name, middle_name, last_name, sex, date_of_birth, student_lrn, school_id,
             grade_level, section, registered_by, municipality_id, barangay_id)
        VALUES ('=SUM(1,1)', '@Middle', '-Formula', 'Female', '2014-03-04', '+12345678901', $1,
                'Grade 4', 'A', $2, $3, $4)
        RETURNING id
    `, [schoolIds[0], admin.id, municipalityId, barangayId]);
    const studentId = student.rows[0]?.id;
    assert.ok(studentId);
    studentIds.push(studentId);
    await pool.query('INSERT INTO PATIENT_INFO (student_id, recorded_by, created_at) VALUES ($1, $2, $3)', [studentId, admin.id, '2026-08-10']);
    await pool.query(`
        INSERT INTO ORAL_HEALTH
            (student_id, date_examined, is_rpoc_complete, has_oral_screening, service_location,
             visit_type, total_dmft, total_dmft_primary, treatment_type, recorded_by)
        VALUES ($1, '2026-08-11', TRUE, TRUE, 'FACILITY', '1ST VISIT', 2, 1, '@Treatment', $2)
    `, [studentId, admin.id]);
    await pool.query(`
        INSERT INTO DEWORMING
            (student_id, date_dewormed, age_group, medication_given, is_dewormed,
             school_type, in_school, school_id, recorded_by)
        VALUES ($1, '2026-08-12', '10-14', '=Medication', TRUE, 'public', TRUE, $2, $3)
    `, [studentId, schoolIds[0], admin.id]);
    await pool.query(`
        INSERT INTO IMMUNIZATION
            (student_id, immunization_date, vaccine_hpv1, consent_given, school_id, recorded_by)
        VALUES ($1, '2026-08-13', TRUE, TRUE, $2, $3)
    `, [studentId, schoolIds[0], admin.id]);
    await pool.query(`
        INSERT INTO VITAL_SIGNS
            (student_id, date_checked, blood_pressure_systolic, blood_pressure_diastolic,
             heart_rate, respiratory_rate, temperature, weight_kg, height_cm, bmi, recorded_by)
        VALUES ($1, '2026-08-14', 110, 70, 80, 18, 36.8, 35, 140, 17.86, $2)
    `, [studentId, admin.id]);

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve);
        server!.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const filters = { date_from: '2026-08-01', date_to: '2026-08-31', school_id: schoolIds[0] };

    const unauthenticatedPrint = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/print-events', undefined, filters);
    assert.equal(unauthenticatedPrint.status, 401);
    const missingReportGrant = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/print-events', noReportStaff.token, filters);
    assert.equal(missingReportGrant.status, 403);
    const invalidPrintBody = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/print-events', staff.token, { ...filters, student_lrn: 'must-not-be-accepted' });
    assert.equal(invalidPrintBody.status, 400);
    const crossSchoolPrint = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/print-events', staff.token, { ...filters, school_id: schoolIds[1] });
    assert.equal(crossSchoolPrint.status, 403);
    const recordedPrint = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/print-events', staff.token, filters);
    assert.equal(recordedPrint.status, 201);
    assert.equal((recordedPrint.body.data as Record<string, unknown>).status, 'recorded');
    const printAudit = await pool.query<{ details: string }>(`
        SELECT COALESCE(details::text, '') AS details
        FROM AUDIT_EVENTS
        WHERE actor_id = $1
          AND action = 'REPORT_PRINT_INITIATED'
          AND entity_type = 'CONSOLIDATED_REPORT'
          AND entity_id = 'patient-info'
        ORDER BY id DESC LIMIT 1
    `, [staff.id]);
    assert.equal(printAudit.rows.length, 1);
    assert.match(printAudit.rows[0]!.details, /"status": "initiated"/);
    assert.doesNotMatch(printAudit.rows[0]!.details, /student_lrn|first_name|last_name|contact|download_token|storage_reference/i);

    const missingGrant = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/exports', noExportStaff.token, { format: 'csv', filters });
    assert.equal(missingGrant.status, 403);

    const overLimit = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/exports', staff.token, {
        format: 'csv', filters: { date_from: '2025-01-01', date_to: '2026-12-31' },
    });
    assert.equal(overLimit.status, 422);
    assert.equal((overLimit.body.error as Record<string, unknown>).code, 'EXPORT_LIMIT_EXCEEDED');

    const crossSchool = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/exports', staff.token, {
        format: 'csv', filters: { ...filters, school_id: schoolIds[1] },
    });
    assert.equal(crossSchool.status, 403);

    const exportsBefore = await pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM REPORT_EXPORTS');
    const csvDownload = await fetch(`${base}/api/v1/reports/patient-info/exports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'csv', filters }),
    });
    assert.equal(csvDownload.status, 200);
    assert.match(csvDownload.headers.get('content-type') ?? '', /^text\/csv/);
    assert.match(csvDownload.headers.get('content-disposition') ?? '', /attachment; filename="patient-info-report-2026-08-01-to-2026-08-31\.csv"/);
    assert.equal(csvDownload.headers.get('cache-control'), 'private, no-store');
    assert.ok(Number(csvDownload.headers.get('content-length')) > 0);
    const csvText = await csvDownload.text();
    assert.match(csvText, /'\+12345678901/);
    assert.match(csvText, /'=SUM\(1,1\)/);
    assert.match(csvText, /'@Middle/);
    assert.match(csvText, /'-Formula/);
    assert.doesNotMatch(csvText, /parent_guardian|contact|photo_url|street_address|recorded_by/i);

    await pool.query('UPDATE MODULES SET is_active = FALSE WHERE id = $1', [patientModuleId]);
    const disabled = await jsonRequest(base, 'POST', '/api/v1/reports/patient-info/exports', staff.token, { format: 'csv', filters });
    assert.equal(disabled.status, 422);
    assert.equal((disabled.body.error as Record<string, unknown>).code, 'MODULE_DISABLED');
    await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [patientModuleId]);

    const xlsxDownload = await fetch(`${base}/api/reports/patient-info/exports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'xlsx', filters }),
    });
    assert.equal(xlsxDownload.status, 200);
    assert.match(xlsxDownload.headers.get('content-type') ?? '', /spreadsheetml\.sheet/);
    const xlsxBuffer = Buffer.from(await xlsxDownload.arrayBuffer());
    assert.equal(xlsxBuffer.subarray(0, 4).toString('hex'), '504b0304');
    assert.ok(xlsxBuffer.includes(Buffer.from('xl/workbook.xml')));

    for (const slug of ['oral-health', 'deworming', 'immunization', 'vital-signs']) {
        const downloaded = await fetch(`${base}/api/v1/reports/${slug}/exports`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: 'csv', filters }),
        });
        assert.equal(downloaded.status, 200, `${slug} export should download directly`);
        const text = await downloaded.text();
        assert.doesNotMatch(text, /recorded_by|remarks|diagnosis|lot_batch|vaccinator|referral_reason/i);
    }

    const retiredJobRoute = await fetch(`${base}/api/v1/report-exports/1`, {
        headers: { Authorization: `Bearer ${staff.token}` },
    });
    assert.equal(retiredJobRoute.status, 404);
    const exportsAfter = await pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM REPORT_EXPORTS');
    assert.equal(exportsAfter.rows[0]?.count, exportsBefore.rows[0]?.count, 'Direct downloads must not create export jobs.');

    const audit = await pool.query<{ action: string; count: number }>(`
        SELECT action, COUNT(*)::int AS count FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND entity_type = 'REPORT_EXPORT'
        GROUP BY action
    `, [staff.id]);
    const actions = new Map(audit.rows.map(row => [row.action, Number(row.count)]));
    for (const action of ['REPORT_EXPORT_REQUESTED', 'REPORT_EXPORT_COMPLETED', 'REPORT_EXPORT_DOWNLOADED']) {
        assert.ok((actions.get(action) ?? 0) >= 1, `${action} audit event should exist`);
    }
    const auditDetails = await pool.query<{ details: string }>(`
        SELECT COALESCE(details::text, '') AS details FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND entity_type = 'REPORT_EXPORT'
    `, [staff.id]);
    for (const row of auditDetails.rows) {
        assert.doesNotMatch(row.details, /storage_reference|download_token|student_lrn|first_name|last_name|contact/i);
        assert.match(row.details, /"delivery": "direct-download"/);
    }

    console.log('Phase 3 direct CSV/XLSX export and print-audit checks passed.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
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
    for (const [moduleId, isActive] of moduleStates) {
        await pool.query('UPDATE MODULES SET is_active = $1 WHERE id = $2', [isActive, moduleId]);
    }
    if (schoolIds.length) await pool.query('DELETE FROM SCHOOLS WHERE id = ANY($1::int[])', [schoolIds]);
    if (barangayId) await pool.query('DELETE FROM BARANGAYS WHERE id = $1', [barangayId]);
    if (municipalityId) await pool.query('DELETE FROM MUNICIPALITIES WHERE id = $1', [municipalityId]);
    const cleanup = await pool.query<{ users: number; students: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM USERS WHERE id = ANY($1::int[])) AS users,
            (SELECT COUNT(*)::int FROM STUDENTS WHERE id = ANY($2::int[])) AS students
    `, [userIds, studentIds]);
    assert.deepEqual(cleanup.rows[0], { users: 0, students: 0 });
    await pool.end();
}
