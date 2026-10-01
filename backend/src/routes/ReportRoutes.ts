import { Router } from 'express';
import { getConsolidatedReportPreview, recordConsolidatedReportPrint } from '../controllers/ReportController.js';
import {
    downloadReportExportFile,
    readReportExport,
    removeReportExport,
    requestReportExport,
} from '../controllers/ReportExportController.js';
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

router.get('/report-exports/:id', authenticate, requirePortalRole('school_staff', 'superuser'), readReportExport);
router.get('/report-exports/:id/download', authenticate, requirePortalRole('school_staff', 'superuser'), downloadReportExportFile);
router.delete('/report-exports/:id', authenticate, requirePortalRole('school_staff', 'superuser'), removeReportExport);

router.get(
    '/reports/:moduleSlug',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_report'),
    requireDashboardSchoolScope(),
    getConsolidatedReportPreview,
);

export default router;
