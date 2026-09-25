import { Router } from 'express';
import {
    createImmunization,
    getImmunizationByStudent,
    updateImmunization,
    getImmunizationDashboard,
} from '../controllers/ImmunizationController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDashboardSchoolScope, requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import { resolveSchoolScope } from '../middleware/resolveScope.js';

const router = Router();

// GET /api/modules/immunization/dashboard — Immunization dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('immunization', 'can_view'), requireDashboardSchoolScope(), getImmunizationDashboard);

// POST /api/modules/immunization — Create Immunization record [Teacher, Superuser]
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('immunization'), requirePermission('immunization', 'can_create'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), createImmunization);

// GET /api/modules/immunization/student/:studentId — Get Immunization records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('immunization', 'can_view'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), getImmunizationByStudent);

// PUT /api/modules/immunization/:id — Update Immunization record [Teacher, Superuser]
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('immunization'), requirePermission('immunization', 'can_edit'), resolveSchoolScope({ tableName: 'IMMUNIZATION' }), requireSchoolScope(req => req.targetSchoolId), updateImmunization);

export default router;
