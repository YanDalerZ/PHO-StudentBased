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
import { requireDashboardSchoolScope, requirePortalRole, requirePermission, requireSchoolScope } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';
import { resolveSchoolScope } from '../middleware/resolveScope.js';

const router = Router();

// GET /api/modules/patient-info/dashboard — Patient Info Dashboard KPIs [Superuser]
router.get('/dashboard', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_view'), requireDashboardSchoolScope(), getPatientInfoDashboard);

// POST /api/modules/patient-info — Create Patient Info (& optional Animal Bite) [Teacher, Superuser]
router.post('/', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_create'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), createPatientInfo);

// GET /api/modules/patient-info/student/:studentId — Get Patient Info & Animal Bite records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requirePortalRole('school_staff', 'superuser'), requirePermission('patient-info', 'can_view'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), getPatientInfoByStudent);

// PUT /api/modules/patient-info/:id — Update Patient Info (& optional Animal Bite) [Teacher, Superuser]
router.put('/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_edit'), resolveSchoolScope({ tableName: 'PATIENT_INFO' }), requireSchoolScope(req => req.targetSchoolId), updatePatientInfo);

// POST /api/modules/patient-info/animal-bites — Create standalone Animal Bite record [Teacher, Superuser]
router.post('/animal-bites', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_create'), resolveSchoolScope(), requireSchoolScope(req => req.targetSchoolId), createAnimalBite);

// PUT /api/modules/patient-info/animal-bites/:id — Update standalone Animal Bite record [Teacher, Superuser]
router.put('/animal-bites/:id', authenticate, requirePortalRole('school_staff', 'superuser'), requireActiveModule('patient-info'), requirePermission('patient-info', 'can_edit'), resolveSchoolScope({ tableName: 'ANIMAL_BITES' }), requireSchoolScope(req => req.targetSchoolId), updateAnimalBite);

export default router;
