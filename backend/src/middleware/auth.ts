import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import type { AuthUser, EffectiveAccess } from '../types/auth.types.js';
import { getEffectiveAccess } from '../services/admin.service.js';
import pool from '../database/db.js';
import { sessionStatus } from '../services/portalSession.js';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    try {
        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
        if (!Number.isSafeInteger(decoded.id) || !decoded.sid || !/^[0-9a-f-]{36}$/i.test(decoded.sid)) {
            return res.status(401).json({ code: 'SESSION_INVALID', message: 'Please sign in again.' });
        }
        const session = await sessionStatus(decoded.sid, decoded.id);
        if (session.expired) {
            const code = session.expired === 'maximum' ? 'SESSION_MAXIMUM_EXPIRED'
                : session.expired === 'inactivity' ? 'SESSION_INACTIVE' : 'SESSION_REVOKED';
            return res.status(401).json({ code, message: 'Your session has ended. Please sign in again.' });
        }
        req.portalSessionId = decoded.sid;
        
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
        if (error instanceof jwt.TokenExpiredError && token) {
            // Verify the signature even for an expired envelope so a resumed
            // browser still gets the correct maximum-lifetime explanation.
            try {
                const expired = jwt.verify(token, process.env.JWT_SECRET!, { ignoreExpiration: true }) as AuthUser;
                if (expired.sid && Number.isSafeInteger(expired.id)) {
                    const state = await sessionStatus(expired.sid, expired.id);
                    if (state.expired === 'maximum') {
                        return res.status(401).json({ code: 'SESSION_MAXIMUM_EXPIRED', message: 'Your 8-hour session ended. Please sign in again.' });
                    }
                }
            } catch { /* keep the generic invalid-token response */ }
        }
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ code: 'SESSION_INVALID', message: 'Invalid or expired token' });
        }
        console.error('Session authentication failed:', error);
        return res.status(503).json({ message: 'Session validation unavailable' });
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

