import type { Request, Response } from 'express';
import pool from '../database/db.js';

// GET ALL USERS
export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rows } = await pool.query(
            'SELECT id, firstname, lastname, email, role, status, created_by, created_at FROM users ORDER BY created_at DESC'
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
};

// CREATE USER
export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { firstname, lastname, email, password, role, status, created_by } = req.body;

        if (!firstname || !lastname || !email || !password) {
            res.status(400).json({ success: false, message: 'Required fields missing' });
            return;
        }

        const query = `
            INSERT INTO users (firstname, lastname, email, password, role, status, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, firstname, lastname, email, role, status, created_by, created_at
        `;
        const values = [
            firstname,
            lastname,
            email,
            password,
            role || 'user',
            status || 'active',
            created_by || 'Admin'
        ];

        const { rows } = await pool.query(query, values);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (error: any) {
        if (error.code === '23505') {
            res.status(400).json({ success: false, message: 'Email already exists' });
            return;
        }
        res.status(500).json({ success: false, message: 'Failed to create user' });
    }
};

// UPDATE USER
export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { firstname, lastname, email, role, status } = req.body;

        const query = `
            UPDATE users
            SET firstname = $1, lastname = $2, email = $3, role = $4, status = $5
            WHERE id = $6
            RETURNING id, firstname, lastname, email, role, status, created_by, created_at
        `;
        const { rows } = await pool.query(query, [firstname, lastname, email, role, status, id]);

        if (rows.length === 0) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
};

// DELETE USER
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);

        if (rowCount === 0) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
};