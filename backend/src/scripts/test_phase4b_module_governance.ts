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

const marker = `phase4b_m4_${Date.now()}`;
const emails = [`${marker}_admin@pho.test`, `${marker}_viewer@pho.test`, `${marker}_reporter@pho.test`, `${marker}_reviewer@pho.test`];
const userIds: number[] = [];
let moduleId: number | undefined;
let originalModule: { description: string | null; icon: string | null; sort_order: number; is_active: boolean } | undefined;
let server: ReturnType<typeof app.listen> | undefined;

try {
    const catalog = await pool.query<{ id: number; slug: string; description: string | null; icon: string | null; sort_order: number; is_active: boolean }>(`
        SELECT id, slug, description, icon, sort_order, is_active FROM MODULES ORDER BY slug
    `);
    assert.deepEqual(catalog.rows.map(row => row.slug), [
        'deworming', 'immunization', 'oral-health', 'patient-info', 'vital-signs',
    ], 'the disposable test database must contain the five approved modules');
    const target = catalog.rows.find(row => row.slug === 'patient-info')!;
    moduleId = target.id;
    originalModule = target;
    if (!target.is_active) {
        await pool.query('UPDATE MODULES SET is_active = TRUE WHERE id = $1', [moduleId]);
    }
    const users = await pool.query<{ id: number; portal_role: string; email: string }>(`
        INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
        VALUES ($1, 'test-only-hash', 'admin', 'admin', 'QA Administrator', 'QA', 'Admin', TRUE),
               ($2, 'test-only-hash', 'superuser', 'superuser', 'Doctor', 'QA', 'Viewer', TRUE),
               ($3, 'test-only-hash', 'superuser', 'superuser', 'Doctor', 'QA', 'Reporter', TRUE),
               ($4, 'test-only-hash', 'teacher', 'school_staff', 'Teacher', 'QA', 'Reviewer', TRUE)
        RETURNING id, portal_role, email
    `, emails);
    for (const row of users.rows) userIds.push(row.id);
    const actorId = users.rows.find(row => row.email === emails[0])!.id;
    const viewerId = users.rows.find(row => row.email === emails[1])!.id;
    const reporterId = users.rows.find(row => row.email === emails[2])!.id;
    const reviewerId = users.rows.find(row => row.email === emails[3])!.id;
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS
          (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export, granted_by)
        VALUES ($1, $4, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, $5),
               ($2, $4, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, $5),
               ($3, $4, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, $5)
    `, [viewerId, reporterId, reviewerId, moduleId, actorId]);
    const actorToken = jwt.sign({ id: actorId }, secret, { expiresIn: '10m' });
    const viewerToken = jwt.sign({ id: viewerId }, secret, { expiresIn: '10m' });
    const reporterToken = jwt.sign({ id: reporterId }, secret, { expiresIn: '10m' });
    const reviewerToken = jwt.sign({ id: reviewerId }, secret, { expiresIn: '10m' });
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
        const type = response.headers.get('content-type') ?? '';
        return { status: response.status, json: type.includes('application/json') ? await response.json() as { data?: Record<string, unknown>; error?: { code?: string } } : null };
    }

    assert.equal((await request('POST', '/api/v1/admin/modules', { name: 'Sixth', slug: 'sixth' })).status, 409);
    assert.equal((await request('PUT', `/api/admin/modules/${moduleId}`, { slug: 'oral-health' })).status, 400);
    assert.equal((await request('PUT', `/api/admin/modules/${moduleId}`, { name: 'Renamed' })).status, 400);
    assert.equal((await request('PUT', `/api/admin/modules/${moduleId}`, { icon: 'UnknownIcon' })).status, 400);
    assert.equal((await request('PUT', `/api/admin/modules/${moduleId}abc`, { is_active: false })).status, 400);
    assert.equal((await request('PUT', `/api/admin/modules/${moduleId}`, { is_active: false }, viewerToken)).status, 403);

    const updated = await request('PUT', `/api/v1/admin/modules/${moduleId}`, {
        description: 'QA module description', icon: 'FileText', sort_order: 4,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json?.data?.slug, 'patient-info');
    const originalLog = AuditService.logEvent;
    try {
        AuditService.logEvent = async () => { throw new Error('forced audit failure'); };
        assert.equal((await request('PUT', `/api/v1/admin/modules/${moduleId}`, { is_active: false })).status, 500);
        assert.equal((await request('PUT', `/api/v1/admin/modules/${moduleId}`, { description: 'Should roll back' })).status, 500);
    } finally {
        AuditService.logEvent = originalLog;
    }
    const afterFailure = await pool.query<{ is_active: boolean; description: string }>(
        'SELECT is_active, description FROM MODULES WHERE id = $1', [moduleId],
    );
    assert.equal(afterFailure.rows[0]?.is_active, true);
    assert.equal(afterFailure.rows[0]?.description, 'QA module description');

    const disabled = await request('PUT', `/api/admin/modules/${moduleId}`, { is_active: false });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.json?.data?.is_active, false);
    const dateRange = '?date_from=2026-01-01&date_to=2026-12-31';
    const preview = await request('GET', `/api/v1/reports/patient-info${dateRange}`, undefined, viewerToken);
    assert.equal(preview.status, 200, 'disabled module report preview stays readable with can_view and can_report');
    assert.equal((await request('GET', `/api/v1/reports/patient-info${dateRange}`, undefined, reporterToken)).status, 403);
    assert.equal((await request('POST', '/api/v1/reports/patient-info/print-events', {
        date_from: '2026-01-01', date_to: '2026-12-31',
    }, viewerToken)).status, 201);
    const blockedWrite = await request('POST', '/api/v1/modules/patient-info', {}, viewerToken);
    assert.equal(blockedWrite.status, 422);
    assert.equal(blockedWrite.json?.error?.code, 'MODULE_DISABLED');
    for (const decision of ['approve', 'reject']) {
        const blocked = await request('POST', `/api/v1/registration-submissions/99999999/${decision}`, {}, reviewerToken);
        assert.equal(blocked.status, 422);
        assert.equal(blocked.json?.error?.code, 'MODULE_DISABLED');
    }
    const exportResult = await request('POST', '/api/v1/reports/patient-info/exports', {
        format: 'csv', filters: { date_from: '2026-01-01', date_to: '2026-12-31' },
    }, viewerToken);
    assert.equal(exportResult.status, 422);
    assert.equal(exportResult.json?.error?.code, 'MODULE_DISABLED');

    const enabled = await request('PUT', `/api/v1/admin/modules/${moduleId}`, { is_active: true });
    assert.equal(enabled.status, 200);
    const audits = await pool.query<{ action: string; actor_id: number; details: unknown; ip_address: string | null }>(`
        SELECT action, actor_id, details, ip_address FROM AUDIT_EVENTS
        WHERE entity_type = 'MODULE' AND entity_id = $1 AND actor_id = $2 ORDER BY id
    `, [String(moduleId), actorId]);
    assert.deepEqual(audits.rows.map(row => row.action), ['UPDATE_MODULE', 'DEACTIVATE_MODULE', 'ACTIVATE_MODULE']);
    for (const row of audits.rows) {
        assert.equal(row.actor_id, actorId);
        assert.ok(row.ip_address);
        assert.doesNotMatch(JSON.stringify(row.details), /QA module description|Should roll back|test-only-hash/i);
    }
    console.log('Phase 4B Milestone 4 module governance HTTP/database checks passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (moduleId !== undefined && originalModule) {
        await pool.query(`
            UPDATE MODULES SET description = $1, icon = $2, sort_order = $3,
                               is_active = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [originalModule.description, originalModule.icon, originalModule.sort_order, originalModule.is_active, moduleId]);
    }
    if (userIds.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [userIds]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [userIds]);
    }
    const residual = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM USERS WHERE email = ANY($1::text[])', [emails],
    );
    assert.equal(residual.rows[0]?.count, 0);
    await pool.end();
}
