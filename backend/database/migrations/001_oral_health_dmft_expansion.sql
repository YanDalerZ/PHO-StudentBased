-- Migration: 001_oral_health_dmft_expansion.sql
-- Description: Adds DMFT (Decayed, Missing, Filled Teeth) counts, tooth charts, diagnosis, and treatment columns to ORAL_HEALTH table

ALTER TABLE ORAL_HEALTH
    ADD COLUMN IF NOT EXISTS tooth_chart_upper JSONB,
    ADD COLUMN IF NOT EXISTS tooth_chart_lower JSONB,
    ADD COLUMN IF NOT EXISTS oral_health_condition VARCHAR(100),
    ADD COLUMN IF NOT EXISTS no_of_perm_teeth INT,
    ADD COLUMN IF NOT EXISTS no_of_perm_sound_teeth INT,
    ADD COLUMN IF NOT EXISTS no_of_decayed_teeth INT,
    ADD COLUMN IF NOT EXISTS no_of_missing_teeth INT,
    ADD COLUMN IF NOT EXISTS no_of_filled_teeth INT,
    ADD COLUMN IF NOT EXISTS total_dmft INT,
    ADD COLUMN IF NOT EXISTS no_of_primary_teeth INT,
    ADD COLUMN IF NOT EXISTS no_of_primary_sound_teeth INT,
    ADD COLUMN IF NOT EXISTS no_of_primary_decayed INT,
    ADD COLUMN IF NOT EXISTS no_of_primary_missing INT,
    ADD COLUMN IF NOT EXISTS no_of_primary_filled INT,
    ADD COLUMN IF NOT EXISTS total_dmft_primary INT,
    ADD COLUMN IF NOT EXISTS remarks_diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS recommended_treatment TEXT,
    ADD COLUMN IF NOT EXISTS treatment_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consent_notes TEXT;
