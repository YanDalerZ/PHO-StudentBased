import type { PortalRole } from './auth.types.js';

export type UserRole = PortalRole;
export type CreatableUserRole = 'school_staff' | 'superuser';

export interface AdminUserSummary {
  id: number;
  email: string;
  portal_role: UserRole;
  job_title: string;
  first_name: string;
  last_name: string;
  contact_no: string | null;
  is_active: boolean;
  failed_login_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface AdminDashboardStats {
  users_by_role: {
    school_staff: number;
    superuser: number;
    admin: number;
    total: number;
  };
  total_students: number;
  active_modules: number;
  recent_users: AdminUserSummary[];
}

export interface AdminUserFilters {
  search?: string | undefined;
  portal_role?: UserRole | undefined;
  page: number;
  limit: number;
}

export const APPROVED_MODULE_SLUGS = [
  'patient-info',
  'oral-health',
  'deworming',
  'vital-signs',
  'immunization',
] as const;

export type ApprovedModuleSlug = (typeof APPROVED_MODULE_SLUGS)[number];

export interface AdminModule {
  id: number;
  name: string;
  slug: ApprovedModuleSlug;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSchoolWithGeo {
  id: number;
  name: string;
  address: string | null;
  barangay_id: number | null;
  district: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  barangay_name: string | null;
  municipality_id: number | null;
  municipality_name: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface AdminModulePermission {
  module_id: number;
  module_slug: ApprovedModuleSlug;
  module_name: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_approve_registration: boolean;
  can_report: boolean;
  can_export: boolean;
}

export interface ModulePermissionReplacement {
  module_id: number;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_approve_registration: boolean;
  can_report: boolean;
  can_export: boolean;
}

export interface AdminSchoolAssignment {
  school_id: number;
  school_name: string;
}
