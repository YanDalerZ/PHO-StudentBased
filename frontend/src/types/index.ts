// Type definitions for the application

export interface Student {
  id?: number;
  student_lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  date_of_birth: string;
  sex: 'Male' | 'Female';
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
