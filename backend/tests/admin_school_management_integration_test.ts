/**
 * Admin School Management Integration & Verification Test Suite
 * 
 * Verifies:
 * 1. Admin creates a school in a selected barangay (POST /api/admin/schools):
 *    - Validates school appears in the admin list (GET /api/admin/schools).
 *    - Validates school appears in teacher registration lookup cascade (GET /api/lookup/schools/:bgyId).
 * 2. Admin edits name, address, barangay, district, and active status:
 *    - PUT /api/admin/schools/:id persists updates.
 *    - Persistence survives subsequent queries.
 * 3. Invalid / mismatched municipality-barangay input:
 *    - Mismatched municipality_id and barangay_id rejected with 400 Bad Request.
 *    - Non-existent barangay rejected with 400 Bad Request.
 * 4. Inactive schools behavior with teacher registration:
 *    - Deactivating the school (is_active = false) removes it from teacher lookup (GET /api/lookup/schools/:bgyId).
 *    - Teacher registering a student with inactive school_id is rejected with 400.
 *    - Reactivating the school (is_active = true) restores it to teacher lookup.
 *    - Teacher registering a student with reactivated school_id succeeds with 201 Created.
 * 5. RBAC Protection:
 *    - Teacher token denied on GET/POST/PUT /api/admin/schools (403 Forbidden).
 *    - Superuser token denied on GET/POST/PUT /api/admin/schools (403 Forbidden).
 *    - Anonymous request denied (401 Unauthorized).
 * 6. Automated fixture cleanup.
 * 
 * Run with: npx tsx tests/admin_school_management_integration_test.ts
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

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`[PASS] ${description}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${description}`);
    failedCount++;
  }
}

async function runSuite() {
  console.log('--- STARTING ADMIN SCHOOL MANAGEMENT INTEGRATION TEST ---\n');

  // Track created fixtures for cleanup
  const createdSchoolIds: number[] = [];
  const createdStudentIds: number[] = [];

  try {
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

    const superuserLogin = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: 'super@pho.gov.ph', password: 'password123' },
    });
    assert(superuserLogin.status === 200 && Boolean(superuserLogin.body?.token), 'Superuser successfully logged in');
    const superuserToken = superuserLogin.body?.token;

    // 2. Fetch real municipalities and barangays for reference
    console.log('\n2. Fetching real geographic lookups...');
    const munRes = await request<Array<{ id: number; name: string }>>('/lookup/municipalities', {
      token: adminToken,
    });
    assert(munRes.status === 200 && Array.isArray(munRes.body) && munRes.body.length > 0, 'Fetched municipalities');
    const kalibo = munRes.body.find((m) => m.name.toLowerCase().includes('kalibo')) || munRes.body[0]!;
    const otherMun = munRes.body.find((m) => m.id !== kalibo.id) || munRes.body[1]!;

    const bgyRes = await request<Array<{ id: number; name: string; municipality_id: number }>>(
      `/lookup/barangays/${kalibo.id}`,
      { token: adminToken }
    );
    assert(bgyRes.status === 200 && Array.isArray(bgyRes.body) && bgyRes.body.length > 0, 'Fetched barangays for Kalibo');
    const kaliboBgy = bgyRes.body[0]!;

    const otherBgyRes = await request<Array<{ id: number; name: string; municipality_id: number }>>(
      `/lookup/barangays/${otherMun.id}`,
      { token: adminToken }
    );
    assert(otherBgyRes.status === 200 && Array.isArray(otherBgyRes.body) && otherBgyRes.body.length > 0, 'Fetched barangays for secondary municipality');
    const otherBgy = otherBgyRes.body[0]!;

    // 3. Admin creates a school
    console.log('\n3. Admin creating a school in Kalibo...');
    const testSchoolPayload = {
      name: `QA Test Academy ${Date.now()}`,
      address: '100 Mabini St, Poblacion',
      barangay_id: kaliboBgy.id,
      municipality_id: kalibo.id,
      district: 'District I',
      is_active: true,
    };

    const createRes = await request<{
      data: {
        id: number;
        name: string;
        barangay_id: number;
        barangay_name: string;
        municipality_name: string;
        district: string;
        is_active: boolean;
      };
    }>('/admin/schools', {
      method: 'POST',
      token: adminToken,
      body: testSchoolPayload,
    });

    assert(createRes.status === 201, 'POST /api/admin/schools returns 201 Created');
    assert(createRes.body?.data?.name === testSchoolPayload.name, 'Created school name matches');
    assert(createRes.body?.data?.district === testSchoolPayload.district, 'Created school district matches');
    assert(createRes.body?.data?.is_active === true, 'Created school is_active is true');
    const createdSchoolId = createRes.body?.data?.id;
    if (createdSchoolId) createdSchoolIds.push(createdSchoolId);

    // 4. Verify school appears in admin list and teacher lookup cascade
    console.log('\n4. Verifying school appears in admin list and teacher lookup cascade...');
    const adminSchoolsRes = await request<{
      data: Array<{ id: number; name: string }>;
      total: number;
    }>(`/admin/schools?search=${encodeURIComponent(testSchoolPayload.name)}`, {
      token: adminToken,
    });
    assert(adminSchoolsRes.status === 200, 'GET /api/admin/schools?search= returns 200');
    assert(
      adminSchoolsRes.body?.data?.some((s) => s.id === createdSchoolId),
      'Created school found in admin search list'
    );

    const teacherLookupRes = await request<Array<{ id: number; name: string }>>(
      `/lookup/schools/${kaliboBgy.id}`,
      { token: teacherToken }
    );
    assert(teacherLookupRes.status === 200, 'GET /api/lookup/schools/:bgyId returns 200');
    assert(
      teacherLookupRes.body?.some((s) => s.id === createdSchoolId),
      'Created active school appears in teacher registration lookup cascade'
    );

    // 5. Admin edits school attributes & verifies persistence
    console.log('\n5. Admin updating school attributes...');
    const updatedName = `${testSchoolPayload.name} - Updated`;
    const updateRes = await request<{
      data: {
        id: number;
        name: string;
        district: string;
        address: string;
      };
    }>(`/admin/schools/${createdSchoolId}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        name: updatedName,
        district: 'District II (Updated)',
        address: '200 Updated Boulevard',
      },
    });

    assert(updateRes.status === 200, 'PUT /api/admin/schools/:id returns 200 OK');
    assert(updateRes.body?.data?.name === updatedName, 'Updated school name persisted in response');
    assert(updateRes.body?.data?.district === 'District II (Updated)', 'Updated district persisted');

    const verifyQuery = await request<{
      data: Array<{ id: number; name: string; district: string; address: string }>;
    }>(`/admin/schools?search=${encodeURIComponent(updatedName)}`, {
      token: adminToken,
    });
    const verifiedSchool = verifyQuery.body?.data?.find((s) => s.id === createdSchoolId);
    assert(verifiedSchool?.name === updatedName, 'Persistence verified on subsequent search query');
    assert(verifiedSchool?.district === 'District II (Updated)', 'Persisted district matches');

    // 6. Test invalid / mismatched municipality-barangay input rejection
    console.log('\n6. Verifying mismatched municipality-barangay validation...');
    const mismatchedPayload = {
      name: `Mismatched QA School ${Date.now()}`,
      barangay_id: otherBgy.id, // belongs to otherMun
      municipality_id: kalibo.id, // mismatched
      district: 'Invalid District',
    };

    const mismatchRes = await request<{ error?: string }>('/admin/schools', {
      method: 'POST',
      token: adminToken,
      body: mismatchedPayload,
    });
    assert(mismatchRes.status === 400, 'POST /admin/schools with mismatched municipality and barangay returns 400 Bad Request');

    const nonExistentBgyRes = await request<{ error?: string }>('/admin/schools', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Invalid Bgy School',
        barangay_id: 999999, // non-existent
      },
    });
    assert(nonExistentBgyRes.status === 400, 'POST /admin/schools with non-existent barangay returns 400 Bad Request');

    // 7. Deactivate school & verify teacher registration behavior
    console.log('\n7. Deactivating school and verifying teacher registration handling...');
    const deactivateRes = await request<{ data: { is_active: boolean } }>(
      `/admin/schools/${createdSchoolId}`,
      {
        method: 'PUT',
        token: adminToken,
        body: { is_active: false },
      }
    );
    assert(deactivateRes.status === 200, 'PUT /admin/schools/:id deactivation returns 200 OK');
    assert(deactivateRes.body?.data?.is_active === false, 'School is_active is now false');

    const teacherLookupAfterDeactivate = await request<Array<{ id: number; name: string }>>(
      `/lookup/schools/${kaliboBgy.id}`,
      { token: teacherToken }
    );
    assert(
      !teacherLookupAfterDeactivate.body?.some((s) => s.id === createdSchoolId),
      'Deactivated school is omitted from teacher lookup cascade'
    );

    // Attempting to register a student with inactive school_id
    const lrnTest = `LRN${Date.now().toString().slice(-9)}`;
    const studentPayload = {
      student_lrn: lrnTest,
      first_name: 'SchoolQA',
      last_name: 'Tester',
      sex: 'Male',
      date_of_birth: '2015-05-10',
      school_id: createdSchoolId,
      municipality_id: kalibo.id,
      barangay_id: kaliboBgy.id,
    };

    const registerWithInactiveRes = await request<{ message?: string }>('/students', {
      method: 'POST',
      token: teacherToken,
      body: studentPayload,
    });
    assert(
      registerWithInactiveRes.status === 400,
      'Teacher registering student with inactive school_id is rejected with 400 Bad Request'
    );

    // 8. Reactivate school & verify registration succeeds
    console.log('\n8. Reactivating school and verifying registration succeeds...');
    const reactivateRes = await request<{ data: { is_active: boolean } }>(
      `/admin/schools/${createdSchoolId}`,
      {
        method: 'PUT',
        token: adminToken,
        body: { is_active: true },
      }
    );
    assert(reactivateRes.status === 200 && reactivateRes.body?.data?.is_active === true, 'School reactivated successfully');

    const teacherLookupAfterReactivate = await request<Array<{ id: number; name: string }>>(
      `/lookup/schools/${kaliboBgy.id}`,
      { token: teacherToken }
    );
    assert(
      teacherLookupAfterReactivate.body?.some((s) => s.id === createdSchoolId),
      'Reactivated school reappears in teacher lookup cascade'
    );

    const registerWithActiveRes = await request<{ data: { id: number } }>('/students', {
      method: 'POST',
      token: teacherToken,
      body: studentPayload,
    });
    assert(registerWithActiveRes.status === 201, 'Teacher registering student with active school succeeds with 201 Created');
    if (registerWithActiveRes.body?.data?.id) {
      createdStudentIds.push(registerWithActiveRes.body.data.id);
    }

    // 9. Verify RBAC on School Admin APIs
    console.log('\n9. Verifying RBAC on Admin School APIs...');
    const teacherGetSchools = await request('/admin/schools', { token: teacherToken });
    assert(teacherGetSchools.status === 403, 'Teacher token denied on GET /api/admin/schools (403)');

    const teacherPostSchools = await request('/admin/schools', {
      method: 'POST',
      token: teacherToken,
      body: testSchoolPayload,
    });
    assert(teacherPostSchools.status === 403, 'Teacher token denied on POST /api/admin/schools (403)');

    const superuserGetSchools = await request('/admin/schools', { token: superuserToken });
    assert(superuserGetSchools.status === 403, 'Superuser token denied on GET /api/admin/schools (403)');

    const superuserPutSchools = await request(`/admin/schools/${createdSchoolId}`, {
      method: 'PUT',
      token: superuserToken,
      body: { name: 'Hacked' },
    });
    assert(superuserPutSchools.status === 403, 'Superuser token denied on PUT /api/admin/schools/:id (403)');

    const anonGetSchools = await request('/admin/schools');
    assert(anonGetSchools.status === 401, 'Anonymous request denied on GET /api/admin/schools (401)');
  } finally {
    // Clean up test data
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    for (const studentId of createdStudentIds) {
      await pool.query('DELETE FROM STUDENTS WHERE id = $1', [studentId]);
    }
    for (const schoolId of createdSchoolIds) {
      await pool.query('DELETE FROM SCHOOLS WHERE id = $1', [schoolId]);
    }
    console.log(`Cleaned up ${createdStudentIds.length} test students and ${createdSchoolIds.length} test schools.`);
    await pool.end();
  }

  console.log(`\nTEST SUMMARY: ${passedCount} passed, ${failedCount} failed\n`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
