import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import {
    dashboardFiltersSchema,
    validateGeographyHierarchy,
    getDewormingDashboard as fetchDewormingDashboard,
    getDewormingReport as fetchDewormingReport,
} from '../services/dashboard.service.js';

// Strict typing for Deworming DB row
export interface DewormingDbRow {
    id: number;
    student_id: number;
    date_dewormed: string | Date;
    age_group: string | null;
    medication_given: string | null;
    is_dewormed: boolean | null;
    school_type: 'public' | 'private' | null;
    in_school: boolean | null;
    school_id: number | null;
    remarks: string | null;
    recorded_by: number;
    created_at: string | Date;
    updated_at: string | Date;
}

// Formatted response shape
export interface DewormingResponse {
    id: number;
    student_id: number;
    date_dewormed: string;
    age_group: string;
    medication_given: string;
    is_dewormed: boolean;
    school_type?: 'public' | 'private' | undefined;
    in_school: boolean;
    school_id?: number | undefined;
    remarks?: string | undefined;
    recorded_by: number;
    created_at: string;
    updated_at: string;
}

const formatDate = (val: string | Date | null | undefined): string => {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0] ?? '';
    const s = String(val).trim();
    if (s.includes('T')) return s.split('T')[0] ?? s;
    return s;
};

const mapDewormingRow = (row: DewormingDbRow): DewormingResponse => {
    const response: DewormingResponse = {
        id: row.id,
        student_id: row.student_id,
        date_dewormed: formatDate(row.date_dewormed),
        age_group: row.age_group ?? '',
        medication_given: row.medication_given ?? '',
        is_dewormed: row.is_dewormed ?? true,
        in_school: row.in_school ?? true,
        recorded_by: row.recorded_by,
        created_at: formatDate(row.created_at),
        updated_at: formatDate(row.updated_at),
    };

    if (row.school_type) response.school_type = row.school_type;
    if (row.school_id !== null && row.school_id !== undefined) response.school_id = row.school_id;
    if (row.remarks) response.remarks = row.remarks;

    return response;
};

// Calculate age group from DOB and date dewormed
export const calculateAgeGroup = (dobStr: string, dewormDateStr: string): string => {
    const birth = new Date(dobStr);
    const deworm = new Date(dewormDateStr);

    let age = deworm.getFullYear() - birth.getFullYear();
    const monthDiff = deworm.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && deworm.getDate() < birth.getDate())) {
        age--;
    }

    if (age >= 1 && age <= 4) return '1-4';
    if (age >= 5 && age <= 9) return '5-9';
    if (age >= 10 && age <= 14) return '10-14';
    if (age >= 15 && age <= 19) return '15-19';
    if (age < 1) return '<1';
    return '20+';
};

// Zod schemas
const dewormingSchema = z.object({
    date_dewormed: z.string().min(1, 'Date dewormed is required'),
    age_group: z.string().max(10).optional().nullable(),
    medication_given: z.string().max(100).optional().nullable(),
    is_dewormed: z.boolean().optional().default(true),
    school_type: z.enum(['public', 'private']).optional().nullable(),
    in_school: z.boolean().optional().default(true),
    school_id: z.number().int().positive().optional().nullable(),
    remarks: z.string().optional().nullable(),
});

const createDewormingSchema = dewormingSchema.extend({
    student_id: z.number().int().positive('Valid student ID is required'),
});

const updateDewormingSchema = dewormingSchema.partial();

/**
 * POST /api/modules/deworming
 * Create a Deworming record for a student.
 */
