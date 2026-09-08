import type { Request, Response } from 'express';
import pool from '../database/db.js';
import { z } from 'zod';

const studentPayloadSchema = z.object({
    // I. Personal Information
    photo_url: z
        .string()
        .refine(
            (val) => !val || !val.startsWith('data:'),
            'Direct base64 photo upload is prohibited. Photo must be uploaded via Cloudinary.'
        )
        .optional()
        .nullable(),
    first_name: z.string().min(1, 'First name is required'),
    middle_name: z.string().optional().nullable(),
    last_name: z.string().min(1, 'Last name is required'),
    suffix: z.string().optional().nullable(),
    sex: z.enum(['Male', 'Female']),
    date_of_birth: z.string().min(1, 'Date of birth is required'),
    student_lrn: z.string().min(1, 'LRN is required'),

    // II. Other Personal Information
    birth_place: z.string().optional().nullable(),
    civil_status: z.string().optional().nullable(),
    educational_attainment: z.string().optional().nullable(),
    employment_status: z.string().optional().nullable(),
    tin_no: z.string().optional().nullable(),
    tax_id_no: z.string().optional().nullable(),
    religion: z.string().optional().nullable(),
    indigenous: z.union([z.enum(['Yes', 'No']), z.boolean()]).optional().nullable(),
    is_indigenous: z.boolean().optional().nullable(),
    indigenous_group: z.string().optional().nullable(),
    blood_type: z.string().optional().nullable(),

    // Mother's Information
    mother_first_name: z.string().optional().nullable(),
    mother_last_name: z.string().optional().nullable(),
    mother_middle_name: z.string().optional().nullable(),
    mother_birthdate: z.string().optional().nullable(),

    // III. Address and Contact Info
    country: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
    province: z.string().optional().nullable(),
    municipality: z.union([z.string(), z.number()]).optional().nullable(),
    municipality_id: z.union([z.string(), z.number()]).optional().nullable(),
    barangay: z.union([z.string(), z.number()]).optional().nullable(),
    barangay_id: z.union([z.string(), z.number()]).optional().nullable(),
    address: z.string().optional().nullable(),
    street_address: z.string().optional().nullable(),
    zip_code: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    contact_no: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    landline: z.string().optional().nullable(),
    psa_national_id: z.string().optional().nullable(),

    // IV. Other Info (4Ps/PWD)
    dswd_4ps: z.union([z.enum(['Yes', 'No']), z.boolean()]).optional().nullable(),
    is_4ps_member: z.boolean().optional().nullable(),
    dswd_4ps_no: z.string().optional().nullable(),
    fourps_household_no: z.string().optional().nullable(),
    is_pwd: z.union([z.enum(['Yes', 'No']), z.boolean()]).optional().nullable(),
    pwd_type: z.string().optional().nullable(),
    pwd_id_no: z.string().optional().nullable(),
    pwd_id: z.string().optional().nullable(),

    // V. Philhealth Info
    philhealth_member: z.union([z.enum(['Yes', 'No']), z.boolean()]).optional().nullable(),
    is_philhealth_member: z.boolean().optional().nullable(),
    philhealth_id: z.string().optional().nullable(),
    philhealth_no: z.string().optional().nullable(),
    philhealth_status_type: z.string().optional().nullable(),
    philhealth_category: z.string().optional().nullable(),

    // School / Academic Info
    school_id: z.union([z.string(), z.number()]).optional().nullable(),
    grade_level: z.string().optional().nullable(),
    section: z.string().optional().nullable(),

    // Parent/Guardian
    parent_guardian_name: z.string().optional().nullable(),
    parent_guardian_contact: z.string().optional().nullable(),
});

const updateStudentSchema = studentPayloadSchema.partial();

// Helper to normalize dates to YYYY-MM-DD string
const formatDate = (val: unknown): string | null => {
    if (!val) return null;
    if (val instanceof Date) {
        const parts = val.toISOString().split('T');
        return parts[0] ?? null;
    }
    if (typeof val === 'string') {
        const parts = val.split('T');
        return parts[0] ?? val;
    }
    return String(val);
};


