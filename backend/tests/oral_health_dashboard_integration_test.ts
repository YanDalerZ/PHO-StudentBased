/**
 * Oral Health Dashboard Integration Test (RPOC-based)
 * 
 * Tests the GET /api/modules/oral-health/dashboard endpoint.
 * Run with: npx tsx tests/oral_health_dashboard_integration_test.ts
 */
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

interface OralHealthDashData {
  total_students_examined: number;
  total_examinations: number;
  rpoc_completion: {
    completed: number;
    incomplete: number;
    completion_rate: number;
  };
  rpoc_steps: {
    screening: number;
    risk_assessment: number;
    prophylaxis: number;
    counseling: number;
    fluoride_varnish: number;
  };
  facility_distribution: Array<{ location: string; count: number }>;
  visit_type_distribution: Array<{ visit_type: string; count: number }>;
  coverage_by_school: Array<{ school_id: number; school_name: string; count: number }>;
  monthly_trend: Array<{ month: string; count: number }>;
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

async function getOralHealthDashboard(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: { message?: string; data?: OralHealthDashData; error?: string } }> {
  const url = new URL(`${BASE_URL}/modules/oral-health/dashboard`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as { message?: string; data?: OralHealthDashData; error?: string };
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
const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL || 'super@pho.gov.ph';
const SUPERUSER_PASS = process.env.SUPERUSER_PASS || 'password123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pho.gov.ph';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password123';
const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'teacher@pho.gov.ph';
const TEACHER_PASS = process.env.TEACHER_PASS || 'password123';

// ─── Tests ──────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔬 Oral Health Dashboard Integration Tests (RPOC)\n');

  // 1. Role-Based Access Control
  console.log('1. Role-Based Access Control');
  let superuserToken: string;
  let adminToken: string;
  let teacherToken: string;

  try {
    superuserToken = await login(SUPERUSER_EMAIL, SUPERUSER_PASS);
    assert(!!superuserToken, 'Superuser login succeeds');
  } catch (err) {
    console.log(`  ⚠️  Could not login as superuser (${SUPERUSER_EMAIL}):`, err);
    console.log('\n📊 Results: Tests aborted.\n');
    return;
  }

  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
    assert(!!adminToken, 'Admin login succeeds');
  } catch {
    console.log('  ⚠️  Could not login as admin. Using superuser token for remaining tests.');
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
  const suResult = await getOralHealthDashboard(superuserToken);
  assert(suResult.status === 200, 'Superuser GET /modules/oral-health/dashboard → 200');

  // Admin can access
  const adResult = await getOralHealthDashboard(adminToken);
  assert(adResult.status === 200, 'Admin GET /modules/oral-health/dashboard → 200');

  // Teacher is rejected (403)
  if (teacherToken) {
    const tResult = await getOralHealthDashboard(teacherToken);
    assert(tResult.status === 403, 'Teacher GET /modules/oral-health/dashboard → 403', `got ${tResult.status}`);
  }

  // No token is rejected (401)
  const noAuthResult = await getOralHealthDashboard(null);
  assert(noAuthResult.status === 401, 'No token GET /modules/oral-health/dashboard → 401', `got ${noAuthResult.status}`);

  // 2. Response Shape & Metric Integrity
  console.log('\n2. Response Shape & Metric Integrity');
  const dashData = suResult.body.data;
  assert(!!dashData, 'Response contains data field');

  if (dashData) {
    assert(typeof dashData.total_students_examined === 'number', 'total_students_examined is a number');
    assert(typeof dashData.total_examinations === 'number', 'total_examinations is a number');
    assert(
      dashData.total_students_examined <= dashData.total_examinations,
      `Distinct students (${dashData.total_students_examined}) <= total visits (${dashData.total_examinations})`
    );

    // RPOC Completion
    assert(typeof dashData.rpoc_completion === 'object', 'rpoc_completion is an object');
    assert(typeof dashData.rpoc_completion.completed === 'number', 'rpoc_completion.completed is a number');
    assert(typeof dashData.rpoc_completion.incomplete === 'number', 'rpoc_completion.incomplete is a number');
    assert(typeof dashData.rpoc_completion.completion_rate === 'number', 'rpoc_completion.completion_rate is a number');
    assert(
      dashData.rpoc_completion.completed + dashData.rpoc_completion.incomplete === dashData.total_students_examined,
      `RPOC sum (${dashData.rpoc_completion.completed + dashData.rpoc_completion.incomplete}) equals examined (${dashData.total_students_examined})`
    );

    // RPOC Steps
    assert(typeof dashData.rpoc_steps === 'object', 'rpoc_steps is an object');
    assert(typeof dashData.rpoc_steps.screening === 'number', 'rpoc_steps.screening is a number');
    assert(typeof dashData.rpoc_steps.risk_assessment === 'number', 'rpoc_steps.risk_assessment is a number');
    assert(typeof dashData.rpoc_steps.prophylaxis === 'number', 'rpoc_steps.prophylaxis is a number');
    assert(typeof dashData.rpoc_steps.counseling === 'number', 'rpoc_steps.counseling is a number');
    assert(typeof dashData.rpoc_steps.fluoride_varnish === 'number', 'rpoc_steps.fluoride_varnish is a number');
    assert(dashData.rpoc_steps.screening <= dashData.total_students_examined, 'screening <= total examined');
    assert(dashData.rpoc_steps.fluoride_varnish <= dashData.total_students_examined, 'fluoride_varnish <= total examined');

    // Distributions
    assert(Array.isArray(dashData.facility_distribution), 'facility_distribution is an array');
    assert(Array.isArray(dashData.visit_type_distribution), 'visit_type_distribution is an array');
    assert(Array.isArray(dashData.coverage_by_school), 'coverage_by_school is an array');
    assert(Array.isArray(dashData.monthly_trend), 'monthly_trend is an array');
  }

  // 3. Filter Validation
  console.log('\n3. Filter Validation');
  // Invalid municipality_id
  const invalidMun = await getOralHealthDashboard(superuserToken, { municipality_id: 'xyz' });
  assert(invalidMun.status === 400, 'Invalid municipality_id (string) → 400', `got ${invalidMun.status}`);

  // date_from > date_to
  const invalidDates = await getOralHealthDashboard(superuserToken, {
    date_from: '2026-10-01',
    date_to: '2026-05-01',
  });
  assert(invalidDates.status === 400, 'date_from > date_to → 400', `got ${invalidDates.status}`);

  // Mismatched barangay and municipality
  const mismatchedGeo = await getOralHealthDashboard(superuserToken, {
    municipality_id: '1', // Altavas
    barangay_id: '1',     // Andagao (Kalibo)
  });
  assert(mismatchedGeo.status === 400, 'Mismatched barangay/municipality → 400', `got ${mismatchedGeo.status}`);

  // 4. Filter Effects & Empty Scope Safety
  console.log('\n4. Filter Effects & Empty Scope Safety');
  const unfilteredExamined = dashData?.total_students_examined ?? 0;

  // Filter by Kalibo (municipality_id = 7)
  const kaliboRes = await getOralHealthDashboard(superuserToken, { municipality_id: '7' });
  assert(kaliboRes.status === 200, 'Kalibo filtered query → 200');
  const kaliboExamined = kaliboRes.body.data?.total_students_examined ?? 0;
  assert(
    kaliboExamined <= unfilteredExamined,
    `Filtered examined (${kaliboExamined}) <= unfiltered (${unfilteredExamined})`
  );

  // Wide date range should equal unfiltered
  const wideDateRes = await getOralHealthDashboard(superuserToken, {
    date_from: '2020-01-01',
    date_to: '2030-12-31',
  });
  const wideExamined = wideDateRes.body.data?.total_students_examined ?? 0;
  assert(
    wideExamined === unfilteredExamined,
    `Wide date range total (${wideExamined}) equals unfiltered (${unfilteredExamined})`
  );

  // Future date range returns 0 safely without errors
  const futureRes = await getOralHealthDashboard(superuserToken, {
    date_from: '2099-01-01',
    date_to: '2099-12-31',
  });
  assert(futureRes.status === 200, 'Future date range → 200');
  const futureData = futureRes.body.data;
  assert(futureData?.total_students_examined === 0, 'Future date range returns 0 total_students_examined');
  assert(futureData?.total_examinations === 0, 'Future date range returns 0 total_examinations');
  assert(futureData?.rpoc_completion.completed === 0, 'Future date range returns 0 rpoc completed');
  assert(futureData?.rpoc_completion.completion_rate === 0, 'Future date range returns 0% completion rate');
  assert(Array.isArray(futureData?.monthly_trend) && futureData.monthly_trend.length === 0, 'Future date range returns empty monthly_trend');
  assert(Array.isArray(futureData?.coverage_by_school) && futureData.coverage_by_school.length === 0, 'Future date range returns empty coverage_by_school');

  // Summary
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests.\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled error during tests:', err);
  process.exit(1);
});

export {};
