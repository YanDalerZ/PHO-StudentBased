import { z } from 'zod';
import pool from '../database/db.js';

// ─── Filter Types ────────────────────────────────────────────────────
export interface DashboardFilters {
  municipality_id?: number | undefined;
  barangay_id?: number | undefined;
  school_id?: number | undefined;
  school_ids?: number[] | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
}

// ─── Zod Validation Schema ──────────────────────────────────────────
export const dashboardFiltersSchema = z.object({
  municipality_id: z.coerce.number().int().positive().optional(),
  barangay_id: z.coerce.number().int().positive().optional(),
  school_id: z.coerce.number().int().positive().optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be ISO date (YYYY-MM-DD)')
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be ISO date (YYYY-MM-DD)')
    .optional(),
}).refine(
  (data) => {
    if (data.date_from && data.date_to) {
      return data.date_from <= data.date_to;
    }
    return true;
  },
  { message: 'date_from must be before or equal to date_to', path: ['date_from'] }
);

// ─── Geography Hierarchy Validation ─────────────────────────────────
export async function validateGeographyHierarchy(
  filters: DashboardFilters
): Promise<{ valid: boolean; error?: string }> {
  // If barangay_id is provided with municipality_id, validate the relationship
  if (filters.barangay_id && filters.municipality_id) {
    const result = await pool.query(
      'SELECT id FROM "barangays" WHERE id = $1 AND municipality_id = $2',
      [filters.barangay_id, filters.municipality_id]
    );
    if (result.rows.length === 0) {
      return {
        valid: false,
        error: `Barangay ${filters.barangay_id} does not belong to municipality ${filters.municipality_id}`,
      };
    }
  }

  // If school_id is provided with barangay_id, validate the relationship
  if (filters.school_id && filters.barangay_id) {
    const result = await pool.query(
      'SELECT id FROM "schools" WHERE id = $1 AND barangay_id = $2',
      [filters.school_id, filters.barangay_id]
    );
    if (result.rows.length === 0) {
      return {
        valid: false,
        error: `School ${filters.school_id} does not belong to barangay ${filters.barangay_id}`,
      };
    }
  }

  return { valid: true };
}

// ─── SQL Building Helpers ───────────────────────────────────────────

/**
 * Build the standard JOIN chain from students through geography.
 * Returns SQL fragment to append after the FROM clause.
 * @param studentAlias – alias for the STUDENTS table (default: 's')
 */
export function buildStudentGeoJoins(studentAlias = 's'): string {
  return `
    JOIN "schools" sc ON ${studentAlias}.school_id = sc.id
    JOIN "barangays" b ON sc.barangay_id = b.id
    JOIN "municipalities" m ON b.municipality_id = m.id
  `;
}

/**
 * Build the JOIN chain from a module table through students and geography.
 * @param moduleTable – the literal module table name (e.g. 'oral_health')
 * @param moduleAlias – alias for the module table (e.g. 'oh')
 * @param studentJoinCol – column on the module table pointing to students (default: 'student_id')
 */
export function buildModuleGeoJoins(
  moduleAlias: string,
  studentJoinCol = 'student_id'
): string {
  return `
    JOIN "students" s ON ${moduleAlias}.${studentJoinCol} = s.id
    ${buildStudentGeoJoins('s')}
  `;
}

/**
 * Build parameterized WHERE conditions from the filter object.
 * @param filters – validated DashboardFilters
 * @param dateColumn – the date column to filter on (e.g. 's.created_at', 'd.date_dewormed')
 * @param paramOffset – starting parameter number ($N)
 * @returns { conditions: string[], params: unknown[] }
 */
