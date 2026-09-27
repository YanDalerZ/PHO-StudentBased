import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

process.env.NODE_ENV = 'test';
process.env.PUBLIC_REGISTRATION_ORIGIN ||= 'http://localhost:5173';
process.env.PUBLIC_REGISTRATION_RATE_WINDOW_MS ||= '60000';
process.env.PUBLIC_REGISTRATION_RATE_LIMIT_PER_IP ||= '100';
process.env.PUBLIC_REGISTRATION_RATE_LIMIT_PER_INVITATION ||= '1000';
process.env.PUBLIC_REGISTRATION_MAX_BODY_BYTES ||= '262144';
process.env.PUBLIC_REGISTRATION_PRIVACY_NOTICE ||= 'Synthetic test privacy notice for disposable data.';
process.env.PUBLIC_REGISTRATION_RETENTION_NOTICE ||= 'Synthetic test records are disposed after verification.';
process.env.PUBLIC_REGISTRATION_CONTACT ||= 'test@example.invalid';
const jwtSecret = process.env.JWT_SECRET;
assert.ok(jwtSecret, 'JWT_SECRET is required.');
const { app } = await import('../index.js');

const policy = requireDisposableDatabase();
const identity = await verifyConnectedDatabaseIdentity(pool, policy);
console.log(`Verified disposable PostgreSQL target: ${formatSafeDatabaseIdentity(identity)}`);

const stamp = Date.now();
const email = `phase2_contract_${stamp}@test.invalid`;
const lrn = String(stamp).slice(-12).padStart(12, '0');
let userId: number | null = null;
let invitationId: number | null = null;
let server: http.Server | null = null;

try {
    const fixtures = await pool.query<{ admin_id: number; school_id: number; module_id: number }>(`
        SELECT
            (SELECT id FROM USERS WHERE portal_role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1) AS admin_id,
            (SELECT id FROM SCHOOLS WHERE is_active = TRUE ORDER BY id LIMIT 1) AS school_id,
            (SELECT id FROM MODULES WHERE slug = 'patient-info' AND is_active = TRUE) AS module_id
    `);
    const fixture = fixtures.rows[0];
    assert.ok(fixture?.admin_id && fixture.school_id && fixture.module_id, 'Phase 1 fixtures are required.');

    const user = await pool.query<{ id: number }>(`
        INSERT INTO USERS
            (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'not-used', 'teacher', 'school_staff', 'Test Reviewer', 'Phase', 'Two', TRUE)
        RETURNING id
    `, [email]);
    userId = user.rows[0]!.id;
    await pool.query(`
        INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by)
        VALUES ($1, $2, $3)
    `, [userId, fixture.school_id, fixture.admin_id]);
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS
            (user_id, module_id, can_view, can_create, can_edit,
             can_approve_registration, can_report, can_export, granted_by)
        VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, $3)
    `, [userId, fixture.module_id, fixture.admin_id]);

    const token = jwt.sign({ id: userId, email, portal_role: 'school_staff' }, jwtSecret, { expiresIn: '5m' });
    server = http.createServer(app);
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/api/v1`;
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const create = await fetch(`${base}/registration-invitations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ school_id: fixture.school_id, expires_in_days: 1, submission_limit: 5 }),
    });
    assert.equal(create.status, 201);
    const createBody = await create.json() as { data: { id: number; token: string } };
    invitationId = createBody.data.id;
    assert.match(createBody.data.token, /^[a-f0-9]{32}$/);

    const publicDetails = await fetch(`${base}/public/registration-invitations/${createBody.data.token}`);
    assert.equal(publicDetails.status, 200);
    const detailsBody = await publicDetails.json() as { data: Record<string, unknown> };
    assert.deepEqual(Object.keys(detailsBody.data).sort(), ['expires_at', 'form', 'school']);
    assert.equal(JSON.stringify(detailsBody).includes('submission_count'), false);
    assert.equal(JSON.stringify(detailsBody).includes('token_hash'), false);

    const publicPayload = {
        student_lrn: lrn,
        first_name: 'Contract',
        last_name: 'Test',
        date_of_birth: '2012-03-04',
        sex: 'Female',
        municipality_id: 1,
        barangay_id: 1,
        parent_guardian_name: 'Test Guardian',
        parent_guardian_contact: '09170000000',
        guardian_consent: true,
        privacy_notice_version: 'v1',
    };
    const submit = await fetch(`${base}/public/registration-invitations/${createBody.data.token}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `contract-${stamp}` },
        body: JSON.stringify(publicPayload),
    });
    assert.equal(submit.status, 201);
    const receipt = await submit.json() as { data: { status: string; receipt: string } };
    assert.deepEqual(receipt.data, { status: 'pending', receipt: 'Submission received for review' });

    const officialStudent = await pool.query('SELECT id FROM STUDENTS WHERE student_lrn = $1', [lrn]);
    assert.equal(officialStudent.rowCount, 0, 'Public intake must not create an official student.');

    const queue = await fetch(`${base}/registration-submissions?status=pending`, { headers: authHeaders });
    assert.equal(queue.status, 200);
    const queueBody = await queue.json() as {
        data: Array<{ submitted_at?: string; created_at?: string; payload: { student_lrn: string } }>;
        meta: { total: number };
    };
    const staged = queueBody.data.find(item => item.payload.student_lrn === lrn);
    assert.ok(staged?.submitted_at);
    assert.equal(staged.created_at, undefined);
    assert.ok(queueBody.meta.total >= 1);

    console.log('Phase 2 Milestone 1 live contract integration checks passed.');
} finally {
    if (server) {
        await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
    if (invitationId) {
        await pool.query(`
            DELETE FROM REGISTRATION_SUBMISSION_EVENTS
            WHERE submission_id IN (SELECT id FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = $1)
        `, [invitationId]);
        await pool.query('DELETE FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = $1', [invitationId]);
        await pool.query('DELETE FROM REGISTRATION_INVITATIONS WHERE id = $1', [invitationId]);
    }
    if (userId) {
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM USERS WHERE id = $1', [userId]);
    }
    await pool.end();
}
