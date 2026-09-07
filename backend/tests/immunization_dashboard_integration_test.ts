/**
 * Immunization Dashboard Integration Test
 * 
 * Tests:
 * 1. GET /api/modules/immunization/dashboard RBAC (Superuser/Admin 200, Teacher 403, No token 401)
 * 2. Response shape, 6 vaccine antigen metrics, consent/refusal breakdown, educational levels, school coverage, monthly trend
 * 3. Non-mutually exclusive antigen dose semantics vs distinct student coverage
 * 4. Filter validation (invalid municipality, inverted date range, geographic hierarchy)
 * 5. Scope safety and zero handling (future date returns 0 counts and empty arrays cleanly)
 * 
 * Run with: npx tsx tests/immunization_dashboard_integration_test.ts
 */
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

interface VaccineAntigenMetric {
  antigen: 'td1' | 'mr1' | 'hpv1' | 'hpv2' | 'td2' | 'mr2';
  label: string;
  doses: number;
  students: number;
}

interface ImmunizationDashData {
  total_students_vaccinated: number;
  total_evaluated_students: number;
  total_doses_administered: number;
  vaccine_antigens: VaccineAntigenMetric[];
  consent_distribution: {
    consented_students: number;
    refused_students: number;
    deferred_students: number;
    refusal_rate: number;
    deferral_rate: number;
  };
  refusal_reasons: Array<{
    code: string;
    label: string;
    count: number;
  }>;
  vaccination_by_educational_level: Array<{
    educational_level: string;
    vaccinated_students: number;
    total_evaluated: number;
  }>;
  coverage_by_school: Array<{
    school_id: number;
    school_name: string;
    count: number;
  }>;
  monthly_trend: Array<{
    month: string;
    count: number;
  }>;
  contract_definitions: {
    vaccinated: string;
    coverage: string;
    vaccine_flags: string;
  };
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

async function getImmunizationDashboard(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: { message?: string; data?: ImmunizationDashData; error?: string } }> {
  const url = new URL(`${BASE_URL}/modules/immunization/dashboard`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as { message?: string; data?: ImmunizationDashData; error?: string };
  return { status: res.status, body };
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

// ─── Test Suite ─────────────────────────────────────────────────────

async function run() {
  console.log('--- Immunization Dashboard Integration Tests ---\n');

  let superuserToken = '';
  let adminToken = '';
  let teacherToken = '';

  // 1. Auth Setup
  console.log('1. Authenticating test users...');
  try {
    superuserToken = await login('super@pho.gov.ph', 'password123');
    adminToken = await login('admin@pho.gov.ph', 'password123');
    teacherToken = await login('teacher@pho.gov.ph', 'password123');
    console.log('  ✅ Logged in as superuser, admin, and teacher\n');
  } catch (err) {
    console.error('  ❌ Authentication failed:', err);
    process.exit(1);
  }

  // 2. Access Control / RBAC
  console.log('2. Testing RBAC Access Control...');
  const unauthRes = await getImmunizationDashboard(null);
  assert(unauthRes.status === 401, 'Unauthenticated request returns 401 Unauthorized');

  const teacherRes = await getImmunizationDashboard(teacherToken);
  assert(teacherRes.status === 403, 'Teacher request returns 403 Forbidden');

  const superRes = await getImmunizationDashboard(superuserToken);
  assert(superRes.status === 200, 'Superuser request returns 200 OK');

  const adminRes = await getImmunizationDashboard(adminToken);
  assert(adminRes.status === 200, 'Admin request returns 200 OK');
  console.log('');

  // 3. Response Structure & Surveillance Contract Validation
  console.log('3. Validating Dashboard Response Shape & Metrics...');
  const data = superRes.body.data;
  assert(data !== undefined, 'Response has data property');

  if (data) {
    assert(typeof data.total_students_vaccinated === 'number', 'total_students_vaccinated is a number');
    assert(typeof data.total_evaluated_students === 'number', 'total_evaluated_students is a number');
    assert(typeof data.total_doses_administered === 'number', 'total_doses_administered is a number');

    assert(Array.isArray(data.vaccine_antigens), 'vaccine_antigens is an array');
    assert(data.vaccine_antigens.length === 6, 'vaccine_antigens contains exactly 6 antigens');

    const antigens = data.vaccine_antigens.map((a) => a.antigen);
    assert(
      antigens.includes('td1') &&
      antigens.includes('mr1') &&
      antigens.includes('hpv1') &&
      antigens.includes('hpv2') &&
      antigens.includes('td2') &&
      antigens.includes('mr2'),
      'All 6 approved antigens (td1, mr1, hpv1, hpv2, td2, mr2) are present'
    );

    // Dose consistency
    const totalDosesFromAntigens = data.vaccine_antigens.reduce((acc, a) => acc + a.doses, 0);
    assert(
      totalDosesFromAntigens === data.total_doses_administered,
      `Sum of antigen doses (${totalDosesFromAntigens}) matches total_doses_administered (${data.total_doses_administered})`
    );

    // Distinct coverage logic
    assert(
      data.total_students_vaccinated <= data.total_evaluated_students,
      `Vaccinated students (${data.total_students_vaccinated}) <= evaluated students (${data.total_evaluated_students})`
    );

    // Consent breakdown
    const consent = data.consent_distribution;
    assert(consent !== undefined, 'consent_distribution is defined');
    assert(typeof consent.consented_students === 'number', 'consented_students is a number');
    assert(typeof consent.refused_students === 'number', 'refused_students is a number');
    assert(typeof consent.deferred_students === 'number', 'deferred_students is a number');
    assert(typeof consent.refusal_rate === 'number', 'refusal_rate is a number');
    assert(typeof consent.deferral_rate === 'number', 'deferral_rate is a number');

    // Refusal reasons
    assert(Array.isArray(data.refusal_reasons), 'refusal_reasons is an array');
    if (data.refusal_reasons.length > 0) {
      const first = data.refusal_reasons[0];
      assert(
        typeof first.code === 'string' && typeof first.label === 'string' && typeof first.count === 'number',
        'refusal_reasons items have code, label, and count'
      );
    }

    // Educational level breakdown
    assert(Array.isArray(data.vaccination_by_educational_level), 'vaccination_by_educational_level is an array');

    // Coverage by school
    assert(Array.isArray(data.coverage_by_school), 'coverage_by_school is an array');

    // Monthly trend
    assert(Array.isArray(data.monthly_trend), 'monthly_trend is an array');

    // Contract definitions
    assert(
      typeof data.contract_definitions?.vaccinated === 'string' &&
      typeof data.contract_definitions?.coverage === 'string' &&
      typeof data.contract_definitions?.vaccine_flags === 'string',
      'Contract definitions are present and non-empty'
    );
  }
  console.log('');

  // 4. Geographic and Date Filtering Validation
  console.log('4. Testing Filter Validation...');
  const invalidMunRes = await getImmunizationDashboard(superuserToken, { municipality_id: 'abc' });
  assert(invalidMunRes.status === 400, 'Invalid municipality_id (string) returns 400 Bad Request');

  const mismatchedGeoRes = await getImmunizationDashboard(superuserToken, {
    municipality_id: '1', // Altavas
    barangay_id: '1',     // Andagao (Kalibo)
  });
  assert(mismatchedGeoRes.status === 400, 'Mismatched barangay/municipality returns 400 Bad Request');

  const invertedDateRes = await getImmunizationDashboard(superuserToken, {
    date_from: '2026-12-31',
    date_to: '2026-01-01',
  });
  assert(invertedDateRes.status === 400, 'Inverted date range returns 400 Bad Request');

  const invalidDateRes = await getImmunizationDashboard(superuserToken, { date_from: 'not-a-date' });
  assert(invalidDateRes.status === 400, 'Invalid date string returns 400 Bad Request');
  console.log('');

  // 5. Zero Scope / Empty Filter Safety
  console.log('5. Testing Future Date Scope (Zero Records Safety)...');
  const futureRes = await getImmunizationDashboard(superuserToken, {
    date_from: '2099-01-01',
    date_to: '2099-12-31',
  });
  assert(futureRes.status === 200, 'Future date range returns 200 OK without errors');

  const futureData = futureRes.body.data;
  if (futureData) {
    assert(futureData.total_students_vaccinated === 0, 'total_students_vaccinated is 0 for empty scope');
    assert(futureData.total_evaluated_students === 0, 'total_evaluated_students is 0 for empty scope');
    assert(futureData.total_doses_administered === 0, 'total_doses_administered is 0 for empty scope');
    assert(futureData.consent_distribution.refusal_rate === 0, 'refusal_rate safely defaults to 0% (no div by zero)');
    assert(futureData.consent_distribution.deferral_rate === 0, 'deferral_rate safely defaults to 0% (no div by zero)');
    assert(futureData.refusal_reasons.length === 0, 'refusal_reasons is an empty array');
    assert(futureData.coverage_by_school.length === 0, 'coverage_by_school is an empty array');
    assert(futureData.monthly_trend.length === 0, 'monthly_trend is an empty array');
  }
  console.log('');

  // ─── Summary ────────────────────────────────────────────────────────
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
