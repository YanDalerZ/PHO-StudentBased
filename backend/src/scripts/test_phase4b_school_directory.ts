import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { AuditService } from '../services/AuditService.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');

const marker = `phase4b_m3_${Date.now()}`;
const actorEmail = `${marker}_admin@pho.test`;
const staffEmail = `${marker}_staff@pho.test`;
const schoolName = `${marker}_school`;
const rollbackName = `${marker}_rollback`;
const userIds: number[] = [];
const schoolIds: number[] = [];
let server: ReturnType<typeof app.listen> | undefined;

try {
    const geography = await pool.query<{ id: number; municipality_id: number }>(`
        SELECT b.id, b.municipality_id FROM BARANGAYS b
        JOIN MUNICIPALITIES m ON m.id = b.municipality_id
        ORDER BY b.id
    `);
    const first = geography.rows[0];
    const second = geography.rows.find(row => row.municipality_id !== first?.municipality_id);
    assert.ok(first && second, 'two municipalities with barangays are required');

    const users = await pool.query<{ id: number; portal_role: string }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', 'admin', 'admin', 'QA Administrator', 'QA', 'Admin', TRUE),
               ($2, 'test-only-hash', 'teacher', 'school_staff', 'Teacher', 'QA', 'Staff', TRUE)
        RETURNING id, portal_role
    `, [actorEmail, staffEmail]);
    const actorId = users.rows.find(row => row.portal_role === 'admin')!.id;
    const staffId = users.rows.find(row => row.portal_role === 'school_staff')!.id;
    userIds.push(actorId, staffId);
    const token = jwt.sign({ id: actorId }, secret, { expiresIn: '10m' });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;

    async function request(method: string, path: string, body?: unknown, auth = token) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${auth}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, json: await response.json() as { data?: Record<string, unknown> } };
    }

    const base = { name: schoolName, barangay_id: first.id, municipality_id: first.municipality_id, is_active: true };
    assert.equal((await request('POST', '/api/v1/admin/schools', {
        ...base, municipality_id: second.municipality_id,
    })).status, 400);
    assert.equal((await request('POST', '/api/admin/schools', base, '')).status, 401);
    assert.equal((await request('POST', '/api/admin/schools', { ...base, name: rollbackName }, jwt.sign({ id: staffId }, secret))).status, 403);

    const created = await request('POST', '/api/v1/admin/schools', base);
    assert.equal(created.status, 201);
    const schoolId = Number(created.json.data?.id);
    assert.ok(schoolId > 0);
    schoolIds.push(schoolId);
    assert.equal(created.json.data?.municipality_id, first.municipality_id);
    assert.equal((await request('PUT', `/api/admin/schools/${schoolId}abc`, { name: 'Invalid' })).status, 400);
    assert.equal((await request('PUT', `/api/admin/schools/${schoolId}`, {
        municipality_id: second.municipality_id,
    })).status, 400, 'municipality-only edits must match the existing barangay');
    assert.equal((await request('PUT', `/api/admin/schools/${schoolId}`, {
        barangay_id: second.id, municipality_id: first.municipality_id,
    })).status, 400);
    const moved = await request('PUT', `/api/admin/schools/${schoolId}`, {
        barangay_id: second.id, municipality_id: second.municipality_id, address: 'QA address',
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.json.data?.municipality_id, second.municipality_id);

    const assignment = await request('PUT', `/api/v1/admin/users/${staffId}/school-assignments`, { school_ids: [schoolId] });
    assert.equal(assignment.status, 200);
    const invitation = await pool.query<{ id: number }>(`
        INSERT INTO REGISTRATION_INVITATIONS
          (token_hash, school_id, created_by, expires_at, status, submission_limit, submission_count)
        VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', 'active', 100, 0)
        RETURNING id
    `, [crypto.createHash('sha256').update(marker).digest('hex'), schoolId, staffId]);
    assert.ok(invitation.rows[0]?.id);

    const auditBeforeFailure = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM AUDIT_EVENTS WHERE school_id = $1", [schoolId],
    );
    const originalLog = AuditService.logEvent;
    try {
        AuditService.logEvent = async () => { throw new Error('forced audit failure'); };
        assert.equal((await request('PUT', `/api/v1/admin/schools/${schoolId}`, { is_active: false })).status, 500);
        assert.equal((await request('PUT', `/api/v1/admin/schools/${schoolId}`, {
            barangay_id: first.id, municipality_id: first.municipality_id, address: 'Should roll back',
        })).status, 500);
        assert.equal((await request('POST', '/api/v1/admin/schools', { ...base, name: rollbackName })).status, 500);
    } finally {
        AuditService.logEvent = originalLog;
    }
    const before = await pool.query<{ active: boolean; barangay_id: number; address: string; assignment_count: number; invitation_status: string; audit_count: number; failed_create_count: number }>(`
        SELECT (SELECT is_active FROM SCHOOLS WHERE id = $1) AS active,
               (SELECT barangay_id FROM SCHOOLS WHERE id = $1) AS barangay_id,
               (SELECT address FROM SCHOOLS WHERE id = $1) AS address,
               (SELECT COUNT(*)::int FROM USER_SCHOOL_ASSIGNMENTS WHERE school_id = $1 AND revoked_at IS NULL) AS assignment_count,
               (SELECT status FROM REGISTRATION_INVITATIONS WHERE school_id = $1) AS invitation_status,
               (SELECT COUNT(*)::int FROM AUDIT_EVENTS WHERE school_id = $1) AS audit_count,
               (SELECT COUNT(*)::int FROM SCHOOLS WHERE name = $2) AS failed_create_count
    `, [schoolId, rollbackName]);
    assert.equal(before.rows[0]?.active, true);
    assert.equal(before.rows[0]?.barangay_id, second.id);
    assert.equal(before.rows[0]?.address, 'QA address');
    assert.equal(before.rows[0]?.assignment_count, 1);
    assert.equal(before.rows[0]?.invitation_status, 'active');
    assert.equal(before.rows[0]?.audit_count, auditBeforeFailure.rows[0]?.count);
    assert.equal(before.rows[0]?.failed_create_count, 0);

    const deactivated = await request('PUT', `/api/admin/schools/${schoolId}`, { is_active: false });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.json.data?.is_active, false);
    const effects = await pool.query<{ assignment_count: number; invitation_status: string; revoked_by: number; assignment_revoker: number }>(`
        SELECT (SELECT COUNT(*)::int FROM USER_SCHOOL_ASSIGNMENTS WHERE school_id = $1 AND revoked_at IS NULL) AS assignment_count,
               (SELECT status FROM REGISTRATION_INVITATIONS WHERE school_id = $1) AS invitation_status,
               (SELECT revoked_by FROM REGISTRATION_INVITATIONS WHERE school_id = $1) AS revoked_by,
               (SELECT revoked_by FROM USER_SCHOOL_ASSIGNMENTS WHERE school_id = $1 ORDER BY id DESC LIMIT 1) AS assignment_revoker
    `, [schoolId]);
    assert.equal(effects.rows[0]?.assignment_count, 0);
    assert.equal(effects.rows[0]?.invitation_status, 'revoked');
    assert.equal(effects.rows[0]?.revoked_by, actorId);
    assert.equal(effects.rows[0]?.assignment_revoker, actorId);
    assert.equal((await request('PUT', `/api/admin/users/${staffId}/school-assignments`, { school_ids: [schoolId] })).status, 400);

    const reactivated = await request('PUT', `/api/v1/admin/schools/${schoolId}`, { is_active: true });
    assert.equal(reactivated.status, 200);
    const afterActivation = await pool.query<{ assignments: number; invitations: number }>(`
        SELECT (SELECT COUNT(*)::int FROM USER_SCHOOL_ASSIGNMENTS WHERE school_id = $1 AND revoked_at IS NULL) AS assignments,
               (SELECT COUNT(*)::int FROM REGISTRATION_INVITATIONS WHERE school_id = $1 AND status = 'active') AS invitations
    `, [schoolId]);
    assert.equal(afterActivation.rows[0]?.assignments, 0);
    assert.equal(afterActivation.rows[0]?.invitations, 0);

    const audits = await pool.query<{ action: string; actor_id: number; details: unknown; ip_address: string | null }>(`
        SELECT action, actor_id, details, ip_address FROM AUDIT_EVENTS
        WHERE entity_type = 'SCHOOL' AND entity_id = $1 ORDER BY id
    `, [String(schoolId)]);
    assert.deepEqual(audits.rows.map(row => row.action), [
        'CREATE_SCHOOL', 'UPDATE_SCHOOL', 'DEACTIVATE_SCHOOL', 'UPDATE_SCHOOL',
    ]);
    for (const row of audits.rows) {
        assert.equal(row.actor_id, actorId);
        assert.ok(row.ip_address);
        assert.doesNotMatch(JSON.stringify(row.details), /QA address|phase4b_m3|token_hash/i);
    }
    console.log('Phase 4B Milestone 3 school directory HTTP/database checks passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    const discoveredSchools = await pool.query<{ id: number }>(
        'SELECT id FROM SCHOOLS WHERE name = ANY($1::text[])', [[schoolName, rollbackName]],
    );
    for (const row of discoveredSchools.rows) if (!schoolIds.includes(row.id)) schoolIds.push(row.id);
    const discoveredUsers = await pool.query<{ id: number }>(
        'SELECT id FROM USERS WHERE email = ANY($1::text[])', [[actorEmail, staffEmail]],
    );
    for (const row of discoveredUsers.rows) if (!userIds.includes(row.id)) userIds.push(row.id);
    if (schoolIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE school_id = ANY($1::int[]) OR (entity_type = $2 AND entity_id = ANY($3::text[]))',
            [schoolIds, 'SCHOOL', schoolIds.map(String)]);
        await pool.query('DELETE FROM REGISTRATION_INVITATIONS WHERE school_id = ANY($1::int[])', [schoolIds]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE school_id = ANY($1::int[])', [schoolIds]);
        await pool.query('DELETE FROM SCHOOLS WHERE id = ANY($1::int[])', [schoolIds]);
    }
    if (userIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[]) OR (entity_type = $2 AND entity_id = ANY($3::text[]))',
            [userIds, 'USER', userIds.map(String)]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    const residual = await pool.query<{ users: number; schools: number }>(`
        SELECT (SELECT COUNT(*)::int FROM USERS WHERE email = ANY($1::text[])) AS users,
               (SELECT COUNT(*)::int FROM SCHOOLS WHERE name = ANY($2::text[])) AS schools
    `, [[actorEmail, staffEmail], [schoolName, rollbackName]]);
    assert.equal(residual.rows[0]?.users, 0);
    assert.equal(residual.rows[0]?.schools, 0);
    await pool.end();
}
