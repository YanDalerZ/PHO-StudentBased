import { Router } from 'express';
import {
    createDeworming,
    getDewormingByStudent,
    updateDeworming,
    getDewormingDashboard,
    getDewormingReport,
} from '../controllers/DewormingController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDashboardSchoolScope, requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import { resolveSchoolScope } from '../middleware/resolveScope.js';

const router = Router();

// GET /api/modules/deworming/dashboard — Deworming dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('deworming', 'can_view'), requireDashboardSchoolScope(), getDewormingDashboard);

// GET /api/modules/deworming/report — Deworming municipality consolidation report [Superuser, Admin]
router.get('/report', authenticate, requirePortalRole('superuser'), requirePermission('deworming', 'can_report'), getDewormingReport);

// POST /api/modules/deworming — Create Deworming record [Teacher, Superuser]
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('deworming'), requirePermission('deworming', 'can_create'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), createDeworming);

// GET /api/modules/deworming/student/:studentId — Get Deworming records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('deworming', 'can_view'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), getDewormingByStudent);

// PUT /api/modules/deworming/:id — Update Deworming record [Teacher, Superuser]
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('deworming'), requirePermission('deworming', 'can_edit'), resolveSchoolScope({ tableName: 'DEWORMING' }), requireSchoolScope(req => req.targetSchoolId), updateDeworming);

export default router;
