import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { AuditService } from '../services/AuditService.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');

const stamp = Date.now();
const userIds: number[] = [];
const actorEmail = `phase4b_m2_actor_${stamp}@pho.test`;
const targetEmail = `phase4b_m2_staff_${stamp}@pho.test`;
const rollbackEmail = `phase4b_m2_rollback_${stamp}@pho.test`;
let server: ReturnType<typeof app.listen> | undefined;

try {
    const actor = await pool.query<{ id: number }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', 'admin', 'admin', 'QA Administrator', 'QA', 'Actor', TRUE)
        RETURNING id
    `, [actorEmail]);
    const actorId = actor.rows[0]!.id;
    userIds.push(actorId);
    const actorToken = jwt.sign({ id: actorId }, secret, { expiresIn: '10m' });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;

    async function request(method: string, path: string, body?: unknown, token = actorToken) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, json: await response.json() as { data?: Record<string, unknown>; error?: unknown } };
    }

    const base = {
        email: targetEmail,
        password: 'test-only-password-123',
        portal_role: 'school_staff',
        first_name: 'QA',
        last_name: 'Lifecycle',
    };
    assert.equal((await request('POST', '/api/v1/admin/users', base)).status, 400, 'title is required');
    assert.equal((await request('POST', '/api/admin/users', { ...base, portal_role: 'admin', job_title: 'Administrator' })).status, 400);
    const created = await request('POST', '/api/v1/admin/users', { ...base, job_title: 'Doctor' });
    assert.equal(created.status, 201);
    const targetId = Number(created.json.data?.id);
    assert.ok(targetId > 0);
    userIds.push(targetId);
    assert.equal(created.json.data?.job_title, 'Doctor');
    assert.equal(created.json.data?.portal_role, 'school_staff');
    assert.equal((await request('PUT', `/api/admin/users/${targetId}oops`, { job_title: 'Teacher' })).status, 400);
    assert.equal((await request('PUT', `/api/admin/users/${actorId}`, { job_title: 'Changed' })).status, 400);
    assert.equal((await request('PATCH', `/api/admin/users/${actorId}/status`, { action: 'deactivate' })).status, 400);

    const module = await pool.query<{ id: number }>("SELECT id FROM MODULES WHERE slug = 'patient-info' LIMIT 1");
    const school = await pool.query<{ id: number }>('SELECT id FROM SCHOOLS WHERE is_active = TRUE ORDER BY id LIMIT 1');
    assert.ok(module.rows[0] && school.rows[0], 'approved local fixtures require one module and active school');
    const grant = await request('PUT', `/api/v1/admin/users/${targetId}/module-permissions`, [{
        module_id: module.rows[0].id, can_view: true, can_create: true,
        can_edit: false, can_approve_registration: false, can_report: false, can_export: false,
    }]);
    assert.equal(grant.status, 200);
    const assignment = await request('PUT', `/api/v1/admin/users/${targetId}/school-assignments`, {
        school_ids: [school.rows[0].id],
    });
    assert.equal(assignment.status, 200);

    // An audit failure during a role change must roll back the role, title,
    // school assignment, module grant, and attempted audit event together.
    const auditCountBeforeRoleFailure = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM AUDIT_EVENTS WHERE actor_id = $1 AND entity_type = 'USER' AND entity_id = $2",
        [actorId, String(targetId)],
    );
    const originalRoleLog = AuditService.logEvent;
    try {
        AuditService.logEvent = async () => { throw new Error('forced role-change audit failure'); };
        const failedRoleChange = await request('PUT', `/api/v1/admin/users/${targetId}`, {
            portal_role: 'superuser', job_title: 'School Nurse',
        });
        assert.equal(failedRoleChange.status, 500);
    } finally {
        AuditService.logEvent = originalRoleLog;
    }
    const rolledBackUser = await pool.query<{ portal_role: string; job_title: string }>(
        'SELECT portal_role, job_title FROM USERS WHERE id = $1', [targetId],
    );
    assert.equal(rolledBackUser.rows[0]?.portal_role, 'school_staff');
    assert.equal(rolledBackUser.rows[0]?.job_title, 'Doctor');
    const rolledBackAccess = await pool.query<{ assignments: number; grants: number }>(`
        SELECT (SELECT COUNT(*)::int FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = $1 AND revoked_at IS NULL) AS assignments,
               (SELECT COUNT(*)::int FROM USER_MODULE_PERMISSIONS WHERE user_id = $1 AND revoked_at IS NULL) AS grants
    `, [targetId]);
    assert.equal(rolledBackAccess.rows[0]?.assignments, 1);
    assert.equal(rolledBackAccess.rows[0]?.grants, 1);
    const auditCountAfterRoleFailure = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM AUDIT_EVENTS WHERE actor_id = $1 AND entity_type = 'USER' AND entity_id = $2",
        [actorId, String(targetId)],
    );
    assert.equal(auditCountAfterRoleFailure.rows[0]?.count, auditCountBeforeRoleFailure.rows[0]?.count);
    console.log('Forced role-change audit failure rolled back role, title, active access, and audit event.');

    const changed = await request('PUT', `/api/admin/users/${targetId}`, {
        portal_role: 'superuser', job_title: 'School Nurse',
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.data?.portal_role, 'superuser');
    assert.equal(changed.json.data?.job_title, 'School Nurse');
    const access = await pool.query<{ assignments: number; grants: number }>(`
        SELECT (SELECT COUNT(*)::int FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = $1 AND revoked_at IS NULL) AS assignments,
               (SELECT COUNT(*)::int FROM USER_MODULE_PERMISSIONS WHERE user_id = $1 AND revoked_at IS NULL) AS grants
    `, [targetId]);
    assert.equal(access.rows[0]?.assignments, 0);
    assert.equal(access.rows[0]?.grants, 0);
    const targetToken = jwt.sign({ id: targetId }, secret, { expiresIn: '10m' });
    const me = await request('GET', '/api/v1/auth/me', undefined, targetToken);
    assert.equal(me.status, 200);
    assert.equal((me.json as { user?: { portal_role?: string } }).user?.portal_role, 'superuser');

    const missingTitleOnRoleChange = await request('PUT', `/api/admin/users/${targetId}`, { portal_role: 'school_staff' });
    assert.equal(missingTitleOnRoleChange.status, 400);

    const titleOnly = await request('PUT', `/api/v1/admin/users/${targetId}`, { job_title: 'Coordinator' });
    assert.equal(titleOnly.status, 200);
    assert.equal(titleOnly.json.data?.job_title, 'Coordinator');
    const passwordChanged = await request('PUT', `/api/v1/admin/users/${targetId}`, { password: 'another-test-password-123' });
    assert.equal(passwordChanged.status, 200);
    const backToStaff = await request('PUT', `/api/v1/admin/users/${targetId}`, {
        portal_role: 'school_staff', job_title: 'Teacher',
    });
    assert.equal(backToStaff.status, 200);
    assert.equal(backToStaff.json.data?.portal_role, 'school_staff');
    const staffMe = await request('GET', '/api/v1/auth/me', undefined, targetToken);
    assert.equal((staffMe.json as { user?: { portal_role?: string } }).user?.portal_role, 'school_staff');
    const staffAccess = await pool.query<{ assignments: number; grants: number }>(`
        SELECT (SELECT COUNT(*)::int FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = $1 AND revoked_at IS NULL) AS assignments,
               (SELECT COUNT(*)::int FROM USER_MODULE_PERMISSIONS WHERE user_id = $1 AND revoked_at IS NULL) AS grants
    `, [targetId]);
    assert.equal(staffAccess.rows[0]?.assignments, 0);
    assert.equal(staffAccess.rows[0]?.grants, 0);
    const deactivate = await request('PATCH', `/api/v1/admin/users/${targetId}/status`, { action: 'deactivate' });
    assert.equal(deactivate.status, 200);
    assert.equal(deactivate.json.data?.is_active, false);
    assert.equal((await request('GET', '/api/v1/auth/me', undefined, targetToken)).status, 401);
    const unlock = await request('PATCH', `/api/admin/users/${targetId}/status`, { action: 'unlock' });
    assert.equal(unlock.status, 200);
    assert.equal(unlock.json.data?.is_active, true);

    const before = await pool.query<{ job_title: string }>('SELECT job_title FROM USERS WHERE id = $1', [targetId]);
    const originalLog = AuditService.logEvent;
    try {
        AuditService.logEvent = async () => { throw new Error('forced audit failure'); };
        const failed = await request('PUT', `/api/v1/admin/users/${targetId}`, { job_title: 'Should Roll Back' });
        assert.equal(failed.status, 500);
        const failedStatus = await request('PATCH', `/api/v1/admin/users/${targetId}/status`, { action: 'deactivate' });
        assert.equal(failedStatus.status, 500);
        const failedCreate = await request('POST', '/api/v1/admin/users', {
            ...base, email: rollbackEmail, job_title: 'Teacher',
        });
        assert.equal(failedCreate.status, 500);
    } finally {
        AuditService.logEvent = originalLog;
    }
    const after = await pool.query<{ job_title: string }>('SELECT job_title FROM USERS WHERE id = $1', [targetId]);
    assert.equal(after.rows[0]?.job_title, before.rows[0]?.job_title);
    const rollback = await pool.query<{ active: boolean; created: number }>(`
        SELECT (SELECT is_active FROM USERS WHERE id = $1) AS active,
               (SELECT COUNT(*)::int FROM USERS WHERE email = $2) AS created
    `, [targetId, rollbackEmail]);
    assert.equal(rollback.rows[0]?.active, true);
    assert.equal(rollback.rows[0]?.created, 0);

    const audit = await pool.query<{ action: string; actor_id: number; portal_role: string; details: unknown }>(`
        SELECT action, actor_id, portal_role, details FROM AUDIT_EVENTS
        WHERE actor_id = $1 AND entity_type = 'USER' AND entity_id = $2
        ORDER BY id
    `, [actorId, String(targetId)]);
    assert.deepEqual(audit.rows.map(row => row.action), [
        'CREATE_USER', 'UPDATE_MODULE_PERMISSIONS', 'UPDATE_SCHOOL_ASSIGNMENTS',
        'UPDATE_USER', 'UPDATE_USER', 'UPDATE_USER', 'UPDATE_USER', 'UPDATE_USER_STATUS', 'UPDATE_USER_STATUS',
    ]);
    for (const row of audit.rows) {
        assert.equal(row.actor_id, actorId);
        assert.equal(row.portal_role, 'admin');
        assert.doesNotMatch(JSON.stringify(row.details), /test-only-password|another-test-password|phase4b_m2_staff|Doctor|School Nurse|Coordinator/i);
    }
    const transition = audit.rows.find(row => row.action === 'UPDATE_USER'
        && (row.details as { role_changed?: boolean } | null)?.role_changed === true);
    assert.ok(transition);
    assert.deepEqual((transition.details as { revoked_school_ids?: number[] }).revoked_school_ids, [school.rows[0].id]);
    assert.deepEqual((transition.details as { revoked_module_ids?: number[] }).revoked_module_ids, [module.rows[0].id]);
    console.log('Phase 4B Milestone 2 lifecycle HTTP/database checks passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    const found = await pool.query<{ id: number }>(
        'SELECT id FROM USERS WHERE email = ANY($1::text[])', [[actorEmail, targetEmail, rollbackEmail]],
    );
    for (const row of found.rows) if (!userIds.includes(row.id)) userIds.push(row.id);
    if (userIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[]) OR (entity_type = $2 AND entity_id = ANY($3::text[]))',
            [userIds, 'USER', userIds.map(String)]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    await pool.end();
}
