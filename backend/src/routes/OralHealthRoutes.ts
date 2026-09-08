import { Router } from 'express';
import {
    createOralHealth,
    getOralHealthByStudent,
    updateOralHealth,
} from '../controllers/OralHealthController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// POST /api/modules/oral-health — Create Oral Health record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), createOralHealth);

// GET /api/modules/oral-health/student/:studentId — Get Oral Health records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getOralHealthByStudent);

// PUT /api/modules/oral-health/:id — Update Oral Health record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), updateOralHealth);

export default router;
