/**
 * Deworming Dashboard & Consolidation Report Integration Test
 * 
 * Tests:
 * 1. GET /api/modules/deworming/dashboard (RBAC, shape, Option 1 target, filters)
 * 2. GET /api/modules/deworming/report (period format, 17 municipalities, math integrity)
 * 
 * Run with: npx tsx tests/deworming_dashboard_integration_test.ts
 */
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

interface DewormingMunicipalitySummary {
  municipality_id: number;
  municipality_name: string;
  target: number;
  male_accomplished: number;
  female_accomplished: number;
  total_accomplished: number;
  accomplishment_rate: number;
}

interface DewormingDashData {
  total_dewormed: number;
  deworming_by_age_group: Array<{ age_group: string; count: number }>;
  public_vs_private: Array<{ school_type: string; count: number }>;
  in_school_vs_out_of_school: { in_school: number; out_of_school: number };
  monthly_trend: Array<{ month: string; count: number }>;
  municipality_summary: DewormingMunicipalitySummary[];
  province_total: {
    target: number;
    total_accomplished: number;
    accomplishment_rate: number;
  };
}

interface DewormingReportRow {
  municipality_id: number;
  municipality_name: string;
  target: number;
  male_accomplished: number;
  female_accomplished: number;
  total_accomplished: number;
  accomplishment_rate: number;
}

