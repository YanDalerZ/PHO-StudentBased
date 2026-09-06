import { Router } from 'express';
import {
    createDeworming,
    getDewormingByStudent,
    updateDeworming,
} from '../controllers/DewormingController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// POST /api/modules/deworming — Create Deworming record [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), createDeworming);

// GET /api/modules/deworming/student/:studentId — Get Deworming records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getDewormingByStudent);

// PUT /api/modules/deworming/:id — Update Deworming record [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), updateDeworming);

export default router;
