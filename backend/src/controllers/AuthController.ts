import type { Request, Response } from 'express';
import pool from '../database/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getEffectiveAccess } from '../services/admin.service.js';
import { AuditService } from '../services/AuditService.js';
import { randomUUID } from 'node:crypto';
import { recordActivity, sessionStatus } from '../services/portalSession.js';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const userResult = await pool.query('SELECT * FROM USERS WHERE LOWER(email) = LOWER($1)', [email]);
        
        if (userResult.rows.length === 0) {
            await AuditService.logEvent({
                action: 'LOGIN_FAILED',
                entity_type: 'AUTH',
                details: { email, reason: 'Invalid email address' },
                ip_address: req.ip
            });
            return res.status(401).json({ message: 'Invalid email address' });
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
            await AuditService.logEvent({
                actor_id: user.id,
                portal_role: user.portal_role,
                action: 'LOGIN_FAILED',
                entity_type: 'AUTH',
                details: { email: user.email, reason: 'Account locked/inactive' },
                ip_address: req.ip
            });
            return res.status(403).json({ message: 'Account is locked. Please contact the administrator.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            const newAttempts = (user.failed_login_attempts || 0) + 1;
            
            await AuditService.logEvent({
                actor_id: user.id,
                portal_role: user.portal_role,
                action: 'LOGIN_FAILED',
                entity_type: 'AUTH',
                details: { email: user.email, attempts: newAttempts },
                ip_address: req.ip
            });

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

        const effectiveAccess = await getEffectiveAccess(user.id);

        const sessionId = randomUUID();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('INSERT INTO PORTAL_SESSIONS (id, user_id) VALUES ($1, $2)', [sessionId, user.id]);
            await AuditService.logEvent({
                actor_id: user.id, portal_role: user.portal_role, action: 'login',
                entity_type: 'auth', ip_address: req.ip,
            }, client);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        const token = jwt.sign(
            { 
                id: user.id, 
                sid: sessionId,
                email: user.email, 
                portal_role: user.portal_role, 
                job_title: user.job_title 
            },
            process.env.JWT_SECRET!,
            // Database session check enforces 8 hours; the JWT envelope lasts
            // slightly longer so the API can report the exact maximum reason.
            { expiresIn: '9h' }
        );
        const session = await sessionStatus(sessionId, user.id);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                portal_role: user.portal_role,
                job_title: user.job_title,
                first_name: user.first_name,
                last_name: user.last_name
            },
            effectiveAccess,
            session: session.status
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Invalid input data', errors: error.issues });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = async (req: Request, res: Response) => {
    if (req.portalSessionId && req.user) {
        await pool.query('UPDATE PORTAL_SESSIONS SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1 AND user_id = $2', [req.portalSessionId, req.user.id]);
    }
    res.json({ message: 'Logged out successfully' });
};

export const getSession = async (req: Request, res: Response) => {
    const result = await sessionStatus(req.portalSessionId!, req.user!.id);
    res.set('Cache-Control', 'no-store').json({ session: result.status });
};

export const continueSession = async (req: Request, res: Response) => {
    const result = await recordActivity(req.portalSessionId!, req.user!.id);
    if (result.expired) {
        const code = result.expired === 'maximum' ? 'SESSION_MAXIMUM_EXPIRED'
            : result.expired === 'inactivity' ? 'SESSION_INACTIVE' : 'SESSION_REVOKED';
        res.status(401).json({ code, message: 'Your session has ended. Please sign in again.' });
        return;
    }
    res.set('Cache-Control', 'no-store').json({ session: result.status });
};

export const getMe = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const userResult = await pool.query(
            'SELECT id, email, portal_role, job_title, first_name, last_name, contact_no, is_active FROM USERS WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const effectiveAccess = await getEffectiveAccess(req.user.id);

        res.json({
            user: userResult.rows[0],
            effectiveAccess
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
