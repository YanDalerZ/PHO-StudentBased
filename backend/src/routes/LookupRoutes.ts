import { Router } from 'express';
import { getMunicipalities, getBarangays, getSchools, getModules } from '../controllers/LookupController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/municipalities', getMunicipalities);
router.get('/barangays/:munId', getBarangays);
router.get('/schools/:bgyId', getSchools);
router.get('/modules', getModules);

export default router;
