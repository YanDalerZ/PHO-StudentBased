type AnswerWith<Details> = { answer: boolean } & Partial<Details>;
type DetailedAnswer = AnswerWith<{ details: string }>;
export type HabitAnswer = AnswerWith<{ amount: string; frequency: string; duration: string }>;
export type Trimester = 1 | 2 | 3;

export interface OralHealthMedicalHistory {
  temperature_c?: number;
  fever_onset_date?: string;
  allergies?: DetailedAnswer;
  hypertension_stroke?: AnswerWith<{ stroke_history: boolean; medication: string }>;
  diabetes?: AnswerWith<{ last_checkup_date: string; medication: string }>;
  bleeding_disorder?: AnswerWith<{ history_of_bleeding: boolean }>;
  cardiovascular_disease?: DetailedAnswer;
  thyroid_disorder?: DetailedAnswer;
  hepatitis?: AnswerWith<{ type: string }>;
  tumors?: DetailedAnswer;
  medical_hospitalization?: AnswerWith<{ last_admission_date: string; cause: string }>;
  surgical_procedure?: DetailedAnswer;
  dental_procedure?: DetailedAnswer;
  circumcision?: DetailedAnswer;
  piercing?: DetailedAnswer;
  other_conditions?: DetailedAnswer;
  seizures?: boolean;
  tattoos?: AnswerWith<{ last_tattoo_date: string }>;
  last_menstrual_period?: string;
  pregnancy_trimester?: Trimester;
  maintenance_medication?: DetailedAnswer;
  previous_toothache?: AnswerWith<{ date: string }>;
}

export interface OralHealthDietarySocialHabits {
  sweetened_food_drinks?: HabitAnswer;
  alcohol?: HabitAnswer;
  tobacco?: HabitAnswer;
  betel_nut?: HabitAnswer;
  coffee?: AnswerWith<{ times_per_day: number }>;
  alcohol_previous_night?: boolean;
}
