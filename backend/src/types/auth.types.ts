export type PortalRole = 'school_staff' | 'superuser' | 'admin';

export type ModuleSlug = 
    | 'patient-info'
    | 'oral-health'
    | 'deworming'
    | 'immunization'
    | 'vital-signs';

export type ActionGrant = 
    | 'can_view'
    | 'can_create'
    | 'can_edit'
    | 'can_approve_registration'
    | 'can_report'
    | 'can_export';

export interface ModulePermissions {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_approve_registration: boolean;
    can_report: boolean;
    can_export: boolean;
}

export interface EffectiveAccess {
    assignedSchoolIds: number[];
    modulePermissions: Record<ModuleSlug, ModulePermissions>;
}

export interface AuthUser {
    id: number;
    email: string;
    portal_role: PortalRole;
    job_title: string;
    first_name?: string;
    last_name?: string;
}

// Ensure the Express Request object is augmented with our new user type
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            effectiveAccess?: EffectiveAccess;
        }
    }
}