export interface StudentDbRow {
    id: number;
    prefix?: string | null;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    suffix?: string | null;
    sex: 'Male' | 'Female';
    date_of_birth: string | Date;
    photo_url?: string | null;
    birth_place?: string | null;
    civil_status?: string | null;
    educational_attainment?: string | null;
    employment_status?: string | null;
    tax_id_no?: string | null;
    religion?: string | null;
    is_indigenous?: boolean | null;
    indigenous_group?: string | null;
    blood_type?: string | null;
    mother_first_name?: string | null;
    mother_last_name?: string | null;
    mother_middle_name?: string | null;
    mother_birthdate?: string | Date | null;
    country?: string | null;
    region?: string | null;
    province?: string | null;
    municipality_id?: number | null;
    municipality_name?: string | null;
    barangay_id?: number | null;
    barangay_name?: string | null;
    street_address?: string | null;
    zip_code?: string | null;
    email?: string | null;
    mobile?: string | null;
    landline?: string | null;
    psa_national_id?: string | null;
    is_4ps_member?: boolean | null;
    fourps_household_no?: string | null;
    is_pwd?: boolean | null;
    pwd_type?: string | null;
    pwd_id?: string | null;
    is_philhealth_member?: boolean | null;
    philhealth_no?: string | null;
    philhealth_status_type?: string | null;
    philhealth_category?: string | null;
    student_lrn: string;
    school_id?: number | null;
    school_name?: string | null;
    grade_level?: string | null;
    section?: string | null;
    parent_guardian_name?: string | null;
    parent_guardian_contact?: string | null;
    registered_by?: number;
    created_at?: string | Date;
    updated_at?: string | Date;
    [key: string]: unknown;
}

export interface StudentResponse {
    id?: number | undefined;
    prefix?: string | undefined;
    photo_url?: string | null | undefined;
    student_lrn: string;
    first_name: string;
    middle_name?: string | null | undefined;
    last_name: string;
    suffix?: string | null | undefined;
    date_of_birth: string;
    sex: 'Male' | 'Female';
    birth_place?: string | null | undefined;
    mother_first_name?: string | null | undefined;
    mother_last_name?: string | null | undefined;
    mother_middle_name?: string | null | undefined;
    mother_birthdate?: string | null | undefined;
    address?: string | null | undefined;
    street_address?: string | null | undefined;
    barangay?: string | number | null | undefined;
    barangay_id?: number | null | undefined;
    barangay_name?: string | null | undefined;
    municipality?: string | number | null | undefined;
    municipality_id?: number | null | undefined;
    municipality_name?: string | null | undefined;
    province?: string | null | undefined;
    contact_no?: string | null | undefined;
    mobile?: string | null | undefined;
    parent_guardian_name?: string | null | undefined;
    parent_guardian_contact?: string | null | undefined;
    school_id?: number | undefined;
    school_name?: string | null | undefined;
    grade_level?: string | undefined;
    section?: string | null | undefined;
    civil_status?: string | null | undefined;
    educational_attainment?: string | null | undefined;
    employment_status?: string | null | undefined;
    tin_no?: string | null | undefined;
    tax_id_no?: string | null | undefined;
    religion?: string | null | undefined;
    indigenous?: 'Yes' | 'No' | boolean | string | null | undefined;
    is_indigenous?: boolean | undefined;
    indigenous_group?: string | null | undefined;
    blood_type?: string | null | undefined;
    country?: string | null | undefined;
    region?: string | null | undefined;
    zip_code?: string | null | undefined;
    email?: string | null | undefined;
    landline?: string | null | undefined;
    psa_national_id?: string | null | undefined;
    dswd_4ps?: 'Yes' | 'No' | boolean | string | null | undefined;
    is_4ps_member?: boolean | undefined;
    dswd_4ps_no?: string | null | undefined;
    fourps_household_no?: string | null | undefined;
    is_pwd?: 'Yes' | 'No' | boolean | string | null | undefined;
    pwd_type?: string | null | undefined;
    pwd_id_no?: string | null | undefined;
    pwd_id?: string | null | undefined;
    philhealth_member?: 'Yes' | 'No' | boolean | string | null | undefined;
    is_philhealth_member?: boolean | undefined;
    philhealth_id?: string | null | undefined;
    philhealth_no?: string | null | undefined;
    philhealth_status_type?: string | null | undefined;
    philhealth_category?: string | null | undefined;
    registered_by?: number | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    modules?: {
        patient_info?: boolean | undefined;
        oral_health?: boolean | undefined;
        deworming?: boolean | undefined;
        immunization?: boolean | undefined;
        vital_signs?: boolean | undefined;
        [key: string]: boolean | undefined;
    } | undefined;
}

