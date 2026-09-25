import assert from 'node:assert/strict';
import { canWriteModuleRecord, defaultPortalRoute, hasModulePermission } from '../src/lib/access.ts';
import type { EffectiveAccess, User } from '../src/types/index.ts';

const access: EffectiveAccess = {
  assignedSchoolIds: [101],
  modulePermissions: {
    'patient-info': {
      can_view: true,
      can_create: false,
      can_edit: true,
      can_approve_registration: false,
      can_report: false,
      can_export: false,
    },
    'oral-health': {
      can_view: true,
      can_create: true,
      can_edit: false,
      can_approve_registration: false,
      can_report: false,
      can_export: false,
    },
  },
};

assert.equal(hasModulePermission(access, 'patient-info', 'can_view'), true);
assert.equal(hasModulePermission(access, 'patient-info', 'can_create'), false);
assert.equal(hasModulePermission(access, 'deworming', 'can_view'), false);
assert.equal(hasModulePermission(null, 'patient-info', 'can_view'), false);
assert.equal(canWriteModuleRecord(access, 'oral-health', false), true);
assert.equal(canWriteModuleRecord(access, 'oral-health', true), false);
assert.equal(canWriteModuleRecord(access, 'patient-info', false), false);
assert.equal(canWriteModuleRecord(access, 'patient-info', true), true);
const staffUser: User = {
  id: 1, email: 'staff@example.invalid', portal_role: 'school_staff', job_title: 'Nurse',
  first_name: 'Test', last_name: 'Staff',
};
const superUser: User = { ...staffUser, id: 2, portal_role: 'superuser' };
const adminUser: User = { ...staffUser, id: 3, portal_role: 'admin' };
assert.equal(defaultPortalRoute(staffUser, access), '/teacher/dashboard');
assert.equal(defaultPortalRoute(staffUser, null), '/forbidden');
assert.equal(defaultPortalRoute(superUser, access), '/superuser/dashboard');
assert.equal(defaultPortalRoute(superUser, {
  assignedSchoolIds: [], modulePermissions: { 'oral-health': access.modulePermissions['oral-health'] },
}), '/superuser/oral-health');
assert.equal(defaultPortalRoute(adminUser, null), '/admin/dashboard');

const browserEvents = new EventTarget();
const storage = new Map<string, string>([['token', 'test-token'], ['user', '{}']]);
const browserLocation = { hostname: 'localhost', href: '' };

Object.assign(globalThis, {
  window: Object.assign(browserEvents, { location: browserLocation }),
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

const { default: api, createOralHealth } = await import('../src/services/api.ts');

api.defaults.adapter = async (config) => Promise.reject({ response: { status: 403 }, config });
await assert.rejects(() => api.get('/protected'));
assert.equal(storage.get('token'), 'test-token', 'A 403 must not end or refresh the authenticated session.');

let capturedBody = '';
api.defaults.adapter = async (config) => {
  capturedBody = String(config.data ?? '');
  return { data: { data: {} }, status: 201, statusText: 'Created', headers: {}, config };
};
await createOralHealth({ student_id: 55, date_examined: '2026-09-24' });
const oralPayload = JSON.parse(capturedBody) as Record<string, unknown>;
assert.equal(oralPayload.student_id, 55);
assert.equal('school_id' in oralPayload, false, 'Oral Health creation must remain valid without a body school_id.');

console.log('Frontend effective-access checks passed.');
