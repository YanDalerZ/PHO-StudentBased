import { Router } from 'express';
import { getMunicipalities, getBarangays, getSchools, getActiveSchools, getModules } from '../controllers/LookupController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Routes are public/lookup endpoints
router.get('/municipalities', getMunicipalities);
router.get('/barangays/:munId', getBarangays);
router.get('/schools/:bgyId', getSchools);
router.get('/schools', authenticate, getActiveSchools);
router.get('/modules', getModules);

export default router;
