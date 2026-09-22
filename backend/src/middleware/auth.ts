import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import type { AuthenticatedUser, UserSchoolAssignment, UserModulePermission } from '../types/auth.types.js';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number, email: string };
        const userId = decoded.id;

        // Fetch user basic data
        const userRes = await pool.query(
            `SELECT id, email, role, job_title, is_active FROM USERS WHERE id = $1`,
            [userId]
        );

        if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
            return res.status(401).json({ message: 'User account not found or inactive' });
        }

        const userRow = userRes.rows[0];

        // Fetch school assignments
        const schoolRes = await pool.query(
            `SELECT school_id FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = $1 AND revoked_at IS NULL`,
            [userId]
        );
        const schoolAssignments = schoolRes.rows.map(r => r.school_id);

        // Fetch module permissions
        const moduleRes = await pool.query(`
            SELECT ump.*, m.slug as module_slug 
            FROM USER_MODULE_PERMISSIONS ump
            JOIN MODULES m ON ump.module_id = m.id
            WHERE ump.user_id = $1 AND ump.revoked_at IS NULL AND m.is_active = TRUE
        `, [userId]);

        const modulePermissions: Record<string, UserModulePermission> = {};
        for (const row of moduleRes.rows) {
            modulePermissions[row.module_slug] = row;
        }

        const authenticatedUser: AuthenticatedUser = {
            id: userRow.id,
            email: userRow.email,
            role: userRow.role,
            job_title: userRow.job_title,
            schoolAssignments,
            modulePermissions
        };

        req.user = authenticatedUser;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
