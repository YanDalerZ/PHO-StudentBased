import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../database/db.js';
import { AuditService } from './AuditService.js';
import { getEffectiveAccess } from './admin.service.js';
import { createPrivateExportStorage, type ExportFileFormat, type PrivateExportStorage } from './report-export-storage.service.js';
import { createXlsxWorkbook } from './xlsx-writer.service.js';
import {
    buildReportQueryParts,
    REPORT_EXPORT_MAX_ROWS,
    resolveReportSchoolScope,
    type NormalizedReportFilters,
    type ReportSchoolScope,
} from './report.service.js';
import type { ModuleSlug, PortalRole } from '../types/auth.types.js';

export const REPORT_EXPORT_RETENTION_HOURS = 24;
export const REPORT_DOWNLOAD_TOKEN_MINUTES = 15;

export interface StoredExportFilters extends NormalizedReportFilters {
    scope_mode: ReportSchoolScope['mode'];
    authorized_school_ids: number[] | null;
}

export interface ReportExportJob {
    id: number;
    module_slug: ModuleSlug;
    format: ExportFileFormat;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'expired';
    row_count: number | null;
    error_code: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    expires_at: string | null;
    download_token?: string;
    download_token_expires_at?: string;
}

interface ExportDatabaseRow {
    id: number;
    requested_by: number;
    module_id: number;
    module_slug: ModuleSlug;
    module_active?: boolean;
    format: ExportFileFormat;
    filters: unknown;
    status: ReportExportJob['status'];
    row_count: number | null;
    storage_reference: string | null;
    error_code: string | null;
    created_at: Date | string;
    started_at: Date | string | null;
    completed_at: Date | string | null;
    expires_at: Date | string | null;
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

const storedFiltersSchema = z.object({
    municipality_id: z.number().int().positive().optional(),
    barangay_id: z.number().int().positive().optional(),
    school_id: z.number().int().positive().optional(),
    requested_period: z.string().optional(),
    period_source: z.enum(['default', 'named', 'explicit']),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_span_days: z.number().int().positive(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    timezone: z.literal('Asia/Manila'),
    scope_mode: z.enum(['province', 'restricted']),
    authorized_school_ids: z.array(z.number().int().positive()).nullable(),
}).strict();

let storageInstance: PrivateExportStorage | undefined;
const activeJobs = new Set<number>();
let maintenanceTimer: NodeJS.Timeout | undefined;

function storage(): PrivateExportStorage {
    storageInstance ??= createPrivateExportStorage();
    return storageInstance;
}

export function setReportExportStorageForTests(value: PrivateExportStorage | undefined): void {
    storageInstance = value;
}

function asIso(value: Date | string | null): string | null {
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function publicJob(row: ExportDatabaseRow, includeToken = false): ReportExportJob {
    const result: ReportExportJob = {
        id: Number(row.id),
        module_slug: row.module_slug,
        format: row.format,
        status: row.status,
        row_count: row.row_count === null ? null : Number(row.row_count),
        error_code: row.error_code,
        created_at: asIso(row.created_at)!,
        started_at: asIso(row.started_at),
        completed_at: asIso(row.completed_at),
        expires_at: asIso(row.expires_at),
    };
    if (includeToken && row.status === 'completed') {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET is required.');
        result.download_token = jwt.sign(
            { purpose: 'report-export-download', export_id: row.id, requested_by: row.requested_by },
            secret,
            { expiresIn: `${REPORT_DOWNLOAD_TOKEN_MINUTES}m`, audience: 'report-export-download' },
        );
        result.download_token_expires_at = new Date(Date.now() + REPORT_DOWNLOAD_TOKEN_MINUTES * 60_000).toISOString();
    }
    return result;
}

function scopeFromStored(filters: StoredExportFilters): ReportSchoolScope {
    return filters.scope_mode === 'province'
        ? { mode: 'province' }
        : { mode: 'restricted', schoolIds: filters.authorized_school_ids ?? [] };
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

function createXlsx(moduleSlug: ModuleSlug, filters: StoredExportFilters, headers: readonly string[], rows: readonly Record<string, unknown>[]): Buffer {
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

async function loadExportRows(moduleSlug: ModuleSlug, filters: StoredExportFilters): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
    const parts = buildReportQueryParts(moduleSlug, filters, scopeFromStored(filters));
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

async function logExportAudit(action: string, row: Pick<ExportDatabaseRow, 'id' | 'requested_by' | 'module_slug' | 'format'>, details: Record<string, unknown>): Promise<void> {
    const actor = await pool.query<{ portal_role: PortalRole }>('SELECT portal_role FROM USERS WHERE id = $1', [row.requested_by]);
    await AuditService.logEvent({
        actor_id: row.requested_by,
        portal_role: actor.rows[0]?.portal_role ?? null,
        action,
        entity_type: 'REPORT_EXPORT',
        entity_id: String(row.id),
        details: { module_slug: row.module_slug, format: row.format, ...details },
    });
}

export async function createReportExportJob(input: {
    requestedBy: number;
    portalRole: PortalRole;
    moduleSlug: ModuleSlug;
    format: ExportFileFormat;
    filters: NormalizedReportFilters;
    scope: ReportSchoolScope;
    ipAddress?: string | undefined;
}): Promise<ReportExportJob> {
    const storedFilters: StoredExportFilters = {
        ...input.filters,
        scope_mode: input.scope.mode,
        authorized_school_ids: input.scope.mode === 'province' ? null : [...input.scope.schoolIds],
    };
    const result = await pool.query<ExportDatabaseRow>(`
        INSERT INTO REPORT_EXPORTS (requested_by, module_id, format, filters)
        SELECT $1, id, $3, $4::jsonb FROM MODULES WHERE slug = $2 AND is_active = TRUE
        RETURNING *, $2::text AS module_slug
    `, [input.requestedBy, input.moduleSlug, input.format, JSON.stringify(storedFilters)]);
    const row = result.rows[0];
    if (!row) throw new ReportExportError('MODULE_DISABLED', 422, 'The selected module is unavailable.');
    await AuditService.logEvent({
        actor_id: input.requestedBy,
        portal_role: input.portalRole,
        action: 'REPORT_EXPORT_REQUESTED',
        entity_type: 'REPORT_EXPORT',
        entity_id: String(row.id),
        school_id: input.filters.school_id ?? null,
        details: { module_slug: input.moduleSlug, format: input.format, filters: input.filters, scope_mode: input.scope.mode },
        ip_address: input.ipAddress,
    });
    queueReportExport(row.id);
    return publicJob(row);
}

async function currentExportAuthorized(row: ExportDatabaseRow): Promise<StoredExportFilters> {
    if (!row.module_active) throw new ReportExportError('MODULE_DISABLED', 422, 'The selected module is unavailable.');
    const user = await pool.query<{ portal_role: PortalRole; is_active: boolean }>(
        'SELECT portal_role, is_active FROM USERS WHERE id = $1',
        [row.requested_by],
    );
    const account = user.rows[0];
    if (!account?.is_active || account.portal_role === 'admin') throw new ReportExportError('FORBIDDEN', 403, 'Export access is no longer authorized.');
    const access = await getEffectiveAccess(row.requested_by);
    if (!access.modulePermissions[row.module_slug]?.can_export) throw new ReportExportError('FORBIDDEN', 403, 'Export access is no longer authorized.');
    const parsed = storedFiltersSchema.safeParse(row.filters);
    if (!parsed.success) throw new ReportExportError('INVALID_STORED_FILTERS', 409, 'Stored export filters are invalid.');
    const filters = parsed.data as StoredExportFilters;
    if (filters.scope_mode === 'province' && account.portal_role !== 'superuser') {
        throw new ReportExportError('FORBIDDEN', 403, 'Province export scope is no longer authorized.');
    }
    if (filters.scope_mode === 'restricted' && account.portal_role === 'school_staff') {
        const current = new Set(access.assignedSchoolIds);
        if (!(filters.authorized_school_ids ?? []).every(id => current.has(id))) {
            throw new ReportExportError('FORBIDDEN', 403, 'Export school scope is no longer authorized.');
        }
    }
    return filters;
}

async function fetchExport(id: number, requesterId?: number): Promise<ExportDatabaseRow> {
    const result = await pool.query<ExportDatabaseRow>(`
        SELECT re.*, m.slug AS module_slug, m.is_active AS module_active
        FROM REPORT_EXPORTS re
        JOIN MODULES m ON m.id = re.module_id
        WHERE re.id = $1 AND ($2::int IS NULL OR re.requested_by = $2)
    `, [id, requesterId ?? null]);
    const row = result.rows[0];
    if (!row) throw new ReportExportError('REPORT_EXPORT_NOT_FOUND', 404, 'Report export not found.');
    return row;
}

export async function processReportExportJob(id: number): Promise<void> {
    if (activeJobs.has(id)) return;
    activeJobs.add(id);
    let storedReference: string | undefined;
    try {
        const claim = await pool.query<ExportDatabaseRow>(`
            UPDATE REPORT_EXPORTS re
            SET status = 'running', started_at = CURRENT_TIMESTAMP, error_code = NULL
            FROM MODULES m
            WHERE re.id = $1 AND re.status = 'pending' AND m.id = re.module_id
            RETURNING re.*, m.slug AS module_slug, m.is_active AS module_active
        `, [id]);
        const row = claim.rows[0];
        if (!row) return;
        try {
            const filters = await currentExportAuthorized(row);
            const exportData = await loadExportRows(row.module_slug, filters);
            const buffer = row.format === 'csv'
                ? createCsv(exportData.headers, exportData.rows)
                : createXlsx(row.module_slug, filters, exportData.headers, exportData.rows);
            const stored = await storage().write(row.format, buffer);
            storedReference = stored.reference;
            const completed = await pool.query(`
                UPDATE REPORT_EXPORTS
                SET status = 'completed', row_count = $2, storage_reference = $3,
                    completed_at = CURRENT_TIMESTAMP,
                    expires_at = CURRENT_TIMESTAMP + INTERVAL '${REPORT_EXPORT_RETENTION_HOURS} hours'
                WHERE id = $1 AND status = 'running'
            `, [id, exportData.rows.length, stored.reference]);
            if (!completed.rowCount) {
                await storage().remove(stored.reference).catch(() => undefined);
                storedReference = undefined;
                return;
            }
            await logExportAudit('REPORT_EXPORT_COMPLETED', row, { row_count: exportData.rows.length, status: 'completed' });
        } catch (error: unknown) {
            if (storedReference) await storage().remove(storedReference).catch(() => undefined);
            const errorCode = error instanceof ReportExportError ? error.code : 'EXPORT_GENERATION_FAILED';
            await pool.query(`
                UPDATE REPORT_EXPORTS
                SET status = 'failed', error_code = $2, completed_at = CURRENT_TIMESTAMP,
                    row_count = NULL, storage_reference = NULL, expires_at = NULL
                WHERE id = $1
            `, [id, errorCode]);
            await logExportAudit('REPORT_EXPORT_FAILED', row, { status: 'failed', error_code: errorCode });
        }
    } finally {
        activeJobs.delete(id);
    }
}

export function queueReportExport(id: number): void {
    setImmediate(() => void processReportExportJob(id));
}

export async function getReportExportJob(id: number, requesterId: number): Promise<ReportExportJob> {
    await expireReportExports();
    const row = await fetchExport(id, requesterId);
    await currentExportAuthorized(row);
    return publicJob(row, true);
}

function verifyDownloadToken(token: string, row: ExportDatabaseRow): void {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required.');
    try {
        const payload = jwt.verify(token, secret, { audience: 'report-export-download' }) as Record<string, unknown>;
        if (payload.purpose !== 'report-export-download' || Number(payload.export_id) !== row.id || Number(payload.requested_by) !== row.requested_by) {
            throw new Error('mismatch');
        }
    } catch {
        throw new ReportExportError('INVALID_DOWNLOAD_TOKEN', 403, 'Download credential is invalid or expired.');
    }
}

export async function downloadReportExport(id: number, requesterId: number, token: string): Promise<{ job: ReportExportJob; data: Buffer; filename: string; contentType: string }> {
    await expireReportExports();
    const row = await fetchExport(id, requesterId);
    await currentExportAuthorized(row);
    verifyDownloadToken(token, row);
    if (row.status !== 'completed' || !row.storage_reference) throw new ReportExportError('EXPORT_NOT_READY', 409, 'Report export is not available for download.');
    const data = await storage().read(row.storage_reference);
    await logExportAudit('REPORT_EXPORT_DOWNLOADED', row, { status: 'completed', row_count: row.row_count });
    return {
        job: publicJob(row),
        data,
        filename: `${row.module_slug}-report-${row.id}.${row.format}`,
        contentType: row.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
}

export async function deleteReportExport(id: number, requesterId: number): Promise<void> {
    const row = await fetchExport(id, requesterId);
    await currentExportAuthorized(row);
    if (row.status === 'running') throw new ReportExportError('EXPORT_BUSY', 409, 'A running export cannot be deleted.');
    if (row.storage_reference) await storage().remove(row.storage_reference);
    await pool.query(`
        UPDATE REPORT_EXPORTS
        SET status = 'expired', storage_reference = NULL, expires_at = CURRENT_TIMESTAMP
        WHERE id = $1
    `, [id]);
    await logExportAudit('REPORT_EXPORT_DELETED', row, { previous_status: row.status });
}

export async function expireReportExports(now = new Date()): Promise<number> {
    const candidates = await pool.query<ExportDatabaseRow>(`
        SELECT re.*, m.slug AS module_slug, m.is_active AS module_active
        FROM REPORT_EXPORTS re
        JOIN MODULES m ON m.id = re.module_id
        WHERE re.status = 'completed' AND re.expires_at IS NOT NULL AND re.expires_at <= $1
        ORDER BY re.id
        LIMIT 100
    `, [now]);
    let expired = 0;
    for (const row of candidates.rows) {
        try {
            if (row.storage_reference) await storage().remove(row.storage_reference);
            const update = await pool.query(`
                UPDATE REPORT_EXPORTS
                SET status = 'expired', storage_reference = NULL
                WHERE id = $1 AND status = 'completed'
            `, [row.id]);
            if (update.rowCount) {
                expired += 1;
                await logExportAudit('REPORT_EXPORT_EXPIRED', row, { status: 'expired' });
            }
        } catch {
            // Keep completed metadata so the next cleanup pass can retry removal.
        }
    }
    return expired;
}

export async function recoverPendingReportExports(): Promise<void> {
    await pool.query(`
        UPDATE REPORT_EXPORTS
        SET status = 'pending', started_at = NULL, error_code = NULL
        WHERE status = 'running'
          AND storage_reference IS NULL
          AND started_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
    `);
    const pending = await pool.query<{ id: number }>('SELECT id FROM REPORT_EXPORTS WHERE status = \'pending\' ORDER BY id LIMIT 100');
    for (const row of pending.rows) queueReportExport(row.id);
}

export function startReportExportMaintenance(): void {
    if (maintenanceTimer) return;
    storage();
    void recoverPendingReportExports();
    void expireReportExports();
    maintenanceTimer = setInterval(() => void expireReportExports(), 15 * 60_000);
    maintenanceTimer.unref();
}

export function stopReportExportMaintenanceForTests(): void {
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = undefined;
}
