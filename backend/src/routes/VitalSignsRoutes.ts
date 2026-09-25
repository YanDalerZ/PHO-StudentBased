import { Router } from 'express';
import {
    createVitalSigns,
    getVitalSignsByStudent,
    updateVitalSigns,
    getVitalSignsDashboard,
} from '../controllers/VitalSignsController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDashboardSchoolScope, requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import { resolveSchoolScope } from '../middleware/resolveScope.js';

const router = Router();

// GET /api/modules/vital-signs/dashboard — Vital signs dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('vital-signs', 'can_view'), requireDashboardSchoolScope(), getVitalSignsDashboard);

// POST /api/modules/vital-signs — Create Vital Signs record [Teacher, Superuser]
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('vital-signs'), requirePermission('vital-signs', 'can_create'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), createVitalSigns);

// GET /api/modules/vital-signs/student/:studentId — Get Vital Signs records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('vital-signs', 'can_view'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), getVitalSignsByStudent);

// PUT /api/modules/vital-signs/:id — Update Vital Signs record [Teacher, Superuser]
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('vital-signs'), requirePermission('vital-signs', 'can_edit'), resolveSchoolScope({ tableName: 'VITAL_SIGNS' }), requireSchoolScope(req => req.targetSchoolId), updateVitalSigns);

export default router;
