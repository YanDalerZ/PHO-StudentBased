import { Router } from 'express';
import { getOverview } from '../controllers/DashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// GET /api/dashboard/overview — Province-wide or filtered overview KPIs [SuperUser, Admin]
router.get('/overview', authenticate, requireRole('superuser', 'admin'), getOverview);

export default router;
