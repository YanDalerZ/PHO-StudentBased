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
    return hasModulePermission(access, 'patient-info', 'can_view')
      ? '/teacher/dashboard'
      : '/forbidden';
  }

  const routes: Array<[ModuleSlug, string]> = [
    ['patient-info', '/superuser/dashboard'],
    ['oral-health', '/superuser/oral-health'],
    ['deworming', '/superuser/deworming'],
    ['immunization', '/superuser/immunization'],
    ['vital-signs', '/superuser/vital-signs'],
  ];
  return routes.find(([module]) => hasModulePermission(access, module, 'can_view'))?.[1] ?? '/forbidden';
};
