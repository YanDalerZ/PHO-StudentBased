import { Router } from 'express';
import {
    createImmunization,
    getImmunizationByStudent,
    updateImmunization,
    getImmunizationDashboard,
} from '../controllers/ImmunizationController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import pool from '../database/db.js';
import type { Request } from 'express';

const router = Router();

const resolveStudentSchool = async (req: Request) => {
    const studentId = parseInt((req.params.studentId || req.body.student_id) as string);
    if (isNaN(studentId)) return undefined;
    const res = await pool.query('SELECT school_id FROM STUDENTS WHERE id = $1', [studentId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

const resolveRecordSchool = async (req: Request) => {
    const recordId = parseInt(req.params.id as string);
    if (isNaN(recordId)) return undefined;
    const res = await pool.query(`
        SELECT s.school_id 
        FROM IMMUNIZATION r
        JOIN STUDENTS s ON r.student_id = s.id
        WHERE r.id = $1
    `, [recordId]);
    return res.rows.length ? res.rows[0].school_id : undefined;
};

router.get('/dashboard', authenticate, requirePortalRole('superuser'), requirePermission('immunization', 'can_report'), getImmunizationDashboard);
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('immunization'), requirePermission('immunization', 'can_create'), requireSchoolScope(resolveStudentSchool), createImmunization);
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('immunization', 'can_view'), requireSchoolScope(resolveStudentSchool), getImmunizationByStudent);
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('immunization'), requirePermission('immunization', 'can_edit'), requireSchoolScope(resolveRecordSchool), updateImmunization);

export default router;
