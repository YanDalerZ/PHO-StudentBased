/**
 * Phase 3 Full Acceptance Test Suite
 * 
 * Verifies:
 * 1. Superuser Overview + 5 Module Dashboards (Patient Info, Oral Health, Deworming, Vital Signs, Immunization)
 * 2. Cascading and Date Filters (municipality, barangay, school, date range) with figures changing and resetting
 * 3. Deworming Consolidation Report reconciliation (municipality totals == province totals)
 * 4. Superuser province-wide Student CRUD (Create, Read, Update any student)
 * 5. Superuser province-wide Module CRUD for all 5 modules (Create, Read history, Update)
 * 6. Teacher A scoped access (can access/edit own registered student and module records)
 * 7. Teacher B isolation (Teacher A's records return 403 or are absent from scoped lists)
 * 8. Admin and Unauthenticated strict RBAC alignment (Admin denied from Student & Module CRUD; Admin allowed on Dashboards; Unauth 401)
 * 
 * Run with: npx tsx tests/phase3_full_acceptance_test.ts
 */

import pool from '../src/database/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'pho_development_secret_key_2025';

interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
}

async function request<T = Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    params?: Record<string, string | number>;
  } = {}
): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    body: responseBody as T,
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function runAcceptanceTests() {
  console.log('===============================================================');
  console.log('🚀 Phase 3 Full Acceptance & Province-Wide CRUD Test Suite');
  console.log('===============================================================\n');

  const timestamp = Date.now();
  const testAdminEmail = `acceptance_admin_${timestamp}@pho.test`;
  const testSuperuserEmail = `acceptance_super_${timestamp}@pho.test`;
  const testTeacherAEmail = `acceptance_teacher_a_${timestamp}@pho.test`;
  const testTeacherBEmail = `acceptance_teacher_b_${timestamp}@pho.test`;

  const createdUserIds: number[] = [];
  const createdStudentIds: number[] = [];
  const createdPatientInfoIds: number[] = [];
  const createdAnimalBiteIds: number[] = [];
  const createdOralHealthIds: number[] = [];
  const createdDewormingIds: number[] = [];
  const createdVitalSignsIds: number[] = [];
  const createdImmunizationIds: number[] = [];

  try {
    // ─── 0. SETUP: Isolated Users & Lookup Data ────────────────────────
    console.log('0. Setting up test users and geographic fixtures...');
    const passwordHash = await bcrypt.hash('password123', 10);

    const insertUser = async (email: string, role: string, firstName: string, lastName: string) => {
      const res = await pool.query<{ id: number }>(
        `INSERT INTO USERS (email, password_hash, role, first_name, last_name, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id`,
        [email, passwordHash, role, firstName, lastName]
      );
      const id = res.rows[0].id;
      createdUserIds.push(id);
      const token = jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '2h' });
      return { id, token, email, role };
    };

    const adminUser = await insertUser(testAdminEmail, 'admin', 'Acceptance', 'Admin');
    const superUser = await insertUser(testSuperuserEmail, 'superuser', 'Acceptance', 'SuperUser');
    const teacherA = await insertUser(testTeacherAEmail, 'teacher', 'Teacher', 'Alpha');
    const teacherB = await insertUser(testTeacherBEmail, 'teacher', 'Teacher', 'Beta');

    // Retrieve active school, barangay, and municipality
    const schoolRes = await pool.query<{
      id: number;
      name: string;
      barangay_id: number;
      municipality_id: number;
    }>(
      `SELECT sc.id, sc.name, sc.barangay_id, b.municipality_id
       FROM SCHOOLS sc
       JOIN BARANGAYS b ON sc.barangay_id = b.id
       JOIN MUNICIPALITIES m ON b.municipality_id = m.id
       LIMIT 1`
    );
    if (schoolRes.rows.length === 0) {
      throw new Error('No active school found in database for test fixture');
    }
    const testSchool = schoolRes.rows[0];
    console.log(`  ✅ Fixtures ready: School ID=${testSchool.id}, Mun ID=${testSchool.municipality_id}\n`);

    // ─── 1. Superuser Overview + 5 Module Dashboards ───────────────────
    console.log('1. Verifying Superuser Overview and 5 Module Dashboards...');
    
    const overviewRes = await request<{ data: { total_students: number } }>('/dashboard/overview', {
      token: superUser.token,
    });
    assert(overviewRes.status === 200, 'Superuser Overview returns 200 OK');
    assert(typeof overviewRes.body?.data?.total_students === 'number', 'Overview has total_students');

    const pinfoDashRes = await request<{ data: { total_students: number } }>('/modules/patient-info/dashboard', {
      token: superUser.token,
    });
    assert(pinfoDashRes.status === 200, 'Patient Info Dashboard returns 200 OK');
    assert(typeof pinfoDashRes.body?.data?.total_students === 'number', 'Patient Info dashboard total_students is numeric');

    const oralDashRes = await request<{ data: { total_students_examined: number } }>('/modules/oral-health/dashboard', {
      token: superUser.token,
    });
    assert(oralDashRes.status === 200, 'Oral Health Dashboard returns 200 OK');
    assert(typeof oralDashRes.body?.data?.total_students_examined === 'number', 'Oral Health examined is numeric');

    const dewormDashRes = await request<{ data: { total_dewormed: number } }>('/modules/deworming/dashboard', {
      token: superUser.token,
    });
    assert(dewormDashRes.status === 200, 'Deworming Dashboard returns 200 OK');
    assert(typeof dewormDashRes.body?.data?.total_dewormed === 'number', 'Deworming total_dewormed is numeric');

    const vitalsDashRes = await request<{ data: { total_screened: number } }>('/modules/vital-signs/dashboard', {
      token: superUser.token,
    });
    assert(vitalsDashRes.status === 200, 'Vital Signs Dashboard returns 200 OK');
    assert(typeof vitalsDashRes.body?.data?.total_screened === 'number', 'Vital Signs total_screened is numeric');

    const immDashRes = await request<{ data: { total_students_vaccinated: number; vaccine_antigens: unknown[] } }>('/modules/immunization/dashboard', {
      token: superUser.token,
    });
    assert(immDashRes.status === 200, 'Immunization Dashboard returns 200 OK');
    assert(typeof immDashRes.body?.data?.total_students_vaccinated === 'number', 'Immunization total_students_vaccinated is numeric');
    assert(Array.isArray(immDashRes.body?.data?.vaccine_antigens), 'Immunization antigens is an array');
    console.log('');

    // ─── 2. Cascading & Date Filters on Dashboards ──────────────────────
    console.log('2. Verifying Dashboard Filters (Change & Reset)...');
    
    // Test filtered vs unfiltered on Overview
    const unfilteredOverview = overviewRes.body.data.total_students;
    const filteredOverview = await request<{ data: { total_students: number } }>('/dashboard/overview', {
      token: superUser.token,
      params: { municipality_id: testSchool.municipality_id },
    });
    assert(filteredOverview.status === 200, 'Filtered Overview returns 200 OK');
    assert(
      filteredOverview.body.data.total_students <= unfilteredOverview,
      `Filtered count (${filteredOverview.body.data.total_students}) <= unfiltered count (${unfilteredOverview})`
    );

    // Reset check
    const resetOverview = await request<{ data: { total_students: number } }>('/dashboard/overview', {
      token: superUser.token,
    });
    assert(
      resetOverview.body.data.total_students === unfilteredOverview,
      'Resetting filters restores full province-wide count'
    );

    // Date range filter check on Immunization
    const immDateFiltered = await request<{ data: { total_students_vaccinated: number } }>('/modules/immunization/dashboard', {
      token: superUser.token,
      params: { date_from: '2099-01-01', date_to: '2099-12-31' },
    });
    assert(immDateFiltered.status === 200, 'Future date filter returns 200 OK safely');
    assert(immDateFiltered.body.data.total_students_vaccinated === 0, 'Future date returns 0 vaccinated students');
    console.log('');

    // ─── 3. Deworming Consolidation Report Reconciliation ──────────────
    console.log('3. Verifying Deworming Municipality Consolidation Report...');
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const reportRes = await request<{
      data: {
        period: string;
        municipalities: Array<{
          municipality_id: number;
          municipality_name: string;
          target: number;
          male_accomplished: number;
          female_accomplished: number;
          total_accomplished: number;
          accomplishment_rate: number;
        }>;
        province_totals: {
          target: number;
          male_accomplished: number;
          female_accomplished: number;
          total_accomplished: number;
          accomplishment_rate: number;
        };
      };
    }>('/modules/deworming/report', {
      token: superUser.token,
      params: { period: currentMonth },
    });
    assert(reportRes.status === 200, 'Deworming report returns 200 OK');
    
    if (reportRes.body.data) {
      const { municipalities, province_totals } = reportRes.body.data;
      assert(Array.isArray(municipalities), 'Report returns array of municipalities');
      
      const sumTarget = municipalities.reduce((acc, m) => acc + m.target, 0);
      const sumMale = municipalities.reduce((acc, m) => acc + m.male_accomplished, 0);
      const sumFemale = municipalities.reduce((acc, m) => acc + m.female_accomplished, 0);
      const sumTotal = municipalities.reduce((acc, m) => acc + m.total_accomplished, 0);

      assert(sumTarget === province_totals.target, `Sum target (${sumTarget}) matches province total (${province_totals.target})`);
      assert(sumMale === province_totals.male_accomplished, `Sum male (${sumMale}) matches province male (${province_totals.male_accomplished})`);
      assert(sumFemale === province_totals.female_accomplished, `Sum female (${sumFemale}) matches province female (${province_totals.female_accomplished})`);
      assert(sumTotal === province_totals.total_accomplished, `Sum total (${sumTotal}) matches province total (${province_totals.total_accomplished})`);
    }
    console.log('');

    // ─── 4. Superuser Province-Wide Student CRUD ─────────────────────────
    console.log('4. Testing Superuser Province-Wide Student CRUD...');
    const lrnSuper = `999${timestamp.toString().slice(-9)}`;
    const createStudentRes = await request<{ data: { id: number }; id?: number }>('/students', {
      method: 'POST',
      token: superUser.token,
      body: {
        student_lrn: lrnSuper,
        first_name: 'SuperCreated',
        last_name: 'Student',
        sex: 'Female',
        date_of_birth: '2015-05-15',
        school_id: testSchool.id,
        grade_level: 'Grade 4',
        section: 'Rizal',
      },
    });
    assert(createStudentRes.status === 201, 'Superuser creates student province-wide -> 201 Created');
    const superStudentId = createStudentRes.body.data?.id || createStudentRes.body.id;
    if (superStudentId) createdStudentIds.push(superStudentId);

    // Read single student
    const getStudentRes = await request<{ data: { id: number; first_name: string } }>(`/students/${superStudentId}`, {
      token: superUser.token,
    });
    assert(getStudentRes.status === 200, 'Superuser reads created student -> 200 OK');
    assert(getStudentRes.body?.data?.first_name === 'SuperCreated', 'First name matches created value');

    // Update student
    const updateStudentRes = await request<{ message: string; data: { first_name: string; section: string } }>(`/students/${superStudentId}`, {
      method: 'PUT',
      token: superUser.token,
      body: {
        first_name: 'SuperUpdated',
        section: 'Bonifacio',
      },
    });
    assert(updateStudentRes.status === 200, 'Superuser updates student -> 200 OK');

    const verifyUpdateRes = await request<{ data: { first_name: string; section: string } }>(`/students/${superStudentId}`, {
      token: superUser.token,
    });
    assert(verifyUpdateRes.body?.data?.first_name === 'SuperUpdated', 'Student first_name updated');
    assert(verifyUpdateRes.body?.data?.section === 'Bonifacio', 'Student section updated');
    console.log('');

    // ─── 5. Superuser 5 Health Module CRUD ──────────────────────────────
    console.log('5. Testing Superuser Module CRUD across all 5 Modules...');

    // 5.1 Patient Info + Animal Bite
    const createPiRes = await request<{ data: { patient_info: { id: number } } }>('/modules/patient-info', {
      method: 'POST',
      token: superUser.token,
      body: {
        student_id: superStudentId,
        file_no: `FILE-${timestamp}`,
        animal_bite: {
          rabies_exposure_category: 'Category II',
          animal_type: 'Dog',
          type_of_exposure: 'Bite',
          wash_bite: true,
          date_of_exposure: '2026-08-01',
          is_active_case: true,
        },
      },
    });
    assert(createPiRes.status === 201, 'Superuser creates Patient Info & Animal Bite -> 201 Created');
    const piId = createPiRes.body.data?.patient_info?.id;
    if (piId) createdPatientInfoIds.push(piId);

    const updatePiRes = await request<{ message: string }>(`/modules/patient-info/${piId}`, {
      method: 'PUT',
      token: superUser.token,
      body: {
        file_no: `FILE-${timestamp}-UPDATED`,
      },
    });
    assert(updatePiRes.status === 200, 'Superuser updates Patient Info -> 200 OK');

    const getPiHistory = await request<{ data: { patient_info: { file_no: string } } }>(`/modules/patient-info/student/${superStudentId}`, {
      token: superUser.token,
    });
    assert(getPiHistory.status === 200, 'Superuser retrieves Patient Info history -> 200 OK');
    assert(getPiHistory.body?.data?.patient_info?.file_no === `FILE-${timestamp}-UPDATED`, 'Patient Info history reflects update');

    // 5.2 Oral Health
    const createOhRes = await request<{ data: { id: number } }>('/modules/oral-health', {
      method: 'POST',
      token: superUser.token,
      body: {
        student_id: superStudentId,
        date_examined: '2026-08-10',
        school_id: testSchool.id,
        service_location: 'FACILITY',
        visit_type: '1ST VISIT',
        is_rpoc_complete: true,
        has_oral_screening: true,
        has_risk_assessment: true,
      },
    });
    assert(createOhRes.status === 201, 'Superuser creates Oral Health record -> 201 Created');
    const ohId = createOhRes.body.data?.id;
    if (ohId) createdOralHealthIds.push(ohId);

    const updateOhRes = await request<{ message: string }>(`/modules/oral-health/${ohId}`, {
      method: 'PUT',
      token: superUser.token,
      body: {
        has_oral_prophylaxis: true,
        has_fluoride_varnish: true,
      },
    });
    assert(updateOhRes.status === 200, 'Superuser updates Oral Health record -> 200 OK');

    const getOhHistory = await request<{ data: { records: Array<{ id: number; has_oral_prophylaxis: boolean }> } }>(`/modules/oral-health/student/${superStudentId}`, {
      token: superUser.token,
    });
    assert(getOhHistory.status === 200, 'Superuser retrieves Oral Health history -> 200 OK');
    assert(getOhHistory.body?.data?.records[0]?.has_oral_prophylaxis === true, 'Oral Health history reflects update');

    // 5.3 Deworming
    const createDewormRes = await request<{ data: { id: number } }>('/modules/deworming', {
      method: 'POST',
      token: superUser.token,
      body: {
        student_id: superStudentId,
        date_dewormed: '2026-08-15',
        school_id: testSchool.id,
        is_dewormed: true,
        school_type: 'public',
        in_school: true,
        medication_given: 'Albendazole 400mg',
        remarks: 'Initial round',
      },
    });
    assert(createDewormRes.status === 201, 'Superuser creates Deworming record -> 201 Created');
    const dewormId = createDewormRes.body.data?.id;
    if (dewormId) createdDewormingIds.push(dewormId);

    const updateDewormRes = await request<{ message: string }>(`/modules/deworming/${dewormId}`, {
      method: 'PUT',
      token: superUser.token,
      body: {
        remarks: 'Second dose administered / updated',
      },
    });
    assert(updateDewormRes.status === 200, 'Superuser updates Deworming record -> 200 OK');

    const getDewormHistory = await request<{ data: { records: Array<{ remarks: string }> } }>(`/modules/deworming/student/${superStudentId}`, {
      token: superUser.token,
    });
    assert(getDewormHistory.status === 200, 'Superuser retrieves Deworming history -> 200 OK');
    assert(getDewormHistory.body?.data?.records[0]?.remarks === 'Second dose administered / updated', 'Deworming history reflects update');

    // 5.4 Vital Signs
    const createVsRes = await request<{ data: { id: number } }>('/modules/vital-signs', {
      method: 'POST',
      token: superUser.token,
      body: {
        student_id: superStudentId,
        date_checked: '2026-08-20',
        school_id: testSchool.id,
        blood_pressure_systolic: 110,
        blood_pressure_diastolic: 70,
        heart_rate: 75,
        respiratory_rate: 18,
        temperature: 36.6,
        weight_kg: 32.5,
        height_cm: 135.0,
      },
    });
    assert(createVsRes.status === 201, 'Superuser creates Vital Signs record -> 201 Created');
    const vsId = createVsRes.body.data?.id;
    if (vsId) createdVitalSignsIds.push(vsId);

    const updateVsRes = await request<{ message: string }>(`/modules/vital-signs/${vsId}`, {
      method: 'PUT',
      token: superUser.token,
      body: {
        temperature: 36.8,
      },
    });
    assert(updateVsRes.status === 200, 'Superuser updates Vital Signs record -> 200 OK');

    const getVsHistory = await request<{ data: { records: Array<{ temperature: number }> } }>(`/modules/vital-signs/student/${superStudentId}`, {
      token: superUser.token,
    });
    assert(getVsHistory.status === 200, 'Superuser retrieves Vital Signs history -> 200 OK');
    assert(getVsHistory.body?.data?.records[0]?.temperature === 36.8, 'Vital Signs history reflects update');

    // 5.5 Immunization
    const createImmRes = await request<{ data: { id: number } }>('/modules/immunization', {
      method: 'POST',
      token: superUser.token,
      body: {
        student_id: superStudentId,
        immunization_date: '2026-08-25',
        school_id: testSchool.id,
        vaccine_td1: true,
        vaccine_mr1: true,
        consent_given: true,
        is_refused: false,
        educational_level: 'Elementary',
      },
    });
    assert(createImmRes.status === 201, 'Superuser creates Immunization record -> 201 Created');
    const immId = createImmRes.body.data?.id;
    if (immId) createdImmunizationIds.push(immId);

    const updateImmRes = await request<{ message: string }>(`/modules/immunization/${immId}`, {
      method: 'PUT',
      token: superUser.token,
      body: {
        vaccine_hpv1: true,
      },
    });
    assert(updateImmRes.status === 200, 'Superuser updates Immunization record -> 200 OK');

    const getImmHistory = await request<{ data: { records: Array<{ vaccine_hpv1: boolean }> } }>(`/modules/immunization/student/${superStudentId}`, {
      token: superUser.token,
    });
    assert(getImmHistory.status === 200, 'Superuser retrieves Immunization history -> 200 OK');
    assert(getImmHistory.body?.data?.records[0]?.vaccine_hpv1 === true, 'Immunization history reflects update');
    console.log('');

    // ─── 6. Teacher A Scope: Visible & Editable ─────────────────────────
    console.log("6. Testing Teacher A's Scoped Access (Own Students)...");
    const lrnTeacherA = `888${timestamp.toString().slice(-9)}`;
    const studentTeacherARes = await request<{ data: { id: number }; id?: number }>('/students', {
      method: 'POST',
      token: teacherA.token,
      body: {
        student_lrn: lrnTeacherA,
        first_name: 'StudentOfTeacherA',
        last_name: 'Test',
        sex: 'Male',
        date_of_birth: '2016-01-10',
        school_id: testSchool.id,
        grade_level: 'Grade 3',
        section: 'Mabini',
      },
    });
    assert(studentTeacherARes.status === 201, 'Teacher A creates student -> 201 Created');
    const studentAId = studentTeacherARes.body.data?.id || studentTeacherARes.body.id;
    if (studentAId) createdStudentIds.push(studentAId);

    // Teacher A lists students -> Student A present
    const listTeacherARes = await request<{ data: Array<{ id: number }> }>('/students', {
      token: teacherA.token,
    });
    assert(listTeacherARes.status === 200, 'Teacher A lists students -> 200 OK');
    assert(
      listTeacherARes.body.data.some((s) => s.id === studentAId),
      "Student A is visible in Teacher A's student list"
    );

    // Teacher A updates own student -> 200 OK
    const updateTeacherAStudent = await request<{ message: string }>(`/students/${studentAId}`, {
      method: 'PUT',
      token: teacherA.token,
      body: { section: 'Aguinaldo' },
    });
    assert(updateTeacherAStudent.status === 200, 'Teacher A updates own student -> 200 OK');

    // Teacher A creates module record for own student
    const teacherAPiRes = await request<{ data: { patient_info: { id: number } } }>('/modules/patient-info', {
      method: 'POST',
      token: teacherA.token,
      body: { student_id: studentAId, file_no: `TEACHER-A-FILE` },
    });
    assert(teacherAPiRes.status === 201, 'Teacher A creates Patient Info for own student -> 201 Created');
    const teacherAPiId = teacherAPiRes.body.data?.patient_info?.id;
    if (teacherAPiId) createdPatientInfoIds.push(teacherAPiId);
    console.log('');

    // ─── 7. Teacher B Isolation: Teacher A Records Forbidden ────────────
    console.log("7. Testing Teacher B Isolation (Cannot Access Teacher A's Data)...");

    // Teacher B list does NOT contain Student A
    const listTeacherBRes = await request<{ data: Array<{ id: number }> }>('/students', {
      token: teacherB.token,
    });
    assert(listTeacherBRes.status === 200, 'Teacher B lists students -> 200 OK');
    assert(
      !listTeacherBRes.body.data.some((s) => s.id === studentAId),
      "Student A is ABSENT from Teacher B's student list"
    );

    // Teacher B GET Student A -> 403 Forbidden
    const teacherBGetA = await request(`/students/${studentAId}`, {
      token: teacherB.token,
    });
    assert(teacherBGetA.status === 403, 'Teacher B accessing Student A -> 403 Forbidden');

    // Teacher B PUT Student A -> 403 Forbidden
    const teacherBPutA = await request(`/students/${studentAId}`, {
      method: 'PUT',
      token: teacherB.token,
      body: { section: 'HackedSection' },
    });
    assert(teacherBPutA.status === 403, 'Teacher B updating Student A -> 403 Forbidden');

    // Teacher B Profile Student A -> 403 Forbidden
    const teacherBProfileA = await request(`/students/${studentAId}/profile`, {
      token: teacherB.token,
    });
    assert(teacherBProfileA.status === 403, "Teacher B viewing Student A's profile -> 403 Forbidden");

    // Teacher B POST module record for Student A -> 403 Forbidden
    const teacherBModulePost = await request('/modules/patient-info', {
      method: 'POST',
      token: teacherB.token,
      body: { student_id: studentAId, file_no: 'B-HACK' },
    });
    assert(teacherBModulePost.status === 403, 'Teacher B recording Patient Info for Student A -> 403 Forbidden');

    // Teacher B GET module history for Student A -> 403 Forbidden
    const teacherBModuleGet = await request(`/modules/patient-info/student/${studentAId}`, {
      token: teacherB.token,
    });
    assert(teacherBModuleGet.status === 403, 'Teacher B viewing Patient Info history for Student A -> 403 Forbidden');

    // Teacher B PUT module record created by Teacher A -> 403 Forbidden
    const teacherBModulePut = await request(`/modules/patient-info/${teacherAPiId}`, {
      method: 'PUT',
      token: teacherB.token,
      body: { file_no: 'B-OVERRIDE' },
    });
    assert(teacherBModulePut.status === 403, "Teacher B updating Student A's Patient Info -> 403 Forbidden");
    console.log('');

    // ─── 8. Admin & Unauthenticated Strict RBAC Alignment ──────────────
    console.log('8. Testing Admin & Unauthenticated Access Enforcement...');

    // 8.1 Unauthenticated requests return 401
    const unauthStudentGet = await request('/students');
    assert(unauthStudentGet.status === 401, 'Unauth GET /api/students -> 401');

    const unauthStudentPost = await request('/students', { method: 'POST', body: {} });
    assert(unauthStudentPost.status === 401, 'Unauth POST /api/students -> 401');

    const unauthDash = await request('/modules/immunization/dashboard');
    assert(unauthDash.status === 401, 'Unauth GET /api/modules/immunization/dashboard -> 401');

    // 8.2 Admin cannot perform Student or Module CRUD (403)
    const adminStudentGet = await request('/students', { token: adminUser.token });
    assert(adminStudentGet.status === 403, 'Admin GET /api/students -> 403 Forbidden');

    const adminStudentPost = await request('/students', {
      method: 'POST',
      token: adminUser.token,
      body: { student_lrn: '000000000000' },
    });
    assert(adminStudentPost.status === 403, 'Admin POST /api/students -> 403 Forbidden');

    const adminModulePost = await request('/modules/patient-info', {
      method: 'POST',
      token: adminUser.token,
      body: { student_id: superStudentId },
    });
    assert(adminModulePost.status === 403, 'Admin POST /api/modules/patient-info -> 403 Forbidden');

    // 8.3 Admin CAN view Dashboards & Deworming Report (200 OK)
    const adminOverview = await request('/dashboard/overview', { token: adminUser.token });
    assert(adminOverview.status === 200, 'Admin GET /api/dashboard/overview -> 200 OK');

    const adminImmDash = await request('/modules/immunization/dashboard', { token: adminUser.token });
    assert(adminImmDash.status === 200, 'Admin GET /api/modules/immunization/dashboard -> 200 OK');

    const adminDewormReport = await request('/modules/deworming/report', {
      token: adminUser.token,
      params: { period: currentMonth },
    });
    assert(adminDewormReport.status === 200, 'Admin GET /api/modules/deworming/report -> 200 OK');

    // 8.4 Teacher CANNOT view Dashboards or Reports (403)
    const teacherOverview = await request('/dashboard/overview', { token: teacherA.token });
    assert(teacherOverview.status === 403, 'Teacher GET /api/dashboard/overview -> 403 Forbidden');

    const teacherImmDash = await request('/modules/immunization/dashboard', { token: teacherA.token });
    assert(teacherImmDash.status === 403, 'Teacher GET /api/modules/immunization/dashboard -> 403 Forbidden');

    const teacherDewormReport = await request('/modules/deworming/report', {
      token: teacherA.token,
      params: { period: currentMonth },
    });
    assert(teacherDewormReport.status === 403, 'Teacher GET /api/modules/deworming/report -> 403 Forbidden');
    console.log('');

  } finally {
    // ─── 9. CLEANUP: Isolated Fixtures ─────────────────────────────────
    console.log('9. Cleaning up test data from PostgreSQL...');
    try {
      if (createdAnimalBiteIds.length > 0) {
        await pool.query(`DELETE FROM ANIMAL_BITES WHERE id = ANY($1::int[])`, [createdAnimalBiteIds]);
      }
      if (createdPatientInfoIds.length > 0) {
        await pool.query(`DELETE FROM ANIMAL_BITES WHERE patient_info_id = ANY($1::int[])`, [createdPatientInfoIds]);
        await pool.query(`DELETE FROM PATIENT_INFO WHERE id = ANY($1::int[])`, [createdPatientInfoIds]);
      }
      if (createdOralHealthIds.length > 0) {
        await pool.query(`DELETE FROM ORAL_HEALTH WHERE id = ANY($1::int[])`, [createdOralHealthIds]);
      }
      if (createdDewormingIds.length > 0) {
        await pool.query(`DELETE FROM DEWORMING WHERE id = ANY($1::int[])`, [createdDewormingIds]);
      }
      if (createdVitalSignsIds.length > 0) {
        await pool.query(`DELETE FROM VITAL_SIGNS WHERE id = ANY($1::int[])`, [createdVitalSignsIds]);
      }
      if (createdImmunizationIds.length > 0) {
        await pool.query(`DELETE FROM IMMUNIZATION WHERE id = ANY($1::int[])`, [createdImmunizationIds]);
      }
      if (createdStudentIds.length > 0) {
        // Clear all module records associated with test students
        await pool.query(`DELETE FROM ANIMAL_BITES WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
        await pool.query(`DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
        await pool.query(`DELETE FROM ORAL_HEALTH WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
        await pool.query(`DELETE FROM DEWORMING WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
        await pool.query(`DELETE FROM VITAL_SIGNS WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
        await pool.query(`DELETE FROM IMMUNIZATION WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
        await pool.query(`DELETE FROM STUDENTS WHERE id = ANY($1::int[])`, [createdStudentIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
      }
      console.log('  ✅ Database cleanup completed cleanly.\n');
    } catch (cleanupErr) {
      console.error('  ⚠️ Cleanup warning:', cleanupErr);
    }
  }

  console.log('===============================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
