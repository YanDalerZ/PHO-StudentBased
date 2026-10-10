import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
// Recover fixtures from an interrupted prior run of this dedicated test only.
const stale = await pool.query<{ id: number }>("SELECT id FROM USERS WHERE email LIKE 'phase4b_m6_%@pho.test'");
if (stale.rows.length) {
    const ids = stale.rows.map(row => row.id);
    await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [ids]);
}
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required.');
const suffix = Date.now();
const userIds: number[] = [];
const eventIds: number[] = [];
let server: ReturnType<typeof app.listen> | undefined;

try {
    for (const role of ['admin', 'teacher'] as const) {
        const added = await pool.query<{ id: number }>(
            `INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
             VALUES ($1, 'test-only-hash', $2, $3, 'QA', 'Audit', 'Fixture', TRUE) RETURNING id`,
            [`phase4b_m6_${role}_${suffix}@pho.test`, role, role === 'admin' ? 'admin' : 'school_staff'],
        );
        userIds.push(added.rows[0]!.id);
    }
    const [adminId, staffId] = userIds as [number, number];
    const adminToken = jwt.sign({ id: adminId }, secret, { expiresIn: '10m' });
    const staffToken = jwt.sign({ id: staffId }, secret, { expiresIn: '10m' });
    const canary = `SENSITIVE_CANARY_${suffix}`;
    for (const [action, entityType, entityId, details, createdAt] of [
        ['UPDATE_USER', 'USER', String(staffId), { changed_fields: ['job_title', 'email', canary], email: canary, token: canary, nested: { secret: canary }, revoked_permission_count: 2 }, '2026-08-10T12:00:00Z'],
        ['PATIENT_INFO_CREATED', 'PATIENT_INFO', canary, { narrative: canary, token: canary }, '2026-08-10T12:00:00Z'],
        [canary, canary, canary, { token: canary }, '2026-08-09T12:00:00Z'],
    ] as const) {
        const added = await pool.query<{ id: number }>(
            `INSERT INTO AUDIT_EVENTS (actor_id, portal_role, action, entity_type, entity_id, details, created_at)
             VALUES ($1, 'school_staff', $2, $3, $4, $5::jsonb, $6::timestamptz) RETURNING id`,
            [staffId, action, entityType, entityId, JSON.stringify(details), createdAt],
        );
        eventIds.push(added.rows[0]!.id);
    }
    await pool.query('UPDATE USERS SET is_active = FALSE WHERE id = $1', [staffId]);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    const request = async (path: string, token?: string) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const body = await response.text();
        return { status: response.status, body, json: JSON.parse(body) as { data: Array<Record<string, unknown>>; meta: { total: number } } };
    };
    for (const prefix of ['/api/v1', '/api']) {
        const route = `${prefix}/admin/audit-logs`;
        assert.equal((await request(route)).status, 401);
        assert.equal((await request(route, staffToken)).status, 401, 'inactive actor denied');
        const anotherStaff = await pool.query<{ id: number }>(`UPDATE USERS SET is_active = TRUE WHERE id = $1 RETURNING id`, [staffId]);
        assert.ok(anotherStaff.rows[0]);
        assert.equal((await request(route, staffToken)).status, 403);
        await pool.query('UPDATE USERS SET is_active = FALSE WHERE id = $1', [staffId]);
        const query = `${route}?actor_id=${staffId}&date_from=2026-08-10&date_to=2026-08-10&pageSize=1`;
        const first = await request(query, adminToken);
        assert.equal(first.status, 200);
        assert.equal(first.json.meta.total, 2);
        assert.equal(first.json.data[0]?.id, eventIds[1], 'same-time rows ordered by descending ID');
        const second = await request(`${query}&page=2`, adminToken);
        assert.equal(second.status, 200);
        assert.equal(second.json.data[0]?.id, eventIds[0]);
        assert.equal(second.json.data[0]?.actor_id, staffId, 'inactive actor retained as ID');
        assert.equal((second.json.data[0]?.details as Record<string, unknown>).revoked_permission_count, 2);
        assert.deepEqual((second.json.data[0]?.details as Record<string, unknown>).changed_fields, ['job_title']);
        assert.ok(!first.body.includes(canary) && !second.body.includes(canary), 'legacy sensitive data excluded');
        assert.equal((await request(`${route}?actor_id=${staffId}&action=UPDATE_USER`, adminToken)).json.data[0]?.id, eventIds[0]);
        assert.equal((await request(`${route}?actor_id=${staffId}&entity_type=PATIENT_INFO`, adminToken)).json.data[0]?.entity_id, null);
        const unknown = await request(`${route}?actor_id=${staffId}&date_to=2026-08-09`, adminToken);
        assert.equal(unknown.json.data[0]?.action, 'OTHER_EVENT');
        assert.equal(unknown.json.data[0]?.entity_type, 'OTHER_ENTITY');
        assert.ok(!unknown.body.includes(canary));
        assert.equal((await request(`${route}?actor_id=${staffId}&date_to=2026-08-08`, adminToken)).json.meta.total, 0);
        for (const invalid of ['pageSize=101', 'page=0', 'actor_id=12abc', 'date_from=2026-02-30', 'date_from=2026-08-11&date_to=2026-08-10', 'action=DROP%20TABLE', 'unknown=1']) {
            assert.equal((await request(`${route}?${invalid}`, adminToken)).status, 400, invalid);
        }
    }
    console.log('Phase 4B Milestone 6 audit browser: PASS (HTTP, filters, stable pages, inactive actor, legacy redaction).');
} finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
    if (userIds.length) await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    await pool.end();
}
