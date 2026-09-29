import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import { requirePermission } from '../middleware/rbac.js';

const modules = ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'] as const;
const querySchema = z.strictObject({ module: z.enum(modules).optional() });

// A named module must be granted; callers omitting it need at least one view grant.
export function requireContextPermission(req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store');
    const query = querySchema.safeParse(req.query);
    const id = z.coerce.number().int().positive().max(2147483647).safeParse(req.params.id);
    if (!query.success || !id.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid student ID or module' } });
    }
    const module = query.data.module ?? modules.find(slug => req.effectiveAccess?.modulePermissions[slug]?.can_view);
    // Reuse the central permission check and denial auditing, including the no-grant case.
    return requirePermission(module ?? 'patient-info', 'can_view')(req, res, next);
}

export async function getStudentModuleContext(req: Request, res: Response): Promise<void> {
    try {
        const result = await pool.query(`
            SELECT s.id, s.student_lrn, s.first_name, s.middle_name, s.last_name, s.suffix,
                   TO_CHAR(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                   EXTRACT(YEAR FROM AGE(CURRENT_DATE, s.date_of_birth))::int AS age,
                   s.sex, s.school_id, sc.name AS school_name, s.grade_level, s.section
            FROM STUDENTS s
            LEFT JOIN SCHOOLS sc ON sc.id = s.school_id
            WHERE s.id = $1 AND ($2::boolean OR s.school_id = ANY($3::int[]))
        `, [Number(req.params.id),
            req.user?.portal_role === 'superuser' && req.effectiveAccess?.assignedSchoolIds.length === 0,
            req.effectiveAccess?.assignedSchoolIds ?? []]);
        if (!result.rows[0]) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
            return;
        }
        res.json({ data: result.rows[0] });
    } catch {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load student context' } });
    }
}
