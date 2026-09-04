import type { Request, Response } from 'express';
import pool from '../database/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const userResult = await pool.query('SELECT * FROM USERS WHERE email = $1', [email]);
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email address' });
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
            return res.status(403).json({ message: 'Account is locked. Please contact the administrator.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            const newAttempts = (user.failed_login_attempts || 0) + 1;
            
            if (newAttempts >= 3) {
                await pool.query('UPDATE USERS SET failed_login_attempts = $1, is_active = false WHERE id = $2', [newAttempts, user.id]);
                return res.status(403).json({ message: 'Account locked due to too many failed attempts. Please contact the administrator.' });
            } else {
                await pool.query('UPDATE USERS SET failed_login_attempts = $1 WHERE id = $2', [newAttempts, user.id]);
                return res.status(401).json({ message: `Invalid password. You have ${3 - newAttempts} attempt(s) left.` });
            }
        }

        // Reset failed_login_attempts on successful login
        if (user.failed_login_attempts > 0) {
            await pool.query('UPDATE USERS SET failed_login_attempts = 0 WHERE id = $1', [user.id]);
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                first_name: user.first_name,
                last_name: user.last_name
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Invalid input data', errors: error.issues });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = (req: Request, res: Response) => {
    // Client-side handles token clearing, server responds with success
    res.json({ message: 'Logged out successfully' });
};

export const getMe = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const userResult = await pool.query(
            'SELECT id, email, role, first_name, last_name, contact_no, is_active FROM USERS WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(userResult.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
