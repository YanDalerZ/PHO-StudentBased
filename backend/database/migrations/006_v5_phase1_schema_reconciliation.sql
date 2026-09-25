-- Migration 006: Phase 1 schema reconciliation
-- Run through src/database/phase1Migration.ts so the migration and ledger write
-- share one transaction.

-- Remove only the actorless, exact-shape grants emitted by migration 002 after
-- migrations 004 and 005 normalized the approval flags. Actor-attributed grants
-- are deliberate assignments and are not changed here.
WITH revoked_implicit_grants AS (
    UPDATE USER_MODULE_PERMISSIONS ump
    SET revoked_at = CURRENT_TIMESTAMP
    FROM USERS u, MODULES m
    WHERE ump.user_id = u.id
      AND ump.module_id = m.id
      AND ump.revoked_at IS NULL
      AND ump.granted_by IS NULL
      AND (
        (
          u.portal_role = 'school_staff'
          AND ump.can_view = TRUE
          AND ump.can_create = TRUE
          AND ump.can_edit = TRUE
          AND ump.can_report = TRUE
          AND ump.can_export = FALSE
          AND ump.can_approve_registration = (m.slug = 'patient-info')
        )
        OR
        (
          u.portal_role = 'superuser'
          AND ump.can_view = TRUE
          AND ump.can_create = TRUE
          AND ump.can_edit = TRUE
          AND ump.can_approve_registration = FALSE
          AND ump.can_report = TRUE
          AND ump.can_export = TRUE
        )
      )
    RETURNING ump.id
)
INSERT INTO AUDIT_EVENTS (actor_id, portal_role, action, entity_type, details)
SELECT NULL,
       NULL,
       'migration_revoke_implicit_grants',
       'user_module_permissions',
       jsonb_build_object(
           'migration', '006_v5_phase1_schema_reconciliation',
           'revoked_count', COUNT(*)
       )
FROM revoked_implicit_grants
HAVING COUNT(*) > 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'registration_invitations'::regclass
          AND conname = 'registration_invitations_status_v5_check'
    ) THEN
        ALTER TABLE REGISTRATION_INVITATIONS
            ADD CONSTRAINT registration_invitations_status_v5_check
            CHECK (status IN ('active', 'revoked', 'expired')) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'registration_submissions'::regclass
          AND conname = 'registration_submissions_status_v5_check'
    ) THEN
        ALTER TABLE REGISTRATION_SUBMISSIONS
            ADD CONSTRAINT registration_submissions_status_v5_check
            CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'registration_submission_events'::regclass
          AND conname = 'registration_submission_events_type_v5_check'
    ) THEN
        ALTER TABLE REGISTRATION_SUBMISSION_EVENTS
            ADD CONSTRAINT registration_submission_events_type_v5_check
            CHECK (event_type IN ('submitted', 'duplicate_flagged', 'approved_new', 'merged', 'rejected')) NOT VALID;
    END IF;
END $$;

ALTER TABLE REGISTRATION_INVITATIONS
    VALIDATE CONSTRAINT registration_invitations_status_v5_check;
ALTER TABLE REGISTRATION_SUBMISSIONS
    VALIDATE CONSTRAINT registration_submissions_status_v5_check;
ALTER TABLE REGISTRATION_SUBMISSION_EVENTS
    VALIDATE CONSTRAINT registration_submission_events_type_v5_check;

CREATE TABLE REPORT_EXPORTS (
    id SERIAL PRIMARY KEY,
    requested_by INT NOT NULL REFERENCES USERS(id),
    module_id INT NOT NULL REFERENCES MODULES(id),
    format VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'xlsx')),
    filters JSONB NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'expired')),
    row_count INT NULL CHECK (row_count >= 0),
    storage_reference TEXT NULL,
    error_code VARCHAR(100) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_report_exports_requester_created
    ON REPORT_EXPORTS (requested_by, created_at DESC);
CREATE INDEX idx_report_exports_status
    ON REPORT_EXPORTS (status);
CREATE INDEX idx_report_exports_expires_at
    ON REPORT_EXPORTS (expires_at)
    WHERE expires_at IS NOT NULL;
