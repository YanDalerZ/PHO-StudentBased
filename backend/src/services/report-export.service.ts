import pool from '../database/db.js';
import type { ModuleSlug } from '../types/auth.types.js';
import {
    buildReportQueryParts,
    REPORT_EXPORT_MAX_ROWS,
    type NormalizedReportFilters,
    type ReportSchoolScope,
} from './report.service.js';
import { createXlsxWorkbook } from './xlsx-writer.service.js';

export type ExportFileFormat = 'csv' | 'xlsx';

export interface DirectReportExport {
    data: Buffer;
    filename: string;
    contentType: string;
    rowCount: number;
}

export class ReportExportError extends Error {
    constructor(
        public readonly code: string,
        public readonly status: 400 | 403 | 404 | 409 | 422,
        message: string,
    ) {
        super(message);
        this.name = 'ReportExportError';
    }
}

export function sanitizeSpreadsheetString(value: string): string {
    const normalized = value.trimStart();
    return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function sanitizeCell(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    return sanitizeSpreadsheetString(String(value));
}

function csvCell(value: string | number | boolean | null): string {
    const text = value === null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
}

function createCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): Buffer {
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) lines.push(headers.map(header => csvCell(sanitizeCell(row[header]))).join(','));
    return Buffer.from(`\ufeff${lines.join('\r\n')}\r\n`, 'utf8');
}

function createXlsx(
    moduleSlug: ModuleSlug,
    filters: NormalizedReportFilters,
    headers: readonly string[],
    rows: readonly Record<string, unknown>[],
): Buffer {
    const summaryRows: Array<Array<string | number | boolean | null>> = [
        ['Module', moduleSlug],
        ['Date from', filters.date_from],
        ['Date to', filters.date_to],
        ['Timezone', filters.timezone],
        ['Row count', rows.length],
    ];
    const detailRows = [
        [...headers],
        ...rows.map(row => headers.map(header => sanitizeCell(row[header]))),
    ];
    return createXlsxWorkbook([
        { name: 'Summary', rows: summaryRows },
        { name: 'Detail', rows: detailRows },
    ]);
}

