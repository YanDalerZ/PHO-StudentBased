import type { Request, Response } from 'express';
import pool from '../database/db.js';
import { z } from 'zod';

const createStudentSchema = z.object({
    // Student Info
    photo_base64: z.string().optional(),
    prefix: z.string().min(1, 'Prefix is required'),
    last_name: z.string().min(2, 'Last name is required'),
    first_name: z.string().min(2, 'First name is required'),
    middle_name: z.string().min(1, 'Middle name is required'),
    suffix: z.string().optional(),
    sex: z.enum(['Female', 'Male']),
    date_of_birth: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Invalid date format (MM/DD/YYYY)'),
    birth_place: z.string().optional(),
    mother_first_name: z.string().optional(),
    mother_last_name: z.string().optional(),
    mother_middle_name: z.string().optional(),
    mother_birth_date: z.string().optional(),
    student_lrn: z.string().min(1, 'LRN is required'),
    grade_level: z.string().min(1, 'Grade level is required'),
    
    // Address Info (STUDENTS)
    country: z.string().optional(),
    region: z.string().optional(),
    zip_code: z.string().optional(),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    landline_no: z.string().optional(),
    psa_national_id: z.string().optional(),

    // Patient Info (Part II)
    civil_status: z.string().optional(),
    educational_attainment: z.string().optional(),
    employment_status: z.string().optional(),
    tin_no: z.string().optional(),
    religion: z.string().optional(),
    indigenous: z.enum(['Yes', 'No']).optional(),
    indigenous_group: z.string().optional(),
    blood_type: z.string().optional(),

    // Part IV (4Ps & PWD)
    dswd_4ps: z.enum(['Yes', 'No']).optional(),
    dswd_4ps_no: z.string().optional(),
    is_pwd: z.enum(['Yes', 'No']).optional(),
    pwd_type: z.string().optional(),
    pwd_id_no: z.string().optional(),

    // Part V (Philhealth)
    philhealth_member: z.enum(['Yes', 'No']).optional(),
    philhealth_id: z.string().optional(),
    philhealth_status_type: z.string().optional(),
    philhealth_category: z.string().optional(),
});

export const createStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const validatedData = createStudentSchema.parse(req.body);

        const [month, day, year] = validatedData.date_of_birth.split('/');
        const dobStr = `${year}-${month}-${day}`;

        let motherDobStr = null;
        if (validatedData.mother_birth_date && validatedData.mother_birth_date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [mMonth, mDay, mYear] = validatedData.mother_birth_date.split('/');
            motherDobStr = `${mYear}-${mMonth}-${mDay}`;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const studentQuery = `
                INSERT INTO students (
                    student_lrn, first_name, middle_name, last_name, suffix, date_of_birth, sex, grade_level,
                    photo_base64, prefix, birth_place, mother_first_name, mother_last_name, mother_middle_name, mother_birth_date,
                    country, region, zip_code, email, landline_no, psa_national_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                RETURNING id
            `;
            const studentResult = await client.query(studentQuery, [
                validatedData.student_lrn,
                validatedData.first_name,
                validatedData.middle_name,
                validatedData.last_name,
                validatedData.suffix || null,
                dobStr,
                validatedData.sex,
                validatedData.grade_level,
                validatedData.photo_base64,
                validatedData.prefix,
                validatedData.birth_place,
                validatedData.mother_first_name,
                validatedData.mother_last_name,
                validatedData.mother_middle_name,
                motherDobStr,
                validatedData.country || 'Philippines',
                validatedData.region || 'Region VI',
                validatedData.zip_code,
                validatedData.email,
                validatedData.landline_no,
                validatedData.psa_national_id
            ]);
            const studentId = studentResult.rows[0].id;

            const patientInfoQuery = `
                INSERT INTO patient_info (
                    student_id, civil_status, educational_attainment, employment_status, tin_no, religion, criteria, blood_type,
                    indigenous_group, dswd_4ps, dswd_4ps_no, is_pwd, pwd_type, pwd_id_no, philhealth_member, philhealth_id, philhealth_status_type, philhealth_category
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            `;
            await client.query(patientInfoQuery, [
                studentId,
                validatedData.civil_status,
                validatedData.educational_attainment,
                validatedData.employment_status,
                validatedData.tin_no,
                validatedData.religion,
                validatedData.indigenous === 'Yes' ? 'IPS' : null,
                validatedData.blood_type,
                validatedData.indigenous_group,
                validatedData.dswd_4ps === 'Yes' ? true : false,
                validatedData.dswd_4ps_no,
                validatedData.is_pwd === 'Yes' ? true : false,
                validatedData.pwd_type,
                validatedData.pwd_id_no,
                validatedData.philhealth_member === 'Yes' ? true : false,
                validatedData.philhealth_id,
                validatedData.philhealth_status_type,
                validatedData.philhealth_category
            ]);

            await client.query('COMMIT');
            res.status(201).json({ message: 'Student registered successfully', studentId });
        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("Error creating student:", error);
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
        } else {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};
