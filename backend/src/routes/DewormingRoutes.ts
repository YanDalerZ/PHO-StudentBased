import { Router } from 'express';
import {
    createDeworming,
    getDewormingByStudent,
    updateDeworming,
    getDewormingDashboard,
    getDewormingReport,
} from '../controllers/DewormingController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';

const router = Router();

// GET /api/modules/deworming/dashboard — Deworming dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requireRole('superuser', 'admin'), getDewormingDashboard);

// GET /api/modules/deworming/report — Deworming municipality consolidation report [Superuser, Admin]
router.get('/report', authenticate, requireRole('superuser', 'admin'), getDewormingReport);

// POST /api/modules/deworming — Create Deworming record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('deworming'), createDeworming);

// GET /api/modules/deworming/student/:studentId — Get Deworming records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getDewormingByStudent);

// PUT /api/modules/deworming/:id — Update Deworming record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('deworming'), updateDeworming);

export default router;
