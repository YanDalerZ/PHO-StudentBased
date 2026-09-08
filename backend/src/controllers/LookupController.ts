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
        const { bgyId } = req.params;
        const result = await pool.query(
            'SELECT * FROM SCHOOLS WHERE barangay_id = $1 ORDER BY name ASC',
            [bgyId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
