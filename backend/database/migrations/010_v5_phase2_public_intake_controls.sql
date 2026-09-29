-- Migration 010: Phase 2 public intake controls
-- Records explicit consent metadata and enforces one active invitation per school.

ALTER TABLE REGISTRATION_SUBMISSIONS
    ADD COLUMN IF NOT EXISTS consent_metadata JSONB;

UPDATE REGISTRATION_SUBMISSIONS
SET consent_metadata = jsonb_build_object(
    'guardian_consent', COALESCE((payload->>'guardian_consent')::boolean, FALSE),
    'privacy_notice_version', COALESCE(payload->>'privacy_notice_version', payload_schema_version),
    'recorded_at', submitted_at
)
WHERE consent_metadata IS NULL;

ALTER TABLE REGISTRATION_SUBMISSIONS
    ALTER COLUMN consent_metadata SET NOT NULL;

ALTER TABLE REGISTRATION_SUBMISSIONS
    DROP CONSTRAINT IF EXISTS registration_submissions_consent_metadata_check;

ALTER TABLE REGISTRATION_SUBMISSIONS
    ADD CONSTRAINT registration_submissions_consent_metadata_check CHECK (
        consent_metadata->>'guardian_consent' = 'true'
        AND NULLIF(BTRIM(consent_metadata->>'privacy_notice_version'), '') IS NOT NULL
        AND NULLIF(BTRIM(consent_metadata->>'recorded_at'), '') IS NOT NULL
    );

UPDATE REGISTRATION_INVITATIONS
SET status = 'expired'
WHERE status = 'active' AND expires_at <= NOW();

CREATE UNIQUE INDEX unique_active_registration_invitation_school
    ON REGISTRATION_INVITATIONS (school_id)
    WHERE status = 'active';
