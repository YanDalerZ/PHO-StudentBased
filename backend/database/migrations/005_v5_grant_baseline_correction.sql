-- Migration: 005_v5_grant_baseline_correction.sql
-- Description: Revoke invalid admin module grants and enforce baseline grant hygiene.

BEGIN;

-- 1. Soft-revoke any active module permissions assigned to users with portal_role = 'admin'
UPDATE USER_MODULE_PERMISSIONS
SET revoked_at = CURRENT_TIMESTAMP,
    revoked_by = (SELECT id FROM USERS WHERE portal_role = 'admin' ORDER BY id ASC LIMIT 1)
WHERE user_id IN (SELECT id FROM USERS WHERE portal_role = 'admin')
  AND revoked_at IS NULL;

-- 2. Clear can_approve_registration on any non-patient-info modules
UPDATE USER_MODULE_PERMISSIONS
SET can_approve_registration = FALSE
WHERE module_id IN (
    SELECT id FROM MODULES WHERE slug != 'patient-info'
) AND can_approve_registration = TRUE;

-- 3. Clear can_approve_registration for superuser role
UPDATE USER_MODULE_PERMISSIONS
SET can_approve_registration = FALSE
WHERE user_id IN (
    SELECT id FROM USERS WHERE portal_role = 'superuser'
) AND can_approve_registration = TRUE;

COMMIT;
