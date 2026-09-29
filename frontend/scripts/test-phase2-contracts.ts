import assert from 'node:assert/strict';
import { phase2Routes } from '../src/services/phase2Routes.ts';

assert.equal(
    phase2Routes.publicInvitation('abc/123'),
    '/public/registration-invitations/abc%2F123',
);
assert.equal(
    phase2Routes.publicSubmission('token'),
    '/public/registration-invitations/token/submissions',
);
assert.equal(phase2Routes.invitations, '/registration-invitations');
assert.equal(phase2Routes.submissions, '/registration-submissions');
assert.equal(phase2Routes.approveSubmission(7), '/registration-submissions/7/approve');
assert.equal(phase2Routes.rejectSubmission(7), '/registration-submissions/7/reject');

console.log('Frontend Phase 2 API contract checks passed.');
