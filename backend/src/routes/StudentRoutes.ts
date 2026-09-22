import { Router } from 'express';
import {
    getAllStudents,
    createStudent,
    getStudentById,
    updateStudent,
    getStudentProfile
} from '../controllers/StudentController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import pool from '../database/db.js';
import type { Request } from 'express';

const router = Router();

// Helper to resolve school for a student ID
const resolveStudentSchool = async (req: Request) => {
    const studentId = parseInt(req.params.id as string);
    if (isNaN(studentId)) return undefined;
    const res = await pool.query('SELECT school_id FROM STUDENTS WHERE id = $1', [studentId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

// Helper for creation (school is in body)
const resolveCreateSchool = async (req: Request) => {
    return req.body.school_id ? parseInt(req.body.school_id) : undefined;
};

// GET /api/v1/students — List students (requires patient-info view)
router.get('/', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_view'), getAllStudents);

// POST /api/v1/students — Register new student (Teacher, SuperUser) requires can_create and valid school
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_create'), requireSchoolScope(resolveCreateSchool), createStudent);

// GET /api/v1/students/:id — Student details + module summary
router.get('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_view'), requireSchoolScope(resolveStudentSchool), getStudentById);

// PUT /api/v1/students/:id — Update student 
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_edit'), requireSchoolScope(resolveStudentSchool), updateStudent);

// GET /api/v1/students/:id/profile — Full student profile with module records
router.get('/:id/profile', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_view'), requireSchoolScope(resolveStudentSchool), getStudentProfile);

export default router;
