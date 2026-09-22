import { Router } from 'express';
import {
    getAllStudents,
    createStudent,
    getStudentById,
    updateStudent,
    getStudentProfile
} from '../controllers/StudentController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// GET /api/students — List students (Teacher: own; SuperUser: province-wide)
router.get('/', authenticate, requireRole('teacher', 'superuser'), getAllStudents);

// POST /api/students — Register new student (Teacher, SuperUser)
router.post('/', authenticate, requireRole('teacher', 'superuser'), createStudent);

// GET /api/students/:id — Student details + module summary
router.get('/:id', authenticate, requireRole('teacher', 'superuser'), getStudentById);

// PUT /api/students/:id — Update student (Teacher: own; SuperUser: province-wide)
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), updateStudent);

// GET /api/students/:id/profile — Full student profile with module records
router.get('/:id/profile', authenticate, requireRole('teacher', 'superuser'), getStudentProfile);

export default router;


