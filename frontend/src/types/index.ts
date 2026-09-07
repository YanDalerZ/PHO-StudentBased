// Type definitions for the application

export interface User {
  id: number;
  email: string;
  role: 'teacher' | 'superuser' | 'admin';
  first_name: string;
  last_name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Student {
  id?: number;
  prefix?: string;
  photo_url?: string | null;
  student_lrn: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  date_of_birth: string;
  sex: 'Male' | 'Female';
  birth_place?: string | null;
  mother_first_name?: string | null;
  mother_last_name?: string | null;
  mother_middle_name?: string | null;
  mother_birthdate?: string | null;
  address?: string | null;
  street_address?: string | null;
  barangay?: string | number | null;
  barangay_id?: number | null;
  barangay_name?: string | null;
  municipality?: string | number | null;
  municipality_id?: number | null;
  municipality_name?: string | null;
  province?: string | null;
  contact_no?: string | null;
  mobile?: string | null;
  parent_guardian_name?: string | null;
  parent_guardian_contact?: string | null;
  school_id: number;
  school_name?: string | null;
  grade_level: string;
  section?: string | null;
  
  // Patient Info (Part II)
  civil_status?: string | null;
  educational_attainment?: string | null;
  employment_status?: string | null;
  tin_no?: string | null;
  tax_id_no?: string | null;
  religion?: string | null;
  indigenous?: 'Yes' | 'No' | boolean | string | null;
  is_indigenous?: boolean;
  indigenous_group?: string | null;
  blood_type?: string | null;

  // Address and Contact Info (Part III)
  country?: string | null;
  region?: string | null;
  zip_code?: string | null;
  email?: string | null;
  landline?: string | null;
  psa_national_id?: string | null;

  // Other Info (Part IV - 4Ps & PWD)
  dswd_4ps?: 'Yes' | 'No' | boolean | string | null;
  is_4ps_member?: boolean;
  dswd_4ps_no?: string | null;
  fourps_household_no?: string | null;
  is_pwd?: 'Yes' | 'No' | boolean | string | null;
  pwd_type?: string | null;
  pwd_id_no?: string | null;
  pwd_id?: string | null;

  // Philhealth Info (Part V)
  philhealth_member?: 'Yes' | 'No' | boolean | string | null;
  is_philhealth_member?: boolean;

  philhealth_id?: string | null;
  philhealth_no?: string | null;
  philhealth_status_type?: string | null;
  philhealth_category?: string | null;

  registered_by?: number;
  created_at?: string;
  updated_at?: string;
  modules?: {
    patient_info?: boolean;
    oral_health?: boolean;
    deworming?: boolean;
    immunization?: boolean;
    vital_signs?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface StudentListResponse {
  data: Student[];
  total: number;
}

export interface StudentDetailResponse {
  data: Student;
}

export interface StudentProfileResponse {
  data: {
    student: Student;
    modules: {
      patient_info: PatientInfo[];
      animal_bites?: Record<string, unknown>[];
      oral_health: OralHealth[];
      deworming: Deworming[];
      immunization: Immunization[];
      vital_signs: VitalSigns[];
    };
    module_summary: {
      patient_info: boolean;
      oral_health: boolean;
      deworming: boolean;
      immunization: boolean;
      vital_signs: boolean;
    };
  };
}



export interface Municipality {
  id: string | number;
  name: string;
  province_id?: number;
}

export interface Barangay {
  id: string | number;
  municipality_id: string | number;
  name: string;
}

export interface School {
  id: string | number;
  name: string;
  barangay_id: string | number;
  district?: string;
}

export interface Module {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

export interface AnimalBite {
  id: number;
  patient_info_id: number;
  student_id: number;
  rabies_exposure_category?: string;
  anatomical_locations?: string[];
  animal_type?: string;
  type_of_exposure?: string;
  wash_bite?: boolean;
  date_of_exposure?: string;
  exposure_region?: string;
  exposure_province?: string;
  exposure_municipality?: string;
  exposure_barangay?: string;
  arv_day_0?: string;
  arv_day_3?: string;
  arv_day_7?: string;
  arv_day_14?: string;
  arv_day_28?: string;
  rig_date?: string;
  is_active_case: boolean;
  recorded_by: number;
  created_at: string;
}

export interface PatientInfo {
  id: number;
  student_id: number;
  file_no?: string;
  recorded_by: number;
  created_at: string;
  updated_at?: string;
  animal_bites?: AnimalBite[];
}

export interface AnimalBitePayload {
  id?: number;
  rabies_exposure_category?: string | null;
  anatomical_locations?: string[] | null;
  animal_type?: string | null;
  type_of_exposure?: string | null;
  wash_bite?: boolean | null;
  date_of_exposure?: string | null;
  exposure_region?: string | null;
  exposure_province?: string | null;
  exposure_municipality?: string | null;
  exposure_barangay?: string | null;
  arv_day_0?: string | null;
  arv_day_3?: string | null;
  arv_day_7?: string | null;
  arv_day_14?: string | null;
  arv_day_28?: string | null;
  rig_date?: string | null;
  is_active_case?: boolean;
}

export interface CreatePatientInfoPayload {
  student_id: number;
  file_no?: string | null;
  animal_bite?: AnimalBitePayload | null;
}

export interface UpdatePatientInfoPayload {
  file_no?: string | null;
  animal_bite?: AnimalBitePayload | null;
}

export interface CreateAnimalBitePayload extends AnimalBitePayload {
  patient_info_id: number;
  student_id: number;
}

export type UpdateAnimalBitePayload = AnimalBitePayload;

export interface PatientInfoByStudentResponse {
  patient_info: PatientInfo | null;
  all_patient_records: PatientInfo[];
  animal_bites: AnimalBite[];
}


export interface OralHealth {
  id: number;
  student_id: number;
  date_examined: string;
  is_pregnant: boolean;
  has_oral_screening: boolean;
  has_risk_assessment: boolean;
  has_oral_prophylaxis: boolean;
  has_counseling: boolean;
  has_fluoride_varnish: boolean;
  is_rpoc_complete: boolean;
  service_location?: 'FACILITY' | 'NON-FACILITY';
  visit_type?: '1ST VISIT' | '2ND VISIT';
  administered_by?: string;
  remarks?: string;
  recorded_by: number;
  created_at: string;
  updated_at: string;
  tooth_chart_upper?: Record<string, boolean | string>;
  tooth_chart_lower?: Record<string, boolean | string>;
  oral_health_condition?: string;
  no_of_perm_teeth?: number;
  no_of_perm_sound_teeth?: number;
  no_of_decayed_teeth?: number;
  no_of_missing_teeth?: number;
  no_of_filled_teeth?: number;
  total_dmft?: number;
  no_of_primary_teeth?: number;
  no_of_primary_sound_teeth?: number;
  no_of_primary_decayed?: number;
  no_of_primary_missing?: number;
  no_of_primary_filled?: number;
  total_dmft_primary?: number;
  remarks_diagnosis?: string;
  recommended_treatment?: string;
  treatment_type?: string;
  consent_given: boolean;
  consent_notes?: string;
}

export interface CreateOralHealthPayload {
  student_id: number;
  date_examined: string;
  is_pregnant?: boolean;
  has_oral_screening?: boolean;
  has_risk_assessment?: boolean;
  has_oral_prophylaxis?: boolean;
  has_counseling?: boolean;
  has_fluoride_varnish?: boolean;
  is_rpoc_complete?: boolean;
  service_location?: 'FACILITY' | 'NON-FACILITY' | null;
  visit_type?: '1ST VISIT' | '2ND VISIT' | null;
  administered_by?: string | null;
  remarks?: string | null;
  tooth_chart_upper?: Record<string, boolean | string> | null;
  tooth_chart_lower?: Record<string, boolean | string> | null;
  oral_health_condition?: string | null;
  no_of_perm_teeth?: number | null;
  no_of_perm_sound_teeth?: number | null;
  no_of_decayed_teeth?: number | null;
  no_of_missing_teeth?: number | null;
  no_of_filled_teeth?: number | null;
  total_dmft?: number | null;
  no_of_primary_teeth?: number | null;
  no_of_primary_sound_teeth?: number | null;
  no_of_primary_decayed?: number | null;
  no_of_primary_missing?: number | null;
  no_of_primary_filled?: number | null;
  total_dmft_primary?: number | null;
  remarks_diagnosis?: string | null;
  recommended_treatment?: string | null;
  treatment_type?: string | null;
  consent_given?: boolean;
  consent_notes?: string | null;
}

export type UpdateOralHealthPayload = Partial<CreateOralHealthPayload>;

export interface OralHealthByStudentResponse {
  oral_health: OralHealth | null;
  records: OralHealth[];
}


export interface Deworming {
  id: number;
  student_id: number;
  date_dewormed: string;
  age_group: string;
  medication_given: string;
  is_dewormed: boolean;
  school_type?: 'public' | 'private';
  in_school: boolean;
  school_id?: number;
  remarks?: string;
  recorded_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDewormingPayload {
  student_id: number;
  date_dewormed: string;
  age_group?: string | null;
  medication_given?: string | null;
  is_dewormed?: boolean;
  school_type?: 'public' | 'private' | null;
  in_school?: boolean;
  school_id?: number | null;
  remarks?: string | null;
}

export type UpdateDewormingPayload = Partial<CreateDewormingPayload>;

export interface DewormingByStudentResponse {
  deworming: Deworming | null;
  records: Deworming[];
}

export interface Immunization {
  id: number;
  student_id: number;
  immunization_date: string;
  immunization_type: string;
  vaccine_td1: boolean;
  vaccine_mr1: boolean;
  vaccine_hpv1: boolean;
  vaccine_hpv2: boolean;
  vaccine_td2: boolean;
  vaccine_mr2: boolean;
  is_school_based: boolean;
  educational_level?: string;
  is_from_other_facility: boolean;
  other_facility_name?: string;
  lot_batch_no?: string;
  consent_given?: boolean;
  is_sick_today: boolean;
  history_of_allergies?: string;
  is_deferred: boolean;
  is_refused: boolean;
  refusal_reason_code?: string;
  refusal_reason_text?: string;
  is_fully_immunized: boolean;
  vaccinator_name?: string;
  supervisor_name?: string;
  remarks?: string;
  school_id?: number;
  recorded_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateImmunizationPayload {
  student_id: number;
  immunization_date: string;
  immunization_type?: string | null;
  vaccine_td1?: boolean;
  vaccine_mr1?: boolean;
  vaccine_hpv1?: boolean;
  vaccine_hpv2?: boolean;
  vaccine_td2?: boolean;
  vaccine_mr2?: boolean;
  is_school_based?: boolean;
  educational_level?: string | null;
  is_from_other_facility?: boolean;
  other_facility_name?: string | null;
  lot_batch_no?: string | null;
  consent_given?: boolean | null;
  is_sick_today?: boolean;
  history_of_allergies?: string | null;
  is_deferred?: boolean;
  is_refused?: boolean;
  refusal_reason_code?: string | null;
  refusal_reason_text?: string | null;
  is_fully_immunized?: boolean;
  vaccinator_name?: string | null;
  supervisor_name?: string | null;
  remarks?: string | null;
  school_id?: number | null;
}

export type UpdateImmunizationPayload = Partial<CreateImmunizationPayload>;

export interface ImmunizationByStudentResponse {
  immunization: Immunization | null;
  records: Immunization[];
}

export interface VitalSigns {
  id: number;
  student_id: number;
  date_checked: string;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  temperature?: number;
  weight_kg?: number;
  height_cm?: number;
  bmi?: number;
  remarks?: string;
  recorded_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateVitalSignsPayload {
  student_id: number;
  date_checked: string;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  heart_rate?: number | null;
  respiratory_rate?: number | null;
  temperature?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  bmi?: number | null;
  remarks?: string | null;
}

export type UpdateVitalSignsPayload = Partial<CreateVitalSignsPayload>;

export interface VitalSignsByStudentResponse {
  vital_signs: VitalSigns | null;
  records: VitalSigns[];
}

export interface DashboardFilters {
  municipality_id?: number;
  barangay_id?: number;
  school_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface MunicipalityCount {
  municipality_name: string;
  count: number;
}

export interface ModuleCompletion {
  module: string;
  count: number;
  rate: number;
}

export interface RecentStudent {
  id: number;
  first_name: string;
  last_name: string;
  school_name: string;
  municipality_name: string;
  grade_level: string;
  created_at: string;
}

export interface DashboardOverviewResponse {
  total_students: number;
  students_by_municipality: MunicipalityCount[];
  gender_distribution: { male: number; female: number };
  module_completion: ModuleCompletion[];
  recent_registrations: RecentStudent[];
}

export interface PatientInfoRegistrationByMunicipality {
  municipality_id: number;
  municipality_name: string;
  count: number;
}

export interface PatientInfoRegistrationTrend {
  month: string;
  count: number;
}

export interface PatientInfoAgeGroup {
  age_group: string;
  count: number;
}

export interface PatientInfoPwdDistribution {
  pwd_type: string;
  count: number;
}

export interface PatientInfoPhilHealthCategory {
  category: string;
  count: number;
}

export interface PatientInfoBloodType {
  blood_type: string;
  count: number;
}

export interface PatientInfoDashboardResponse {
  total_students: number;
  registration_trend: PatientInfoRegistrationTrend[];
  registration_by_municipality: PatientInfoRegistrationByMunicipality[];
  gender_distribution: { male: number; female: number };
  age_group_distribution: PatientInfoAgeGroup[];
  four_ps_count: number;
  pwd_total: number;
  pwd_distribution: PatientInfoPwdDistribution[];
  philhealth_coverage: { covered: number; not_covered: number; coverage_rate: number };
  philhealth_category_breakdown: PatientInfoPhilHealthCategory[];
  indigenous_count: number;
  blood_type_distribution: PatientInfoBloodType[];
  animal_bites_active_cases: number;
}

export interface OralHealthFacilityDistribution {
  location: string;
  count: number;
}

export interface OralHealthVisitTypeDistribution {
  visit_type: string;
  count: number;
}

export interface OralHealthSchoolCoverage {
  school_id: number;
  school_name: string;
  count: number;
}

export interface OralHealthMonthlyTrend {
  month: string;
  count: number;
}

export interface OralHealthDashboardResponse {
  total_students_examined: number;
  total_examinations: number;
  rpoc_completion: {
    completed: number;
    incomplete: number;
    completion_rate: number;
  };
  rpoc_steps: {
    screening: number;
    risk_assessment: number;
    prophylaxis: number;
    counseling: number;
    fluoride_varnish: number;
  };
  facility_distribution: OralHealthFacilityDistribution[];
  visit_type_distribution: OralHealthVisitTypeDistribution[];
  coverage_by_school: OralHealthSchoolCoverage[];
  monthly_trend: OralHealthMonthlyTrend[];
}

export interface DewormingMunicipalitySummary {
  municipality_id: number;
  municipality_name: string;
  target: number;
  male_accomplished: number;
  female_accomplished: number;
  total_accomplished: number;
  accomplishment_rate: number;
}

export interface DewormingDashboardResponse {
  total_dewormed: number;
  deworming_by_age_group: Array<{ age_group: string; count: number }>;
  public_vs_private: Array<{ school_type: string; count: number }>;
  in_school_vs_out_of_school: { in_school: number; out_of_school: number };
  monthly_trend: Array<{ month: string; count: number }>;
  municipality_summary: DewormingMunicipalitySummary[];
  province_total: {
    target: number;
    total_accomplished: number;
    accomplishment_rate: number;
  };
}

export interface DewormingReportMunicipalityRow {
  municipality_id: number;
  municipality_name: string;
  target: number;
  male_accomplished: number;
  female_accomplished: number;
  total_accomplished: number;
  accomplishment_rate: number;
}

export interface DewormingReportResponse {
  period: string;
  municipalities: DewormingReportMunicipalityRow[];
  province_totals: {
    target: number;
    male_accomplished: number;
    female_accomplished: number;
    total_accomplished: number;
    accomplishment_rate: number;
  };
}

export interface VitalSignsMeasurementCoverage {
  bp_recorded: number;
  bmi_recorded: number;
  temperature_recorded: number;
  pulse_recorded: number;
  respiratory_recorded: number;
}

export interface VitalSignsDistributionItem {
  interval: string;
  count: number;
}

export interface VitalSignsSchoolCoverage {
  school_id: number;
  school_name: string;
  count: number;
}

export interface VitalSignsMonthlyTrend {
  month: string;
  count: number;
}

export interface VitalSignsDashboardResponse {
  total_screened: number;
  total_screenings: number;
  measurement_coverage: VitalSignsMeasurementCoverage;
  bmi_distribution: VitalSignsDistributionItem[];
  blood_pressure_systolic_distribution: VitalSignsDistributionItem[];
  blood_pressure_diastolic_distribution: VitalSignsDistributionItem[];
  temperature_distribution: VitalSignsDistributionItem[];
  elevated_temperature_count: number;
  coverage_by_school: VitalSignsSchoolCoverage[];
  monthly_trend: VitalSignsMonthlyTrend[];
  metadata: {
    clinical_thresholds_status: string;
    threshold_version: string;
    notice: string;
  };
}

export interface VaccineAntigenMetric {
  antigen: 'td1' | 'mr1' | 'hpv1' | 'hpv2' | 'td2' | 'mr2';
  label: string;
  doses: number;
  students: number;
}

export interface ImmunizationConsentDistribution {
  consented_students: number;
  refused_students: number;
  deferred_students: number;
  refusal_rate: number;
  deferral_rate: number;
}

export interface ImmunizationRefusalReason {
  code: string;
  label: string;
  count: number;
}

export interface ImmunizationEducationalLevel {
  educational_level: string;
  vaccinated_students: number;
  total_evaluated: number;
}

export interface ImmunizationSchoolCoverage {
  school_id: number;
  school_name: string;
  count: number;
}

export interface ImmunizationMonthlyTrend {
  month: string;
  count: number;
}

export interface ImmunizationDashboardResponse {
  total_students_vaccinated: number;
  total_evaluated_students: number;
  total_doses_administered: number;
  vaccine_antigens: VaccineAntigenMetric[];
  consent_distribution: ImmunizationConsentDistribution;
  refusal_reasons: ImmunizationRefusalReason[];
  vaccination_by_educational_level: ImmunizationEducationalLevel[];
  coverage_by_school: ImmunizationSchoolCoverage[];
  monthly_trend: ImmunizationMonthlyTrend[];
  contract_definitions: {
    vaccinated: string;
    coverage: string;
    vaccine_flags: string;
  };
}

export interface AdminUserSummary {
  id: number;
  email: string;
  role: 'teacher' | 'superuser' | 'admin';
  first_name: string;
  last_name: string;
  contact_no: string | null;
  is_active: boolean;
  failed_login_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface AdminDashboardStats {
  users_by_role: {
    teacher: number;
    superuser: number;
    admin: number;
    total: number;
  };
  total_students: number;
  active_modules: number;
  recent_users: AdminUserSummary[];
}

export interface GetAdminUsersParams {
  search?: string;
  role?: 'teacher' | 'superuser' | 'admin';
  page?: number;
  limit?: number;
}

export interface AdminUserListResponse {
  data: AdminUserSummary[];
  total: number;
  page: number;
  limit: number;
}

export type CreatableAdminUserRole = 'teacher' | 'superuser';

export interface CreateAdminUserPayload {
  email: string;
  password: string;
  role: CreatableAdminUserRole;
  first_name: string;
  last_name: string;
  contact_no?: string | null;
}

export interface UpdateAdminUserPayload {
  email?: string;
  password?: string;
  role?: CreatableAdminUserRole;
  first_name?: string;
  last_name?: string;
  contact_no?: string | null;
  is_active?: boolean;
}

export interface UpdateAdminUserStatusPayload {
  is_active?: boolean;
  action?: 'activate' | 'deactivate' | 'unlock' | 'toggle';
  unlock?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MODULE MANAGEMENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovedModuleSlug =
  | 'patient-info'
  | 'oral-health'
  | 'deworming'
  | 'immunization'
  | 'vital-signs';

export interface AdminModule {
  id: number;
  name: string;
  slug: ApprovedModuleSlug;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateAdminModulePayload {
  name: string;
  slug: ApprovedModuleSlug;
  description?: string | null;
  icon?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateAdminModulePayload {
  name?: string;
  slug?: ApprovedModuleSlug;
  description?: string | null;
  icon?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SCHOOL MANAGEMENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminSchool {
  id: number;
  name: string;
  address: string | null;
  barangay_id: number | null;
  district: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  barangay_name: string | null;
  municipality_id: number | null;
  municipality_name: string | null;
}

export interface GetAdminSchoolsParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminSchoolListResponse {
  data: AdminSchool[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateAdminSchoolPayload {
  name: string;
  address?: string | null;
  barangay_id: number;
  municipality_id?: number | null;
  district?: string | null;
  is_active?: boolean;
}

export interface UpdateAdminSchoolPayload {
  name?: string;
  address?: string | null;
  barangay_id?: number;
  municipality_id?: number | null;
  district?: string | null;
  is_active?: boolean;
}
