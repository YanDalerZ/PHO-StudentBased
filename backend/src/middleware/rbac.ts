import type { Request, Response, NextFunction } from 'express';
import type { PortalRole, UserModulePermission } from '../types/auth.types.js';
import pool from '../database/db.js';

export const requirePortalRole = (...allowedRoles: PortalRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: 'Access forbidden: Insufficient privileges' 
            });
        }

        next();
    };
};

export const requirePermission = (moduleSlug: string, action: keyof UserModulePermission) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }


        const modulePerms = req.user.modulePermissions[moduleSlug];
        
        if (!modulePerms || !modulePerms[action]) {
            return res.status(403).json({ 
                message: `Access forbidden: Missing ${String(action)} permission for module ${moduleSlug}` 
            });
        }

        next();
    };
};

/**
 * requireSchoolScope evaluates the target school_id.
 * @param resolveSchoolId A function that returns the target school_id for this request.
 * If the function throws an Error with message '404', it will return 404.
 */
export const requireSchoolScope = (resolveSchoolId: (req: Request) => Promise<number | undefined>) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Admin bypasses school scope
        if (req.user.role === 'admin') {
            return next();
        }

        // Superusers bypass school assignment checks (province-wide),
        // assuming requirePermission handles their module/action authorization.
        if (req.user.role === 'superuser') {
            return next();
        }

        try {
            const schoolId = await resolveSchoolId(req);
            
            if (schoolId === undefined || schoolId === null || isNaN(schoolId)) {
                return res.status(400).json({ message: 'Missing target school' });
            }

            // Check if school is valid in DB
            const schoolCheck = await pool.query('SELECT is_active FROM SCHOOLS WHERE id = $1', [schoolId]);
            if (schoolCheck.rows.length === 0) {
                return res.status(404).json({ message: 'Invalid school: not found' });
            }
            if (!schoolCheck.rows[0].is_active) {
                return res.status(400).json({ message: 'Invalid school: inactive' });
            }

            // school_staff must be assigned to this school
            if (!req.user.schoolAssignments.includes(schoolId)) {
                return res.status(403).json({ message: 'Access forbidden: Unassigned school' });
            }

            next();
        } catch (error: any) {
            if (error.message === '404') {
                return res.status(404).json({ message: 'Target record not found' });
            }
            console.error('requireSchoolScope error:', error);
            return res.status(500).json({ message: 'Internal server error resolving school scope' });
        }
    };
};
