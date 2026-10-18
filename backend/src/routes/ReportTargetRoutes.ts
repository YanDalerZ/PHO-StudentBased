import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listReportTargets, saveReportTarget } from '../controllers/ReportTargetController.js';

const router = Router();
router.get('/report-targets/:moduleSlug', authenticate, listReportTargets);
router.post('/report-targets/:moduleSlug', authenticate, saveReportTarget);
export default router;
