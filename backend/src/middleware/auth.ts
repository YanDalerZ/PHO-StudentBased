import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import type { AuthUser, EffectiveAccess } from '../types/auth.types.js';
import { getEffectiveAccess } from '../services/admin.service.js';
import pool from '../database/db.js';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
        
        // Re-fetch user to check active status and latest role immediately
        const userRes = await pool.query(
            'SELECT id, email, portal_role, job_title, is_active FROM USERS WHERE id = $1',
            [decoded.id]
        );

        if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
            return res.status(401).json({ message: 'Account is inactive or has been removed' });
        }

        const dbUser = userRes.rows[0];
        req.user = {
            id: dbUser.id,
            email: dbUser.email,
            portal_role: dbUser.portal_role,
            job_title: dbUser.job_title
        };
        
        try {
            req.effectiveAccess = await getEffectiveAccess(dbUser.id);
        } catch (dbErr) {
            console.error("Failed to load effective access:", dbErr);
            return res.status(500).json({ message: 'Failed to load access permissions' });
        }
        
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const attachEffectiveAccess = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
        req.effectiveAccess = await getEffectiveAccess(req.user.id);
        next();
    } catch (error) {
        return res.status(500).json({ message: 'Failed to load effective access' });
    }
};