export function buildWhereClause(
  filters: DashboardFilters,
  dateColumn: string,
  paramOffset = 1
): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = paramOffset;

  if (filters.municipality_id) {
    conditions.push(`m.id = $${idx++}`);
    params.push(filters.municipality_id);
  }
  if (filters.barangay_id) {
    conditions.push(`b.id = $${idx++}`);
    params.push(filters.barangay_id);
  }
  if (filters.school_id) {
    conditions.push(`sc.id = $${idx++}`);
    params.push(filters.school_id);
  } else if (filters.school_ids !== undefined) {
    if (filters.school_ids.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`sc.id = ANY($${idx++})`);
      params.push(filters.school_ids);
    }
  }
  if (filters.date_from) {
    conditions.push(`${dateColumn} >= $${idx++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`${dateColumn} <= $${idx++}`);
    params.push(filters.date_to);
  }

  return { conditions, params };
}

/**
 * Helper to construct the full WHERE fragment (with "WHERE" keyword).
 * Returns empty string if no conditions.
 */
export function buildWhereFragment(
  filters: DashboardFilters,
  dateColumn: string,
  paramOffset = 1
): { whereSQL: string; params: unknown[] } {
  const { conditions, params } = buildWhereClause(filters, dateColumn, paramOffset);
  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSQL, params };
}

// ─── Module Completion Count Helper ─────────────────────────────────

/**
 * Count distinct students with at least one record in a module table.
 * Uses the standard geo JOIN chain for filtering.
 *
 * @param moduleTable – literal table name (e.g. 'patient_info')
 * @param filters – validated DashboardFilters
 * @param dateColumn – date column on the module table (e.g. 'mt.created_at')
 */
export async function countModuleStudents(
  moduleTable: string,
  filters: DashboardFilters,
  dateColumn: string
): Promise<number> {
  // Only allow known module table names to prevent SQL injection
  const allowedTables = ['patient_info', 'oral_health', 'deworming', 'immunization', 'vital_signs'];
  if (!allowedTables.includes(moduleTable)) {
    throw new Error(`Invalid module table: ${moduleTable}`);
  }

  const { whereSQL, params } = buildWhereFragment(filters, dateColumn);

  const sql = `
    SELECT COUNT(DISTINCT mt.student_id) as count
    FROM "${moduleTable}" mt
    ${buildModuleGeoJoins('mt')}
    ${whereSQL}
  `;

  const result = await pool.query(sql, params);
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// ─── Patient Info Dashboard Aggregations ───────────────────────────

export interface PatientInfoDashboardData {
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

export async function getPatientInfoDashboard(
  filters: DashboardFilters
): Promise<PatientInfoDashboardData> {
  const geoJoins = buildStudentGeoJoins('s');
  const { whereSQL, params } = buildWhereFragment(filters, 's.created_at::date');

  // Helper for queries that require additional static conditions
  const buildExtraWhere = (extraCondition: string): { sql: string; queryParams: unknown[] } => {
    const { conditions, params: condParams } = buildWhereClause(filters, 's.created_at::date');
    conditions.push(extraCondition);
    return {
      sql: `WHERE ${conditions.join(' AND ')}`,
      queryParams: condParams,
    };
  };

  // 1. Demographics & Total
  const demographicsPromise = pool.query<{
    total_students: number;
    male_count: number;
    female_count: number;
    four_ps_count: number;
    pwd_total: number;
    philhealth_covered: number;
    philhealth_not_covered: number;
    indigenous_count: number;
  }>(
    `
    SELECT
      COUNT(*)::int AS total_students,
      COUNT(CASE WHEN s.sex = 'Male' THEN 1 END)::int AS male_count,
      COUNT(CASE WHEN s.sex = 'Female' THEN 1 END)::int AS female_count,
      COUNT(CASE WHEN s.is_4ps_member = TRUE THEN 1 END)::int AS four_ps_count,
      COUNT(CASE WHEN s.is_pwd = TRUE THEN 1 END)::int AS pwd_total,
      COUNT(CASE WHEN s.is_philhealth_member = TRUE THEN 1 END)::int AS philhealth_covered,
      COUNT(CASE WHEN s.is_philhealth_member = FALSE OR s.is_philhealth_member IS NULL THEN 1 END)::int AS philhealth_not_covered,
      COUNT(CASE WHEN s.is_indigenous = TRUE THEN 1 END)::int AS indigenous_count
    FROM "students" s
    ${geoJoins}
    ${whereSQL}
    `,
    params
  );

  // 2. Age group distribution
  const ageGroupPromise = pool.query<{ age_group: string; count: number }>(
    `
    SELECT
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_of_birth)) < 5 THEN '<5'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_of_birth)) BETWEEN 5 AND 9 THEN '5-9'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_of_birth)) BETWEEN 10 AND 14 THEN '10-14'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_of_birth)) BETWEEN 15 AND 19 THEN '15-19'
        ELSE '20+'
      END AS age_group,
      COUNT(*)::int AS count
    FROM "students" s
    ${geoJoins}
    ${whereSQL}
    GROUP BY age_group
    ORDER BY MIN(EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_of_birth)))
    `,
    params
  );

  // 3. Registration by municipality
  const municipalityPromise = pool.query<{
    municipality_id: number;
    municipality_name: string;
    count: number;
  }>(
    `
    SELECT
      m.id AS municipality_id,
      m.name AS municipality_name,
      COUNT(s.id)::int AS count
    FROM "municipalities" m
    JOIN "barangays" b ON b.municipality_id = m.id
    JOIN "schools" sc ON sc.barangay_id = b.id
    JOIN "students" s ON s.school_id = sc.id
    ${whereSQL}
    GROUP BY m.id, m.name
    ORDER BY count DESC, m.name ASC
    `,
    params
  );

  // 4. Registration trend (monthly from s.created_at)
  const trendPromise = pool.query<{ month: string; count: number }>(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', s.created_at), 'YYYY-MM') AS month,
      COUNT(*)::int AS count
    FROM "students" s
    ${geoJoins}
    ${whereSQL}
    GROUP BY DATE_TRUNC('month', s.created_at)
    ORDER BY month ASC
    `,
    params
  );

  // 5. PWD distribution by type
  const pwdExtra = buildExtraWhere('s.is_pwd = TRUE');
  const pwdPromise = pool.query<{ pwd_type: string; count: number }>(
    `
    SELECT
      COALESCE(NULLIF(TRIM(s.pwd_type), ''), 'Unspecified') AS pwd_type,
      COUNT(*)::int AS count
    FROM "students" s
    ${geoJoins}
    ${pwdExtra.sql}
    GROUP BY pwd_type
    ORDER BY count DESC
    `,
    pwdExtra.queryParams
  );

  // 6. PhilHealth category breakdown
  const philhealthExtra = buildExtraWhere('s.is_philhealth_member = TRUE');
  const philhealthCatPromise = pool.query<{ category: string; count: number }>(
    `
    SELECT
      COALESCE(NULLIF(TRIM(s.philhealth_category), ''), 'Uncategorized') AS category,
      COUNT(*)::int AS count
    FROM "students" s
    ${geoJoins}
    ${philhealthExtra.sql}
    GROUP BY category
    ORDER BY count DESC
    `,
    philhealthExtra.queryParams
  );

  // 7. Blood type distribution
  const bloodExtra = buildExtraWhere("s.blood_type IS NOT NULL AND s.blood_type != ''");
  const bloodPromise = pool.query<{ blood_type: string; count: number }>(
    `
    SELECT
      COALESCE(NULLIF(TRIM(s.blood_type), ''), 'Unknown') AS blood_type,
      COUNT(*)::int AS count
    FROM "students" s
    ${geoJoins}
    ${bloodExtra.sql}
    GROUP BY blood_type
    ORDER BY blood_type ASC
    `,
    bloodExtra.queryParams
  );

  // 8. Active animal bites cases
  const { conditions: abConditions, params: abParams } = buildWhereClause(
    filters,
    'ab.created_at::date'
  );
  abConditions.push('ab.is_active_case = TRUE');
  const abWhereSQL = `WHERE ${abConditions.join(' AND ')}`;

  const animalBitesPromise = pool.query<{ active_count: number }>(
    `
    SELECT COUNT(*)::int AS active_count
    FROM "animal_bites" ab
    JOIN "students" s ON ab.student_id = s.id
    ${geoJoins}
    ${abWhereSQL}
    `,
    abParams
  );

  const [
    demographicsRes,
    ageGroupRes,
    municipalityRes,
    trendRes,
    pwdRes,
    philhealthCatRes,
    bloodRes,
    animalBitesRes,
  ] = await Promise.all([
    demographicsPromise,
    ageGroupPromise,
    municipalityPromise,
    trendPromise,
    pwdPromise,
    philhealthCatPromise,
    bloodPromise,
    animalBitesPromise,
  ]);

  const demo = demographicsRes.rows[0] ?? {
    total_students: 0,
    male_count: 0,
    female_count: 0,
    four_ps_count: 0,
    pwd_total: 0,
    philhealth_covered: 0,
    philhealth_not_covered: 0,
    indigenous_count: 0,
  };

  const totalStudents = Number(demo.total_students);
  const philhealthCovered = Number(demo.philhealth_covered);
  const coverageRate =
    totalStudents > 0 ? Math.round((philhealthCovered / totalStudents) * 1000) / 10 : 0;

  return {
    total_students: totalStudents,
    registration_trend: trendRes.rows.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
    registration_by_municipality: municipalityRes.rows.map((r) => ({
      municipality_id: Number(r.municipality_id),
      municipality_name: r.municipality_name,
      count: Number(r.count),
    })),
    gender_distribution: {
      male: Number(demo.male_count),
      female: Number(demo.female_count),
    },
    age_group_distribution: ageGroupRes.rows.map((r) => ({
      age_group: r.age_group,
      count: Number(r.count),
    })),
    four_ps_count: Number(demo.four_ps_count),
    pwd_total: Number(demo.pwd_total),
    pwd_distribution: pwdRes.rows.map((r) => ({
      pwd_type: r.pwd_type,
      count: Number(r.count),
    })),
    philhealth_coverage: {
      covered: philhealthCovered,
      not_covered: Number(demo.philhealth_not_covered),
      coverage_rate: coverageRate,
    },
    philhealth_category_breakdown: philhealthCatRes.rows.map((r) => ({
      category: r.category,
      count: Number(r.count),
    })),
    indigenous_count: Number(demo.indigenous_count),
    blood_type_distribution: bloodRes.rows.map((r) => ({
      blood_type: r.blood_type,
      count: Number(r.count),
    })),
    animal_bites_active_cases: Number(animalBitesRes.rows[0]?.active_count ?? 0),
  };
}

