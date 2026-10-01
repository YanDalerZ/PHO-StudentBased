CREATE TABLE IF NOT EXISTS DEWORMING_TARGETS (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    period VARCHAR(20) NOT NULL,
    baseline_target_count INT NOT NULL,
    baseline_source VARCHAR(30) NOT NULL DEFAULT 'roster_snapshot',
    override_target_count INT NULL,
    override_reason TEXT NULL,
    created_by INT NOT NULL REFERENCES USERS(id),
    updated_by INT NOT NULL REFERENCES USERS(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deworming_targets_period_v5_check
        CHECK (period ~ '^[0-9]{4}-SY-R[12]$'),
    CONSTRAINT deworming_targets_baseline_nonnegative_v5_check
        CHECK (baseline_target_count >= 0),
    CONSTRAINT deworming_targets_source_v5_check
        CHECK (baseline_source IN ('roster_snapshot', 'manual_baseline')),
    CONSTRAINT deworming_targets_override_nonnegative_v5_check
        CHECK (override_target_count IS NULL OR override_target_count >= 0),
    CONSTRAINT deworming_targets_override_reason_v5_check
        CHECK (
            (override_target_count IS NULL AND override_reason IS NULL)
            OR
            (override_target_count IS NOT NULL AND NULLIF(BTRIM(override_reason), '') IS NOT NULL)
        ),
    CONSTRAINT deworming_targets_school_period_v5_unique UNIQUE (school_id, period)
);

CREATE INDEX IF NOT EXISTS idx_deworming_targets_period_school
    ON DEWORMING_TARGETS (period, school_id);

ALTER TABLE VITAL_SIGNS
    ADD COLUMN IF NOT EXISTS referral_needed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referral_reason VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS referral_date DATE NULL,
    ADD COLUMN IF NOT EXISTS referral_facility VARCHAR(200) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vital_signs_referral_details_v5_check'
          AND conrelid = 'vital_signs'::regclass
    ) THEN
        ALTER TABLE VITAL_SIGNS
            ADD CONSTRAINT vital_signs_referral_details_v5_check
            CHECK (
                (
                    referral_needed = FALSE
                    AND referral_reason IS NULL
                    AND referral_date IS NULL
                    AND referral_facility IS NULL
                )
                OR
                (
                    referral_needed = TRUE
                    AND NULLIF(BTRIM(referral_reason), '') IS NOT NULL
                )
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vital_signs_referral_date_v5_check'
          AND conrelid = 'vital_signs'::regclass
    ) THEN
        ALTER TABLE VITAL_SIGNS
            ADD CONSTRAINT vital_signs_referral_date_v5_check
            CHECK (referral_date IS NULL OR referral_date >= date_checked) NOT VALID;
    END IF;
END $$;

ALTER TABLE VITAL_SIGNS
    VALIDATE CONSTRAINT vital_signs_referral_details_v5_check;
ALTER TABLE VITAL_SIGNS
    VALIDATE CONSTRAINT vital_signs_referral_date_v5_check;