// Map DB row to API response shape
const mapStudentRow = (row: StudentDbRow): StudentResponse => {
    return {
        id: row.id,
        prefix: row.prefix ?? undefined,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        suffix: row.suffix,
        sex: row.sex,
        date_of_birth: formatDate(row.date_of_birth) || '',
        photo_url: row.photo_url,

        birth_place: row.birth_place,
        civil_status: row.civil_status,
        educational_attainment: row.educational_attainment,
        employment_status: row.employment_status,
        tax_id_no: row.tax_id_no,
        tin_no: row.tax_id_no,
        religion: row.religion,
        is_indigenous: Boolean(row.is_indigenous),
        indigenous: row.is_indigenous ? 'Yes' : 'No',
        indigenous_group: row.indigenous_group,
        blood_type: row.blood_type,

        mother_first_name: row.mother_first_name,
        mother_last_name: row.mother_last_name,
        mother_middle_name: row.mother_middle_name,
        mother_birthdate: formatDate(row.mother_birthdate),

        country: row.country,
        region: row.region,
        province: row.province,
        municipality_id: row.municipality_id,
        municipality: row.municipality_name || row.municipality_id,
        municipality_name: row.municipality_name,
        barangay_id: row.barangay_id,
        barangay: row.barangay_name || row.barangay_id,
        barangay_name: row.barangay_name,
        street_address: row.street_address,
        address: row.street_address,
        zip_code: row.zip_code,
        email: row.email,
        mobile: row.mobile,
        contact_no: row.mobile,
        landline: row.landline,
        psa_national_id: row.psa_national_id,

        is_4ps_member: Boolean(row.is_4ps_member),
        dswd_4ps: row.is_4ps_member ? 'Yes' : 'No',
        fourps_household_no: row.fourps_household_no,
        dswd_4ps_no: row.fourps_household_no,
        is_pwd: Boolean(row.is_pwd),
        pwd_type: row.pwd_type,
        pwd_id: row.pwd_id,
        pwd_id_no: row.pwd_id,

        is_philhealth_member: Boolean(row.is_philhealth_member),
        philhealth_member: row.is_philhealth_member ? 'Yes' : 'No',
        philhealth_no: row.philhealth_no,
        philhealth_id: row.philhealth_no,
        philhealth_status_type: row.philhealth_status_type,
        philhealth_category: row.philhealth_category,

        student_lrn: row.student_lrn,
        school_id: row.school_id ?? undefined,
        school_name: row.school_name,
        grade_level: row.grade_level ?? undefined,
        section: row.section,

        parent_guardian_name: row.parent_guardian_name,
        parent_guardian_contact: row.parent_guardian_contact,

        registered_by: row.registered_by,
        created_at: formatDate(row.created_at) || (typeof row.created_at === 'string' ? row.created_at : undefined),
        updated_at: formatDate(row.updated_at) || (typeof row.updated_at === 'string' ? row.updated_at : undefined),
    };
};

/**
 * GET /api/students
 * Teacher sees only their own registered students.
 * SuperUser sees all students province-wide.
 * Admin: forbidden (403).
 * Safe filters: search, school_id, grade_level.
 */
