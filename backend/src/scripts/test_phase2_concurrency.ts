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
const lrn = (sequence: number) => `9${String(stamp).slice(-8)}${String(sequence).padStart(3, '0')}`;
const email = `phase2_concurrency_${stamp}@test.invalid`;
const invitationIds: number[] = [];
const testLrns = [lrn(1), lrn(2), lrn(3), lrn(4), lrn(5), lrn(6), lrn(7)];
let userId: number | null = null;
let server: http.Server | null = null;

interface ApiResult {
    status: number;
    body: { data?: Record<string, unknown>; error?: { code?: string; message?: string } };
}

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
        VALUES ($1, 'not-used', 'teacher', 'school_staff', 'Concurrency Tester', 'Phase', 'Two', TRUE)
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

    const authToken = jwt.sign(
        { id: userId, email, portal_role: 'school_staff' },
        jwtSecret,
        { expiresIn: '10m' },
    );
    server = http.createServer(app);
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/api/v1`;
    const authHeaders = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };

    const api = async (url: string, init?: RequestInit): Promise<ApiResult> => {
        const response = await fetch(url, init);
        return { status: response.status, body: await response.json() as ApiResult['body'] };
    };
    const createInvitation = async (limit = 20): Promise<{ id: number; token: string }> => {
        // Milestone 3 enforces one active invitation per school. Each isolated
        // fixture invitation supersedes the prior one for this disposable test.
        await pool.query(`
            UPDATE REGISTRATION_INVITATIONS
            SET status = 'revoked', revoked_at = NOW(), revocation_reason = 'disposable concurrency fixture rotation'
            WHERE school_id = $1 AND status = 'active'
        `, [fixture.school_id]);
        const result = await api(`${base}/registration-invitations`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ school_id: fixture.school_id, expires_in_days: 1, submission_limit: limit }),
        });
        assert.equal(result.status, 201);
        const id = Number(result.body.data?.id);
        const token = String(result.body.data?.token);
        assert.ok(id > 0 && /^[a-f0-9]{32}$/.test(token));
        invitationIds.push(id);
        return { id, token };
    };
    const payload = (studentLrn: string, firstName = 'Concurrent') => ({
        student_lrn: studentLrn,
        first_name: firstName,
        last_name: 'MilestoneTwo',
        date_of_birth: '2012-03-04',
        sex: 'Female',
        municipality_id: 1,
        barangay_id: 1,
        parent_guardian_name: 'Test Guardian',
        parent_guardian_contact: '09170000000',
        guardian_consent: true,
        privacy_notice_version: 'v1',
    });
    const submit = (token: string, body: ReturnType<typeof payload>, key: string) => api(
        `${base}/public/registration-invitations/${token}/submissions`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
            body: JSON.stringify(body),
        },
    );
    const approve = (submissionId: number) => api(`${base}/registration-submissions/${submissionId}/approve`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ decision: 'new', decision_reason: 'Concurrency verification approval' }),
    });

    // Identical concurrent retries produce one row, event, and usage increment.
    const mainInvitation = await createInvitation();
    const retryKey = `retry-${stamp}`;
    const retryResults = await Promise.all([
        submit(mainInvitation.token, payload(testLrns[0]!), retryKey),
        submit(mainInvitation.token, payload(testLrns[0]!), retryKey),
    ]);
    assert.deepEqual(retryResults.map(result => result.status).sort(), [200, 201]);
    const retryState = await pool.query<{ submissions: number; events: number; usage: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = $1) AS submissions,
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSION_EVENTS e
             JOIN REGISTRATION_SUBMISSIONS r ON r.id = e.submission_id WHERE r.invitation_id = $1) AS events,
            (SELECT submission_count::int FROM REGISTRATION_INVITATIONS WHERE id = $1) AS usage
    `, [mainInvitation.id]);
    assert.deepEqual(retryState.rows[0], { submissions: 1, events: 1, usage: 1 });

    const reusedKey = await submit(mainInvitation.token, payload(testLrns[1]!), retryKey);
    assert.equal(reusedKey.status, 409);
    assert.equal(reusedKey.body.error?.code, 'IDEMPOTENCY_KEY_REUSED');

    // Different keys racing with one LRN produce one pending item and one safe conflict.
    const duplicateResults = await Promise.all([
        submit(mainInvitation.token, payload(testLrns[1]!), `duplicate-a-${stamp}`),
        submit(mainInvitation.token, payload(testLrns[1]!), `duplicate-b-${stamp}`),
    ]);
    assert.deepEqual(duplicateResults.map(result => result.status).sort(), [201, 409]);
    assert.equal(duplicateResults.find(result => result.status === 409)?.body.error?.code, 'SUBMISSION_CONFLICT');
    const pendingDuplicate = await pool.query<{ id: number }>(`
        SELECT id FROM REGISTRATION_SUBMISSIONS
        WHERE invitation_id = $1 AND payload->>'student_lrn' = $2
    `, [mainInvitation.id, testLrns[1]]);
    assert.equal(pendingDuplicate.rowCount, 1);

    // Two reviewers racing on the same item cannot create two official records.
    const submissionId = pendingDuplicate.rows[0]!.id;
    const approvalResults = await Promise.all([approve(submissionId), approve(submissionId)]);
    assert.deepEqual(approvalResults.map(result => result.status).sort(), [200, 409]);
    assert.equal(approvalResults.find(result => result.status === 409)?.body.error?.code, 'ALREADY_REVIEWED');
    const approvedState = await pool.query<{ students: number; patients: number; events: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM STUDENTS WHERE student_lrn = $1) AS students,
            (SELECT COUNT(*)::int FROM PATIENT_INFO p JOIN STUDENTS s ON s.id = p.student_id
             WHERE s.student_lrn = $1) AS patients,
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSION_EVENTS
             WHERE submission_id = $2 AND event_type = 'approved_new') AS events
    `, [testLrns[1], submissionId]);
    assert.deepEqual(approvedState.rows[0], { students: 1, patients: 1, events: 1 });

    // A student accepted after staging wins the uniqueness race; the item remains pending.
    const acceptedRace = await submit(mainInvitation.token, payload(testLrns[2]!), `accepted-race-${stamp}`);
    assert.equal(acceptedRace.status, 201);
    const acceptedSubmission = await pool.query<{ id: number }>(`
        SELECT id FROM REGISTRATION_SUBMISSIONS
        WHERE invitation_id = $1 AND payload->>'student_lrn' = $2
    `, [mainInvitation.id, testLrns[2]]);
    await pool.query(`
        INSERT INTO STUDENTS
            (student_lrn, first_name, last_name, sex, date_of_birth, school_id, registered_by)
        VALUES ($1, 'Accepted', 'Race', 'Female', '2012-03-04', $2, $3)
    `, [testLrns[2], fixture.school_id, userId]);
    const acceptedApproval = await approve(acceptedSubmission.rows[0]!.id);
    assert.equal(acceptedApproval.status, 409);
    assert.equal(acceptedApproval.body.error?.code, 'DUPLICATE_LRN');
    const acceptedStillPending = await pool.query<{ status: string }>(
        'SELECT status FROM REGISTRATION_SUBMISSIONS WHERE id = $1',
        [acceptedSubmission.rows[0]!.id],
    );
    assert.equal(acceptedStillPending.rows[0]?.status, 'pending');

    // A failure after the student insert rolls back student, patient, state, and event changes.
    const rollbackResult = await submit(
        mainInvitation.token,
        payload(testLrns[3]!, 'ForceRollback'),
        `rollback-${stamp}`,
    );
    assert.equal(rollbackResult.status, 201);
    const rollbackSubmission = await pool.query<{ id: number }>(`
        SELECT id FROM REGISTRATION_SUBMISSIONS
        WHERE invitation_id = $1 AND payload->>'student_lrn' = $2
    `, [mainInvitation.id, testLrns[3]]);
    await pool.query('DROP TRIGGER IF EXISTS phase2_test_fail_patient_info ON PATIENT_INFO');
    await pool.query('DROP FUNCTION IF EXISTS phase2_test_fail_patient_info()');
    await pool.query(`
        CREATE FUNCTION phase2_test_fail_patient_info() RETURNS trigger AS $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM STUDENTS
                WHERE id = NEW.student_id
                  AND first_name = 'ForceRollback'
                  AND last_name = 'MilestoneTwo'
            ) THEN
                RAISE EXCEPTION 'forced Phase 2 transaction failure';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    `);
    await pool.query(`
        CREATE TRIGGER phase2_test_fail_patient_info
        BEFORE INSERT ON PATIENT_INFO
        FOR EACH ROW EXECUTE FUNCTION phase2_test_fail_patient_info()
    `);
    const forcedFailure = await approve(rollbackSubmission.rows[0]!.id);
    assert.equal(forcedFailure.status, 500);
    const rollbackState = await pool.query<{ status: string; students: number; approvals: number }>(`
        SELECT
            (SELECT status FROM REGISTRATION_SUBMISSIONS WHERE id = $1) AS status,
            (SELECT COUNT(*)::int FROM STUDENTS WHERE student_lrn = $2) AS students,
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSION_EVENTS
             WHERE submission_id = $1 AND event_type = 'approved_new') AS approvals
    `, [rollbackSubmission.rows[0]!.id, testLrns[3]]);
    assert.deepEqual(rollbackState.rows[0], { status: 'pending', students: 0, approvals: 0 });
    await pool.query('DROP TRIGGER phase2_test_fail_patient_info ON PATIENT_INFO');
    await pool.query('DROP FUNCTION phase2_test_fail_patient_info()');

    // Invitation capacity is serialized with the staged insert and usage count.
    const limitedInvitation = await createInvitation(1);
    const capacityResults = await Promise.all([
        submit(limitedInvitation.token, payload(testLrns[4]!), `capacity-a-${stamp}`),
        submit(limitedInvitation.token, payload(testLrns[5]!), `capacity-b-${stamp}`),
    ]);
    assert.deepEqual(capacityResults.map(result => result.status).sort(), [201, 404]);
    const capacityState = await pool.query<{ rows: number; usage: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = $1) AS rows,
            (SELECT submission_count::int FROM REGISTRATION_INVITATIONS WHERE id = $1) AS usage
    `, [limitedInvitation.id]);
    assert.deepEqual(capacityState.rows[0], { rows: 1, usage: 1 });

    console.log('Phase 2 Milestone 2 concurrency and rollback checks passed.');
} finally {
    if (server) {
        await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
    await pool.query('DROP TRIGGER IF EXISTS phase2_test_fail_patient_info ON PATIENT_INFO');
    await pool.query('DROP FUNCTION IF EXISTS phase2_test_fail_patient_info()');
    if (invitationIds.length > 0) {
        await pool.query(`
            DELETE FROM REGISTRATION_SUBMISSION_EVENTS
            WHERE submission_id IN (
                SELECT id FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = ANY($1::int[])
            )
        `, [invitationIds]);
        await pool.query('DELETE FROM REGISTRATION_SUBMISSIONS WHERE invitation_id = ANY($1::int[])', [invitationIds]);
        await pool.query('DELETE FROM REGISTRATION_INVITATIONS WHERE id = ANY($1::int[])', [invitationIds]);
    }
    await pool.query(`
        DELETE FROM PATIENT_INFO
        WHERE student_id IN (SELECT id FROM STUDENTS WHERE student_lrn = ANY($1::text[]))
    `, [testLrns]);
    await pool.query('DELETE FROM STUDENTS WHERE student_lrn = ANY($1::text[])', [testLrns]);
    if (userId) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = $1', [userId]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM USERS WHERE id = $1', [userId]);
    }
    await pool.end();
}
