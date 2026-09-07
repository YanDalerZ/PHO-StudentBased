/**
 * Admin Module Management Integration & Availability Test
 * 
 * Verifies:
 * 1. Admin views all five approved modules with live API data (/api/admin/modules).
 * 2. Admin edits description, icon, and sort order; persistence survives refresh.
 * 3. Admin toggles a module inactive (e.g. deworming):
 *    - Lookup endpoint (/api/lookup/modules) reflects is_active = false.
 *    - Teacher attempting to record data for inactive module is rejected with 403 Forbidden.
 * 4. Admin reactivates the module:
 *    - Availability returns (is_active = true).
 *    - Teacher data recording capability is restored.
 * 5. Teacher and Superuser tokens cannot access Admin Module APIs (403 Forbidden).
 * 6. Anonymous access is rejected with 401 Unauthorized.
 * 7. Modules outside approved slugs (400) and duplicate slugs (409) are rejected.
 * 8. Clean up: restore original module states.
 * 
 * Run with: npx tsx tests/admin_module_management_integration_test.ts
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

interface ModuleItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
}

async function runTests() {
  console.log('--- STARTING ADMIN MODULE MANAGEMENT INTEGRATION TEST ---\n');
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

  // Keep backup of original modules state to restore at end
  let originalModules: ModuleItem[] = [];
  let testStudentId: number | null = null;
  let teacherUserId: number | null = null;
  let createdDewormingId: number | null = null;

  try {
    // 0. Backup original MODULES table state
    const backupRes = await pool.query<ModuleItem>(
      'SELECT id, name, slug, description, icon, is_active, sort_order FROM MODULES ORDER BY id ASC'
    );
    originalModules = backupRes.rows;

    // 1. Authenticate roles
    console.log('1. Authenticating roles...');
    const adminLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: 'admin@pho.gov.ph', password: 'password123' },
    });
    assert(adminLogin.status === 200 && Boolean(adminLogin.body?.token), 'Admin successfully logged in');
    const adminToken = adminLogin.body?.token;

    const teacherLogin = await request<{ token: string; user: { id: number } }>('/auth/login', {
      method: 'POST',
      body: { email: 'teacher@pho.gov.ph', password: 'password123' },
    });
    assert(teacherLogin.status === 200 && Boolean(teacherLogin.body?.token), 'Teacher successfully logged in');
    const teacherToken = teacherLogin.body?.token;
    teacherUserId = teacherLogin.body?.user?.id ?? null;

    const superuserLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: 'super@pho.gov.ph', password: 'password123' },
    });
    assert(superuserLogin.status === 200 && Boolean(superuserLogin.body?.token), 'Superuser successfully logged in');
    const superuserToken = superuserLogin.body?.token;

    // 2. Admin retrieves live module definitions
    console.log('\n2. Admin viewing module list via /api/admin/modules...');
    const listRes = await request<{ data: ModuleItem[]; total: number }>('/admin/modules', {
      token: adminToken,
    });
    assert(listRes.status === 200, 'GET /api/admin/modules returns 200 OK');
    assert(Array.isArray(listRes.body.data) && listRes.body.data.length >= 5, 'Returns all 5 approved health modules');

    const dewormingModule = listRes.body.data.find((m) => m.slug === 'deworming');
    assert(!!dewormingModule, 'Deworming module exists in list');

    // 3. Admin edits description, icon, and sort order
    console.log('\n3. Admin updating module configuration...');
    if (dewormingModule) {
      const updateRes = await request<{ data: ModuleItem }>(`/admin/modules/${dewormingModule.id}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          description: 'Updated mass drug administration clinical screening description.',
          icon: 'Droplets',
          sort_order: 10,
        },
      });

      assert(updateRes.status === 200, 'PUT /api/admin/modules/:id returns 200 OK');
      assert(
        updateRes.body.data?.description === 'Updated mass drug administration clinical screening description.',
        'Updated description matches'
      );
      assert(updateRes.body.data?.icon === 'Droplets', 'Updated icon matches');
      assert(updateRes.body.data?.sort_order === 10, 'Updated sort_order persisted');

      // Verify persistence survives subsequent GET
      const verifyGet = await request<{ data: ModuleItem[] }>('/admin/modules', {
        token: adminToken,
      });
      const verifiedDeworming = verifyGet.body.data?.find((m) => m.id === dewormingModule.id);
      assert(
        verifiedDeworming?.description === 'Updated mass drug administration clinical screening description.',
        'Persistence survives refresh/subsequent query'
      );
    }

    // 4. Create a test student registered by teacher to test form submission availability
    console.log('\n4. Setting up test student for module availability tests...');
    const studentRes = await pool.query<{ id: number }>(
      `INSERT INTO STUDENTS (
        first_name, last_name, sex, date_of_birth, student_lrn, registered_by, is_indigenous, is_4ps_member, is_pwd, is_philhealth_member
      ) VALUES (
        'TestModStudent', 'Availability', 'Male', '2015-06-01', 'LRN_MOD_${Date.now()}', $1, false, false, false, false
      ) RETURNING id`,
      [teacherUserId || 1]
    );
    testStudentId = studentRes.rows[0]?.id ?? null;
    assert(!!testStudentId, 'Test student created in database');

    // 5. Admin toggles Deworming module to INACTIVE
    console.log('\n5. Admin deactivating Deworming module...');
    if (dewormingModule) {
      const deactRes = await request<{ data: ModuleItem }>(`/admin/modules/${dewormingModule.id}`, {
        method: 'PUT',
        token: adminToken,
        body: { is_active: false },
      });
      assert(deactRes.status === 200, 'Deactivate module returns 200 OK');
      assert(deactRes.body.data?.is_active === false, 'Module is_active set to false');

      // Verify lookup endpoint reflects inactive state
      const lookupRes = await request<ModuleItem[]>('/lookup/modules', {
        token: teacherToken,
      });
      assert(lookupRes.status === 200, 'GET /api/lookup/modules returns 200 for teacher');
      const inactiveInLookup = lookupRes.body.find((m) => m.slug === 'deworming');
      assert(inactiveInLookup?.is_active === false, 'Lookup API confirms Deworming is inactive');

      // Teacher attempting to submit record to deactivated module must be rejected with 403
      console.log('\n6. Verifying teacher cannot submit records to deactivated module...');
      const deactSubmit = await request('/modules/deworming', {
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
        deactSubmit.status === 403,
        'POST /api/modules/deworming rejected with 403 Forbidden while module is deactivated',
        deactSubmit.body
      );

      // 7. Admin reactivates Deworming module
      console.log('\n7. Admin reactivating Deworming module...');
      const reactivateRes = await request<{ data: ModuleItem }>(`/admin/modules/${dewormingModule.id}`, {
        method: 'PUT',
        token: adminToken,
        body: { is_active: true },
      });
      assert(reactivateRes.status === 200, 'Reactivate module returns 200 OK');
      assert(reactivateRes.body.data?.is_active === true, 'Module is_active restored to true');

      // Verify availability returns for teacher
      console.log('\n8. Verifying teacher can submit records once reactivated...');
      const reactivatedSubmit = await request<{ data: { id: number } }>('/modules/deworming', {
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
        reactivatedSubmit.status === 201,
        'POST /api/modules/deworming succeeds with 201 Created after module reactivation',
        reactivatedSubmit.body
      );
      createdDewormingId = reactivatedSubmit.body.data?.id ?? null;
    }

    // 9. RBAC Protection
    console.log('\n9. Verifying RBAC protection on Admin Module APIs...');
    const teacherDeniedGet = await request('/admin/modules', { token: teacherToken });
    assert(teacherDeniedGet.status === 403, 'Teacher token denied on GET /api/admin/modules (403)');

    const superuserDeniedGet = await request('/admin/modules', { token: superuserToken });
    assert(superuserDeniedGet.status === 403, 'Superuser token denied on GET /api/admin/modules (403)');

    const anonDenied = await request('/admin/modules');
    assert(anonDenied.status === 401, 'Anonymous request denied on GET /api/admin/modules (401)');

    // 10. Reject unauthorized/unapproved module additions
    console.log('\n10. Verifying validation against invalid slugs and duplicates...');
    const invalidSlugRes = await request('/admin/modules', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Hallucinated Module',
        slug: 'non-existent-module',
      },
    });
    assert(invalidSlugRes.status === 400, 'Creating module with unapproved slug rejected with 400 Bad Request');

    const duplicateSlugRes = await request('/admin/modules', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Deworming Duplicate',
        slug: 'deworming',
      },
    });
    assert(duplicateSlugRes.status === 409, 'Creating duplicate module slug rejected with 409 Conflict');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    testsFailed++;
  } finally {
    // 11. Cleanup and restore
    console.log('\n--- RESTORING ORIGINAL MODULE DATA & CLEANING UP FIXTURES ---');
    try {
      if (createdDewormingId) {
        await pool.query('DELETE FROM DEWORMING WHERE id = $1', [createdDewormingId]);
      }
      if (testStudentId) {
        await pool.query('DELETE FROM STUDENTS WHERE id = $1', [testStudentId]);
      }

      // Restore original module rows
      for (const orig of originalModules) {
        await pool.query(
          'UPDATE MODULES SET description = $1, icon = $2, is_active = $3, sort_order = $4 WHERE id = $5',
          [orig.description, orig.icon, orig.is_active, orig.sort_order, orig.id]
        );
      }
      console.log('Restored all original module configurations and cleaned test records.');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
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
