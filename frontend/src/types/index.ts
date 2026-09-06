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
