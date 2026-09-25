-- Phase 1 production release reconciliation.
--
-- This forward-only migration is intentionally safe for both supported inputs:
--   1. the clean Phase 4 schema; and
--   2. the known partial v5 schema left by migrations 002-006.
--
-- Do not execute this file directly. The production runner classifies the
-- starting schema, obtains an advisory lock, applies this SQL and the explicit
-- access manifest, validates the result, and writes the checksum ledger in one
-- transaction.

DO $$
BEGIN
    CREATE TYPE portal_role_enum AS ENUM ('school_staff', 'superuser', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE USERS ADD COLUMN IF NOT EXISTS portal_role portal_role_enum;
ALTER TABLE USERS ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
    ) THEN
        EXECUTE $sql$
            UPDATE USERS
            SET portal_role = CASE role::text
                WHEN 'teacher' THEN 'school_staff'::portal_role_enum
                WHEN 'superuser' THEN 'superuser'::portal_role_enum
                WHEN 'admin' THEN 'admin'::portal_role_enum
                ELSE portal_role
            END,
            job_title = COALESCE(job_title, CASE role::text
                WHEN 'teacher' THEN 'Teacher'
                WHEN 'superuser' THEN 'Superuser'
                WHEN 'admin' THEN 'Administrator'
                ELSE NULL
            END)
            WHERE portal_role IS NULL OR job_title IS NULL
        $sql$;
    END IF;

    IF EXISTS (SELECT 1 FROM USERS WHERE portal_role IS NULL) THEN
        RAISE EXCEPTION 'Cannot map every legacy user to an approved portal role';
    END IF;
END $$;

ALTER TABLE USERS ALTER COLUMN portal_role SET NOT NULL;

CREATE TABLE IF NOT EXISTS USER_SCHOOL_ASSIGNMENTS (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id) ON DELETE CASCADE,
    school_id INT NOT NULL REFERENCES SCHOOLS(id) ON DELETE CASCADE,
    assigned_by INT REFERENCES USERS(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by INT REFERENCES USERS(id) NULL
);

