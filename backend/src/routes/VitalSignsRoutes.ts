import { Router } from 'express';
import {
    createVitalSigns,
    getVitalSignsByStudent,
    updateVitalSigns,
    getVitalSignsDashboard,
} from '../controllers/VitalSignsController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';

const router = Router();

// GET /api/modules/vital-signs/dashboard — Vital signs dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requireRole('superuser', 'admin'), getVitalSignsDashboard);

// POST /api/modules/vital-signs — Create Vital Signs record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('vital-signs'), createVitalSigns);

// GET /api/modules/vital-signs/student/:studentId — Get Vital Signs records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getVitalSignsByStudent);

// PUT /api/modules/vital-signs/:id — Update Vital Signs record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('vital-signs'), updateVitalSigns);

export default router;
