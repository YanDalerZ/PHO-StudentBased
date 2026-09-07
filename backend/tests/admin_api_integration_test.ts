/**
 * Phase 4 Admin API Foundation Integration Test Suite
 * 
 * Verifies:
 * 1. Security & RBAC:
 *    - Unauthenticated requests blocked (401).
 *    - Teacher & Superuser tokens blocked from all /api/admin/* endpoints (403).
 *    - Admin authorized on all /api/admin/* endpoints.
 * 2. System Dashboard:
 *    - GET /api/admin/dashboard aggregates users by role, total students, active modules, recent users.
 * 3. User Management:
 *    - Admin creates teacher and superuser (passwords stored as bcrypt hashes).
 *    - New accounts can log in via /api/auth/login and receive correct JWT role.
 *    - Admin cannot create an admin account (400).
 *    - Admin cannot promote a user to admin (400).
 *    - Deactivated user cannot log in (403).
 *    - Unlock resets failed_login_attempts to 0 and restores login access.
 *    - Password replacement via PUT updates bcrypt hash and allows login with new password.
 *    - Validation errors (400), Duplicate emails (409), Missing users (404).
 * 4. Module Management:
 *    - GET /api/admin/modules lists approved modules.
 *    - Non-approved module slugs rejected (400).
 *    - Duplicate slug rejected (409).
 *    - Update module attributes (200), missing module (404).
 * 5. School Management:
 *    - GET /api/admin/schools returns joined barangay and municipality info.
 *    - Non-existent barangay rejected (400).
 *    - Valid school created with joined geo return (201).
 *    - Update school (200), missing school (404).
 * 
 * Run with: npx tsx tests/admin_api_integration_test.ts
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
    token?: string | null | undefined;
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

async function runAdminApiTests() {
  console.log('===============================================================');
  console.log('🔒 Phase 4 Secure Admin API Foundation Integration Tests');
  console.log('===============================================================\n');

  const timestamp = Date.now();
  const testAdminEmail = `admin_test_${timestamp}@pho.test`;
  const testSuperEmail = `super_test_${timestamp}@pho.test`;
  const testTeacherEmail = `teacher_test_${timestamp}@pho.test`;
  const testPassword = 'password123';

  let adminToken = '';
  let superToken = '';
  let teacherToken = '';

  const createdUserIds: number[] = [];
  const createdSchoolIds: number[] = [];

  try {
    // ─── 0. SETUP TEST ACCOUNTS & TOKENS ─────────────────────────────────────
    console.log('0. Setting up test accounts and authenticating...');
    const setupHash = await bcrypt.hash(testPassword, 10);

    const insertUser = async (email: string, role: string, firstName: string, lastName: string) => {
      const res = await pool.query<{ id: number }>(
        `INSERT INTO USERS (email, password_hash, role, first_name, last_name, is_active, failed_login_attempts)
         VALUES ($1, $2, $3, $4, $5, TRUE, 0)
         RETURNING id`,
        [email, setupHash, role, firstName, lastName]
      );
      const id = res.rows[0]?.id;
      if (id) createdUserIds.push(id);
      return id;
    };

    await insertUser(testAdminEmail, 'admin', 'Test', 'Admin');
    await insertUser(testSuperEmail, 'superuser', 'Test', 'Superuser');
    await insertUser(testTeacherEmail, 'teacher', 'Test', 'Teacher');

    // Authenticate all three roles via real /api/auth/login endpoint
    const adminLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: testAdminEmail, password: testPassword },
    });
    adminToken = adminLogin.body?.token ?? '';
    assert(adminLogin.status === 200 && Boolean(adminToken), 'Admin successfully logged in via /api/auth/login');

    const superLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: testSuperEmail, password: testPassword },
    });
    superToken = superLogin.body?.token ?? '';
    assert(superLogin.status === 200 && Boolean(superToken), 'Superuser successfully logged in via /api/auth/login');

    const teacherLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: testTeacherEmail, password: testPassword },
    });
    teacherToken = teacherLogin.body?.token ?? '';
    assert(teacherLogin.status === 200 && Boolean(teacherToken), 'Teacher successfully logged in via /api/auth/login');

    // ─── 1. SECURITY & STRICT RBAC VERIFICATION ─────────────────────────────
    console.log('\n1. Verifying Security & RBAC Enforcement...');

    // 1.1 Unauthenticated requests return 401
    const unauthDashboard = await request('/admin/dashboard');
    assert(unauthDashboard.status === 401, 'Unauthenticated /api/admin/dashboard returns 401');

    const unauthUsers = await request('/admin/users');
    assert(unauthUsers.status === 401, 'Unauthenticated /api/admin/users returns 401');

    const unauthModules = await request('/admin/modules');
    assert(unauthModules.status === 401, 'Unauthenticated /api/admin/modules returns 401');

    const unauthSchools = await request('/admin/schools');
    assert(unauthSchools.status === 401, 'Unauthenticated /api/admin/schools returns 401');

    // 1.2 Teacher token returns 403 on every admin endpoint
    const teacherDash = await request('/admin/dashboard', { token: teacherToken });
    assert(teacherDash.status === 403, 'Teacher receiving 403 on /api/admin/dashboard');

    const teacherUsers = await request('/admin/users', { token: teacherToken });
    assert(teacherUsers.status === 403, 'Teacher receiving 403 on /api/admin/users');

    const teacherModules = await request('/admin/modules', { token: teacherToken });
    assert(teacherModules.status === 403, 'Teacher receiving 403 on /api/admin/modules');

    const teacherSchools = await request('/admin/schools', { token: teacherToken });
    assert(teacherSchools.status === 403, 'Teacher receiving 403 on /api/admin/schools');

    // 1.3 Superuser token returns 403 on every admin endpoint
    const superDash = await request('/admin/dashboard', { token: superToken });
    assert(superDash.status === 403, 'Superuser receiving 403 on /api/admin/dashboard');

    const superUsers = await request('/admin/users', { token: superToken });
    assert(superUsers.status === 403, 'Superuser receiving 403 on /api/admin/users');

    const superModules = await request('/admin/modules', { token: superToken });
    assert(superModules.status === 403, 'Superuser receiving 403 on /api/admin/modules');

    const superSchools = await request('/admin/schools', { token: superToken });
    assert(superSchools.status === 403, 'Superuser receiving 403 on /api/admin/schools');

    // ─── 2. SYSTEM DASHBOARD STATS ──────────────────────────────────────────
    console.log('\n2. Verifying System Dashboard Stats...');

    const dashRes = await request<{
      data: {
        users_by_role: { teacher: number; superuser: number; admin: number; total: number };
        total_students: number;
        active_modules: number;
        recent_users: Array<{ id: number; email: string; role: string }>;
      };
    }>('/admin/dashboard', { token: adminToken });

    assert(dashRes.status === 200, 'Admin can access /api/admin/dashboard (200)');
    const dashData = dashRes.body?.data;
    assert(typeof dashData?.users_by_role?.teacher === 'number', 'users_by_role.teacher is number');
    assert(typeof dashData?.users_by_role?.superuser === 'number', 'users_by_role.superuser is number');
    assert(typeof dashData?.users_by_role?.admin === 'number', 'users_by_role.admin is number');
    assert(dashData?.users_by_role?.total === (dashData?.users_by_role?.teacher ?? 0) + (dashData?.users_by_role?.superuser ?? 0) + (dashData?.users_by_role?.admin ?? 0), 'users_by_role.total matches sum');
    assert(typeof dashData?.total_students === 'number', 'total_students is number');
    assert(typeof dashData?.active_modules === 'number', 'active_modules is number');
    assert(Array.isArray(dashData?.recent_users), 'recent_users is an array');
    assert(
      (dashData?.recent_users ?? []).every((u: any) => u.password_hash === undefined),
      'Dashboard recent_users omits password_hash completely'
    );

    // ─── 3. USER MANAGEMENT (CREATION, LOGIN, RBAC, ESCALATION, STATUS) ──────
    console.log('\n3. Verifying User Management Endpoints...');

    // 3.1 Create Teacher
    const newTeacherEmail = `created_teacher_${timestamp}@pho.test`;
    const createTeacherRes = await request<{ data: { id: number; email: string; role: string; password_hash?: unknown } }>(
      '/admin/users',
      {
        method: 'POST',
        token: adminToken,
        body: {
          email: newTeacherEmail,
          password: 'TeacherSecurePass123!',
          role: 'teacher',
          first_name: 'Maria',
          last_name: 'Santos',
          contact_no: '09181112222',
        },
      }
    );

    assert(createTeacherRes.status === 201, 'Admin successfully created teacher account (201)');
    const createdTeacher = createTeacherRes.body?.data;
    if (createdTeacher?.id) createdUserIds.push(createdTeacher.id);
    assert(createdTeacher?.email === newTeacherEmail, 'Created teacher email matches');
    assert(createdTeacher?.role === 'teacher', 'Created teacher role is teacher');
    assert(createdTeacher?.password_hash === undefined, 'POST /admin/users response omits password_hash');

    // Verify stored password in database is bcrypt hash
    const dbTeacher = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM USERS WHERE id = $1',
      [createdTeacher?.id]
    );
    const storedHash = dbTeacher.rows[0]?.password_hash ?? '';
    assert(storedHash.startsWith('$2'), 'Teacher password in database is a bcrypt hash');
    const bcryptValid = await bcrypt.compare('TeacherSecurePass123!', storedHash);
    assert(bcryptValid, 'Stored bcrypt hash verifies against plain password');

    // Verify newly created teacher can log in
    const newTeacherLogin = await request<{ token: string; user: { role: string } }>('/auth/login', {
      method: 'POST',
      body: { email: newTeacherEmail, password: 'TeacherSecurePass123!' },
    });
    assert(newTeacherLogin.status === 200, 'Newly created teacher can log in via /api/auth/login');
    assert(newTeacherLogin.body?.user?.role === 'teacher', 'Logged in user has role teacher');

    // 3.2 Create Superuser
    const newSuperEmail = `created_super_${timestamp}@pho.test`;
    const createSuperRes = await request<{ data: { id: number; email: string; role: string; password_hash?: unknown } }>(
      '/admin/users',
      {
        method: 'POST',
        token: adminToken,
        body: {
          email: newSuperEmail,
          password: 'SuperSecurePass123!',
          role: 'superuser',
          first_name: 'Dr. Roberto',
          last_name: 'Dalisay',
          contact_no: '09193334444',
        },
      }
    );

    assert(createSuperRes.status === 201, 'Admin successfully created superuser account (201)');
    const createdSuper = createSuperRes.body?.data;
    if (createdSuper?.id) createdUserIds.push(createdSuper.id);
    assert(createdSuper?.role === 'superuser', 'Created user role is superuser');

    // Verify newly created superuser can log in
    const newSuperLogin = await request<{ token: string; user: { role: string } }>('/auth/login', {
      method: 'POST',
      body: { email: newSuperEmail, password: 'SuperSecurePass123!' },
    });
    assert(newSuperLogin.status === 200, 'Newly created superuser can log in via /api/auth/login');
    assert(newSuperLogin.body?.user?.role === 'superuser', 'Logged in user has role superuser');

    // 3.3 Security: Admin CANNOT create an admin account
    const tryCreateAdmin = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        email: `illegal_admin_${timestamp}@pho.test`,
        password: 'AdminPassword123!',
        role: 'admin',
        first_name: 'Illegal',
        last_name: 'Admin',
      },
    });
    assert(tryCreateAdmin.status === 400, 'Creating admin role via POST /admin/users is rejected (400)');

    // 3.4 Security: Admin CANNOT escalate a user to admin role
    const tryEscalateAdmin = await request(`/admin/users/${createdTeacher?.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        role: 'admin',
      },
    });
    assert(tryEscalateAdmin.status === 400, 'Role escalation to admin via PUT /admin/users/:id is rejected (400)');

    // 3.5 Status Management: Deactivation & Lockout
    const deactRes = await request<{ data: { is_active: boolean } }>(`/admin/users/${createdTeacher?.id}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { action: 'deactivate' },
    });
    assert(deactRes.status === 200 && deactRes.body?.data?.is_active === false, 'Deactivating teacher returns is_active=false');

    // Attempting login as deactivated user fails with 403
    const deactLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherEmail, password: 'TeacherSecurePass123!' },
    });
    assert(deactLogin.status === 403, 'Deactivated teacher cannot log in (403)');

    // Unlock restores login access
    const unlockRes = await request<{ data: { is_active: boolean; failed_login_attempts: number } }>(
      `/admin/users/${createdTeacher?.id}/status`,
      {
        method: 'PATCH',
        token: adminToken,
        body: { action: 'unlock' },
      }
    );
    assert(
      unlockRes.status === 200 &&
      unlockRes.body?.data?.is_active === true &&
      unlockRes.body?.data?.failed_login_attempts === 0,
      'Unlock resets failed_login_attempts to 0 and is_active to true'
    );

    const afterUnlockLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherEmail, password: 'TeacherSecurePass123!' },
    });
    assert(afterUnlockLogin.status === 200, 'Unlocked teacher can log in successfully (200)');

    // 3.6 Update Profile & Re-hash Password
    const updatedTeacherRes = await request<{ data: { first_name: string; contact_no: string } }>(
      `/admin/users/${createdTeacher?.id}`,
      {
        method: 'PUT',
        token: adminToken,
        body: {
          first_name: 'Maria Elena',
          contact_no: '09189990000',
          password: 'NewBrandPass999!',
        },
      }
    );
    assert(updatedTeacherRes.status === 200, 'PUT /admin/users/:id updates profile fields');
    assert(updatedTeacherRes.body?.data?.first_name === 'Maria Elena', 'Updated first_name verified');

    // Old password fails, new password succeeds
    const oldPassLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherEmail, password: 'TeacherSecurePass123!' },
    });
    assert(oldPassLogin.status === 401, 'Old password fails authentication (401)');

    const newPassLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: newTeacherEmail, password: 'NewBrandPass999!' },
    });
    assert(newPassLogin.status === 200, 'New updated password authenticates successfully (200)');

    // 3.7 Error cases: Duplicate email, Invalid payload, Missing user
    const duplicateEmail = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        email: newTeacherEmail,
        password: 'ValidPassword123!',
        role: 'teacher',
        first_name: 'Duplicate',
        last_name: 'Person',
      },
    });
    assert(duplicateEmail.status === 409, 'Duplicate email returns 409 Conflict');

    const invalidEmail = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        email: 'not-an-email',
        password: 'ValidPassword123!',
        role: 'teacher',
        first_name: 'Invalid',
        last_name: 'Person',
      },
    });
    assert(invalidEmail.status === 400, 'Invalid email format returns 400 Bad Request');

    const shortPassword = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        email: `short_pass_${timestamp}@pho.test`,
        password: 'short',
        role: 'teacher',
        first_name: 'Short',
        last_name: 'Pass',
      },
    });
    assert(shortPassword.status === 400, 'Password < 8 chars returns 400 Bad Request');

    const missingUserPut = await request('/admin/users/99999999', {
      method: 'PUT',
      token: adminToken,
      body: { first_name: 'Nobody' },
    });
    assert(missingUserPut.status === 404, 'Updating non-existent user returns 404 Not Found');

    // 3.8 List users with filters and pagination
    const listUsersRes = await request<{ data: Array<{ email: string }>; total: number }>(
      '/admin/users',
      {
        token: adminToken,
        params: { search: newTeacherEmail, role: 'teacher', page: 1, limit: 10 },
      }
    );
    assert(listUsersRes.status === 200, 'GET /admin/users returns 200');
    assert(listUsersRes.body?.total >= 1, 'Total count reflects created teacher');
    assert(
      (listUsersRes.body?.data ?? []).some((u) => u.email === newTeacherEmail),
      'Search finds created teacher'
    );

    // ─── 4. MODULE MANAGEMENT ───────────────────────────────────────────────
    console.log('\n4. Verifying Module Management Endpoints...');

    const getModulesRes = await request<{ data: Array<{ id: number; slug: string; name: string }>; total: number }>(
      '/admin/modules',
      { token: adminToken }
    );
    assert(getModulesRes.status === 200, 'GET /admin/modules returns 200');
    assert((getModulesRes.body?.total ?? 0) >= 5, 'At least 5 approved modules are registered');

    // Attempt to register an unapproved module
    const illegalModule = await request('/admin/modules', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Cardiology Module',
        slug: 'cardiology-tracker',
        description: 'Unapproved module',
      },
    });
    assert(illegalModule.status === 400, 'Creating module outside 5 approved slugs returns 400 Bad Request');

    // Attempt duplicate slug creation
    const dupModule = await request('/admin/modules', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Duplicate Oral Health',
        slug: 'oral-health',
      },
    });
    assert(dupModule.status === 409, 'Duplicate module slug returns 409 Conflict');

    // Update existing module
    const firstModule = getModulesRes.body?.data?.[0];
    if (firstModule) {
      const updateModRes = await request<{ data: { id: number; description: string } }>(
        `/admin/modules/${firstModule.id}`,
        {
          method: 'PUT',
          token: adminToken,
          body: {
            description: `Updated description timestamp ${timestamp}`,
          },
        }
      );
      assert(updateModRes.status === 200, 'PUT /admin/modules/:id updates description');
      assert(
        updateModRes.body?.data?.description === `Updated description timestamp ${timestamp}`,
        'Updated module description matches'
      );
    }

    const missingModRes = await request('/admin/modules/999999', {
      method: 'PUT',
      token: adminToken,
      body: { name: 'Non Existent' },
    });
    assert(missingModRes.status === 404, 'Updating non-existent module returns 404 Not Found');

    // ─── 5. SCHOOL MANAGEMENT (JOINED GEO, BARANGAY VALIDATION) ─────────────
    console.log('\n5. Verifying School Management Endpoints...');

    const getSchoolsRes = await request<{
      data: Array<{ id: number; name: string; barangay_name: string | null; municipality_name: string | null }>;
      total: number;
    }>('/admin/schools', { token: adminToken });
    assert(getSchoolsRes.status === 200, 'GET /admin/schools returns 200');
    assert(Array.isArray(getSchoolsRes.body?.data), 'Schools data is an array');

    // Non-existent barangay returns 400
    const invalidBgySchool = await request('/admin/schools', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Invalid Barangay Academy',
        barangay_id: 9999999,
        district: 'District I',
      },
    });
    assert(invalidBgySchool.status === 400, 'School creation with non-existent barangay_id returns 400');

    // Valid school creation (Kalibo Poblacion, barangay_id = 13)
    const schoolName = `PHO Test Academy ${timestamp}`;
    const createSchoolRes = await request<{
      data: {
        id: number;
        name: string;
        barangay_id: number;
        barangay_name: string;
        municipality_name: string;
      };
    }>('/admin/schools', {
      method: 'POST',
      token: adminToken,
      body: {
        name: schoolName,
        address: 'Poblacion Main Street',
        barangay_id: 13,
        district: 'District II',
      },
    });

    assert(createSchoolRes.status === 201, 'POST /admin/schools creates school (201)');
    const createdSchool = createSchoolRes.body?.data;
    if (createdSchool?.id) createdSchoolIds.push(createdSchool.id);
    assert(createdSchool?.name === schoolName, 'Created school name matches');
    assert(Boolean(createdSchool?.barangay_name), 'Created school returns joined barangay_name');
    assert(createdSchool?.municipality_name === 'Kalibo', 'Created school returns joined municipality_name (Kalibo)');

    // Update School details
    const updatedSchoolName = `${schoolName} - Updated`;
    const updateSchoolRes = await request<{ data: { name: string; district: string } }>(
      `/admin/schools/${createdSchool?.id}`,
      {
        method: 'PUT',
        token: adminToken,
        body: {
          name: updatedSchoolName,
          district: 'District III',
        },
      }
    );
    assert(updateSchoolRes.status === 200, 'PUT /admin/schools/:id updates school');
    assert(updateSchoolRes.body?.data?.name === updatedSchoolName, 'Updated school name matches');
    assert(updateSchoolRes.body?.data?.district === 'District III', 'Updated district matches');

    const missingSchoolPut = await request('/admin/schools/999999', {
      method: 'PUT',
      token: adminToken,
      body: { name: 'Non Existent School' },
    });
    assert(missingSchoolPut.status === 404, 'Updating non-existent school returns 404 Not Found');

    const invalidBgySchoolPut = await request(`/admin/schools/${createdSchool?.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { barangay_id: 999999 },
    });
    assert(invalidBgySchoolPut.status === 400, 'Updating school with invalid barangay_id returns 400');

  } catch (error) {
    console.error('Unexpected test error:', error);
    failed++;
  } finally {
    // ─── 6. CLEANUP FIXTURES ────────────────────────────────────────────────
    console.log('\n6. Cleaning up test data...');
    try {
      if (createdSchoolIds.length > 0) {
        await pool.query(`DELETE FROM SCHOOLS WHERE id = ANY($1::int[])`, [createdSchoolIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
      }
      console.log('✅ Cleanup complete.');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup error:', cleanupError);
    }
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminApiTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
