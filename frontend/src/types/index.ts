// Type definitions for the application

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
  id: string;
  name: string;
}

export interface Barangay {
  id: string;
  municipality_id: string;
  name: string;
}

export interface School {
  id: number;
  name: string;
  barangay_id: string;
}
