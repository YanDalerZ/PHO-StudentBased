import { z } from 'zod';
import type { ModuleSlug, PortalRole } from '../types/auth.types.js';

export const REPORT_TIME_ZONE = 'Asia/Manila';
export const REPORT_PAGE_SIZE_DEFAULT = 25;
export const REPORT_PAGE_SIZE_MIN = 10;
export const REPORT_PAGE_SIZE_MAX = 100;
export const REPORT_EXPORT_MAX_ROWS = 50_000;
export const REPORT_EXPORT_MAX_DATE_SPAN_DAYS = 365;

export type ReportPurpose = 'preview' | 'export';
export type ReportPeriodSource = 'default' | 'named' | 'explicit';

export interface NormalizedReportFilters {
    municipality_id?: number;
    barangay_id?: number;
    school_id?: number;
    requested_period?: string;
    period_source: ReportPeriodSource;
    date_from: string;
    date_to: string;
    date_span_days: number;
    page: number;
    pageSize: number;
    offset: number;
    timezone: typeof REPORT_TIME_ZONE;
}

export type ReportSchoolScope =
    | { mode: 'province' }
    | { mode: 'restricted'; schoolIds: number[] };

export interface ReportQueryParts {
    fromSql: string;
    whereSql: string;
    params: unknown[];
}

export class ReportContractError extends Error {
    constructor(
        public readonly code: string,
        public readonly status: 400 | 403 | 404 | 422,
        message: string,
        public readonly fieldErrors?: Record<string, string[]>,
    ) {
        super(message);
        this.name = 'ReportContractError';
    }
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const namedPeriodPattern = /^(?:\d{4}-(?:0[1-9]|1[0-2])|\d{4}-Q[1-4]|\d{4}-SY-R[12])$/;

function isCalendarDate(value: string): boolean {
    if (!isoDatePattern.test(value)) return false;
    const [yearText, monthText, dayText] = value.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

const dateSchema = z.string().refine(isCalendarDate, 'Must be a valid ISO date (YYYY-MM-DD)');
const positiveIntegerParam = z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer').transform(Number),
]);

export const reportFiltersSchema = z.object({
    municipality_id: positiveIntegerParam.optional(),
    barangay_id: positiveIntegerParam.optional(),
    school_id: positiveIntegerParam.optional(),
    date_from: dateSchema.optional(),
    date_to: dateSchema.optional(),
    period: z.string().regex(namedPeriodPattern, 'Unsupported reporting period').optional(),
    page: positiveIntegerParam.default(1),
    pageSize: positiveIntegerParam
        .refine(value => value >= REPORT_PAGE_SIZE_MIN, `Must be at least ${REPORT_PAGE_SIZE_MIN}`)
        .refine(value => value <= REPORT_PAGE_SIZE_MAX, `Must be at most ${REPORT_PAGE_SIZE_MAX}`)
        .default(REPORT_PAGE_SIZE_DEFAULT),
}).strict().superRefine((value, context) => {
    const hasNamedPeriod = value.period !== undefined;
    const hasFrom = value.date_from !== undefined;
    const hasTo = value.date_to !== undefined;

    if (hasNamedPeriod && (hasFrom || hasTo)) {
        context.addIssue({
            code: 'custom',
            path: ['period'],
            message: 'period is mutually exclusive with date_from/date_to',
        });
    }
    if (hasFrom !== hasTo) {
        context.addIssue({
            code: 'custom',
            path: hasFrom ? ['date_to'] : ['date_from'],
            message: 'date_from and date_to must be supplied together',
        });
    }
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
        context.addIssue({
            code: 'custom',
            path: ['date_from'],
            message: 'date_from must be before or equal to date_to',
        });
    }
});

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string {
    return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function currentDateParts(now: Date): { year: number; month: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(now);
    const year = Number(parts.find(part => part.type === 'year')?.value);
    const month = Number(parts.find(part => part.type === 'month')?.value);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
        throw new Error('Unable to resolve the reporting timezone date.');
    }
    return { year, month };
}