export const getAllStudents = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Insufficient privileges' });
            return;
        }

        const { search, school_id, grade_level } = req.query;
        const conditions: string[] = [];
        const params: (string | number)[] = [];
        let paramIdx = 1;

        // Role-based filtering
        if (req.user.role === 'teacher') {
            conditions.push(`s.registered_by = $${paramIdx++}`);
            params.push(req.user.id);
        }

        // Search query filter
        if (search && typeof search === 'string' && search.trim() !== '') {
            const searchTerm = `%${search.trim()}%`;
            conditions.push(`(
                s.first_name ILIKE $${paramIdx} OR 
                s.last_name ILIKE $${paramIdx} OR 
                s.student_lrn ILIKE $${paramIdx} OR 
                CONCAT(s.first_name, ' ', s.last_name) ILIKE $${paramIdx}
            )`);
            params.push(searchTerm);
            paramIdx++;
        }

        // School ID filter
        if (school_id) {
            const parsedSchoolId = Number(school_id);
            if (!isNaN(parsedSchoolId) && parsedSchoolId > 0) {
                conditions.push(`s.school_id = $${paramIdx++}`);
                params.push(parsedSchoolId);
            }
        }

        // Grade level filter
        if (grade_level && typeof grade_level === 'string' && grade_level.trim() !== '') {
            conditions.push(`s.grade_level = $${paramIdx++}`);
            params.push(grade_level.trim());
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                s.*,
                sc.name AS school_name,
                b.name AS barangay_name,
                m.name AS municipality_name
            FROM STUDENTS s
            LEFT JOIN SCHOOLS sc ON s.school_id = sc.id
            LEFT JOIN BARANGAYS b ON s.barangay_id = b.id
            LEFT JOIN MUNICIPALITIES m ON s.municipality_id = m.id
            ${whereClause}
            ORDER BY s.created_at DESC
        `;

        const result = await pool.query(query, params);
        const mappedList = result.rows.map(mapStudentRow);

        res.status(200).json({
            data: mappedList,
            total: mappedList.length
        });
    } catch (error: unknown) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /api/students
 * Register a new student.
 */
export const createStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Insufficient privileges' });
            return;
        }

        const validatedData = studentPayloadSchema.parse(req.body);

        const dobStr = formatDate(validatedData.date_of_birth);
        const motherDobStr = validatedData.mother_birthdate ? formatDate(validatedData.mother_birthdate) : null;

        const municipalityId = validatedData.municipality_id
            ? Number(validatedData.municipality_id)
            : validatedData.municipality ? Number(validatedData.municipality) || null : null;

        const barangayId = validatedData.barangay_id
            ? Number(validatedData.barangay_id)
            : validatedData.barangay ? Number(validatedData.barangay) || null : null;

        const schoolId = validatedData.school_id ? Number(validatedData.school_id) || null : null;

        const isIndigenous = validatedData.is_indigenous ?? (validatedData.indigenous === 'Yes' || validatedData.indigenous === true);
        const is4ps = validatedData.is_4ps_member ?? (validatedData.dswd_4ps === 'Yes' || validatedData.dswd_4ps === true);
        const isPwd = validatedData.is_pwd === 'Yes' || validatedData.is_pwd === true;
        const isPhilhealth = validatedData.is_philhealth_member ?? (validatedData.philhealth_member === 'Yes' || validatedData.philhealth_member === true);

        const studentQuery = `
            INSERT INTO STUDENTS (
                student_lrn, first_name, middle_name, last_name, suffix, sex, date_of_birth, photo_url,
                birth_place, civil_status, educational_attainment, employment_status, tax_id_no, religion,
                is_indigenous, indigenous_group, blood_type,
                mother_first_name, mother_last_name, mother_middle_name, mother_birthdate,
                country, region, province, municipality_id, barangay_id, street_address, zip_code,
                email, mobile, landline, psa_national_id,
                is_4ps_member, fourps_household_no, is_pwd, pwd_type, pwd_id,
                is_philhealth_member, philhealth_no, philhealth_status_type, philhealth_category,
                school_id, grade_level, section,
                parent_guardian_name, parent_guardian_contact,
                registered_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15, $16, $17,
                $18, $19, $20, $21,
                $22, $23, $24, $25, $26, $27, $28,
                $29, $30, $31, $32,
                $33, $34, $35, $36, $37,
                $38, $39, $40, $41,
                $42, $43, $44,
                $45, $46,
                $47
            )
            RETURNING id
        `;

        const result = await pool.query(studentQuery, [
            validatedData.student_lrn,
            validatedData.first_name,
            validatedData.middle_name || null,
            validatedData.last_name,
            validatedData.suffix || 'NOT APPLICABLE',
            validatedData.sex,
            dobStr,
            validatedData.photo_url || null,
            // II. Other Personal Info
            validatedData.birth_place || null,
            validatedData.civil_status || null,
            validatedData.educational_attainment || null,
            validatedData.employment_status || null,
            validatedData.tax_id_no || validatedData.tin_no || null,
            validatedData.religion || null,
            isIndigenous,
            validatedData.indigenous_group || null,
            validatedData.blood_type || null,
            // Mother's Info
            validatedData.mother_first_name || null,
            validatedData.mother_last_name || null,
            validatedData.mother_middle_name || null,
            motherDobStr,
            // III. Address
            validatedData.country || 'PHILIPPINES',
            validatedData.region || 'REGION 6',
            validatedData.province || 'AKLAN',
            municipalityId,
            barangayId,
            validatedData.street_address || validatedData.address || null,
            validatedData.zip_code || null,
            validatedData.email || null,
            validatedData.mobile || validatedData.contact_no || null,
            validatedData.landline || null,
            validatedData.psa_national_id || null,
            // IV. 4Ps/PWD
            is4ps,
            validatedData.fourps_household_no || validatedData.dswd_4ps_no || null,
            isPwd,
            validatedData.pwd_type || null,
            validatedData.pwd_id || validatedData.pwd_id_no || null,
            // V. Philhealth
            isPhilhealth,
            validatedData.philhealth_no || validatedData.philhealth_id || null,
            validatedData.philhealth_status_type || null,
            validatedData.philhealth_category || null,
            // School
            schoolId,
            validatedData.grade_level || null,
            validatedData.section || null,
            // Parent/Guardian
            validatedData.parent_guardian_name || null,
            validatedData.parent_guardian_contact || null,
            // System
            req.user.id,
        ]);

        const studentId = result.rows[0].id;
        res.status(201).json({
            message: 'Student registered successfully',
            id: studentId,
            data: { id: studentId }
        });
    } catch (error: unknown) {
        console.error('Error creating student:', error);
        const dbError = error as { code?: string };
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
        } else if (dbError?.code === '23505') {
            res.status(409).json({ message: 'A student with this LRN already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

/**
 * GET /api/students/:id
 * Return student details, school name, and module completion summary.
 * Checks ownership for teachers.
 */
export const getStudentById = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Insufficient privileges' });
            return;
        }

        const studentId = Number(req.params.id);
        if (isNaN(studentId)) {
            res.status(400).json({ message: 'Invalid student ID' });
            return;
        }

        const query = `
            SELECT 
                s.*,
                sc.name AS school_name,
                b.name AS barangay_name,
                m.name AS municipality_name
            FROM STUDENTS s
            LEFT JOIN SCHOOLS sc ON s.school_id = sc.id
            LEFT JOIN BARANGAYS b ON s.barangay_id = b.id
            LEFT JOIN MUNICIPALITIES m ON s.municipality_id = m.id
            WHERE s.id = $1
        `;

        const result = await pool.query(query, [studentId]);
        if (result.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = result.rows[0];

        // Access check: teacher can only access their own registered students
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You do not have permission to view this student' });
            return;
        }

        // Query module completion summary
        const moduleSummaryQuery = `
            SELECT 
                EXISTS(SELECT 1 FROM PATIENT_INFO WHERE student_id = $1) AS has_patient_info,
                EXISTS(SELECT 1 FROM ORAL_HEALTH WHERE student_id = $1) AS has_oral_health,
                EXISTS(SELECT 1 FROM DEWORMING WHERE student_id = $1) AS has_deworming,
                EXISTS(SELECT 1 FROM IMMUNIZATION WHERE student_id = $1) AS has_immunization,
                EXISTS(SELECT 1 FROM VITAL_SIGNS WHERE student_id = $1) AS has_vital_signs
        `;
        const moduleSummaryRes = await pool.query(moduleSummaryQuery, [studentId]);
        const summary = moduleSummaryRes.rows[0] as {
            has_patient_info?: boolean;
            has_oral_health?: boolean;
            has_deworming?: boolean;
            has_immunization?: boolean;
            has_vital_signs?: boolean;
        } | undefined;

        const mappedStudent = mapStudentRow(student);

        res.status(200).json({
            data: {
                ...mappedStudent,
                modules: {
                    patient_info: Boolean(summary?.has_patient_info),
                    oral_health: Boolean(summary?.has_oral_health),
                    deworming: Boolean(summary?.has_deworming),
                    immunization: Boolean(summary?.has_immunization),
                    vital_signs: Boolean(summary?.has_vital_signs),
                }
            }
        });
    } catch (error: unknown) {
        console.error('Error fetching student by ID:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/students/:id
 * Teacher may update only their own student; superuser may update any student.
 */
export const updateStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Insufficient privileges' });
            return;
        }

        const studentId = Number(req.params.id);
        if (isNaN(studentId)) {
            res.status(400).json({ message: 'Invalid student ID' });
            return;
        }

        // Check student existence and ownership
        const checkQuery = `SELECT * FROM STUDENTS WHERE id = $1`;
        const checkRes = await pool.query(checkQuery, [studentId]);
        if (checkRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const existing = checkRes.rows[0];
        if (req.user.role === 'teacher' && existing.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You do not have permission to update this student' });
            return;
        }

        const validatedData = updateStudentSchema.parse(req.body);

        const dobStr = validatedData.date_of_birth ? formatDate(validatedData.date_of_birth) : existing.date_of_birth;
        const motherDobStr = validatedData.mother_birthdate !== undefined
            ? (validatedData.mother_birthdate ? formatDate(validatedData.mother_birthdate) : null)
            : existing.mother_birthdate;

        const municipalityId = validatedData.municipality_id !== undefined
            ? (validatedData.municipality_id ? Number(validatedData.municipality_id) : null)
            : validatedData.municipality !== undefined
                ? (validatedData.municipality ? Number(validatedData.municipality) || null : null)
                : existing.municipality_id;

        const barangayId = validatedData.barangay_id !== undefined
            ? (validatedData.barangay_id ? Number(validatedData.barangay_id) : null)
            : validatedData.barangay !== undefined
                ? (validatedData.barangay ? Number(validatedData.barangay) || null : null)
                : existing.barangay_id;

        const schoolId = validatedData.school_id !== undefined
            ? (validatedData.school_id ? Number(validatedData.school_id) : null)
            : existing.school_id;

        const isIndigenous = validatedData.is_indigenous !== undefined
            ? validatedData.is_indigenous
            : validatedData.indigenous !== undefined
                ? (validatedData.indigenous === 'Yes' || validatedData.indigenous === true)
                : existing.is_indigenous;

        const is4ps = validatedData.is_4ps_member !== undefined
            ? validatedData.is_4ps_member
            : validatedData.dswd_4ps !== undefined
                ? (validatedData.dswd_4ps === 'Yes' || validatedData.dswd_4ps === true)
                : existing.is_4ps_member;

        const isPwd = validatedData.is_pwd !== undefined
            ? (validatedData.is_pwd === 'Yes' || validatedData.is_pwd === true)
            : existing.is_pwd;

        const isPhilhealth = validatedData.is_philhealth_member !== undefined
            ? validatedData.is_philhealth_member
            : validatedData.philhealth_member !== undefined
                ? (validatedData.philhealth_member === 'Yes' || validatedData.philhealth_member === true)
                : existing.is_philhealth_member;

        const updateQuery = `
            UPDATE STUDENTS SET
                student_lrn = COALESCE($1, student_lrn),
                first_name = COALESCE($2, first_name),
                middle_name = $3,
                last_name = COALESCE($4, last_name),
                suffix = $5,
                sex = COALESCE($6, sex),
                date_of_birth = COALESCE($7, date_of_birth),
                photo_url = $8,
                birth_place = $9,
                civil_status = $10,
                educational_attainment = $11,
                employment_status = $12,
                tax_id_no = $13,
                religion = $14,
                is_indigenous = $15,
                indigenous_group = $16,
                blood_type = $17,
                mother_first_name = $18,
                mother_last_name = $19,
                mother_middle_name = $20,
                mother_birthdate = $21,
                country = COALESCE($22, country),
                region = COALESCE($23, region),
                province = COALESCE($24, province),
                municipality_id = $25,
                barangay_id = $26,
                street_address = $27,
                zip_code = $28,
                email = $29,
                mobile = $30,
                landline = $31,
                psa_national_id = $32,
                is_4ps_member = $33,
                fourps_household_no = $34,
                is_pwd = $35,
                pwd_type = $36,
                pwd_id = $37,
                is_philhealth_member = $38,
                philhealth_no = $39,
                philhealth_status_type = $40,
                philhealth_category = $41,
                school_id = $42,
                grade_level = $43,
                section = $44,
                parent_guardian_name = $45,
                parent_guardian_contact = $46,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $47
            RETURNING *
        `;

        const result = await pool.query(updateQuery, [
            validatedData.student_lrn ?? existing.student_lrn,
            validatedData.first_name ?? existing.first_name,
            validatedData.middle_name !== undefined ? validatedData.middle_name : existing.middle_name,
            validatedData.last_name ?? existing.last_name,
            validatedData.suffix !== undefined ? validatedData.suffix : existing.suffix,
            validatedData.sex ?? existing.sex,
            dobStr,
            validatedData.photo_url !== undefined ? (validatedData.photo_url || null) : existing.photo_url,
            validatedData.birth_place !== undefined ? validatedData.birth_place : existing.birth_place,
            validatedData.civil_status !== undefined ? validatedData.civil_status : existing.civil_status,
            validatedData.educational_attainment !== undefined ? validatedData.educational_attainment : existing.educational_attainment,
            validatedData.employment_status !== undefined ? validatedData.employment_status : existing.employment_status,
            (validatedData.tax_id_no || validatedData.tin_no) !== undefined ? (validatedData.tax_id_no || validatedData.tin_no) : existing.tax_id_no,
            validatedData.religion !== undefined ? validatedData.religion : existing.religion,
            isIndigenous,
            validatedData.indigenous_group !== undefined ? validatedData.indigenous_group : existing.indigenous_group,
            validatedData.blood_type !== undefined ? validatedData.blood_type : existing.blood_type,
            validatedData.mother_first_name !== undefined ? validatedData.mother_first_name : existing.mother_first_name,
            validatedData.mother_last_name !== undefined ? validatedData.mother_last_name : existing.mother_last_name,
            validatedData.mother_middle_name !== undefined ? validatedData.mother_middle_name : existing.mother_middle_name,
            motherDobStr,
            validatedData.country ?? existing.country,
            validatedData.region ?? existing.region,
            validatedData.province ?? existing.province,
            municipalityId,
            barangayId,
            (validatedData.street_address || validatedData.address) !== undefined ? (validatedData.street_address || validatedData.address) : existing.street_address,
            validatedData.zip_code !== undefined ? validatedData.zip_code : existing.zip_code,
            validatedData.email !== undefined ? validatedData.email : existing.email,
            (validatedData.mobile || validatedData.contact_no) !== undefined ? (validatedData.mobile || validatedData.contact_no) : existing.mobile,
            validatedData.landline !== undefined ? validatedData.landline : existing.landline,
            validatedData.psa_national_id !== undefined ? validatedData.psa_national_id : existing.psa_national_id,
            is4ps,
            (validatedData.fourps_household_no || validatedData.dswd_4ps_no) !== undefined ? (validatedData.fourps_household_no || validatedData.dswd_4ps_no) : existing.fourps_household_no,
            isPwd,
            validatedData.pwd_type !== undefined ? validatedData.pwd_type : existing.pwd_type,
            (validatedData.pwd_id || validatedData.pwd_id_no) !== undefined ? (validatedData.pwd_id || validatedData.pwd_id_no) : existing.pwd_id,
            isPhilhealth,
            (validatedData.philhealth_no || validatedData.philhealth_id) !== undefined ? (validatedData.philhealth_no || validatedData.philhealth_id) : existing.philhealth_no,
            validatedData.philhealth_status_type !== undefined ? validatedData.philhealth_status_type : existing.philhealth_status_type,
            validatedData.philhealth_category !== undefined ? validatedData.philhealth_category : existing.philhealth_category,
            schoolId,
            validatedData.grade_level !== undefined ? validatedData.grade_level : existing.grade_level,
            validatedData.section !== undefined ? validatedData.section : existing.section,
            validatedData.parent_guardian_name !== undefined ? validatedData.parent_guardian_name : existing.parent_guardian_name,
            validatedData.parent_guardian_contact !== undefined ? validatedData.parent_guardian_contact : existing.parent_guardian_contact,
            studentId
        ]);

        const mappedUpdated = mapStudentRow(result.rows[0]);
        res.status(200).json({
            message: 'Student updated successfully',
            data: mappedUpdated
        });
    } catch (error: unknown) {
        console.error('Error updating student:', error);
        const dbError = error as { code?: string };
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
        } else if (dbError?.code === '23505') {
            res.status(409).json({ message: 'A student with this LRN already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

/**
 * GET /api/students/:id/profile
 * Return the student and available module records.
 */
export const getStudentProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Insufficient privileges' });
            return;
        }

        const studentId = Number(req.params.id);
        if (isNaN(studentId)) {
            res.status(400).json({ message: 'Invalid student ID' });
            return;
        }

        const studentQuery = `
            SELECT 
                s.*,
                sc.name AS school_name,
                b.name AS barangay_name,
                m.name AS municipality_name
            FROM STUDENTS s
            LEFT JOIN SCHOOLS sc ON s.school_id = sc.id
            LEFT JOIN BARANGAYS b ON s.barangay_id = b.id
            LEFT JOIN MUNICIPALITIES m ON s.municipality_id = m.id
            WHERE s.id = $1
        `;

        const studentRes = await pool.query(studentQuery, [studentId]);
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];

        // Access check
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You do not have permission to view this student profile' });
            return;
        }

        // Fetch module records in parallel
        const [
            patientInfoRes,
            animalBitesRes,
            oralHealthRes,
            dewormingRes,
            immunizationRes,
            vitalSignsRes
        ] = await Promise.all([
            pool.query('SELECT * FROM PATIENT_INFO WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
            pool.query('SELECT * FROM ANIMAL_BITES WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
            pool.query('SELECT * FROM ORAL_HEALTH WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
            pool.query('SELECT * FROM DEWORMING WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
            pool.query('SELECT * FROM IMMUNIZATION WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
            pool.query('SELECT * FROM VITAL_SIGNS WHERE student_id = $1 ORDER BY created_at DESC', [studentId])
        ]);

        const mappedStudent = mapStudentRow(student);

        res.status(200).json({
            data: {
                student: mappedStudent,
                modules: {
                    patient_info: patientInfoRes.rows,
                    animal_bites: animalBitesRes.rows,
                    oral_health: oralHealthRes.rows,
                    deworming: dewormingRes.rows,
                    immunization: immunizationRes.rows,
                    vital_signs: vitalSignsRes.rows,
                },
                module_summary: {
                    patient_info: patientInfoRes.rows.length > 0,
                    oral_health: oralHealthRes.rows.length > 0,
                    deworming: dewormingRes.rows.length > 0,
                    immunization: immunizationRes.rows.length > 0,
                    vital_signs: vitalSignsRes.rows.length > 0,
                }
            }
        });
    } catch (error: unknown) {
        console.error('Error fetching student profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

