import { Router } from 'express';
import { getMunicipalities, getBarangays, getSchools } from '../controllers/LookupController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Routes are public because they are used by the public Registration Form

router.get('/municipalities', getMunicipalities);
router.get('/barangays/:munId', getBarangays);
router.get('/schools/:bgyId', getSchools);

export default router;
