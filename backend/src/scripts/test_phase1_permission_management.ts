import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { app } from '../index.js';
import {
    AdminServiceError,
    getModulePermissions,
    getSchoolAssignments,
    updateModulePermissions,
    updateSchoolAssignments,
} from '../services/admin.service.js';
import { AuditService } from '../services/AuditService.js';
import type { ModulePermissionReplacement } from '../types/admin.types.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);

const createdUserIds: number[] = [];
let inactiveSchoolId: number | undefined;
let server: ReturnType<typeof app.listen> | undefined;

function permission(moduleId: number, overrides: Partial<ModulePermissionReplacement> = {}): ModulePermissionReplacement {
    return {
        module_id: moduleId,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_approve_registration: false,
        can_report: false,
        can_export: false,
        ...overrides,
    };
}

async function expectAdminError(operation: () => Promise<void>, message: RegExp): Promise<void> {
    await assert.rejects(operation, (error: unknown) => {
        return error instanceof AdminServiceError
            && error.statusCode === 400
            && message.test(error.message);
    });
}

try {
    const actorResult = await pool.query<{ id: number; email: string }>(`
        SELECT id, email FROM USERS
        WHERE portal_role = 'admin' AND is_active = TRUE
        ORDER BY id LIMIT 1
    `);
    const actor = actorResult.rows[0];
    assert.ok(actor, 'An active admin fixture is required.');

    const modulesResult = await pool.query<{ id: number; slug: string }>(`
        SELECT id, slug FROM MODULES ORDER BY id
    `);
    const moduleId = (slug: string): number => {
        const id = modulesResult.rows.find(module => module.slug === slug)?.id;
        assert.ok(id, `Missing module fixture: ${slug}`);
        return id;
    };
    const patientInfoId = moduleId('patient-info');
    const oralHealthId = moduleId('oral-health');

    const schoolsResult = await pool.query<{ id: number; barangay_id: number | null }>(`
        SELECT id, barangay_id FROM SCHOOLS WHERE is_active = TRUE ORDER BY id
    `);
    const activeSchool = schoolsResult.rows[0];
    assert.ok(activeSchool, 'An active school fixture is required.');

    const stamp = Date.now();
    const insertUser = async (portalRole: 'school_staff' | 'superuser' | 'admin'): Promise<number> => {
        const legacyRole = portalRole === 'school_staff' ? 'teacher' : portalRole;
        const result = await pool.query<{ id: number }>(`
            INSERT INTO USERS (
                email, password_hash, role, portal_role, job_title,
                first_name, last_name, is_active, failed_login_attempts
            ) VALUES ($1, 'test-only-hash', $2, $3, 'QA Fixture', 'Phase', 'Three', TRUE, 0)
            RETURNING id
        `, [`phase1_m3_${portalRole}_${stamp}@pho.test`, legacyRole, portalRole]);
        const id = result.rows[0]?.id;
        assert.ok(id);
        createdUserIds.push(id);
        return id;
    };

    const staffId = await insertUser('school_staff');
    const superuserId = await insertUser('superuser');
    const adminTargetId = await insertUser('admin');

    await assert.rejects(
        () => updateModulePermissions(99999999, [], actor.id),
        (error: unknown) => error instanceof AdminServiceError && error.statusCode === 404,
    );
    await assert.rejects(
        () => updateSchoolAssignments(99999999, [], actor.id),
        (error: unknown) => error instanceof AdminServiceError && error.statusCode === 404,
    );

    const inactiveSchool = await pool.query<{ id: number }>(`
        INSERT INTO SCHOOLS (name, address, barangay_id, district, is_active)
        VALUES ($1, 'Test only', $2, 'QA', FALSE)
        RETURNING id
    `, [`Phase 1 M3 inactive school ${stamp}`, activeSchool.barangay_id]);
    inactiveSchoolId = inactiveSchool.rows[0]?.id;
    assert.ok(inactiveSchoolId);

    await updateModulePermissions(staffId, [
        permission(patientInfoId, { can_view: true, can_approve_registration: true }),
        permission(oralHealthId, { can_view: true }),
    ], actor.id);
    assert.equal((await getModulePermissions(staffId)).length, 2);

    await expectAdminError(
        () => updateModulePermissions(staffId, [
            permission(patientInfoId, { can_view: true }),
            permission(patientInfoId, { can_edit: true }),
        ], actor.id),
        /duplicate/i,
    );
    assert.equal((await getModulePermissions(staffId)).length, 2, 'Rejected duplicates must not replace grants.');

    await expectAdminError(
        () => updateModulePermissions(staffId, [permission(99999999, { can_view: true })], actor.id),
        /module IDs are invalid/i,
    );
    await expectAdminError(
        () => updateModulePermissions(staffId, [
            permission(oralHealthId, { can_view: true, can_approve_registration: true }),
        ], actor.id),
        /only to school staff for Patient Information/i,
    );
    await expectAdminError(
        () => updateModulePermissions(superuserId, [
            permission(patientInfoId, { can_view: true, can_approve_registration: true }),
        ], actor.id),
        /only to school staff for Patient Information/i,
    );
    await expectAdminError(
        () => updateModulePermissions(adminTargetId, [permission(patientInfoId, { can_view: true })], actor.id),
        /Administrator accounts cannot receive/i,
    );
    await expectAdminError(
        () => updateModulePermissions(staffId, [permission(patientInfoId)], actor.id),
        /at least one action grant/i,
    );

    await updateModulePermissions(superuserId, [
        permission(oralHealthId, { can_view: true, can_report: true }),
    ], actor.id);
    assert.equal((await getModulePermissions(superuserId))[0]?.can_approve_registration, false);

    await updateSchoolAssignments(staffId, [activeSchool.id], actor.id);
    assert.deepEqual((await getSchoolAssignments(staffId)).map(school => school.school_id), [activeSchool.id]);
    const schoolAudit = await pool.query<{ details: Record<string, unknown> }>(`
        SELECT details FROM AUDIT_EVENTS
        WHERE action = 'UPDATE_SCHOOL_ASSIGNMENTS'
          AND entity_type = 'USER' AND entity_id = $1
        ORDER BY id DESC LIMIT 1
    `, [String(staffId)]);
    assert.deepEqual(Object.keys(schoolAudit.rows[0]?.details ?? {}).sort(), [
        'new_assignment_count', 'revoked_count', 'school_ids',
    ]);
    await expectAdminError(
        () => updateSchoolAssignments(staffId, [activeSchool.id, activeSchool.id], actor.id),
        /duplicate/i,
    );
    assert.deepEqual(
        (await getSchoolAssignments(staffId)).map(school => school.school_id),
        [activeSchool.id],
        'Rejected duplicate schools must not replace assignments.',
    );
    await expectAdminError(
        () => updateSchoolAssignments(staffId, [inactiveSchoolId!], actor.id),
        /do not exist or are inactive/i,
    );
    await expectAdminError(
        () => updateSchoolAssignments(superuserId, [activeSchool.id], actor.id),
        /only to school staff/i,
    );
    await expectAdminError(
        () => updateSchoolAssignments(adminTargetId, [activeSchool.id], actor.id),
        /only to school staff/i,
    );

    await updateModulePermissions(staffId, [
        permission(oralHealthId, { can_view: true, can_edit: true }),
    ], actor.id);
    const activeAfterReplacement = await getModulePermissions(staffId);
    assert.deepEqual(activeAfterReplacement.map(grant => grant.module_id), [oralHealthId]);
    const history = await pool.query<{ revoked_rows: number; attributed_rows: number }>(`
        SELECT COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked_rows,
               COUNT(*) FILTER (WHERE revoked_at IS NOT NULL AND revoked_by = $2)::int AS attributed_rows
        FROM USER_MODULE_PERMISSIONS WHERE user_id = $1
    `, [staffId, actor.id]);
    assert.ok((history.rows[0]?.revoked_rows ?? 0) >= 2);
    assert.equal(history.rows[0]?.attributed_rows, history.rows[0]?.revoked_rows);

    const audit = await pool.query<{ details: Record<string, unknown> }>(`
        SELECT details FROM AUDIT_EVENTS
        WHERE action = 'UPDATE_MODULE_PERMISSIONS'
          AND entity_type = 'USER' AND entity_id = $1
        ORDER BY id DESC LIMIT 1
    `, [String(staffId)]);
    assert.deepEqual(Object.keys(audit.rows[0]?.details ?? {}).sort(), [
        'grants', 'new_grant_count', 'revoked_count',
    ]);

    const originalLogEvent = AuditService.logEvent;
    AuditService.logEvent = async () => { throw new Error('forced audit failure'); };
    try {
        await assert.rejects(
            () => updateModulePermissions(staffId, [permission(patientInfoId, { can_view: true })], actor.id),
            /forced audit failure/,
        );
    } finally {
        AuditService.logEvent = originalLogEvent;
    }
    assert.deepEqual(
        (await getModulePermissions(staffId)).map(grant => grant.module_id),
        [oralHealthId],
        'A failed audit write must roll back the permission replacement.',
    );

    AuditService.logEvent = async () => { throw new Error('forced school audit failure'); };
    try {
        await assert.rejects(
            () => updateSchoolAssignments(staffId, [], actor.id),
            /forced school audit failure/,
        );
    } finally {
        AuditService.logEvent = originalLogEvent;
    }
    assert.deepEqual(
        (await getSchoolAssignments(staffId)).map(school => school.school_id),
        [activeSchool.id],
        'A failed audit write must roll back the school-assignment replacement.',
    );

    const jwtSecret = process.env.JWT_SECRET;
    assert.ok(jwtSecret, 'JWT_SECRET is required for HTTP boundary checks.');
    const token = jwt.sign({ id: actor.id, email: actor.email, portal_role: 'admin' }, jwtSecret, { expiresIn: '5m' });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve);
        server!.once('error', reject);
    });
    const port = (server.address() as AddressInfo).port;
    const request = async (prefix: '/api' | '/api/v1', path: string, body: unknown): Promise<Response> => {
        return fetch(`http://127.0.0.1:${port}${prefix}${path}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    };
    const duplicateModuleBody = [
        { module_id: patientInfoId, can_view: true },
        { module_id: patientInfoId, can_edit: true },
    ];
    assert.equal(
        (await request('/api/v1', `/admin/users/${staffId}/module-permissions`, duplicateModuleBody)).status,
        400,
    );
    assert.equal(
        (await request('/api', `/admin/users/${staffId}/school-assignments`, {
            school_ids: [activeSchool.id, activeSchool.id],
        })).status,
        400,
    );

    console.log('Phase 1 permission-management checks passed.');
} finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (createdUserIds.length > 0) {
        await pool.query(`
            DELETE FROM AUDIT_EVENTS
            WHERE entity_type = 'USER' AND entity_id = ANY($1::text[])
        `, [createdUserIds.map(String)]);
        await pool.query('DELETE FROM USERS WHERE id = ANY($1::int[])', [createdUserIds]);
    }
    if (inactiveSchoolId) await pool.query('DELETE FROM SCHOOLS WHERE id = $1', [inactiveSchoolId]);
    await pool.end();
}
