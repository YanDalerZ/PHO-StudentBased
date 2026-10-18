import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import { AuditService } from './AuditService.js';
import { APPROVED_MODULE_SLUGS } from '../types/admin.types.js';
import type {
  AdminDashboardStats,
  AdminModule,
  AdminSchoolWithGeo,
  AdminUserFilters,
  AdminUserSummary,
  ApprovedModuleSlug,
  CreatableUserRole,
  ModulePermissionReplacement,
  PaginatedResult,
} from '../types/admin.types.js';
import type { AdminModulePermission, AdminSchoolAssignment } from '../types/admin.types.js';
import type { EffectiveAccess, PortalRole } from '../types/auth.types.js';

export class AdminServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AdminServiceError';
  }
}

/**
 * Maps database row to sanitized AdminUserSummary
 */
function mapUserSummary(row: Record<string, unknown>): AdminUserSummary {
  return {
    id: row.id as number,
    email: row.email as string,
    portal_role: row.portal_role as AdminUserSummary['portal_role'],
    job_title: row.job_title as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    contact_no: (row.contact_no as string) ?? null,
    is_active: Boolean(row.is_active),
    failed_login_attempts: Number(row.failed_login_attempts ?? 0),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

/**
 * Maps database row to AdminModule
 */
function mapModule(row: Record<string, unknown>): AdminModule {
  return {
    id: row.id as number,
    name: row.name as string,
    slug: row.slug as ApprovedModuleSlug,
    description: (row.description as string) ?? null,
    icon: (row.icon as string) ?? null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

/**
 * Maps database row to AdminSchoolWithGeo
 */
function mapSchoolWithGeo(row: Record<string, unknown>): AdminSchoolWithGeo {
  return {
    id: row.id as number,
    name: row.name as string,
    address: (row.address as string) ?? null,
    barangay_id: (row.barangay_id as number) ?? null,
    district: (row.district as string) ?? null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    barangay_name: (row.barangay_name as string) ?? null,
    municipality_id: (row.municipality_id as number) ?? null,
    municipality_name: (row.municipality_name as string) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  // 1. Users grouped by role
  const roleResult = await pool.query<{ portal_role: string; count: string }>(
    'SELECT portal_role, COUNT(*)::int as count FROM USERS GROUP BY portal_role'
  );
  const usersByRole = {
    school_staff: 0,
    superuser: 0,
    admin: 0,
    total: 0,
  };
  for (const row of roleResult.rows) {
    const count = parseInt(row.count, 10) || 0;
    if (row.portal_role === 'school_staff') usersByRole.school_staff = count;
    else if (row.portal_role === 'superuser') usersByRole.superuser = count;
    else if (row.portal_role === 'admin') usersByRole.admin = count;
    usersByRole.total += count;
  }

  // 2. Total students
  const studentResult = await pool.query<{ total: string }>(
    'SELECT COUNT(*)::int as total FROM STUDENTS'
  );
  const totalStudents = parseInt(studentResult.rows[0]?.total ?? '0', 10);

  // 3. Active modules
  const moduleResult = await pool.query<{ total: string }>(
    'SELECT COUNT(*)::int as total FROM MODULES WHERE is_active = true'
  );
  const activeModules = parseInt(moduleResult.rows[0]?.total ?? '0', 10);

  // 4. Recent account creations (last 10)
  const recentResult = await pool.query<Record<string, unknown>>(
    `SELECT id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
     FROM USERS
     ORDER BY created_at DESC
     LIMIT 10`
  );
  const recentUsers = recentResult.rows.map(mapUserSummary);

  return {
    users_by_role: usersByRole,
    total_students: totalStudents,
    active_modules: activeModules,
    recent_users: recentUsers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function listUsers(filters: AdminUserFilters): Promise<PaginatedResult<AdminUserSummary>> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(`(email ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`);
    params.push(term);
    paramIndex++;
  }

  if (filters.portal_role) {
    conditions.push(`portal_role = $${paramIndex}`);
    params.push(filters.portal_role);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Total count
  const countQuery = `SELECT COUNT(*)::int as total FROM USERS WHERE ${whereClause}`;
  const countResult = await pool.query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Paginated rows
  const limit = Math.max(1, Math.min(100, filters.limit));
  const offset = Math.max(0, (filters.page - 1) * limit);

  const dataParams = [...params, limit, offset];
  const dataQuery = `
    SELECT id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
    FROM USERS
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const dataResult = await pool.query<Record<string, unknown>>(dataQuery, dataParams);
  const data = dataResult.rows.map(mapUserSummary);

  return {
    data,
    total,
    page: filters.page,
    limit,
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: CreatableUserRole;
  job_title: string;
  first_name: string;
  last_name: string;
  contact_no?: string | null | undefined;
}

export async function createUser(input: CreateUserInput, actorId: number, ipAddress?: string): Promise<AdminUserSummary> {
  // Prevent admin creation through API
  if (input.role !== 'school_staff' && input.role !== 'superuser') {
    throw new AdminServiceError(400, "Invalid portal role. Only 'school_staff' and 'superuser' accounts can be created via this API.");
  }
  if (!input.job_title.trim() || input.job_title.trim().length > 100) {
    throw new AdminServiceError(400, 'A job title of 1–100 characters is required.');
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  const passwordHash = await bcrypt.hash(input.password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<Record<string, unknown>>(`
      INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 0)
      RETURNING id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
    `, [
      normalizedEmail, passwordHash,
      input.role === 'school_staff' ? 'teacher' : input.role,
      input.role, input.job_title.trim(), input.first_name.trim(),
      input.last_name.trim(), input.contact_no?.trim() || null,
    ]);
    const inserted = result.rows[0];
    if (!inserted) throw new AdminServiceError(500, 'Failed to create user record.');
    await AuditService.logEvent({
      actor_id: actorId, portal_role: 'admin', action: 'CREATE_USER',
      entity_type: 'USER', entity_id: String(inserted.id), ip_address: ipAddress,
      details: { portal_role: input.role, changed_fields: ['email', 'password', 'portal_role', 'job_title', 'first_name', 'last_name', 'contact_no'] },
    }, client);
    await client.query('COMMIT');
    return mapUserSummary(inserted);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateUserInput {
  email?: string | undefined;
  password?: string | undefined;
  role?: CreatableUserRole | undefined;
  job_title?: string | undefined;
  first_name?: string | undefined;
  last_name?: string | undefined;
  contact_no?: string | null | undefined;
  is_active?: boolean | undefined;
}

export async function updateUser(id: number, input: UpdateUserInput, actorId: number, ipAddress?: string): Promise<AdminUserSummary> {
  if (input.job_title !== undefined && (!input.job_title.trim() || input.job_title.trim().length > 100)) {
    throw new AdminServiceError(400, 'Job title must contain 1–100 characters.');
  }
  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ portal_role: string }>(
      'SELECT portal_role FROM USERS WHERE id = $1 FOR UPDATE', [id],
    );
    const currentRole = existing.rows[0]?.portal_role;
    if (!currentRole) throw new AdminServiceError(404, 'User not found.');
    if (currentRole === 'admin') throw new AdminServiceError(400, 'Administrator accounts cannot be edited through this endpoint.');
    if (input.role !== undefined && input.role !== currentRole && input.job_title === undefined) {
      throw new AdminServiceError(400, 'A job title is required when changing the portal role.');
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    const addField = (field: string, value: unknown) => {
      updateFields.push(`${field} = $${params.length + 1}`);
      params.push(value);
    };
    if (input.email !== undefined) addField('email', input.email.trim().toLowerCase());
    if (passwordHash !== undefined) addField('password_hash', passwordHash);
    if (input.job_title !== undefined) addField('job_title', input.job_title.trim());
    if (input.role !== undefined) {
      if (input.role !== 'school_staff' && input.role !== 'superuser') {
        throw new AdminServiceError(400, 'Invalid portal role.');
      }
      addField('portal_role', input.role);
      addField('role', input.role === 'school_staff' ? 'teacher' : 'superuser');
    }
    if (input.first_name !== undefined) addField('first_name', input.first_name.trim());
    if (input.last_name !== undefined) addField('last_name', input.last_name.trim());
    if (input.contact_no !== undefined) addField('contact_no', input.contact_no?.trim() || null);
    if (input.is_active !== undefined) addField('is_active', input.is_active);
    if (updateFields.length === 0) {
      const fresh = await client.query<Record<string, unknown>>(
        'SELECT id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at FROM USERS WHERE id = $1', [id],
      );
      await client.query('COMMIT');
      return mapUserSummary(fresh.rows[0]!);
    }
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    const result = await client.query<Record<string, unknown>>(`
      UPDATE USERS SET ${updateFields.join(', ')} WHERE id = $${params.length}
      RETURNING id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
    `, params);
    const updated = result.rows[0];
    if (!updated) throw new AdminServiceError(404, 'User not found.');

    const roleChanged = input.role !== undefined && input.role !== currentRole;
    let revokedSchoolIds: number[] = [];
    let revokedModuleIds: number[] = [];
    if (roleChanged) {
      const assignments = await client.query<{ school_id: number }>(
        'UPDATE USER_SCHOOL_ASSIGNMENTS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL RETURNING school_id', [id, actorId],
      );
      const grants = await client.query<{ module_id: number }>(
        'UPDATE USER_MODULE_PERMISSIONS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL RETURNING module_id', [id, actorId],
      );
      revokedSchoolIds = assignments.rows.map(row => row.school_id);
      revokedModuleIds = grants.rows.map(row => row.module_id);
    }
    await AuditService.logEvent({
      actor_id: actorId, portal_role: 'admin', action: 'UPDATE_USER',
      entity_type: 'USER', entity_id: String(id), ip_address: ipAddress,
      details: {
        changed_fields: Object.keys(input).filter(key => input[key as keyof UpdateUserInput] !== undefined),
        role_changed: roleChanged,
        previous_role: roleChanged ? currentRole : undefined,
        new_role: roleChanged ? input.role : undefined,
        revoked_school_ids: revokedSchoolIds,
        revoked_module_ids: revokedModuleIds,
      },
    }, client);
    await client.query('COMMIT');
    return mapUserSummary(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateUserStatusInput {
  is_active?: boolean | undefined;
  action?: 'activate' | 'deactivate' | 'unlock' | 'toggle' | undefined;
  unlock?: boolean | undefined;
}

export async function updateUserStatus(id: number, input: UpdateUserStatusInput, actorId: number, ipAddress?: string): Promise<AdminUserSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query<{ portal_role: string; is_active: boolean; failed_login_attempts: number }>(
      'SELECT portal_role, is_active, failed_login_attempts FROM USERS WHERE id = $1 FOR UPDATE', [id],
    );
    const currentUser = existingResult.rows[0];
    if (!currentUser) throw new AdminServiceError(404, 'User not found.');
    if (currentUser.portal_role === 'admin') throw new AdminServiceError(400, 'Administrator status cannot be changed through this endpoint.');
    const currentActive = currentUser.is_active;
    const currentAttempts = Number(currentUser.failed_login_attempts ?? 0);

    let newActive: boolean;
    let newAttempts: number;
    if (input.unlock === true || input.action === 'unlock') {
      newActive = true;
      newAttempts = 0;
    } else if (input.action === 'activate') {
      newActive = true;
      newAttempts = 0;
    } else if (input.action === 'deactivate') {
      newActive = false;
      newAttempts = currentAttempts;
    } else if (input.action === 'toggle') {
      newActive = !currentActive;
      newAttempts = newActive ? 0 : currentAttempts;
    } else if (input.is_active !== undefined) {
      newActive = input.is_active;
      newAttempts = newActive ? 0 : currentAttempts;
    } else {
      throw new AdminServiceError(400, 'Must provide is_active, action, or unlock flag.');
    }

    const result = await client.query<Record<string, unknown>>(`
      UPDATE USERS
      SET is_active = $1, failed_login_attempts = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
    `, [newActive, newAttempts, id]);
    const updated = result.rows[0];
    if (!updated) throw new AdminServiceError(404, 'User not found.');

    await AuditService.logEvent({
      actor_id: actorId, portal_role: 'admin', action: 'UPDATE_USER_STATUS',
      entity_type: 'USER', entity_id: String(id), ip_address: ipAddress,
      details: { action: input.action ?? (input.unlock ? 'unlock' : 'set_status'), is_active: newActive, failed_login_attempts: newAttempts },
    }, client);
    await client.query('COMMIT');
    return mapUserSummary(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULES MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function listModules(): Promise<AdminModule[]> {
  const query = `
    SELECT id, name, slug, description, icon, is_active, sort_order, created_at, updated_at
    FROM MODULES
    ORDER BY sort_order ASC, id ASC
  `;
  const result = await pool.query<Record<string, unknown>>(query);
  return result.rows.map(mapModule);
}

export interface UpdateModuleInput {
  name?: string | undefined;
  slug?: ApprovedModuleSlug | undefined;
  description?: string | null | undefined;
  icon?: string | null | undefined;
  is_active?: boolean | undefined;
  sort_order?: number | undefined;
}

export async function updateModule(id: number, input: UpdateModuleInput, actorId: number, ipAddress?: string): Promise<AdminModule> {
  if (input.name !== undefined || input.slug !== undefined) {
    throw new AdminServiceError(400, 'Core module names and slugs cannot be changed.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ slug: string; is_active: boolean }>(
      'SELECT slug, is_active FROM MODULES WHERE id = $1 FOR UPDATE', [id],
    );
    const current = existing.rows[0];
    if (!current) throw new AdminServiceError(404, 'Module not found.');
    if (!APPROVED_MODULE_SLUGS.includes(current.slug as ApprovedModuleSlug)) {
      throw new AdminServiceError(409, 'Unrecognized module cannot be governed through this API.');
    }
    const updateFields: string[] = [];
    const params: unknown[] = [];
    const addField = (field: string, value: unknown) => {
      updateFields.push(`${field} = $${params.length + 1}`);
      params.push(value);
    };
    if (input.description !== undefined) addField('description', input.description?.trim() || null);
    if (input.icon !== undefined) addField('icon', input.icon?.trim() || null);
    if (input.is_active !== undefined) addField('is_active', input.is_active);
    if (input.sort_order !== undefined) addField('sort_order', input.sort_order);
    if (updateFields.length === 0) {
      const fresh = await client.query<Record<string, unknown>>(
        'SELECT id, name, slug, description, icon, is_active, sort_order, created_at, updated_at FROM MODULES WHERE id = $1', [id],
      );
      await client.query('COMMIT');
      return mapModule(fresh.rows[0]!);
    }
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    const changed = await client.query<Record<string, unknown>>(`
      UPDATE MODULES SET ${updateFields.join(', ')} WHERE id = $${params.length}
      RETURNING id, name, slug, description, icon, is_active, sort_order, created_at, updated_at
    `, params);
    const updated = changed.rows[0];
    if (!updated) throw new AdminServiceError(404, 'Module not found.');
    const stateChanged = input.is_active !== undefined && input.is_active !== current.is_active;
    await AuditService.logEvent({
      actor_id: actorId, portal_role: 'admin',
      action: stateChanged ? (input.is_active ? 'ACTIVATE_MODULE' : 'DEACTIVATE_MODULE') : 'UPDATE_MODULE',
      entity_type: 'MODULE', entity_id: String(id), ip_address: ipAddress,
      details: {
        module_slug: current.slug,
        changed_fields: Object.keys(input).filter(key => input[key as keyof UpdateModuleInput] !== undefined),
        previous_active: current.is_active,
        is_active: updated.is_active,
      },
    }, client);
    await client.query('COMMIT');
    return mapModule(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOLS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface ListSchoolsFilters {
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export async function listSchools(filters: ListSchoolsFilters): Promise<PaginatedResult<AdminSchoolWithGeo>> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(`(s.name ILIKE $${paramIndex} OR s.district ILIKE $${paramIndex} OR b.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`);
    params.push(term);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM SCHOOLS s
    LEFT JOIN BARANGAYS b ON s.barangay_id = b.id
    LEFT JOIN MUNICIPALITIES m ON b.municipality_id = m.id
    WHERE ${whereClause}
  `;
  const countResult = await pool.query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  const dataParams = [...params, limit, offset];
  const dataQuery = `
    SELECT 
      s.id,
      s.name,
      s.address,
      s.barangay_id,
      s.district,
      s.is_active,
      s.created_at,
      s.updated_at,
      b.name AS barangay_name,
      m.id AS municipality_id,
      m.name AS municipality_name
    FROM SCHOOLS s
    LEFT JOIN BARANGAYS b ON s.barangay_id = b.id
    LEFT JOIN MUNICIPALITIES m ON b.municipality_id = m.id
    WHERE ${whereClause}
    ORDER BY s.name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const dataResult = await pool.query<Record<string, unknown>>(dataQuery, dataParams);
  const data = dataResult.rows.map(mapSchoolWithGeo);

  return {
    data,
    total,
    page,
    limit,
  };
}

export interface CreateSchoolInput {
  name: string;
  address?: string | null | undefined;
  barangay_id: number;
  municipality_id?: number | null | undefined;
  district?: string | null | undefined;
  is_active?: boolean | undefined;
}

const schoolWithGeoQuery = `
  SELECT s.id, s.name, s.address, s.barangay_id, s.district, s.is_active,
         s.created_at, s.updated_at, b.name AS barangay_name,
         m.id AS municipality_id, m.name AS municipality_name
  FROM SCHOOLS s
  LEFT JOIN BARANGAYS b ON b.id = s.barangay_id
  LEFT JOIN MUNICIPALITIES m ON m.id = b.municipality_id
  WHERE s.id = $1
`;

export async function createSchool(input: CreateSchoolInput, actorId: number, ipAddress?: string): Promise<AdminSchoolWithGeo> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const barangay = await client.query<{ municipality_id: number }>(
      'SELECT municipality_id FROM BARANGAYS WHERE id = $1', [input.barangay_id],
    );
    if (!barangay.rows[0]) throw new AdminServiceError(400, 'Selected barangay does not exist.');
    if (input.municipality_id != null && barangay.rows[0].municipality_id !== input.municipality_id) {
      throw new AdminServiceError(400, 'Selected barangay does not belong to the selected municipality.');
    }
    const inserted = await client.query<{ id: number }>(`
      INSERT INTO SCHOOLS (name, address, barangay_id, district, is_active)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [input.name.trim(), input.address?.trim() || null, input.barangay_id,
      input.district?.trim() || null, input.is_active ?? true]);
    const schoolId = inserted.rows[0]?.id;
    if (!schoolId) throw new AdminServiceError(500, 'Failed to create school record.');
    await AuditService.logEvent({
      actor_id: actorId, portal_role: 'admin', action: 'CREATE_SCHOOL',
      entity_type: 'SCHOOL', entity_id: String(schoolId), school_id: schoolId, ip_address: ipAddress,
      details: { barangay_id: input.barangay_id, municipality_id: barangay.rows[0].municipality_id, is_active: input.is_active ?? true },
    }, client);
    const fullRecord = await client.query<Record<string, unknown>>(schoolWithGeoQuery, [schoolId]);
    const row = fullRecord.rows[0];
    if (!row) throw new AdminServiceError(500, 'Failed to fetch newly created school record.');
    await client.query('COMMIT');
    return mapSchoolWithGeo(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface UpdateSchoolInput {
  name?: string | undefined;
  address?: string | null | undefined;
  barangay_id?: number | undefined;
  municipality_id?: number | null | undefined;
  district?: string | null | undefined;
  is_active?: boolean | undefined;
}

export async function updateSchool(id: number, input: UpdateSchoolInput, actorId: number, ipAddress?: string): Promise<AdminSchoolWithGeo> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializes invitation creation and school assignment against deactivation
    // while allowing foreign-key KEY SHARE checks on historical school rows.
    const existing = await client.query<{ barangay_id: number; is_active: boolean }>(
      'SELECT barangay_id, is_active FROM SCHOOLS WHERE id = $1 FOR NO KEY UPDATE', [id],
    );
    const current = existing.rows[0];
    if (!current) throw new AdminServiceError(404, 'School not found.');

    const effectiveBarangayId = input.barangay_id ?? current.barangay_id;
    const barangay = await client.query<{ municipality_id: number }>(
      'SELECT municipality_id FROM BARANGAYS WHERE id = $1', [effectiveBarangayId],
    );
    if (!barangay.rows[0]) throw new AdminServiceError(400, 'Selected barangay does not exist.');
    if (input.municipality_id != null && barangay.rows[0].municipality_id !== input.municipality_id) {
      throw new AdminServiceError(400, 'Selected barangay does not belong to the selected municipality.');
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    const addField = (field: string, value: unknown) => {
      updateFields.push(`${field} = $${params.length + 1}`);
      params.push(value);
    };
    if (input.name !== undefined) addField('name', input.name.trim());
    if (input.address !== undefined) addField('address', input.address?.trim() || null);
    if (input.barangay_id !== undefined) addField('barangay_id', input.barangay_id);
    if (input.district !== undefined) addField('district', input.district?.trim() || null);
    if (input.is_active !== undefined) addField('is_active', input.is_active);
    const deactivating = current.is_active && input.is_active === false;
    let revokedAssignments = 0;
    let revokedInvitations = 0;
    if (updateFields.length > 0) {
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      await client.query(`UPDATE SCHOOLS SET ${updateFields.join(', ')} WHERE id = $${params.length}`, params);
    }
    if (deactivating) {
      const assignments = await client.query(`
        UPDATE USER_SCHOOL_ASSIGNMENTS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
        WHERE school_id = $1 AND revoked_at IS NULL
      `, [id, actorId]);
      const invitations = await client.query(`
        UPDATE REGISTRATION_INVITATIONS
        SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by = $2,
            revocation_reason = 'school_deactivated'
        WHERE school_id = $1 AND status = 'active'
      `, [id, actorId]);
      revokedAssignments = assignments.rowCount ?? 0;
      revokedInvitations = invitations.rowCount ?? 0;
    }
    if (updateFields.length > 0) {
      await AuditService.logEvent({
        actor_id: actorId, portal_role: 'admin',
        action: deactivating ? 'DEACTIVATE_SCHOOL' : 'UPDATE_SCHOOL',
        entity_type: 'SCHOOL', entity_id: String(id), school_id: id, ip_address: ipAddress,
        details: {
          changed_fields: Object.keys(input).filter(key => input[key as keyof UpdateSchoolInput] !== undefined),
          barangay_id: effectiveBarangayId,
          municipality_id: barangay.rows[0].municipality_id,
          previous_active: current.is_active,
          is_active: input.is_active ?? current.is_active,
          revoked_assignment_count: revokedAssignments,
          revoked_invitation_count: revokedInvitations,
        },
      }, client);
    }
    const result = await client.query<Record<string, unknown>>(schoolWithGeoQuery, [id]);
    const row = result.rows[0];
    if (!row) throw new AdminServiceError(404, 'School not found.');
    await client.query('COMMIT');
    return mapSchoolWithGeo(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSIONS AND ACCESS
// ─────────────────────────────────────────────────────────────────────────────

export async function getModulePermissions(userId: number): Promise<AdminModulePermission[]> {
  const query = `
    SELECT 
      ump.module_id,
      m.slug as module_slug,
      m.name as module_name,
      ump.can_view,
      ump.can_create,
      ump.can_edit,
      ump.can_approve_registration,
      ump.can_report,
      ump.can_export,
      ump.can_manage_targets
    FROM USER_MODULE_PERMISSIONS ump
    JOIN MODULES m ON ump.module_id = m.id
    WHERE ump.user_id = $1 AND ump.revoked_at IS NULL
    ORDER BY m.sort_order, m.id
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.map(row => ({
    module_id: row.module_id,
    module_slug: row.module_slug,
    module_name: row.module_name,
    can_view: row.can_view,
    can_create: row.can_create,
    can_edit: row.can_edit,
    can_approve_registration: row.can_approve_registration,
    can_report: row.can_report,
    can_export: row.can_export,
    can_manage_targets: row.can_manage_targets,
  }));
}

interface AccessTargetRow {
  id: number;
  portal_role: PortalRole;
}

interface ModuleValidationRow {
  id: number;
  slug: ApprovedModuleSlug;
}

const permissionActions = [
  'can_view',
  'can_create',
  'can_edit',
  'can_approve_registration',
  'can_report',
  'can_export',
  'can_manage_targets',
] as const;

function assertUniquePositiveIds(ids: number[], label: string): void {
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new AdminServiceError(400, `${label} must contain only positive integer IDs.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new AdminServiceError(400, `${label} contains duplicate IDs.`);
  }
}

async function lockAccessTarget(
  client: import('pg').PoolClient,
  userId: number,
): Promise<AccessTargetRow> {
  const result = await client.query<AccessTargetRow>(
    'SELECT id, portal_role FROM USERS WHERE id = $1 FOR UPDATE',
    [userId],
  );
  const target = result.rows[0];
  if (!target) throw new AdminServiceError(404, 'User not found.');
  return target;
}

export async function updateModulePermissions(
  userId: number,
  permissions: ModulePermissionReplacement[],
  grantedBy: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await lockAccessTarget(client, userId);
    if (target.portal_role === 'admin' && permissions.length > 0) {
      throw new AdminServiceError(400, 'Administrator accounts cannot receive clinical module permissions.');
    }

    const moduleIds = permissions.map(permission => permission.module_id);
    assertUniquePositiveIds(moduleIds, 'Module permissions');
    const modules = moduleIds.length === 0
      ? { rows: [] as ModuleValidationRow[] }
      : await client.query<ModuleValidationRow>(
          'SELECT id, slug FROM MODULES WHERE id = ANY($1::int[]) ORDER BY id',
          [moduleIds],
        );
    if (modules.rows.length !== moduleIds.length) {
      throw new AdminServiceError(400, 'One or more module IDs are invalid.');
    }
    if (modules.rows.some(module => !APPROVED_MODULE_SLUGS.includes(module.slug))) {
      throw new AdminServiceError(400, 'Module permissions are restricted to the five approved clinical modules.');
    }
    const moduleById = new Map(modules.rows.map(module => [module.id, module]));

    for (const permission of permissions) {
      const module = moduleById.get(permission.module_id);
      if (!module) throw new AdminServiceError(400, 'One or more module IDs are invalid.');
      const actions = permissionActions.filter(action => permission[action]);
      if (actions.length === 0) {
        throw new AdminServiceError(400, `Module ${module.slug} must include at least one action grant.`);
      }
      if ((permission.can_create || permission.can_edit) && !permission.can_view) {
        throw new AdminServiceError(
          400,
          `Module ${module.slug} requires can_view when can_create or can_edit is granted.`,
        );
      }
      if (permission.can_export && !permission.can_report && !permission.can_view) {
        throw new AdminServiceError(
          400,
          `Module ${module.slug} requires can_report or can_view when can_export is granted.`,
        );
      }
      if (permission.can_manage_targets && !permission.can_report) {
        throw new AdminServiceError(400, `Module ${module.slug} requires can_report when target management is granted.`);
      }
      if (permission.can_approve_registration
        && (target.portal_role !== 'school_staff' || module.slug !== 'patient-info')) {
        throw new AdminServiceError(
          400,
          'Registration approval may be granted only to school staff for Patient Information.',
        );
      }
    }

    const revoked = await client.query(
      'UPDATE USER_MODULE_PERMISSIONS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, grantedBy]
    );
    
    for (const perm of permissions) {
      if (!perm.module_id) continue;
      await client.query(`
        INSERT INTO USER_MODULE_PERMISSIONS 
        (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export, can_manage_targets, granted_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        userId, perm.module_id, 
        perm.can_view, perm.can_create, perm.can_edit,
        perm.can_approve_registration, perm.can_report, perm.can_export, perm.can_manage_targets ?? false,
        grantedBy
      ]);
    }

    await AuditService.logEvent({
      actor_id: grantedBy,
      portal_role: 'admin',
      action: 'UPDATE_MODULE_PERMISSIONS',
      entity_type: 'USER',
      entity_id: String(userId),
      details: {
        revoked_count: revoked.rowCount ?? 0,
        new_grant_count: permissions.length,
        grants: permissions.map(permission => ({
          module_id: permission.module_id,
          actions: permissionActions.filter(action => permission[action]),
        })),
      }
    }, client);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSchoolAssignments(userId: number): Promise<AdminSchoolAssignment[]> {
  const query = `
    SELECT s.id as school_id, s.name as school_name
    FROM USER_SCHOOL_ASSIGNMENTS usa
    JOIN SCHOOLS s ON usa.school_id = s.id
    WHERE usa.user_id = $1 AND usa.revoked_at IS NULL AND s.is_active = TRUE
    ORDER BY s.name, s.id
  `;
  const result = await pool.query(query, [userId]);
  return result.rows;
}

export async function updateSchoolAssignments(userId: number, schoolIds: number[], assignedBy: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await lockAccessTarget(client, userId);
    if (target.portal_role !== 'school_staff' && schoolIds.length > 0) {
      throw new AdminServiceError(400, 'School assignments may be granted only to school staff accounts.');
    }
    assertUniquePositiveIds(schoolIds, 'School assignments');
    if (schoolIds.length > 0) {
      const schools = await client.query<{ id: number }>(
        'SELECT id FROM SCHOOLS WHERE id = ANY($1::int[]) AND is_active = TRUE ORDER BY id FOR SHARE',
        [schoolIds],
      );
      if (schools.rows.length !== schoolIds.length) {
        throw new AdminServiceError(400, 'One or more schools do not exist or are inactive.');
      }
    }

    const revoked = await client.query(
      'UPDATE USER_SCHOOL_ASSIGNMENTS SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, assignedBy]
    );
    
    for (const schoolId of schoolIds) {
      await client.query(`
        INSERT INTO USER_SCHOOL_ASSIGNMENTS (user_id, school_id, assigned_by)
        VALUES ($1, $2, $3)
      `, [userId, schoolId, assignedBy]);
    }

    await AuditService.logEvent({
      actor_id: assignedBy,
      portal_role: 'admin',
      action: 'UPDATE_SCHOOL_ASSIGNMENTS',
      entity_type: 'USER',
      entity_id: String(userId),
      details: {
        revoked_count: revoked.rowCount ?? 0,
        new_assignment_count: schoolIds.length,
        school_ids: schoolIds,
      }
    }, client);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getEffectiveAccess(userId: number): Promise<EffectiveAccess> {
  const schools = await getSchoolAssignments(userId);
  const perms = await getModulePermissions(userId);
  
  const effectiveAccess: EffectiveAccess = {
    assignedSchoolIds: schools.map(s => s.school_id),
    modulePermissions: {
        'patient-info': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false, can_manage_targets: false },
        'oral-health': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false, can_manage_targets: false },
        'deworming': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false, can_manage_targets: false },
        'immunization': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false, can_manage_targets: false },
        'vital-signs': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false, can_manage_targets: false },
    }
  };

  for (const perm of perms) {
    effectiveAccess.modulePermissions[perm.module_slug] = {
      can_view: perm.can_view,
      can_create: perm.can_create,
      can_edit: perm.can_edit,
      can_approve_registration: perm.can_approve_registration,
      can_report: perm.can_report,
      can_export: perm.can_export,
      can_manage_targets: perm.can_manage_targets ?? false,
    };
  }

  return effectiveAccess;
}
