import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import * as adminController from '../controllers/AdminController.js';

const router = Router();

// Apply authentication and admin role requirement to all /api/admin/* routes
router.use(authenticate);
router.use(requireRole('admin'));

// System Dashboard
router.get('/dashboard', adminController.getDashboard);

// User Management
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.patch('/users/:id/status', adminController.updateUserStatus);

// Module Management
router.get('/modules', adminController.getModules);
router.post('/modules', adminController.createModule);
router.put('/modules/:id', adminController.updateModule);

// School Management
router.get('/schools', adminController.getSchools);
router.post('/schools', adminController.createSchool);
router.put('/schools/:id', adminController.updateSchool);

export default router;
