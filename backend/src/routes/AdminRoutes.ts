import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePortalRole } from '../middleware/rbac.js';
import * as adminController from '../controllers/AdminController.js';
import * as adminAccessController from '../controllers/AdminAccessController.js';
import * as adminInvitationController from '../controllers/AdminInvitationController.js';
import * as adminAuditController from '../controllers/AdminAuditController.js';

const router = Router();

// Apply authentication and admin role requirement to all /api/admin/* routes
router.use(authenticate);
router.use(requirePortalRole('admin'));

// System Dashboard
router.get('/dashboard', adminController.getDashboard);
router.get('/audit-logs', adminAuditController.getAuditLogs);

// User Management
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.patch('/users/:id/status', adminController.updateUserStatus);

// Module Management
router.get('/modules', adminController.getModules);
router.post('/modules', adminController.createModule);
router.put('/modules/:id', adminController.updateModule);

// Invitation governance: token-free metadata and actor-owned revocation.
router.get('/registration-invitation-policy', adminInvitationController.getAdminInvitationPolicy);
router.put('/registration-invitation-policy', adminInvitationController.updateAdminInvitationPolicy);
router.get('/registration-invitations', adminInvitationController.listAdminInvitations);
router.post('/registration-invitations/:id/revoke', adminInvitationController.revokeAdminInvitation);

// School Management
router.get('/schools', adminController.getSchools);
router.post('/schools', adminController.createSchool);
router.put('/schools/:id', adminController.updateSchool);

// Access Management (Phase 1)
router.get('/users/:id/module-permissions', adminAccessController.getUserModulePermissions);
router.put('/users/:id/module-permissions', adminAccessController.updateUserModulePermissions);
router.get('/users/:id/school-assignments', adminAccessController.getUserSchoolAssignments);
router.put('/users/:id/school-assignments', adminAccessController.updateUserSchoolAssignments);
router.get('/users/:id/effective-access', adminAccessController.getUserEffectiveAccess);

export default router;
