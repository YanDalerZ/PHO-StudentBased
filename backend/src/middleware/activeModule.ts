import type { Request, Response, NextFunction } from 'express';
import pool from '../database/db.js';

/**
 * Middleware to enforce that a health module is active before allowing write operations.
 * If the module is deactivated by an administrator, returns 403 Forbidden.
 */
export const requireActiveModule = (slug: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const result = await pool.query<{ is_active: boolean }>(
                'SELECT is_active FROM MODULES WHERE slug = $1',
                [slug]
            );

            if (result.rows.length > 0 && !result.rows[0]?.is_active) {
                res.status(403).json({
                    message: `The '${slug}' module is currently deactivated by the administrator.`
                });
                return;
            }

            next();
        } catch (error) {
            console.error(`Error checking active status for module ${slug}:`, error);
            res.status(500).json({ message: 'Internal server error checking module status' });
        }
    };
};
