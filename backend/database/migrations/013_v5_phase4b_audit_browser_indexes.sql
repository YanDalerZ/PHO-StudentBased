-- Phase 4B Milestone 6: bounded, stable audit browsing.
CREATE INDEX IF NOT EXISTS idx_audit_events_browse
    ON AUDIT_EVENTS (created_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_browse
    ON AUDIT_EVENTS (actor_id, created_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action_browse
    ON AUDIT_EVENTS (action, created_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_browse
    ON AUDIT_EVENTS (entity_type, created_at DESC NULLS LAST, id DESC);
