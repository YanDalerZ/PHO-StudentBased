import pool from '../database/db.js';
import type { ModuleSlug } from '../types/auth.types.js';
import { getReportDocument, type ReportDocument, type ReportView } from './report-document.service.js';
import type { NormalizedReportFilters, ReportSchoolScope } from './report.service.js';
import { createXlsxWorkbook } from './xlsx-writer.service.js';

export type ExportFileFormat = 'csv' | 'xlsx';
export interface DirectReportExport {
    data: Buffer;
    filename: string;
    contentType: string;
    rowCount: number;
}
export class ReportExportError extends Error {
    constructor(public readonly code: string, public readonly status: 400 | 403 | 404 | 409 | 422,
        message: string) {
        super(message);
        this.name = 'ReportExportError';
    }
}

export function sanitizeSpreadsheetString(value: string): string {
    const normalized = value.trimStart();
    return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}
function safeCell(value: string | number | boolean | null): string | number | boolean | null {
    return typeof value === 'string' ? sanitizeSpreadsheetString(value) : value;
}
function csvCell(value: string | number | boolean | null): string {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}
function documentRows(document: ReportDocument): Array<Array<string | number | boolean | null>> {
    return [
        ['Report', document.title],
        ['Reporting period', `${document.filters.date_from} to ${document.filters.date_to}`],
        ['Geographic scope', document.scope.mode === 'province' ? 'Province' : 'Authorized schools'],
        ['Municipality filter', document.filters.municipality_id ?? 'All'],
        ['Barangay filter', document.filters.barangay_id ?? 'All'],
        ['School filter', document.filters.school_id ?? 'All authorized'],
        ['Note', document.note ?? ''],
        [],
        document.columns.map(column => column.label),
        ...document.rows.map(row => document.columns.map(column => safeCell(row[column.key] ?? null))),
    ];
}
export async function generateDirectReportExport(input: {
    moduleSlug: ModuleSlug;
    view: ReportView;
    format: ExportFileFormat;
    filters: NormalizedReportFilters;
    scope: ReportSchoolScope;
}): Promise<DirectReportExport> {
    const moduleResult = await pool.query<{ is_active: boolean }>(
        'SELECT is_active FROM MODULES WHERE slug = $1', [input.moduleSlug]);
    if (!moduleResult.rows[0]?.is_active) {
        throw new ReportExportError('MODULE_DISABLED', 422, 'The selected module is unavailable.');
    }
    const document = await getReportDocument(pool, input.moduleSlug, input.view, input.filters, input.scope);
    const rows = documentRows(document);
    const data = input.format === 'csv'
        ? Buffer.from(`\ufeff${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8')
        : createXlsxWorkbook([{ name: 'Report', rows }]);
    return {
        data,
        filename: `${input.moduleSlug}-${input.view}-${input.filters.date_from}-to-${input.filters.date_to}.${input.format}`,
        contentType: input.format === 'csv' ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        rowCount: document.rows.length,
    };
}
