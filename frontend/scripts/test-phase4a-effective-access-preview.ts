import assert from 'node:assert/strict';
import {
  getAccessReadiness,
  withDraftModulePermissions,
  withDraftSchoolScope,
} from '../src/lib/effectiveAccessPreview.ts';
import { emptyModulePermissions } from '../src/lib/permissionMatrix.ts';
import type { AdminModule, EffectiveAccess } from '../src/types/index.ts';

const base: EffectiveAccess = {
  assignedSchoolIds: [],
  modulePermissions: {
    'patient-info': emptyModulePermissions(),
    'oral-health': emptyModulePermissions(),
    deworming: emptyModulePermissions(),
    immunization: emptyModulePermissions(),
    'vital-signs': emptyModulePermissions(),
  },
};

const scoped = withDraftSchoolScope(base, [9, 3, 9]);
assert.deepEqual(scoped.assignedSchoolIds, [3, 9]);
assert.deepEqual(base.assignedSchoolIds, [], 'Draft school preview must not mutate persisted access.');

assert.equal(getAccessReadiness('school_staff', scoped).code, 'missing_portal_module');

const modules: AdminModule[] = [{
  id: 1,
  name: 'Patient Information',
  slug: 'patient-info',
  description: null,
  icon: null,
  is_active: true,
  sort_order: 1,
}];
const teacherReady = withDraftModulePermissions(scoped, modules, {
  1: { ...emptyModulePermissions(), can_view: true },
});
assert.equal(getAccessReadiness('school_staff', teacherReady).code, 'ready');
assert.equal(base.modulePermissions['patient-info']?.can_view, false, 'Draft permissions must not mutate persisted access.');

const noSchool = withDraftSchoolScope(teacherReady, []);
assert.equal(getAccessReadiness('school_staff', noSchool).code, 'missing_school_scope');
assert.equal(getAccessReadiness('superuser', base).code, 'missing_portal_module');
assert.equal(getAccessReadiness('superuser', teacherReady).code, 'ready');
assert.equal(getAccessReadiness('admin', base).code, 'management_only');

console.log('Phase 4A effective-access preview checks passed.');
