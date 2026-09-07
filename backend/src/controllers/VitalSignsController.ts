import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import {
    dashboardFiltersSchema,
    validateGeographyHierarchy,
    getVitalSignsDashboard as fetchVitalSignsDashboard,
} from '../services/dashboard.service.js';

// Strict typing for Vital Signs DB row
export interface VitalSignsDbRow {
    id: number;
    student_id: number;
    date_checked: string | Date;
    blood_pressure_systolic: number | null;
    blood_pressure_diastolic: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature: number | string | null;
    weight_kg: number | string | null;
    height_cm: number | string | null;
    bmi: number | string | null;
    remarks: string | null;
    recorded_by: number;
    created_at: string | Date;
    updated_at: string | Date;
}

// Formatted response shape
export interface VitalSignsResponse {
    id: number;
    student_id: number;
    date_checked: string;
    blood_pressure_systolic?: number | undefined;
    blood_pressure_diastolic?: number | undefined;
    heart_rate?: number | undefined;
    respiratory_rate?: number | undefined;
    temperature?: number | undefined;
    weight_kg?: number | undefined;
    height_cm?: number | undefined;
    bmi?: number | undefined;
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

const mapVitalSignsRow = (row: VitalSignsDbRow): VitalSignsResponse => {
    const res: VitalSignsResponse = {
        id: row.id,
        student_id: row.student_id,
        date_checked: formatDate(row.date_checked),
        recorded_by: row.recorded_by,
        created_at: formatDate(row.created_at),
        updated_at: formatDate(row.updated_at),
    };

    if (row.blood_pressure_systolic !== null && row.blood_pressure_systolic !== undefined) {
        res.blood_pressure_systolic = Number(row.blood_pressure_systolic);
    }
    if (row.blood_pressure_diastolic !== null && row.blood_pressure_diastolic !== undefined) {
        res.blood_pressure_diastolic = Number(row.blood_pressure_diastolic);
    }
    if (row.heart_rate !== null && row.heart_rate !== undefined) {
        res.heart_rate = Number(row.heart_rate);
    }
    if (row.respiratory_rate !== null && row.respiratory_rate !== undefined) {
        res.respiratory_rate = Number(row.respiratory_rate);
    }
    if (row.temperature !== null && row.temperature !== undefined) {
        res.temperature = Number(row.temperature);
    }
    if (row.weight_kg !== null && row.weight_kg !== undefined) {
        res.weight_kg = Number(row.weight_kg);
    }
    if (row.height_cm !== null && row.height_cm !== undefined) {
        res.height_cm = Number(row.height_cm);
    }
    if (row.bmi !== null && row.bmi !== undefined) {
        res.bmi = Number(row.bmi);
    }
    if (row.remarks) {
        res.remarks = row.remarks;
    }

    return res;
};

// Calculate BMI from weight in kg and height in cm
export const calculateBmi = (weightKg: number | null | undefined, heightCm: number | null | undefined): number | null => {
    if (weightKg === null || weightKg === undefined || heightCm === null || heightCm === undefined) {
        return null;
    }
    const heightM = heightCm / 100;
    if (heightM <= 0) return null;
    return Number((weightKg / (heightM * heightM)).toFixed(2));
};

// Zod schemas with physiological validation bounds
const vitalSignsBaseSchema = z.object({
    date_checked: z.string().min(1, 'Date checked is required'),
    blood_pressure_systolic: z.number().int().min(50, 'Systolic BP must be at least 50 mmHg').max(250, 'Systolic BP must be at most 250 mmHg').optional().nullable(),
    blood_pressure_diastolic: z.number().int().min(30, 'Diastolic BP must be at least 30 mmHg').max(150, 'Diastolic BP must be at most 150 mmHg').optional().nullable(),
    heart_rate: z.number().int().min(30, 'Heart rate must be at least 30 bpm').max(250, 'Heart rate must be at most 250 bpm').optional().nullable(),
    respiratory_rate: z.number().int().min(8, 'Respiratory rate must be at least 8 breaths/min').max(80, 'Respiratory rate must be at most 80 breaths/min').optional().nullable(),
    temperature: z.number().min(30.0, 'Body temperature must be at least 30.0 °C').max(45.0, 'Body temperature must be at most 45.0 °C').optional().nullable(),
    weight_kg: z.number().min(2.0, 'Weight must be at least 2.0 kg').max(300.0, 'Weight must be at most 300.0 kg').optional().nullable(),
    height_cm: z.number().min(40.0, 'Height must be at least 40.0 cm').max(250.0, 'Height must be at most 250.0 cm').optional().nullable(),
    bmi: z.number().optional().nullable(),
    remarks: z.string().optional().nullable(),
});

const createVitalSignsSchema = vitalSignsBaseSchema.extend({
    student_id: z.number().int().positive('Valid student ID is required'),
});

const updateVitalSignsSchema = vitalSignsBaseSchema.partial();

/**
 * POST /api/modules/vital-signs
 * Create a Vital Signs record for a student.
 */
export const createVitalSigns = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const validated = createVitalSignsSchema.parse(req.body);

