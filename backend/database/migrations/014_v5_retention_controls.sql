-- Retention holds protect a single staged submission or audit event from purge.
-- Released holds are removed with the underlying record when its retention
-- period expires. Active holds are never removed by the retention job.
CREATE TABLE RETENTION_HOLDS (
    id BIGSERIAL PRIMARY KEY,
    submission_id INT REFERENCES REGISTRATION_SUBMISSIONS(id) ON DELETE CASCADE,
    audit_event_id INT REFERENCES AUDIT_EVENTS(id) ON DELETE CASCADE,
    reason VARCHAR(500) NOT NULL CHECK (CHAR_LENGTH(BTRIM(reason)) BETWEEN 1 AND 500),
    created_by INT NOT NULL REFERENCES USERS(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_by INT REFERENCES USERS(id),
    released_at TIMESTAMPTZ,
    CONSTRAINT retention_hold_one_target_check CHECK ((submission_id IS NULL) <> (audit_event_id IS NULL)),
    CONSTRAINT retention_hold_release_check CHECK ((released_at IS NULL) = (released_by IS NULL))
);

CREATE UNIQUE INDEX retention_active_submission_hold_unique
    ON RETENTION_HOLDS (submission_id) WHERE released_at IS NULL AND submission_id IS NOT NULL;
CREATE UNIQUE INDEX retention_active_audit_hold_unique
    ON RETENTION_HOLDS (audit_event_id) WHERE released_at IS NULL AND audit_event_id IS NOT NULL;

CREATE INDEX retention_pending_candidates
    ON REGISTRATION_SUBMISSIONS (submitted_at, id) WHERE status = 'pending';
CREATE INDEX retention_rejected_candidates
    ON REGISTRATION_SUBMISSIONS (reviewed_at, id) WHERE status = 'rejected';
-- Migration 013 already supplies the audit-event created_at/id browser index.

-- Holds are managed by an active application Admin (or a DBA acting with that
-- Admin's approved user ID). Their creation and release are audited without
-- copying the reason or any patient payload into AUDIT_EVENTS.
CREATE FUNCTION enforce_retention_hold_v5() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    acting_user INT;
    action_name TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.released_at IS NULL THEN
            RAISE EXCEPTION 'Active retention holds cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        acting_user := NEW.created_by;
        action_name := 'CREATE_RETENTION_HOLD';
    ELSE
        IF OLD.released_at IS NOT NULL
            OR NEW.released_at IS NULL OR NEW.released_by IS NULL
            OR NEW.submission_id IS DISTINCT FROM OLD.submission_id
            OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id
            OR NEW.reason IS DISTINCT FROM OLD.reason
            OR NEW.created_by IS DISTINCT FROM OLD.created_by
            OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Retention holds may only be released once';
        END IF;
        acting_user := NEW.released_by;
        action_name := 'RELEASE_RETENTION_HOLD';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM USERS WHERE id = acting_user AND portal_role = 'admin' AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'An active Admin account is required to manage retention holds';
    END IF;

    INSERT INTO AUDIT_EVENTS (actor_id, portal_role, action, entity_type, entity_id, details)
    VALUES (acting_user, 'admin', action_name, 'retention_hold', NEW.id::text,
            jsonb_build_object('target_type',
                CASE WHEN NEW.submission_id IS NULL THEN 'audit_event' ELSE 'submission' END));
    RETURN NEW;
END;
$$;

CREATE TRIGGER retention_hold_guard_v5
    BEFORE INSERT OR UPDATE OR DELETE ON RETENTION_HOLDS
    FOR EACH ROW EXECUTE FUNCTION enforce_retention_hold_v5();
