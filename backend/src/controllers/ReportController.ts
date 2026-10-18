import type { Request, Response } from 'express';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';
import { getReportDocument, type ReportView } from '../services/report-document.service.js';
import {
    normalizeReportFilters,
    ReportContractError,
    resolveReportSchoolScope,
    validateReportGeography,
} from '../services/report.service.js';
import type { ModuleSlug } from '../types/auth.types.js';

const moduleSlugs = new Set<ModuleSlug>([
    'patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs',
]);

function isModuleSlug(value: string): value is ModuleSlug {
    return moduleSlugs.has(value as ModuleSlug);
}

async function getDocumentPreview(req: Request, res: Response, view: ReportView): Promise<void> {
    try {
        const user = req.user;
        const effectiveAccess = req.effectiveAccess;
        if (!user || !effectiveAccess) {
            res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
            return;
        }

        const rawModuleSlug = req.params.moduleSlug;
        const moduleSlug = typeof rawModuleSlug === 'string' ? rawModuleSlug : '';
        if (!isModuleSlug(moduleSlug)) {
            res.status(404).json({ error: { code: 'REPORT_MODULE_NOT_FOUND', message: 'Unsupported report module.' } });
            return;
        }

        const filters = normalizeReportFilters(req.query, { purpose: 'preview' });
        const scope = resolveReportSchoolScope(
            user.portal_role,
            effectiveAccess.assignedSchoolIds,
            filters.school_id,
        );
        await validateReportGeography(pool, filters);
        const preview = await getReportDocument(pool, moduleSlug, view, filters, scope);

        await AuditService.logEvent({
            actor_id: user.id,
            portal_role: user.portal_role,
            action: 'REPORT_VIEWED',
            entity_type: 'CONSOLIDATED_REPORT',
            entity_id: moduleSlug,
            school_id: filters.school_id ?? null,
            details: {
                module_slug: moduleSlug,
                view,
                filters,
                scope_mode: scope.mode,
                empty: preview.empty,
            },
            ip_address: req.ip,
        });

        res.status(200).json({
            data: preview,
            meta: { page: filters.page, pageSize: filters.pageSize },
        });
    } catch (error: unknown) {
        if (error instanceof ReportContractError) {
            res.status(error.status).json({
                error: {
                    code: error.code,
                    message: error.message,
                    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
                },
            });
            return;
        }
        console.error('Consolidated report preview failed:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({ error: { code: 'REPORT_PREVIEW_FAILED', message: 'Failed to load report preview.' } });
    }
}

export async function getConsolidatedReportPreview(req: Request, res: Response): Promise<void> {
    return getDocumentPreview(req, res, 'municipality');
}

export async function getMasterlistReportPreview(req: Request, res: Response): Promise<void> {
    return getDocumentPreview(req, res, 'masterlist');
}

export async function recordMasterlistReportPrint(req: Request, res: Response): Promise<void> {
    req.body = { ...req.body, view: 'masterlist' };
    return recordConsolidatedReportPrint(req, res);
}

export async function recordConsolidatedReportPrint(req: Request, res: Response): Promise<void> {
    try {
        const user = req.user;
        const effectiveAccess = req.effectiveAccess;
        if (!user || !effectiveAccess) {
            res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
            return;
        }

        const rawModuleSlug = req.params.moduleSlug;
        const moduleSlug = typeof rawModuleSlug === 'string' ? rawModuleSlug : '';
        if (!isModuleSlug(moduleSlug)) {
            res.status(404).json({ error: { code: 'REPORT_MODULE_NOT_FOUND', message: 'Unsupported report module.' } });
            return;
        }

        // The request body is deliberately limited to the same strict, non-clinical
        // filter contract used by report previews. Actor and scope are server-owned.
        const { view: rawView, ...filterInput } = req.body ?? {};
        const view: ReportView = rawView === 'masterlist' ? 'masterlist' : 'municipality';
        if (rawView !== undefined && rawView !== 'municipality' && rawView !== 'masterlist') {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid report view.' } });
            return;
        }
        if (view === 'masterlist' && !effectiveAccess.modulePermissions[moduleSlug].can_export) {
            res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Masterlist print requires export permission.' } });
            return;
        }
        const filters = normalizeReportFilters(filterInput, { purpose: 'preview' });
        const scope = resolveReportSchoolScope(
            user.portal_role,
            effectiveAccess.assignedSchoolIds,
            filters.school_id,
        );
        await validateReportGeography(pool, filters);

        // Use a checked-out client so audit failures are returned to the caller. The
        // browser must not open the print dialog unless this event was persisted.
        const client = await pool.connect();
        try {
            await AuditService.logEvent({
                actor_id: user.id,
                portal_role: user.portal_role,
                action: 'REPORT_PRINT_INITIATED',
                entity_type: 'CONSOLIDATED_REPORT',
                entity_id: moduleSlug,
                school_id: filters.school_id ?? null,
                details: {
                    module_slug: moduleSlug,
                    view,
                    filters,
                    scope_mode: scope.mode,
                    status: 'initiated',
                },
                ip_address: req.ip,
            }, client);
        } finally {
            client.release();
        }

        res.status(201).json({ data: { status: 'recorded' } });
    } catch (error: unknown) {
        if (error instanceof ReportContractError) {
            res.status(error.status).json({
                error: {
                    code: error.code,
                    message: error.message,
                    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
                },
            });
            return;
        }
        console.error('Report print audit failed:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({ error: { code: 'REPORT_PRINT_AUDIT_FAILED', message: 'Printing could not be authorized.' } });
    }
}
