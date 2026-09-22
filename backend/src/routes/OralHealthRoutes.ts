import { Router } from 'express';
import {
    createOralHealth,
    getOralHealthByStudent,
    updateOralHealth,
    getOralHealthDashboard,
} from '../controllers/OralHealthController.js';
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

// Helper for module record updates (needs to lookup student -> school)
const resolveRecordSchool = async (req: Request) => {
    const recordId = parseInt(req.params.id as string);
    if (isNaN(recordId)) return undefined;
    const res = await pool.query(`
        SELECT s.school_id 
        FROM ORAL_HEALTH r
        JOIN STUDENTS s ON r.student_id = s.id
        WHERE r.id = $1
    `, [recordId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

// GET /api/v1/modules/oral-health/dashboard — Dashboard KPIs
router.get('/dashboard', authenticate, requirePortalRole('superuser'), requirePermission('oral-health', 'can_report'), getOralHealthDashboard);

// POST /api/v1/modules/oral-health — Create
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('oral-health'), requirePermission('oral-health', 'can_create'), requireSchoolScope(resolveStudentSchool), createOralHealth);

// GET /api/v1/modules/oral-health/student/:studentId — Get by student
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('oral-health', 'can_view'), requireSchoolScope(resolveStudentSchool), getOralHealthByStudent);

// PUT /api/v1/modules/oral-health/:id — Update
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('oral-health'), requirePermission('oral-health', 'can_edit'), requireSchoolScope(resolveRecordSchool), updateOralHealth);

export default router;
