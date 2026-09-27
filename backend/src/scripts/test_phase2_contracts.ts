import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
    publicRegistrationPayloadSchema,
    rejectionDecisionSchema,
    submissionDecisionSchema,
} from '../types/registration.types.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'phase2-contract-test-secret';
const { app } = await import('../index.js');

const validPublicPayload = {
    student_lrn: '123456789012',
    first_name: 'Test',
    last_name: 'Student',
    date_of_birth: '2012-03-04',
    sex: 'Female' as const,
    municipality_id: 1,
    barangay_id: 1,
    parent_guardian_name: 'Test Guardian',
    parent_guardian_contact: '09170000000',
    guardian_consent: true as const,
    privacy_notice_version: 'v1' as const,
};

assert.equal(publicRegistrationPayloadSchema.safeParse(validPublicPayload).success, true);
assert.equal(publicRegistrationPayloadSchema.safeParse({
    ...validPublicPayload,
    school_id: 999,
}).success, false, 'Public callers must not choose the invitation-bound school.');
assert.equal(publicRegistrationPayloadSchema.safeParse({
    ...validPublicPayload,
    guardian_consent: false,
}).success, false, 'Guardian consent must be explicit.');
assert.equal(publicRegistrationPayloadSchema.safeParse({
    ...validPublicPayload,
    reviewed_by: 1,
}).success, false, 'Reviewer fields must not be accepted from public callers.');
assert.equal(submissionDecisionSchema.safeParse({ decision: 'new' }).success, false);
assert.equal(submissionDecisionSchema.safeParse({
    decision: 'merge', target_student_id: 4, decision_reason: 'Confirmed duplicate',
}).success, true);
assert.equal(rejectionDecisionSchema.safeParse({
    reason_code: 'INCOMPLETE_INFORMATION',
}).success, true);
assert.equal(rejectionDecisionSchema.safeParse({
    reason_code: 'OTHER',
}).success, false, 'Other requires a reviewer note.');
assert.equal(rejectionDecisionSchema.safeParse({
    decision_reason: 'Uncontrolled legacy reason',
}).success, false, 'Rejections must use a controlled reason code.');

const currentFile = fileURLToPath(import.meta.url);
const migrationPath = path.resolve(path.dirname(currentFile), '../../database/migrations/008_v5_phase2_contract_reconciliation.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
assert.match(migration, /payload_object_v5/);
assert.match(migration, /school_id, status, submitted_at DESC/);

const server = http.createServer(app);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as AddressInfo;
const errorCode = async (response: Response): Promise<string | undefined> => {
    const body = await response.json() as { error?: { code?: string } };
    return body.error?.code;
};

try {
    for (const prefix of ['/api', '/api/v1']) {
        const invalidToken = await fetch(`http://127.0.0.1:${port}${prefix}/public/registration-invitations/not-a-token`);
        assert.equal(invalidToken.status, 404);
        assert.equal(await errorCode(invalidToken), 'INVITATION_UNAVAILABLE');

        const invalidPublicBody = await fetch(
            `http://127.0.0.1:${port}${prefix}/public/registration-invitations/0123456789abcdef0123456789abcdef/submissions`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...validPublicPayload, school_id: 999 }),
            },
        );
        assert.equal(invalidPublicBody.status, 400);
        assert.equal(await errorCode(invalidPublicBody), 'VALIDATION_ERROR');

        for (const request of [
            fetch(`http://127.0.0.1:${port}${prefix}/registration-invitations`),
            fetch(`http://127.0.0.1:${port}${prefix}/registration-submissions`),
            fetch(`http://127.0.0.1:${port}${prefix}/registration-submissions/1`),
            fetch(`http://127.0.0.1:${port}${prefix}/registration-submissions/1/approve`, { method: 'POST' }),
            fetch(`http://127.0.0.1:${port}${prefix}/registration-submissions/1/reject`, { method: 'POST' }),
        ]) {
            assert.equal((await request).status, 401, `Protected Phase 2 route under ${prefix} must require authentication.`);
        }
    }

    const legacyPath = await fetch(`http://127.0.0.1:${port}/api/registration/public/invitations/not-a-token`);
    assert.equal(legacyPath.status, 404, 'The undocumented nested registration path must not be mounted.');
    console.log('Phase 2 Milestone 1 API and schema contract checks passed.');
} finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

