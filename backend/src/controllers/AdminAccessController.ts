import type { Request, Response } from 'express';
import { z } from 'zod';
import * as adminService from '../services/admin.service.js';
import { handleControllerError, parseIdParam } from './AdminController.js';

// ─────────────────────────────────────────────────────────────────────────────

export const getUserModulePermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseIdParam(req);
    if (!userId) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }
    const perms = await adminService.getModulePermissions(userId);
    res.status(200).json({ data: perms });
  } catch (error) {
    handleControllerError(error, res, 'Failed to fetch module permissions.');
  }
};

const modulePermissionSchema = z.object({
  module_id: z.number().int().positive(),
  can_view: z.boolean().optional(),
  can_create: z.boolean().optional(),
  can_edit: z.boolean().optional(),
  can_approve_registration: z.boolean().optional(),
  can_report: z.boolean().optional(),
  can_export: z.boolean().optional(),
}).strict().transform((permission) => ({
  module_id: permission.module_id,
  can_view: permission.can_view ?? false,
  can_create: permission.can_create ?? false,
  can_edit: permission.can_edit ?? false,
  can_approve_registration: permission.can_approve_registration ?? false,
  can_report: permission.can_report ?? false,
  can_export: permission.can_export ?? false,
}));

const updateModulePermissionsSchema = z.array(modulePermissionSchema).max(5).superRefine((permissions, context) => {
  const seen = new Set<number>();
  permissions.forEach((permission, index) => {
    if (seen.has(permission.module_id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'module_id'],
        message: 'Duplicate module_id values are not allowed.',
      });
    }
    seen.add(permission.module_id);
  });
});

export const updateUserModulePermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseIdParam(req);
    if (!userId) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const validated = updateModulePermissionsSchema.parse(req.body);
    await adminService.updateModulePermissions(userId, validated, req.user.id);
    const updated = await adminService.getModulePermissions(userId);
    res.status(200).json({ data: updated });
  } catch (error) {
    handleControllerError(error, res, 'Failed to update module permissions.');
  }
};

export const getUserSchoolAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseIdParam(req);
    if (!userId) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }
    const schools = await adminService.getSchoolAssignments(userId);
    res.status(200).json({ data: schools });
  } catch (error) {
    handleControllerError(error, res, 'Failed to fetch school assignments.');
  }
};

const updateSchoolAssignmentsSchema = z.object({
  school_ids: z.array(z.number().int().positive()).superRefine((schoolIds, context) => {
    const seen = new Set<number>();
    schoolIds.forEach((schoolId, index) => {
      if (seen.has(schoolId)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Duplicate school IDs are not allowed.',
        });
      }
      seen.add(schoolId);
    });
  }),
}).strict();

export const updateUserSchoolAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseIdParam(req);
    if (!userId) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const validated = updateSchoolAssignmentsSchema.parse(req.body);
    await adminService.updateSchoolAssignments(userId, validated.school_ids, req.user.id);
    const updated = await adminService.getSchoolAssignments(userId);
    res.status(200).json({ data: updated });
  } catch (error) {
    handleControllerError(error, res, 'Failed to update school assignments.');
  }
};

export const getUserEffectiveAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseIdParam(req);
    if (!userId) {
      res.status(400).json({ error: 'Valid positive user ID is required.' });
      return;
    }
    const effectiveAccess = await adminService.getEffectiveAccess(userId);
    res.status(200).json({ data: effectiveAccess });
  } catch (error) {
    handleControllerError(error, res, 'Failed to fetch effective access.');
  }
};
