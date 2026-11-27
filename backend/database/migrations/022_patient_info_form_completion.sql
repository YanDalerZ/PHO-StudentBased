-- Run in a reviewed migration transaction before deploying the dashboard fix.
-- Registration creates an empty Patient Information row; only an explicit form
-- save completes this module. Preserve independently verifiable historical saves.
ALTER TABLE PATIENT_INFO ADD COLUMN IF NOT EXISTS form_saved BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE PATIENT_INFO pi
SET form_saved = TRUE
WHERE NOT pi.form_saved AND (
    NULLIF(BTRIM(pi.file_no), '') IS NOT NULL
    OR pi.updated_at > pi.created_at
    OR EXISTS (SELECT 1 FROM ANIMAL_BITES ab WHERE ab.patient_info_id = pi.id)
    OR EXISTS (
        SELECT 1 FROM AUDIT_EVENTS ae
        WHERE ae.entity_type = 'patient_info' AND ae.entity_id = pi.id::text
          AND ae.action IN ('PATIENT_INFO_CREATED', 'PATIENT_INFO_UPDATED')
    )
);

COMMENT ON COLUMN PATIENT_INFO.form_saved IS
    'True after the separate Patient Information form is saved. Registration-only rows remain false.';
