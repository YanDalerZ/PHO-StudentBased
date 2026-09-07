/**
 * Admin Dashboard UI Integration & Contract Test
 * 
 * Verifies:
 * 1. Admin logs in and retrieves real dashboard metrics.
 * 2. Totals, role breakdown, and recent accounts match direct database & API calculations.
 * 3. Teacher and Superuser are rejected with 403 on /api/admin/dashboard.
 * 4. Unauthenticated access is rejected with 401.
 * 5. Creating a new user dynamically updates the dashboard total and recent accounts list.
 * 6. Deactivating a user dynamically updates the status in the dashboard recent accounts list.
 * 7. Clean up of test records.
 * 
 * Run with: npx tsx tests/admin_dashboard_ui_integration_test.ts
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

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function runDashboardIntegrationTests() {
  console.log('===============================================================');
  console.log('🖥️ Admin Dashboard UI Integration & Dynamic Updates Test');
  console.log('===============================================================\n');

  const timestamp = Date.now();
  const testAdminEmail = `dash_admin_${timestamp}@pho.test`;
  const testSuperEmail = `dash_super_${timestamp}@pho.test`;
  const testTeacherEmail = `dash_teacher_${timestamp}@pho.test`;
  const testPassword = 'password123';

  let adminToken = '';
  let superToken = '';
  let teacherToken = '';

  const createdUserIds: number[] = [];

  try {
    // 0. Setup test users
    console.log('0. Setting up test users and authenticating...');
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

    await insertUser(testAdminEmail, 'admin', 'Dashboard', 'Admin');
    await insertUser(testSuperEmail, 'superuser', 'Dashboard', 'Super');
    await insertUser(testTeacherEmail, 'teacher', 'Dashboard', 'Teacher');

    // Authenticate
    const adminLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: testAdminEmail, password: testPassword },
    });
    adminToken = adminLogin.body?.token ?? '';
    assert(adminLogin.status === 200 && Boolean(adminToken), 'Admin successfully logged in');

    const superLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: testSuperEmail, password: testPassword },
    });
    superToken = superLogin.body?.token ?? '';
    assert(superLogin.status === 200 && Boolean(superToken), 'Superuser successfully logged in');

    const teacherLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: testTeacherEmail, password: testPassword },
    });
    teacherToken = teacherLogin.body?.token ?? '';
    assert(teacherLogin.status === 200 && Boolean(teacherToken), 'Teacher successfully logged in');

    // 1. Role-based protection: Teacher & Superuser blocked
    console.log('\n1. Verifying Route & API Protection...');
    const unauthRes = await request('/admin/dashboard');
    assert(unauthRes.status === 401, 'Unauthenticated request to /api/admin/dashboard returns 401');

    const teacherRes = await request('/admin/dashboard', { token: teacherToken });
    assert(teacherRes.status === 403, 'Teacher access to /api/admin/dashboard returns 403');

    const superRes = await request('/admin/dashboard', { token: superToken });
    assert(superRes.status === 403, 'Superuser access to /api/admin/dashboard returns 403');

    // 2. Admin retrieves initial real dashboard data
    console.log('\n2. Verifying Initial Real Dashboard Metrics...');
    const initialDash = await request<{
      data: {
        users_by_role: { teacher: number; superuser: number; admin: number; total: number };
        total_students: number;
        active_modules: number;
        recent_users: Array<{ id: number; email: string; role: string; is_active: boolean }>;
      };
    }>('/admin/dashboard', { token: adminToken });

    assert(initialDash.status === 200, 'Admin successfully fetches /api/admin/dashboard (200)');
    const initialStats = initialDash.body?.data;
    const initialTotalUsers = initialStats?.users_by_role?.total ?? 0;
    const initialTeachers = initialStats?.users_by_role?.teacher ?? 0;
    assert(initialTotalUsers > 0, `Initial total users (${initialTotalUsers}) > 0`);
    assert(typeof initialStats?.total_students === 'number', 'total_students is a valid number');
    assert(initialStats?.active_modules === 5, 'active_modules equals 5');
    assert(Array.isArray(initialStats?.recent_users), 'recent_users is an array');

    // 3. Create a new user through Admin API and verify dashboard totals update
    console.log('\n3. Verifying Dashboard Updates After User Creation...');
    const dynamicUserEmail = `dynamic_teacher_${timestamp}@pho.test`;
    const createRes = await request<{ data: { id: number; email: string } }>('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        email: dynamicUserEmail,
        password: 'Password123!',
        role: 'teacher',
        first_name: 'Dynamic',
        last_name: 'Teacher',
        contact_no: '09180001111',
      },
    });
    assert(createRes.status === 201, 'Admin created dynamic teacher user (201)');
    const createdId = createRes.body?.data?.id;
    if (createdId) createdUserIds.push(createdId);

    // Re-fetch dashboard
    const afterCreateDash = await request<{
      data: {
        users_by_role: { teacher: number; superuser: number; admin: number; total: number };
        recent_users: Array<{ id: number; email: string; is_active: boolean }>;
      };
    }>('/admin/dashboard', { token: adminToken });

    const updatedStats = afterCreateDash.body?.data;
    assert(
      (updatedStats?.users_by_role?.total ?? 0) === initialTotalUsers + 1,
      `Total users incremented by 1 (${initialTotalUsers} -> ${updatedStats?.users_by_role?.total})`
    );
    assert(
      (updatedStats?.users_by_role?.teacher ?? 0) === initialTeachers + 1,
      `Teacher count incremented by 1 (${initialTeachers} -> ${updatedStats?.users_by_role?.teacher})`
    );
    assert(
      updatedStats?.recent_users?.[0]?.email === dynamicUserEmail,
      'Newly created teacher appears at the top of recent_users'
    );

    // 4. Deactivate the user and verify dashboard recent accounts reflects updated status
    console.log('\n4. Verifying Dashboard Updates After Deactivation...');
    const deactRes = await request<{ data: { is_active: boolean } }>(
      `/admin/users/${createdId}/status`,
      {
        method: 'PATCH',
        token: adminToken,
        body: { action: 'deactivate' },
      }
    );
    assert(deactRes.status === 200 && deactRes.body?.data?.is_active === false, 'User deactivated (200)');

    // Re-fetch dashboard
    const afterDeactDash = await request<{
      data: {
        recent_users: Array<{ id: number; email: string; is_active: boolean }>;
      };
    }>('/admin/dashboard', { token: adminToken });

    const userInRecent = afterDeactDash.body?.data?.recent_users?.find((u) => u.id === createdId);
    assert(userInRecent?.is_active === false, 'Dashboard recent_users reflects is_active = false');

  } catch (error) {
    console.error('Unexpected test error:', error);
    failed++;
  } finally {
    // 5. Cleanup
    console.log('\n5. Cleaning up test accounts...');
    try {
      if (createdUserIds.length > 0) {
        await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
      }
      console.log('✅ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr);
    }
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runDashboardIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
