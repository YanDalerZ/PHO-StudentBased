import type { ModuleSlug } from '../types/auth.types.js';
import { buildReportQueryParts, REPORT_EXPORT_MAX_ROWS, ReportContractError, type NormalizedReportFilters, type ReportSchoolScope } from './report.service.js';
import { REPORT_TARGET_INDICATORS } from './report-target.service.js';

export type ReportView = 'municipality' | 'masterlist';
export interface ReportColumn { key: string; label: string }
export interface ReportDocument {
    module: ModuleSlug;
    view: ReportView;
    title: string;
    filters: NormalizedReportFilters;
    scope: { mode: ReportSchoolScope['mode']; school_ids: number[] | null };
    columns: ReportColumn[];
    rows: Array<Record<string, string | number | boolean | null>>;
    total_students: number | null;
    empty: boolean;
    note: string | null;
}
export interface ReportDocumentExecutor {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

const moduleNames: Record<ModuleSlug, string> = {
    'patient-info': 'Patient Information', 'oral-health': 'Oral Health',
    deworming: 'Deworming', immunization: 'Immunization', 'vital-signs': 'Vital Signs',
};
const commonColumns: ReportColumn[] = [
    { key: 'row_no', label: 'No.' }, { key: 'lrn', label: 'LRN' },
    { key: 'student_name', label: 'Student name' }, { key: 'date_of_birth', label: 'Date of birth' },
    { key: 'age', label: 'Age at period end' }, { key: 'sex', label: 'Sex' },
    { key: 'grade_level', label: 'Grade' }, { key: 'section', label: 'Section' },
    { key: 'school', label: 'School' }, { key: 'municipality', label: 'Municipality' },
    { key: 'barangay', label: 'Barangay' },
];
const commonSelect = (datePosition: number) => `
    s.student_lrn AS lrn,
    CONCAT_WS(' ', s.last_name || ',', s.first_name, NULLIF(s.middle_name, ''), NULLIF(s.suffix, 'NOT APPLICABLE')) AS student_name,
    TO_CHAR(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
    EXTRACT(YEAR FROM AGE($${datePosition}::date, s.date_of_birth))::int AS age,
    s.sex::text AS sex, s.grade_level, s.section,
    sc.name AS school, m.name AS municipality, b.name AS barangay`;

const detailDefinitions: Record<ModuleSlug, { alias: string; date: string; columns: ReportColumn[]; select: string }> = {
    'patient-info': {
        alias: 'pi', date: 'pi.created_at',
        columns: [
            { key: 'event_date', label: 'Registration date' }, { key: 'four_ps', label: '4Ps' },
            { key: 'pwd', label: 'PWD' }, { key: 'philhealth', label: 'PhilHealth' },
            { key: 'indigenous', label: 'Indigenous' },
        ],
        select: `TO_CHAR(pi.created_at, 'YYYY-MM-DD') AS event_date,
            s.is_4ps_member AS four_ps, s.is_pwd AS pwd,
            s.is_philhealth_member AS philhealth, s.is_indigenous AS indigenous`,
    },
    'oral-health': {
        alias: 'oh', date: 'oh.date_examined',
        columns: [
            { key: 'event_date', label: 'Examined' }, { key: 'permanent_dmft', label: 'DMFT' },
            { key: 'primary_dmft', label: 'dmft' }, { key: 'oral_screening', label: 'Screening' },
            { key: 'risk_assessment', label: 'Risk assessment' }, { key: 'oral_prophylaxis', label: 'Prophylaxis' },
            { key: 'counseling', label: 'Counseling' }, { key: 'fluoride_varnish', label: 'Fluoride varnish' },
            { key: 'rpoc_complete', label: 'RPOC complete' }, { key: 'service_location', label: 'Service location' },
            { key: 'visit_type', label: 'Visit type' }, { key: 'treatment_category', label: 'Treatment category' },
        ],
        select: `TO_CHAR(oh.date_examined, 'YYYY-MM-DD') AS event_date,
            oh.total_dmft AS permanent_dmft, oh.total_dmft_primary AS primary_dmft,
            oh.has_oral_screening AS oral_screening, oh.has_risk_assessment AS risk_assessment,
            oh.has_oral_prophylaxis AS oral_prophylaxis, oh.has_counseling AS counseling,
            oh.has_fluoride_varnish AS fluoride_varnish, oh.is_rpoc_complete AS rpoc_complete,
            oh.service_location::text AS service_location, oh.visit_type::text AS visit_type,
            oh.treatment_type AS treatment_category`,
    },
    deworming: {
        alias: 'd', date: 'd.date_dewormed',
        columns: [
            { key: 'event_date', label: 'Record date' }, { key: 'age_group', label: 'Age group' },
            { key: 'medication', label: 'Medication given' }, { key: 'accomplished', label: 'Dewormed' },
            { key: 'school_type', label: 'School type' }, { key: 'in_school', label: 'In school' },
        ],
        select: `TO_CHAR(d.date_dewormed, 'YYYY-MM-DD') AS event_date,
            CASE WHEN d.age_group IN ('<1', '1-4', '5-9', '10-14')
                THEN d.age_group || ' (historical)' ELSE d.age_group END AS age_group,
            d.medication_given AS medication, d.is_dewormed AS accomplished,
            d.school_type::text AS school_type, d.in_school`,
    },
    immunization: {
        alias: 'imm', date: 'imm.immunization_date',
        columns: [
            { key: 'event_date', label: 'Visit date' },
            { key: 'td1', label: 'Td1' }, { key: 'td1_lot', label: 'Td1 lot' },
            { key: 'mr1', label: 'MR1' }, { key: 'mr1_lot', label: 'MR1 lot' },
            { key: 'hpv1', label: 'HPV1' }, { key: 'hpv1_lot', label: 'HPV1 lot' },
            { key: 'hpv2', label: 'HPV2' }, { key: 'hpv2_lot', label: 'HPV2 lot' },
            { key: 'td2', label: 'Td2' }, { key: 'td2_lot', label: 'Td2 lot' },
            { key: 'mr2', label: 'MR2' }, { key: 'mr2_lot', label: 'MR2 lot' },
            { key: 'legacy_shared_lot', label: 'Historical shared lot' },
            { key: 'consent', label: 'Consent' }, { key: 'deferred', label: 'Deferred' },
            { key: 'refused', label: 'Refused' }, { key: 'refusal_code', label: 'Refusal code' },
        ],
        select: `TO_CHAR(imm.immunization_date, 'YYYY-MM-DD') AS event_date,
            imm.vaccine_td1 AS td1, imm.lot_batch_td1 AS td1_lot,
            imm.vaccine_mr1 AS mr1, imm.lot_batch_mr1 AS mr1_lot,
            imm.vaccine_hpv1 AS hpv1, imm.lot_batch_hpv1 AS hpv1_lot,
            imm.vaccine_hpv2 AS hpv2, imm.lot_batch_hpv2 AS hpv2_lot,
            imm.vaccine_td2 AS td2, imm.lot_batch_td2 AS td2_lot,
            imm.vaccine_mr2 AS mr2, imm.lot_batch_mr2 AS mr2_lot,
            imm.lot_batch_no AS legacy_shared_lot,
            imm.consent_given AS consent, imm.is_deferred AS deferred,
            imm.is_refused AS refused, imm.refusal_reason_code AS refusal_code`,
    },
    'vital-signs': {
        alias: 'vs', date: 'vs.date_checked',
        columns: [
            { key: 'event_date', label: 'Screened' }, { key: 'systolic_bp', label: 'BP systolic' },
            { key: 'diastolic_bp', label: 'BP diastolic' }, { key: 'heart_rate', label: 'Heart rate' },
            { key: 'respiratory_rate', label: 'Respiratory rate' }, { key: 'temperature', label: 'Temperature °C' },
            { key: 'weight_kg', label: 'Weight kg' }, { key: 'height_cm', label: 'Height cm' },
            { key: 'bmi', label: 'BMI' },
        ],
        select: `TO_CHAR(vs.date_checked, 'YYYY-MM-DD') AS event_date,
            vs.blood_pressure_systolic AS systolic_bp, vs.blood_pressure_diastolic AS diastolic_bp,
            vs.heart_rate, vs.respiratory_rate, vs.temperature, vs.weight_kg, vs.height_cm, vs.bmi`,
    },
};

const summaryDefinitions: Record<ModuleSlug, { accomplishedWhen: string; extras: Array<{ key: string; label: string; sql: string }> }> = {
    'patient-info': {
        accomplishedWhen: 'TRUE',
        extras: [
            { key: 'four_ps', label: '4Ps', sql: 'COUNT(DISTINCT s.id) FILTER (WHERE s.is_4ps_member = TRUE)' },
            { key: 'pwd', label: 'PWD', sql: 'COUNT(DISTINCT s.id) FILTER (WHERE s.is_pwd = TRUE)' },
            { key: 'philhealth', label: 'PhilHealth', sql: 'COUNT(DISTINCT s.id) FILTER (WHERE s.is_philhealth_member = TRUE)' },
            { key: 'indigenous', label: 'Indigenous', sql: 'COUNT(DISTINCT s.id) FILTER (WHERE s.is_indigenous = TRUE)' },
        ],
    },
    'oral-health': {
        accomplishedWhen: 'TRUE',
        extras: [
            { key: 'examinations', label: 'Examinations', sql: 'COUNT(*)' },
            { key: 'rpoc_complete', label: 'RPOC complete', sql: 'COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.is_rpoc_complete = TRUE)' },
            { key: 'oral_screening', label: 'Oral screening', sql: 'COUNT(DISTINCT oh.student_id) FILTER (WHERE oh.has_oral_screening = TRUE)' },
            { key: 'dmft_known', label: 'DMFT known', sql: 'COUNT(oh.total_dmft)' },
            { key: 'dmft_tooth_total', label: 'DMFT tooth total', sql: 'COALESCE(SUM(oh.total_dmft), 0)' },
        ],
    },
    deworming: {
        accomplishedWhen: 'd.is_dewormed = TRUE',
        extras: [
            { key: 'age_5_14', label: 'Age 5–14', sql: "COUNT(DISTINCT d.student_id) FILTER (WHERE d.is_dewormed = TRUE AND d.age_group IN ('5-14', '5-9', '10-14'))" },
            { key: 'age_15_19', label: 'Age 15–19', sql: "COUNT(DISTINCT d.student_id) FILTER (WHERE d.is_dewormed = TRUE AND d.age_group = '15-19')" },
            { key: 'age_20_plus', label: 'Age 20+', sql: "COUNT(DISTINCT d.student_id) FILTER (WHERE d.is_dewormed = TRUE AND d.age_group = '20+')" },
            { key: 'historical_under_5', label: 'Historical under 5', sql: "COUNT(DISTINCT d.student_id) FILTER (WHERE d.is_dewormed = TRUE AND d.age_group IN ('<1', '1-4'))" },
            { key: 'historical_unknown', label: 'Historical/Unknown age group', sql: "COUNT(DISTINCT d.student_id) FILTER (WHERE d.is_dewormed = TRUE AND (d.age_group IS NULL OR d.age_group NOT IN ('5-14', '5-9', '10-14', '15-19', '20+', '<1', '1-4')))" },
        ],
    },
    immunization: {
        accomplishedWhen: '(imm.vaccine_td1 OR imm.vaccine_mr1 OR imm.vaccine_hpv1 OR imm.vaccine_hpv2 OR imm.vaccine_td2 OR imm.vaccine_mr2)',
        extras: [
            ...(['td1', 'mr1', 'hpv1', 'hpv2', 'td2', 'mr2'] as const).map(dose => ({
                key: dose, label: `${dose.toUpperCase()} students`,
                sql: `COUNT(DISTINCT imm.student_id) FILTER (WHERE imm.vaccine_${dose} = TRUE)`,
            })),
            { key: 'doses', label: 'Doses', sql: '(COUNT(*) FILTER (WHERE imm.vaccine_td1) + COUNT(*) FILTER (WHERE imm.vaccine_mr1) + COUNT(*) FILTER (WHERE imm.vaccine_hpv1) + COUNT(*) FILTER (WHERE imm.vaccine_hpv2) + COUNT(*) FILTER (WHERE imm.vaccine_td2) + COUNT(*) FILTER (WHERE imm.vaccine_mr2))' },
            { key: 'refused_records', label: 'Refused records', sql: 'COUNT(*) FILTER (WHERE imm.is_refused = TRUE)' },
            { key: 'deferred_records', label: 'Deferred records', sql: 'COUNT(*) FILTER (WHERE imm.is_deferred = TRUE)' },
        ],
    },
    'vital-signs': {
        accomplishedWhen: 'TRUE',
        extras: [
            { key: 'screenings', label: 'Screening records', sql: 'COUNT(*)' },
            { key: 'bp_complete', label: 'BP complete', sql: 'COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.blood_pressure_systolic IS NOT NULL AND vs.blood_pressure_diastolic IS NOT NULL)' },
            { key: 'bmi_complete', label: 'BMI complete', sql: 'COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.bmi IS NOT NULL)' },
            { key: 'referrals', label: 'Referrals', sql: 'COUNT(DISTINCT vs.student_id) FILTER (WHERE vs.referral_needed = TRUE)' },
        ],
    },
};

function scopeMeta(scope: ReportSchoolScope): ReportDocument['scope'] {
    return scope.mode === 'province' ? { mode: 'province', school_ids: null }
        : { mode: 'restricted', school_ids: [...scope.schoolIds] };
}

function rawNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function visibleSchools(executor: ReportDocumentExecutor, filters: NormalizedReportFilters, scope: ReportSchoolScope) {
    const result = await executor.query<{ school_id: number; municipality_id: number; municipality: string }>(`
        SELECT sc.id AS school_id, m.id AS municipality_id, m.name AS municipality
        FROM SCHOOLS sc JOIN BARANGAYS b ON b.id = sc.barangay_id
        JOIN MUNICIPALITIES m ON m.id = b.municipality_id
        WHERE ($1::int IS NULL OR m.id = $1)
          AND ($2::int IS NULL OR b.id = $2)
          AND ($3::int IS NULL OR sc.id = $3)
          AND ($4::int[] IS NULL OR sc.id = ANY($4::int[]))
        ORDER BY m.name, sc.id
    `, [filters.municipality_id ?? null, filters.barangay_id ?? null,
        filters.school_id ?? null, scope.mode === 'restricted' ? scope.schoolIds : null]);
    return result.rows;
}

async function visibleMunicipalities(executor: ReportDocumentExecutor,
    filters: NormalizedReportFilters, scope: ReportSchoolScope,
    schools: Array<{ municipality_id: number; municipality: string }>) {
    if (scope.mode === 'restricted' || filters.barangay_id !== undefined || filters.school_id !== undefined) {
        return [...new Map(schools.map(row => [row.municipality_id, row.municipality])).entries()];
    }
    const result = await executor.query<{ id: number; name: string }>(`
        SELECT id, name FROM MUNICIPALITIES
        WHERE ($1::int IS NULL OR id = $1)
        ORDER BY name, id
    `, [filters.municipality_id ?? null]);
    return result.rows.map(row => [row.id, row.name] as [number, string]);
}

async function municipalityDocument(executor: ReportDocumentExecutor, module: ModuleSlug,
    filters: NormalizedReportFilters, scope: ReportSchoolScope): Promise<ReportDocument> {
    const schools = await visibleSchools(executor, filters, scope);
    const definition = summaryDefinitions[module];
    const parts = buildReportQueryParts(module, filters, scope);
    const accomplishedWhen = definition.accomplishedWhen;
    const extraDefinitions = [...definition.extras];
    const summaryParams = [...parts.params];
    if (module === 'patient-info') {
        summaryParams.push(filters.date_to);
        const age = `EXTRACT(YEAR FROM AGE($${summaryParams.length}::date, s.date_of_birth))`;
        for (const [key, label, from, to] of [
            ['age_0_4', 'Age 0–4', 0, 4], ['age_5_9', 'Age 5–9', 5, 9],
            ['age_10_14', 'Age 10–14', 10, 14], ['age_15_19', 'Age 15–19', 15, 19],
        ] as const) {
            extraDefinitions.push({ key, label,
                sql: `COUNT(DISTINCT s.id) FILTER (WHERE ${age} BETWEEN ${from} AND ${to})` });
        }
        extraDefinitions.push({ key: 'age_20_plus', label: 'Age 20+',
            sql: `COUNT(DISTINCT s.id) FILTER (WHERE ${age} >= 20)` });
    }
    const result = await executor.query<Record<string, unknown>>(`
        SELECT m.id AS municipality_id, m.name AS municipality,
               COUNT(DISTINCT s.id) FILTER (WHERE ${accomplishedWhen})::int AS accomplished,
               COUNT(DISTINCT s.id) FILTER (WHERE ${accomplishedWhen} AND s.sex = 'Male')::int AS male,
               COUNT(DISTINCT s.id) FILTER (WHERE ${accomplishedWhen} AND s.sex = 'Female')::int AS female,
               COUNT(DISTINCT s.id) FILTER (WHERE ${accomplishedWhen} AND (s.sex NOT IN ('Male', 'Female') OR s.sex IS NULL))::int AS other_sex,
               ${extraDefinitions.map(extra => `(${extra.sql})::int AS ${extra.key}`).join(',\n               ')}
        ${parts.fromSql} ${parts.whereSql}
        GROUP BY m.id, m.name
    `, summaryParams);
    const grouped = new Map<number, Record<string, unknown>>(result.rows.map(row => [Number(row.municipality_id), row]));
    const targetResult = await executor.query<{ school_id: number; indicator: string; target_count: number }>(`
        SELECT DISTINCT ON (school_id, indicator) school_id, indicator, target_count
        FROM REPORT_TARGET_REVISIONS
        WHERE module_slug = $1 AND date_from = $2::date AND date_to = $3::date
          AND school_id = ANY($4::int[])
        ORDER BY school_id, indicator, id DESC
    `, [module, filters.date_from, filters.date_to, schools.map(row => row.school_id)]);
    const targets = new Map(targetResult.rows.map(row => [`${row.school_id}:${row.indicator}`, rawNumber(row.target_count)]));
    const municipalities = await visibleMunicipalities(executor, filters, scope, schools);
    const keys = ['accomplished', 'male', 'female', 'other_sex', ...extraDefinitions.map(extra => extra.key)];
    const rawRows = municipalities.map(([id, name]) => {
        const schoolRows = schools.filter(school => school.municipality_id === id);
        const data = grouped.get(id);
        const row: Record<string, string | number | null> = { municipality: name };
        for (const key of keys) row[key] = rawNumber(data?.[key]);
        if (module === 'immunization') {
            for (const indicator of REPORT_TARGET_INDICATORS.immunization) {
                const values = schoolRows.map(school => targets.get(`${school.school_id}:${indicator}`));
                row[indicator] = schoolRows.length > 0 && values.every(value => value !== undefined)
                    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
            }
        }
        const targetKey = REPORT_TARGET_INDICATORS[module][0]!;
        const targetValues = schoolRows.map(school => targets.get(`${school.school_id}:${targetKey}`));
        const complete = module !== 'immunization' && schoolRows.length > 0
            && targetValues.every(value => value !== undefined);
        row.target = complete ? targetValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
        row.percentage = complete && Number(row.target) > 0
            ? Math.round((Number(row.accomplished) / Number(row.target)) * 1000) / 10 : null;
        row.target_status = schoolRows.length === 0 ? 'No schools'
            : module === 'immunization' ? 'No percentage defined' : complete ? 'Complete' : 'Incomplete';
        return row;
    });
    const province: Record<string, string | number | null> = { municipality: 'PROVINCE TOTAL' };
    for (const key of keys) province[key] = rawRows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
    if (module === 'immunization') {
        for (const indicator of REPORT_TARGET_INDICATORS.immunization) {
            province[indicator] = rawRows.length > 0 && rawRows.every(row => row[indicator] !== null)
                ? rawRows.reduce((sum, row) => sum + Number(row[indicator] ?? 0), 0) : null;
        }
    }
    const targetsComplete = module !== 'immunization' && schools.length > 0
        && rawRows.every(row => row.target_status === 'Complete' || row.target_status === 'No schools');
    province.target = targetsComplete ? rawRows.reduce((sum, row) => sum + Number(row.target ?? 0), 0) : null;
    province.percentage = targetsComplete && Number(province.target) > 0
        ? Math.round((Number(province.accomplished) / Number(province.target)) * 1000) / 10 : null;
    province.target_status = module === 'immunization' ? 'No percentage defined' : targetsComplete ? 'Complete' : 'Incomplete';

    // Suppress a whole municipality row when any positive count is below five.
    // Suppress province numbers too if a hidden municipality could be recovered
    // by subtraction. Apply once here so all four report outputs agree.
    const numericKeys = ['target', 'percentage', ...keys,
        ...(module === 'immunization' ? REPORT_TARGET_INDICATORS.immunization : [])];
    const suppressed = rawRows.map(row => numericKeys.some(key => {
        const value = row[key];
        return typeof value === 'number' && value > 0 && value < 5;
    }));
    const rows: Array<Record<string, string | number | null>> = rawRows.map((row, index) => {
        if (!suppressed[index]) return row;
        return { ...row, ...Object.fromEntries(numericKeys.map(key => [key, 'Suppressed'])) };
    });
    rows.push(suppressed.some(Boolean)
        ? { ...province, ...Object.fromEntries(numericKeys.map(key => [key, 'Suppressed'])) }
        : province);
    const columns: ReportColumn[] = [
        { key: 'municipality', label: 'Municipality' }, { key: 'target', label: 'Target' },
        ...(module === 'immunization' ? [
            { key: 'mr_td_grade1', label: 'MR/Td Grade 1 target' },
            { key: 'mr_td_grade7', label: 'MR/Td Grade 7 target' },
            { key: 'hpv_grade4_female', label: 'HPV Grade 4 female target' },
        ] : []),
        { key: 'male', label: 'Male' }, { key: 'female', label: 'Female' },
        { key: 'other_sex', label: 'Other/unknown sex' },
        { key: 'accomplished', label: 'Total accomplished' }, { key: 'percentage', label: '% accomplished' },
        ...extraDefinitions.map(({ key, label }) => ({ key, label })),
        { key: 'target_status', label: 'Target status' },
    ];
    return { module, view: 'municipality', title: `${moduleNames[module]} municipality accomplishment summary`,
        filters, scope: scopeMeta(scope), columns, rows,
        total_students: suppressed.some(Boolean) ? null : Number(province.accomplished),
        empty: Number(province.accomplished) === 0,
        note: module === 'immunization' ? 'Dose-to-cohort coverage percentages are undefined and remain blank.'
            : 'A percentage is blank until every school in the selected scope has a target for the exact period.' };
}

async function masterlistDocument(executor: ReportDocumentExecutor, module: ModuleSlug,
    filters: NormalizedReportFilters, scope: ReportSchoolScope): Promise<ReportDocument> {
    const definition = detailDefinitions[module];
    const parts = buildReportQueryParts(module, filters, scope);
    const datePosition = parts.params.length + 1;
    const limitPosition = parts.params.length + 2;
    const columns = [...commonColumns, ...definition.columns];
    const dataKeys = columns.filter(column => column.key !== 'row_no').map(column => column.key);
    const result = await executor.query<Record<string, unknown>>(`
        SELECT ${dataKeys.join(', ')} FROM (
            SELECT ${commonSelect(datePosition)}, ${definition.select},
                   ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY ${definition.date} DESC, ${definition.alias}.id DESC) AS report_rank
            ${parts.fromSql} ${parts.whereSql}
        ) latest
        WHERE report_rank = 1
        ORDER BY municipality, school, grade_level, section, student_name
        LIMIT $${limitPosition}
    `, [...parts.params, filters.date_to, REPORT_EXPORT_MAX_ROWS + 1]);
    if (result.rows.length > REPORT_EXPORT_MAX_ROWS) {
        throw new ReportContractError(
            'EXPORT_LIMIT_EXCEEDED',
            422,
            `Masterlist exceeds the ${REPORT_EXPORT_MAX_ROWS} row limit.`,
        );
    }
    const rows = result.rows.map((row, index) => {
        const resultRow: Record<string, string | number | boolean | null> = { row_no: index + 1 };
        for (const key of dataKeys) {
            const value = row[key];
            resultRow[key] = value === undefined || value === null ? null
                : typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
        }
        return resultRow;
    });
    return { module, view: 'masterlist', title: `${moduleNames[module]} school and section student masterlist`,
        filters, scope: scopeMeta(scope), columns, rows,
        total_students: rows.length, empty: rows.length === 0,
        note: 'One row per student shows the latest module record within the selected period. Blank values were not recorded.' };
}

export async function getReportDocument(executor: ReportDocumentExecutor, module: ModuleSlug,
    view: ReportView, filters: NormalizedReportFilters, scope: ReportSchoolScope): Promise<ReportDocument> {
    return view === 'municipality'
        ? municipalityDocument(executor, module, filters, scope)
        : masterlistDocument(executor, module, filters, scope);
}
