-- Each target edit appends a revision. The latest revision per school, module,
-- indicator, and exact date interval is the active target; history is retained.
ALTER TABLE USER_MODULE_PERMISSIONS
    ADD COLUMN IF NOT EXISTS can_manage_targets BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS REPORT_TARGET_REVISIONS (
    id BIGSERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    module_slug VARCHAR(30) NOT NULL,
    indicator VARCHAR(40) NOT NULL,
    period_label VARCHAR(32),
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    target_count INT NOT NULL CHECK (target_count >= 0),
    source_note TEXT NOT NULL CHECK (NULLIF(BTRIM(source_note), '') IS NOT NULL),
    changed_by INT NOT NULL REFERENCES USERS(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT report_target_dates_check CHECK (date_from <= date_to),
    CONSTRAINT report_target_indicator_check CHECK (
        (module_slug = 'patient-info' AND indicator = 'registrations') OR
        (module_slug = 'oral-health' AND indicator = 'examined_students') OR
        (module_slug = 'deworming' AND indicator = 'eligible_students') OR
        (module_slug = 'vital-signs' AND indicator = 'screened_students') OR
        (module_slug = 'immunization' AND indicator IN ('mr_td_grade1', 'mr_td_grade7', 'hpv_grade4_female'))
    )
);

CREATE INDEX IF NOT EXISTS idx_report_target_latest
    ON REPORT_TARGET_REVISIONS (module_slug, indicator, date_from, date_to, school_id, id DESC);

-- Import existing deworming snapshots without implying that the legacy
-- baseline was entered through the new manual target workflow. An override
-- becomes the imported effective count; its source is explicitly labeled.
INSERT INTO REPORT_TARGET_REVISIONS
    (school_id, module_slug, indicator, period_label, date_from, date_to,
     target_count, source_note, changed_by, changed_at)
SELECT dt.school_id, 'deworming', 'eligible_students', dt.period,
       CASE WHEN RIGHT(dt.period, 1) = '1'
            THEN MAKE_DATE(LEFT(dt.period, 4)::int, 7, 1)
            ELSE MAKE_DATE(LEFT(dt.period, 4)::int + 1, 1, 1) END,
       CASE WHEN RIGHT(dt.period, 1) = '1'
            THEN MAKE_DATE(LEFT(dt.period, 4)::int, 12, 31)
            ELSE MAKE_DATE(LEFT(dt.period, 4)::int + 1, 6, 30) END,
       COALESCE(dt.override_target_count, dt.baseline_target_count),
       'Imported legacy Deworming snapshot (' || dt.baseline_source || ')' ||
           CASE WHEN dt.override_reason IS NULL THEN '' ELSE ': ' || dt.override_reason END,
       dt.updated_by, dt.updated_at
FROM DEWORMING_TARGETS dt
WHERE NOT EXISTS (
    SELECT 1 FROM REPORT_TARGET_REVISIONS r
    WHERE r.school_id = dt.school_id AND r.module_slug = 'deworming'
      AND r.indicator = 'eligible_students' AND r.period_label = dt.period
);
