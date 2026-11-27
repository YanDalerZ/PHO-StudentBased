import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type { HabitAnswer, OralHealthDietarySocialHabits, OralHealthMedicalHistory } from '../../types/oralHealthQuestionnaire';

const inputClasses = 'w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-teal-500 disabled:opacity-70';
const labelClasses = 'block min-w-0 space-y-1.5 text-sm font-medium text-slate-700';
const gridClasses = 'grid min-w-0 gap-4 sm:grid-cols-2';
const sectionClasses = 'min-w-0 space-y-4 border-t border-slate-100 pt-6';

function Answer({ label, value, onChange }: {
    label: string;
    value?: boolean | null;
    onChange: (value: boolean | undefined) => void;
}) {
    const id = useId();
    return (
        <div className={labelClasses}>
            <label htmlFor={id} className="block">{label}</label>
            <select id={id} className={inputClasses} value={value === true ? 'yes' : value === false ? 'no' : ''}
                onChange={event => onChange(event.target.value === '' ? undefined : event.target.value === 'yes')}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
            </select>
        </div>
    );
}

function TextField({ label, value, onChange, type = 'text' }: {
    label: string;
    value?: string;
    onChange: (value: string | undefined) => void;
    type?: 'text' | 'date';
}) {
    return (
        <label className={labelClasses}>
            <span>{label}</span>
            <input className={inputClasses} type={type} value={value ?? ''}
                maxLength={type === 'text' ? 500 : undefined}
                max={type === 'date' ? '9999-12-31' : undefined}
                onChange={event => onChange(event.target.value || undefined)}
                onBlur={type === 'text' ? event => {
                    if (event.target.value && !event.target.value.trim()) onChange(undefined);
                } : undefined} />
        </label>
    );
}

function NumberField({ label, value, onChange, min, max, step }: {
    label: string;
    value?: number;
    onChange: (value: number | undefined) => void;
    min: number;
    max: number;
    step: number;
}) {
    return (
        <label className={labelClasses}>
            <span>{label}</span>
            <input className={inputClasses} type="number" inputMode={step === 1 ? 'numeric' : 'decimal'}
                min={min} max={max} step={step} value={value ?? ''}
                onChange={event => onChange(event.target.value === '' ? undefined : event.target.valueAsNumber)} />
        </label>
    );
}

function DetailsGroup({ label, value, onChange, children }: {
    label: string;
    value?: { answer: boolean };
    onChange: (value: { answer: boolean } | undefined) => void;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
            <Answer label={label} value={value?.answer}
                onChange={answer => onChange(answer === undefined ? undefined : { answer })} />
            {value?.answer === true && children}
        </div>
    );
}

function setField<T, K extends keyof T>(current: T, key: K, value: T[K] | undefined): T {
    const next = { ...current };
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
}

type DetailedMedicalField =
    | 'allergies' | 'cardiovascular_disease' | 'thyroid_disorder' | 'tumors'
    | 'surgical_procedure' | 'dental_procedure' | 'circumcision' | 'piercing'
    | 'other_conditions' | 'maintenance_medication';

const otherProcedures = [
    ['surgical_procedure', 'Previous surgical procedure', 'Surgical procedure and post-operative details'],
    ['dental_procedure', 'Previous dental hospitalization or procedure', 'Dental hospitalization or procedure details'],
    ['circumcision', 'Circumcision', 'Circumcision details'],
    ['piercing', 'Piercing', 'Piercing details'],
] as const;

const trackedHabits = [
    ['sweetened_food_drinks', 'Sugar-sweetened food or drinks'],
    ['alcohol', 'Alcohol use'],
    ['tobacco', 'Tobacco use'],
    ['betel_nut', 'Betel nut chewing'],
] as const;

interface OralHealthQuestionnaireProps {
    medicalHistory: OralHealthMedicalHistory;
    dietaryHabits: OralHealthDietarySocialHabits;
    pregnancy: boolean | null;
    showReproductiveHistory: boolean;
    disabled: boolean;
    onMedicalHistoryChange: (value: OralHealthMedicalHistory) => void;
    onDietaryHabitsChange: (value: OralHealthDietarySocialHabits) => void;
    onPregnancyChange: (value: boolean | null) => void;
}

