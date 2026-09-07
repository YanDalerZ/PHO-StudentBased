/**
 * Dashboard Integration Test
 * 
 * Tests the GET /api/dashboard/overview endpoint.
 * Run with: npx tsx tests/dashboard_integration_test.ts
 * 
 * Prerequisites:
 *   - Backend server running on localhost:3000
 *   - At least one superuser, admin, and teacher account seeded
 */
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

// ─── Helpers ────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LoginResponse;
  return data.token;
}

async function getDashboard(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(`${BASE_URL}/dashboard/overview`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─── Test Credentials ───────────────────────────────────────────────
// Update these to match your seeded users
const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL || 'super@pho.gov.ph';
const SUPERUSER_PASS = process.env.SUPERUSER_PASS || 'password123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pho.gov.ph';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password123';
const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'teacher@pho.gov.ph';
const TEACHER_PASS = process.env.TEACHER_PASS || 'password123';

// ─── Tests ──────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔬 Dashboard Integration Tests\n');

  // 1. Auth Tests
  console.log('1. Role-Based Access Control');
  let superuserToken: string;
  let adminToken: string;
  let teacherToken: string;

  try {
    superuserToken = await login(SUPERUSER_EMAIL, SUPERUSER_PASS);
    assert(!!superuserToken, 'Superuser login succeeds');
  } catch {
    console.log(`  ⚠️  Could not login as superuser (${SUPERUSER_EMAIL}). Skipping tests.`);
    console.log('\n📊 Results: Tests skipped — check credentials in .env or test file.\n');
    return;
  }

  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
    assert(!!adminToken, 'Admin login succeeds');
  } catch {
    console.log('  ⚠️  Could not login as admin. Using superuser for remaining tests.');
    adminToken = superuserToken;
  }

  try {
    teacherToken = await login(TEACHER_EMAIL, TEACHER_PASS);
    assert(!!teacherToken, 'Teacher login succeeds');
  } catch {
    console.log('  ⚠️  Could not login as teacher. Skipping teacher auth test.');
    teacherToken = '';
  }

  // Superuser can access
  const suResult = await getDashboard(superuserToken);
  assert(suResult.status === 200, 'Superuser GET /dashboard/overview → 200');

  // Admin can access
  const adResult = await getDashboard(adminToken);
  assert(adResult.status === 200, 'Admin GET /dashboard/overview → 200');

  // Teacher is rejected
  if (teacherToken) {
    const tResult = await getDashboard(teacherToken);
    assert(tResult.status === 403, 'Teacher GET /dashboard/overview → 403', `got ${tResult.status}`);
  }

  // No token is rejected
  const noAuthResult = await getDashboard(null);
  assert(noAuthResult.status === 401, 'No token GET /dashboard/overview → 401', `got ${noAuthResult.status}`);

  // 2. Response Shape Tests
  console.log('\n2. Response Shape');
  const data = suResult.body.data as Record<string, unknown> | undefined;
  assert(data !== undefined, 'Response has data field');

  if (data) {
    assert(typeof data.total_students === 'number', 'total_students is a number');
    assert(Array.isArray(data.students_by_municipality), 'students_by_municipality is array');
    assert(
      typeof data.gender_distribution === 'object' && data.gender_distribution !== null,
      'gender_distribution is an object'
    );
    assert(Array.isArray(data.module_completion), 'module_completion is array');
    assert(Array.isArray(data.recent_registrations), 'recent_registrations is array');

    const gd = data.gender_distribution as { male?: number; female?: number };
    assert(typeof gd.male === 'number' && typeof gd.female === 'number', 'gender_distribution has male/female numbers');

    // Gender sum should equal total
    const totalStudents = data.total_students as number;
    const genderSum = (gd.male ?? 0) + (gd.female ?? 0);
    assert(
      genderSum === totalStudents,
      `Gender sum (${genderSum}) equals total_students (${totalStudents})`
    );

    // Module completion should have 5 entries
    const mc = data.module_completion as Array<{ module: string; count: number; rate: number }>;
    assert(mc.length === 5, `module_completion has 5 entries (got ${mc.length})`);

    const expectedModules = ['Patient Info', 'Oral Health', 'Deworming', 'Immunization', 'Vital Signs'];
    for (const name of expectedModules) {
      assert(
        mc.some((m) => m.module === name),
        `module_completion includes "${name}"`
      );
    }

    // Recent registrations limited to 10
    const rr = data.recent_registrations as Array<Record<string, unknown>>;
    assert(rr.length <= 10, `recent_registrations has ≤10 entries (got ${rr.length})`);
  }

  // 3. Filter Validation Tests
  console.log('\n3. Filter Validation');

  // Invalid municipality_id
  const invalidMunResult = await getDashboard(superuserToken, { municipality_id: 'abc' });
  assert(
    invalidMunResult.status === 400,
    'Invalid municipality_id (string) → 400',
    `got ${invalidMunResult.status}`
  );

  // date_from > date_to
  const invalidDateResult = await getDashboard(superuserToken, {
    date_from: '2026-12-31',
    date_to: '2026-01-01',
  });
  assert(
    invalidDateResult.status === 400,
    'date_from > date_to → 400',
    `got ${invalidDateResult.status}`
  );

  // Mismatched geography (barangay 999999 with municipality 1)
  const badGeoResult = await getDashboard(superuserToken, {
    municipality_id: '1',
    barangay_id: '999999',
  });
  assert(
    badGeoResult.status === 400,
    'Mismatched barangay/municipality → 400',
    `got ${badGeoResult.status}`
  );

  // 4. Filter Effect Tests
  console.log('\n4. Filter Effects');

  // Unfiltered total
  const unfilteredData = data as { total_students: number } | undefined;
  if (unfilteredData && unfilteredData.total_students > 0) {
    // Filter by a specific municipality (id=1 if it exists)
    const filteredResult = await getDashboard(superuserToken, { municipality_id: '1' });
    if (filteredResult.status === 200) {
      const filteredData = (filteredResult.body.data as { total_students: number });
      assert(
        filteredData.total_students <= unfilteredData.total_students,
        `Filtered total (${filteredData.total_students}) ≤ unfiltered total (${unfilteredData.total_students})`
      );
    }

    // Date range that should capture everything
    const wideResult = await getDashboard(superuserToken, {
      date_from: '2020-01-01',
      date_to: '2030-12-31',
    });
    if (wideResult.status === 200) {
      const wideData = (wideResult.body.data as { total_students: number });
      assert(
        wideData.total_students === unfilteredData.total_students,
        `Wide date range total (${wideData.total_students}) equals unfiltered (${unfilteredData.total_students})`
      );
    }

    // Date range in the far future should return 0
    const futureResult = await getDashboard(superuserToken, {
      date_from: '2099-01-01',
      date_to: '2099-12-31',
    });
    if (futureResult.status === 200) {
      const futureData = (futureResult.body.data as { total_students: number });
      assert(
        futureData.total_students === 0,
        `Future date range returns 0 students (got ${futureData.total_students})`
      );
    }
  } else {
    console.log('  ⚠️  No students in database — skipping filter effect tests.');
  }

  // ─── Summary ──────────────────────────────────────────────────────
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests.\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});

export {};
