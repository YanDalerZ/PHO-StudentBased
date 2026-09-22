import { Router } from 'express';
import {
    createImmunization,
    getImmunizationByStudent,
    updateImmunization,
    getImmunizationDashboard,
} from '../controllers/ImmunizationController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';

const router = Router();

// GET /api/modules/immunization/dashboard — Immunization dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requireRole('superuser', 'admin'), getImmunizationDashboard);

// POST /api/modules/immunization — Create Immunization record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('immunization'), createImmunization);

// GET /api/modules/immunization/student/:studentId — Get Immunization records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getImmunizationByStudent);

// PUT /api/modules/immunization/:id — Update Immunization record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('immunization'), updateImmunization);

export default router;
