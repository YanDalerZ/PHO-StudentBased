import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const stamp = Date.now();
const users: number[] = [];
let studentId: number | undefined;
let server: ReturnType<typeof app.listen> | undefined;
const secret = process.env.JWT_SECRET;
assert.ok(secret);

try {
    const schools = await pool.query<{ id: number; name: string }>('SELECT id, name FROM SCHOOLS WHERE is_active = TRUE ORDER BY id LIMIT 2');
    assert.equal(schools.rows.length, 2);
    const school = schools.rows[0]!;
    const other = schools.rows[1]!;
    const makeUser = async (role: 'school_staff' | 'superuser' | 'admin', schoolId?: number) => {
        const email = `context_${stamp}_${users.length}@test.invalid`;
        const result = await pool.query<{ id: number }>(`
            INSERT INTO USERS (email, password_hash, role, portal_role, first_name, last_name, is_active)
            VALUES ($1, 'unused', $2, $3, 'Context', 'Tester', TRUE) RETURNING id
        `, [email, role === 'school_staff' ? 'teacher' : role, role]);
        const id = result.rows[0]!.id;
        users.push(id);
        if (schoolId) await pool.query('INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by) VALUES ($1, $2, $1)', [id, schoolId]);
        return { id, token: jwt.sign({ id, email, portal_role: role }, secret, { expiresIn: '10m' }) };
    };
    const staff = await makeUser('school_staff', school.id);
    const outside = await makeUser('school_staff', other.id);
    const superuser = await makeUser('superuser');
    const admin = await makeUser('admin');
    const grant = async (id: number, slug: string) => pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS (user_id, module_id, can_view, granted_by)
        SELECT $1, id, TRUE, $1 FROM MODULES WHERE slug = $2
    `, [id, slug]);
    await grant(outside.id, 'oral-health');
    await grant(superuser.id, 'oral-health');
    const student = await pool.query<{ id: number }>(`
        INSERT INTO STUDENTS (first_name, middle_name, last_name, sex, date_of_birth,
            student_lrn, school_id, grade_level, section, registered_by, mobile)
        VALUES ('Canonical', 'Middle', 'Student', 'Female', CURRENT_DATE - INTERVAL '12 years',
            $1, $2, 'Grade 7', 'A', $3, '09170000000') RETURNING id
    `, [String(stamp).slice(-12), school.id, staff.id]);
    studentId = student.rows[0]!.id;
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const get = async (path: string, token?: string) => {
        const response = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() as { data: Record<string, unknown> } };
    };
    const path = `/students/${studentId}/module-context`;
    assert.equal((await get(path)).status, 401);
    assert.equal((await get(path, admin.token)).status, 403);
    assert.equal((await get(path, staff.token)).status, 403);
    assert.equal((await get(path, outside.token)).status, 403);
    assert.equal((await get(path, superuser.token)).status, 200);
    assert.equal((await get(path + '?module=vital-signs', superuser.token)).status, 403);

    for (const slug of ['oral-health', 'deworming', 'immunization', 'vital-signs']) {
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = $1', [staff.id]);
        await grant(staff.id, slug);
        const result = await get(path + `?module=${slug}`, staff.token);
        assert.equal(result.status, 200, slug);
        assert.equal(result.cache, 'no-store');
        assert.deepEqual(Object.keys(result.body.data).sort(), [
            'id', 'student_lrn', 'first_name', 'middle_name', 'last_name', 'suffix',
            'date_of_birth', 'age', 'sex', 'school_id', 'school_name', 'grade_level', 'section',
        ].sort());
        assert.equal(result.body.data.age, 12);
        assert.match(String(result.body.data.date_of_birth), /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(result.body.data.school_name, school.name);
        assert.equal(result.body.data.section, 'A');
        assert.equal((await get(`/students/${studentId}`, staff.token)).status, 403, 'Clinical-only grant must not unlock full patient profile');
        assert.equal((await get(path, staff.token)).status, 200, 'Any qualifying view grant supports generic context');
    }
    await pool.query("UPDATE STUDENTS SET section = 'Corrected', first_name = 'Updated' WHERE id = $1", [studentId]);
    const updated = await get(path, staff.token);
    assert.equal(updated.body.data.section, 'Corrected');
    assert.equal(updated.body.data.first_name, 'Updated');
    assert.equal((await get('/students/invalid/module-context', staff.token)).status, 400);
    assert.equal((await get('/students/2147483647/module-context', staff.token)).status, 404);
    assert.equal((await get(path + '?module=unknown', staff.token)).status, 400);
    await pool.query('UPDATE USER_MODULE_PERMISSIONS SET revoked_at = NOW() WHERE user_id = $1', [staff.id]);
    assert.equal((await get(path, staff.token)).status, 403, 'Revocation applies with the same JWT');
    await pool.query('UPDATE USER_SCHOOL_ASSIGNMENTS SET revoked_at = NOW() WHERE user_id = $1', [outside.id]);
    assert.equal((await get(path, outside.token)).status, 403);
    console.log('Phase 2 Milestone 5 canonical context authorization, data minimization, and refresh checks passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (studentId) await pool.query('DELETE FROM STUDENTS WHERE id = $1', [studentId]);
    if (users.length) {
        await pool.query('DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[])', [users]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [users]);
    }
    await pool.end();
}
