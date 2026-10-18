import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';
import {
    appendTargetRevision,
    readTargetRevisions,
    REPORT_TARGET_INDICATORS,
    targetPeriod,
    targetQuerySchema,
    targetWriteSchema,
} from '../services/report-target.service.js';
import type { ModuleSlug } from '../types/auth.types.js';

function moduleFromRequest(req: Request): ModuleSlug | null {
    const raw = req.params.moduleSlug;
    return typeof raw === 'string' && Object.hasOwn(REPORT_TARGET_INDICATORS, raw)
        ? raw as ModuleSlug : null;
}

function authorize(req: Request, res: Response, moduleSlug: ModuleSlug, schoolId?: number): number[] | null | undefined {
    if (!req.user || !req.effectiveAccess) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return undefined;
    }
    if (req.user.portal_role === 'admin') return null;
    if (!req.effectiveAccess.modulePermissions[moduleSlug]?.can_manage_targets) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Target management permission required.' } });
        return undefined;
    }
    if (req.user.portal_role === 'superuser') return null;
    const schoolIds = req.effectiveAccess.assignedSchoolIds;
    if (schoolId !== undefined && !schoolIds.includes(schoolId)) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'School is outside assigned scope.' } });
        return undefined;
    }
    return schoolIds;
}

function sendError(res: Response, error: unknown): void {
    if (error instanceof ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid target period or values.', fieldErrors: error.flatten().fieldErrors } });
        return;
    }
    console.error('Target management failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: { code: 'TARGET_MANAGEMENT_FAILED', message: 'Target request failed.' } });
}

export async function listReportTargets(req: Request, res: Response): Promise<void> {
    try {
        const moduleSlug = moduleFromRequest(req);
        if (!moduleSlug) {
            res.status(404).json({ error: { code: 'MODULE_NOT_FOUND', message: 'Unsupported report module.' } });
            return;
        }
        const query = targetQuerySchema.parse(req.query);
        if (query.indicator && !REPORT_TARGET_INDICATORS[moduleSlug].includes(query.indicator)) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Indicator is not valid for this module.' } });
            return;
        }
        const schoolIds = authorize(req, res, moduleSlug, query.school_id);
        if (schoolIds === undefined) return;
        const rows = await readTargetRevisions(pool, moduleSlug, { ...targetPeriod(query), school_id: query.school_id, indicator: query.indicator }, schoolIds);
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(200).json({ data: rows, period: targetPeriod(query) });
    } catch (error) {
        sendError(res, error);
    }
}

export async function saveReportTarget(req: Request, res: Response): Promise<void> {
    try {
        const moduleSlug = moduleFromRequest(req);
        if (!moduleSlug) {
            res.status(404).json({ error: { code: 'MODULE_NOT_FOUND', message: 'Unsupported report module.' } });
            return;
        }
        const body = targetWriteSchema.parse(req.body);
        if (!REPORT_TARGET_INDICATORS[moduleSlug].includes(body.indicator)) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Indicator is not valid for this module.' } });
            return;
        }
        const schoolIds = authorize(req, res, moduleSlug, body.school_id);
        if (schoolIds === undefined || !req.user) return;
        const school = await pool.query('SELECT id FROM SCHOOLS WHERE id = $1', [body.school_id]);
        if (school.rows.length === 0) {
            res.status(404).json({ error: { code: 'SCHOOL_NOT_FOUND', message: 'School not found.' } });
            return;
        }
        const period = targetPeriod(body);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const revision = await appendTargetRevision(client, {
                moduleSlug, indicator: body.indicator, schoolId: body.school_id,
                period, targetCount: body.target_count, sourceNote: body.source_note, actorId: req.user.id,
            });
            await AuditService.logEvent({
                actor_id: req.user.id, portal_role: req.user.portal_role,
                action: 'REPORT_TARGET_REVISED', entity_type: 'REPORT_TARGET', entity_id: String(revision.id),
                school_id: body.school_id,
                details: { module_slug: moduleSlug, indicator: body.indicator, period,
                    previous_count: revision.previousCount, target_count: body.target_count },
                ip_address: req.ip,
            }, client);
            await client.query('COMMIT');
            res.status(201).json({ data: { revision_id: revision.id, previous_count: revision.previousCount } });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        sendError(res, error);
    }
}
