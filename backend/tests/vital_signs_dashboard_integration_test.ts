/**
 * Vital Signs Dashboard Integration Test (with Clinical-Threshold Safeguard)
 * 
 * Tests:
 * 1. GET /api/modules/vital-signs/dashboard RBAC (Superuser/Admin 200, Teacher 403, No token 401)
 * 2. Response shape, raw measurement distributions, completeness metrics, and safeguard metadata
 * 3. Filter validation (invalid municipality, inverted date range, geographic hierarchy)
 * 4. Filter effects and empty scope safety (future date range returns 0 cleanly)
 * 
 * Run with: npx tsx tests/vital_signs_dashboard_integration_test.ts
 */
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

interface VitalSignsDashData {
  total_screened: number;
  total_screenings: number;
  measurement_coverage: {
    bp_recorded: number;
    bmi_recorded: number;
    temperature_recorded: number;
    pulse_recorded: number;
    respiratory_recorded: number;
  };
  bmi_distribution: Array<{ interval: string; count: number }>;
  blood_pressure_systolic_distribution: Array<{ interval: string; count: number }>;
  blood_pressure_diastolic_distribution: Array<{ interval: string; count: number }>;
  temperature_distribution: Array<{ interval: string; count: number }>;
  elevated_temperature_count: number;
  coverage_by_school: Array<{ school_id: number; school_name: string; count: number }>;
  monthly_trend: Array<{ month: string; count: number }>;
  metadata: {
    clinical_thresholds_status: string;
    threshold_version: string;
    notice: string;
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

async function getVitalSignsDashboard(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: { message?: string; data?: VitalSignsDashData; error?: string } }> {
  const url = new URL(`${BASE_URL}/modules/vital-signs/dashboard`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as { message?: string; data?: VitalSignsDashData; error?: string };
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
  console.log('--- Vital Signs Dashboard Integration Tests ---\n');

  let superuserToken = '';
  let adminToken = '';
  let teacherToken = '';

  try {
    superuserToken = await login('super@pho.gov.ph', 'password123');
    adminToken = await login('admin@pho.gov.ph', 'password123');
    teacherToken = await login('teacher@pho.gov.ph', 'password123');
    console.log('✓ Logged in as superuser, admin, and teacher\n');
  } catch (err) {
    console.error('Fatal: Failed to login during test setup', err);
    process.exit(1);
  }

  // 1. RBAC Access Control
  console.log('1. RBAC Access Control');

  // Superuser can access dashboard
  const suDash = await getVitalSignsDashboard(superuserToken);
  assert(suDash.status === 200, 'Superuser GET /modules/vital-signs/dashboard → 200', `got ${suDash.status}`);

  // Admin can access dashboard
  const adminDash = await getVitalSignsDashboard(adminToken);
  assert(adminDash.status === 200, 'Admin GET /modules/vital-signs/dashboard → 200', `got ${adminDash.status}`);

  // Teacher cannot access dashboard (403)
  const teacherDash = await getVitalSignsDashboard(teacherToken);
  assert(teacherDash.status === 403, 'Teacher GET /modules/vital-signs/dashboard → 403', `got ${teacherDash.status}`);

  // Unauthenticated cannot access dashboard (401)
  const unauthDash = await getVitalSignsDashboard(null);
  assert(unauthDash.status === 401, 'Unauthenticated GET /modules/vital-signs/dashboard → 401', `got ${unauthDash.status}`);

  // 2. Response Shape, Safeguard Metadata & Metric Integrity
  console.log('\n2. Response Shape & Metric Integrity');
  const dData = suDash.body.data;
  assert(!!dData, 'Dashboard response has data property');

  if (dData) {
    assert(typeof dData.total_screened === 'number', 'total_screened is a number');
    assert(typeof dData.total_screenings === 'number', 'total_screenings is a number');
    assert(
      dData.total_screened <= dData.total_screenings,
      `Distinct screened (${dData.total_screened}) <= total screenings (${dData.total_screenings})`
    );

    // Measurement coverage
    assert(typeof dData.measurement_coverage === 'object', 'measurement_coverage is an object');
    assert(typeof dData.measurement_coverage.bp_recorded === 'number', 'bp_recorded is a number');
    assert(typeof dData.measurement_coverage.bmi_recorded === 'number', 'bmi_recorded is a number');
    assert(typeof dData.measurement_coverage.temperature_recorded === 'number', 'temperature_recorded is a number');
    assert(typeof dData.measurement_coverage.pulse_recorded === 'number', 'pulse_recorded is a number');
    assert(typeof dData.measurement_coverage.respiratory_recorded === 'number', 'respiratory_recorded is a number');

    assert(
      dData.measurement_coverage.bp_recorded <= dData.total_screened,
      'bp_recorded <= total_screened'
    );
    assert(
      dData.measurement_coverage.bmi_recorded <= dData.total_screened,
      'bmi_recorded <= total_screened'
    );

    // Raw distributions
    assert(Array.isArray(dData.bmi_distribution), 'bmi_distribution is an array');
    assert(Array.isArray(dData.blood_pressure_systolic_distribution), 'blood_pressure_systolic_distribution is an array');
    assert(Array.isArray(dData.blood_pressure_diastolic_distribution), 'blood_pressure_diastolic_distribution is an array');
    assert(Array.isArray(dData.temperature_distribution), 'temperature_distribution is an array');
    assert(typeof dData.elevated_temperature_count === 'number', 'elevated_temperature_count is a number');
    assert(Array.isArray(dData.coverage_by_school), 'coverage_by_school is an array');
    assert(Array.isArray(dData.monthly_trend), 'monthly_trend is an array');

    // Clinical-threshold safeguard metadata
    assert(typeof dData.metadata === 'object', 'metadata is an object');
    assert(
      dData.metadata.clinical_thresholds_status === 'PENDING_OFFICIAL_POLICY',
      `clinical_thresholds_status is "PENDING_OFFICIAL_POLICY" (got ${dData.metadata.clinical_thresholds_status})`
    );
    assert(
      typeof dData.metadata.threshold_version === 'string',
      'metadata.threshold_version is a string'
    );
    assert(
      typeof dData.metadata.notice === 'string',
      'metadata.notice is a string'
    );
  }

  // 3. Filter Validation
  console.log('\n3. Filter Validation');

  // Invalid municipality_id
  const invalidMun = await getVitalSignsDashboard(superuserToken, { municipality_id: 'abc' });
  assert(invalidMun.status === 400, 'Invalid municipality_id (string) → 400', `got ${invalidMun.status}`);

  // date_from > date_to
  const invalidDates = await getVitalSignsDashboard(superuserToken, {
    date_from: '2026-12-31',
    date_to: '2026-01-01',
  });
  assert(invalidDates.status === 400, 'date_from > date_to → 400', `got ${invalidDates.status}`);

  // Mismatched barangay and municipality
  const mismatchedGeo = await getVitalSignsDashboard(superuserToken, {
    municipality_id: '1', // Altavas
    barangay_id: '1',     // Andagao (Kalibo)
  });
  assert(mismatchedGeo.status === 400, 'Mismatched barangay/municipality → 400', `got ${mismatchedGeo.status}`);

  // 4. Filter Effects & Empty Scope Safety
  console.log('\n4. Filter Effects & Empty Scope Safety');

  const unfilteredScreened = dData?.total_screened ?? 0;

  // Filter by Kalibo (municipality_id = 7)
  const kaliboRes = await getVitalSignsDashboard(superuserToken, { municipality_id: '7' });
  assert(kaliboRes.status === 200, 'Kalibo filtered query → 200');
  const kaliboScreened = kaliboRes.body.data?.total_screened ?? 0;
  assert(
    kaliboScreened <= unfilteredScreened,
    `Kalibo screened (${kaliboScreened}) <= unfiltered (${unfilteredScreened})`
  );

  // Wide date range should equal unfiltered
  const wideDateRes = await getVitalSignsDashboard(superuserToken, {
    date_from: '2020-01-01',
    date_to: '2030-12-31',
  });
  const wideScreened = wideDateRes.body.data?.total_screened ?? 0;
  assert(
    wideScreened === unfilteredScreened,
    `Wide date range screened (${wideScreened}) equals unfiltered (${unfilteredScreened})`
  );

  // Future date range returns 0 safely without crash
  const futureRes = await getVitalSignsDashboard(superuserToken, {
    date_from: '2099-01-01',
    date_to: '2099-12-31',
  });
  assert(futureRes.status === 200, 'Future date range → 200');
  const futureData = futureRes.body.data;
  assert(futureData?.total_screened === 0, 'Future date range returns 0 total_screened');
  assert(futureData?.total_screenings === 0, 'Future date range returns 0 total_screenings');
  assert(futureData?.elevated_temperature_count === 0, 'Future date range returns 0 elevated_temperature_count');
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
