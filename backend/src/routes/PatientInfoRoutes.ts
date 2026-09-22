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
import { requireRole } from '../middleware/rbac.js';
import { requireActiveModule } from '../middleware/activeModule.js';

const router = Router();

// GET /api/modules/patient-info/dashboard — Patient Info Dashboard KPIs [Superuser, Admin]
router.get('/dashboard', authenticate, requireRole('superuser', 'admin'), getPatientInfoDashboard);

// POST /api/modules/patient-info — Create Patient Info (& optional Animal Bite) [Teacher, Superuser]
router.post('/', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('patient-info'), createPatientInfo);

// GET /api/modules/patient-info/student/:studentId — Get Patient Info & Animal Bite records by student [Teacher, Superuser]
router.get('/student/:studentId', authenticate, requireRole('teacher', 'superuser'), getPatientInfoByStudent);

// PUT /api/modules/patient-info/:id — Update Patient Info (& optional Animal Bite) [Teacher, Superuser]
router.put('/:id', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('patient-info'), updatePatientInfo);

// POST /api/modules/patient-info/animal-bites — Create standalone Animal Bite record [Teacher, Superuser]
router.post('/animal-bites', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('patient-info'), createAnimalBite);

// PUT /api/modules/patient-info/animal-bites/:id — Update standalone Animal Bite record [Teacher, Superuser]
router.put('/animal-bites/:id', authenticate, requireRole('teacher', 'superuser'), requireActiveModule('patient-info'), updateAnimalBite);

export default router;
