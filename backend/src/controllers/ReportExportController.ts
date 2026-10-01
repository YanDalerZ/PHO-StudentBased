import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import {
    createReportExportJob,
    deleteReportExport,
    downloadReportExport,
    getReportExportJob,
    ReportExportError,
} from '../services/report-export.service.js';
import {
    normalizeReportFilters,
    ReportContractError,
    resolveReportSchoolScope,
    validateReportGeography,
} from '../services/report.service.js';
import type { ModuleSlug } from '../types/auth.types.js';

const exportRequestSchema = z.object({
    format: z.enum(['csv', 'xlsx']),
    filters: z.record(z.string(), z.unknown()).default({}),
}).strict();

function moduleSlug(value: unknown): ModuleSlug | null {
    return typeof value === 'string' && ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'].includes(value)
        ? value as ModuleSlug
        : null;
}

function positiveId(value: unknown): number | null {
    const text = typeof value === 'string' ? value : '';
    return /^[1-9]\d*$/.test(text) ? Number(text) : null;
}

function sendError(res: Response, error: unknown): void {
    if (error instanceof ReportContractError || error instanceof ReportExportError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
    }
    console.error('Report export request failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: { code: 'REPORT_EXPORT_FAILED', message: 'Report export request failed.' } });
}

export async function requestReportExport(req: Request, res: Response): Promise<void> {
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
        const job = await createReportExportJob({
            requestedBy: user.id,
            portalRole: user.portal_role,
            moduleSlug: slug,
            format: parsed.data.format,
            filters,
            scope,
            ipAddress: req.ip,
        });
        res.status(202).json({ data: job });
    } catch (error: unknown) {
        sendError(res, error);
    }
}

export async function readReportExport(req: Request, res: Response): Promise<void> {
    try {
        if (!req.user) throw new ReportExportError('UNAUTHENTICATED', 403, 'Authentication required.');
        const id = positiveId(req.params.id);
        if (!id) throw new ReportExportError('VALIDATION_ERROR', 400, 'Export ID must be a positive integer.');
        res.status(200).json({ data: await getReportExportJob(id, req.user.id) });
    } catch (error: unknown) {
        sendError(res, error);
    }
}

export async function downloadReportExportFile(req: Request, res: Response): Promise<void> {
    try {
        if (!req.user) throw new ReportExportError('UNAUTHENTICATED', 403, 'Authentication required.');
        const id = positiveId(req.params.id);
        if (!id) throw new ReportExportError('VALIDATION_ERROR', 400, 'Export ID must be a positive integer.');
        const token = typeof req.query.token === 'string' ? req.query.token : '';
        if (!token) throw new ReportExportError('INVALID_DOWNLOAD_TOKEN', 403, 'A valid download credential is required.');
        const file = await downloadReportExport(id, req.user.id, token);
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(200).send(file.data);
    } catch (error: unknown) {
        sendError(res, error);
    }
}

export async function removeReportExport(req: Request, res: Response): Promise<void> {
    try {
        if (!req.user) throw new ReportExportError('UNAUTHENTICATED', 403, 'Authentication required.');
        const id = positiveId(req.params.id);
        if (!id) throw new ReportExportError('VALIDATION_ERROR', 400, 'Export ID must be a positive integer.');
        await deleteReportExport(id, req.user.id);
        res.status(204).send();
    } catch (error: unknown) {
        sendError(res, error);
    }
}
