import type { Request, Response } from 'express';
import pool from '../database/db.js';
import { z } from 'zod';

const createStudentSchema = z.object({
    // I. Personal Information
    photo_url: z.string().optional(),
    first_name: z.string().min(1, 'First name is required'),
    middle_name: z.string().optional(),
    last_name: z.string().min(1, 'Last name is required'),
    suffix: z.string().optional(),
    sex: z.enum(['Male', 'Female']),
    date_of_birth: z.string().min(1, 'Date of birth is required'), // accepts YYYY-MM-DD from <input type="date">
    student_lrn: z.string().min(1, 'LRN is required'),

    // II. Other Personal Information
    birth_place: z.string().optional(),
    civil_status: z.string().optional(),
    educational_attainment: z.string().optional(),
    employment_status: z.string().optional(),
    tin_no: z.string().optional(),
    religion: z.string().optional(),
    indigenous: z.enum(['Yes', 'No']).optional(),
    indigenous_group: z.string().optional(),
    blood_type: z.string().optional(),

    // Mother's Information
    mother_first_name: z.string().optional(),
    mother_last_name: z.string().optional(),
    mother_middle_name: z.string().optional(),
    mother_birthdate: z.string().optional(),

    // III. Address and Contact Info
    country: z.string().optional(),
    region: z.string().optional(),
    province: z.string().optional(),
    municipality: z.union([z.string(), z.number()]).optional(), // municipality_id from dropdown
    barangay: z.union([z.string(), z.number()]).optional(),     // barangay_id from dropdown
    address: z.string().optional(),                              // street_address
    zip_code: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    contact_no: z.string().optional(),                           // maps to mobile
    landline: z.string().optional(),
    psa_national_id: z.string().optional(),

    // IV. Other Info (4Ps/PWD)
    dswd_4ps: z.enum(['Yes', 'No']).optional(),
    dswd_4ps_no: z.string().optional(),
    is_pwd: z.enum(['Yes', 'No']).optional(),
    pwd_type: z.string().optional(),
    pwd_id_no: z.string().optional(),

    // V. Philhealth Info
    philhealth_member: z.enum(['Yes', 'No']).optional(),
    philhealth_id: z.string().optional(),
    philhealth_status_type: z.string().optional(),
    philhealth_category: z.string().optional(),

    // School / Academic Info
    school_id: z.number().optional(),
    grade_level: z.string().optional(),
    section: z.string().optional(),

    // Parent/Guardian
    parent_guardian_name: z.string().optional(),
    parent_guardian_contact: z.string().optional(),
});

export const createStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const validatedData = createStudentSchema.parse(req.body);

        // date_of_birth comes as YYYY-MM-DD from <input type="date"> — use directly
        const dobStr = validatedData.date_of_birth;
        const motherDobStr = validatedData.mother_birthdate || null;

        // Parse numeric IDs from the dropdown values
        const municipalityId = validatedData.municipality ? Number(validatedData.municipality) || null : null;
        const barangayId = validatedData.barangay ? Number(validatedData.barangay) || null : null;
        const schoolId = validatedData.school_id ? Number(validatedData.school_id) || null : null;

        // registered_by: use req.user.id if authenticated, otherwise use 1 (system/admin)
        const registeredBy = req.user?.id ?? 1;

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
            validatedData.suffix || null,
            validatedData.sex,
            dobStr,
            validatedData.photo_url || null,
            // II. Other Personal Info
            validatedData.birth_place || null,
            validatedData.civil_status || null,
            validatedData.educational_attainment || null,
            validatedData.employment_status || null,
            validatedData.tin_no || null,
            validatedData.religion || null,
            validatedData.indigenous === 'Yes',
            validatedData.indigenous_group || null,
            validatedData.blood_type || null,
            // Mother's Info
            validatedData.mother_first_name || null,
            validatedData.mother_last_name || null,
            validatedData.mother_middle_name || null,
            motherDobStr,
            // III. Address
            validatedData.country || 'Philippines',
            validatedData.region || 'Region VI',
            validatedData.province || 'Aklan',
            municipalityId,
            barangayId,
            validatedData.address || null,
            validatedData.zip_code || null,
            validatedData.email || null,
            validatedData.contact_no || null,
            validatedData.landline || null,
            validatedData.psa_national_id || null,
            // IV. 4Ps/PWD
            validatedData.dswd_4ps === 'Yes',
            validatedData.dswd_4ps_no || null,
            validatedData.is_pwd === 'Yes',
            validatedData.pwd_type || null,
            validatedData.pwd_id_no || null,
            // V. Philhealth
            validatedData.philhealth_member === 'Yes',
            validatedData.philhealth_id || null,
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
            registeredBy,
        ]);

        const studentId = result.rows[0].id;
        res.status(201).json({ message: 'Student registered successfully', id: studentId });
    } catch (error: unknown) {
        console.error("Error creating student:", error);
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};
