import type { Request, Response, NextFunction } from 'express';
import type { PortalRole, ModuleSlug, ActionGrant } from '../types/auth.types.js';
import { AuditService } from '../services/AuditService.js';

function auditDenial(req: Request, details: Record<string, unknown>, schoolId?: number): void {
    if (!req.user) return;
    void AuditService.logEvent({
        actor_id: req.user.id,
        portal_role: req.user.portal_role,
        action: 'AUTHORIZATION_DENIED',
        entity_type: 'ACCESS_POLICY',
        school_id: schoolId,
        details: {
            ...details,
            method: req.method,
            path: req.path,
        },
        ip_address: req.ip,
    });
}

/**
 * Ensures the user has one of the allowed portal roles.
 */
export const requirePortalRole = (...allowedRoles: PortalRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.portal_role)) {
            const message = `Access denied: Requires one of the following roles: ${allowedRoles.join(', ')}`;
            auditDenial(req, {
                reason_code: 'portal_role_not_allowed',
                allowed_roles: allowedRoles,
                attempted_role: req.user.portal_role,
            });

            return res.status(403).json({ 
                error: {
                    code: 'FORBIDDEN',
                    message
                }
            });
        }

        next();
    };
};

/**
 * Ensures the user has a specific action grant for a given module.
 * If the user is an admin, they by default do not have clinical permissions unless explicitly granted in USER_MODULE_PERMISSIONS.
 */
export const requirePermission = (moduleSlug: ModuleSlug, action: ActionGrant) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.effectiveAccess) {
            return res.status(401).json({ message: 'Authentication and effective access context required' });
        }

        const modulePermissions = req.effectiveAccess.modulePermissions[moduleSlug];
        
        if (!modulePermissions || !modulePermissions[action]) {
            const message = `Access denied: Missing action grant '${action}' for ${moduleSlug}`;
            auditDenial(req, {
                reason_code: 'missing_action_grant',
                module_slug: moduleSlug,
                action,
            });

            return res.status(403).json({ 
                error: {
                    code: 'FORBIDDEN',
                    message
                }
            });
        }

        next();
    };
};

/**
 * Ensures the requested school_id matches the user's active school assignments.
 * Superusers with no specific school assignments have province-wide access (implicit bypass).
 * NOTE: This middleware expects the requested school_id to be in req.params, req.query, or req.body.
 */
export const requireSchoolScope = (schoolIdExtractor: (req: Request) => number | null | undefined) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.effectiveAccess) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const requestedSchoolId = schoolIdExtractor(req);
        
        // If superuser and has no specific school assignments, they have province-wide scope
        if (req.user.portal_role === 'superuser' && req.effectiveAccess.assignedSchoolIds.length === 0) {
            return next();
        }

        // If they requested a specific school, check if they are assigned to it
        if (requestedSchoolId) {
            if (!req.effectiveAccess.assignedSchoolIds.includes(requestedSchoolId)) {
                const message = `Access denied: Out of assigned school scope for school_id ${requestedSchoolId}`;
                auditDenial(req, { reason_code: 'school_out_of_scope' }, requestedSchoolId);

                return res.status(403).json({ 
                    error: {
                        code: 'FORBIDDEN',
                        message
                    }
                });
            }
        } else {
             return res.status(400).json({ 
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'school_id is required for this scoped request'
                }
            });
        }

        next();
    };
};

declare global {
    namespace Express {
        interface Request {
            authorizedSchoolIds?: number[];
        }
    }
}

/**
 * Adds the school boundary used by dashboard aggregate queries. Superusers retain
 * province-wide scope; school staff are restricted to current active assignments.
 */
export const requireDashboardSchoolScope = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.effectiveAccess) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (req.user.portal_role === 'superuser') return next();

        const assignedSchoolIds = req.effectiveAccess.assignedSchoolIds;
        const rawSchoolId = req.query.school_id;
        const schoolId = typeof rawSchoolId === 'string' ? Number(rawSchoolId) : undefined;
        if (schoolId !== undefined && Number.isInteger(schoolId) && schoolId > 0
            && !assignedSchoolIds.includes(schoolId)) {
            auditDenial(req, { reason_code: 'dashboard_school_out_of_scope' }, schoolId);
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Access denied: school outside assigned scope' },
            });
        }

        req.authorizedSchoolIds = [...assignedSchoolIds];
        next();
    };
};
