import type { Request, Response } from 'express';
import pool from '../database/db.js';

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

