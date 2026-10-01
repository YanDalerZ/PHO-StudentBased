import type { ModuleSlug } from '../types/auth.types.js';
import {
    buildReportQueryParts,
    type NormalizedReportFilters,
    type ReportQueryParts,
    type ReportSchoolScope,
} from './report.service.js';

export const REPORT_SMALL_CELL_THRESHOLD = 5;

export type SuppressionReason = 'primary' | 'complementary';

export interface ProtectedCount {
    value: number | null;
    suppressed: boolean;
    suppression_reason?: SuppressionReason;
}

export interface ProtectedBreakdownRow {
    key: string;
    label: string;
    count: ProtectedCount;
}

export interface ReportPreview {
    module: ModuleSlug;
    filters: NormalizedReportFilters;
    scope: { mode: ReportSchoolScope['mode']; school_ids: number[] | null };
    summary: Record<string, unknown>;
    breakdowns: Record<string, ProtectedBreakdownRow[]>;
    coverage: Record<string, unknown>;
    classifications: Record<string, unknown>;
    empty: boolean;
    empty_message: string | null;
    privacy: {
        small_cell_threshold: number;
        complementary_suppression: true;
    };
}

export interface ReportPreviewExecutor {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
    ) => Promise<{ rows: T[] }>;
}

interface RawBreakdownRow {
    key: string;
    label: string;
    count: number;
}

