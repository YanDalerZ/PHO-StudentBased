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
  first_name: string;
  last_name: string;
  contact_no?: string | null | undefined;
}

export async function createUser(input: CreateUserInput): Promise<AdminUserSummary> {
  // Prevent admin creation through API
  if (input.role !== 'school_staff' && input.role !== 'superuser') {
    throw new AdminServiceError(400, "Invalid role. Only 'teacher' and 'superuser' roles can be created via this API.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  // Check email conflict
  const existing = await pool.query('SELECT id FROM USERS WHERE LOWER(email) = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    throw new AdminServiceError(409, 'A user with this email address already exists.');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const insertQuery = `
    INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 0)
    RETURNING id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
  `;

  const result = await pool.query<Record<string, unknown>>(insertQuery, [
    normalizedEmail,
    passwordHash,
    input.role === 'school_staff' ? 'teacher' : input.role,
    input.role,
    input.role === 'superuser' ? 'Administrator' : 'Teacher',
    input.first_name.trim(),
    input.last_name.trim(),
    input.contact_no?.trim() || null,
  ]);

  const inserted = result.rows[0];
  if (!inserted) {
    throw new AdminServiceError(500, 'Failed to create user record.');
  }

  return mapUserSummary(inserted);
}

export interface UpdateUserInput {
  email?: string | undefined;
  password?: string | undefined;
  role?: CreatableUserRole | undefined;
  first_name?: string | undefined;
  last_name?: string | undefined;
  contact_no?: string | null | undefined;
  is_active?: boolean | undefined;
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<AdminUserSummary> {
  const existingResult = await pool.query<Record<string, unknown>>(
    'SELECT id, email, portal_role, job_title, is_active, failed_login_attempts FROM USERS WHERE id = $1',
    [id]
  );
  const currentUser = existingResult.rows[0];
  if (!currentUser) {
    throw new AdminServiceError(404, 'User not found.');
  }

  // Prevent role escalation to admin
  if (input.role !== undefined) {
    if (input.role !== 'school_staff' && input.role !== 'superuser') {
      throw new AdminServiceError(400, "Role cannot be updated to 'admin'.");
    }
  }

  // Prevent modifying an existing admin's role through this API
  if (currentUser.portal_role === 'admin' && input.role !== undefined) {
    throw new AdminServiceError(400, "Cannot change role of an existing administrator via this API.");
  }

  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.email !== undefined) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const emailConflict = await pool.query(
      'SELECT id FROM USERS WHERE LOWER(email) = $1 AND id != $2',
      [normalizedEmail, id]
    );
    if (emailConflict.rows.length > 0) {
      throw new AdminServiceError(409, 'A user with this email address already exists.');
    }
    updateFields.push(`email = $${paramIndex++}`);
    params.push(normalizedEmail);
  }

  if (input.password !== undefined && input.password.length > 0) {
    const passwordHash = await bcrypt.hash(input.password, 10);
    updateFields.push(`password_hash = $${paramIndex++}`);
    params.push(passwordHash);
  }

  if (input.role !== undefined) {
    updateFields.push(`portal_role = $${paramIndex}, role = CASE $${paramIndex}
      WHEN 'school_staff' THEN 'teacher'::user_role
      WHEN 'superuser' THEN 'superuser'::user_role
      ELSE role END`);
    paramIndex++;
    params.push(input.role);
  }

  if (input.first_name !== undefined) {
    updateFields.push(`first_name = $${paramIndex++}`);
    params.push(input.first_name.trim());
  }

  if (input.last_name !== undefined) {
    updateFields.push(`last_name = $${paramIndex++}`);
    params.push(input.last_name.trim());
  }

  if (input.contact_no !== undefined) {
    updateFields.push(`contact_no = $${paramIndex++}`);
    params.push(input.contact_no ? input.contact_no.trim() : null);
  }

  if (input.is_active !== undefined) {
    updateFields.push(`is_active = $${paramIndex++}`);
    params.push(input.is_active);
  }

  if (updateFields.length === 0) {
    const fresh = await pool.query<Record<string, unknown>>(
      'SELECT id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at FROM USERS WHERE id = $1',
      [id]
    );
    const userRow = fresh.rows[0];
    if (!userRow) throw new AdminServiceError(404, 'User not found.');
    return mapUserSummary(userRow);
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const updateQuery = `
    UPDATE USERS
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
  `;

  const result = await pool.query<Record<string, unknown>>(updateQuery, params);
  const updatedUser = result.rows[0];
  if (!updatedUser) throw new AdminServiceError(404, 'User not found.');

  await AuditService.logEvent({
    action: 'UPDATE_USER',
    entity_type: 'USER',
    entity_id: String(id),
    details: input
  });

  return mapUserSummary(updatedUser);
}

export interface UpdateUserStatusInput {
  is_active?: boolean | undefined;
  action?: 'activate' | 'deactivate' | 'unlock' | 'toggle' | undefined;
  unlock?: boolean | undefined;
}

export async function updateUserStatus(id: number, input: UpdateUserStatusInput): Promise<AdminUserSummary> {
  const existingResult = await pool.query<Record<string, unknown>>(
    'SELECT id, is_active, failed_login_attempts FROM USERS WHERE id = $1',
    [id]
  );
  const currentUser = existingResult.rows[0];
  if (!currentUser) {
    throw new AdminServiceError(404, 'User not found.');
  }

  const currentActive = Boolean(currentUser.is_active);
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

  const updateQuery = `
    UPDATE USERS
    SET is_active = $1, failed_login_attempts = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING id, email, portal_role, job_title, first_name, last_name, contact_no, is_active, failed_login_attempts, created_at, updated_at
  `;

  const result = await pool.query<Record<string, unknown>>(updateQuery, [newActive, newAttempts, id]);
  const updated = result.rows[0];
  if (!updated) throw new AdminServiceError(404, 'User not found.');

  await AuditService.logEvent({
    action: 'UPDATE_USER_STATUS',
    entity_type: 'USER',
    entity_id: String(id),
    details: { is_active: newActive, failed_login_attempts: newAttempts, input }
  });

  return mapUserSummary(updated);
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

export interface CreateModuleInput {
  name: string;
  slug: ApprovedModuleSlug;
  description?: string | null | undefined;
  icon?: string | null | undefined;
  is_active?: boolean | undefined;
  sort_order?: number | undefined;
}

export async function createModule(input: CreateModuleInput): Promise<AdminModule> {
  const existing = await pool.query('SELECT id FROM MODULES WHERE slug = $1', [input.slug]);
  if (existing.rows.length > 0) {
    throw new AdminServiceError(409, `Module with slug '${input.slug}' already exists.`);
  }

  const query = `
    INSERT INTO MODULES (name, slug, description, icon, is_active, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, slug, description, icon, is_active, sort_order, created_at, updated_at
  `;

  const result = await pool.query<Record<string, unknown>>(query, [
    input.name.trim(),
    input.slug,
    input.description ? input.description.trim() : null,
    input.icon ? input.icon.trim() : null,
    input.is_active ?? true,
    input.sort_order ?? 0,
  ]);

  const inserted = result.rows[0];
  if (!inserted) throw new AdminServiceError(500, 'Failed to create module record.');
  return mapModule(inserted);
}

export interface UpdateModuleInput {
  name?: string | undefined;
  slug?: ApprovedModuleSlug | undefined;
  description?: string | null | undefined;
  icon?: string | null | undefined;
  is_active?: boolean | undefined;
  sort_order?: number | undefined;
}

export async function updateModule(id: number, input: UpdateModuleInput): Promise<AdminModule> {
  const existingResult = await pool.query<Record<string, unknown>>(
    'SELECT id, slug FROM MODULES WHERE id = $1',
    [id]
  );
  const currentModule = existingResult.rows[0];
  if (!currentModule) {
    throw new AdminServiceError(404, 'Module not found.');
  }

  if (input.slug !== undefined) {
    const slugConflict = await pool.query(
      'SELECT id FROM MODULES WHERE slug = $1 AND id != $2',
      [input.slug, id]
    );
    if (slugConflict.rows.length > 0) {
      throw new AdminServiceError(409, `Module with slug '${input.slug}' already exists.`);
    }
  }

  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    params.push(input.name.trim());
  }

  if (input.slug !== undefined) {
    updateFields.push(`slug = $${paramIndex++}`);
    params.push(input.slug);
  }

  if (input.description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    params.push(input.description ? input.description.trim() : null);
  }

  if (input.icon !== undefined) {
    updateFields.push(`icon = $${paramIndex++}`);
    params.push(input.icon ? input.icon.trim() : null);
  }

  if (input.is_active !== undefined) {
    updateFields.push(`is_active = $${paramIndex++}`);
    params.push(input.is_active);
  }

  if (input.sort_order !== undefined) {
    updateFields.push(`sort_order = $${paramIndex++}`);
    params.push(input.sort_order);
  }

  if (updateFields.length === 0) {
    const fresh = await pool.query<Record<string, unknown>>(
      'SELECT id, name, slug, description, icon, is_active, sort_order, created_at, updated_at FROM MODULES WHERE id = $1',
      [id]
    );
    const row = fresh.rows[0];
    if (!row) throw new AdminServiceError(404, 'Module not found.');
    return mapModule(row);
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const query = `
    UPDATE MODULES
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, slug, description, icon, is_active, sort_order, created_at, updated_at
  `;

  const result = await pool.query<Record<string, unknown>>(query, params);
  const updated = result.rows[0];
  if (!updated) throw new AdminServiceError(404, 'Module not found.');
  return mapModule(updated);
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

export async function createSchool(input: CreateSchoolInput): Promise<AdminSchoolWithGeo> {
  // Validate barangay exists and matches municipality if provided
  const bgyCheck = await pool.query<{ id: number; municipality_id: number }>(
    'SELECT id, municipality_id FROM BARANGAYS WHERE id = $1',
    [input.barangay_id]
  );
  const bgy = bgyCheck.rows[0];
  if (!bgy) {
    throw new AdminServiceError(400, 'Selected barangay does not exist.');
  }

  if (input.municipality_id !== undefined && input.municipality_id !== null) {
    if (bgy.municipality_id !== input.municipality_id) {
      throw new AdminServiceError(400, 'Selected barangay does not belong to the selected municipality.');
    }
  }

  const insertQuery = `
    INSERT INTO SCHOOLS (name, address, barangay_id, district, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `;

  const insertResult = await pool.query<{ id: number }>(insertQuery, [
    input.name.trim(),
    input.address ? input.address.trim() : null,
    input.barangay_id,
    input.district ? input.district.trim() : null,
    input.is_active ?? true,
  ]);

  const inserted = insertResult.rows[0];
  if (!inserted) throw new AdminServiceError(500, 'Failed to create school record.');
  const schoolId = inserted.id;

  // Query joined record
  const fetchQuery = `
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
    WHERE s.id = $1
  `;

  const fullRecord = await pool.query<Record<string, unknown>>(fetchQuery, [schoolId]);
  const row = fullRecord.rows[0];
  if (!row) throw new AdminServiceError(500, 'Failed to fetch newly created school record.');
  return mapSchoolWithGeo(row);
}

export interface UpdateSchoolInput {
  name?: string | undefined;
  address?: string | null | undefined;
  barangay_id?: number | undefined;
  municipality_id?: number | null | undefined;
  district?: string | null | undefined;
  is_active?: boolean | undefined;
}

export async function updateSchool(id: number, input: UpdateSchoolInput): Promise<AdminSchoolWithGeo> {
  const existingResult = await pool.query('SELECT id FROM SCHOOLS WHERE id = $1', [id]);
  if (existingResult.rows.length === 0) {
    throw new AdminServiceError(404, 'School not found.');
  }

  if (input.barangay_id !== undefined) {
    const bgyCheck = await pool.query<{ id: number; municipality_id: number }>(
      'SELECT id, municipality_id FROM BARANGAYS WHERE id = $1',
      [input.barangay_id]
    );
    const bgy = bgyCheck.rows[0];
    if (!bgy) {
      throw new AdminServiceError(400, 'Selected barangay does not exist.');
    }
    if (input.municipality_id !== undefined && input.municipality_id !== null) {
      if (bgy.municipality_id !== input.municipality_id) {
        throw new AdminServiceError(400, 'Selected barangay does not belong to the selected municipality.');
      }
    }
  }

  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    params.push(input.name.trim());
  }

  if (input.address !== undefined) {
    updateFields.push(`address = $${paramIndex++}`);
    params.push(input.address ? input.address.trim() : null);
  }

  if (input.barangay_id !== undefined) {
    updateFields.push(`barangay_id = $${paramIndex++}`);
    params.push(input.barangay_id);
  }

  if (input.district !== undefined) {
    updateFields.push(`district = $${paramIndex++}`);
    params.push(input.district ? input.district.trim() : null);
  }

  if (input.is_active !== undefined) {
    updateFields.push(`is_active = $${paramIndex++}`);
    params.push(input.is_active);
  }

  if (updateFields.length > 0) {
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const updateQuery = `
      UPDATE SCHOOLS
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `;
    await pool.query(updateQuery, params);
  }

  const fetchQuery = `
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
    WHERE s.id = $1
  `;

  const result = await pool.query<Record<string, unknown>>(fetchQuery, [id]);
  const row = result.rows[0];
  if (!row) throw new AdminServiceError(404, 'School not found.');
  return mapSchoolWithGeo(row);
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
      ump.can_export
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
        (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export, granted_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId, perm.module_id, 
        perm.can_view, perm.can_create, perm.can_edit,
        perm.can_approve_registration, perm.can_report, perm.can_export,
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
        'SELECT id FROM SCHOOLS WHERE id = ANY($1::int[]) AND is_active = TRUE ORDER BY id',
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
        'patient-info': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false },
        'oral-health': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false },
        'deworming': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false },
        'immunization': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false },
        'vital-signs': { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false },
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
    };
  }

  return effectiveAccess;
}
