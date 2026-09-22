import { Router } from 'express';
import {
    createPatientInfo,
    getPatientInfoByStudent,
    updatePatientInfo,
    createAnimalBite,
    updateAnimalBite,
    getPatientInfoDashboard,
} from '../controllers/PatientInfoController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import pool from '../database/db.js';
import type { Request } from 'express';

const router = Router();

// Helper to resolve school for a student ID
const resolveStudentSchool = async (req: Request) => {
    const studentId = parseInt((req.params.studentId || req.body.student_id) as string);
    if (isNaN(studentId)) return undefined;
    const res = await pool.query('SELECT school_id FROM STUDENTS WHERE id = $1', [studentId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

// Helper for module record updates
const resolveRecordSchool = async (req: Request) => {
    const recordId = parseInt(req.params.id as string);
    if (isNaN(recordId)) return undefined;
    const res = await pool.query(`
        SELECT s.school_id 
        FROM PATIENT_INFO r
        JOIN STUDENTS s ON r.student_id = s.id
        WHERE r.id = $1
    `, [recordId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

// Helper for animal bite updates
const resolveAnimalBiteSchool = async (req: Request) => {
    const recordId = parseInt(req.params.id as string);
    if (isNaN(recordId)) return undefined;
    const res = await pool.query(`
        SELECT s.school_id 
        FROM ANIMAL_BITES r
        JOIN STUDENTS s ON r.student_id = s.id
        WHERE r.id = $1
    `, [recordId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

// GET /api/v1/modules/patient-info/dashboard
router.get('/dashboard', authenticate, requirePortalRole('superuser'), requirePermission('patient-info', 'can_report'), getPatientInfoDashboard);

// POST /api/v1/modules/patient-info
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_create'), requireSchoolScope(resolveStudentSchool), createPatientInfo);

// GET /api/v1/modules/patient-info/student/:studentId
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_view'), requireSchoolScope(resolveStudentSchool), getPatientInfoByStudent);

// PUT /api/v1/modules/patient-info/:id
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_edit'), requireSchoolScope(resolveRecordSchool), updatePatientInfo);

// POST /api/v1/modules/patient-info/animal-bites
router.post('/animal-bites', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_create'), requireSchoolScope(resolveStudentSchool), createAnimalBite);

// PUT /api/v1/modules/patient-info/animal-bites/:id
router.put('/animal-bites/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_edit'), requireSchoolScope(resolveAnimalBiteSchool), updateAnimalBite);

export default router;
