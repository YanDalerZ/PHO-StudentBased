import { Router } from 'express';
import { getOverview } from '../controllers/DashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requirePortalRole } from '../middleware/rbac.js';

const router = Router();

// GET /api/dashboard/overview — Province-wide or filtered overview KPIs [SuperUser, Admin]
router.get('/overview', authenticate, requirePortalRole('superuser', 'school_staff'), requirePermission('patient-info', 'can_view'), getOverview);

export default router;
