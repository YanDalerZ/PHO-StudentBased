import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';
import type { SessionStatus } from '../services/portalSession.js';

await requireVerifiedTestDatabase(pool);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('Test JWT secret missing');
const schema = await pool.query<{ sessions: string | null; policy: string | null }>(
    "SELECT to_regclass('public.portal_sessions')::text AS sessions, to_regclass('public.portal_session_policy')::text AS policy");
assert.ok(schema.rows[0]?.sessions && schema.rows[0]?.policy, 'migration 017 must be applied to pho_test first');

const stamp = Date.now();
const userIds: number[] = [];
const originalPolicy = await pool.query<{ inactivity_minutes: number; updated_by: number | null }>(
    'SELECT inactivity_minutes, updated_by FROM PORTAL_SESSION_POLICY WHERE id = 1');
let server: ReturnType<typeof app.listen> | undefined;

try {
    const hash = await bcrypt.hash('local-test-password', 8);
    for (const role of ['admin', 'superuser', 'school_staff'] as const) {
        const result = await pool.query<{ id: number }>(`
            INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
            VALUES ($1, $2, $3, $4, 'Tester', 'Session', 'QA', TRUE) RETURNING id`,
            [`session_qa_${role}_${stamp}@pho.test`, hash, role === 'school_staff' ? 'teacher' : role, role]);
        userIds.push(result.rows[0]!.id);
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    async function request(method: string, route: string, token?: string, body?: unknown) {
        const response = await fetch(base + route, {
            method,
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() as {
            token?: string; session?: SessionStatus; inactivityMinutes?: number; code?: string;
        } };
    }
    async function signIn(role: string, expectedMinutes: number = 15) {
        const result = await request('POST', '/auth/login', undefined,
            { email: `session_qa_${role}_${stamp}@pho.test`, password: 'local-test-password' });
        assert.equal(result.status, 200);
        assert.equal(result.body.session?.inactivityMinutes, expectedMinutes);
        assert.ok(result.body.token);
        return result.body.token;
    }
    await pool.query('UPDATE PORTAL_SESSION_POLICY SET inactivity_minutes = 15 WHERE id = 1');
    const admin = await signIn('admin');
    assert.equal((await request('GET', '/admin/session-timeout', admin)).body.inactivityMinutes, 15);
    for (const role of ['superuser', 'school_staff']) {
        const token = await signIn(role);
        assert.equal((await request('GET', '/auth/me', token)).status, 200);
        assert.equal((await request('GET', '/admin/session-timeout', token)).status, 403);
    }
    assert.equal((await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: 7 })).status, 400);
    for (const minutes of [5, 10, 15]) {
        assert.equal((await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: minutes })).status, 200);
        assert.equal((await request('GET', '/auth/session', admin)).body.session?.inactivityMinutes, minutes);
    }
    const audit = await pool.query<{ details: { previous_minutes: number; new_minutes: number } }>(`
        SELECT details FROM AUDIT_EVENTS WHERE actor_id = $1 AND action = 'UPDATE_PORTAL_SESSION_TIMEOUT' ORDER BY id`, [userIds[0]]);
    assert.deepEqual(audit.rows.map(row => row.details.new_minutes), [5, 10, 15]);

    const staff = await signIn('school_staff');
    const staffSid = (jwt.verify(staff, secret) as { sid: string }).sid;
    await pool.query("UPDATE PORTAL_SESSIONS SET created_at = NOW() - INTERVAL '1 hour', last_activity_at = NOW() - INTERVAL '4 minutes' WHERE id = $1", [staffSid]);
    await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: 5 });
    assert.equal((await request('GET', '/auth/me', staff)).status, 200);
    const before = await pool.query<{ last_activity_at: Date }>('SELECT last_activity_at FROM PORTAL_SESSIONS WHERE id = $1', [staffSid]);
    assert.equal((await request('GET', '/auth/session', staff)).status, 200);
    const afterGet = await pool.query<{ last_activity_at: Date }>('SELECT last_activity_at FROM PORTAL_SESSIONS WHERE id = $1', [staffSid]);
    assert.equal(before.rows[0]?.last_activity_at.getTime(), afterGet.rows[0]?.last_activity_at.getTime(), 'background GET must not extend idle time');
    assert.equal((await request('POST', '/auth/session/activity', staff)).status, 200);
    const afterActivity = await pool.query<{ last_activity_at: Date }>('SELECT last_activity_at FROM PORTAL_SESSIONS WHERE id = $1', [staffSid]);
    assert.ok(afterActivity.rows[0]!.last_activity_at > afterGet.rows[0]!.last_activity_at);

    await pool.query("UPDATE PORTAL_SESSIONS SET last_activity_at = NOW() - INTERVAL '6 minutes' WHERE id = $1", [staffSid]);
    const idle = await request('GET', '/auth/me', staff);
    assert.equal(idle.status, 401);
    assert.equal(idle.body.code, 'SESSION_INACTIVE');
    assert.equal((await request('POST', '/auth/session/activity', staff)).status, 401, 'expired sessions cannot continue');

    const maxToken = await signIn('superuser', 5);
    const maxSid = (jwt.verify(maxToken, secret) as { sid: string }).sid;
    await pool.query("UPDATE PORTAL_SESSIONS SET created_at = NOW() - INTERVAL '8 hours 1 second' WHERE id = $1", [maxSid]);
    const maximum = await request('GET', '/auth/me', maxToken);
    assert.equal(maximum.status, 401);
    assert.equal(maximum.body.code, 'SESSION_MAXIMUM_EXPIRED');
    const expiredEnvelope = jwt.sign({ id: userIds[1], sid: maxSid }, secret, { expiresIn: -1 });
    assert.equal((await request('GET', '/auth/me', expiredEnvelope)).body.code, 'SESSION_MAXIMUM_EXPIRED');

    await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: 15 });
    const shorter = await signIn('school_staff');
    const shorterSid = (jwt.verify(shorter, secret) as { sid: string }).sid;
    await pool.query("UPDATE PORTAL_SESSIONS SET created_at = NOW() - INTERVAL '1 hour', last_activity_at = NOW() - INTERVAL '7 minutes' WHERE id = $1", [shorterSid]);
    assert.equal((await request('GET', '/auth/me', shorter)).status, 200);
    await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: 5 });
    assert.equal((await request('GET', '/auth/me', shorter)).body.code, 'SESSION_INACTIVE', 'shorter policy expires already-idle session on next check');
    const terminated = await pool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM PORTAL_SESSIONS WHERE id = $1', [shorterSid]);
    assert.ok(terminated.rows[0]?.revoked_at, 'observed inactivity expiry must terminate the session');
    await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: 15 });
    const afterPolicyIncrease = await request('GET', '/auth/me', shorter);
    assert.equal(afterPolicyIncrease.status, 401, 'a later policy increase must not revive an expired session');
    assert.equal(afterPolicyIncrease.body.code, 'SESSION_REVOKED');

    for (const minutes of [5, 10, 15]) {
        assert.equal((await request('PUT', '/admin/session-timeout', admin, { inactivityMinutes: minutes })).status, 200);
        const token = await signIn('school_staff', minutes);
        const sid = (jwt.verify(token, secret) as { sid: string }).sid;
        await pool.query(`UPDATE PORTAL_SESSIONS SET created_at = NOW() - INTERVAL '1 hour',
            last_activity_at = NOW() - (($2 + 0.02) * INTERVAL '1 minute') WHERE id = $1`, [sid, minutes]);
        assert.equal((await request('GET', '/auth/me', token)).body.code, 'SESSION_INACTIVE', `${minutes}-minute expiration`);
    }

    const logoutToken = await signIn('admin', 15);
    assert.equal((await request('POST', '/auth/logout', logoutToken)).status, 200);
    assert.equal((await request('GET', '/auth/me', logoutToken)).body.code, 'SESSION_REVOKED');
    assert.equal((await request('GET', '/auth/me', jwt.sign({ id: userIds[0] }, secret, { expiresIn: '1h' }))).status, 401, 'old JWTs require new login');
    assert.equal((await request('GET', '/auth/me', 'invalid')).status, 401);
    // Public QR route remains public and its client does not send an Authorization header.
    const publicRoute = await request('GET', '/public/registration-invitations/00000000000000000000000000000000');
    assert.notEqual(publicRoute.status, 401);
    console.log('Portal sessions: policy, roles, activity, expiry, maximum, revocation, legacy token, and public route passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (originalPolicy.rows[0]) await pool.query(
        'UPDATE PORTAL_SESSION_POLICY SET inactivity_minutes = $1, updated_by = $2 WHERE id = 1',
        [originalPolicy.rows[0].inactivity_minutes, originalPolicy.rows[0].updated_by]);
    if (userIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM PORTAL_SESSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    await pool.end();
}
