import type { EffectiveAccess, ModulePermissions, ModuleSlug, User } from '../types/index.ts';

export type ModuleAction = keyof ModulePermissions;

export const hasModulePermission = (
  access: EffectiveAccess | null,
  module: ModuleSlug,
  action: ModuleAction,
): boolean => Boolean(access?.modulePermissions[module]?.[action]);

export const canWriteModuleRecord = (
  access: EffectiveAccess | null,
  module: ModuleSlug,
  hasExistingRecord: boolean,
): boolean => hasModulePermission(access, module, hasExistingRecord ? 'can_edit' : 'can_create');

export const defaultPortalRoute = (user: User, access: EffectiveAccess | null): string => {
  if (user.portal_role === 'admin') return '/admin/dashboard';
  if (user.portal_role === 'school_staff') {
    if (hasModulePermission(access, 'patient-info', 'can_view')) return '/teacher/dashboard';
    const reportModule = (['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'] as ModuleSlug[])
      .find(module => hasModulePermission(access, module, 'can_report'));
    return reportModule ? `/teacher/reports/${reportModule}` : '/forbidden';
  }

  const routes: Array<[ModuleSlug, string]> = [
    ['patient-info', '/superuser/dashboard'],
    ['oral-health', '/superuser/oral-health'],
    ['deworming', '/superuser/deworming'],
    ['immunization', '/superuser/immunization'],
    ['vital-signs', '/superuser/vital-signs'],
  ];
  const viewRoute = routes.find(([module]) => hasModulePermission(access, module, 'can_view'))?.[1];
  if (viewRoute) return viewRoute;
  const reportModule = routes.find(([module]) => hasModulePermission(access, module, 'can_report'))?.[0];
  return reportModule ? `/superuser/reports/${reportModule}` : '/forbidden';
};
