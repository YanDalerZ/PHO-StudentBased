import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { AuditService } from '../services/AuditService.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

const tag = `support-qa-${randomUUID()}`;
const emails = ['admin', 'staff', 'request', 'reject', 'report', 'trap'].map(role => `${role}-${tag}@example.test`);
const [adminEmail, staffEmail, requestEmail, rejectEmail, reportEmail, trapEmail] = emails;
const originalFetch = globalThis.fetch;
const providerCalls: string[] = [];
const testPassword = randomUUID();
type Data<T> = { data: T };
type RequestState = { status: string; notification_status: string; notification_error: string; created_user_id: number; attempt_count: number };
let verified = false;
let server: ReturnType<typeof app.listen> | undefined;

try {
    await requireVerifiedTestDatabase(pool);
    verified = true;
    const secret = process.env.JWT_SECRET;
    assert.ok(secret);
    async function fixture(email: string, role: 'admin' | 'school_staff') {
        const { rows: [user] } = await pool.query<{ id: number }>(`
            INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
            VALUES ($1, 'qa', $2, $3, 'QA', 'Test', 'Support', TRUE) RETURNING id
        `, [email, role === 'admin' ? role : 'teacher', role]);
        assert.ok(user);
        const sid = randomUUID();
        await pool.query('INSERT INTO PORTAL_SESSIONS (id, user_id) VALUES ($1, $2)', [sid, user.id]);
        return { id: user.id, token: jwt.sign({ id: user.id, sid }, secret!, { expiresIn: '10m' }) };
    }
    const admin = await fixture(adminEmail!, 'admin');
    const staff = await fixture(staffEmail!, 'school_staff');
    const school = (await pool.query<{ id: number }>('SELECT id FROM SCHOOLS WHERE is_active ORDER BY id LIMIT 1')).rows[0];
    const module = (await pool.query<{ id: number }>("SELECT id FROM MODULES WHERE slug = 'patient-info'")).rows[0];
    assert.ok(school && module, 'Test requires a local active school and Patient Information module');

    // Intercept only the provider boundary; never make external sends in QA.
    process.env.SUPPORT_EMAILJS_SERVICE_ID = 'qa-service';
    process.env.SUPPORT_EMAILJS_TEMPLATE_ID = 'qa-template';
    process.env.SUPPORT_EMAILJS_PUBLIC_KEY = 'qa-public-key';
    process.env.SUPPORT_EMAILJS_PRIVATE_KEY = 'qa-private-key';
    process.env.SUPPORT_SETUP_ORIGIN = 'https://pho.example.test';
    globalThis.fetch = async (url, init) => {
        if (new URL(String(url)).hostname === '127.0.0.1') return originalFetch(url, init);
        assert.equal(String(url), 'https://api.emailjs.com/api/v1.0/email/send');
        const sent = JSON.parse(String(init?.body)) as {
            accessToken: string;
            template_params: { to_email: string; setup_link: string };
        };
        assert.equal(sent.accessToken, 'qa-private-key');
        const recipient = providerCalls.length < 3 ? requestEmail : trapEmail;
        assert.equal(sent.template_params.to_email, recipient);
        assert.ok(!String(init?.body).includes(testPassword));
        const link = new URL(sent.template_params.setup_link);
        assert.equal(link.origin, 'https://pho.example.test');
        assert.equal(link.pathname, '/account-setup');
        assert.equal(link.search, '');
        const token = new URLSearchParams(link.hash.slice(1)).get('token');
        assert.match(token ?? '', /^[A-Za-z0-9_-]{43}$/);
        const { rows: [saved] } = await pool.query(`
            SELECT r.status, u.portal_role, u.is_active, u.password_setup_pending, n.setup_token_hash
            FROM SUPPORT_ACCOUNT_REQUESTS r JOIN USERS u ON u.id = r.created_user_id
            JOIN SUPPORT_ACCOUNT_NOTIFICATIONS n ON n.request_id = r.id
            WHERE r.work_email = $1
        `, [recipient]);
        assert.equal(saved?.status, 'approved', 'Provider runs only after the commit is visible');
        assert.equal(saved?.portal_role, 'school_staff');
        assert.equal(saved?.is_active, false);
        assert.equal(saved?.password_setup_pending, true);
        assert.equal(saved?.setup_token_hash, createHash('sha256').update(token!).digest('hex'));
        providerCalls.push(token!);
        return providerCalls.length === 1 ? new Response('Rejected', { status: 422 }) : new Response('OK');
    };

    const listener = app.listen(0, '127.0.0.1');
    server = listener;
    await new Promise<void>((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
    const origin = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    async function request<T = unknown>(method: string, path: string, body?: unknown, token?: string, raw?: string) {
        const response = await originalFetch(`${origin}${path}`, {
            method,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: raw ?? (body === undefined ? null : JSON.stringify(body)),
        });
        const payload = (response.status === 204 ? null : await response.json()) as T;
        return { status: response.status, payload, headers: response.headers };
    }
    const publicPath = '/api/v1/contact';
    const queue = '/api/v1/admin/support';
    const report = { name: 'QA Report', reply_email: reportEmail, category: 'login', description: 'Synthetic login issue for testing.', page_or_module: 'Login' };
    const account = { name: 'QA Applicant', work_email: requestEmail, contact_no: '+63 917 123 4567', job_title: 'Teacher', school_or_office: 'Informational only', reason: 'Synthetic request for a test account.' };

    assert.equal((await request('POST', `${publicPath}/reports`, undefined, undefined, '{"broken"')).status, 400);
    assert.equal((await request('POST', `${publicPath}/reports`, { ...report, description: 'x'.repeat(17_000) })).status, 413);
    const invalid = await request<{ fieldErrors: { reply_email: string[] } }>('POST', `${publicPath}/reports`, { ...report, reply_email: 'invalid' });
    assert.equal(invalid.status, 400);
    assert.ok(invalid.payload.fieldErrors.reply_email);
    const createdReport = await request<{ reference: string }>('POST', `${publicPath}/reports`, report);
    assert.equal(createdReport.status, 201);
    const reportId = createdReport.payload.reference as string;
    assert.match(reportId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(createdReport.payload), ['reference']);
    assert.equal((await request('POST', `${publicPath}/accounts`, { ...account, portal_role: 'admin' })).status, 400);

    const duplicates = await Promise.all([
        request('POST', `${publicPath}/accounts`, account),
        request('POST', '/api/contact/accounts', { ...account, work_email: requestEmail!.toUpperCase() }),
    ]);
    const existing = await request('POST', `${publicPath}/accounts`, { ...account, work_email: adminEmail });
    const trapped = await request('POST', `${publicPath}/accounts`, { ...account, work_email: trapEmail, website: 'spam' });
    assert.ok([...duplicates, existing, trapped].every(result => result.status === 202));
    for (const result of [...duplicates, trapped]) assert.deepEqual(result.payload, existing.payload);
    assert.equal((await request('POST', `${publicPath}/accounts`, { ...account, work_email: rejectEmail })).status, 202);
    const blocked = await request('POST', '/api/contact/reports', report);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    const pending = await pool.query<{ id: string; work_email: string }>(
        'SELECT id, work_email FROM SUPPORT_ACCOUNT_REQUESTS WHERE work_email = ANY($1) AND status = $2', [emails, 'pending'],
    );
    assert.equal(pending.rowCount, 2);
    const requestId = pending.rows.find(row => row.work_email === requestEmail)!.id;
    const rejectId = pending.rows.find(row => row.work_email === rejectEmail)!.id;
    assert.equal((await pool.query('SELECT id FROM USERS WHERE email = ANY($1)', [[requestEmail, rejectEmail]])).rowCount, 0);
    assert.equal(providerCalls.length, 0);
    const path = `${queue}/accounts/${requestId}`;
    const provision = {
        user: { email: requestEmail, first_name: 'Confirmed', last_name: 'Applicant', job_title: 'School Nurse',
            portal_role: 'school_staff' },
        school_ids: [school.id], permissions: [{ module_id: module.id, can_view: true }],
    };

    assert.equal((await request('GET', `${queue}/reports`)).status, 401);
    assert.equal((await request('GET', `${queue}/accounts`, undefined, staff.token)).status, 403);
    assert.equal((await request('PATCH', `${queue}/reports/${reportId}`, { status: 'open' }, staff.token)).status, 403);
    assert.equal((await request('POST', `${path}/provision`, provision, staff.token)).status, 403);
    assert.equal((await request('POST', `${path}/reject`, { note: 'Denied' }, staff.token)).status, 403);
    assert.equal((await request('POST', `${path}/retry-notification`, {}, staff.token)).status, 403);
    assert.equal((await request('POST', `${path}/check-delivery`, {}, staff.token)).status, 403);
    assert.equal((await request('PATCH', `${queue}/reports/${reportId}`, { status: 'resolved' }, admin.token)).status, 400);
    assert.equal((await request('PATCH', `${queue}/reports/${reportId}`,
        { status: 'resolved', resolution_notes: 'Synthetic resolution' }, admin.token)).status, 204);
    const reports = await request<Data<{ id: string; resolution_notes: string }[]>>('GET', `${queue}/reports?status=resolved`, undefined, admin.token);
    assert.ok(reports.payload.data.some((entry: { id: string; resolution_notes: string }) =>
        entry.id === reportId && entry.resolution_notes === 'Synthetic resolution'));
    assert.equal((await request('POST', `${queue}/accounts/${rejectId}/reject`, { note: 'Synthetic rejection' }, admin.token)).status, 204);
    assert.equal((await request('POST', `${queue}/accounts/${rejectId}/provision`,
        { ...provision, user: { ...provision.user, email: rejectEmail } }, admin.token)).status, 409);

    assert.equal((await request('POST', '/api/v1/admin/users', { ...provision.user, password: testPassword, portal_role: 'admin' }, admin.token)).status, 400);
    for (const invalidProvision of [
        { ...provision, user: { ...provision.user, portal_role: 'admin' } },
        { ...provision, user: { ...provision.user, password: testPassword } },
        { ...provision, user: { ...provision.user, email: trapEmail } },
        { ...provision, school_ids: [] },
        { ...provision, permissions: [{ module_id: module.id, can_edit: true }] },
    ]) assert.equal((await request('POST', `${path}/provision`, invalidProvision, admin.token)).status, 400);
    const log = AuditService.logEvent;
    try {
        AuditService.logEvent = async (event, client) => {
            if (event.action === 'SUPPORT_ACCOUNT_REQUEST_APPROVED') throw new Error('Simulated decision audit failure');
            return log(event, client);
        };
        assert.equal((await request('POST', `${path}/provision`, provision, admin.token)).status, 500);
    } finally { AuditService.logEvent = log; }
    assert.equal((await pool.query('SELECT 1 FROM USERS WHERE email = $1', [requestEmail])).rowCount, 0);
    assert.equal((await pool.query('SELECT 1 FROM SUPPORT_ACCOUNT_NOTIFICATIONS WHERE request_id = $1', [requestId])).rowCount, 0);
    assert.equal((await request<Data<RequestState>>('GET', path, undefined, admin.token)).payload.data.status, 'pending');
    assert.equal(providerCalls.length, 0);

    const outcomes = await Promise.all([1, 2].map(() => request<Data<{ id: number }>>('POST', `${path}/provision`, provision, admin.token)));
    assert.deepEqual(outcomes.map(result => result.status).sort(), [201, 409]);
    const userId = outcomes.find(result => result.status === 201)!.payload.data.id;
    assert.equal(providerCalls.length, 1);
    let row = (await request<Data<RequestState>>('GET', path, undefined, admin.token)).payload.data;
    assert.equal(row.notification_status, 'failed');
    assert.equal(row.notification_error, 'PROVIDER_REJECTED');
    assert.equal(row.created_user_id, userId);
    assert.equal((await request('POST', '/api/v1/auth/login', { email: requestEmail, password: testPassword })).status, 403);
    assert.equal((await request('PATCH', `/api/v1/admin/users/${userId}/status`, { action: 'activate' }, admin.token)).status, 409);
    assert.equal((await request('PUT', `/api/v1/admin/users/${userId}`, { password: testPassword }, admin.token)).status, 409);
    assert.equal((await pool.query('SELECT 1 FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id=$1 AND school_id=$2', [userId, school.id])).rowCount, 1);
    assert.equal((await pool.query('SELECT 1 FROM USER_MODULE_PERMISSIONS WHERE user_id=$1 AND module_id=$2 AND can_view', [userId, module.id])).rowCount, 1);
    assert.equal((await request('POST', `${path}/retry-notification`, { recipient: trapEmail }, admin.token)).status, 400);
    const notification = (action: 'retry-notification' | 'check-delivery') =>
        request<Data<RequestState>>('POST', `${path}/${action}`, {}, admin.token);
    const retried = await Promise.all([1, 2].map(() => notification('retry-notification')));
    assert.deepEqual(retried.map(result => result.status).sort(), [200, 409]);
    row = retried.find(result => result.status === 200)!.payload.data;
    assert.equal(row.notification_status, 'accepted');
    assert.equal(row.attempt_count, 2);
    assert.notEqual(providerCalls[0], providerCalls[1]);
    assert.equal((await notification('check-delivery')).status, 409);
    assert.ok(!JSON.stringify(row).includes(providerCalls[1]!));
    const setup = (token: string, password: string = testPassword) => request('POST', '/api/v1/auth/account-setup', { token, password });
    assert.equal((await setup(providerCalls[0]!)).status, 400, 'retry invalidates the previous token');
    assert.equal((await notification('retry-notification')).status, 409, 'accepted sends have a cooldown');
    await pool.query(`UPDATE SUPPORT_ACCOUNT_NOTIFICATIONS SET attempted_at = NOW() - INTERVAL '2 minutes',
        setup_expires_at = NOW() - INTERVAL '1 second' WHERE request_id = $1`, [requestId]);
    assert.equal((await setup(providerCalls[1]!)).status, 400, 'expired token fails');
    assert.equal((await notification('retry-notification')).payload.data.notification_status, 'accepted');
    assert.equal((await setup(providerCalls[2]!, 'short')).status, 400);
    assert.equal((await setup(providerCalls[2]!, '🔐'.repeat(19))).status, 400, 'enforce bcrypt byte limit');
    try {
        AuditService.logEvent = async (event, client) => {
            if (event.action === 'ACCOUNT_SETUP_COMPLETED') throw new Error('Simulated setup audit failure');
            return log(event, client);
        };
        assert.equal((await setup(providerCalls[2]!)).status, 503);
        const pendingUser = await pool.query('SELECT is_active FROM USERS WHERE id = $1', [userId]);
        assert.equal(pendingUser.rows[0]?.is_active, false);
    } finally { AuditService.logEvent = log; }
    const results = await Promise.all([setup(providerCalls[2]!), setup(providerCalls[2]!)]);
    assert.deepEqual(results.map(result => result.status).sort(), [204, 400]);
    assert.equal((await setup(providerCalls[2]!)).status, 400, 'used token fails');
    assert.equal((await request('POST', '/api/v1/auth/login', { email: requestEmail, password: testPassword })).status, 200);
    const completed = await pool.query('SELECT setup_token_hash, setup_completed_at FROM SUPPORT_ACCOUNT_NOTIFICATIONS WHERE request_id = $1', [requestId]);
    assert.equal(completed.rows[0]?.setup_token_hash, null);
    assert.ok(completed.rows[0]?.setup_completed_at);
    assert.equal((await pool.query("SELECT 1 FROM AUDIT_EVENTS WHERE actor_id = $1 AND action = 'ACCOUNT_SETUP_COMPLETED'", [userId])).rowCount, 1);
    assert.equal((await request('POST', `${path}/retry-notification`, {}, admin.token)).status, 409);
    assert.equal((await pool.query('SELECT 1 FROM USERS WHERE email = $1', [requestEmail])).rowCount, 1);

    const cancelledRequestId = randomUUID();
    await pool.query(`
        INSERT INTO SUPPORT_ACCOUNT_REQUESTS (id, name, work_email, contact_no, job_title, school_or_office, reason)
        VALUES ($1, 'QA Cancel', $2, '09171234567', 'Teacher', 'QA School', 'Local test for cancelling setup')
    `, [cancelledRequestId, trapEmail]);
    const cancellationPath = `${queue}/accounts/${cancelledRequestId}`;
    const cancelFixture = await request<Data<{ id: number }>>('POST', `${cancellationPath}/provision`,
        { ...provision, user: { ...provision.user, email: trapEmail } }, admin.token);
    assert.equal(cancelFixture.status, 201);
    assert.equal(providerCalls.length, 4);
    assert.equal((await request('PATCH', `/api/v1/admin/users/${cancelFixture.payload.data.id}/status`,
        { action: 'deactivate' }, admin.token)).status, 200);
    assert.equal((await setup(providerCalls[3]!)).status, 400, 'a cancelled link cannot activate the account');
    assert.equal((await request('POST', `${cancellationPath}/retry-notification`, {}, admin.token)).status, 409);
    const audit = await request<Data<{ action: string }[]>>('GET', `/api/v1/admin/audit-logs?actor_id=${admin.id}`, undefined, admin.token);
    for (const expected of ['CREATE_USER', 'SUPPORT_ACCOUNT_REQUEST_APPROVED', 'SUPPORT_ACCOUNT_REQUEST_REJECTED', 'SUPPORT_REPORT_UPDATED']) {
        assert.ok(audit.payload.data.some((entry: { action: string }) => entry.action === expected));
    }
    for (const secretValue of [requestEmail, testPassword, 'Synthetic resolution', 'Synthetic rejection']) {
        assert.ok(!JSON.stringify(audit.payload).includes(secretValue!));
    }
    console.log('PASS: guarded provisioning and rollback, private EmailJS request, failure and retry, expiry, single-use setup under concurrency, and login after activation.');
} finally {
    globalThis.fetch = originalFetch;
    if (server) {
        const listener = server;
        await new Promise<void>(resolve => listener.close(() => resolve()));
    }
    try {
        if (verified) {
            await pool.query('DELETE FROM SUPPORT_ACCOUNT_NOTIFICATIONS WHERE request_id IN (SELECT id FROM SUPPORT_ACCOUNT_REQUESTS WHERE work_email = ANY($1))', [emails]);
            await pool.query('DELETE FROM SUPPORT_ACCOUNT_REQUESTS WHERE work_email = ANY($1)', [emails]);
            await pool.query('DELETE FROM SUPPORT_REPORTS WHERE reply_email = $1', [reportEmail]);
            await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id IN (SELECT id FROM USERS WHERE email = ANY($1))', [emails]);
            await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id IN (SELECT id FROM USERS WHERE email = ANY($1))', [emails]);
            await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id IN (SELECT id FROM USERS WHERE email = ANY($1))', [emails]);
            await pool.query('DELETE FROM PORTAL_SESSIONS WHERE user_id IN (SELECT id FROM USERS WHERE email = ANY($1))', [emails]);
            await pool.query('DELETE FROM USERS WHERE email = ANY($1)', [emails]);
        }
    } finally { await pool.end(); }
}
