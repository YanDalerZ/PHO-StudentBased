-- Migration: 004_v5_authorization_correction.sql
-- Description: Enforces unique constraints and cleans up invalid module grants.

BEGIN;

-- 1. Ensure unique constraints on assignments
-- Since soft deletion (revoked_at IS NULL) is used, we need partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_module 
    ON USER_MODULE_PERMISSIONS (user_id, module_id) 
    WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_school 
    ON USER_SCHOOL_ASSIGNMENTS (user_id, school_id) 
    WHERE revoked_at IS NULL;

-- 2. Cleanup invalid `can_approve_registration` grants on non-Patient Information modules.
-- Only the 'patient-info' module should support the 'can_approve_registration' action.
UPDATE USER_MODULE_PERMISSIONS
SET can_approve_registration = FALSE
WHERE module_id IN (
    SELECT id FROM MODULES WHERE slug != 'patient-info'
) AND can_approve_registration = TRUE;

COMMIT;