CREATE TABLE IF NOT EXISTS USER_MODULE_PERMISSIONS (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id) ON DELETE CASCADE,
    module_id INT NOT NULL REFERENCES MODULES(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_create BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve_registration BOOLEAN NOT NULL DEFAULT FALSE,
    can_report BOOLEAN NOT NULL DEFAULT FALSE,
    can_export BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by INT REFERENCES USERS(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by INT REFERENCES USERS(id) NULL
);

CREATE TABLE IF NOT EXISTS AUDIT_EVENTS (
    id SERIAL PRIMARY KEY,
    actor_id INT REFERENCES USERS(id),
    portal_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    school_id INT REFERENCES SCHOOLS(id),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS REGISTRATION_INVITATIONS (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    created_by INT NOT NULL REFERENCES USERS(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    submission_limit INT NOT NULL DEFAULT 100,
    submission_count INT NOT NULL DEFAULT 0,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by INT NULL REFERENCES USERS(id),
    revocation_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS REGISTRATION_SUBMISSIONS (
    id SERIAL PRIMARY KEY,
    invitation_id INT NOT NULL REFERENCES REGISTRATION_INVITATIONS(id),
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    payload JSONB NOT NULL,
    payload_schema_version VARCHAR(20) NOT NULL DEFAULT 'v1',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    idempotency_key VARCHAR(100) UNIQUE NULL,
    duplicate_match_summary JSONB NULL,
    reviewed_by INT NULL REFERENCES USERS(id),
    reviewed_at TIMESTAMPTZ NULL,
    decision_reason TEXT NULL,
    created_student_id INT NULL REFERENCES STUDENTS(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS REGISTRATION_SUBMISSION_EVENTS (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL REFERENCES REGISTRATION_SUBMISSIONS(id),
    event_type VARCHAR(50) NOT NULL,
    actor_id INT NULL REFERENCES USERS(id),
    event_metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_invitations_status_v5_check') THEN
        ALTER TABLE REGISTRATION_INVITATIONS ADD CONSTRAINT registration_invitations_status_v5_check
            CHECK (status IN ('active', 'revoked', 'expired')) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_submissions_status_v5_check') THEN
        ALTER TABLE REGISTRATION_SUBMISSIONS ADD CONSTRAINT registration_submissions_status_v5_check
            CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_submission_events_type_v5_check') THEN
        ALTER TABLE REGISTRATION_SUBMISSION_EVENTS ADD CONSTRAINT registration_submission_events_type_v5_check
            CHECK (event_type IN ('submitted', 'duplicate_flagged', 'approved_new', 'merged', 'rejected')) NOT VALID;
    END IF;
END $$;

ALTER TABLE REGISTRATION_INVITATIONS VALIDATE CONSTRAINT registration_invitations_status_v5_check;
ALTER TABLE REGISTRATION_SUBMISSIONS VALIDATE CONSTRAINT registration_submissions_status_v5_check;
ALTER TABLE REGISTRATION_SUBMISSION_EVENTS VALIDATE CONSTRAINT registration_submission_events_type_v5_check;

CREATE INDEX IF NOT EXISTS idx_reg_invitations_token ON REGISTRATION_INVITATIONS(token_hash);
CREATE INDEX IF NOT EXISTS idx_reg_invitations_school ON REGISTRATION_INVITATIONS(school_id);
CREATE INDEX IF NOT EXISTS idx_reg_submissions_invitation ON REGISTRATION_SUBMISSIONS(invitation_id);
CREATE INDEX IF NOT EXISTS idx_reg_submissions_school ON REGISTRATION_SUBMISSIONS(school_id);
CREATE INDEX IF NOT EXISTS idx_reg_submissions_status ON REGISTRATION_SUBMISSIONS(status);
CREATE INDEX IF NOT EXISTS idx_reg_submission_events_submission ON REGISTRATION_SUBMISSION_EVENTS(submission_id);

-- The earlier migration 002 created broad actorless grants. They are not
-- approved explicit grants, so revoke them before applying the owner manifest.
WITH revoked AS (
    UPDATE USER_MODULE_PERMISSIONS ump
    SET revoked_at = CURRENT_TIMESTAMP
    FROM USERS u
    WHERE ump.user_id = u.id
      AND ump.revoked_at IS NULL
      AND (u.portal_role = 'admin' OR ump.granted_by IS NULL)
    RETURNING ump.id
)
INSERT INTO AUDIT_EVENTS (action, entity_type, details)
SELECT 'migration_revoke_unaudited_grants', 'user_module_permissions',
       jsonb_build_object('migration', '007_v5_phase1_release_reconciliation', 'revoked_count', COUNT(*))
FROM revoked HAVING COUNT(*) > 0;

WITH revoked AS (
    UPDATE USER_SCHOOL_ASSIGNMENTS usa
    SET revoked_at = CURRENT_TIMESTAMP
    FROM USERS u
    WHERE usa.user_id = u.id
      AND usa.revoked_at IS NULL
      AND (u.portal_role <> 'school_staff' OR usa.assigned_by IS NULL)
    RETURNING usa.id
)
INSERT INTO AUDIT_EVENTS (action, entity_type, details)
SELECT 'migration_revoke_unaudited_assignments', 'user_school_assignments',
       jsonb_build_object('migration', '007_v5_phase1_release_reconciliation', 'revoked_count', COUNT(*))
FROM revoked HAVING COUNT(*) > 0;

UPDATE USER_MODULE_PERMISSIONS ump
SET can_approve_registration = FALSE
FROM USERS u, MODULES m
WHERE ump.user_id = u.id AND ump.module_id = m.id AND ump.revoked_at IS NULL
  AND (u.portal_role <> 'school_staff' OR m.slug <> 'patient-info')
  AND ump.can_approve_registration = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_module
    ON USER_MODULE_PERMISSIONS (user_id, module_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_school
    ON USER_SCHOOL_ASSIGNMENTS (user_id, school_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS REPORT_EXPORTS (
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

CREATE INDEX IF NOT EXISTS idx_report_exports_requester_created
    ON REPORT_EXPORTS (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_exports_status ON REPORT_EXPORTS (status);
CREATE INDEX IF NOT EXISTS idx_report_exports_expires_at
    ON REPORT_EXPORTS (expires_at) WHERE expires_at IS NOT NULL;
