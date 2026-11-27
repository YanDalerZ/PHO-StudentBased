import type { Request, Response, NextFunction } from 'express';
import pool from '../database/db.js';
import { requirePermission } from '../middleware/rbac.js';
import type { ModuleSlug } from '../types/auth.types.js';

// Identifiers and predicates are fixed server-side, never supplied by a client.
// Patient Information can have a registration placeholder. The other modules
// create records only when their forms are saved through their module APIs.
const completionSources: Record<ModuleSlug, string> = {
    'patient-info': 'SELECT 1 FROM PATIENT_INFO r WHERE r.student_id = s.id AND r.form_saved',
    'oral-health': 'SELECT 1 FROM ORAL_HEALTH r WHERE r.student_id = s.id',
    deworming: 'SELECT 1 FROM DEWORMING r WHERE r.student_id = s.id',
    immunization: 'SELECT 1 FROM IMMUNIZATION r WHERE r.student_id = s.id',
    'vital-signs': 'SELECT 1 FROM VITAL_SIGNS r WHERE r.student_id = s.id',
};
const moduleSlugs = Object.keys(completionSources) as ModuleSlug[];

export function requireDashboardView(req: Request, res: Response, next: NextFunction) {
    const allowed = moduleSlugs.find(slug => req.effectiveAccess?.modulePermissions[slug]?.can_view);
    return requirePermission(allowed ?? 'patient-info', 'can_view')(req, res, next);
}

export async function getStudentDashboard(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const permitted = moduleSlugs.filter(slug => req.effectiveAccess?.modulePermissions[slug]?.can_view);
        const active = await pool.query<{ slug: ModuleSlug }>(
            'SELECT slug FROM MODULES WHERE is_active = TRUE AND slug = ANY($1::text[]) ORDER BY sort_order, id',
            [permitted],
        );
        const applicable = active.rows.map(row => row.slug);
        const completion = applicable.map(slug => `(EXISTS (${completionSources[slug]}))::int`).join(' + ') || '0';
        const result = await pool.query<{
            total_students: number; completed: number; recent_students: Record<string, unknown>[];
        }>(`
            WITH scoped_students AS MATERIALIZED (
                SELECT s.id, s.student_lrn, s.first_name, s.last_name, s.grade_level, s.section, s.created_at
                FROM STUDENTS s
                WHERE ($1::boolean OR s.school_id = ANY($2::int[]))
            )
            SELECT COUNT(*)::int AS total_students,
                   COALESCE(SUM(${completion}), 0)::int AS completed,
                   COALESCE((
                       SELECT jsonb_agg(recent ORDER BY recent.created_at DESC, recent.id DESC)
                       FROM (SELECT * FROM scoped_students ORDER BY created_at DESC, id DESC LIMIT 4) recent
                   ), '[]'::jsonb) AS recent_students
            FROM scoped_students s
        `, [req.user?.portal_role === 'superuser', req.effectiveAccess?.assignedSchoolIds ?? []]);
        const row = result.rows[0]!;
        const applicablePairs = row.total_students * applicable.length;
        res.json({ data: {
            total_students: row.total_students,
            completed: row.completed,
            pending: applicablePairs - row.completed,
            applicable_pairs: applicablePairs,
            applicable_modules: applicable,
            recent_students: row.recent_students,
        } });
    } catch (error) {
        console.error('Unable to load student dashboard summary:', error);
        res.status(500).json({ message: 'Unable to load student dashboard summary.' });
    }
}
