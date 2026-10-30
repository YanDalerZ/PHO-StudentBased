-- Review before deployment. Existing clinical text must not be inferred or copied.
-- Historical Deferred rows remain readable with a NULL explanation until corrected.
ALTER TABLE public.immunization
    ADD COLUMN deferred_reason_text TEXT NULL
    CONSTRAINT immunization_deferred_reason_length CHECK (char_length(deferred_reason_text) <= 2000);
