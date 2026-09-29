import assert from 'node:assert/strict';
import {
  applyPermissionToggle,
  buildPermissionDraft,
  buildPermissionPayload,
  emptyModulePermissions,
  validateModulePermission,
} from '../src/lib/permissionMatrix.ts';
import type { AdminModule, AdminModulePermission } from '../src/types/index.ts';

const modules: AdminModule[] = [
  { id: 2, name: 'Oral Health', slug: 'oral-health', description: null, icon: null, is_active: true, sort_order: 2 },
  { id: 1, name: 'Patient Information', slug: 'patient-info', description: null, icon: null, is_active: true, sort_order: 1 },
];

let permission = applyPermissionToggle(emptyModulePermissions(), 'can_create', true);
assert.equal(permission.can_create, true);
assert.equal(permission.can_view, true, 'Create must automatically enable view.');

permission = applyPermissionToggle(permission, 'can_edit', true);
permission = applyPermissionToggle(permission, 'can_view', false);
assert.equal(permission.can_create, false, 'Removing view must remove create.');
assert.equal(permission.can_edit, false, 'Removing view must remove edit.');

permission = applyPermissionToggle(emptyModulePermissions(), 'can_export', true);
assert.equal(permission.can_view, true, 'Export must establish a valid view or report dependency.');
permission = applyPermissionToggle(permission, 'can_report', true);
permission = applyPermissionToggle(permission, 'can_view', false);
assert.equal(permission.can_export, true, 'Report access may retain export without view.');
permission = applyPermissionToggle(permission, 'can_report', false);
assert.equal(permission.can_export, false, 'Removing the last export dependency must remove export.');

assert.equal(
  validateModulePermission('oral-health', 'school_staff', {
    ...emptyModulePermissions(), can_approve_registration: true,
  }).length,
  1,
);
assert.equal(
  validateModulePermission('patient-info', 'superuser', {
    ...emptyModulePermissions(), can_approve_registration: true,
  }).length,
  1,
);
assert.equal(
  validateModulePermission('patient-info', 'school_staff', {
    ...emptyModulePermissions(), can_approve_registration: true,
  }).length,
  0,
);
assert.match(
  validateModulePermission('patient-info', 'school_staff', {
    ...emptyModulePermissions(), can_edit: true,
  })[0] ?? '',
  /require view/i,
);
assert.match(
  validateModulePermission('patient-info', 'school_staff', {
    ...emptyModulePermissions(), can_export: true,
  })[0] ?? '',
  /requires view or report/i,
);
assert.match(
  validateModulePermission('patient-info', 'admin', {
    ...emptyModulePermissions(), can_view: true,
  })[0] ?? '',
  /Administrator accounts cannot receive/i,
);

const grants: AdminModulePermission[] = [{
  module_id: 1,
  module_slug: 'patient-info',
  module_name: 'Patient Information',
  ...emptyModulePermissions(),
  can_view: true,
}];
const draft = buildPermissionDraft(modules, grants);
const payload = buildPermissionPayload(modules, draft);
assert.deepEqual(payload.map((row) => row.module_id), [1], 'Empty module rows must be omitted in module order.');
assert.equal(payload[0]?.can_view, true);

console.log('Phase 4A permission-matrix checks passed.');
