import type { Request, Response } from 'express';
import pool from '../database/db.js';
import { z } from 'zod';

const schoolFilters = z.object({
    search: z.string().trim().max(200).optional(),
    municipality_id: z.coerce.number().int().positive().optional(),
    barangay_id: z.coerce.number().int().positive().optional(),
});

// School geography describes the campus, independently of student residence.
export const getActiveSchools = async (req: Request, res: Response) => {
    const parsed = schoolFilters.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid school filters' });
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const { search, municipality_id, barangay_id } = parsed.data;
    try {
        const result = await pool.query(
            `SELECT s.*, b.name AS barangay_name, b.municipality_id, m.name AS municipality_name
             FROM SCHOOLS s
             LEFT JOIN BARANGAYS b ON b.id = s.barangay_id
             LEFT JOIN MUNICIPALITIES m ON m.id = b.municipality_id
             WHERE s.is_active = TRUE
               AND ($1::text IS NULL OR s.name ILIKE '%' || $1 || '%'
                    OR b.name ILIKE '%' || $1 || '%' OR m.name ILIKE '%' || $1 || '%')
               AND ($2::int IS NULL OR m.id = $2)
               AND ($3::int IS NULL OR b.id = $3)
               AND ($4::int[] IS NULL OR s.id = ANY($4::int[]))
             ORDER BY s.name, m.name, b.name, s.id`,
            [search ?? null, municipality_id ?? null, barangay_id ?? null,
             req.user.role === 'school_staff' ? req.user.schoolAssignments : null]
        );
        return res.json(result.rows);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

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
        const { bgyId } = req.params;
        const includeInactive = req.query.includeInactive === 'true';
        const query = includeInactive
            ? 'SELECT * FROM SCHOOLS WHERE barangay_id = $1 ORDER BY name ASC'
            : 'SELECT * FROM SCHOOLS WHERE barangay_id = $1 AND is_active = TRUE ORDER BY name ASC';
        const result = await pool.query(query, [bgyId]);
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

