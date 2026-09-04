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
  photo_base64?: string;
  student_lrn: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix?: string;
  date_of_birth: string;
  sex: 'Male' | 'Female';
  birth_place?: string;
  mother_first_name?: string;
  mother_last_name?: string;
  mother_middle_name?: string;
  mother_birth_date?: string;
  address?: string;
  barangay?: string;
  municipality?: string;
  province?: string;
  contact_no?: string;
  parent_guardian_name?: string;
  parent_guardian_contact?: string;
  school_id: number;
  grade_level: string;
  section?: string;
  
  // Patient Info (Part II)
  civil_status?: string;
  educational_attainment?: string;
  employment_status?: string;
  tin_no?: string;
  religion?: string;
  indigenous?: 'Yes' | 'No';
  indigenous_group?: string;
  blood_type?: string;

  // Address and Contact Info (Part III)
  country?: string;
  region?: string;
  zip_code?: string;
  email?: string;
  landline_no?: string;
  psa_national_id?: string;

  // Other Info (Part IV - 4Ps & PWD)
  dswd_4ps?: 'Yes' | 'No';
  dswd_4ps_no?: string;
  is_pwd?: 'Yes' | 'No';
  pwd_type?: string;
  pwd_id_no?: string;

  // Philhealth Info (Part V)
  philhealth_member?: 'Yes' | 'No';
  philhealth_id?: string;
  philhealth_status_type?: string;
  philhealth_category?: string;
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

export interface PatientInfo {
  id: number;
  student_id: number;
  file_no?: string;
  recorded_by: number;
  created_at: string;
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
  service_location: 'FACILITY' | 'NON-FACILITY';
  visit_type: '1ST VISIT' | '2ND VISIT';
  administered_by: string;
  remarks?: string;
}

export interface Deworming {
  id: number;
  student_id: number;
  date_dewormed: string;
  age_group: string;
  medication_given: string;
  is_dewormed: boolean;
  school_type: 'public' | 'private';
  in_school: boolean;
  school_id: number;
  remarks?: string;
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
  educational_level: string;
  is_from_other_facility: boolean;
  other_facility_name?: string;
  lot_batch_no?: string;
  consent_given: boolean;
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
}

export interface DashboardFilters {
  municipalityId?: number;
  barangayId?: number;
  schoolId?: number;
  startDate?: string;
  endDate?: string;
}
