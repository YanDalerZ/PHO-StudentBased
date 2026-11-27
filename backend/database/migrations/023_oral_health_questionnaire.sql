-- Apply before deploying the Oral Health questionnaire. Existing rows are unchanged.
ALTER TABLE public.oral_health
    ALTER COLUMN is_pregnant DROP DEFAULT,
    ADD COLUMN pregnancy_answer_recorded BOOLEAN NOT NULL DEFAULT FALSE
        CONSTRAINT oral_health_pregnancy_answer_present CHECK (NOT pregnancy_answer_recorded OR is_pregnant IS NOT NULL),
    ADD COLUMN medical_history JSONB
        CONSTRAINT oral_health_medical_history_object CHECK (jsonb_typeof(medical_history) = 'object'),
    ADD COLUMN dietary_social_habits JSONB
        CONSTRAINT oral_health_dietary_social_habits_object CHECK (jsonb_typeof(dietary_social_habits) = 'object'),
    ADD CONSTRAINT oral_health_trimester_requires_pregnancy CHECK (
        NOT (medical_history ? 'pregnancy_trimester') OR is_pregnant IS TRUE
    );

COMMENT ON COLUMN public.oral_health.pregnancy_answer_recorded IS
    'Distinguishes explicit questionnaire answers from legacy unchecked pregnancy values.';