// ─── Oral Health Dashboard Aggregations (RPOC-based) ───────────────

export interface OralHealthDashboardData {
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

export async function getOralHealthDashboard(
  filters: DashboardFilters
): Promise<OralHealthDashboardData> {
  const geoJoins = buildModuleGeoJoins('oh');
  const { whereSQL, params } = buildWhereFragment(filters, 'oh.date_examined');

  // 1. Core Summary: total examined, total visits, RPOC completed, and 5 distinct RPOC steps
  const summaryPromise = pool.query<{
    total_students_examined: number;
    total_examinations: number;
    rpoc_completed: number;
    screening: number;
    risk_assessment: number;
    prophylaxis: number;
    counseling: number;
    fluoride_varnish: number;
  }>(
    `
    SELECT
      COUNT(DISTINCT oh.student_id)::int AS total_students_examined,
      COUNT(*)::int AS total_examinations,
      COUNT(DISTINCT CASE WHEN oh.is_rpoc_complete = TRUE THEN oh.student_id END)::int AS rpoc_completed,
      COUNT(DISTINCT CASE WHEN oh.has_oral_screening = TRUE THEN oh.student_id END)::int AS screening,
      COUNT(DISTINCT CASE WHEN oh.has_risk_assessment = TRUE THEN oh.student_id END)::int AS risk_assessment,
      COUNT(DISTINCT CASE WHEN oh.has_oral_prophylaxis = TRUE THEN oh.student_id END)::int AS prophylaxis,
      COUNT(DISTINCT CASE WHEN oh.has_counseling = TRUE THEN oh.student_id END)::int AS counseling,
      COUNT(DISTINCT CASE WHEN oh.has_fluoride_varnish = TRUE THEN oh.student_id END)::int AS fluoride_varnish
    FROM "oral_health" oh
    ${geoJoins}
    ${whereSQL}
    `,
    params
  );

  // 2. Facility vs Non-Facility Distribution
  const facilityPromise = pool.query<{ location: string; count: number }>(
    `
    SELECT
      COALESCE(oh.service_location::text, 'UNKNOWN') AS location,
      COUNT(DISTINCT oh.student_id)::int AS count
    FROM "oral_health" oh
    ${geoJoins}
    ${whereSQL}
    GROUP BY location
    ORDER BY count DESC
    `,
    params
  );

  // 3. Visit Type Distribution (1st Visit vs 2nd Visit)
  const visitTypePromise = pool.query<{ visit_type: string; count: number }>(
    `
    SELECT
      COALESCE(oh.visit_type::text, 'UNKNOWN') AS visit_type,
      COUNT(*)::int AS count
    FROM "oral_health" oh
    ${geoJoins}
    ${whereSQL}
    GROUP BY visit_type
    ORDER BY count DESC
    `,
    params
  );

  // 4. Coverage by School
  const schoolPromise = pool.query<{
    school_id: number;
    school_name: string;
    count: number;
  }>(
    `
    SELECT
      sc.id AS school_id,
      sc.name AS school_name,
      COUNT(DISTINCT oh.student_id)::int AS count
    FROM "oral_health" oh
    ${geoJoins}
    ${whereSQL}
    GROUP BY sc.id, sc.name
    ORDER BY count DESC, sc.name ASC
    `,
    params
  );

  // 5. Monthly Trend from date_examined
  const trendPromise = pool.query<{ month: string; count: number }>(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', oh.date_examined), 'YYYY-MM') AS month,
      COUNT(DISTINCT oh.student_id)::int AS count
    FROM "oral_health" oh
    ${geoJoins}
    ${whereSQL}
    GROUP BY DATE_TRUNC('month', oh.date_examined)
    ORDER BY month ASC
    `,
    params
  );

  const [summaryRes, facilityRes, visitTypeRes, schoolRes, trendRes] =
    await Promise.all([
      summaryPromise,
      facilityPromise,
      visitTypePromise,
      schoolPromise,
      trendPromise,
    ]);

  const summary = summaryRes.rows[0] ?? {
    total_students_examined: 0,
    total_examinations: 0,
    rpoc_completed: 0,
    screening: 0,
    risk_assessment: 0,
    prophylaxis: 0,
    counseling: 0,
    fluoride_varnish: 0,
  };

  const totalExamined = Number(summary.total_students_examined);
  const totalVisits = Number(summary.total_examinations);
  const rpocCompleted = Number(summary.rpoc_completed);
  const rpocIncomplete = Math.max(0, totalExamined - rpocCompleted);
  const completionRate =
    totalExamined > 0
      ? Math.round((rpocCompleted / totalExamined) * 1000) / 10
      : 0;

  return {
    total_students_examined: totalExamined,
    total_examinations: totalVisits,
    rpoc_completion: {
      completed: rpocCompleted,
      incomplete: rpocIncomplete,
      completion_rate: completionRate,
    },
    rpoc_steps: {
      screening: Number(summary.screening),
      risk_assessment: Number(summary.risk_assessment),
      prophylaxis: Number(summary.prophylaxis),
      counseling: Number(summary.counseling),
      fluoride_varnish: Number(summary.fluoride_varnish),
    },
    facility_distribution: facilityRes.rows.map((r) => ({
      location: r.location,
      count: Number(r.count),
    })),
    visit_type_distribution: visitTypeRes.rows.map((r) => ({
      visit_type: r.visit_type,
      count: Number(r.count),
    })),
    coverage_by_school: schoolRes.rows.map((r) => ({
      school_id: Number(r.school_id),
      school_name: r.school_name,
      count: Number(r.count),
    })),
    monthly_trend: trendRes.rows.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
  };
}

// ─── Deworming Dashboard & Report Aggregations ──────────────────────

export interface DewormingMunicipalitySummary {
  municipality_id: number;
  municipality_name: string;
  target: number;
  male_accomplished: number;
  female_accomplished: number;
  total_accomplished: number;
  accomplishment_rate: number;
}

export interface DewormingDashboardData {
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

export interface DewormingReportMunicipalityRow {
  municipality_id: number;
  municipality_name: string;
  target: number;
  male_accomplished: number;
  female_accomplished: number;
  total_accomplished: number;
  accomplishment_rate: number;
}

export interface DewormingReportData {
  period: string;
  municipalities: DewormingReportMunicipalityRow[];
  province_totals: {
    target: number;
    male_accomplished: number;
    female_accomplished: number;
    total_accomplished: number;
    accomplishment_rate: number;
  };
}

export async function getDewormingDashboard(
  filters: DashboardFilters
): Promise<DewormingDashboardData> {
  const geoJoins = buildModuleGeoJoins('d');
  const { whereSQL, params } = buildWhereFragment(filters, 'd.date_dewormed');

  const extraAndDewormed = whereSQL ? `${whereSQL} AND d.is_dewormed = TRUE` : 'WHERE d.is_dewormed = TRUE';

  // 1. Total & in-school breakdown
  const summaryPromise = pool.query<{
    total_dewormed: number;
    in_school: number;
    out_of_school: number;
  }>(
    `
    SELECT
      COUNT(DISTINCT CASE WHEN d.is_dewormed = TRUE THEN d.student_id END)::int AS total_dewormed,
      COUNT(DISTINCT CASE WHEN d.is_dewormed = TRUE AND d.in_school = TRUE THEN d.student_id END)::int AS in_school,
      COUNT(DISTINCT CASE WHEN d.is_dewormed = TRUE AND d.in_school = FALSE THEN d.student_id END)::int AS out_of_school
    FROM "deworming" d
    ${geoJoins}
    ${whereSQL}
    `,
    params
  );

  // 2. Age group distribution
  const ageGroupPromise = pool.query<{ age_group: string; count: number }>(
    `
    SELECT
      COALESCE(d.age_group, 'Unknown') AS age_group,
      COUNT(DISTINCT d.student_id)::int AS count
    FROM "deworming" d
    ${geoJoins}
    ${extraAndDewormed}
    GROUP BY d.age_group
    ORDER BY d.age_group ASC
    `,
    params
  );

  // 3. Public vs Private
  const schoolTypePromise = pool.query<{ school_type: string; count: number }>(
    `
    SELECT
      COALESCE(d.school_type::text, 'unknown') AS school_type,
      COUNT(DISTINCT d.student_id)::int AS count
    FROM "deworming" d
    ${geoJoins}
    ${extraAndDewormed}
    GROUP BY d.school_type
    ORDER BY count DESC
    `,
    params
  );

  // 4. Monthly Trend from d.date_dewormed
  const trendPromise = pool.query<{ month: string; count: number }>(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', d.date_dewormed), 'YYYY-MM') AS month,
      COUNT(DISTINCT d.student_id)::int AS count
    FROM "deworming" d
    ${geoJoins}
    ${extraAndDewormed}
    GROUP BY DATE_TRUNC('month', d.date_dewormed)
    ORDER BY month ASC
    `,
    params
  );

  const munParamIndex = params.length + 1;
  const munParams = [...params, filters.municipality_id ?? null];

  // 5. Municipality Breakdown & Option 1 Target
  const munPromise = pool.query<{
    municipality_id: number;
    municipality_name: string;
    target: number;
    male_accomplished: number;
    female_accomplished: number;
    total_accomplished: number;
  }>(
    `
    WITH targets AS (
      SELECT
        m.id AS municipality_id,
        COUNT(DISTINCT s.id)::int AS target
      FROM "municipalities" m
      LEFT JOIN "barangays" b ON b.municipality_id = m.id
      LEFT JOIN "schools" sc ON sc.barangay_id = b.id
      LEFT JOIN "students" s ON s.school_id = sc.id
      GROUP BY m.id
    ),
    accomplished AS (
      SELECT
        m.id AS municipality_id,
        COUNT(DISTINCT CASE WHEN s.sex = 'Male' THEN d.student_id END)::int AS male_accomplished,
        COUNT(DISTINCT CASE WHEN s.sex = 'Female' THEN d.student_id END)::int AS female_accomplished,
        COUNT(DISTINCT d.student_id)::int AS total_accomplished
      FROM "deworming" d
      ${geoJoins}
      ${extraAndDewormed}
      GROUP BY m.id
    )
    SELECT
      m.id AS municipality_id,
      m.name AS municipality_name,
      COALESCE(t.target, 0) AS target,
      COALESCE(a.male_accomplished, 0) AS male_accomplished,
      COALESCE(a.female_accomplished, 0) AS female_accomplished,
      COALESCE(a.total_accomplished, 0) AS total_accomplished
    FROM "municipalities" m
    LEFT JOIN targets t ON t.municipality_id = m.id
    LEFT JOIN accomplished a ON a.municipality_id = m.id
    WHERE COALESCE(a.total_accomplished, 0) > 0 OR $${munParamIndex}::int IS NULL OR m.id = $${munParamIndex}::int
    ORDER BY m.name ASC
    `,
    munParams
  );

  const [summaryRes, ageGroupRes, schoolTypeRes, trendRes, munRes] =
    await Promise.all([
      summaryPromise,
      ageGroupPromise,
      schoolTypePromise,
      trendPromise,
      munPromise,
    ]);

  const summary = summaryRes.rows[0] ?? {
    total_dewormed: 0,
    in_school: 0,
    out_of_school: 0,
  };

  const municipalitySummary: DewormingMunicipalitySummary[] = munRes.rows.map(
    (r) => {
      const target = Number(r.target);
      const totalAccomplished = Number(r.total_accomplished);
      const rate =
        target > 0 ? Math.round((totalAccomplished / target) * 1000) / 10 : 0;
      return {
        municipality_id: Number(r.municipality_id),
        municipality_name: r.municipality_name,
        target,
        male_accomplished: Number(r.male_accomplished),
        female_accomplished: Number(r.female_accomplished),
        total_accomplished: totalAccomplished,
        accomplishment_rate: rate,
      };
    }
  );

  const provinceTarget = municipalitySummary.reduce((acc, m) => acc + m.target, 0);
  const provinceAccomplished = Number(summary.total_dewormed);
  const provinceRate =
    provinceTarget > 0
      ? Math.round((provinceAccomplished / provinceTarget) * 1000) / 10
      : 0;

  return {
    total_dewormed: provinceAccomplished,
    deworming_by_age_group: ageGroupRes.rows.map((r) => ({
      age_group: r.age_group,
      count: Number(r.count),
    })),
    public_vs_private: schoolTypeRes.rows.map((r) => ({
      school_type: r.school_type,
      count: Number(r.count),
    })),
    in_school_vs_out_of_school: {
      in_school: Number(summary.in_school),
      out_of_school: Number(summary.out_of_school),
    },
    monthly_trend: trendRes.rows.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
    municipality_summary: municipalitySummary,
    province_total: {
      target: provinceTarget,
      total_accomplished: provinceAccomplished,
      accomplishment_rate: provinceRate,
    },
  };
}

export async function getDewormingReport(
  period: string
): Promise<DewormingReportData> {
  const result = await pool.query<{
    municipality_id: number;
    municipality_name: string;
    target: number;
    male_accomplished: number;
    female_accomplished: number;
    total_accomplished: number;
  }>(
    `
    WITH targets AS (
      SELECT
        m.id AS municipality_id,
        COUNT(DISTINCT s.id)::int AS target
      FROM "municipalities" m
      LEFT JOIN "barangays" b ON b.municipality_id = m.id
      LEFT JOIN "schools" sc ON sc.barangay_id = b.id
      LEFT JOIN "students" s ON s.school_id = sc.id
      GROUP BY m.id
    ),
    accomplished AS (
      SELECT
        m.id AS municipality_id,
        COUNT(DISTINCT CASE WHEN s.sex = 'Male' THEN d.student_id END)::int AS male_accomplished,
        COUNT(DISTINCT CASE WHEN s.sex = 'Female' THEN d.student_id END)::int AS female_accomplished,
        COUNT(DISTINCT d.student_id)::int AS total_accomplished
      FROM "deworming" d
      JOIN "students" s ON d.student_id = s.id
      JOIN "schools" sc ON s.school_id = sc.id
      JOIN "barangays" b ON sc.barangay_id = b.id
      JOIN "municipalities" m ON b.municipality_id = m.id
      WHERE d.is_dewormed = TRUE AND TO_CHAR(d.date_dewormed, 'YYYY-MM') = $1
      GROUP BY m.id
    )
    SELECT
      m.id AS municipality_id,
      m.name AS municipality_name,
      COALESCE(t.target, 0) AS target,
      COALESCE(a.male_accomplished, 0) AS male_accomplished,
      COALESCE(a.female_accomplished, 0) AS female_accomplished,
      COALESCE(a.total_accomplished, 0) AS total_accomplished
    FROM "municipalities" m
    LEFT JOIN targets t ON t.municipality_id = m.id
    LEFT JOIN accomplished a ON a.municipality_id = m.id
    ORDER BY m.name ASC
    `,
    [period]
  );

  let totalTarget = 0;
  let totalMale = 0;
  let totalFemale = 0;
  let totalAccomplished = 0;

  const municipalities: DewormingReportMunicipalityRow[] = result.rows.map(
    (r) => {
      const target = Number(r.target);
      const male = Number(r.male_accomplished);
      const female = Number(r.female_accomplished);
      const total = Number(r.total_accomplished);
      const rate = target > 0 ? Math.round((total / target) * 1000) / 10 : 0;

      totalTarget += target;
      totalMale += male;
      totalFemale += female;
      totalAccomplished += total;

      return {
        municipality_id: Number(r.municipality_id),
        municipality_name: r.municipality_name,
        target,
        male_accomplished: male,
        female_accomplished: female,
        total_accomplished: total,
        accomplishment_rate: rate,
      };
    }
  );

  const provinceRate =
    totalTarget > 0
      ? Math.round((totalAccomplished / totalTarget) * 1000) / 10
      : 0;

  return {
    period,
    municipalities,
    province_totals: {
      target: totalTarget,
      male_accomplished: totalMale,
      female_accomplished: totalFemale,
      total_accomplished: totalAccomplished,
      accomplishment_rate: provinceRate,
    },
  };
}

// ─── Vital Signs Dashboard Aggregations (with Clinical-Threshold Safeguard) ──────

export interface VitalSignsDashboardData {
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

export async function getVitalSignsDashboard(
  filters: DashboardFilters
): Promise<VitalSignsDashboardData> {
  const geoJoins = buildModuleGeoJoins('vs');
  const { whereSQL, params } = buildWhereFragment(filters, 'vs.date_checked');

  // 1. Overall screening and measurement completeness counts
  const summaryPromise = pool.query<{
    total_screened: number;
    total_screenings: number;
    bp_recorded: number;
    bmi_recorded: number;
    temperature_recorded: number;
    pulse_recorded: number;
    respiratory_recorded: number;
    elevated_temperature_count: number;
  }>(
    `
    SELECT
      COUNT(DISTINCT vs.student_id)::int AS total_screened,
      COUNT(*)::int AS total_screenings,
      COUNT(DISTINCT CASE WHEN vs.blood_pressure_systolic IS NOT NULL AND vs.blood_pressure_diastolic IS NOT NULL THEN vs.student_id END)::int AS bp_recorded,
      COUNT(DISTINCT CASE WHEN vs.bmi IS NOT NULL THEN vs.student_id END)::int AS bmi_recorded,
      COUNT(DISTINCT CASE WHEN vs.temperature IS NOT NULL THEN vs.student_id END)::int AS temperature_recorded,
      COUNT(DISTINCT CASE WHEN vs.heart_rate IS NOT NULL THEN vs.student_id END)::int AS pulse_recorded,
      COUNT(DISTINCT CASE WHEN vs.respiratory_rate IS NOT NULL THEN vs.student_id END)::int AS respiratory_recorded,
      COUNT(DISTINCT CASE WHEN vs.temperature > 37.5 THEN vs.student_id END)::int AS elevated_temperature_count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL}
    `,
    params
  );

  // 2. Raw BMI numerical interval breakdown (safeguarded against generic adult labels)
  const bmiPromise = pool.query<{ interval: string; count: number }>(
    `
    SELECT
      CASE
        WHEN vs.bmi < 18.5 THEN '< 18.5'
        WHEN vs.bmi >= 18.5 AND vs.bmi <= 24.99 THEN '18.5 - 24.9'
        WHEN vs.bmi >= 25.0 AND vs.bmi <= 29.99 THEN '25.0 - 29.9'
        WHEN vs.bmi >= 30.0 THEN '>= 30.0'
        ELSE 'Unrecorded'
      END AS interval,
      COUNT(DISTINCT vs.student_id)::int AS count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL ? `${whereSQL} AND vs.bmi IS NOT NULL` : 'WHERE vs.bmi IS NOT NULL'}
    GROUP BY
      CASE
        WHEN vs.bmi < 18.5 THEN '< 18.5'
        WHEN vs.bmi >= 18.5 AND vs.bmi <= 24.99 THEN '18.5 - 24.9'
        WHEN vs.bmi >= 25.0 AND vs.bmi <= 29.99 THEN '25.0 - 29.9'
        WHEN vs.bmi >= 30.0 THEN '>= 30.0'
        ELSE 'Unrecorded'
      END
    ORDER BY MIN(vs.bmi) ASC
    `,
    params
  );

  // 3. Raw Systolic Blood Pressure intervals (mmHg)
  const systolicPromise = pool.query<{ interval: string; count: number }>(
    `
    SELECT
      CASE
        WHEN vs.blood_pressure_systolic < 90 THEN '< 90 mmHg'
        WHEN vs.blood_pressure_systolic >= 90 AND vs.blood_pressure_systolic <= 119 THEN '90 - 119 mmHg'
        WHEN vs.blood_pressure_systolic >= 120 AND vs.blood_pressure_systolic <= 139 THEN '120 - 139 mmHg'
        WHEN vs.blood_pressure_systolic >= 140 THEN '>= 140 mmHg'
        ELSE 'Unrecorded'
      END AS interval,
      COUNT(DISTINCT vs.student_id)::int AS count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL ? `${whereSQL} AND vs.blood_pressure_systolic IS NOT NULL` : 'WHERE vs.blood_pressure_systolic IS NOT NULL'}
    GROUP BY
      CASE
        WHEN vs.blood_pressure_systolic < 90 THEN '< 90 mmHg'
        WHEN vs.blood_pressure_systolic >= 90 AND vs.blood_pressure_systolic <= 119 THEN '90 - 119 mmHg'
        WHEN vs.blood_pressure_systolic >= 120 AND vs.blood_pressure_systolic <= 139 THEN '120 - 139 mmHg'
        WHEN vs.blood_pressure_systolic >= 140 THEN '>= 140 mmHg'
        ELSE 'Unrecorded'
      END
    ORDER BY MIN(vs.blood_pressure_systolic) ASC
    `,
    params
  );

  // 4. Raw Diastolic Blood Pressure intervals (mmHg)
  const diastolicPromise = pool.query<{ interval: string; count: number }>(
    `
    SELECT
      CASE
        WHEN vs.blood_pressure_diastolic < 60 THEN '< 60 mmHg'
        WHEN vs.blood_pressure_diastolic >= 60 AND vs.blood_pressure_diastolic <= 79 THEN '60 - 79 mmHg'
        WHEN vs.blood_pressure_diastolic >= 80 AND vs.blood_pressure_diastolic <= 89 THEN '80 - 89 mmHg'
        WHEN vs.blood_pressure_diastolic >= 90 THEN '>= 90 mmHg'
        ELSE 'Unrecorded'
      END AS interval,
      COUNT(DISTINCT vs.student_id)::int AS count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL ? `${whereSQL} AND vs.blood_pressure_diastolic IS NOT NULL` : 'WHERE vs.blood_pressure_diastolic IS NOT NULL'}
    GROUP BY
      CASE
        WHEN vs.blood_pressure_diastolic < 60 THEN '< 60 mmHg'
        WHEN vs.blood_pressure_diastolic >= 60 AND vs.blood_pressure_diastolic <= 79 THEN '60 - 79 mmHg'
        WHEN vs.blood_pressure_diastolic >= 80 AND vs.blood_pressure_diastolic <= 89 THEN '80 - 89 mmHg'
        WHEN vs.blood_pressure_diastolic >= 90 THEN '>= 90 mmHg'
        ELSE 'Unrecorded'
      END
    ORDER BY MIN(vs.blood_pressure_diastolic) ASC
    `,
    params
  );

  // 5. Raw Temperature intervals (°C)
  const tempPromise = pool.query<{ interval: string; count: number }>(
    `
    SELECT
      CASE
        WHEN vs.temperature < 36.5 THEN '< 36.5 °C'
        WHEN vs.temperature >= 36.5 AND vs.temperature <= 37.5 THEN '36.5 - 37.5 °C'
        WHEN vs.temperature > 37.5 THEN '> 37.5 °C'
        ELSE 'Unrecorded'
      END AS interval,
      COUNT(DISTINCT vs.student_id)::int AS count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL ? `${whereSQL} AND vs.temperature IS NOT NULL` : 'WHERE vs.temperature IS NOT NULL'}
    GROUP BY
      CASE
        WHEN vs.temperature < 36.5 THEN '< 36.5 °C'
        WHEN vs.temperature >= 36.5 AND vs.temperature <= 37.5 THEN '36.5 - 37.5 °C'
        WHEN vs.temperature > 37.5 THEN '> 37.5 °C'
        ELSE 'Unrecorded'
      END
    ORDER BY MIN(vs.temperature) ASC
    `,
    params
  );

  // 6. Screening coverage by school (distinct students screened)
  const schoolPromise = pool.query<{
    school_id: number;
    school_name: string;
    count: number;
  }>(
    `
    SELECT
      sc.id AS school_id,
      sc.name AS school_name,
      COUNT(DISTINCT vs.student_id)::int AS count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL}
    GROUP BY sc.id, sc.name
    ORDER BY count DESC, sc.name ASC
    LIMIT 20
    `,
    params
  );

  // 7. Monthly screening trend based on vs.date_checked
  const trendPromise = pool.query<{ month: string; count: number }>(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', vs.date_checked), 'YYYY-MM') AS month,
      COUNT(DISTINCT vs.student_id)::int AS count
    FROM "vital_signs" vs
    ${geoJoins}
    ${whereSQL}
    GROUP BY DATE_TRUNC('month', vs.date_checked)
    ORDER BY month ASC
    `,
    params
  );

  const [
    summaryRes,
    bmiRes,
    systolicRes,
    diastolicRes,
    tempRes,
    schoolRes,
    trendRes,
  ] = await Promise.all([
    summaryPromise,
    bmiPromise,
    systolicPromise,
    diastolicPromise,
    tempPromise,
    schoolPromise,
    trendPromise,
  ]);

  const summary = summaryRes.rows[0] ?? {
    total_screened: 0,
    total_screenings: 0,
    bp_recorded: 0,
    bmi_recorded: 0,
    temperature_recorded: 0,
    pulse_recorded: 0,
    respiratory_recorded: 0,
    elevated_temperature_count: 0,
  };

  return {
    total_screened: Number(summary.total_screened),
    total_screenings: Number(summary.total_screenings),
    measurement_coverage: {
      bp_recorded: Number(summary.bp_recorded),
      bmi_recorded: Number(summary.bmi_recorded),
      temperature_recorded: Number(summary.temperature_recorded),
      pulse_recorded: Number(summary.pulse_recorded),
      respiratory_recorded: Number(summary.respiratory_recorded),
    },
    bmi_distribution: bmiRes.rows.map((r) => ({
      interval: r.interval,
      count: Number(r.count),
    })),
    blood_pressure_systolic_distribution: systolicRes.rows.map((r) => ({
      interval: r.interval,
      count: Number(r.count),
    })),
    blood_pressure_diastolic_distribution: diastolicRes.rows.map((r) => ({
      interval: r.interval,
      count: Number(r.count),
    })),
    temperature_distribution: tempRes.rows.map((r) => ({
      interval: r.interval,
      count: Number(r.count),
    })),
    elevated_temperature_count: Number(summary.elevated_temperature_count),
    coverage_by_school: schoolRes.rows.map((r) => ({
      school_id: Number(r.school_id),
      school_name: r.school_name,
      count: Number(r.count),
    })),
    monthly_trend: trendRes.rows.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
    metadata: {
      clinical_thresholds_status: 'PENDING_OFFICIAL_POLICY',
      threshold_version: 'NONE - Awaiting PHO / DepEd Pediatric Guidelines',
      notice:
        'Clinical thresholds for pediatric blood pressure percentiles, BMI-for-age z-scores, and temperature abnormalities are awaiting formal PHO/DepEd policy approval. Metrics display raw measurement distributions and screening coverage only.',
    },
  };
}

// ─── Immunization Dashboard Aggregations ────────────────────────────

export const OFFICIAL_REFUSAL_REASONS_MAP: Record<string, string> = {
  '1': 'Parent absent/away from home',
  '2': 'Fear of vaccine side effect',
  '3': 'Vaccine safety issues (past adverse experience)',
  '4': 'Child already has complete routine vaccination',
  '5': 'Fear of COVID transmission',
  '6': 'Vaccine perceived ineffective/low-quality/near-expiry',
  '7': 'Client is a newborn and parents believed too young',
  '8': 'Already vaccinated by private MD',
  '9': 'Peculiar personal beliefs/misconceptions',
  '10': 'Lack of trust in the vaccinator',
  '11': 'Child just recovered from illness/discharged from hospital',
  '12': 'Unaware of the campaign',
  '13': 'Vaccine team did not visit',
  '14': 'Child from a different area',
  '15': 'Child was acutely sick or not feeling well',
  '16': 'Do not know/declined to respond',
  '17': 'Outright refusal',
  '18': 'Other (specify)',
};

export interface VaccineAntigenMetric {
  antigen: 'td1' | 'mr1' | 'hpv1' | 'hpv2' | 'td2' | 'mr2';
  label: string;
  doses: number;
  students: number;
}

export interface ImmunizationDashboardData {
  total_students_vaccinated: number; // distinct students who received >= 1 vaccine
  total_evaluated_students: number;  // distinct students with an immunization visit record
  total_doses_administered: number;  // sum of all 6 vaccine flags across records
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

export async function getImmunizationDashboard(
  filters: DashboardFilters
): Promise<ImmunizationDashboardData> {
  const geoJoins = buildModuleGeoJoins('imm');
  const { whereSQL, params } = buildWhereFragment(filters, 'imm.immunization_date');

  // 1. Overall vaccine counts and consent/refusal breakdown
  const summaryPromise = pool.query<{
    total_students_vaccinated: number;
    total_evaluated_students: number;
    total_doses_administered: number;
    td1_doses: number;
    td1_students: number;
    mr1_doses: number;
    mr1_students: number;
    hpv1_doses: number;
    hpv1_students: number;
    hpv2_doses: number;
    hpv2_students: number;
    td2_doses: number;
    td2_students: number;
    mr2_doses: number;
    mr2_students: number;
    consented_students: number;
    refused_students: number;
    deferred_students: number;
  }>(
    `
    SELECT
      COUNT(DISTINCT CASE WHEN (imm.vaccine_td1 = TRUE OR imm.vaccine_mr1 = TRUE OR imm.vaccine_hpv1 = TRUE OR imm.vaccine_hpv2 = TRUE OR imm.vaccine_td2 = TRUE OR imm.vaccine_mr2 = TRUE) THEN imm.student_id END)::int AS total_students_vaccinated,
      COUNT(DISTINCT imm.student_id)::int AS total_evaluated_students,
      (
        COUNT(CASE WHEN imm.vaccine_td1 = TRUE THEN 1 END) +
        COUNT(CASE WHEN imm.vaccine_mr1 = TRUE THEN 1 END) +
        COUNT(CASE WHEN imm.vaccine_hpv1 = TRUE THEN 1 END) +
        COUNT(CASE WHEN imm.vaccine_hpv2 = TRUE THEN 1 END) +
        COUNT(CASE WHEN imm.vaccine_td2 = TRUE THEN 1 END) +
        COUNT(CASE WHEN imm.vaccine_mr2 = TRUE THEN 1 END)
      )::int AS total_doses_administered,
      COUNT(CASE WHEN imm.vaccine_td1 = TRUE THEN 1 END)::int AS td1_doses,
      COUNT(DISTINCT CASE WHEN imm.vaccine_td1 = TRUE THEN imm.student_id END)::int AS td1_students,
      COUNT(CASE WHEN imm.vaccine_mr1 = TRUE THEN 1 END)::int AS mr1_doses,
      COUNT(DISTINCT CASE WHEN imm.vaccine_mr1 = TRUE THEN imm.student_id END)::int AS mr1_students,
      COUNT(CASE WHEN imm.vaccine_hpv1 = TRUE THEN 1 END)::int AS hpv1_doses,
      COUNT(DISTINCT CASE WHEN imm.vaccine_hpv1 = TRUE THEN imm.student_id END)::int AS hpv1_students,
      COUNT(CASE WHEN imm.vaccine_hpv2 = TRUE THEN 1 END)::int AS hpv2_doses,
      COUNT(DISTINCT CASE WHEN imm.vaccine_hpv2 = TRUE THEN imm.student_id END)::int AS hpv2_students,
      COUNT(CASE WHEN imm.vaccine_td2 = TRUE THEN 1 END)::int AS td2_doses,
      COUNT(DISTINCT CASE WHEN imm.vaccine_td2 = TRUE THEN imm.student_id END)::int AS td2_students,
      COUNT(CASE WHEN imm.vaccine_mr2 = TRUE THEN 1 END)::int AS mr2_doses,
      COUNT(DISTINCT CASE WHEN imm.vaccine_mr2 = TRUE THEN imm.student_id END)::int AS mr2_students,
      COUNT(DISTINCT CASE WHEN imm.consent_given = TRUE AND imm.is_refused = FALSE THEN imm.student_id END)::int AS consented_students,
      COUNT(DISTINCT CASE WHEN imm.is_refused = TRUE THEN imm.student_id END)::int AS refused_students,
      COUNT(DISTINCT CASE WHEN imm.is_deferred = TRUE THEN imm.student_id END)::int AS deferred_students
    FROM "immunization" imm
    ${geoJoins}
    ${whereSQL}
    `,
    params
  );

  // 2. Refusal reason breakdown (approved codes 1-18)
  const refusalWhere = whereSQL
    ? `${whereSQL} AND imm.is_refused = TRUE AND imm.refusal_reason_code IS NOT NULL AND TRIM(imm.refusal_reason_code) != ''`
    : `WHERE imm.is_refused = TRUE AND imm.refusal_reason_code IS NOT NULL AND TRIM(imm.refusal_reason_code) != ''`;

  const refusalPromise = pool.query<{
    code: string;
    count: number;
  }>(
    `
    SELECT
      TRIM(imm.refusal_reason_code) AS code,
      COUNT(DISTINCT imm.student_id)::int AS count
    FROM "immunization" imm
    ${geoJoins}
    ${refusalWhere}
    GROUP BY TRIM(imm.refusal_reason_code)
    ORDER BY count DESC, code ASC
    `,
    params
  );

  // 3. Vaccination by educational level
  const eduLevelPromise = pool.query<{
    educational_level: string;
    vaccinated_students: number;
    total_evaluated: number;
  }>(
    `
    SELECT
      COALESCE(NULLIF(TRIM(imm.educational_level), ''), 'Unspecified') AS educational_level,
      COUNT(DISTINCT CASE WHEN (imm.vaccine_td1 = TRUE OR imm.vaccine_mr1 = TRUE OR imm.vaccine_hpv1 = TRUE OR imm.vaccine_hpv2 = TRUE OR imm.vaccine_td2 = TRUE OR imm.vaccine_mr2 = TRUE) THEN imm.student_id END)::int AS vaccinated_students,
      COUNT(DISTINCT imm.student_id)::int AS total_evaluated
    FROM "immunization" imm
    ${geoJoins}
    ${whereSQL}
    GROUP BY COALESCE(NULLIF(TRIM(imm.educational_level), ''), 'Unspecified')
    ORDER BY vaccinated_students DESC, educational_level ASC
    `,
    params
  );

  // 4. Screening coverage by school (distinct vaccinated students)
  const schoolPromise = pool.query<{
    school_id: number;
    school_name: string;
    count: number;
  }>(
    `
    SELECT
      sc.id AS school_id,
      sc.name AS school_name,
      COUNT(DISTINCT CASE WHEN (imm.vaccine_td1 = TRUE OR imm.vaccine_mr1 = TRUE OR imm.vaccine_hpv1 = TRUE OR imm.vaccine_hpv2 = TRUE OR imm.vaccine_td2 = TRUE OR imm.vaccine_mr2 = TRUE) THEN imm.student_id END)::int AS count
    FROM "immunization" imm
    ${geoJoins}
    ${whereSQL}
    GROUP BY sc.id, sc.name
    ORDER BY count DESC, sc.name ASC
    LIMIT 20
    `,
    params
  );

  // 5. Monthly trend based on imm.immunization_date
  const trendPromise = pool.query<{ month: string; count: number }>(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', imm.immunization_date), 'YYYY-MM') AS month,
      COUNT(DISTINCT CASE WHEN (imm.vaccine_td1 = TRUE OR imm.vaccine_mr1 = TRUE OR imm.vaccine_hpv1 = TRUE OR imm.vaccine_hpv2 = TRUE OR imm.vaccine_td2 = TRUE OR imm.vaccine_mr2 = TRUE) THEN imm.student_id END)::int AS count
    FROM "immunization" imm
    ${geoJoins}
    ${whereSQL}
    GROUP BY DATE_TRUNC('month', imm.immunization_date)
    ORDER BY month ASC
    `,
    params
  );

  const [summaryRes, refusalRes, eduRes, schoolRes, trendRes] =
    await Promise.all([
      summaryPromise,
      refusalPromise,
      eduLevelPromise,
      schoolPromise,
      trendPromise,
    ]);

  const summary = summaryRes.rows[0] ?? {
    total_students_vaccinated: 0,
    total_evaluated_students: 0,
    total_doses_administered: 0,
    td1_doses: 0,
    td1_students: 0,
    mr1_doses: 0,
    mr1_students: 0,
    hpv1_doses: 0,
    hpv1_students: 0,
    hpv2_doses: 0,
    hpv2_students: 0,
    td2_doses: 0,
    td2_students: 0,
    mr2_doses: 0,
    mr2_students: 0,
    consented_students: 0,
    refused_students: 0,
    deferred_students: 0,
  };

  const totalEvaluated = Number(summary.total_evaluated_students);
  const refused = Number(summary.refused_students);
  const deferred = Number(summary.deferred_students);

  const refusalRate =
    totalEvaluated > 0 ? Math.round((refused / totalEvaluated) * 1000) / 10 : 0;
  const deferralRate =
    totalEvaluated > 0 ? Math.round((deferred / totalEvaluated) * 1000) / 10 : 0;

  const vaccineAntigens: VaccineAntigenMetric[] = [
    {
      antigen: 'td1',
      label: 'Td1 (Tetanus-diphtheria Dose 1)',
      doses: Number(summary.td1_doses),
      students: Number(summary.td1_students),
    },
    {
      antigen: 'mr1',
      label: 'MR1 (Measles-rubella Dose 1)',
      doses: Number(summary.mr1_doses),
      students: Number(summary.mr1_students),
    },
    {
      antigen: 'hpv1',
      label: 'HPV1 (Human Papillomavirus Dose 1)',
      doses: Number(summary.hpv1_doses),
      students: Number(summary.hpv1_students),
    },
    {
      antigen: 'hpv2',
      label: 'HPV2 (Human Papillomavirus Dose 2)',
      doses: Number(summary.hpv2_doses),
      students: Number(summary.hpv2_students),
    },
    {
      antigen: 'td2',
      label: 'Td2 (Tetanus-diphtheria Dose 2)',
      doses: Number(summary.td2_doses),
      students: Number(summary.td2_students),
    },
    {
      antigen: 'mr2',
      label: 'MR2 (Measles-rubella Dose 2)',
      doses: Number(summary.mr2_doses),
      students: Number(summary.mr2_students),
    },
  ];

  return {
    total_students_vaccinated: Number(summary.total_students_vaccinated),
    total_evaluated_students: totalEvaluated,
    total_doses_administered: Number(summary.total_doses_administered),
    vaccine_antigens: vaccineAntigens,
    consent_distribution: {
      consented_students: Number(summary.consented_students),
      refused_students: refused,
      deferred_students: deferred,
      refusal_rate: refusalRate,
      deferral_rate: deferralRate,
    },
    refusal_reasons: refusalRes.rows.map((r) => ({
      code: r.code,
      label: OFFICIAL_REFUSAL_REASONS_MAP[r.code] || `Code ${r.code}`,
      count: Number(r.count),
    })),
    vaccination_by_educational_level: eduRes.rows.map((r) => ({
      educational_level: r.educational_level,
      vaccinated_students: Number(r.vaccinated_students),
      total_evaluated: Number(r.total_evaluated),
    })),
    coverage_by_school: schoolRes.rows.map((r) => ({
      school_id: Number(r.school_id),
      school_name: r.school_name,
      count: Number(r.count),
    })),
    monthly_trend: trendRes.rows.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
    contract_definitions: {
      vaccinated:
        'Distinct students who received at least one vaccine dose (any of Td1, MR1, HPV1, HPV2, Td2, MR2) in the filtered scope.',
      coverage:
        'Unique student count. Students are never double-counted in coverage totals even if receiving multiple vaccines or multiple visit records.',
      vaccine_flags:
        'Dose counts and distinct student counts are reported for each antigen. Antigens are non-mutually exclusive (a single visit may administer multiple antigens simultaneously).',
    },
  };
}
