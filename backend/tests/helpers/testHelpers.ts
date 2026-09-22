import pool from '../../src/database/db.js';
import bcrypt from 'bcryptjs';

export async function createSchoolStaffUser(email: string, firstName: string, lastName: string, apiBaseUrl: string) {
    const hash = await bcrypt.hash('password123', 10);
    const res = await pool.query(`
        INSERT INTO USERS (email, password_hash, role, first_name, last_name, is_active)
        VALUES ($1, $2, 'school_staff', $3, $4, true)
        RETURNING *
    `, [email, hash, firstName, lastName]);
    
    const user = res.rows[0];
    
    const loginRes = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' })
    });
    
    interface LoginResponse {
        token: string;
        user?: unknown;
    }
    const loginData = (await loginRes.json()) as LoginResponse;
    return { ...user, token: loginData.token };
}

export async function assignUserToSchool(userId: number, schoolId: number, assignedBy: number) {
    await pool.query(`
        INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by)
        VALUES ($1, $2, $3)
    `, [userId, schoolId, assignedBy]);
}

export async function grantModulePermissions(userId: number, moduleSlug: string, permissions: { can_view?: boolean, can_create?: boolean, can_edit?: boolean, can_report?: boolean }, grantedBy: number) {
    const modRes = await pool.query('SELECT id FROM MODULES WHERE slug = $1', [moduleSlug]);
    if (modRes.rows.length === 0) throw new Error(`Module ${moduleSlug} not found`);
    const moduleId = modRes.rows[0].id;
    
    await pool.query(`
        INSERT INTO USER_MODULE_PERMISSIONS (user_id, module_id, can_view, can_create, can_edit, can_report, granted_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, module_id) WHERE revoked_at IS NULL DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_create = EXCLUDED.can_create,
            can_edit = EXCLUDED.can_edit,
            can_report = EXCLUDED.can_report
    `, [userId, moduleId, permissions.can_view ?? false, permissions.can_create ?? false, permissions.can_edit ?? false, permissions.can_report ?? false, grantedBy]);
}

export async function revokeModulePermissions(userId: number, moduleSlug: string, revokedBy: number) {
    const modRes = await pool.query('SELECT id FROM MODULES WHERE slug = $1', [moduleSlug]);
    if (modRes.rows.length === 0) throw new Error(`Module ${moduleSlug} not found`);
    const moduleId = modRes.rows[0].id;
    
    await pool.query(`
        UPDATE USER_MODULE_PERMISSIONS 
        SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $3
        WHERE user_id = $1 AND module_id = $2 AND revoked_at IS NULL
    `, [userId, moduleId, revokedBy]);
}
