import { Router } from 'express';
import {
    createVitalSigns,
    getVitalSignsByStudent,
    updateVitalSigns,
} from '../controllers/VitalSignsController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// POST /api/modules/vital-signs — Create Vital Signs record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), createVitalSigns);

// GET /api/modules/vital-signs/student/:studentId — Get Vital Signs records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getVitalSignsByStudent);

// PUT /api/modules/vital-signs/:id — Update Vital Signs record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), updateVitalSigns);

export default router;
