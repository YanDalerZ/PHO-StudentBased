export interface StudentModuleContext {
    id: number;
    student_lrn: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    date_of_birth: string;
    age: number;
    sex: 'Male' | 'Female';
    school_id: number | null;
    school_name: string | null;
    grade_level: string | null;
    section: string | null;
}
