export type PortalRole = 'school_staff' | 'superuser' | 'admin';

export interface UserSchoolAssignment {
    id: number;
    user_id: number;
    school_id: number;
    assigned_by?: number;
    assigned_at: Date;
    revoked_by?: number;
    revoked_at?: Date;
}

export interface UserModulePermission {
    id: number;
    user_id: number;
    module_id: number;
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_approve_registration: boolean;
    can_report: boolean;
    can_export: boolean;
    granted_by?: number;
    granted_at: Date;
    revoked_by?: number;
    revoked_at?: Date;
    module_slug: string; // Joined from MODULES table
}

export interface AuthenticatedUser {
    id: number;
    email: string;
    role: PortalRole;
    job_title?: string;
    schoolAssignments: number[]; // Array of school IDs active for this user
    modulePermissions: Record<string, UserModulePermission>; // Keyed by module_slug
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}