export default function OralHealthQuestionnaire({
    medicalHistory, dietaryHabits, pregnancy, showReproductiveHistory, disabled,
    onMedicalHistoryChange, onDietaryHabitsChange, onPregnancyChange,
}: OralHealthQuestionnaireProps) {
    const trimesterId = useId();
    const medical = <K extends keyof OralHealthMedicalHistory>(key: K, value: OralHealthMedicalHistory[K]) =>
        onMedicalHistoryChange(setField(medicalHistory, key, value));
    const dietary = <K extends keyof OralHealthDietarySocialHabits>(key: K, value: OralHealthDietarySocialHabits[K]) =>
        onDietaryHabitsChange(setField(dietaryHabits, key, value));

    const detailedQuestion = (key: DetailedMedicalField, label: string, detailLabel: string) => (
        <DetailsGroup key={key} label={label} value={medicalHistory[key]} onChange={value => medical(key, value)}>
            <TextField label={detailLabel} value={medicalHistory[key]?.details}
                onChange={value => medical(key, setField(medicalHistory[key] ?? { answer: true }, 'details', value))} />
        </DetailsGroup>
    );
    const habitDetails = (key: typeof trackedHabits[number][0], label: string) => {
        const habit = dietaryHabits[key] ?? { answer: true };
        const details: [keyof Omit<HabitAnswer, 'answer'>, string][] = [
            ['amount', 'amount'], ['frequency', 'frequency'], ['duration', 'duration'],
        ];
        return (
            <DetailsGroup key={key} label={label} value={dietaryHabits[key]} onChange={value => dietary(key, value)}>
                {details.map(([field, detail]) => (
                    <TextField key={field} label={`${label} ${detail}`} value={habit[field]}
                        onChange={value => dietary(key, setField(habit, field, value))} />
                ))}
            </DetailsGroup>
        );
    };

    return (
        <>
            <section aria-labelledby="oral-medical-history" className={sectionClasses}>
                <h2 id="oral-medical-history" className="text-base font-bold text-slate-900">Medical History &amp; Co-Morbidities</h2>
                <fieldset disabled={disabled} className="min-w-0 space-y-5">
                    <div className={gridClasses}>
                        <NumberField label="Temperature (°C)" value={medicalHistory.temperature_c} min={0} max={60} step={0.01}
                            onChange={value => medical('temperature_c', value)} />
                        <TextField label="Date of initial fever onset" value={medicalHistory.fever_onset_date} type="date"
                            onChange={value => medical('fever_onset_date', value)} />
                    </div>
                    <div className={gridClasses}>
                        {detailedQuestion('allergies', 'Allergies', 'Allergy details (food or medicine)')}
                        <DetailsGroup label="Hypertension or history of stroke (CVA)" value={medicalHistory.hypertension_stroke}
                            onChange={value => medical('hypertension_stroke', value)}>
                            <Answer label="History of stroke" value={medicalHistory.hypertension_stroke?.stroke_history}
                                onChange={value => medical('hypertension_stroke', setField(medicalHistory.hypertension_stroke ?? { answer: true }, 'stroke_history', value))} />
                            <TextField label="Hypertension or stroke medication" value={medicalHistory.hypertension_stroke?.medication}
                                onChange={value => medical('hypertension_stroke', setField(medicalHistory.hypertension_stroke ?? { answer: true }, 'medication', value))} />
                        </DetailsGroup>
                        <DetailsGroup label="Diabetes mellitus" value={medicalHistory.diabetes} onChange={value => medical('diabetes', value)}>
                            <TextField label="Date of last diabetes checkup" type="date" value={medicalHistory.diabetes?.last_checkup_date}
                                onChange={value => medical('diabetes', setField(medicalHistory.diabetes ?? { answer: true }, 'last_checkup_date', value))} />
                            <TextField label="Diabetes medication" value={medicalHistory.diabetes?.medication}
                                onChange={value => medical('diabetes', setField(medicalHistory.diabetes ?? { answer: true }, 'medication', value))} />
                        </DetailsGroup>
                        <DetailsGroup label="Bleeding disorder" value={medicalHistory.bleeding_disorder} onChange={value => medical('bleeding_disorder', value)}>
                            <Answer label="History of bleeding" value={medicalHistory.bleeding_disorder?.history_of_bleeding}
                                onChange={value => medical('bleeding_disorder', setField(medicalHistory.bleeding_disorder ?? { answer: true }, 'history_of_bleeding', value))} />
                        </DetailsGroup>
                        {detailedQuestion('cardiovascular_disease', 'Cardiovascular or heart disease', 'Cardiovascular or heart disease details')}
                        {detailedQuestion('thyroid_disorder', 'Thyroid disorder', 'Thyroid disorder details')}
                        <DetailsGroup label="Hepatitis" value={medicalHistory.hepatitis} onChange={value => medical('hepatitis', value)}>
                            <TextField label="Hepatitis type" value={medicalHistory.hepatitis?.type}
                                onChange={value => medical('hepatitis', setField(medicalHistory.hepatitis ?? { answer: true }, 'type', value))} />
                        </DetailsGroup>
                        {detailedQuestion('tumors', 'Tumors', 'Tumor details')}
                    </div>

                    <fieldset className="min-w-0 space-y-3">
                        <legend className="text-sm font-semibold text-slate-900">Previous Hospitalization &amp; Procedures</legend>
                        <div className={gridClasses}>
                            <DetailsGroup label="Previous medical hospitalization" value={medicalHistory.medical_hospitalization}
                                onChange={value => medical('medical_hospitalization', value)}>
                                <TextField label="Date of last medical admission" type="date" value={medicalHistory.medical_hospitalization?.last_admission_date}
                                    onChange={value => medical('medical_hospitalization', setField(medicalHistory.medical_hospitalization ?? { answer: true }, 'last_admission_date', value))} />
                                <TextField label="Cause of last medical admission" value={medicalHistory.medical_hospitalization?.cause}
                                    onChange={value => medical('medical_hospitalization', setField(medicalHistory.medical_hospitalization ?? { answer: true }, 'cause', value))} />
                            </DetailsGroup>
                            {otherProcedures.map(([key, label, details]) => detailedQuestion(key, label, details))}
                        </div>
                    </fieldset>

                    <div className={gridClasses}>
                        {detailedQuestion('other_conditions', 'Other conditions', 'Other condition details')}
                        <div className="min-w-0 rounded-xl border border-slate-200 p-3">
                            <Answer label="History of seizures" value={medicalHistory.seizures} onChange={value => medical('seizures', value)} />
                        </div>
                        <DetailsGroup label="Tattoos" value={medicalHistory.tattoos} onChange={value => medical('tattoos', value)}>
                            <TextField label="Date of last tattoo" type="date" value={medicalHistory.tattoos?.last_tattoo_date}
                                onChange={value => medical('tattoos', setField(medicalHistory.tattoos ?? { answer: true }, 'last_tattoo_date', value))} />
                        </DetailsGroup>
                        {detailedQuestion('maintenance_medication', 'Maintenance medication', 'Maintenance medication details')}
                        <DetailsGroup label="Previous toothache or pain" value={medicalHistory.previous_toothache}
                            onChange={value => medical('previous_toothache', value)}>
                            <TextField label="Date of previous toothache or pain" type="date" value={medicalHistory.previous_toothache?.date}
                                onChange={value => medical('previous_toothache', setField(medicalHistory.previous_toothache ?? { answer: true }, 'date', value))} />
                        </DetailsGroup>
                    </div>

                    {showReproductiveHistory && (
                        <fieldset className="min-w-0 space-y-3">
                            <legend className="text-sm font-semibold text-slate-900">Menstrual &amp; Pregnancy History</legend>
                            <div className={gridClasses}>
                                <TextField label="Date of last menstrual period" type="date" value={medicalHistory.last_menstrual_period}
                                    onChange={value => medical('last_menstrual_period', value)} />
                                <Answer label="Pregnancy" value={pregnancy} onChange={value => {
                                    onPregnancyChange(value ?? null);
                                    if (value !== true) medical('pregnancy_trimester', undefined);
                                }} />
                                {pregnancy === true && (
                                    <div className={labelClasses}>
                                        <label htmlFor={trimesterId} className="block">Trimester</label>
                                        <select id={trimesterId} className={inputClasses} value={medicalHistory.pregnancy_trimester ?? ''}
                                            onChange={event => {
                                                const value = Number(event.target.value);
                                                medical('pregnancy_trimester', value === 1 || value === 2 || value === 3 ? value : undefined);
                                            }}>
                                            <option value="">Not recorded</option>
                                            <option value="1">First trimester</option>
                                            <option value="2">Second trimester</option>
                                            <option value="3">Third trimester</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </fieldset>
                    )}
                </fieldset>
            </section>
            <section aria-labelledby="oral-dietary-social-habits" className={sectionClasses}>
                <h2 id="oral-dietary-social-habits" className="text-base font-bold text-slate-900">Dietary &amp; Social Habits</h2>
                <fieldset disabled={disabled} className={cn(gridClasses, 'items-start')}>
                    {trackedHabits.map(([key, label]) => habitDetails(key, label))}
                    <DetailsGroup label="Coffee" value={dietaryHabits.coffee} onChange={value => dietary('coffee', value)}>
                        <NumberField label="Coffee times per day" value={dietaryHabits.coffee?.times_per_day} min={1} max={999} step={1}
                            onChange={value => dietary('coffee', setField(dietaryHabits.coffee ?? { answer: true }, 'times_per_day', value))} />
                    </DetailsGroup>
                    <div className="min-w-0 rounded-xl border border-slate-200 p-3">
                        <Answer label="Alcoholic drink the previous night" value={dietaryHabits.alcohol_previous_night}
                            onChange={value => dietary('alcohol_previous_night', value)} />
                    </div>
                </fieldset>
            </section>
        </>
    );
}
