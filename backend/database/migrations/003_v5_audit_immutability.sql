-- 003_v5_audit_immutability.sql
-- Enforces immutability for the AUDIT_EVENTS table

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_audit_modification ON AUDIT_EVENTS;

CREATE TRIGGER trigger_prevent_audit_modification
BEFORE UPDATE OR DELETE ON AUDIT_EVENTS
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
