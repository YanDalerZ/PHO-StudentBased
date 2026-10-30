import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import { app } from '../index.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

import { AuditService } from '../services/AuditService.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
await requireVerifiedTestDatabase(pool);
const originalLog = AuditService.logEvent;
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
    const province = await pool.query<{ id: number }>('SELECT id FROM PROVINCES ORDER BY id LIMIT 1');
    assert.ok(province.rows[0]?.id, 'Local fixture requires a province');
    const municipality = await pool.query<{ id: number }>(
        'INSERT INTO MUNICIPALITIES (name, province_id) VALUES ($1, $2) RETURNING id',
        [`Immunization QA ${stamp}`, province.rows[0]!.id]);
    municipalityId = municipality.rows[0]!.id;
    const barangay = await pool.query<{ id: number }>(
        'INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id',
        [`Immunization QA ${stamp}`, municipalityId]);
    barangayId = barangay.rows[0]!.id;
    const school = await pool.query<{ id: number }>(
        'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
        [`Immunization QA School ${stamp}`, barangayId]);
    schoolId = school.rows[0]!.id;

    const module = await pool.query<{ id: number; is_active: boolean }>(
        "SELECT id, is_active FROM MODULES WHERE slug = 'immunization'");
    assert.ok(module.rows[0]?.id);
    moduleId = module.rows[0]!.id;
    originalModuleActive = module.rows[0]!.is_active;
    if (!originalModuleActive) await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [moduleId]);

    const hash = await bcrypt.hash('local-immunization-test-password', 8);
    const emails = new Map<string, string>();
    for (const role of ['admin', 'school_staff', 'superuser'] as const) {
        const email = `immunization_qa_${role}_${stamp}@pho.test`;
        emails.set(role, email);
        const result = await pool.query<{ id: number }>(`
            INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
            VALUES ($1, $2, $3, $4, 'QA Fixture', 'Immunization', 'Tester', TRUE) RETURNING id`,
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
            { email: emails.get(role), password: 'local-immunization-test-password' });
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
            VALUES ($1, 'Synthetic', 'Immunization', 'Female', $2::date, $3, $4, $5, $6) RETURNING id`,
        [`${String(stamp).slice(-10)}${String(age).padStart(2, '0')}`, `${2026 - age}-01-01`, schoolId,
            municipalityId, barangayId, superId]);
        const id = result.rows[0]!.id;
        students.push(id);
        return id;
    }

    const female = await student(12), male = await student(13);
    await pool.query("UPDATE STUDENTS SET sex='Male' WHERE id=$1", [male]);
    const payload = { student_id: female, immunization_date: '2026-10-30', is_sick_today: false };
    const create = async (extra: object, token = teacher) => request(base, 'POST', '/modules/immunization', token, {...payload,...extra});
    const expect = (result: ApiResult, code: number) => { expectStatus(result, code, 'immunization contract'); return data(result); };
    async function readRecord(id: number, token: string) {
        const response = expect(await request(base,'GET','/modules/immunization/student/'+female,token),200);
        return (response.records as Array<Record<string,unknown>>).find(row=>Number(row.id)===id)!;
    }
    for (const token of [teacher, superuser]) {
        const created = expect(await create({is_deferred:true,deferred_reason_text:'  Temporary reason  '},token),201);
        records.push(Number(created.id));
        assert.equal(created.deferred_reason_text, 'Temporary reason');
        assert.equal((await readRecord(Number(created.id),token)).deferred_reason_text,'Temporary reason');
        const list = expect(await request(base,'GET','/modules/immunization/student/'+female,token),200);
        assert.ok((list.records as Array<Record<string,unknown>>).some(row => row.id === created.id && row.deferred_reason_text === 'Temporary reason'));
        expect(await request(base,'PUT','/modules/immunization/'+created.id,token,{vaccinator_name:'Partial edit'}),200);
        assert.equal((await readRecord(Number(created.id),token)).deferred_reason_text,'Temporary reason');
        expect(await request(base,'PUT','/modules/immunization/'+created.id,token,{deferred_reason_text:'Updated reason'}),200);
        expect(await request(base,'PUT','/modules/immunization/'+created.id,token,{is_deferred:false,is_refused:true,refusal_reason_code:'17'}),200);
        assert.equal((await readRecord(Number(created.id),token)).deferred_reason_text,null);
        expect(await request(base,'PUT','/modules/immunization/'+created.id,token,{is_refused:false,vaccine_mr1:true}),200);
        assert.equal((await pool.query('SELECT refusal_reason_code FROM IMMUNIZATION WHERE id=$1',[created.id])).rows[0].refusal_reason_code,null);
    }
    for (const invalid of [
        {is_deferred:true}, {is_deferred:true,deferred_reason_text:' '},
        {is_deferred:true,deferred_reason_text:'a'.repeat(2001)},
        {is_deferred:true,deferred_reason_text:'Reason',is_refused:true,refusal_reason_code:'17'},
        {vaccine_mr1:true,deferred_reason_text:'Wrong option'},
        {is_deferred:true,deferred_reason_text:'Sick',is_sick_today:true}
    ]) expect(await create(invalid),400);
    for (const key of ['mr1','mr2','td1','td2','hpv1','hpv2']) {
        for (const lot of ['00000123456789012345678901234567890','',null]) {
            const row = expect(await create({['vaccine_'+key]:true,['lot_batch_'+key]:lot}),201);
            records.push(Number(row.id));
            assert.equal((await pool.query('SELECT * FROM IMMUNIZATION WHERE id=$1',[row.id])).rows[0]['lot_batch_'+key],lot || null);
            expect(await request(base,'PUT','/modules/immunization/'+row.id,teacher,{['lot_batch_'+key]:'9e3'}),400);
        }
        for (const lot of ['1A','1.2','-1','1e3',' 12']) expect(await create({['vaccine_'+key]:true,['lot_batch_'+key]:lot}),400);
        expect(await create({is_refused:true,refusal_reason_code:'17',['lot_batch_'+key]:'123'}),400);
    }
    for (const key of ['hpv1','hpv2']) expect(await create({student_id:male,['vaccine_'+key]:true,sex:'Female',is_school_based:false}),400);
    const maleRow = expect(await create({student_id:male,vaccine_mr1:true}),201);records.push(Number(maleRow.id));
    expect(await request(base,'PUT','/modules/immunization/'+maleRow.id,superuser,{vaccine_hpv1:true}),400);
    expect(await create({is_deferred:true,deferred_reason_text:'Denied'},admin),403);
    expect(await request(base,'POST','/modules/immunization',undefined,payload),401);
    const otherSchool = await pool.query<{id:number}>('SELECT id FROM SCHOOLS WHERE id <> $1 LIMIT 1',[schoolId]);
    assert.ok(otherSchool.rows[0]);
    const outside = await pool.query<{id:number}>('INSERT INTO STUDENTS (student_lrn,first_name,last_name,sex,date_of_birth,school_id,registered_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [String(stamp).slice(-10)+'99','Synthetic','Outside','Female','2014-01-01',otherSchool.rows[0]!.id,superId]);
    students.push(outside.rows[0]!.id);
    expect(await create({student_id:outside.rows[0]!.id,is_deferred:true,deferred_reason_text:'Cross school denied'}),403);
    await pool.query('UPDATE USER_MODULE_PERMISSIONS SET can_edit=false WHERE user_id=$1 AND module_id=$2',[staffId,moduleId]);
    expect(await request(base,'PUT','/modules/immunization/'+maleRow.id,teacher,{remarks:'Denied'}),403);
    await pool.query('UPDATE USER_MODULE_PERMISSIONS SET can_edit=true WHERE user_id=$1 AND module_id=$2',[staffId,moduleId]);
    const alias = await request(base.replace('/api/v1','/api'),'POST','/modules/immunization',teacher,{...payload,is_deferred:true,deferred_reason_text:'Alias route'});
    records.push(Number(expect(alias,201).id));
    const legacy = await pool.query<{id:number}>('INSERT INTO IMMUNIZATION (student_id,immunization_date,vaccine_mr1,is_deferred,recorded_by,school_id,remarks,is_from_other_facility,other_facility_name,refusal_reason_text,lot_batch_no) VALUES ($1,$2,true,true,$3,$4,$5,true,$6,$7,$8) RETURNING id',
        [female,'2026-10-30',superId,schoolId,'Keep clinical note','Historical clinic','Keep refusal text','SHARED-OLD']);
    const legacyId = legacy.rows[0]!.id;records.push(legacyId);
    assert.equal((await readRecord(legacyId,teacher)).deferred_reason_text,null);
    expect(await request(base,'PUT','/modules/immunization/'+legacyId,teacher,{vaccinator_name:'No reason'}),400);
    expect(await request(base,'PUT','/modules/immunization/'+legacyId,teacher,{deferred_reason_text:'Explicit new reason'}),200);
    const saved = (await pool.query('SELECT * FROM IMMUNIZATION WHERE id=$1',[legacyId])).rows[0];
    assert.equal(saved.remarks,'Keep clinical note');assert.equal(saved.other_facility_name,'Historical clinic');
    assert.equal(saved.refusal_reason_text,'Keep refusal text');assert.equal(saved.lot_batch_no,'SHARED-OLD');
    const count = Number((await pool.query('SELECT count(*) FROM IMMUNIZATION WHERE recorded_by=ANY($1::int[])',[users])).rows[0].count);
    AuditService.logEvent = async (event,client) => {
        if(event.action.startsWith('IMMUNIZATION_')) throw new Error('Synthetic audit failure');
        return originalLog.call(AuditService,event,client);
    };
    expect(await create({is_deferred:true,deferred_reason_text:'Rollback insert'}),500);
    expect(await request(base,'PUT','/modules/immunization/'+legacyId,teacher,{deferred_reason_text:'Rollback edit'}),500);
    AuditService.logEvent = originalLog;
    assert.equal(Number((await pool.query('SELECT count(*) FROM IMMUNIZATION WHERE recorded_by=ANY($1::int[])',[users])).rows[0].count),count);
    assert.equal((await pool.query('SELECT deferred_reason_text FROM IMMUNIZATION WHERE id=$1',[legacyId])).rows[0].deferred_reason_text,'Explicit new reason');
    const audit = await pool.query("SELECT details FROM AUDIT_EVENTS WHERE actor_id=ANY($1::int[]) AND entity_type='immunization'",[users]);
    assert.ok(!JSON.stringify(audit.rows).includes('Explicit new reason'));
    if(process.env.PHO_PLAYWRIGHT_MODULE) {
        const result = await promisify(execFile)(process.execPath,['../frontend/scripts/verify-immunization-persistence.mjs'],{
            env:{...process.env,PHO_LIVE_QA_BASE:base,PHO_QA_DATABASE_VERIFIED:'pho_test',PHO_LIVE_QA_FIXTURE:JSON.stringify({student:female,male,teacher,superuser,browserStudents:[await student(14),await student(15)]})},timeout:120000});
        console.log(result.stdout);
    }
    console.log('PASS local API/database: deferral create/edit/read, transitions, six nullable digit lots, canonical Male HPV denial, legacy preservation, audit minimization and rollback.');

} finally {
    AuditService.logEvent = originalLog;
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (users.length) await pool.query('DELETE FROM IMMUNIZATION WHERE recorded_by = ANY($1::int[])', [users]);
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
