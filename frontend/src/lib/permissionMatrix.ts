import type {
  AdminModule,
  AdminModulePermission,
  AdminModulePermissionReplacement,
  ModulePermissions,
  ModuleSlug,
  User,
} from '../types';

export type PermissionAction = keyof ModulePermissions;
export type PermissionDraft = Record<number, ModulePermissions>;

export const emptyModulePermissions = (): ModulePermissions => ({
  can_view: false,
  can_create: false,
  can_edit: false,
  can_approve_registration: false,
  can_report: false,
  can_export: false,
});

export const buildPermissionDraft = (
  modules: AdminModule[],
  grants: AdminModulePermission[],
): PermissionDraft => {
  const grantByModule = new Map(grants.map((grant) => [grant.module_id, grant]));
  return Object.fromEntries(modules.map((module) => {
    const grant = grantByModule.get(module.id);
    return [module.id, grant ? {
      can_view: grant.can_view,
      can_create: grant.can_create,
      can_edit: grant.can_edit,
      can_approve_registration: grant.can_approve_registration,
      can_report: grant.can_report,
      can_export: grant.can_export,
    } : emptyModulePermissions()];
  }));
};

export const applyPermissionToggle = (
  current: ModulePermissions,
  action: PermissionAction,
  checked: boolean,
): ModulePermissions => {
  const next = { ...current, [action]: checked };

  if ((action === 'can_create' || action === 'can_edit') && checked) {
    next.can_view = true;
  }
  if (action === 'can_export' && checked && !next.can_view && !next.can_report) {
    next.can_view = true;
  }
  if (action === 'can_view' && !checked) {
    next.can_create = false;
    next.can_edit = false;
    if (!next.can_report) next.can_export = false;
  }
  if (action === 'can_report' && !checked && !next.can_view) {
    next.can_export = false;
  }

  return next;
};

const hasAnyGrant = (permission: ModulePermissions): boolean =>
  Object.values(permission).some(Boolean);

export const validateModulePermission = (
  moduleSlug: ModuleSlug,
  portalRole: User['portal_role'],
  permission: ModulePermissions,
): string[] => {
  const messages: string[] = [];
  if (portalRole === 'admin' && hasAnyGrant(permission)) {
    messages.push('Administrator accounts cannot receive clinical module permissions.');
  }
  if ((permission.can_create || permission.can_edit) && !permission.can_view) {
    messages.push('Create and edit access require view access.');
  }
  if (permission.can_export && !permission.can_view && !permission.can_report) {
    messages.push('Export access requires view or report access.');
  }
  if (permission.can_approve_registration
    && (portalRole !== 'school_staff' || moduleSlug !== 'patient-info')) {
    messages.push('Registration approval is limited to school staff in Patient Information.');
  }
  return messages;
};

export const buildPermissionPayload = (
  modules: AdminModule[],
  draft: PermissionDraft,
): AdminModulePermissionReplacement[] => modules
  .slice()
  .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
  .flatMap((module) => {
    const permission = draft[module.id] ?? emptyModulePermissions();
    return hasAnyGrant(permission) ? [{ module_id: module.id, ...permission }] : [];
  });

export const permissionPayloadKey = (payload: AdminModulePermissionReplacement[]): string =>
  JSON.stringify(payload);
