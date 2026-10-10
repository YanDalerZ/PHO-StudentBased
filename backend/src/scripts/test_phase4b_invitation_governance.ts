import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { AuditService } from '../services/AuditService.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

process.env.PUBLIC_REGISTRATION_ORIGIN ||= 'http://localhost:5173';
process.env.PUBLIC_REGISTRATION_ALLOWED_ORIGINS = 'http://localhost:5174';
process.env.PUBLIC_REGISTRATION_RATE_WINDOW_MS ||= '60000';
process.env.PUBLIC_REGISTRATION_RATE_LIMIT_PER_IP ||= '100';
process.env.PUBLIC_REGISTRATION_RATE_LIMIT_PER_INVITATION ||= '1000';
process.env.PUBLIC_REGISTRATION_MAX_BODY_BYTES ||= '262144';
process.env.PUBLIC_REGISTRATION_PRIVACY_NOTICE ||= 'Synthetic test privacy notice for disposable data.';
process.env.PUBLIC_REGISTRATION_RETENTION_NOTICE ||= 'Synthetic test records are disposed after verification.';
process.env.PUBLIC_REGISTRATION_CONTACT ||= 'test@example.invalid';

await requireVerifiedTestDatabase(pool);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');
const marker = `phase4b_m5_${Date.now()}`;
const userIds: number[] = [];
let schoolId: number | null = null;
let invitationId: number | null = null;
let server: ReturnType<typeof app.listen> | undefined;
const originalPolicy = (await pool.query<Record<string, unknown>>('SELECT * FROM REGISTRATION_PUBLIC_POLICY WHERE id = 1')).rows[0];
assert.ok(originalPolicy, 'migration 012 must be applied to pho_test first');