export function resolveNamedReportPeriod(period: string): { date_from: string; date_to: string } {
    if (!namedPeriodPattern.test(period)) {
        throw new ReportContractError('VALIDATION_ERROR', 400, 'Unsupported reporting period', {
            period: ['Use YYYY-MM, YYYY-Q1..Q4, or YYYY-SY-R1/R2'],
        });
    }

    const monthMatch = /^(\d{4})-(\d{2})$/.exec(period);
    if (monthMatch) {
        const year = Number(monthMatch[1]);
        const month = Number(monthMatch[2]);
        return {
            date_from: toIsoDate(year, month, 1),
            date_to: toIsoDate(year, month, lastDayOfMonth(year, month)),
        };
    }

    const quarterMatch = /^(\d{4})-Q([1-4])$/.exec(period);
    if (quarterMatch) {
        const year = Number(quarterMatch[1]);
        const quarter = Number(quarterMatch[2]);
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        return {
            date_from: toIsoDate(year, startMonth, 1),
            date_to: toIsoDate(year, endMonth, lastDayOfMonth(year, endMonth)),
        };
    }

    const roundMatch = /^(\d{4})-SY-R([12])$/.exec(period);
    if (!roundMatch) throw new Error('Validated period could not be resolved.');
    const startYear = Number(roundMatch[1]);
    if (roundMatch[2] === '1') {
        return { date_from: `${startYear}-07-01`, date_to: `${startYear}-12-31` };
    }
    return { date_from: `${startYear + 1}-01-01`, date_to: `${startYear + 1}-06-30` };
}

export function inclusiveDateSpan(dateFrom: string, dateTo: string): number {
    const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
    const to = Date.parse(`${dateTo}T00:00:00.000Z`);
    return Math.floor((to - from) / 86_400_000) + 1;
}

export function normalizeReportFilters(
    input: unknown,
    options: { purpose: ReportPurpose; now?: Date },
): NormalizedReportFilters {
    const parsed = reportFiltersSchema.safeParse(input);
    if (!parsed.success) {
        throw new ReportContractError(
            'VALIDATION_ERROR',
            400,
            'Invalid report filters',
            parsed.error.flatten().fieldErrors,
        );
    }

    let periodSource: ReportPeriodSource;
    let dateRange: { date_from: string; date_to: string };
    if (parsed.data.period) {
        periodSource = 'named';
        dateRange = resolveNamedReportPeriod(parsed.data.period);
    } else if (parsed.data.date_from && parsed.data.date_to) {
        periodSource = 'explicit';
        dateRange = { date_from: parsed.data.date_from, date_to: parsed.data.date_to };
    } else {
        periodSource = 'default';
        const { year, month } = currentDateParts(options.now ?? new Date());
        dateRange = {
            date_from: toIsoDate(year, month, 1),
            date_to: toIsoDate(year, month, lastDayOfMonth(year, month)),
        };
    }

    const span = inclusiveDateSpan(dateRange.date_from, dateRange.date_to);
    if (options.purpose === 'export' && span > REPORT_EXPORT_MAX_DATE_SPAN_DAYS) {
        throw new ReportContractError(
            'EXPORT_LIMIT_EXCEEDED',
            422,
            `Export date range cannot exceed ${REPORT_EXPORT_MAX_DATE_SPAN_DAYS} days`,
        );
    }

    return {
        ...(parsed.data.municipality_id === undefined ? {} : { municipality_id: parsed.data.municipality_id }),
        ...(parsed.data.barangay_id === undefined ? {} : { barangay_id: parsed.data.barangay_id }),
        ...(parsed.data.school_id === undefined ? {} : { school_id: parsed.data.school_id }),
        ...(parsed.data.period === undefined ? {} : { requested_period: parsed.data.period }),
        period_source: periodSource,
        ...dateRange,
        date_span_days: span,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        offset: (parsed.data.page - 1) * parsed.data.pageSize,
        timezone: REPORT_TIME_ZONE,
    };
}

export function resolveReportSchoolScope(
    portalRole: PortalRole,
    assignedSchoolIds: readonly number[],
    requestedSchoolId?: number,
): ReportSchoolScope {
    if (portalRole === 'admin') {
        throw new ReportContractError('FORBIDDEN', 403, 'Administrators do not have clinical report access.');
    }

    if (portalRole === 'superuser') {
        return requestedSchoolId === undefined
            ? { mode: 'province' }
            : { mode: 'restricted', schoolIds: [requestedSchoolId] };
    }

    const uniqueAssignedIds = [...new Set(assignedSchoolIds)].filter(
        schoolId => Number.isInteger(schoolId) && schoolId > 0,
    );
    if (requestedSchoolId !== undefined && !uniqueAssignedIds.includes(requestedSchoolId)) {
        throw new ReportContractError('FORBIDDEN', 403, 'Requested school is outside the assigned scope.');
    }
    return {
        mode: 'restricted',
        schoolIds: requestedSchoolId === undefined ? uniqueAssignedIds : [requestedSchoolId],
    };
}

