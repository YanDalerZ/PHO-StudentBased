/**
 * Patient Info Dashboard Integration Test
 * 
 * Tests the GET /api/modules/patient-info/dashboard endpoint.
 * Run with: npx tsx tests/patient_info_dashboard_integration_test.ts
 */
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

interface PatientInfoDashData {
  total_students: number;
  registration_trend: Array<{ month: string; count: number }>;
  registration_by_municipality: Array<{ municipality_id: number; municipality_name: string; count: number }>;
  gender_distribution: { male: number; female: number };
  age_group_distribution: Array<{ age_group: string; count: number }>;
  four_ps_count: number;
  pwd_total: number;
  pwd_distribution: Array<{ pwd_type: string; count: number }>;
  philhealth_coverage: { covered: number; not_covered: number; coverage_rate: number };
  philhealth_category_breakdown: Array<{ category: string; count: number }>;
  indigenous_count: number;
  blood_type_distribution: Array<{ blood_type: string; count: number }>;
  animal_bites_active_cases: number;
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

async function getPatientInfoDashboard(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: { message?: string; data?: PatientInfoDashData; error?: string } }> {
  const url = new URL(`${BASE_URL}/modules/patient-info/dashboard`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as { message?: string; data?: PatientInfoDashData; error?: string };
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
  console.log('\n🔬 Patient Info Dashboard Integration Tests\n');

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
  const suResult = await getPatientInfoDashboard(superuserToken);
  assert(suResult.status === 200, 'Superuser GET /modules/patient-info/dashboard → 200');

  // Admin can access
  const adResult = await getPatientInfoDashboard(adminToken);
  assert(adResult.status === 200, 'Admin GET /modules/patient-info/dashboard → 200');

  // Teacher is rejected (403)
  if (teacherToken) {
    const tResult = await getPatientInfoDashboard(teacherToken);
    assert(tResult.status === 403, 'Teacher GET /modules/patient-info/dashboard → 403', `got ${tResult.status}`);
  }

  // No token is rejected (401)
  const noAuthResult = await getPatientInfoDashboard(null);
  assert(noAuthResult.status === 401, 'No token GET /modules/patient-info/dashboard → 401', `got ${noAuthResult.status}`);

  // 2. Response Shape & Data Integrity
  console.log('\n2. Response Shape & Metric Integrity');
  const dashData = suResult.body.data;
  assert(!!dashData, 'Response contains data field');

  if (dashData) {
    assert(typeof dashData.total_students === 'number', 'total_students is a number');
    assert(Array.isArray(dashData.registration_trend), 'registration_trend is an array');
    assert(Array.isArray(dashData.registration_by_municipality), 'registration_by_municipality is an array');
    assert(typeof dashData.gender_distribution === 'object', 'gender_distribution is an object');
    assert(typeof dashData.gender_distribution.male === 'number', 'gender_distribution.male is a number');
    assert(typeof dashData.gender_distribution.female === 'number', 'gender_distribution.female is a number');
    assert(
      dashData.gender_distribution.male + dashData.gender_distribution.female === dashData.total_students,
      `Gender sum (${dashData.gender_distribution.male + dashData.gender_distribution.female}) equals total_students (${dashData.total_students})`
    );
    assert(Array.isArray(dashData.age_group_distribution), 'age_group_distribution is an array');
    assert(typeof dashData.four_ps_count === 'number', 'four_ps_count is a number');
    assert(dashData.four_ps_count <= dashData.total_students, 'four_ps_count <= total_students');
    assert(typeof dashData.pwd_total === 'number', 'pwd_total is a number');
    assert(dashData.pwd_total <= dashData.total_students, 'pwd_total <= total_students');
    assert(Array.isArray(dashData.pwd_distribution), 'pwd_distribution is an array');
    assert(typeof dashData.philhealth_coverage === 'object', 'philhealth_coverage is an object');
    assert(typeof dashData.philhealth_coverage.covered === 'number', 'philhealth_coverage.covered is a number');
    assert(typeof dashData.philhealth_coverage.not_covered === 'number', 'philhealth_coverage.not_covered is a number');
    assert(
      dashData.philhealth_coverage.covered + dashData.philhealth_coverage.not_covered === dashData.total_students,
      `PhilHealth sum (${dashData.philhealth_coverage.covered + dashData.philhealth_coverage.not_covered}) equals total_students (${dashData.total_students})`
    );
    assert(Array.isArray(dashData.philhealth_category_breakdown), 'philhealth_category_breakdown is an array');
    assert(typeof dashData.indigenous_count === 'number', 'indigenous_count is a number');
    assert(dashData.indigenous_count <= dashData.total_students, 'indigenous_count <= total_students');
    assert(Array.isArray(dashData.blood_type_distribution), 'blood_type_distribution is an array');
    assert(typeof dashData.animal_bites_active_cases === 'number', 'animal_bites_active_cases is a number');
  }

  // 3. Filter Validation
  console.log('\n3. Filter Validation');
  // Invalid municipality_id
  const invalidMun = await getPatientInfoDashboard(superuserToken, { municipality_id: 'abc' });
  assert(invalidMun.status === 400, 'Invalid municipality_id (string) → 400', `got ${invalidMun.status}`);

  // date_from > date_to
  const invalidDates = await getPatientInfoDashboard(superuserToken, {
    date_from: '2026-06-01',
    date_to: '2026-01-01',
  });
  assert(invalidDates.status === 400, 'date_from > date_to → 400', `got ${invalidDates.status}`);

  // Mismatched barangay and municipality
  const mismatchedGeo = await getPatientInfoDashboard(superuserToken, {
    municipality_id: '1', // Altavas
    barangay_id: '1',     // Andagao (Kalibo)
  });
  assert(mismatchedGeo.status === 400, 'Mismatched barangay/municipality → 400', `got ${mismatchedGeo.status}`);

  // 4. Filter Effects & Empty Scope Safety
  console.log('\n4. Filter Effects & Empty Scope Safety');
  const unfilteredTotal = dashData?.total_students ?? 0;

  // Filter by Kalibo (municipality_id = 7)
  const kaliboRes = await getPatientInfoDashboard(superuserToken, { municipality_id: '7' });
  assert(kaliboRes.status === 200, 'Kalibo filtered query → 200');
  const kaliboTotal = kaliboRes.body.data?.total_students ?? 0;
  assert(kaliboTotal <= unfilteredTotal, `Filtered total (${kaliboTotal}) <= unfiltered total (${unfilteredTotal})`);

  // Wide date range should equal unfiltered
  const wideDateRes = await getPatientInfoDashboard(superuserToken, {
    date_from: '2020-01-01',
    date_to: '2030-12-31',
  });
  const wideTotal = wideDateRes.body.data?.total_students ?? 0;
  assert(wideTotal === unfilteredTotal, `Wide date range total (${wideTotal}) equals unfiltered (${unfilteredTotal})`);

  // Future date range returns 0 safely without errors
  const futureRes = await getPatientInfoDashboard(superuserToken, {
    date_from: '2099-01-01',
    date_to: '2099-12-31',
  });
  assert(futureRes.status === 200, 'Future date range → 200');
  const futureData = futureRes.body.data;
  assert(futureData?.total_students === 0, 'Future date range returns 0 total_students');
  assert(futureData?.four_ps_count === 0, 'Future date range returns 0 four_ps_count');
  assert(futureData?.animal_bites_active_cases === 0, 'Future date range returns 0 active animal bites');
  assert(Array.isArray(futureData?.registration_trend) && futureData.registration_trend.length === 0, 'Future date range returns empty registration_trend');

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
