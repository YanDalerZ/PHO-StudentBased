import { Router } from 'express';
import { getOverview } from '../controllers/DashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePortalRole } from '../middleware/rbac.js';

const router = Router();

// GET /api/v1/dashboard/overview — Province-wide or filtered overview KPIs [SuperUser]
router.get('/overview', authenticate, requirePortalRole('superuser'), getOverview);

export default router;
