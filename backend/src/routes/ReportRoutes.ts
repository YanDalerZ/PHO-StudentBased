import { Router } from 'express';
import { getConsolidatedReportPreview, recordConsolidatedReportPrint } from '../controllers/ReportController.js';
import { requestReportExport } from '../controllers/ReportExportController.js';
import { authenticate } from '../middleware/auth.js';
import {
    requireDashboardSchoolScope,
    requireParamModulePermission,
    requirePortalRole,
} from '../middleware/rbac.js';

const router = Router();

router.post(
    '/reports/:moduleSlug/exports',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_export'),
    requireDashboardSchoolScope(),
    requestReportExport,
);

router.post(
    '/reports/:moduleSlug/print-events',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_report'),
    recordConsolidatedReportPrint,
);

router.get(
    '/reports/:moduleSlug',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_report'),
    requireDashboardSchoolScope(),
    getConsolidatedReportPreview,
);

export default router;
