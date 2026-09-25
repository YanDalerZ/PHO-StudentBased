import { Router } from 'express';
import {
    createOralHealth,
    getOralHealthByStudent,
    updateOralHealth,
    getOralHealthDashboard,
} from '../controllers/OralHealthController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDashboardSchoolScope, requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import { resolveSchoolScope } from '../middleware/resolveScope.js';

const router = Router();

// GET /api/modules/oral-health/dashboard — Oral Health Dashboard KPIs (RPOC-based) [Superuser]
router.get('/dashboard', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('oral-health', 'can_view'), requireDashboardSchoolScope(), getOralHealthDashboard);

// POST /api/modules/oral-health — Create Oral Health record [Teacher, Superuser]
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('oral-health'), requirePermission('oral-health', 'can_create'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), createOralHealth);

// GET /api/modules/oral-health/student/:studentId — Get Oral Health records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('oral-health', 'can_view'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), getOralHealthByStudent);

// PUT /api/modules/oral-health/:id — Update Oral Health record [Teacher, Superuser]
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('oral-health'), requirePermission('oral-health', 'can_edit'), resolveSchoolScope({ tableName: 'ORAL_HEALTH' }), requireSchoolScope(req => req.targetSchoolId), updateOralHealth);

export default router;
