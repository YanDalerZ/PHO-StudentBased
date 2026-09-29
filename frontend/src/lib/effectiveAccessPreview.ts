import type {
  AdminModule,
  EffectiveAccess,
  ModulePermissions,
  ModuleSlug,
  User,
} from '../types';
import { emptyModulePermissions, type PermissionDraft } from './permissionMatrix.ts';

export type AccessReadinessCode =
  | 'ready'
  | 'missing_school_scope'
  | 'missing_portal_module'
  | 'management_only';

export interface AccessReadiness {
  code: AccessReadinessCode;
  label: string;
  description: string;
}

export const withDraftSchoolScope = (
  access: EffectiveAccess,
  schoolIds: number[],
): EffectiveAccess => ({
  assignedSchoolIds: [...new Set(schoolIds)].sort((left, right) => left - right),
  modulePermissions: { ...access.modulePermissions },
});

export const withDraftModulePermissions = (
  access: EffectiveAccess,
  modules: AdminModule[],
  draft: PermissionDraft,
): EffectiveAccess => {
  const modulePermissions = { ...access.modulePermissions };
  modules.forEach((module) => {
    modulePermissions[module.slug] = { ...(draft[module.id] ?? emptyModulePermissions()) };
  });
  return {
    assignedSchoolIds: [...access.assignedSchoolIds],
    modulePermissions,
  };
};

const canView = (access: EffectiveAccess, module: ModuleSlug): boolean =>
  Boolean(access.modulePermissions[module]?.can_view);

export const getAccessReadiness = (
  portalRole: User['portal_role'],
  access: EffectiveAccess,
): AccessReadiness => {
  if (portalRole === 'admin') {
    return {
      code: 'management_only',
      label: 'Management access only',
      description: 'Administrator accounts remain outside clinical modules.',
    };
  }

  if (portalRole === 'school_staff') {
    if (!canView(access, 'patient-info')) {
      return {
        code: 'missing_portal_module',
        label: 'No teacher portal route',
        description: 'Grant Patient Information view access to enable the teacher portal.',
      };
    }
    if (access.assignedSchoolIds.length === 0) {
      return {
        code: 'missing_school_scope',
        label: 'School scope missing',
        description: 'Assign at least one active school before the user works with school records.',
      };
    }
    return {
      code: 'ready',
      label: 'Teacher access ready',
      description: 'The account has a teacher portal route and assigned school scope.',
    };
  }

  const hasModuleRoute = (Object.values(access.modulePermissions) as ModulePermissions[])
    .some((permission) => permission.can_view);
  if (!hasModuleRoute) {
    return {
      code: 'missing_portal_module',
      label: 'No superuser portal route',
      description: 'Grant view access to at least one clinical module.',
    };
  }
  return {
    code: 'ready',
    label: 'Superuser access ready',
    description: 'The account has a clinical module route and province-wide scope.',
  };
};