interface DewormingReportData {
  period: string;
  municipalities: DewormingReportRow[];
  province_totals: {
    target: number;
    male_accomplished: number;
    female_accomplished: number;
    total_accomplished: number;
    accomplishment_rate: number;
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

async function getDewormingDashboard(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: { message?: string; data?: DewormingDashData; error?: string } }> {
  const url = new URL(`${BASE_URL}/modules/deworming/dashboard`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as { message?: string; data?: DewormingDashData; error?: string };
  return { status: res.status, body };
}

async function getDewormingReport(
  token: string | null,
  params: Record<string, string> = {}
): Promise<{ status: number; body: { message?: string; data?: DewormingReportData; error?: string } }> {
  const url = new URL(`${BASE_URL}/modules/deworming/report`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { method: 'GET', headers });
  const body = (await res.json()) as { message?: string; data?: DewormingReportData; error?: string };
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
  console.log('--- Deworming Dashboard & Consolidation Report Integration Tests ---\n');

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
  const suDash = await getDewormingDashboard(superuserToken);
  assert(suDash.status === 200, 'Superuser GET /modules/deworming/dashboard → 200', `got ${suDash.status}`);

  // Admin can access dashboard
  const adminDash = await getDewormingDashboard(adminToken);
  assert(adminDash.status === 200, 'Admin GET /modules/deworming/dashboard → 200', `got ${adminDash.status}`);

  // Teacher cannot access dashboard (403)
  const teacherDash = await getDewormingDashboard(teacherToken);
  assert(teacherDash.status === 403, 'Teacher GET /modules/deworming/dashboard → 403', `got ${teacherDash.status}`);

  // Unauthenticated cannot access dashboard (401)
  const unauthDash = await getDewormingDashboard(null);
  assert(unauthDash.status === 401, 'Unauthenticated GET /modules/deworming/dashboard → 401', `got ${unauthDash.status}`);

  // Superuser can access report
  const suReport = await getDewormingReport(superuserToken, { period: '2026-09' });
  assert(suReport.status === 200, 'Superuser GET /modules/deworming/report → 200', `got ${suReport.status}`);

  // Admin can access report
  const adminReport = await getDewormingReport(adminToken, { period: '2026-09' });
  assert(adminReport.status === 200, 'Admin GET /modules/deworming/report → 200', `got ${adminReport.status}`);

  // Teacher cannot access report (403)
  const teacherReport = await getDewormingReport(teacherToken, { period: '2026-09' });
  assert(teacherReport.status === 403, 'Teacher GET /modules/deworming/report → 403', `got ${teacherReport.status}`);

  // Unauthenticated cannot access report (401)
  const unauthReport = await getDewormingReport(null, { period: '2026-09' });
  assert(unauthReport.status === 401, 'Unauthenticated GET /modules/deworming/report → 401', `got ${unauthReport.status}`);

  // 2. Deworming Dashboard Response Shape & Metrics
  console.log('\n2. Deworming Dashboard Response Shape & Metrics');
  const dData = suDash.body.data;
  assert(!!dData, 'Dashboard response has data property');

  if (dData) {
    assert(typeof dData.total_dewormed === 'number', 'total_dewormed is a number');
    assert(typeof dData.province_total === 'object', 'province_total is an object');
    assert(typeof dData.province_total.target === 'number', 'province_total.target is a number');
    assert(typeof dData.province_total.total_accomplished === 'number', 'province_total.total_accomplished is a number');
    assert(typeof dData.province_total.accomplishment_rate === 'number', 'province_total.accomplishment_rate is a number');

    // Setting coverage
    assert(typeof dData.in_school_vs_out_of_school.in_school === 'number', 'in_school count is a number');
    assert(typeof dData.in_school_vs_out_of_school.out_of_school === 'number', 'out_of_school count is a number');

    // Distributions
    assert(Array.isArray(dData.deworming_by_age_group), 'deworming_by_age_group is an array');
    assert(Array.isArray(dData.public_vs_private), 'public_vs_private is an array');
    assert(Array.isArray(dData.monthly_trend), 'monthly_trend is an array');
    assert(Array.isArray(dData.municipality_summary), 'municipality_summary is an array');

    // Check municipality summary entries
    if (dData.municipality_summary.length > 0) {
      const firstMun = dData.municipality_summary[0]!;
      assert(typeof firstMun.municipality_id === 'number', 'municipality_id is a number');
      assert(typeof firstMun.municipality_name === 'string', 'municipality_name is a string');
      assert(typeof firstMun.target === 'number', 'target is a number');
      assert(typeof firstMun.male_accomplished === 'number', 'male_accomplished is a number');
      assert(typeof firstMun.female_accomplished === 'number', 'female_accomplished is a number');
      assert(typeof firstMun.total_accomplished === 'number', 'total_accomplished is a number');
      assert(typeof firstMun.accomplishment_rate === 'number', 'accomplishment_rate is a number');
      assert(
        firstMun.male_accomplished + firstMun.female_accomplished === firstMun.total_accomplished,
        `Male (${firstMun.male_accomplished}) + Female (${firstMun.female_accomplished}) === Total (${firstMun.total_accomplished})`
      );
    }
  }

  // 3. Deworming Consolidation Report
  console.log('\n3. Deworming Consolidation Report');

  // Missing period param
  const noPeriod = await getDewormingReport(superuserToken, {});
  assert(noPeriod.status === 400, 'Missing period parameter → 400', `got ${noPeriod.status}`);

  // Invalid period format (not YYYY-MM)
  const badPeriod = await getDewormingReport(superuserToken, { period: '2026' });
  assert(badPeriod.status === 400, 'Invalid period format "2026" → 400', `got ${badPeriod.status}`);

  // Valid period response
  const report = suReport.body.data;
  assert(!!report, 'Report response has data property');

  if (report) {
    assert(report.period === '2026-09', `report.period === "2026-09" (got ${report.period})`);
    assert(Array.isArray(report.municipalities), 'report.municipalities is an array');
    assert(
      report.municipalities.length === 17,
      `All 17 Aklan municipalities returned in report (got ${report.municipalities.length})`
    );

    let sumTarget = 0;
    let sumMale = 0;
    let sumFemale = 0;
    let sumTotal = 0;

    for (const m of report.municipalities) {
      sumTarget += m.target;
      sumMale += m.male_accomplished;
      sumFemale += m.female_accomplished;
      sumTotal += m.total_accomplished;

      assert(
        m.male_accomplished + m.female_accomplished === m.total_accomplished,
        `${m.municipality_name}: male (${m.male_accomplished}) + female (${m.female_accomplished}) === total (${m.total_accomplished})`
      );
    }

    assert(
      report.province_totals.target === sumTarget,
      `Province total target (${report.province_totals.target}) equals sum of municipalities (${sumTarget})`
    );
    assert(
      report.province_totals.male_accomplished === sumMale,
      `Province male accomplished (${report.province_totals.male_accomplished}) equals sum of municipalities (${sumMale})`
    );
    assert(
      report.province_totals.female_accomplished === sumFemale,
      `Province female accomplished (${report.province_totals.female_accomplished}) equals sum of municipalities (${sumFemale})`
    );
    assert(
      report.province_totals.total_accomplished === sumTotal,
      `Province total accomplished (${report.province_totals.total_accomplished}) equals sum of municipalities (${sumTotal})`
    );
    assert(
      report.province_totals.male_accomplished + report.province_totals.female_accomplished === report.province_totals.total_accomplished,
      `Province male + female === total accomplished`
    );
  }

  // 4. Filter Validation & Empty Scope Safety
  console.log('\n4. Filter Validation & Empty Scope Safety');

  // Invalid municipality_id
  const invalidMun = await getDewormingDashboard(superuserToken, { municipality_id: 'abc' });
  assert(invalidMun.status === 400, 'Invalid municipality_id (string) → 400', `got ${invalidMun.status}`);

  // date_from > date_to
  const invalidDates = await getDewormingDashboard(superuserToken, {
    date_from: '2026-12-31',
    date_to: '2026-01-01',
  });
  assert(invalidDates.status === 400, 'date_from > date_to → 400', `got ${invalidDates.status}`);

  // Mismatched barangay and municipality
  const mismatchedGeo = await getDewormingDashboard(superuserToken, {
    municipality_id: '1', // Altavas
    barangay_id: '1',     // Andagao (Kalibo)
  });
  assert(mismatchedGeo.status === 400, 'Mismatched barangay/municipality → 400', `got ${mismatchedGeo.status}`);

  // Future date range returns 0 safely without crash
  const futureRes = await getDewormingDashboard(superuserToken, {
    date_from: '2099-01-01',
    date_to: '2099-12-31',
  });
  assert(futureRes.status === 200, 'Future date range → 200');
  const futureData = futureRes.body.data;
  assert(futureData?.total_dewormed === 0, 'Future date range returns 0 total_dewormed');
  assert(futureData?.in_school_vs_out_of_school.in_school === 0, 'Future date range returns 0 in_school');
  assert(futureData?.in_school_vs_out_of_school.out_of_school === 0, 'Future date range returns 0 out_of_school');
  assert(Array.isArray(futureData?.monthly_trend) && futureData.monthly_trend.length === 0, 'Future date range returns empty monthly_trend');

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
