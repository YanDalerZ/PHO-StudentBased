import { z } from 'zod';

const detail = z.string().trim().min(1).max(500).optional();
const date = z.iso.date().optional();
const answer = z.boolean().optional();

// Omission means not recorded. An explicit No may not carry Yes-only details.
function question<T extends z.ZodRawShape>(details: T) {
    return z.discriminatedUnion('answer', [
        z.strictObject({ answer: z.literal(false) }),
        z.strictObject({ ...details, answer: z.literal(true) }),
    ]).optional();
}

const withDetails = question({ details: detail });
const withUseDetails = question({ amount: detail, frequency: detail, duration: detail });

export const medicalHistorySchema = z.strictObject({
    temperature_c: z.number().min(0).max(60).optional(),
    fever_onset_date: date,
    allergies: withDetails,
    hypertension_stroke: question({ stroke_history: answer, medication: detail }),
    diabetes: question({ last_checkup_date: date, medication: detail }),
    bleeding_disorder: question({ history_of_bleeding: answer }),
    cardiovascular_disease: withDetails,
    thyroid_disorder: withDetails,
    hepatitis: question({ type: detail }),
    tumors: withDetails,
    medical_hospitalization: question({ last_admission_date: date, cause: detail }),
    surgical_procedure: withDetails,
    dental_procedure: withDetails,
    circumcision: withDetails,
    piercing: withDetails,
    other_conditions: withDetails,
    seizures: answer,
    tattoos: question({ last_tattoo_date: date }),
    last_menstrual_period: date,
    pregnancy_trimester: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    maintenance_medication: withDetails,
    previous_toothache: question({ date }),
});

export const dietarySocialHabitsSchema = z.strictObject({
    sweetened_food_drinks: withUseDetails,
    alcohol: withUseDetails,
    tobacco: withUseDetails,
    betel_nut: withUseDetails,
    coffee: question({ times_per_day: z.number().int().min(1).max(999).optional() }),
    alcohol_previous_night: answer,
});

export type OralHealthMedicalHistory = z.infer<typeof medicalHistorySchema>;
export type OralHealthDietarySocialHabits = z.infer<typeof dietarySocialHabitsSchema>;

export function validatePregnancyTrimester(pregnant: boolean | null | undefined, history: OralHealthMedicalHistory | null | undefined) {
    if (pregnant !== true && history?.pregnancy_trimester !== undefined) {
        throw new z.ZodError([{
            code: 'custom',
            path: ['medical_history', 'pregnancy_trimester'],
            message: 'A trimester can be recorded when pregnancy is Yes.',
        }]);
    }
}