function numberValue(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function protectCount(count: number): ProtectedCount {
    if (count > 0 && count < REPORT_SMALL_CELL_THRESHOLD) {
        return { value: null, suppressed: true, suppression_reason: 'primary' };
    }
    return { value: count, suppressed: false };
}

export function protectBreakdown(rows: readonly RawBreakdownRow[]): ProtectedBreakdownRow[] {
    const protectedRows = rows.map(row => ({
        key: row.key,
        label: row.label,
        count: protectCount(row.count),
        rawCount: row.count,
    }));
    const primaryIndexes = protectedRows
        .map((row, index) => row.count.suppression_reason === 'primary' ? index : -1)
        .filter(index => index >= 0);

    // With exactly one primary suppression, hide one additional cell so a visible
    // total cannot be used to derive the protected value. Zero is eligible because
    // revealing that it is zero can still make the primary cell calculable.
    if (primaryIndexes.length === 1 && protectedRows.length > 1) {
        const complement = protectedRows
            .map((row, index) => ({ index, rawCount: row.rawCount, suppressed: row.count.suppressed }))
            .filter(row => !row.suppressed)
            .sort((left, right) => left.rawCount - right.rawCount || left.index - right.index)[0];
        if (complement) {
            protectedRows[complement.index]!.count = {
                value: null,
                suppressed: true,
                suppression_reason: 'complementary',
            };
        }
    }

    return protectedRows.map(({ rawCount: _rawCount, ...row }) => row);
}

function scopeMetadata(scope: ReportSchoolScope): ReportPreview['scope'] {
    return scope.mode === 'province'
        ? { mode: 'province', school_ids: null }
        : { mode: 'restricted', school_ids: [...scope.schoolIds] };
}

function basePreview(
    module: ModuleSlug,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
    summary: Record<string, unknown>,
    breakdowns: Record<string, ProtectedBreakdownRow[]>,
    coverage: Record<string, unknown>,
    classifications: Record<string, unknown>,
    empty: boolean,
    emptyMessage: string,
): ReportPreview {
    return {
        module,
        filters,
        scope: scopeMetadata(scope),
        summary,
        breakdowns,
        coverage,
        classifications,
        empty,
        empty_message: empty ? emptyMessage : null,
        privacy: {
            small_cell_threshold: REPORT_SMALL_CELL_THRESHOLD,
            complementary_suppression: true,
        },
    };
}

async function grouped(
    executor: ReportPreviewExecutor,
    parts: ReportQueryParts,
    expression: string,
    options: { extraCondition?: string; labelExpression?: string } = {},
): Promise<ProtectedBreakdownRow[]> {
    const labelExpression = options.labelExpression ?? expression;
    const extraCondition = options.extraCondition ? ` AND (${options.extraCondition})` : '';
    const result = await executor.query<{ key: string; label: string; count: number }>(`
        SELECT (${expression})::text AS key,
               (${labelExpression})::text AS label,
               COUNT(DISTINCT s.id)::int AS count
        ${parts.fromSql}
        ${parts.whereSql}${extraCondition}
        GROUP BY ${expression}, ${labelExpression}
        ORDER BY ${labelExpression}
    `, parts.params);
    return protectBreakdown(result.rows.map(row => ({
        key: String(row.key),
        label: String(row.label),
        count: numberValue(row.count),
    })));
}

async function patientInfoPreview(
    executor: ReportPreviewExecutor,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<ReportPreview> {
    const parts = buildReportQueryParts('patient-info', filters, scope);
    const ageParams = [...parts.params, filters.date_to];
    const agePosition = ageParams.length;
    const ageExpression = `CASE
        WHEN EXTRACT(YEAR FROM AGE($${agePosition}::date, s.date_of_birth)) < 5 THEN '0-4'
        WHEN EXTRACT(YEAR FROM AGE($${agePosition}::date, s.date_of_birth)) < 10 THEN '5-9'
        WHEN EXTRACT(YEAR FROM AGE($${agePosition}::date, s.date_of_birth)) < 15 THEN '10-14'
        WHEN EXTRACT(YEAR FROM AGE($${agePosition}::date, s.date_of_birth)) < 20 THEN '15-19'
        ELSE '20+'
    END`;
    const summaryResult = await executor.query<{
        registrations: number;
        four_ps: number;
        pwd: number;
        philhealth: number;
        indigenous: number;
    }>(`
        SELECT COUNT(DISTINCT pi.student_id)::int AS registrations,
               COUNT(DISTINCT s.id) FILTER (WHERE s.is_4ps_member = TRUE)::int AS four_ps,
               COUNT(DISTINCT s.id) FILTER (WHERE s.is_pwd = TRUE)::int AS pwd,
               COUNT(DISTINCT s.id) FILTER (WHERE s.is_philhealth_member = TRUE)::int AS philhealth,
               COUNT(DISTINCT s.id) FILTER (WHERE s.is_indigenous = TRUE)::int AS indigenous
        ${parts.fromSql}
        ${parts.whereSql}
    `, parts.params);
    const summary = summaryResult.rows[0] ?? {
        registrations: 0, four_ps: 0, pwd: 0, philhealth: 0, indigenous: 0,
    };
    const ageParts = { ...parts, params: ageParams };
    const residenceParts = {
        ...parts,
        fromSql: `${parts.fromSql} LEFT JOIN MUNICIPALITIES rm ON s.municipality_id = rm.id`,
    };
    const [sex, ageBand, fourPs, pwd, pwdType, philhealth, philhealthCategory, indigenous, schoolGeography, residenceGeography] = await Promise.all([
        grouped(executor, parts, 's.sex', { labelExpression: 's.sex' }),
        grouped(executor, ageParts, ageExpression),
        grouped(executor, parts, `CASE WHEN s.is_4ps_member THEN 'yes' ELSE 'no' END`),
        grouped(executor, parts, `CASE WHEN s.is_pwd THEN 'yes' ELSE 'no' END`),
        grouped(executor, parts, `COALESCE(NULLIF(BTRIM(s.pwd_type), ''), 'Unspecified')`, { extraCondition: 's.is_pwd = TRUE' }),
        grouped(executor, parts, `CASE WHEN s.is_philhealth_member THEN 'yes' ELSE 'no' END`),
        grouped(executor, parts, `COALESCE(NULLIF(BTRIM(s.philhealth_category), ''), 'Unspecified')`, { extraCondition: 's.is_philhealth_member = TRUE' }),
        grouped(executor, parts, `CASE WHEN s.is_indigenous THEN 'yes' ELSE 'no' END`),
        grouped(executor, parts, `sc.id`, { labelExpression: 'sc.name' }),
        grouped(executor, residenceParts, `COALESCE(rm.id::text, 'unavailable')`, { labelExpression: `COALESCE(rm.name, 'Unavailable')` }),
    ]);
    const registrations = numberValue(summary.registrations);
    return basePreview('patient-info', filters, scope, {
        official_registration_students: registrations,
        four_ps_students: numberValue(summary.four_ps),
        pwd_students: numberValue(summary.pwd),
        philhealth_students: numberValue(summary.philhealth),
        indigenous_students: numberValue(summary.indigenous),
        age_anchor: filters.date_to,
        counting_unit: 'distinct_students',
    }, {
        sex, age_band: ageBand, four_ps: fourPs, pwd, pwd_type: pwdType,
        philhealth, philhealth_category: philhealthCategory,
        school_geography: schoolGeography, residence_geography: residenceGeography,
    }, { status: 'not_applicable', denominator: null }, {}, registrations === 0,
    'No official Patient Information registrations match the selected filters.');
}

async function oralHealthPreview(
    executor: ReportPreviewExecutor,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<ReportPreview> {
    const parts = buildReportQueryParts('oral-health', filters, scope);
    const summaryResult = await executor.query<Record<string, unknown>>(`
        SELECT COUNT(DISTINCT oh.student_id)::int AS examined_students,
               COUNT(*)::int AS examinations,
               COUNT(oh.total_dmft)::int AS known_permanent_dmft_records,
               COALESCE(SUM(oh.total_dmft) FILTER (WHERE oh.total_dmft IS NOT NULL), 0)::int AS permanent_dmft_teeth,
               COUNT(oh.total_dmft_primary)::int AS known_primary_dmft_records,
               COALESCE(SUM(oh.total_dmft_primary) FILTER (WHERE oh.total_dmft_primary IS NOT NULL), 0)::int AS primary_dmft_teeth
        ${parts.fromSql}
        ${parts.whereSql}
    `, parts.params);
    const row = summaryResult.rows[0] ?? {};
    const [rpoc, serviceLocation, visitType, treatment, school, steps] = await Promise.all([
        grouped(executor, parts, `CASE WHEN oh.is_rpoc_complete THEN 'complete' ELSE 'incomplete' END`),
        grouped(executor, parts, `COALESCE(oh.service_location::text, 'Unspecified')`),
        grouped(executor, parts, `COALESCE(oh.visit_type::text, 'Unspecified')`),
        grouped(executor, parts, `COALESCE(NULLIF(BTRIM(oh.treatment_type), ''), 'Unspecified')`),
        grouped(executor, parts, 'sc.id', { labelExpression: 'sc.name' }),
        (async () => {
            const result = await executor.query<Record<string, unknown>>(`
                SELECT COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.has_oral_screening)::int AS oral_screening,
                       COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.has_risk_assessment)::int AS risk_assessment,
                       COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.has_oral_prophylaxis)::int AS oral_prophylaxis,
                       COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.has_counseling)::int AS counseling,
                       COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.has_fluoride_varnish)::int AS fluoride_varnish
                ${parts.fromSql}
                ${parts.whereSql}
            `, parts.params);
            const counts = result.rows[0] ?? {};
            return protectBreakdown(Object.entries(counts).map(([key, value]) => ({ key, label: key, count: numberValue(value) })));
        })(),
    ]);
    const examinations = numberValue(row.examinations);
    return basePreview('oral-health', filters, scope, {
        examined_students: numberValue(row.examined_students),
        examinations,
        permanent_dmft: { known_records: numberValue(row.known_permanent_dmft_records), tooth_total: numberValue(row.permanent_dmft_teeth) },
        primary_dmft: { known_records: numberValue(row.known_primary_dmft_records), tooth_total: numberValue(row.primary_dmft_teeth) },
        counting_units: { examined_students: 'distinct_students', examinations: 'records', dmft: 'teeth' },
    }, { rpoc_completion: rpoc, rpoc_steps: steps, service_location: serviceLocation, visit_type: visitType, treatment_category: treatment, school: school },
    { status: 'unavailable', denominator: null, reason: 'No approved Oral Health period target snapshot exists in the current schema.' },
    {}, examinations === 0, 'No oral health examinations match the selected filters.');
}

function buildTargetWhere(filters: NormalizedReportFilters, scope: ReportSchoolScope): { whereSql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (position: number) => string, value: unknown): void => {
        params.push(value);
        conditions.push(sql(params.length));
    };
    if (filters.municipality_id !== undefined) add(position => `m.id = $${position}`, filters.municipality_id);
    if (filters.barangay_id !== undefined) add(position => `b.id = $${position}`, filters.barangay_id);
    if (filters.school_id !== undefined) add(position => `sc.id = $${position}`, filters.school_id);
    if (scope.mode === 'restricted') {
        if (scope.schoolIds.length === 0) conditions.push('FALSE');
        else add(position => `sc.id = ANY($${position}::int[])`, scope.schoolIds);
    }
    return { whereSql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

async function dewormingPreview(
    executor: ReportPreviewExecutor,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<ReportPreview> {
    const parts = buildReportQueryParts('deworming', filters, scope);
    const accomplishedWhere = `${parts.whereSql} AND d.is_dewormed = TRUE`;
    const accomplishedParts = { ...parts, whereSql: accomplishedWhere };
    const summaryResult = await executor.query<Record<string, unknown>>(`
        SELECT COUNT(DISTINCT d.student_id)::int AS accomplished_students,
               COUNT(DISTINCT d.student_id) FILTER (WHERE s.sex = 'Male')::int AS male,
               COUNT(DISTINCT d.student_id) FILTER (WHERE s.sex = 'Female')::int AS female
        ${parts.fromSql}
        ${accomplishedWhere}
    `, parts.params);
    const row = summaryResult.rows[0] ?? {};
    const [ageGroup, schoolType, schoolStatus, school] = await Promise.all([
        grouped(executor, accomplishedParts, `COALESCE(NULLIF(BTRIM(d.age_group), ''), 'Unknown')`),
        grouped(executor, accomplishedParts, `COALESCE(d.school_type::text, 'unknown')`),
        grouped(executor, accomplishedParts, `CASE WHEN d.in_school THEN 'in_school' ELSE 'out_of_school' END`),
        grouped(executor, accomplishedParts, 'sc.id', { labelExpression: 'sc.name' }),
    ]);
    const accomplished = numberValue(row.accomplished_students);
    let coverage: Record<string, unknown> = {
        status: 'unavailable', target: null, accomplishment_percentage: null,
        reason: 'Deworming targets require a named YYYY-SY-R1 or YYYY-SY-R2 period.',
    };
    if (filters.requested_period && /^\d{4}-SY-R[12]$/.test(filters.requested_period)) {
        const targetParts = buildTargetWhere(filters, scope);
        const params = [...targetParts.params, filters.requested_period];
        const targetResult = await executor.query<{ target: number; snapshots: number }>(`
            SELECT COALESCE(SUM(COALESCE(dt.override_target_count, dt.baseline_target_count)), 0)::int AS target,
                   COUNT(*)::int AS snapshots
            FROM DEWORMING_TARGETS dt
            JOIN SCHOOLS sc ON dt.school_id = sc.id
            JOIN BARANGAYS b ON sc.barangay_id = b.id
            JOIN MUNICIPALITIES m ON b.municipality_id = m.id
            ${targetParts.whereSql}${targetParts.whereSql ? ' AND' : ' WHERE'} dt.period = $${params.length}
        `, params);
        const target = numberValue(targetResult.rows[0]?.target);
        const snapshots = numberValue(targetResult.rows[0]?.snapshots);
        coverage = snapshots > 0 ? {
            status: 'available', target,
            accomplishment_percentage: target > 0 ? Math.round((accomplished / target) * 1000) / 10 : null,
            target_source: 'auditable_school_period_snapshots', snapshots,
        } : { status: 'unavailable', target: null, accomplishment_percentage: null, reason: 'No approved target snapshots match the selected scope and period.' };
    }
    return basePreview('deworming', filters, scope, {
        accomplished_students: accomplished,
        male_accomplished: numberValue(row.male),
        female_accomplished: numberValue(row.female),
        counting_unit: 'distinct_students',
    }, { age_group: ageGroup, school_type: schoolType, school_status: schoolStatus, school },
    coverage, {}, accomplished === 0, 'No deworming records match the selected filters.');
}

const vaccineExpression = '(imm.vaccine_td1 OR imm.vaccine_mr1 OR imm.vaccine_hpv1 OR imm.vaccine_hpv2 OR imm.vaccine_td2 OR imm.vaccine_mr2)';

async function immunizationPreview(
    executor: ReportPreviewExecutor,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<ReportPreview> {
    const parts = buildReportQueryParts('immunization', filters, scope);
    const summaryResult = await executor.query<Record<string, unknown>>(`
        SELECT COUNT(*)::int AS records,
               COUNT(DISTINCT imm.student_id)::int AS evaluated_students,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE ${vaccineExpression})::int AS vaccinated_students,
               (COUNT(*) FILTER (WHERE imm.vaccine_td1) + COUNT(*) FILTER (WHERE imm.vaccine_mr1)
                + COUNT(*) FILTER (WHERE imm.vaccine_hpv1) + COUNT(*) FILTER (WHERE imm.vaccine_hpv2)
                + COUNT(*) FILTER (WHERE imm.vaccine_td2) + COUNT(*) FILTER (WHERE imm.vaccine_mr2))::int AS administered_doses,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_td1)::int AS td1,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_mr1)::int AS mr1,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_hpv1)::int AS hpv1,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_hpv2)::int AS hpv2,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_td2)::int AS td2,
               COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_mr2)::int AS mr2
        ${parts.fromSql}
        ${parts.whereSql}
    `, parts.params);
    const row = summaryResult.rows[0] ?? {};
    const outcomeExpression = `CASE
        WHEN ${vaccineExpression} THEN 'vaccinated'
        WHEN imm.is_refused THEN 'refused'
        WHEN imm.is_deferred THEN 'deferred'
        WHEN imm.consent_given THEN 'pending_consented'
        ELSE 'no_consent'
    END`;
    const [outcome, refusalReasons, school] = await Promise.all([
        grouped(executor, parts, outcomeExpression),
        grouped(executor, parts, `COALESCE(NULLIF(BTRIM(imm.refusal_reason_code), ''), 'unspecified')`, {
            extraCondition: `NOT ${vaccineExpression} AND imm.is_refused = TRUE`,
        }),
        grouped(executor, parts, 'sc.id', { labelExpression: 'sc.name' }),
    ]);
    const antigens = protectBreakdown(['td1', 'mr1', 'hpv1', 'hpv2', 'td2', 'mr2'].map(key => ({
        key, label: key.toUpperCase(), count: numberValue(row[key]),
    })));
    const records = numberValue(row.records);
    return basePreview('immunization', filters, scope, {
        records,
        evaluated_students: numberValue(row.evaluated_students),
        vaccinated_students: numberValue(row.vaccinated_students),
        administered_doses: numberValue(row.administered_doses),
        counting_units: { records: 'records', vaccinated_students: 'distinct_students', administered_doses: 'doses' },
        outcome_precedence: ['vaccinated', 'refused', 'deferred', 'pending_consented', 'no_consent'],
    }, { vaccine_antigen_students: antigens, record_outcome: outcome, refusal_reason: refusalReasons, school },
    { status: 'unavailable', denominator: null, reason: 'No approved historical immunization cohort target snapshot exists in the current schema.' },
    {}, records === 0, 'No immunization records match the selected filters.');
}

async function vitalSignsPreview(
    executor: ReportPreviewExecutor,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<ReportPreview> {
    const parts = buildReportQueryParts('vital-signs', filters, scope);
    const summaryResult = await executor.query<Record<string, unknown>>(`
        SELECT COUNT(DISTINCT vs.student_id)::int AS screened_students,
               COUNT(*)::int AS screenings,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.blood_pressure_systolic IS NOT NULL AND vs.blood_pressure_diastolic IS NOT NULL)::int AS blood_pressure,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.heart_rate IS NOT NULL)::int AS heart_rate,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.respiratory_rate IS NOT NULL)::int AS respiratory_rate,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.temperature IS NOT NULL)::int AS temperature,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.weight_kg IS NOT NULL)::int AS weight,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.height_cm IS NOT NULL)::int AS height,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.bmi IS NOT NULL)::int AS bmi,
               COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.referral_needed = TRUE)::int AS referrals
        ${parts.fromSql}
        ${parts.whereSql}
    `, parts.params);
    const row = summaryResult.rows[0] ?? {};
    const measurements = protectBreakdown(['blood_pressure', 'heart_rate', 'respiratory_rate', 'temperature', 'weight', 'height', 'bmi'].map(key => ({
        key, label: key, count: numberValue(row[key]),
    })));
    const rawDefinitions = [
        ['bmi', 'vs.bmi', `CASE WHEN vs.bmi < 15 THEN '<15' WHEN vs.bmi < 20 THEN '15-19.99' WHEN vs.bmi < 25 THEN '20-24.99' ELSE '25+' END`],
        ['systolic_bp', 'vs.blood_pressure_systolic', `CASE WHEN vs.blood_pressure_systolic < 90 THEN '<90' WHEN vs.blood_pressure_systolic < 120 THEN '90-119' WHEN vs.blood_pressure_systolic < 140 THEN '120-139' ELSE '140+' END`],
        ['diastolic_bp', 'vs.blood_pressure_diastolic', `CASE WHEN vs.blood_pressure_diastolic < 60 THEN '<60' WHEN vs.blood_pressure_diastolic < 80 THEN '60-79' WHEN vs.blood_pressure_diastolic < 90 THEN '80-89' ELSE '90+' END`],
    ] as const;
    const distributions = await Promise.all(rawDefinitions.map(async ([key, column, expression]) => [
        key,
        await grouped(executor, parts, expression, { extraCondition: `${column} IS NOT NULL` }),
    ] as const));
    const school = await grouped(executor, parts, 'sc.id', { labelExpression: 'sc.name' });
    const screenings = numberValue(row.screenings);
    return basePreview('vital-signs', filters, scope, {
        screened_students: numberValue(row.screened_students),
        screenings,
        referrals: numberValue(row.referrals),
        counting_units: { screened_students: 'distinct_students', screenings: 'records' },
    }, { measurement_completion: measurements, ...Object.fromEntries(distributions), school },
    { status: 'unavailable', denominator: null, reason: 'No approved Vital Signs period target snapshot exists in the current schema.' },
    {
        blood_pressure: { classification_status: 'unavailable', reference: null, output: 'raw_numeric_intervals' },
        bmi_for_age: { classification_status: 'unavailable', reference: null, output: 'raw_numeric_intervals' },
        notice: 'Screening classifications remain unavailable until versioned AAP and WHO reference data and calculations are independently validated.',
    }, screenings === 0, 'No vital sign screenings match the selected filters.');
}

export async function getReportPreview(
    executor: ReportPreviewExecutor,
    moduleSlug: ModuleSlug,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<ReportPreview> {
    switch (moduleSlug) {
        case 'patient-info': return patientInfoPreview(executor, filters, scope);
        case 'oral-health': return oralHealthPreview(executor, filters, scope);
        case 'deworming': return dewormingPreview(executor, filters, scope);
        case 'immunization': return immunizationPreview(executor, filters, scope);
        case 'vital-signs': return vitalSignsPreview(executor, filters, scope);
    }
}