const reportFromSql: Record<ModuleSlug, { fromSql: string; dateColumn: string }> = {
    'patient-info': {
        fromSql: 'FROM PATIENT_INFO pi JOIN STUDENTS s ON pi.student_id = s.id JOIN SCHOOLS sc ON s.school_id = sc.id JOIN BARANGAYS b ON sc.barangay_id = b.id JOIN MUNICIPALITIES m ON b.municipality_id = m.id',
        dateColumn: 'pi.created_at::date',
    },
    'oral-health': {
        fromSql: 'FROM ORAL_HEALTH oh JOIN STUDENTS s ON oh.student_id = s.id JOIN SCHOOLS sc ON s.school_id = sc.id JOIN BARANGAYS b ON sc.barangay_id = b.id JOIN MUNICIPALITIES m ON b.municipality_id = m.id',
        dateColumn: 'oh.date_examined',
    },
    deworming: {
        fromSql: 'FROM DEWORMING d JOIN STUDENTS s ON d.student_id = s.id JOIN SCHOOLS sc ON s.school_id = sc.id JOIN BARANGAYS b ON sc.barangay_id = b.id JOIN MUNICIPALITIES m ON b.municipality_id = m.id',
        dateColumn: 'd.date_dewormed',
    },
    immunization: {
        fromSql: 'FROM IMMUNIZATION imm JOIN STUDENTS s ON imm.student_id = s.id JOIN SCHOOLS sc ON s.school_id = sc.id JOIN BARANGAYS b ON sc.barangay_id = b.id JOIN MUNICIPALITIES m ON b.municipality_id = m.id',
        dateColumn: 'imm.immunization_date',
    },
    'vital-signs': {
        fromSql: 'FROM VITAL_SIGNS vs JOIN STUDENTS s ON vs.student_id = s.id JOIN SCHOOLS sc ON s.school_id = sc.id JOIN BARANGAYS b ON sc.barangay_id = b.id JOIN MUNICIPALITIES m ON b.municipality_id = m.id',
        dateColumn: 'vs.date_checked',
    },
};

export function buildReportQueryParts(
    moduleSlug: ModuleSlug,
    filters: NormalizedReportFilters,
    scope: ReportSchoolScope,
): ReportQueryParts {
    const config = reportFromSql[moduleSlug];
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (condition: (position: number) => string, value: unknown): void => {
        params.push(value);
        conditions.push(condition(params.length));
    };

    if (filters.municipality_id !== undefined) add(position => `m.id = $${position}`, filters.municipality_id);
    if (filters.barangay_id !== undefined) add(position => `b.id = $${position}`, filters.barangay_id);
    if (filters.school_id !== undefined) add(position => `sc.id = $${position}`, filters.school_id);
    add(position => `${config.dateColumn} >= $${position}::date`, filters.date_from);
    add(position => `${config.dateColumn} <= $${position}::date`, filters.date_to);

    if (scope.mode === 'restricted') {
        if (scope.schoolIds.length === 0) {
            conditions.push('FALSE');
        } else {
            add(position => `s.school_id = ANY($${position}::int[])`, scope.schoolIds);
        }
    }

    return {
        fromSql: config.fromSql,
        whereSql: `WHERE ${conditions.join(' AND ')}`,
        params,
    };
}

interface ReportQueryExecutor {
    query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
}

export async function validateReportGeography(
    executor: ReportQueryExecutor,
    filters: Pick<NormalizedReportFilters, 'municipality_id' | 'barangay_id' | 'school_id'>,
): Promise<void> {
    let sql: string | undefined;
    let params: unknown[] = [];
    if (filters.school_id !== undefined) {
        sql = `
            SELECT sc.id
            FROM SCHOOLS sc
            JOIN BARANGAYS b ON sc.barangay_id = b.id
            JOIN MUNICIPALITIES m ON b.municipality_id = m.id
            WHERE sc.id = $1
              AND ($2::int IS NULL OR b.id = $2)
              AND ($3::int IS NULL OR m.id = $3)
        `;
        params = [filters.school_id, filters.barangay_id ?? null, filters.municipality_id ?? null];
    } else if (filters.barangay_id !== undefined) {
        sql = `
            SELECT b.id
            FROM BARANGAYS b
            JOIN MUNICIPALITIES m ON b.municipality_id = m.id
            WHERE b.id = $1 AND ($2::int IS NULL OR m.id = $2)
        `;
        params = [filters.barangay_id, filters.municipality_id ?? null];
    } else if (filters.municipality_id !== undefined) {
        sql = 'SELECT id FROM MUNICIPALITIES WHERE id = $1';
        params = [filters.municipality_id];
    }

    if (!sql) return;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) {
        throw new ReportContractError(
            'VALIDATION_ERROR',
            400,
            'The selected municipality, barangay, and school do not form a valid hierarchy.',
        );
    }
}

