import { Router } from 'express';
import { getConsolidatedReportPreview, getMasterlistReportPreview, recordConsolidatedReportPrint, recordMasterlistReportPrint } from '../controllers/ReportController.js';
import { requestReportExport } from '../controllers/ReportExportController.js';
import { authenticate } from '../middleware/auth.js';
import { requireViewWhenDisabled } from '../middleware/activeModule.js';
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
    '/reports/:moduleSlug/masterlist/print-events',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_export'),
    requireViewWhenDisabled(),
    recordMasterlistReportPrint,
);

router.post(
    '/reports/:moduleSlug/print-events',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_report'),
    requireViewWhenDisabled(),
    recordConsolidatedReportPrint,
);

router.get(
    '/reports/:moduleSlug/masterlist',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_export'),
    requireViewWhenDisabled(),
    requireDashboardSchoolScope(),
    getMasterlistReportPreview,
);

router.get(
    '/reports/:moduleSlug',
    authenticate,
    requirePortalRole('school_staff', 'superuser'),
    requireParamModulePermission('can_report'),
    requireViewWhenDisabled(),
    requireDashboardSchoolScope(),
    getConsolidatedReportPreview,
);

export default router;