function exportSelect(moduleSlug: ModuleSlug, dateToPosition: number): { headers: string[]; select: string; orderBy: string } {
    const commonStudent = `s.student_lrn AS lrn,
        CONCAT_WS(' ', s.first_name, NULLIF(s.middle_name, ''), s.last_name, NULLIF(s.suffix, 'NOT APPLICABLE')) AS student_name,
        s.sex::text AS sex,
        TO_CHAR(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
        EXTRACT(YEAR FROM AGE($${dateToPosition}::date, s.date_of_birth))::int AS computed_age,
        sc.name AS school`;
    switch (moduleSlug) {
        case 'patient-info': return {
            headers: ['lrn', 'first_name', 'middle_name', 'last_name', 'suffix', 'sex', 'date_of_birth', 'computed_age', 'grade_level', 'section', 'school', 'school_municipality', 'school_barangay', 'is_4ps_member', 'is_pwd', 'is_philhealth_member', 'is_indigenous', 'registration_date'],
            select: `s.student_lrn AS lrn, s.first_name, s.middle_name, s.last_name, s.suffix,
                s.sex::text AS sex, TO_CHAR(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                EXTRACT(YEAR FROM AGE($${dateToPosition}::date, s.date_of_birth))::int AS computed_age,
                s.grade_level, s.section, sc.name AS school, m.name AS school_municipality,
                b.name AS school_barangay, s.is_4ps_member, s.is_pwd, s.is_philhealth_member,
                s.is_indigenous, TO_CHAR(pi.created_at, 'YYYY-MM-DD') AS registration_date`,
            orderBy: 'pi.created_at, s.id, pi.id',
        };
        case 'oral-health': return {
            headers: ['lrn', 'student_name', 'sex', 'date_of_birth', 'computed_age', 'school', 'examination_date', 'permanent_dmft_total', 'primary_dmft_total', 'oral_screening', 'risk_assessment', 'oral_prophylaxis', 'counseling', 'fluoride_varnish', 'rpoc_complete', 'service_location', 'visit_type', 'treatment_category'],
            select: `${commonStudent}, TO_CHAR(oh.date_examined, 'YYYY-MM-DD') AS examination_date,
                oh.total_dmft AS permanent_dmft_total, oh.total_dmft_primary AS primary_dmft_total,
                oh.has_oral_screening AS oral_screening, oh.has_risk_assessment AS risk_assessment,
                oh.has_oral_prophylaxis AS oral_prophylaxis, oh.has_counseling AS counseling,
                oh.has_fluoride_varnish AS fluoride_varnish, oh.is_rpoc_complete AS rpoc_complete,
                oh.service_location::text AS service_location, oh.visit_type::text AS visit_type,
                oh.treatment_type AS treatment_category`,
            orderBy: 'oh.date_examined, s.id, oh.id',
        };
        case 'deworming': return {
            headers: ['lrn', 'student_name', 'sex', 'date_of_birth', 'computed_age', 'age_group', 'school', 'deworming_date', 'medication', 'accomplished', 'school_type', 'in_school'],
            select: `${commonStudent}, d.age_group, TO_CHAR(d.date_dewormed, 'YYYY-MM-DD') AS deworming_date,
                d.medication_given AS medication, d.is_dewormed AS accomplished,
                d.school_type::text AS school_type, d.in_school`,
            orderBy: 'd.date_dewormed, s.id, d.id',
        };
        case 'immunization': return {
            headers: ['lrn', 'student_name', 'sex', 'date_of_birth', 'computed_age', 'school', 'immunization_date', 'td1', 'mr1', 'hpv1', 'hpv2', 'td2', 'mr2', 'consent_given', 'refused', 'deferred', 'refusal_reason_code'],
            select: `${commonStudent}, TO_CHAR(imm.immunization_date, 'YYYY-MM-DD') AS immunization_date,
                imm.vaccine_td1 AS td1, imm.vaccine_mr1 AS mr1, imm.vaccine_hpv1 AS hpv1,
                imm.vaccine_hpv2 AS hpv2, imm.vaccine_td2 AS td2, imm.vaccine_mr2 AS mr2,
                imm.consent_given, imm.is_refused AS refused, imm.is_deferred AS deferred,
                imm.refusal_reason_code`,
            orderBy: 'imm.immunization_date, s.id, imm.id',
        };
        case 'vital-signs': return {
            headers: ['lrn', 'student_name', 'sex', 'date_of_birth', 'computed_age', 'school', 'screening_date', 'systolic_bp', 'diastolic_bp', 'heart_rate', 'respiratory_rate', 'temperature', 'weight_kg', 'height_cm', 'bmi'],
            select: `${commonStudent}, TO_CHAR(vs.date_checked, 'YYYY-MM-DD') AS screening_date,
                vs.blood_pressure_systolic AS systolic_bp, vs.blood_pressure_diastolic AS diastolic_bp,
                vs.heart_rate, vs.respiratory_rate, vs.temperature, vs.weight_kg, vs.height_cm, vs.bmi`,
            orderBy: 'vs.date_checked, s.id, vs.id',
        };
    }
}

async function loadExportRows(
    moduleSlug: ModuleSlug,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
    const parts = buildReportQueryParts(moduleSlug, filters, scope);
    const params = [...parts.params, filters.date_to, REPORT_EXPORT_MAX_ROWS + 1];
    const dateToPosition = parts.params.length + 1;
    const limitPosition = parts.params.length + 2;
    const definition = exportSelect(moduleSlug, dateToPosition);
    const result = await pool.query<Record<string, unknown>>(`
        SELECT ${definition.select}
        ${parts.fromSql}
        ${parts.whereSql}
        ORDER BY ${definition.orderBy}
        LIMIT $${limitPosition}
    `, params);
    if (result.rows.length > REPORT_EXPORT_MAX_ROWS) {
        throw new ReportExportError('ROW_LIMIT_EXCEEDED', 422, `Export exceeds the ${REPORT_EXPORT_MAX_ROWS} row limit.`);
    }
    return { headers: definition.headers, rows: result.rows };
}

export async function generateDirectReportExport(input: {
    moduleSlug: ModuleSlug;
    format: ExportFileFormat;
    filters: NormalizedReportFilters;
    scope: ReportSchoolScope;
}): Promise<DirectReportExport> {
    const moduleResult = await pool.query<{ is_active: boolean }>(
        'SELECT is_active FROM MODULES WHERE slug = $1',
        [input.moduleSlug],
    );
    if (!moduleResult.rows[0]?.is_active) {
        throw new ReportExportError('MODULE_DISABLED', 422, 'The selected module is unavailable.');
    }

    const exported = await loadExportRows(input.moduleSlug, input.filters, input.scope);
    const data = input.format === 'csv'
        ? createCsv(exported.headers, exported.rows)
        : createXlsx(input.moduleSlug, input.filters, exported.headers, exported.rows);

    return {
        data,
        filename: `${input.moduleSlug}-report-${input.filters.date_from}-to-${input.filters.date_to}.${input.format}`,
        contentType: input.format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        rowCount: exported.rows.length,
    };
}
