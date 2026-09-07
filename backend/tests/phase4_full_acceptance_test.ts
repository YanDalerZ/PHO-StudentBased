/**
 * Phase 4 Full End-to-End Acceptance Test Suite
 * 
 * Verifies all 5 Phase 4 Acceptance Domains against live PostgreSQL:
 * 1. Admin Authentication & Route Protection (Admin, Teacher, Superuser, Anonymous)
 * 2. Admin Dashboard Aggregations (Users by role, Total students, Active modules, Recent users vs direct SQL)
 * 3. User Management (Teacher/Superuser creation, bcrypt verification, role login, update, deactivate, unlock, admin creation rejection)
 * 4. Module Management (5 approved modules, attribute update, sort order, deactivation impact on teacher records, reactivation)
 * 5. School Management (Creation with cascading lookups, edit, mismatched mun/bgy rejection, inactive school teacher handling, reactivation)
 * 
 * Run with: npx tsx tests/phase4_full_acceptance_test.ts
 */

import pool from '../src/database/db.js';
import bcrypt from 'bcryptjs';

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

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
  } = {}
): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE_URL}${path}`);
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

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error('         Details:', detail);
    failed++;
  }
}

async function runAcceptanceTest() {
  console.log('================================================================');
  console.log('🏁 PHASE 4: ADMIN PORTAL FULL ACCEPTANCE VERIFICATION SUITE');
  console.log('================================================================\n');

  // Fixture tracking for cleanup
  const cleanupUserIds: number[] = [];
  const cleanupSchoolIds: number[] = [];
  const cleanupStudentIds: number[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN 1: AUTHENTICATION & ROUTE PROTECTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- DOMAIN 1: Admin Authentication & Route Protection ---');

    // 1.1 Anonymous access blocked
    const anonDashboard = await request('/admin/dashboard');
    assert(anonDashboard.status === 401, 'Anonymous request to /api/admin/dashboard returns 401');

    const anonUsers = await request('/admin/users');
    assert(anonUsers.status === 401, 'Anonymous request to /api/admin/users returns 401');

    const anonModules = await request('/admin/modules');
    assert(anonModules.status === 401, 'Anonymous request to /api/admin/modules returns 401');

    const anonSchools = await request('/admin/schools');
    assert(anonSchools.status === 401, 'Anonymous request to /api/admin/schools returns 401');

    // 1.2 Invalid JWT blocked
    const invalidJwt = await request('/admin/dashboard', { token: 'invalid.jwt.token' });
    assert(invalidJwt.status === 401 || invalidJwt.status === 403, 'Invalid token returns 401/403');

    // 1.3 Authenticate all 3 roles
    const adminAuth = await request<{ token: string; user: { role: string } }>('/auth/login', {
      method: 'POST',
      body: { email: 'admin@pho.gov.ph', password: 'password123' },
    });
    assert(adminAuth.status === 200 && Boolean(adminAuth.body?.token), 'Admin login succeeds (200)');
    assert(adminAuth.body?.user?.role === 'admin', 'Admin role verified in login response');
    const adminToken = adminAuth.body?.token;

    const teacherAuth = await request<{ token: string; user: { id: number; role: string } }>('/auth/login', {
      method: 'POST',
      body: { email: 'teacher@pho.gov.ph', password: 'password123' },
    });
    assert(teacherAuth.status === 200 && Boolean(teacherAuth.body?.token), 'Teacher login succeeds (200)');
    const teacherToken = teacherAuth.body?.token;
    const teacherId = teacherAuth.body?.user?.id;

    const superuserAuth = await request<{ token: string; user: { role: string } }>('/auth/login', {
      method: 'POST',
      body: { email: 'super@pho.gov.ph', password: 'password123' },
    });
    assert(superuserAuth.status === 200 && Boolean(superuserAuth.body?.token), 'Superuser login succeeds (200)');
    const superuserToken = superuserAuth.body?.token;

    // 1.4 Non-admin roles denied access to all /api/admin/* endpoints
    const teacherAdminEndpoints = ['/admin/dashboard', '/admin/users', '/admin/modules', '/admin/schools'];
    for (const ep of teacherAdminEndpoints) {
      const res = await request(ep, { token: teacherToken });
      assert(res.status === 403, `Teacher denied on ${ep} (403 Forbidden)`);
    }

    const superuserAdminEndpoints = ['/admin/dashboard', '/admin/users', '/admin/modules', '/admin/schools'];
    for (const ep of superuserAdminEndpoints) {
      const res = await request(ep, { token: superuserToken });
      assert(res.status === 403, `Superuser denied on ${ep} (403 Forbidden)`);
    }

    // 1.5 Admin allowed on all endpoints
    const adminDashboardRes = await request('/admin/dashboard', { token: adminToken });
    assert(adminDashboardRes.status === 200, 'Admin allowed on /admin/dashboard (200 OK)');
    const adminUsersRes = await request('/admin/users', { token: adminToken });
    assert(adminUsersRes.status === 200, 'Admin allowed on /admin/users (200 OK)');
    const adminModulesRes = await request('/admin/modules', { token: adminToken });
    assert(adminModulesRes.status === 200, 'Admin allowed on /admin/modules (200 OK)');
    const adminSchoolsRes = await request('/admin/schools', { token: adminToken });
    assert(adminSchoolsRes.status === 200, 'Admin allowed on /admin/schools (200 OK)');

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN 2: ADMIN DASHBOARD AGGREGATIONS VS DIRECT DATABASE
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- DOMAIN 2: Admin Dashboard Aggregations vs Real PostgreSQL ---');

    interface DashboardResponse {
      data: {
        users_by_role: {
          teacher: number;
          superuser: number;
          admin: number;
          total: number;
        };
        total_students: number;
        active_modules: number;
        recent_users: Array<{
          id: number;
          email: string;
          first_name: string;
          last_name: string;
          role: string;
          is_active: boolean;
          password_hash?: unknown;
        }>;
      };
    }

    const dashApi = await request<DashboardResponse>('/admin/dashboard', { token: adminToken });
    assert(dashApi.status === 200, 'GET /api/admin/dashboard returns 200');
    const apiData = dashApi.body.data;

    // Direct SQL validation
    const sqlTeachers = await pool.query("SELECT COUNT(*)::int as c FROM USERS WHERE role = 'teacher'");
    const sqlSuperusers = await pool.query("SELECT COUNT(*)::int as c FROM USERS WHERE role = 'superuser'");
    const sqlAdmins = await pool.query("SELECT COUNT(*)::int as c FROM USERS WHERE role = 'admin'");
    const sqlStudents = await pool.query('SELECT COUNT(*)::int as c FROM STUDENTS');
    const sqlActiveModules = await pool.query('SELECT COUNT(*)::int as c FROM MODULES WHERE is_active = TRUE');

    assert(apiData.users_by_role.teacher === sqlTeachers.rows[0].c, 'Dashboard teacher count matches PostgreSQL');
    assert(apiData.users_by_role.superuser === sqlSuperusers.rows[0].c, 'Dashboard superuser count matches PostgreSQL');
    assert(apiData.users_by_role.admin === sqlAdmins.rows[0].c, 'Dashboard admin count matches PostgreSQL');
    assert(
      apiData.users_by_role.total ===
        apiData.users_by_role.teacher + apiData.users_by_role.superuser + apiData.users_by_role.admin,
      'Dashboard total users matches sum of roles'
    );
    assert(apiData.total_students === sqlStudents.rows[0].c, 'Dashboard total_students matches PostgreSQL');
    assert(apiData.active_modules === sqlActiveModules.rows[0].c, 'Dashboard active_modules matches PostgreSQL');

    // Verify recent users security (no leaked password_hash)
    assert(Array.isArray(apiData.recent_users) && apiData.recent_users.length <= 10, 'recent_users is bounded array (<=10)');
    const leakedHash = apiData.recent_users.some((u) => u.password_hash !== undefined);
    assert(!leakedHash, 'Zero password_hash fields leaked in recent_users');

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN 3: USER MANAGEMENT & CREDENTIAL LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- DOMAIN 3: User Management Lifecycle ---');

    const testTimestamp = Date.now();
    const newTeacherPayload = {
      email: `test.teacher.${testTimestamp}@example.com`,
      password: 'StrongTeacher123!',
      role: 'teacher',
      first_name: 'Acceptance',
      last_name: 'Teacher',
      contact_no: '09171234567',
    };

    // 3.1 Create Teacher
    const createTeacherRes = await request<{ data: { id: number; email: string; role: string; password_hash?: unknown } }>(
      '/admin/users',
      {
        method: 'POST',
        token: adminToken,
        body: newTeacherPayload,
      }
    );
    assert(createTeacherRes.status === 201, 'POST /api/admin/users creates teacher (201 Created)');
    assert(createTeacherRes.body?.data?.role === 'teacher', 'Created user has role teacher');
    assert(createTeacherRes.body?.data?.password_hash === undefined, 'POST /admin/users omits password_hash in response');
    const newTeacherId = createTeacherRes.body?.data?.id;
    if (newTeacherId) cleanupUserIds.push(newTeacherId);

    // 3.2 Verify bcrypt hash in database
    const dbTeacher = await pool.query('SELECT password_hash FROM USERS WHERE id = $1', [newTeacherId]);
    const storedHash = dbTeacher.rows[0]?.password_hash;
    assert(typeof storedHash === 'string' && storedHash.startsWith('$2'), 'Password stored as valid bcrypt hash in PostgreSQL');
    const bcryptValid = await bcrypt.compare(newTeacherPayload.password, storedHash);
    assert(bcryptValid, 'Stored bcrypt hash verifies against original password');

    // 3.3 Create Superuser
    const newSuperPayload = {
      email: `test.super.${testTimestamp}@example.com`,
      password: 'StrongSuper123!',
      role: 'superuser',
      first_name: 'Acceptance',
      last_name: 'Super',
      contact_no: '09187654321',
    };
    const createSuperRes = await request<{ data: { id: number; role: string } }>('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: newSuperPayload,
    });
    assert(createSuperRes.status === 201, 'POST /api/admin/users creates superuser (201 Created)');
    assert(createSuperRes.body?.data?.role === 'superuser', 'Created user has role superuser');
    const newSuperId = createSuperRes.body?.data?.id;
    if (newSuperId) cleanupUserIds.push(newSuperId);

    // 3.4 Verify created users can authenticate
    const testTeacherLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherPayload.email, password: newTeacherPayload.password },
    });
    assert(testTeacherLogin.status === 200, 'Newly created teacher authenticates successfully');

    const testSuperLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newSuperPayload.email, password: newSuperPayload.password },
    });
    assert(testSuperLogin.status === 200, 'Newly created superuser authenticates successfully');

    // 3.5 Prevent admin creation or escalation
    const createAdminAttempt = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        email: `hacked.admin.${testTimestamp}@example.com`,
        password: 'AdminPassword123!',
        role: 'admin',
        first_name: 'Illegal',
        last_name: 'Admin',
      },
    });
    assert(createAdminAttempt.status === 400, 'Attempting to create admin role rejected with 400 Bad Request');

    const escalateAttempt = await request(`/admin/users/${newTeacherId}`, {
      method: 'PUT',
      token: adminToken,
      body: { role: 'admin' },
    });
    assert(escalateAttempt.status === 400, 'Role escalation to admin via PUT /admin/users/:id rejected with 400');

    // 3.6 Update user details & password
    const updatedPass = 'UpdatedTeacherPass456!';
    const updateTeacherRes = await request<{ data: { first_name: string; contact_no: string } }>(
      `/admin/users/${newTeacherId}`,
      {
        method: 'PUT',
        token: adminToken,
        body: {
          first_name: 'AcceptanceUpdated',
          contact_no: '09999999999',
          password: updatedPass,
        },
      }
    );
    assert(updateTeacherRes.status === 200, 'PUT /api/admin/users/:id updates profile and password');
    assert(updateTeacherRes.body?.data?.first_name === 'AcceptanceUpdated', 'Updated first_name persisted');

    const oldPassLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherPayload.email, password: newTeacherPayload.password },
    });
    assert(oldPassLogin.status === 401, 'Old password fails authentication (401 Unauthorized)');

    const newPassLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherPayload.email, password: updatedPass },
    });
    assert(newPassLogin.status === 200, 'Updated password authenticates successfully (200 OK)');

    // 3.7 Deactivate account & verify login blocked
    const deactivateRes = await request<{ data: { is_active: boolean } }>(
      `/admin/users/${newTeacherId}/status`,
      {
        method: 'PATCH',
        token: adminToken,
        body: { action: 'deactivate' },
      }
    );
    assert(deactivateRes.status === 200 && deactivateRes.body?.data?.is_active === false, 'Deactivate user returns is_active=false');

    const deactivatedLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherPayload.email, password: updatedPass },
    });
    assert(deactivatedLogin.status === 403, 'Deactivated user blocked from logging in (403 Forbidden)');

    // 3.8 Unlock locked account & verify login restored
    const unlockRes = await request<{ data: { is_active: boolean } }>(
      `/admin/users/${newTeacherId}/status`,
      {
        method: 'PATCH',
        token: adminToken,
        body: { action: 'unlock' },
      }
    );
    assert(unlockRes.status === 200 && unlockRes.body?.data?.is_active === true, 'Unlock user returns is_active=true');

    const unlockedLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherPayload.email, password: updatedPass },
    });
    assert(unlockedLogin.status === 200, 'Unlocked user authenticates successfully (200 OK)');

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN 4: MODULE MANAGEMENT & AVAILABILITY ENFORCEMENT
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- DOMAIN 4: Module Management & Availability Enforcement ---');

    // 4.1 Verify exactly 5 approved modules
    const modulesRes = await request<{ data: Array<{ id: number; slug: string; name: string; is_active: boolean; sort_order: number }> }>(
      '/admin/modules',
      { token: adminToken }
    );
    assert(modulesRes.status === 200, 'GET /api/admin/modules returns 200 OK');
    const approvedSlugs = ['patient-info', 'oral-health', 'deworming', 'vital-signs', 'immunization'];
    const returnedSlugs = modulesRes.body.data.map((m) => m.slug);
    const allApprovedPresent = approvedSlugs.every((slug) => returnedSlugs.includes(slug));
    assert(allApprovedPresent, 'All 5 approved core modules are present in module management');

    // 4.2 Edit module attributes and sort order
    const oralHealthModule = modulesRes.body.data.find((m) => m.slug === 'oral-health')!;
    const originalDesc = oralHealthModule.name;
    const updateModRes = await request<{ data: { description: string; sort_order: number } }>(
      `/admin/modules/${oralHealthModule.id}`,
      {
        method: 'PUT',
        token: adminToken,
        body: {
          description: 'Verified Dental Health Program',
          sort_order: 10,
        },
      }
    );
    assert(updateModRes.status === 200, 'PUT /api/admin/modules/:id updates description and sort_order');
    assert(updateModRes.body?.data?.description === 'Verified Dental Health Program', 'Updated description persisted');
    assert(updateModRes.body?.data?.sort_order === 10, 'Updated sort_order persisted');

    // Restore original description
    await request(`/admin/modules/${oralHealthModule.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { description: originalDesc, sort_order: 2 },
    });

    // 4.3 Deactivate Deworming & verify teacher-facing API blocks data entry
    const dewormingModule = modulesRes.body.data.find((m) => m.slug === 'deworming')!;
    const deactDewormingRes = await request(`/admin/modules/${dewormingModule.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { is_active: false },
    });
    assert(deactDewormingRes.status === 200, 'Admin deactivated Deworming module (is_active=false)');

    // Teacher creates a student for testing module data entry
    const testStudentLrn = `STU${Date.now().toString().slice(-9)}`;
    const studentRes = await pool.query<{ id: number }>(
      `INSERT INTO STUDENTS (student_lrn, first_name, last_name, sex, date_of_birth, school_id, registered_by)
       VALUES ($1, 'ModuleQA', 'Student', 'Female', '2016-04-12', 1, $2)
       RETURNING id`,
      [testStudentLrn, teacherId]
    );
    const testStudentId = studentRes.rows[0].id;
    cleanupStudentIds.push(testStudentId);

    // Teacher attempts to record Deworming data while module is inactive
    const teacherDewormingAttempt = await request('/modules/deworming', {
      method: 'POST',
      token: teacherToken,
      body: {
        student_id: testStudentId,
        date_dewormed: '2026-09-01',
        medication_given: 'Albendazole 400mg',
        is_dewormed: true,
      },
    });
    assert(
      teacherDewormingAttempt.status === 403,
      'Teacher POST /api/modules/deworming rejected with 403 Forbidden while module is deactivated'
    );

    // 4.4 Reactivate Deworming module & verify data entry capability restored
    await request(`/admin/modules/${dewormingModule.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { is_active: true },
    });
    const teacherDewormingSuccess = await request<{ data: { id: number } }>('/modules/deworming', {
      method: 'POST',
      token: teacherToken,
      body: {
        student_id: testStudentId,
        date_dewormed: '2026-09-01',
        medication_given: 'Albendazole 400mg',
        is_dewormed: true,
      },
    });
    assert(
      teacherDewormingSuccess.status === 201,
      'Teacher POST /api/modules/deworming succeeds with 201 Created after module reactivation'
    );

    // Clean up test deworming record
    if (teacherDewormingSuccess.body?.data?.id) {
      await pool.query('DELETE FROM DEWORMING WHERE id = $1', [teacherDewormingSuccess.body.data.id]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN 5: SCHOOL MANAGEMENT & CASCADING GEOGRAPHIC INTEGRATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- DOMAIN 5: School Management & Cascading Geographic Validation ---');

    // 5.1 Fetch real geographic lookups
    const munList = await request<Array<{ id: number; name: string }>>('/lookup/municipalities', {
      token: adminToken,
    });
    const kaliboMun = munList.body.find((m) => m.name.toLowerCase().includes('kalibo')) || munList.body[0]!;
    const otherMun = munList.body.find((m) => m.id !== kaliboMun.id) || munList.body[1]!;

    const kaliboBgys = await request<Array<{ id: number; name: string }>>(`/lookup/barangays/${kaliboMun.id}`, {
      token: adminToken,
    });
    const kaliboBgy = kaliboBgys.body[0]!;

    const otherBgys = await request<Array<{ id: number; name: string }>>(`/lookup/barangays/${otherMun.id}`, {
      token: adminToken,
    });
    const otherBgy = otherBgys.body[0]!;

    // 5.2 Create school with valid cascading assignment
    const schoolPayload = {
      name: `Acceptance High School ${Date.now()}`,
      address: '456 Acceptance Blvd',
      municipality_id: kaliboMun.id,
      barangay_id: kaliboBgy.id,
      district: 'District III',
      is_active: true,
    };
    const createSchoolRes = await request<{ data: { id: number; name: string; is_active: boolean } }>(
      '/admin/schools',
      {
        method: 'POST',
        token: adminToken,
        body: schoolPayload,
      }
    );
    assert(createSchoolRes.status === 201, 'POST /api/admin/schools creates school (201 Created)');
    const schoolId = createSchoolRes.body?.data?.id;
    if (schoolId) cleanupSchoolIds.push(schoolId);

    // 5.3 Verify school appears in teacher lookup cascade
    const lookupSchoolsRes = await request<Array<{ id: number; name: string }>>(`/lookup/schools/${kaliboBgy.id}`, {
      token: teacherToken,
    });
    assert(
      lookupSchoolsRes.body?.some((s) => s.id === schoolId),
      'Created school appears in teacher registration lookup cascade'
    );

    // 5.4 Reject mismatched municipality and barangay
    const mismatchRes = await request('/admin/schools', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Mismatched School',
        municipality_id: kaliboMun.id,
        barangay_id: otherBgy.id, // belongs to otherMun!
      },
    });
    assert(mismatchRes.status === 400, 'POST /admin/schools with mismatched municipality and barangay rejected (400)');

    // 5.5 Edit school details & verify persistence
    const updateSchoolRes = await request<{ data: { district: string; address: string } }>(
      `/admin/schools/${schoolId}`,
      {
        method: 'PUT',
        token: adminToken,
        body: {
          district: 'District III (Verified)',
          address: '789 Updated Highway',
        },
      }
    );
    assert(updateSchoolRes.status === 200, 'PUT /api/admin/schools/:id updates school details');
    assert(updateSchoolRes.body?.data?.district === 'District III (Verified)', 'Updated district persisted');

    // 5.6 Deactivate school: omitted from teacher lookup, rejects student enrollment
    await request(`/admin/schools/${schoolId}`, {
      method: 'PUT',
      token: adminToken,
      body: { is_active: false },
    });
    const lookupAfterDeact = await request<Array<{ id: number }>>(`/lookup/schools/${kaliboBgy.id}`, {
      token: teacherToken,
    });
    assert(!lookupAfterDeact.body?.some((s) => s.id === schoolId), 'Deactivated school omitted from teacher lookup');

    const enrollInactiveRes = await request('/students', {
      method: 'POST',
      token: teacherToken,
      body: {
        student_lrn: `LRN_INACT_${Date.now().toString().slice(-6)}`,
        first_name: 'Inactive',
        last_name: 'SchoolStudent',
        sex: 'Male',
        date_of_birth: '2016-01-01',
        school_id: schoolId,
      },
    });
    assert(enrollInactiveRes.status === 400, 'Enrolling student under inactive school rejected with 400 Bad Request');

    // 5.7 Reactivate school: restored in lookup, enroll succeeds
    await request(`/admin/schools/${schoolId}`, {
      method: 'PUT',
      token: adminToken,
      body: { is_active: true },
    });
    const lookupAfterReact = await request<Array<{ id: number }>>(`/lookup/schools/${kaliboBgy.id}`, {
      token: teacherToken,
    });
    assert(lookupAfterReact.body?.some((s) => s.id === schoolId), 'Reactivated school restored in teacher lookup');

    const enrollActiveRes = await request<{ data: { id: number } }>('/students', {
      method: 'POST',
      token: teacherToken,
      body: {
        student_lrn: `LRN_ACT_${Date.now().toString().slice(-6)}`,
        first_name: 'Active',
        last_name: 'SchoolStudent',
        sex: 'Male',
        date_of_birth: '2016-01-01',
        school_id: schoolId,
      },
    });
    assert(enrollActiveRes.status === 201, 'Enrolling student under reactivated school succeeds with 201 Created');
    if (enrollActiveRes.body?.data?.id) cleanupStudentIds.push(enrollActiveRes.body.data.id);
  } finally {
    console.log('\n--- Cleaning up test fixtures ---');
    for (const sid of cleanupStudentIds) {
      await pool.query('DELETE FROM STUDENTS WHERE id = $1', [sid]);
    }
    for (const scid of cleanupSchoolIds) {
      await pool.query('DELETE FROM SCHOOLS WHERE id = $1', [scid]);
    }
    for (const uid of cleanupUserIds) {
      await pool.query('DELETE FROM USERS WHERE id = $1', [uid]);
    }
    console.log(`Cleaned up ${cleanupStudentIds.length} students, ${cleanupSchoolIds.length} schools, and ${cleanupUserIds.length} users.`);
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`📊 PHASE 4 ACCEPTANCE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTest().catch((err) => {
  console.error('Acceptance test failed with error:', err);
  process.exit(1);
});