        // Verify student existence and authorization
        const studentRes = await pool.query(
            'SELECT id, registered_by, date_of_birth FROM STUDENTS WHERE id = $1',
            [validated.student_id]
        );
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only record vital signs for students you registered' });
            return;
        }

        const dateCheckedStr = formatDate(validated.date_checked);
        const dobStr = formatDate(student.date_of_birth);

        // Check date vs DOB
        if (new Date(dateCheckedStr) < new Date(dobStr)) {
            res.status(400).json({ message: 'Invalid date: Date checked cannot be earlier than student date of birth' });
            return;
        }

        // Validate systolic vs diastolic BP
        if (validated.blood_pressure_systolic !== null && validated.blood_pressure_systolic !== undefined &&
            validated.blood_pressure_diastolic !== null && validated.blood_pressure_diastolic !== undefined) {
            if (validated.blood_pressure_systolic <= validated.blood_pressure_diastolic) {
                res.status(400).json({ message: 'Validation failed: Systolic blood pressure must be greater than diastolic blood pressure' });
                return;
            }
        }

        // Calculate BMI server-side from weight and height
        const serverComputedBmi = calculateBmi(validated.weight_kg, validated.height_cm);

        const insertSql = `
            INSERT INTO VITAL_SIGNS (
                student_id,
                date_checked,
                blood_pressure_systolic,
                blood_pressure_diastolic,
                heart_rate,
                respiratory_rate,
                temperature,
                weight_kg,
                height_cm,
                bmi,
                remarks,
                recorded_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            ) RETURNING *
        `;

        const insertResult = await pool.query<VitalSignsDbRow>(insertSql, [
            validated.student_id,
            dateCheckedStr,
            validated.blood_pressure_systolic ?? null,
            validated.blood_pressure_diastolic ?? null,
            validated.heart_rate ?? null,
            validated.respiratory_rate ?? null,
            validated.temperature ?? null,
            validated.weight_kg ?? null,
            validated.height_cm ?? null,
            serverComputedBmi,
            validated.remarks ?? null,
            req.user.id,
        ]);

        const createdRow = insertResult.rows[0];
        if (!createdRow) {
            res.status(500).json({ message: 'Failed to create vital signs record' });
            return;
        }

        res.status(201).json({
            message: 'Vital signs record created successfully',
            data: mapVitalSignsRow(createdRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error creating vital signs record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/vital-signs/student/:studentId
 * Get all Vital Signs records for a student.
 */
export const getVitalSignsByStudent = async (req: Request, res: Response): Promise<void> => {
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
        const studentRes = await pool.query('SELECT id, registered_by FROM STUDENTS WHERE id = $1', [studentId]);
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only view records for students you registered' });
            return;
        }

        const querySql = `
            SELECT * FROM VITAL_SIGNS
            WHERE student_id = $1
            ORDER BY date_checked DESC, created_at DESC
        `;
        const result = await pool.query<VitalSignsDbRow>(querySql, [studentId]);
        const mappedList = result.rows.map(mapVitalSignsRow);

        res.status(200).json({
            data: {
                vital_signs: mappedList[0] || null,
                records: mappedList,
            },
        });
    } catch (error: unknown) {
        console.error('Error fetching vital signs records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/modules/vital-signs/:id
 * Update an existing Vital Signs record.
 */
export const updateVitalSigns = async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ message: 'Invalid vital signs record ID' });
            return;
        }

        // Verify record existence and check teacher ownership
        const checkSql = `
            SELECT vs.*, s.registered_by, s.date_of_birth
            FROM VITAL_SIGNS vs
            JOIN STUDENTS s ON vs.student_id = s.id
            WHERE vs.id = $1
        `;
        const existingRes = await pool.query(checkSql, [id]);
        if (existingRes.rows.length === 0) {
            res.status(404).json({ message: 'Vital signs record not found' });
            return;
        }

        const existingRecord = existingRes.rows[0];
        if (req.user.role === 'teacher' && existingRecord.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only update records for students you registered' });
            return;
        }

        const validated = updateVitalSignsSchema.parse(req.body);

        const dobStr = formatDate(existingRecord.date_of_birth);
        const dateChecked = validated.date_checked !== undefined
            ? formatDate(validated.date_checked)
            : formatDate(existingRecord.date_checked);

        // Date vs DOB check
        if (new Date(dateChecked) < new Date(dobStr)) {
            res.status(400).json({ message: 'Invalid date: Date checked cannot be earlier than student date of birth' });
            return;
        }

        // Merged values for BP check
        const systolic = validated.blood_pressure_systolic !== undefined
            ? validated.blood_pressure_systolic
            : (existingRecord.blood_pressure_systolic !== null ? Number(existingRecord.blood_pressure_systolic) : null);

        const diastolic = validated.blood_pressure_diastolic !== undefined
            ? validated.blood_pressure_diastolic
            : (existingRecord.blood_pressure_diastolic !== null ? Number(existingRecord.blood_pressure_diastolic) : null);

        if (systolic !== null && diastolic !== null) {
            if (systolic <= diastolic) {
                res.status(400).json({ message: 'Validation failed: Systolic blood pressure must be greater than diastolic blood pressure' });
                return;
            }
        }

        // Merged values for weight, height, and BMI
        const weight = validated.weight_kg !== undefined
            ? validated.weight_kg
            : (existingRecord.weight_kg !== null ? Number(existingRecord.weight_kg) : null);

        const height = validated.height_cm !== undefined
            ? validated.height_cm
            : (existingRecord.height_cm !== null ? Number(existingRecord.height_cm) : null);

        const bmi = calculateBmi(weight, height);

        const heartRate = validated.heart_rate !== undefined ? validated.heart_rate : existingRecord.heart_rate;
        const respiratoryRate = validated.respiratory_rate !== undefined ? validated.respiratory_rate : existingRecord.respiratory_rate;
        const temperature = validated.temperature !== undefined ? validated.temperature : existingRecord.temperature;
        const remarks = validated.remarks !== undefined ? validated.remarks : existingRecord.remarks;

        const updateSql = `
            UPDATE VITAL_SIGNS
            SET
                date_checked = $1,
                blood_pressure_systolic = $2,
                blood_pressure_diastolic = $3,
                heart_rate = $4,
                respiratory_rate = $5,
                temperature = $6,
                weight_kg = $7,
                height_cm = $8,
                bmi = $9,
                remarks = $10,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *
        `;

        const updateResult = await pool.query<VitalSignsDbRow>(updateSql, [
            dateChecked,
            systolic,
            diastolic,
            heartRate,
            respiratoryRate,
            temperature,
            weight,
            height,
            bmi,
            remarks,
            id,
        ]);

        const updatedRow = updateResult.rows[0];
        if (!updatedRow) {
            res.status(500).json({ message: 'Failed to update vital signs record' });
            return;
        }

        res.status(200).json({
            message: 'Vital signs record updated successfully',
            data: mapVitalSignsRow(updatedRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error updating vital signs record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/vital-signs/dashboard
 * Aggregated KPIs for Vital Signs module (with Clinical-Threshold Safeguard).
 * Access: superuser, admin
 */
export const getVitalSignsDashboard = async (req: Request, res: Response): Promise<void> => {
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

        const dashboardData = await fetchVitalSignsDashboard(filters);

        res.status(200).json({
            message: 'Vital Signs dashboard overview fetched successfully',
            data: dashboardData,
        });
    } catch (error) {
        console.error('Vital Signs dashboard error:', error);
        res.status(500).json({ message: 'Internal server error while generating dashboard data' });
    }
};
