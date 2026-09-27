-- Migration 008: Phase 2 registration contract reconciliation
-- Adds invariant checks and indexes required by the Plan v5 API contract.

ALTER TABLE REGISTRATION_INVITATIONS
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN submission_limit SET NOT NULL,
    ALTER COLUMN submission_count SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE REGISTRATION_SUBMISSIONS
    ALTER COLUMN payload_schema_version SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN submitted_at SET NOT NULL;

ALTER TABLE REGISTRATION_SUBMISSION_EVENTS
    ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE REGISTRATION_INVITATIONS
    ADD CONSTRAINT registration_invitations_limit_positive_v5
        CHECK (submission_limit > 0) NOT VALID,
    ADD CONSTRAINT registration_invitations_count_valid_v5
        CHECK (submission_count >= 0 AND submission_count <= submission_limit) NOT VALID;

ALTER TABLE REGISTRATION_SUBMISSIONS
    ADD CONSTRAINT registration_submissions_payload_object_v5
        CHECK (jsonb_typeof(payload) = 'object') NOT VALID;

ALTER TABLE REGISTRATION_INVITATIONS
    VALIDATE CONSTRAINT registration_invitations_limit_positive_v5;
ALTER TABLE REGISTRATION_INVITATIONS
    VALIDATE CONSTRAINT registration_invitations_count_valid_v5;
ALTER TABLE REGISTRATION_SUBMISSIONS
    VALIDATE CONSTRAINT registration_submissions_payload_object_v5;

CREATE INDEX idx_reg_invitations_school_created
    ON REGISTRATION_INVITATIONS (school_id, created_at DESC);
CREATE INDEX idx_reg_submissions_school_status_submitted
    ON REGISTRATION_SUBMISSIONS (school_id, status, submitted_at DESC);
