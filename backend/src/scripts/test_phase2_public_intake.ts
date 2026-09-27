import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { formatSafeDatabaseIdentity, requireDisposableDatabase, verifyConnectedDatabaseIdentity } from '../utils/testGuard.js';

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
const email = `phase2_public_${stamp}@test.invalid`;
const lrn = String(stamp).slice(-12).padStart(12, '0');
let userId: number | null = null;
let invitationId: number | null = null;
let submissionId: number | null = null;
let server: http.Server | null = null;

try {
    const fixtureResult = await pool.query<{ admin_id: number; school_id: number; module_id: number }>(`
        SELECT
            (SELECT id FROM USERS WHERE portal_role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1) AS admin_id,
            (SELECT id FROM SCHOOLS WHERE is_active = TRUE ORDER BY id LIMIT 1) AS school_id,
            (SELECT id FROM MODULES WHERE slug = 'patient-info' AND is_active = TRUE) AS module_id
    `);
    const fixture = fixtureResult.rows[0];
    assert.ok(fixture?.admin_id && fixture.school_id && fixture.module_id);
    await pool.query(`UPDATE REGISTRATION_INVITATIONS SET status = 'revoked', revoked_at = NOW(), revocation_reason = 'public intake disposable fixture rotation' WHERE school_id = $1 AND status = 'active'`, [fixture.school_id]);

    const user = await pool.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'not-used', 'teacher', 'school_staff', 'Public Intake Tester', 'Phase', 'Three', TRUE)
        RETURNING id
    `, [email]);
    userId = user.rows[0]!.id;
    await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)', [userId, fixture.school_id, fixture.admin_id]);
    await pool.query(`INSERT INTO USER_MODULE_PERMISSIONS (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export, granted_by) VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, $3)`, [userId, fixture.module_id, fixture.admin_id]);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}/api/v1`;
    const auth = jwt.sign({ id: userId, email, portal_role: 'school_staff' }, jwtSecret, { expiresIn: '5m' });
    const authHeaders = { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' };

    const create = await fetch(`${base}/registration-invitations`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ school_id: fixture.school_id, expires_in_days: 1, submission_limit: 5 }) });
    assert.equal(create.status, 201);
    const created = await create.json() as { data: { id: number; token: string; registration_url: string } };
    invitationId = created.data.id;
    assert.match(created.data.token, /^[a-f0-9]{32}$/);
    assert.equal(created.data.registration_url, `${process.env.PUBLIC_REGISTRATION_ORIGIN}/register/${created.data.token}`);

    const second = await fetch(`${base}/registration-invitations`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ school_id: fixture.school_id }) });
    assert.equal(second.status, 409);

    const details = await fetch(`${base}/public/registration-invitations/${created.data.token}`);
    assert.equal(details.status, 200);
    assert.equal(details.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(details.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(details.headers.get('referrer-policy'), 'no-referrer');
    const detailBody = await details.json() as { data: { school: Record<string, unknown>; form: { privacy: { notice: string } } } };
    assert.equal('submission_count' in detailBody.data.school, false);
    assert.ok(detailBody.data.form.privacy.notice);

    const payload = { student_lrn: lrn, first_name: 'Public', last_name: 'Intake', date_of_birth: '2012-03-04', sex: 'Female', municipality_id: 1, barangay_id: 1, parent_guardian_name: 'Test Guardian', parent_guardian_contact: '09170000000', guardian_consent: true, privacy_notice_version: 'v1' };
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': `public-${stamp}` };
    const submit = await fetch(`${base}/public/registration-invitations/${created.data.token}/submissions`, { method: 'POST', headers, body: JSON.stringify(payload) });
    assert.equal(submit.status, 201);
    const replay = await fetch(`${base}/public/registration-invitations/${created.data.token}/submissions`, { method: 'POST', headers, body: JSON.stringify(payload) });
    assert.equal(replay.status, 200);
    const staged = await pool.query<{ id: number; consent_metadata: { guardian_consent: boolean; privacy_notice_version: string } }>('SELECT id, consent_metadata FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = $1 AND payload->>\'student_lrn\' = $2', [invitationId, lrn]);
    assert.equal(staged.rowCount, 1);
    submissionId = staged.rows[0]!.id;
    assert.deepEqual(staged.rows[0]!.consent_metadata.guardian_consent, true);
    assert.equal(staged.rows[0]!.consent_metadata.privacy_notice_version, 'v1');
    const official = await pool.query('SELECT 1 FROM STUDENTS WHERE student_lrn = $1', [lrn]);
    assert.equal(official.rowCount, 0);

    const revoke = await fetch(`${base}/registration-invitations/${invitationId}/revoke`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ reason: 'disposable verification complete' }) });
    assert.equal(revoke.status, 200);
    const unavailable = await fetch(`${base}/public/registration-invitations/${created.data.token}`);
    assert.equal(unavailable.status, 404);
    assert.equal((await unavailable.json() as { error: { code: string } }).error.code, 'INVITATION_UNAVAILABLE');
    console.log('Phase 2 Milestone 3 public intake checks passed.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (submissionId) await pool.query('DELETE FROM REGISTRATION_SUBMISSION_EVENTS WHERE submission_id = $1', [submissionId]);
    if (invitationId) {
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
