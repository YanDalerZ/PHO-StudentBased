import { Router } from 'express';
import {
    createDeworming,
    getDewormingByStudent,
    updateDeworming,
    getDewormingDashboard,
} from '../controllers/DewormingController.js';
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
        FROM DEWORMING r
        JOIN STUDENTS s ON r.student_id = s.id
        WHERE r.id = $1
    `, [recordId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

router.get('/dashboard', authenticate, requirePortalRole('superuser'), requirePermission('deworming', 'can_report'), getDewormingDashboard);

router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('deworming'), requirePermission('deworming', 'can_create'), requireSchoolScope(resolveStudentSchool), createDeworming);

router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('deworming', 'can_view'), requireSchoolScope(resolveStudentSchool), getDewormingByStudent);

router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('deworming'), requirePermission('deworming', 'can_edit'), requireSchoolScope(resolveRecordSchool), updateDeworming);

export default router;
