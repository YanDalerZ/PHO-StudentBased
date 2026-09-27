import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import {
    formatSafeDatabaseIdentity, requireDisposableDatabase, verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

process.env.NODE_ENV = 'test';
process.env.PUBLIC_REGISTRATION_ORIGIN ||= 'http://localhost:5173';
process.env.PUBLIC_REGISTRATION_RATE_WINDOW_MS ||= '60000';
process.env.PUBLIC_REGISTRATION_RATE_LIMIT_PER_IP ||= '100';
process.env.PUBLIC_REGISTRATION_RATE_LIMIT_PER_INVITATION ||= '1000';
process.env.PUBLIC_REGISTRATION_MAX_BODY_BYTES ||= '262144';
process.env.PUBLIC_REGISTRATION_PRIVACY_NOTICE ||= 'Synthetic test privacy notice.';
process.env.PUBLIC_REGISTRATION_RETENTION_NOTICE ||= 'Synthetic records are disposed after verification.';
process.env.PUBLIC_REGISTRATION_CONTACT ||= 'test@example.invalid';
const jwtSecret = process.env.JWT_SECRET;
assert.ok(jwtSecret, 'JWT_SECRET is required.');
const { app } = await import('../index.js');

const policy = requireDisposableDatabase();
const identity = await verifyConnectedDatabaseIdentity(pool, policy);
console.log(`Verified disposable PostgreSQL target: ${formatSafeDatabaseIdentity(identity)}`);

const stamp = Date.now();
const lrn = (sequence: number) => `8${String(stamp).slice(-8)}${String(sequence).padStart(3, '0')}`;
const userIds: number[] = [];
const studentIds: number[] = [];
const submissionIds: number[] = [];
let invitationId: number | null = null;
let server: http.Server | null = null;

interface ApiResult {
    status: number;
    body: {
        data?: Record<string, unknown> | Array<Record<string, unknown>>;
        error?: { code?: string; message?: string };
        meta?: Record<string, unknown>;
    };
}

try {
    const fixtures = await pool.query<{ admin_id: number; module_id: number; school_a: number; school_b: number }>(`
        SELECT
            (SELECT id FROM USERS WHERE portal_role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1) AS admin_id,
            (SELECT id FROM MODULES WHERE slug = 'patient-info' AND is_active = TRUE) AS module_id,
            (SELECT id FROM SCHOOLS WHERE is_active = TRUE ORDER BY id LIMIT 1) AS school_a,
            (SELECT id FROM SCHOOLS WHERE is_active = TRUE ORDER BY id OFFSET 1 LIMIT 1) AS school_b
    `);
    const fixture = fixtures.rows[0];
    assert.ok(fixture?.admin_id && fixture.module_id && fixture.school_a && fixture.school_b, 'Two active schools and Phase 1 fixtures are required.');

    const createReviewer = async (schoolId: number, suffix: string) => {
        const email = `phase2_review_${suffix}_${stamp}@test.invalid`;
        const result = await pool.query<{ id: number }>(`
            INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
            VALUES ($1, 'not-used', 'teacher', 'school_staff', 'Review Tester', 'Phase', 'Two', TRUE)
            RETURNING id
        `, [email]);
        const id = result.rows[0]!.id;
        userIds.push(id);
        await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)', [id, schoolId, fixture.admin_id]);
        await pool.query(`
            INSERT INTO USER_MODULE_PERMISSIONS
                (user_id, module_id, can_view, can_create, can_edit, can_approve_registration,
                 can_report, can_export, granted_by)
            VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, $3)
        `, [id, fixture.module_id, fixture.admin_id]);
        return {
            id, email,
            token: jwt.sign({ id, email, portal_role: 'school_staff' }, jwtSecret, { expiresIn: '10m' }),
        };
    };
    const reviewerA = await createReviewer(fixture.school_a, 'a');
    const reviewerB = await createReviewer(fixture.school_b, 'b');

    const candidate = await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS
            (student_lrn, first_name, last_name, sex, date_of_birth, school_id,
             grade_level, section, parent_guardian_name, parent_guardian_contact, registered_by)
        VALUES ($1, 'Maria', 'Santos', 'Female', '2012-04-05', $2,
                'Grade 7', 'Existing', 'Original Guardian', '09171111111', $3)
        RETURNING id
    `, [lrn(1), fixture.school_a, reviewerA.id]);
    const candidateId = candidate.rows[0]!.id;
    studentIds.push(candidateId);
    const crossSchool = await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS
            (student_lrn, first_name, last_name, sex, date_of_birth, school_id, registered_by)
        VALUES ($1, 'Maria', 'Santos', 'Female', '2012-04-05', $2, $3)
        RETURNING id
    `, [lrn(2), fixture.school_b, reviewerB.id]);
    studentIds.push(crossSchool.rows[0]!.id);

    const invitation = await pool.query<{ id: number }>(`
        INSERT INTO REGISTRATION_INVITATIONS
            (token_hash, school_id, created_by, expires_at, status, submission_limit, submission_count)
        VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', 'revoked', 20, 0)
        RETURNING id
    `, [crypto.createHash('sha256').update(`review-${stamp}`).digest('hex'), fixture.school_a, reviewerA.id]);
    invitationId = invitation.rows[0]!.id;
    const payload = (studentLrn: string, firstName: string, lastName = 'Santos') => ({
        student_lrn: studentLrn, first_name: firstName, last_name: lastName,
        date_of_birth: '2012-04-05', sex: 'Female',
        municipality_id: 1, barangay_id: 1, grade_level: 'Grade 8', section: 'Submitted',
        parent_guardian_name: 'Submitted Guardian', parent_guardian_contact: '09172222222',
        guardian_consent: true, privacy_notice_version: 'v1',
    });
    const insertSubmission = async (body: ReturnType<typeof payload>) => {
        const result = await pool.query<{ id: number }>(`
            INSERT INTO REGISTRATION_SUBMISSIONS
                (invitation_id, school_id, payload, payload_schema_version, status,
                 idempotency_key, consent_metadata)
            VALUES ($1, $2, $3, 'v1', 'pending', $4,
                    jsonb_build_object(
                        'guardian_consent', TRUE,
                        'privacy_notice_version', 'v1',
                        'recorded_at', NOW()::text
                    ))
            RETURNING id
        `, [invitationId, fixture.school_a, body, `review-${stamp}-${submissionIds.length}`]);
        submissionIds.push(result.rows[0]!.id);
        return result.rows[0]!.id;
    };
    const probableId = await insertSubmission(payload(lrn(3), ' Maria '));
    const exactId = await insertSubmission(payload(lrn(1), 'Different'));
    const cleanLrn = lrn(4);
    const cleanId = await insertSubmission(payload(cleanLrn, 'Clean', 'Applicant'));
    const rejectId = await insertSubmission(payload(lrn(5), 'Rejected', 'Applicant'));

    server = http.createServer(app);
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/api/v1`;
    const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
    const api = async (path: string, init?: RequestInit): Promise<ApiResult> => {
        const response = await fetch(`${base}${path}`, init);
        return { status: response.status, body: await response.json() as ApiResult['body'] };
    };

    assert.equal((await api('/registration-submissions?status=pending')).status, 401);
    assert.equal((await api(`/registration-submissions/${probableId}`, { headers: headers(reviewerB.token) })).status, 403);
    const otherQueue = await api('/registration-submissions?status=pending', { headers: headers(reviewerB.token) });
    assert.equal(otherQueue.status, 200);
    assert.equal((otherQueue.body.data as Array<Record<string, unknown>>).some(row => row.id === probableId), false);

    const detail = await api(`/registration-submissions/${probableId}`, { headers: headers(reviewerA.token) });
    assert.equal(detail.status, 200);
    const duplicateReview = (detail.body.data as Record<string, unknown>).duplicate_review as {
        has_probable_match: boolean; candidates: Array<{ id: number; confidence: string }>;
    };
    assert.equal(duplicateReview.has_probable_match, true);
    assert.deepEqual(duplicateReview.candidates.map(item => item.id), [candidateId]);
    assert.equal(duplicateReview.candidates[0]?.confidence, 'probable');

    const duplicateQueue = await api('/registration-submissions?status=pending&possible_duplicate=true', { headers: headers(reviewerA.token) });
    assert.equal(duplicateQueue.status, 200);
    assert.equal((duplicateQueue.body.data as Array<Record<string, unknown>>).some(row => row.id === probableId), true);
    assert.ok(Array.isArray(duplicateQueue.body.meta?.rejectionReasons));

    const exactApproval = await api(`/registration-submissions/${exactId}/approve`, {
        method: 'POST', headers: headers(reviewerA.token),
        body: JSON.stringify({ decision: 'new', decision_reason: 'Checked exact LRN.' }),
    });
    assert.equal(exactApproval.status, 409);
    assert.equal(exactApproval.body.error?.code, 'DUPLICATE_LRN');

    const crossSchoolLink = await api(`/registration-submissions/${probableId}/approve`, {
        method: 'POST', headers: headers(reviewerA.token),
        body: JSON.stringify({ decision: 'merge', target_student_id: crossSchool.rows[0]!.id, decision_reason: 'Testing scope.' }),
    });
    assert.equal(crossSchoolLink.status, 409);
    assert.equal(crossSchoolLink.body.error?.code, 'INVALID_MERGE_TARGET');
    const link = await api(`/registration-submissions/${probableId}/approve`, {
        method: 'POST', headers: headers(reviewerA.token),
        body: JSON.stringify({ decision: 'merge', target_student_id: candidateId, decision_reason: 'Name, birth date, and school verified.' }),
    });
    assert.equal(link.status, 200);
    assert.equal((link.body.data as Record<string, unknown>).merge_mode, 'link_only');
    const linkedState = await pool.query<{ first_name: string; section: string; patients: number; events: number; audits: number }>(`
        SELECT st.first_name, st.section,
            (SELECT COUNT(*)::int FROM PATIENT_INFO WHERE student_id = st.id) AS patients,
            (SELECT COUNT(*)::int FROM REGISTRATION_SUBMISSION_EVENTS WHERE submission_id = $2 AND event_type = 'merged') AS events,
            (SELECT COUNT(*)::int FROM AUDIT_EVENTS WHERE actor_id = $3 AND action = 'LINK_REGISTRATION_SUBMISSION' AND entity_id = $2::text) AS audits
        FROM STUDENTS st WHERE st.id = $1
    `, [candidateId, probableId, reviewerA.id]);
    assert.deepEqual(linkedState.rows[0], { first_name: 'Maria', section: 'Existing', patients: 1, events: 1, audits: 1 });

    const approveNew = await api(`/registration-submissions/${cleanId}/approve`, {
        method: 'POST', headers: headers(reviewerA.token),
        body: JSON.stringify({ decision: 'new', decision_reason: 'No duplicate found after review.' }),
    });
    assert.equal(approveNew.status, 200);
    const cleanState = await pool.query<{ students: number; patients: number; audits: number }>(`
        SELECT
            (SELECT COUNT(*)::int FROM STUDENTS WHERE student_lrn = $1 AND grade_level = 'Grade 8' AND section = 'Submitted') AS students,
            (SELECT COUNT(*)::int FROM PATIENT_INFO p JOIN STUDENTS s ON s.id = p.student_id WHERE s.student_lrn = $1) AS patients,
            (SELECT COUNT(*)::int FROM AUDIT_EVENTS WHERE actor_id = $2 AND action = 'APPROVE_REGISTRATION' AND entity_id = $3::text) AS audits
    `, [cleanLrn, reviewerA.id, cleanId]);
    assert.deepEqual(cleanState.rows[0], { students: 1, patients: 1, audits: 1 });
    const cleanStudent = await pool.query<{ id: number }>('SELECT id FROM STUDENTS WHERE student_lrn = $1', [cleanLrn]);
    studentIds.push(cleanStudent.rows[0]!.id);

    const legacyReject = await api(`/registration-submissions/${rejectId}/reject`, {
        method: 'POST', headers: headers(reviewerA.token), body: JSON.stringify({ decision_reason: 'arbitrary' }),
    });
    assert.equal(legacyReject.status, 400);
    const reject = await api(`/registration-submissions/${rejectId}/reject`, {
        method: 'POST', headers: headers(reviewerA.token),
        body: JSON.stringify({ reason_code: 'INCOMPLETE_INFORMATION', reason_note: 'Guardian contact needs verification.' }),
    });
    assert.equal(reject.status, 200);
    const rejectedState = await pool.query<{ status: string; reason: string; audits: number }>(`
        SELECT r.status, r.decision_reason AS reason,
            (SELECT COUNT(*)::int FROM AUDIT_EVENTS WHERE actor_id = $2 AND action = 'REJECT_REGISTRATION_SUBMISSION' AND entity_id = ($1::int)::text) AS audits
        FROM REGISTRATION_SUBMISSIONS r WHERE r.id = $1::int
    `, [rejectId, reviewerA.id]);
    assert.deepEqual(rejectedState.rows[0], {
        status: 'rejected',
        reason: 'INCOMPLETE_INFORMATION: Guardian contact needs verification.',
        audits: 1,
    });

    console.log('Phase 2 Milestone 4 review workflow checks passed.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (userIds.length > 0) await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
    if (submissionIds.length > 0) {
        await pool.query('DELETE FROM REGISTRATION_SUBMISSION_EVENTS WHERE submission_id = ANY($1::int[])', [submissionIds]);
        await pool.query('DELETE FROM REGISTRATION_SUBMISSIONS WHERE id = ANY($1::int[])', [submissionIds]);
    }
    if (studentIds.length > 0) {
        await pool.query('DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])', [studentIds]);
        await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1::int[])', [studentIds]);
    }
    if (invitationId) await pool.query('DELETE FROM REGISTRATION_INVITATIONS WHERE id = $1', [invitationId]);
    if (userIds.length > 0) {
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    await pool.end();
}
