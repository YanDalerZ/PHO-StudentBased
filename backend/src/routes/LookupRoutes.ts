import { Router } from 'express';
import { getMunicipalities, getBarangays, getSchools, getModules } from '../controllers/LookupController.js';

const router = Router();

// Routes are public/lookup endpoints
router.get('/municipalities', getMunicipalities);
router.get('/barangays/:munId', getBarangays);
router.get('/schools/:bgyId', getSchools);
router.get('/modules', getModules);

export default router;
