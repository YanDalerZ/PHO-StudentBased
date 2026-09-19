import { Router } from 'express';
import {
    createOralHealth,
    getOralHealthByStudent,
    updateOralHealth,
    getOralHealthDashboard,
} from '../controllers/OralHealthController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';

const router = Router();

// GET /api/modules/oral-health/dashboard — Oral Health Dashboard KPIs (RPOC-based) [Superuser, Admin]
router.get('/dashboard', authenticate, requireRole('superuser', 'admin'), getOralHealthDashboard);

// POST /api/modules/oral-health — Create Oral Health record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('oral-health'), createOralHealth);

// GET /api/modules/oral-health/student/:studentId — Get Oral Health records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getOralHealthByStudent);

// PUT /api/modules/oral-health/:id — Update Oral Health record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('oral-health'), updateOralHealth);

export default router;
