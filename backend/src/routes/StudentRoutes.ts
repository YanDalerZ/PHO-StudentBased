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
import { resolveSchoolScope } from '../middleware/resolveScope.js';
import { requireActiveModule } from '../middleware/activeModule.js';

const router = Router();

// GET /api/students — List students (Teacher: assigned schools; SuperUser: province-wide)
router.get(
    '/',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requirePermission('patient-info', 'can_view'),
    getAllStudents
);

// POST /api/students — Register new student (Teacher: assigned school; SuperUser)
router.post(
    '/',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireActiveModule('patient-info'),
    requirePermission('patient-info', 'can_create'),
    requireSchoolScope(req => req.body.school_id ? Number(req.body.school_id) : null),
    createStudent
);

// GET /api/students/:id — Student details + module summary
router.get(
    '/:id',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requirePermission('patient-info', 'can_view'),
    resolveSchoolScope({ tableName: 'STUDENTS' }),
    requireSchoolScope(req => req.targetSchoolId),
    getStudentById
);

// PUT /api/students/:id — Update student (Teacher: assigned school; SuperUser)
router.put(
    '/:id',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireActiveModule('patient-info'),
    requirePermission('patient-info', 'can_edit'),
    resolveSchoolScope({ tableName: 'STUDENTS' }),
    requireSchoolScope(req => req.targetSchoolId),
    updateStudent
);

// GET /api/students/:id/profile — Full student profile with module records
router.get(
    '/:id/profile',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requirePermission('patient-info', 'can_view'),
    resolveSchoolScope({ tableName: 'STUDENTS' }),
    requireSchoolScope(req => req.targetSchoolId),
    getStudentProfile
);

export default router;
