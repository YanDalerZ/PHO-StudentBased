import type { Request, Response, NextFunction } from 'express';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';
import type { ModuleSlug } from '../types/auth.types.js';

/**
 * Middleware to enforce that a health module is active before allowing write operations.
 * If the module is deactivated by an administrator, returns 403 Forbidden.
 */
export const requireActiveModule = (slug: ModuleSlug) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const result = await pool.query<{ is_active: boolean }>(
                'SELECT is_active FROM MODULES WHERE slug = $1',
                [slug]
            );

            if (result.rows.length === 0 || !result.rows[0]?.is_active) {
                if (req.user) {
                    void AuditService.logEvent({
                        actor_id: req.user.id,
                        portal_role: req.user.portal_role,
                        action: 'AUTHORIZATION_DENIED',
                        entity_type: 'ACCESS_POLICY',
                        details: {
                            reason_code: 'module_disabled',
                            module_slug: slug,
                            method: req.method,
                            path: req.path,
                        },
                        ip_address: req.ip,
                    });
                }
                res.status(422).json({
                    error: {
                        code: 'MODULE_DISABLED',
                        message: `The '${slug}' module is unavailable for write operations.`,
                    },
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
