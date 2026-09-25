-- Migration 003: QR Invitations and Review Queue (Phase 2)
-- Enables the public registration workflow with quarantined submissions.

BEGIN;

-- 1. Create REGISTRATION_INVITATIONS table
CREATE TABLE IF NOT EXISTS REGISTRATION_INVITATIONS (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of the 128-bit token
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    created_by INT NOT NULL REFERENCES USERS(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    submission_limit INT DEFAULT 100,
    submission_count INT DEFAULT 0,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by INT NULL REFERENCES USERS(id),
    revocation_reason TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create REGISTRATION_SUBMISSIONS table
CREATE TABLE IF NOT EXISTS REGISTRATION_SUBMISSIONS (
    id SERIAL PRIMARY KEY,
    invitation_id INT NOT NULL REFERENCES REGISTRATION_INVITATIONS(id),
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    payload JSONB NOT NULL,
    payload_schema_version VARCHAR(20) DEFAULT 'v1',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    idempotency_key VARCHAR(100) UNIQUE NULL,
    duplicate_match_summary JSONB NULL,
    reviewed_by INT NULL REFERENCES USERS(id),
    reviewed_at TIMESTAMPTZ NULL,
    decision_reason TEXT NULL,
    created_student_id INT NULL REFERENCES STUDENTS(id),
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create REGISTRATION_SUBMISSION_EVENTS table
CREATE TABLE IF NOT EXISTS REGISTRATION_SUBMISSION_EVENTS (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL REFERENCES REGISTRATION_SUBMISSIONS(id),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('submitted', 'duplicate_flagged', 'approved_new', 'merged', 'rejected')),
    actor_id INT NULL REFERENCES USERS(id), -- NULL if event triggered by public submission
    event_metadata JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reg_invitations_token ON REGISTRATION_INVITATIONS(token_hash);
CREATE INDEX IF NOT EXISTS idx_reg_invitations_school ON REGISTRATION_INVITATIONS(school_id);
CREATE INDEX IF NOT EXISTS idx_reg_submissions_invitation ON REGISTRATION_SUBMISSIONS(invitation_id);
CREATE INDEX IF NOT EXISTS idx_reg_submissions_school ON REGISTRATION_SUBMISSIONS(school_id);
CREATE INDEX IF NOT EXISTS idx_reg_submissions_status ON REGISTRATION_SUBMISSIONS(status);
CREATE INDEX IF NOT EXISTS idx_reg_submission_events_submission ON REGISTRATION_SUBMISSION_EVENTS(submission_id);

COMMIT;