try {
    const barangay = (await pool.query<{ id: number }>('SELECT id FROM BARANGAYS ORDER BY id LIMIT 1')).rows[0];
    assert.ok(barangay);
    const school = await pool.query<{ id: number }>(
        'INSERT INTO SCHOOLS (name, barangay_id, is_active) VALUES ($1, $2, TRUE) RETURNING id',
        [`${marker}_school`, barangay.id],
    );
    schoolId = school.rows[0]!.id;
    const users = await pool.query<{ id: number; portal_role: string }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-hash', 'admin', 'admin', 'Administrator', 'QA', 'Admin', TRUE),
               ($2, 'test-hash', 'teacher', 'school_staff', 'Teacher', 'QA', 'Staff', TRUE)
        RETURNING id, portal_role
    `, [`${marker}_admin@pho.test`, `${marker}_staff@pho.test`]);
    const adminId = users.rows.find(row => row.portal_role === 'admin')!.id;
    const staffId = users.rows.find(row => row.portal_role === 'school_staff')!.id;
    userIds.push(adminId, staffId);
    const patientModule = (await pool.query<{ id: number }>(
        "SELECT id FROM MODULES WHERE slug = 'patient-info' AND is_active = TRUE",
    )).rows[0];
    assert.ok(patientModule);
    await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $3)',
        [staffId, schoolId, adminId]);
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS
            (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export, granted_by)
        VALUES ($1, $2, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, $3)
    `, [staffId, patientModule.id, adminId]);

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    const adminToken = jwt.sign({ id: adminId }, secret, { expiresIn: '10m' });
    const staffToken = jwt.sign({ id: staffId }, secret, { expiresIn: '10m' });
    async function request(method: string, path: string, body?: unknown, token = adminToken) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            method, headers: { Authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, json: await response.json() as {
            data?: Record<string, unknown> | Array<Record<string, unknown>>;
            approved_origins?: string[];
            meta?: Record<string, unknown>;
        } };
    }

    const policy = await request('GET', '/api/v1/admin/registration-invitation-policy');
    assert.equal(policy.status, 200);
    const prior = policy.json.data as Record<string, unknown>;
    assert.ok(policy.json.approved_origins?.includes('http://localhost:5174'));
    assert.equal((await request('GET', '/api/admin/registration-invitation-policy', undefined, staffToken)).status, 403);
    const change = { ...prior, origin: 'http://localhost:5174', maxExpiryDays: 2,
        maxSubmissionLimit: 3, privacyNotice: 'Synthetic revised privacy notice for local test users.' };
    assert.equal((await request('PUT', '/api/admin/registration-invitation-policy', {
        ...change, origin: 'https://unapproved.example.invalid',
    })).status, 400);
    assert.equal((await request('PUT', '/api/admin/registration-invitation-policy', {
        ...change, maxBodyBytes: 999999,
    })).status, 400);
    assert.equal((await request('PUT', '/api/admin/registration-invitation-policy', change)).status, 200);
    const after = await request('GET', '/api/v1/admin/registration-invitation-policy');
    assert.equal((after.json.data as Record<string, unknown>).maxExpiryDays, 2);

    const overCap = await request('POST', '/api/v1/registration-invitations', {
        school_id: schoolId, expires_in_days: 3, submission_limit: 3,
    }, staffToken);
    assert.equal(overCap.status, 400);
    const created = await request('POST', '/api/registration-invitations', { school_id: schoolId }, staffToken);
    assert.equal(created.status, 201);
    const invitation = created.json.data as Record<string, unknown>;
    invitationId = Number(invitation.id);
    assert.equal(invitation.submission_limit, 3);
    assert.match(String(invitation.registration_url), /^http:\/\/localhost:5174\/register\/[a-f0-9]{32}$/);
    const publicDetail = await request('GET', `/api/v1/public/registration-invitations/${invitation.token}`, undefined, '');
    assert.equal(publicDetail.status, 200);
    const publicForm = (publicDetail.json.data as Record<string, unknown>).form as Record<string, unknown>;
    assert.equal((publicForm.privacy as Record<string, unknown>).notice, change.privacyNotice);
    const list = await request('GET', `/api/v1/admin/registration-invitations?school_id=${schoolId}`);
    assert.equal(list.status, 200);
    assert.equal((list.json.data as Array<Record<string, unknown>>).length, 1);
    assert.ok(!JSON.stringify(list.json).includes(String(invitation.token)));
    assert.ok(!JSON.stringify(list.json).includes('token_hash'));
    assert.equal((await request('GET', '/api/admin/registration-invitations', undefined, staffToken)).status, 403);

    const originalLog = AuditService.logEvent;
    try {
        AuditService.logEvent = async () => { throw new Error('forced audit failure'); };
        assert.equal((await request('POST', `/api/admin/registration-invitations/${invitationId}/revoke`,
            { reason: 'Test incident' })).status, 500);
        assert.equal((await request('PUT', '/api/admin/registration-invitation-policy', prior)).status, 500);
    } finally { AuditService.logEvent = originalLog; }
    const state = (await pool.query<{ status: string }>(
        'SELECT status FROM REGISTRATION_INVITATIONS WHERE id = $1', [invitationId],
    )).rows[0];
    assert.equal(state?.status, 'active');
    const afterRollback = await request('GET', '/api/admin/registration-invitation-policy');
    assert.equal((afterRollback.json.data as Record<string, unknown>).maxExpiryDays, 2);
    assert.equal((await request('POST', `/api/v1/admin/registration-invitations/${invitationId}/revoke`,
        { reason: '' })).status, 400);
    assert.equal((await request('POST', `/api/v1/admin/registration-invitations/${invitationId}/revoke`,
        { reason: 'Disposable local verification' }, staffToken)).status, 403);
    assert.equal((await request('POST', `/api/v1/admin/registration-invitations/${invitationId}/revoke`,
        { reason: 'Disposable local verification' })).status, 200);
    const audit = await pool.query<{ action: string; details: Record<string, unknown> }>(`
        SELECT action, details FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND entity_type IN ('REGISTRATION_INVITATION', 'REGISTRATION_PUBLIC_POLICY')
        ORDER BY id
    `, [adminId]);
    assert.deepEqual(audit.rows.map(row => row.action), [
        'UPDATE_REGISTRATION_INVITATION_POLICY', 'ADMIN_REVOKE_REGISTRATION_INVITATION',
    ]);
    assert.ok(!JSON.stringify(audit.rows).includes('Synthetic revised privacy notice'));
    assert.ok(!JSON.stringify(audit.rows).includes(String(invitation.token)));
    console.log('Phase 4B Milestone 5 invitation governance HTTP/database checks passed.');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (invitationId) await pool.query('DELETE FROM REGISTRATION_INVITATIONS WHERE id = $1', [invitationId]);
    if (userIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [userIds]);
    }
    await pool.query(`
        UPDATE REGISTRATION_PUBLIC_POLICY SET origin_override = $1, rate_window_ms_override = $2,
            rate_limit_per_ip_override = $3, rate_limit_per_invitation_override = $4,
            max_body_bytes_override = $5, privacy_notice_override = $6,
            retention_notice_override = $7, contact_override = $8,
            max_expiry_days = $9, max_submission_limit = $10,
            updated_by = $11, updated_at = $12 WHERE id = 1
    `, [originalPolicy.origin_override, originalPolicy.rate_window_ms_override,
        originalPolicy.rate_limit_per_ip_override, originalPolicy.rate_limit_per_invitation_override,
        originalPolicy.max_body_bytes_override, originalPolicy.privacy_notice_override,
        originalPolicy.retention_notice_override, originalPolicy.contact_override,
        originalPolicy.max_expiry_days, originalPolicy.max_submission_limit,
        originalPolicy.updated_by, originalPolicy.updated_at]);
    if (schoolId) await pool.query('DELETE FROM SCHOOLS WHERE id = $1', [schoolId]);
    if (userIds.length) await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    await pool.end();
}
