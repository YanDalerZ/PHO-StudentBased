/**
 * Admin User Management Integration & Contract Test
 * 
 * Verifies:
 * 1. Admin creates a teacher and superuser; both appear in user list and can log in.
 * 2. Search by name/email and role filters function properly.
 * 3. Duplicate email and invalid input (e.g. short password, invalid role 'admin') return safe validation errors (409, 400).
 * 4. Admin edits user details and password; updated credentials work for login.
 * 5. Admin deactivates a user; login fails (403).
 * 6. Admin unlocks a locked user; login succeeds (200).
 * 7. Teacher and superuser cannot access Admin User APIs (403).
 * 8. Clean up of test records.
 * 
 * Run with: npx tsx tests/admin_user_management_integration_test.ts
 */

import pool from '../src/database/db.js';

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

async function runTests() {
  console.log('--- STARTING ADMIN USER MANAGEMENT INTEGRATION TEST ---\n');
  let testsPassed = 0;
  let testsFailed = 0;

  const assert = (condition: boolean, testName: string, details?: unknown) => {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      testsPassed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) {
        console.error('       Details:', JSON.stringify(details, null, 2));
      }
      testsFailed++;
    }
  };

  const testTeacherEmail = 'test_teacher_um_' + Date.now() + '@pho.gov.ph';
  const testSuperuserEmail = 'test_superuser_um_' + Date.now() + '@pho.gov.ph';
  let teacherUserId: number | null = null;
  let superuserUserId: number | null = null;

  try {
    // Step 1: Admin Login
    console.log('1. Authenticating as Admin...');
    const adminLoginRes = await request<{
      token: string;
      user: { id: number; email: string; role: string };
    }>('/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@pho.gov.ph',
        password: 'password123',
      },
    });

    assert(adminLoginRes.status === 200, 'Admin login returns 200 OK');
    const adminToken = adminLoginRes.body?.token;
    assert(!!adminToken, 'Admin received a valid JWT token');

    // Step 2: Admin creates a Teacher
    console.log('\n2. Admin creating a Teacher account...');
    const createTeacherRes = await request<{
      success: boolean;
      data: {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
        role: string;
        is_active: boolean;
      };
    }>('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        first_name: 'TestTeacher',
        last_name: 'Encoder',
        email: testTeacherEmail,
        contact_no: '09171112233',
        role: 'teacher',
        password: 'InitialPassword123!',
      },
    });

    assert(createTeacherRes.status === 201, 'POST /api/admin/users creates teacher with 201 Created', createTeacherRes.body);
    assert(createTeacherRes.body.data?.role === 'teacher', 'Created user has role "teacher"');
    teacherUserId = createTeacherRes.body.data?.id ?? null;

    // Step 3: Admin creates a Superuser
    console.log('\n3. Admin creating a Superuser account...');
    const createSuperuserRes = await request<{
      success: boolean;
      data: {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
        role: string;
        is_active: boolean;
      };
    }>('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        first_name: 'TestSuperuser',
        last_name: 'Officer',
        email: testSuperuserEmail,
        contact_no: '09182223344',
        role: 'superuser',
        password: 'SuperuserPass123!',
      },
    });

    assert(createSuperuserRes.status === 201, 'POST /api/admin/users creates superuser with 201 Created', createSuperuserRes.body);
    assert(createSuperuserRes.body.data?.role === 'superuser', 'Created user has role "superuser"');
    superuserUserId = createSuperuserRes.body.data?.id ?? null;

    // Step 4: Verify both created users can log in
    console.log('\n4. Verifying created users can authenticate...');
    const teacherLoginRes = await request<{
      token: string;
      user: { email: string; role: string };
    }>('/auth/login', {
      method: 'POST',
      body: {
        email: testTeacherEmail,
        password: 'InitialPassword123!',
      },
    });
    assert(teacherLoginRes.status === 200, 'Newly created teacher can log in', teacherLoginRes.body);
    const teacherToken = teacherLoginRes.body?.token;

    const superuserLoginRes = await request<{
      token: string;
      user: { email: string; role: string };
    }>('/auth/login', {
      method: 'POST',
      body: {
        email: testSuperuserEmail,
        password: 'SuperuserPass123!',
      },
    });
    assert(superuserLoginRes.status === 200, 'Newly created superuser can log in', superuserLoginRes.body);
    const superuserToken = superuserLoginRes.body?.token;

    // Step 5: Search and Filtering
    console.log('\n5. Verifying user search and role filtering...');
    const searchRes = await request<{
      success: boolean;
      data: Array<{ id: number; email: string }>;
      total: number;
    }>(`/admin/users?search=${encodeURIComponent(testTeacherEmail)}`, {
      token: adminToken,
    });
    assert(
      searchRes.status === 200 && searchRes.body.data?.some((u) => u.email === testTeacherEmail),
      'Search by email finds newly created teacher'
    );

    const filterRoleRes = await request<{
      success: boolean;
      data: Array<{ id: number; email: string; role: string }>;
    }>('/admin/users?role=superuser', {
      token: adminToken,
    });
    assert(
      filterRoleRes.status === 200 && filterRoleRes.body.data?.every((u) => u.role === 'superuser'),
      'Filter role=superuser returns only superusers'
    );

    // Step 6: Validation & Error Handling
    console.log('\n6. Verifying validation and error handling...');
    // Duplicate email
    const dupRes = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        first_name: 'Duplicate',
        last_name: 'User',
        email: testTeacherEmail,
        role: 'teacher',
        password: 'AnotherPassword123!',
      },
    });
    assert(dupRes.status === 409, 'Duplicate email registration returns 409 Conflict', dupRes.body);

    // Attempt to create 'admin'
    const adminCreateRes = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        first_name: 'Hacker',
        last_name: 'Admin',
        email: 'fakeadmin@pho.gov.ph',
        role: 'admin',
        password: 'AdminPassword123!',
      },
    });
    assert(adminCreateRes.status === 400, 'Attempting to create "admin" role is rejected with 400 Bad Request', adminCreateRes.body);

    // Short password (< 8 chars)
    const shortPassRes = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        first_name: 'Short',
        last_name: 'Pass',
        email: 'shortpass_' + Date.now() + '@pho.gov.ph',
        role: 'teacher',
        password: 'short',
      },
    });
    assert(shortPassRes.status === 400, 'Password < 8 characters is rejected with 400 Bad Request', shortPassRes.body);

    // Step 7: Admin edits user details and password
    console.log('\n7. Admin updates teacher profile and password...');
    if (teacherUserId) {
      const updateRes = await request<{
        success: boolean;
        data: { first_name: string; last_name: string };
      }>(`/admin/users/${teacherUserId}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          first_name: 'UpdatedFirst',
          last_name: 'UpdatedLast',
          email: testTeacherEmail,
          password: 'NewTeacherPassword456!',
        },
      });

      assert(updateRes.status === 200, 'PUT /api/admin/users/:id returns 200 OK', updateRes.body);

      // Old password must now fail
      const oldPassLogin = await request('/auth/login', {
        method: 'POST',
        body: {
          email: testTeacherEmail,
          password: 'InitialPassword123!',
        },
      });
      assert(oldPassLogin.status === 401, 'Login with old password now returns 401 Unauthorized');

      // New password must succeed
      const newPassLogin = await request('/auth/login', {
        method: 'POST',
        body: {
          email: testTeacherEmail,
          password: 'NewTeacherPassword456!',
        },
      });
      assert(newPassLogin.status === 200, 'Login with updated password succeeds with 200 OK');
    }

    // Step 8: Deactivate user
    console.log('\n8. Admin deactivates teacher account...');
    if (teacherUserId) {
      const deactRes = await request(`/admin/users/${teacherUserId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          action: 'deactivate',
        },
      });
      assert(deactRes.status === 200, 'PATCH status deactivate returns 200 OK', deactRes.body);

      // Login must now fail (account locked / inactive)
      const deactLoginRes = await request('/auth/login', {
        method: 'POST',
        body: {
          email: testTeacherEmail,
          password: 'NewTeacherPassword456!',
        },
      });
      assert(deactLoginRes.status === 403, 'Login for deactivated user returns 403 Forbidden', deactLoginRes.body);
    }

    // Step 9: Unlock user
    console.log('\n9. Admin unlocks teacher account...');
    if (teacherUserId) {
      const unlockRes = await request(`/admin/users/${teacherUserId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          action: 'unlock',
        },
      });
      assert(unlockRes.status === 200, 'PATCH status unlock returns 200 OK', unlockRes.body);

      // Login must now succeed again
      const restoredLoginRes = await request('/auth/login', {
        method: 'POST',
        body: {
          email: testTeacherEmail,
          password: 'NewTeacherPassword456!',
        },
      });
      assert(restoredLoginRes.status === 200, 'Login after unlock succeeds with 200 OK');
    }

    // Step 10: RBAC Access Control Enforcement
    console.log('\n10. Verifying RBAC protection (teacher & superuser denied admin access)...');
    const teacherAccess = await request('/admin/users', {
      token: teacherToken,
    });
    assert(teacherAccess.status === 403, 'Teacher token denied on GET /api/admin/users with 403 Forbidden');

    const superuserAccess = await request('/admin/users', {
      token: superuserToken,
    });
    assert(superuserAccess.status === 403, 'Superuser token denied on GET /api/admin/users with 403 Forbidden');

    const anonAccess = await request('/admin/users');
    assert(anonAccess.status === 401, 'Anonymous request denied on GET /api/admin/users with 401 Unauthorized');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    testsFailed++;
  } finally {
    // Cleanup created test records
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      if (teacherUserId || superuserUserId) {
        await pool.query(
          'DELETE FROM users WHERE id IN ($1, $2)',
          [teacherUserId || 0, superuserUserId || 0]
        );
        console.log('Test user accounts removed from database.');
      }
    } catch (cleanupErr) {
      console.error('Error cleaning up test users:', cleanupErr);
    }

    console.log(`\nTEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
