import { Router } from 'express';
import { authenticate, attachEffectiveAccess } from '../middleware/auth.js';
import { requirePermission, requirePortalRole } from '../middleware/rbac.js';
import {
    protectPublicRegistrationSubmission,
    publicRegistrationHeaders,
    requirePublicRegistrationPolicy,
    validatePublicRegistrationInput,
} from '../middleware/publicRegistrationSecurity.js';
import {
    approveSubmission,
    generateInvitation,
    getInvitationDetails,
    getInvitations,
    getRegistrationSubmission,
    getRegistrationSubmissions,
    rejectSubmission,
    revokeInvitation,
    submitRegistration,
} from '../controllers/RegistrationController.js';

const router = Router();
const authenticateStaff = [
    authenticate,
    attachEffectiveAccess,
    requirePortalRole('school_staff'),
] as const;

router.get(
    '/public/registration-invitations/:token',
    publicRegistrationHeaders,
    requirePublicRegistrationPolicy,
    getInvitationDetails,
);
router.post(
    '/public/registration-invitations/:token/submissions',
    publicRegistrationHeaders,
    validatePublicRegistrationInput,
    requirePublicRegistrationPolicy,
    protectPublicRegistrationSubmission,
    submitRegistration,
);

router.post(
    '/registration-invitations',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_create'),
    generateInvitation,
);
router.get(
    '/registration-invitations',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_create'),
    getInvitations,
);
router.post(
    '/registration-invitations/:id/revoke',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_create'),
    revokeInvitation,
);

router.get(
    '/registration-submissions',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_approve_registration'),
    getRegistrationSubmissions,
);
router.get(
    '/registration-submissions/:id',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_approve_registration'),
    getRegistrationSubmission,
);
router.post(
    '/registration-submissions/:id/approve',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_approve_registration'),
    approveSubmission,
);
router.post(
    '/registration-submissions/:id/reject',
    ...authenticateStaff,
    requirePermission('patient-info', 'can_approve_registration'),
    rejectSubmission,
);

export default router;