export const createDeworming = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const validated = createDewormingSchema.parse(req.body);

        // Verify student existence and authorization
        const studentRes = await pool.query(
            'SELECT id, registered_by, date_of_birth, school_id FROM STUDENTS WHERE id = $1',
            [validated.student_id]
        );
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'school_staff') {
            const assignedSchools = req.user.schoolAssignments || [];
            if (!student.school_id || !assignedSchools.includes(student.school_id)) {
                res.status(403).json({ message: 'Access forbidden: You can only record deworming for students in your assigned schools' });
                return;
            }
        }

        const dateDewormedStr = formatDate(validated.date_dewormed);
        const dobStr = formatDate(student.date_of_birth);

        // Reject impossible date combination: date dewormed before date of birth
        if (new Date(dateDewormedStr) < new Date(dobStr)) {
            res.status(400).json({ message: 'Invalid date: Date dewormed cannot be earlier than student date of birth' });
            return;
        }

        // Determine age group: auto-calculate if omitted or empty
        let ageGroup = validated.age_group ? validated.age_group.trim() : '';
        if (!ageGroup) {
            ageGroup = calculateAgeGroup(dobStr, dateDewormedStr);
        }

        // School scope validation: default to student's school if omitted
        let schoolId = validated.school_id ?? student.school_id ?? null;
        if (validated.school_id) {
            // Verify school exists in database
            const schoolRes = await pool.query('SELECT id FROM SCHOOLS WHERE id = $1', [validated.school_id]);
            if (schoolRes.rows.length === 0) {
                res.status(400).json({ message: 'Invalid school ID: School does not exist' });
                return;
            }

            // Teachers cannot override record to a school outside the student's authorized school
            if (req.user.role === 'school_staff' && student.school_id && validated.school_id !== student.school_id) {
                res.status(403).json({ message: 'Access forbidden: Teachers cannot assign records to a different school' });
                return;
            }
            schoolId = validated.school_id;
        }

        const insertSql = `
            INSERT INTO DEWORMING (
                student_id,
                date_dewormed,
                age_group,
                medication_given,
                is_dewormed,
                school_type,
                in_school,
                school_id,
                remarks,
                recorded_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            ) RETURNING *
        `;

        const insertResult = await pool.query<DewormingDbRow>(insertSql, [
            validated.student_id,
            dateDewormedStr,
            ageGroup || null,
            validated.medication_given ?? null,
            validated.is_dewormed ?? true,
            validated.school_type ?? null,
            validated.in_school ?? true,
            schoolId,
            validated.remarks ?? null,
            req.user.id,
        ]);

        const createdRow = insertResult.rows[0];
        if (!createdRow) {
            res.status(500).json({ message: 'Failed to create deworming record' });
            return;
        }

        res.status(201).json({
            message: 'Deworming record created successfully',
            data: mapDewormingRow(createdRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error creating deworming record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/deworming/student/:studentId
 * Get all Deworming records for a student.
 */
export const getDewormingByStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const studentId = Number(req.params.studentId);
        if (isNaN(studentId)) {
            res.status(400).json({ message: 'Invalid student ID' });
            return;
        }

        // Verify student existence and authorization
        const studentRes = await pool.query('SELECT id, registered_by, school_id FROM STUDENTS WHERE id = $1', [studentId]);
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'school_staff') {
            const assignedSchools = req.user.schoolAssignments || [];
            if (!student.school_id || !assignedSchools.includes(student.school_id)) {
                res.status(403).json({ message: 'Access forbidden: You can only view records for students in your assigned schools' });
                return;
            }
        }

        const querySql = `
            SELECT * FROM DEWORMING
            WHERE student_id = $1
            ORDER BY date_dewormed DESC, created_at DESC
        `;
        const result = await pool.query<DewormingDbRow>(querySql, [studentId]);
        const mappedList = result.rows.map(mapDewormingRow);

        res.status(200).json({
            data: {
                deworming: mappedList[0] || null,
                records: mappedList,
            },
        });
    } catch (error: unknown) {
        console.error('Error fetching deworming records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/modules/deworming/:id
 * Update an existing Deworming record.
 */
export const updateDeworming = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ message: 'Invalid deworming record ID' });
            return;
        }

        // Verify record existence and check teacher student ownership
        const checkSql = `
            SELECT d.*, s.registered_by, s.date_of_birth, s.school_id AS student_school_id
            FROM DEWORMING d
            JOIN STUDENTS s ON d.student_id = s.id
            WHERE d.id = $1
        `;
        const existingRes = await pool.query(checkSql, [id]);
        if (existingRes.rows.length === 0) {
            res.status(404).json({ message: 'Deworming record not found' });
            return;
        }

        const existingRecord = existingRes.rows[0];
        if (req.user.role === 'school_staff') {
            const assignedSchools = req.user.schoolAssignments || [];
            if (!existingRecord.student_school_id || !assignedSchools.includes(existingRecord.student_school_id)) {
                res.status(403).json({ message: 'Access forbidden: You can only update records for students in your assigned schools' });
                return;
            }
        }

        const validated = updateDewormingSchema.parse(req.body);

        const dobStr = formatDate(existingRecord.date_of_birth);
        const dateDewormed = validated.date_dewormed !== undefined
            ? formatDate(validated.date_dewormed)
            : formatDate(existingRecord.date_dewormed);

        // Check date vs DOB
        if (new Date(dateDewormed) < new Date(dobStr)) {
            res.status(400).json({ message: 'Invalid date: Date dewormed cannot be earlier than student date of birth' });
            return;
        }

        // Determine age group
        let ageGroup: string;
        if (validated.age_group !== undefined) {
            if (validated.age_group && validated.age_group.trim()) {
                ageGroup = validated.age_group.trim();
            } else {
                ageGroup = calculateAgeGroup(dobStr, dateDewormed);
            }
        } else if (validated.date_dewormed !== undefined && !existingRecord.age_group) {
            ageGroup = calculateAgeGroup(dobStr, dateDewormed);
        } else {
            ageGroup = existingRecord.age_group ?? calculateAgeGroup(dobStr, dateDewormed);
        }

        // School scope validation
        let schoolId = existingRecord.school_id;
        if (validated.school_id !== undefined) {
            if (validated.school_id !== null) {
                const schoolRes = await pool.query('SELECT id FROM SCHOOLS WHERE id = $1', [validated.school_id]);
                if (schoolRes.rows.length === 0) {
                    res.status(400).json({ message: 'Invalid school ID: School does not exist' });
                    return;
                }

                if (req.user.role === 'school_staff' && existingRecord.student_school_id && validated.school_id !== existingRecord.student_school_id) {
                    res.status(403).json({ message: 'Access forbidden: Teachers cannot assign records to a different school' });
                    return;
                }
                schoolId = validated.school_id;
            } else {
                schoolId = null;
            }
        }

        const medicationGiven = validated.medication_given !== undefined ? validated.medication_given : existingRecord.medication_given;
        const isDewormed = validated.is_dewormed !== undefined ? validated.is_dewormed : existingRecord.is_dewormed;
        const schoolType = validated.school_type !== undefined ? validated.school_type : existingRecord.school_type;
        const inSchool = validated.in_school !== undefined ? validated.in_school : existingRecord.in_school;
        const remarks = validated.remarks !== undefined ? validated.remarks : existingRecord.remarks;

        const updateSql = `
            UPDATE DEWORMING
            SET
                date_dewormed = $1,
                age_group = $2,
                medication_given = $3,
                is_dewormed = $4,
                school_type = $5,
                in_school = $6,
                school_id = $7,
                remarks = $8,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `;

        const updateResult = await pool.query<DewormingDbRow>(updateSql, [
            dateDewormed,
            ageGroup || null,
            medicationGiven,
            isDewormed,
            schoolType,
            inSchool,
            schoolId,
            remarks,
            id,
        ]);

        const updatedRow = updateResult.rows[0];
        if (!updatedRow) {
            res.status(500).json({ message: 'Failed to update deworming record' });
            return;
        }

        res.status(200).json({
            message: 'Deworming record updated successfully',
            data: mapDewormingRow(updatedRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error updating deworming record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/deworming/dashboard
 * Aggregated KPIs for Deworming module.
 * Access: superuser, admin
 */
export const getDewormingDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
        const parseResult = dashboardFiltersSchema.safeParse(req.query);
        if (!parseResult.success) {
            res.status(400).json({
                message: 'Invalid filter parameters',
                errors: parseResult.error.flatten(),
            });
            return;
        }

        const filters = parseResult.data;

        const geoValidation = await validateGeographyHierarchy(filters);
        if (!geoValidation.valid) {
            res.status(400).json({
                message: 'Invalid geography hierarchy',
                error: geoValidation.error,
            });
            return;
        }

        const dashboardData = await fetchDewormingDashboard(filters);

        res.status(200).json({
            message: 'Deworming dashboard overview fetched successfully',
            data: dashboardData,
        });
    } catch (error) {
        console.error('Deworming dashboard error:', error);
        res.status(500).json({ message: 'Internal server error while generating dashboard data' });
    }
};

const dewormingReportSchema = z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
});

/**
 * GET /api/modules/deworming/report
 * Deworming municipality consolidation report.
 * Access: superuser, admin
 */
export const getDewormingReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const parseResult = dewormingReportSchema.safeParse(req.query);
        if (!parseResult.success) {
            res.status(400).json({
                message: 'Invalid query parameters: period (YYYY-MM) is required',
                errors: parseResult.error.flatten(),
            });
            return;
        }

        const { period } = parseResult.data;
        const reportData = await fetchDewormingReport(period);

        res.status(200).json({
            message: 'Deworming consolidation report fetched successfully',
            data: reportData,
        });
    } catch (error) {
        console.error('Deworming report error:', error);
        res.status(500).json({ message: 'Internal server error while generating consolidation report' });
    }
};
