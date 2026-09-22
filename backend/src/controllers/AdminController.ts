import type { Request, Response } from 'express';
import { z } from 'zod';
import * as adminService from '../services/admin.service.js';
import { AdminServiceError } from '../services/admin.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// ERROR RESPONSE HELPER
// ─────────────────────────────────────────────────────────────────────────────

function handleControllerError(error: unknown, res: Response, defaultMessage: string): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.flatten() });
    return;
  }

  if (error instanceof AdminServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const pgError = error as { code?: string; detail?: string; message?: string };
  if (pgError.code === '23505') {
    res.status(409).json({ error: 'Conflict: A record with this unique attribute already exists.' });
    return;
  }
  if (pgError.code === '23503') {
    res.status(400).json({ error: 'Invalid reference: referenced entity does not exist.' });
    return;
  }

  console.error(defaultMessage, error);
  res.status(500).json({ error: defaultMessage });
}

function parseIdParam(req: Request, paramName = 'id'): number | null {
  const raw = req.params[paramName];
  const paramStr = Array.isArray(raw) ? raw[0] : raw;
  const id = parseInt(paramStr ?? '', 10);
  if (isNaN(id) || id <= 0) {
    return null;
  }
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getDashboardStats();
    res.status(200).json({ data: stats });
  } catch (error) {
    handleControllerError(error, res, 'Failed to fetch admin dashboard statistics.');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USERS CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: z.enum(['teacher', 'superuser', 'admin']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().optional().default(10),
});

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = listUsersQuerySchema.parse(req.query);
    const result = await adminService.listUsers({
      search: filters.search,
      role: filters.role,
      page: filters.page,
      limit: filters.limit,
    });
    res.status(200).json({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    handleControllerError(error, res, 'Failed to list users.');
  }
};

const createUserSchema = z.object({
  email: z.string().trim().email('Valid email address is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  role: z.enum(['teacher', 'superuser']),
  first_name: z.string().trim().min(1, 'First name is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
  contact_no: z.string().trim().optional().nullable(),
});

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = createUserSchema.parse(req.body);
    const user = await adminService.createUser({
      email: validated.email,
      password: validated.password,
      role: validated.role,
      first_name: validated.first_name,
      last_name: validated.last_name,
      contact_no: validated.contact_no,
    });
    res.status(201).json({ data: user });
  } catch (error) {
    handleControllerError(error, res, 'Failed to create user account.');
  }
};

const updateUserSchema = z.object({
  email: z.string().trim().email('Valid email address is required.').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters long.').optional(),
  role: z.enum(['teacher', 'superuser']).optional(),

  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
  contact_no: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }

    const validated = updateUserSchema.parse(req.body);
    const user = await adminService.updateUser(id, {
      email: validated.email,
      password: validated.password,
      role: validated.role,
      first_name: validated.first_name,
      last_name: validated.last_name,
      contact_no: validated.contact_no,
      is_active: validated.is_active,
    });
    res.status(200).json({ data: user });
  } catch (error) {
    handleControllerError(error, res, 'Failed to update user profile.');
  }
};

const updateUserStatusSchema = z.object({
  is_active: z.boolean().optional(),
  action: z.enum(['activate', 'deactivate', 'unlock', 'toggle']).optional(),
  unlock: z.boolean().optional(),
}).refine(
  (data) => data.is_active !== undefined || data.action !== undefined || data.unlock !== undefined,
  { message: 'Must provide either is_active, action, or unlock flag.' }
);

export const updateUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }

    const validated = updateUserStatusSchema.parse(req.body);
    const user = await adminService.updateUserStatus(id, {
      is_active: validated.is_active,
      action: validated.action,
      unlock: validated.unlock,
    });
    res.status(200).json({ data: user });
  } catch (error) {
    handleControllerError(error, res, 'Failed to update user status.');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULES CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

export const getModules = async (req: Request, res: Response): Promise<void> => {
  try {
    const modules = await adminService.listModules();
    res.status(200).json({ data: modules, total: modules.length });
  } catch (error) {
    handleControllerError(error, res, 'Failed to list modules.');
  }
};

const approvedModuleSlugs = [
  'patient-info',
  'oral-health',
  'deworming',
  'vital-signs',
  'immunization',
] as const;

const createModuleSchema = z.object({
  name: z.string().trim().min(1, 'Module name is required.'),
  slug: z.enum(['patient-info', 'oral-health', 'deworming', 'vital-signs', 'immunization']),
  description: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).optional().default(0),
});

export const createModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = createModuleSchema.parse(req.body);
    const newModule = await adminService.createModule({
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      icon: validated.icon,
      is_active: validated.is_active,
      sort_order: validated.sort_order,
    });
    res.status(201).json({ data: newModule });
  } catch (error) {
    handleControllerError(error, res, 'Failed to create module.');
  }
};

const updateModuleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: z.enum(['patient-info', 'oral-health', 'deworming', 'vital-signs', 'immunization']).optional(),
  description: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateModule = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Valid positive module ID is required.' });
      return;
    }

    const validated = updateModuleSchema.parse(req.body);
    const updated = await adminService.updateModule(id, {
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      icon: validated.icon,
      is_active: validated.is_active,
      sort_order: validated.sort_order,
    });
    res.status(200).json({ data: updated });
  } catch (error) {
    handleControllerError(error, res, 'Failed to update module.');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOLS CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

const listSchoolsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().optional().default(50),
});

export const getSchools = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = listSchoolsQuerySchema.parse(req.query);
    const result = await adminService.listSchools({
      search: filters.search,
      page: filters.page,
      limit: filters.limit,
    });
    res.status(200).json({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    handleControllerError(error, res, 'Failed to list schools.');
  }
};

const createSchoolSchema = z.object({
  name: z.string().trim().min(1, 'School name is required.'),
  address: z.string().trim().optional().nullable(),
  barangay_id: z.number().int().positive('A valid barangay is required.'),
  municipality_id: z.number().int().positive().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export const createSchool = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = createSchoolSchema.parse(req.body);
    const school = await adminService.createSchool({
      name: validated.name,
      address: validated.address,
      barangay_id: validated.barangay_id,
      municipality_id: validated.municipality_id,
      district: validated.district,
      is_active: validated.is_active,
    });
    res.status(201).json({ data: school });
  } catch (error) {
    handleControllerError(error, res, 'Failed to create school.');
  }
};

const updateSchoolSchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().optional().nullable(),
  barangay_id: z.number().int().positive().optional(),
  municipality_id: z.number().int().positive().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const updateSchool = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Valid positive school ID is required.' });
      return;
    }

    const validated = updateSchoolSchema.parse(req.body);
    const school = await adminService.updateSchool(id, {
      name: validated.name,
      address: validated.address,
      barangay_id: validated.barangay_id,
      municipality_id: validated.municipality_id,
      district: validated.district,
      is_active: validated.is_active,
    });
    res.status(200).json({ data: school });
  } catch (error) {
    handleControllerError(error, res, 'Failed to update school.');
  }
};
