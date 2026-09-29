-- Migration 009: Phase 2 concurrency controls
-- Prevents more than one unresolved submission for the same normalized LRN.

CREATE UNIQUE INDEX unique_pending_registration_lrn
    ON REGISTRATION_SUBMISSIONS (BTRIM(payload->>'student_lrn'))
    WHERE status = 'pending'
      AND NULLIF(BTRIM(payload->>'student_lrn'), '') IS NOT NULL;
