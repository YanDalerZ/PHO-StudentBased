import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';

const allSchoolsQuerySchema = z.object({
    includeInactive: z.enum(['true', 'false']).optional(),
}).strict();

export const getMunicipalities = async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM MUNICIPALITIES ORDER BY name ASC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBarangays = async (req: Request, res: Response) => {
    try {
        const { munId } = req.params;
        const result = await pool.query(
            'SELECT * FROM BARANGAYS WHERE municipality_id = $1 ORDER BY name ASC',
            [munId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getSchools = async (req: Request, res: Response) => {
    try {
        const rawBarangayId = req.params.bgyId;
        const bgyId = Array.isArray(rawBarangayId) ? rawBarangayId[0] : rawBarangayId;
        const includeInactive = req.user?.portal_role === 'admin' && req.query.includeInactive === 'true';
        const conditions = ['barangay_id = $1'];
        const params: Array<string | number[]> = [bgyId ?? ''];
        if (!includeInactive) conditions.push('is_active = TRUE');
        if (req.user?.portal_role === 'school_staff') {
            conditions.push('id = ANY($2::int[])');
            params.push(req.effectiveAccess?.assignedSchoolIds ?? []);
        }
        const result = await pool.query(
            `SELECT * FROM SCHOOLS WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
            params,
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllSchools = async (req: Request, res: Response) => {
    try {
        const query = allSchoolsQuerySchema.safeParse(req.query);
        if (!query.success) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'Invalid school lookup query.' },
            });
            return;
        }
        const includeInactive = req.user?.portal_role === 'admin' && query.data.includeInactive === 'true';
        const conditions: string[] = [];
        const params: number[][] = [];
        if (!includeInactive) conditions.push('sc.is_active = TRUE');
        const assignedSchoolIds = req.effectiveAccess?.assignedSchoolIds ?? [];
        if (req.user?.portal_role === 'school_staff'
            || (req.user?.portal_role === 'superuser' && assignedSchoolIds.length > 0)) {
            params.push(assignedSchoolIds);
            conditions.push(`sc.id = ANY($${params.length}::int[])`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(`
            SELECT sc.id, sc.name, sc.barangay_id, sc.district, sc.is_active,
                   b.name AS barangay_name, b.municipality_id,
                   m.name AS municipality_name
            FROM SCHOOLS sc
            JOIN BARANGAYS b ON b.id = sc.barangay_id
            JOIN MUNICIPALITIES m ON m.id = b.municipality_id
            ${whereClause}
            ORDER BY m.name ASC, b.name ASC, sc.name ASC
        `, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModules = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT id, name, slug, description, icon, is_active, sort_order FROM MODULES ORDER BY sort_order ASC, id ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

