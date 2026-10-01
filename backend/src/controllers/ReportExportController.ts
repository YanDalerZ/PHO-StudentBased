import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';
import {
    generateDirectReportExport,
    ReportExportError,
} from '../services/report-export.service.js';
import {
    normalizeReportFilters,
    ReportContractError,
    resolveReportSchoolScope,
    validateReportGeography,
} from '../services/report.service.js';
import type { ModuleSlug, PortalRole } from '../types/auth.types.js';

const exportRequestSchema = z.object({
    format: z.enum(['csv', 'xlsx']),
    filters: z.record(z.string(), z.unknown()).default({}),
}).strict();

function moduleSlug(value: unknown): ModuleSlug | null {
    return typeof value === 'string' && ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'].includes(value)
        ? value as ModuleSlug
        : null;
}

function sendError(res: Response, error: unknown): void {
    if (error instanceof ReportContractError || error instanceof ReportExportError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
    }
    console.error('Report export request failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: { code: 'REPORT_EXPORT_FAILED', message: 'Report export request failed.' } });
}

async function auditExport(input: {
    actorId: number;
    portalRole: PortalRole;
    action: string;
    moduleSlug: ModuleSlug;
    format: 'csv' | 'xlsx';
    schoolId?: number | undefined;
    ipAddress?: string | undefined;
    details: Record<string, unknown>;
}): Promise<void> {
    await AuditService.logEvent({
        actor_id: input.actorId,
        portal_role: input.portalRole,
        action: input.action,
        entity_type: 'REPORT_EXPORT',
        entity_id: null,
        school_id: input.schoolId ?? null,
        details: {
            module_slug: input.moduleSlug,
            format: input.format,
            delivery: 'direct-download',
            ...input.details,
        },
        ip_address: input.ipAddress,
    });
}

export async function requestReportExport(req: Request, res: Response): Promise<void> {
    let auditContext: {
        actorId: number;
        portalRole: PortalRole;
        moduleSlug: ModuleSlug;
        format: 'csv' | 'xlsx';
        schoolId?: number | undefined;
        ipAddress?: string | undefined;
    } | null = null;

    try {
        const user = req.user;
        const access = req.effectiveAccess;
        if (!user || !access) throw new ReportExportError('UNAUTHENTICATED', 403, 'Authentication required.');
        const slug = moduleSlug(req.params.moduleSlug);
        if (!slug) throw new ReportExportError('REPORT_MODULE_NOT_FOUND', 404, 'Unsupported report module.');
        const parsed = exportRequestSchema.safeParse(req.body);
        if (!parsed.success) throw new ReportExportError('VALIDATION_ERROR', 400, 'Invalid export request.');

        const filters = normalizeReportFilters(parsed.data.filters, { purpose: 'export' });
        const scope = resolveReportSchoolScope(user.portal_role, access.assignedSchoolIds, filters.school_id);
        await validateReportGeography(pool, filters);
        auditContext = {
            actorId: user.id,
            portalRole: user.portal_role,
            moduleSlug: slug,
            format: parsed.data.format,
            schoolId: filters.school_id,
            ipAddress: req.ip,
        };

        await auditExport({
            ...auditContext,
            details: {
                filters,
                scope_mode: scope.mode,
            },
            action: 'REPORT_EXPORT_REQUESTED',
        });

        const file = await generateDirectReportExport({
            moduleSlug: slug,
            format: parsed.data.format,
            filters,
            scope,
        });
        const completedDetails = { row_count: file.rowCount, status: 'completed' };
        await auditExport({ ...auditContext, details: completedDetails, action: 'REPORT_EXPORT_COMPLETED' });
        await auditExport({ ...auditContext, details: completedDetails, action: 'REPORT_EXPORT_DOWNLOADED' });

        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Length', String(file.data.length));
        res.status(200).send(file.data);
    } catch (error: unknown) {
        if (auditContext) {
            const errorCode = error instanceof ReportContractError || error instanceof ReportExportError
                ? error.code
                : 'EXPORT_GENERATION_FAILED';
            await auditExport({
                ...auditContext,
                action: 'REPORT_EXPORT_FAILED',
                details: { status: 'failed', error_code: errorCode },
            });
        }
        sendError(res, error);
    }
}
