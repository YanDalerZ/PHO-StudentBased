import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import {
    dashboardFiltersSchema,
    validateGeographyHierarchy,
    getImmunizationDashboard as fetchImmunizationDashboard,
} from '../services/dashboard.service.js';

// Strict typing for Immunization DB row
export interface ImmunizationDbRow {
    id: number;
    student_id: number;
    immunization_date: string | Date;
    immunization_type: string | null;
    vaccine_td1: boolean | null;
    vaccine_mr1: boolean | null;
    vaccine_hpv1: boolean | null;
    vaccine_hpv2: boolean | null;
    vaccine_td2: boolean | null;
    vaccine_mr2: boolean | null;
    is_school_based: boolean | null;
    educational_level: string | null;
    is_from_other_facility: boolean | null;
    other_facility_name: string | null;
    lot_batch_no: string | null;
    consent_given: boolean | null;
    is_sick_today: boolean | null;
    history_of_allergies: string | null;
    is_deferred: boolean | null;
    is_refused: boolean | null;
    refusal_reason_code: string | null;
    refusal_reason_text: string | null;
    is_fully_immunized: boolean | null;
    vaccinator_name: string | null;
    supervisor_name: string | null;
    remarks: string | null;
    school_id: number | null;
    recorded_by: number;
    created_at: string | Date;
    updated_at: string | Date;
}

// Formatted response shape
export interface ImmunizationResponse {
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
    educational_level?: string | undefined;
    is_from_other_facility: boolean;
    other_facility_name?: string | undefined;
    lot_batch_no?: string | undefined;
    consent_given?: boolean | undefined;
    is_sick_today: boolean;
    history_of_allergies?: string | undefined;
    is_deferred: boolean;
    is_refused: boolean;
    refusal_reason_code?: string | undefined;
    refusal_reason_text?: string | undefined;
    is_fully_immunized: boolean;
    vaccinator_name?: string | undefined;
    supervisor_name?: string | undefined;
    remarks?: string | undefined;
    school_id?: number | undefined;
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

const mapImmunizationRow = (row: ImmunizationDbRow): ImmunizationResponse => {
    const res: ImmunizationResponse = {
        id: row.id,
        student_id: row.student_id,
        immunization_date: formatDate(row.immunization_date),
        immunization_type: row.immunization_type ?? 'SCHOOL & COMMUNITY BASED IMMUNIZATION',
        vaccine_td1: row.vaccine_td1 ?? false,
        vaccine_mr1: row.vaccine_mr1 ?? false,
        vaccine_hpv1: row.vaccine_hpv1 ?? false,
        vaccine_hpv2: row.vaccine_hpv2 ?? false,
        vaccine_td2: row.vaccine_td2 ?? false,
        vaccine_mr2: row.vaccine_mr2 ?? false,
        is_school_based: row.is_school_based ?? true,
        is_from_other_facility: row.is_from_other_facility ?? false,
        is_sick_today: row.is_sick_today ?? false,
        is_deferred: row.is_deferred ?? false,
        is_refused: row.is_refused ?? false,
        is_fully_immunized: row.is_fully_immunized ?? false,
        recorded_by: row.recorded_by,
        created_at: formatDate(row.created_at),
        updated_at: formatDate(row.updated_at),
    };

    if (row.educational_level) res.educational_level = row.educational_level;
    if (row.other_facility_name) res.other_facility_name = row.other_facility_name;
    if (row.lot_batch_no) res.lot_batch_no = row.lot_batch_no;
    if (row.consent_given !== null && row.consent_given !== undefined) res.consent_given = row.consent_given;
    if (row.history_of_allergies) res.history_of_allergies = row.history_of_allergies;
    if (row.refusal_reason_code) res.refusal_reason_code = row.refusal_reason_code;
    if (row.refusal_reason_text) res.refusal_reason_text = row.refusal_reason_text;
    if (row.vaccinator_name) res.vaccinator_name = row.vaccinator_name;
    if (row.supervisor_name) res.supervisor_name = row.supervisor_name;
    if (row.remarks) res.remarks = row.remarks;
    if (row.school_id !== null && row.school_id !== undefined) res.school_id = row.school_id;

    return res;
};

// Zod schemas
const immunizationBaseSchema = z.object({
    immunization_date: z.string().min(1, 'Immunization date is required'),
    immunization_type: z.string().max(100).optional().nullable(),
    vaccine_td1: z.boolean().optional(),
    vaccine_mr1: z.boolean().optional(),
    vaccine_hpv1: z.boolean().optional(),
    vaccine_hpv2: z.boolean().optional(),
    vaccine_td2: z.boolean().optional(),
    vaccine_mr2: z.boolean().optional(),
    is_school_based: z.boolean().optional(),
    educational_level: z.string().max(30).optional().nullable(),
    is_from_other_facility: z.boolean().optional(),
    other_facility_name: z.string().max(200).optional().nullable(),
    lot_batch_no: z.string().max(100).optional().nullable(),
    consent_given: z.boolean().optional().nullable(),
    is_sick_today: z.boolean().optional(),
    history_of_allergies: z.string().max(500).optional().nullable(),
    is_deferred: z.boolean().optional(),
    is_refused: z.boolean().optional(),
    refusal_reason_code: z.string().max(10).optional().nullable(),
    refusal_reason_text: z.string().optional().nullable(),
    is_fully_immunized: z.boolean().optional(),
    vaccinator_name: z.string().max(200).optional().nullable(),
    supervisor_name: z.string().max(200).optional().nullable(),
    remarks: z.string().optional().nullable(),
    school_id: z.number().int().positive().optional().nullable(),
});

const createImmunizationSchema = immunizationBaseSchema.extend({
    student_id: z.number().int().positive('Valid student ID is required'),
});

const updateImmunizationSchema = immunizationBaseSchema.partial();

/**
 * Validate cross-field logical rules
 */
const validateImmunizationLogic = (data: {
    is_refused?: boolean | undefined;
    is_deferred?: boolean | undefined;
    is_fully_immunized?: boolean | undefined;
    is_from_other_facility?: boolean | undefined;
    other_facility_name?: string | null | undefined;
    refusal_reason_code?: string | null | undefined;
    refusal_reason_text?: string | null | undefined;
    vaccine_td1?: boolean | undefined;
    vaccine_mr1?: boolean | undefined;
    vaccine_hpv1?: boolean | undefined;
    vaccine_hpv2?: boolean | undefined;
    vaccine_td2?: boolean | undefined;
    vaccine_mr2?: boolean | undefined;
}): { isValid: boolean; message?: string } => {
    const isRefused = Boolean(data.is_refused);
    const isDeferred = Boolean(data.is_deferred);
    const isFullyImmunized = Boolean(data.is_fully_immunized);

    // 1. If not refused and not deferred, at least one vaccine must be selected
    if (!isRefused && !isDeferred) {
        const hasVaccine = Boolean(
            data.vaccine_td1 ||
            data.vaccine_mr1 ||
            data.vaccine_hpv1 ||
            data.vaccine_hpv2 ||
            data.vaccine_td2 ||
            data.vaccine_mr2
        );
        if (!hasVaccine) {
            return {
                isValid: false,
                message: 'Validation failed: At least one vaccine must be selected when the record represents a vaccination',
            };
        }
    }

    // 2. A refusal reason is required when is_refused is true
    if (isRefused) {
        const hasCode = Boolean(data.refusal_reason_code && data.refusal_reason_code.trim());
        const hasText = Boolean(data.refusal_reason_text && data.refusal_reason_text.trim());
        if (!hasCode && !hasText) {
            return {
                isValid: false,
                message: 'Validation failed: Refusal reason code or text is required when vaccination is refused',
            };
        }
    }

    // 3. Other-facility name is required when is_from_other_facility is true
    if (Boolean(data.is_from_other_facility)) {
        if (!data.other_facility_name || !data.other_facility_name.trim()) {
            return {
                isValid: false,
                message: 'Validation failed: Other facility name is required when vaccination is from another facility',
            };
        }
    }

    // 4. Do not mark a refused or deferred vaccination as fully immunized
    if ((isRefused || isDeferred) && isFullyImmunized) {
        return {
            isValid: false,
            message: 'Validation failed: A refused or deferred vaccination cannot be marked as fully immunized',
        };
    }

    return { isValid: true };
};

/**
 * POST /api/modules/immunization
 * Create an Immunization record for a student.
 */
export const createImmunization = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const validated = createImmunizationSchema.parse(req.body);

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
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only record immunization for students you registered' });
            return;
        }

        const immunizationDateStr = formatDate(validated.immunization_date);
        const dobStr = formatDate(student.date_of_birth);

        // Check date vs DOB
        if (new Date(immunizationDateStr) < new Date(dobStr)) {
            res.status(400).json({ message: 'Invalid date: Immunization date cannot be earlier than student date of birth' });
            return;
        }

        // Cross-field logical validation
        const logicCheck = validateImmunizationLogic(validated);
        if (!logicCheck.isValid) {
            res.status(400).json({ message: logicCheck.message });
            return;
        }

        // School scope validation: default to student's school if omitted
        let schoolId = validated.school_id ?? student.school_id ?? null;
        if (validated.school_id) {
            const schoolRes = await pool.query('SELECT id FROM SCHOOLS WHERE id = $1', [validated.school_id]);
            if (schoolRes.rows.length === 0) {
                res.status(400).json({ message: 'Invalid school ID: School does not exist' });
                return;
            }

            if (req.user.role === 'teacher' && student.school_id && validated.school_id !== student.school_id) {
                res.status(403).json({ message: 'Access forbidden: Teachers cannot assign records to a different school' });
                return;
            }
            schoolId = validated.school_id;
        }

        const insertSql = `
            INSERT INTO IMMUNIZATION (
                student_id,
                immunization_date,
                immunization_type,
                vaccine_td1,
                vaccine_mr1,
                vaccine_hpv1,
                vaccine_hpv2,
                vaccine_td2,
                vaccine_mr2,
                is_school_based,
                educational_level,
                is_from_other_facility,
                other_facility_name,
                lot_batch_no,
                consent_given,
                is_sick_today,
                history_of_allergies,
                is_deferred,
                is_refused,
                refusal_reason_code,
                refusal_reason_text,
                is_fully_immunized,
                vaccinator_name,
                supervisor_name,
                remarks,
                school_id,
                recorded_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27
            ) RETURNING *
        `;

        const insertResult = await pool.query<ImmunizationDbRow>(insertSql, [
            validated.student_id,
            immunizationDateStr,
            validated.immunization_type ?? 'SCHOOL & COMMUNITY BASED IMMUNIZATION',
            validated.vaccine_td1 ?? false,
            validated.vaccine_mr1 ?? false,
            validated.vaccine_hpv1 ?? false,
            validated.vaccine_hpv2 ?? false,
            validated.vaccine_td2 ?? false,
            validated.vaccine_mr2 ?? false,
            validated.is_school_based ?? true,
            validated.educational_level ?? null,
            validated.is_from_other_facility ?? false,
            validated.other_facility_name ?? null,
            validated.lot_batch_no ?? null,
            validated.consent_given ?? null,
            validated.is_sick_today ?? false,
            validated.history_of_allergies ?? null,
            validated.is_deferred ?? false,
            validated.is_refused ?? false,
            validated.refusal_reason_code ?? null,
            validated.refusal_reason_text ?? null,
            validated.is_fully_immunized ?? false,
            validated.vaccinator_name ?? null,
            validated.supervisor_name ?? null,
            validated.remarks ?? null,
            schoolId,
            req.user.id,
        ]);

        const createdRow = insertResult.rows[0];
        if (!createdRow) {
            res.status(500).json({ message: 'Failed to create immunization record' });
            return;
        }

        res.status(201).json({
            message: 'Immunization record created successfully',
            data: mapImmunizationRow(createdRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error creating immunization record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/immunization/student/:studentId
 * Get all Immunization records for a student.
 */
export const getImmunizationByStudent = async (req: Request, res: Response): Promise<void> => {
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
            SELECT * FROM IMMUNIZATION
            WHERE student_id = $1
            ORDER BY immunization_date DESC, created_at DESC
        `;
        const result = await pool.query<ImmunizationDbRow>(querySql, [studentId]);
        const mappedList = result.rows.map(mapImmunizationRow);

        res.status(200).json({
            data: {
                immunization: mappedList[0] || null,
                records: mappedList,
            },
        });
    } catch (error: unknown) {
        console.error('Error fetching immunization records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/modules/immunization/:id
 * Update an existing Immunization record.
 */
export const updateImmunization = async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ message: 'Invalid immunization record ID' });
            return;
        }

        // Verify record existence and check teacher ownership
        const checkSql = `
            SELECT im.*, s.registered_by, s.date_of_birth, s.school_id AS student_school_id
            FROM IMMUNIZATION im
            JOIN STUDENTS s ON im.student_id = s.id
            WHERE im.id = $1
        `;
        const existingRes = await pool.query(checkSql, [id]);
        if (existingRes.rows.length === 0) {
            res.status(404).json({ message: 'Immunization record not found' });
            return;
        }

        const existingRecord = existingRes.rows[0];
        if (req.user.role === 'teacher' && existingRecord.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only update records for students you registered' });
            return;
        }

        const validated = updateImmunizationSchema.parse(req.body);

        const dobStr = formatDate(existingRecord.date_of_birth);
        const immunizationDate = validated.immunization_date !== undefined
            ? formatDate(validated.immunization_date)
            : formatDate(existingRecord.immunization_date);

        // Date vs DOB check
        if (new Date(immunizationDate) < new Date(dobStr)) {
            res.status(400).json({ message: 'Invalid date: Immunization date cannot be earlier than student date of birth' });
            return;
        }

        // Merge existing and validated fields for logical validation
        const merged = {
            is_refused: validated.is_refused !== undefined ? validated.is_refused : existingRecord.is_refused,
            is_deferred: validated.is_deferred !== undefined ? validated.is_deferred : existingRecord.is_deferred,
            is_fully_immunized: validated.is_fully_immunized !== undefined ? validated.is_fully_immunized : existingRecord.is_fully_immunized,
            is_from_other_facility: validated.is_from_other_facility !== undefined ? validated.is_from_other_facility : existingRecord.is_from_other_facility,
            other_facility_name: validated.other_facility_name !== undefined ? validated.other_facility_name : existingRecord.other_facility_name,
            refusal_reason_code: validated.refusal_reason_code !== undefined ? validated.refusal_reason_code : existingRecord.refusal_reason_code,
            refusal_reason_text: validated.refusal_reason_text !== undefined ? validated.refusal_reason_text : existingRecord.refusal_reason_text,
            vaccine_td1: validated.vaccine_td1 !== undefined ? validated.vaccine_td1 : existingRecord.vaccine_td1,
            vaccine_mr1: validated.vaccine_mr1 !== undefined ? validated.vaccine_mr1 : existingRecord.vaccine_mr1,
            vaccine_hpv1: validated.vaccine_hpv1 !== undefined ? validated.vaccine_hpv1 : existingRecord.vaccine_hpv1,
            vaccine_hpv2: validated.vaccine_hpv2 !== undefined ? validated.vaccine_hpv2 : existingRecord.vaccine_hpv2,
            vaccine_td2: validated.vaccine_td2 !== undefined ? validated.vaccine_td2 : existingRecord.vaccine_td2,
            vaccine_mr2: validated.vaccine_mr2 !== undefined ? validated.vaccine_mr2 : existingRecord.vaccine_mr2,
        };

        const logicCheck = validateImmunizationLogic(merged);
        if (!logicCheck.isValid) {
            res.status(400).json({ message: logicCheck.message });
            return;
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

                if (req.user.role === 'teacher' && existingRecord.student_school_id && validated.school_id !== existingRecord.student_school_id) {
                    res.status(403).json({ message: 'Access forbidden: Teachers cannot assign records to a different school' });
                    return;
                }
                schoolId = validated.school_id;
            } else {
                schoolId = null;
            }
        }

        const immunizationType = validated.immunization_type !== undefined ? validated.immunization_type : existingRecord.immunization_type;
        const isSchoolBased = validated.is_school_based !== undefined ? validated.is_school_based : existingRecord.is_school_based;
        const educationalLevel = validated.educational_level !== undefined ? validated.educational_level : existingRecord.educational_level;
        const lotBatchNo = validated.lot_batch_no !== undefined ? validated.lot_batch_no : existingRecord.lot_batch_no;
        const consentGiven = validated.consent_given !== undefined ? validated.consent_given : existingRecord.consent_given;
        const isSickToday = validated.is_sick_today !== undefined ? validated.is_sick_today : existingRecord.is_sick_today;
        const historyOfAllergies = validated.history_of_allergies !== undefined ? validated.history_of_allergies : existingRecord.history_of_allergies;
        const vaccinatorName = validated.vaccinator_name !== undefined ? validated.vaccinator_name : existingRecord.vaccinator_name;
        const supervisorName = validated.supervisor_name !== undefined ? validated.supervisor_name : existingRecord.supervisor_name;
        const remarks = validated.remarks !== undefined ? validated.remarks : existingRecord.remarks;

        const updateSql = `
            UPDATE IMMUNIZATION
            SET
                immunization_date = $1,
                immunization_type = $2,
                vaccine_td1 = $3,
                vaccine_mr1 = $4,
                vaccine_hpv1 = $5,
                vaccine_hpv2 = $6,
                vaccine_td2 = $7,
                vaccine_mr2 = $8,
                is_school_based = $9,
                educational_level = $10,
                is_from_other_facility = $11,
                other_facility_name = $12,
                lot_batch_no = $13,
                consent_given = $14,
                is_sick_today = $15,
                history_of_allergies = $16,
                is_deferred = $17,
                is_refused = $18,
                refusal_reason_code = $19,
                refusal_reason_text = $20,
                is_fully_immunized = $21,
                vaccinator_name = $22,
                supervisor_name = $23,
                remarks = $24,
                school_id = $25,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $26
            RETURNING *
        `;

        const updateResult = await pool.query<ImmunizationDbRow>(updateSql, [
            immunizationDate,
            immunizationType,
            merged.vaccine_td1,
            merged.vaccine_mr1,
            merged.vaccine_hpv1,
            merged.vaccine_hpv2,
            merged.vaccine_td2,
            merged.vaccine_mr2,
            isSchoolBased,
            educationalLevel,
            merged.is_from_other_facility,
            merged.other_facility_name,
            lotBatchNo,
            consentGiven,
            isSickToday,
            historyOfAllergies,
            merged.is_deferred,
            merged.is_refused,
            merged.refusal_reason_code,
            merged.refusal_reason_text,
            merged.is_fully_immunized,
            vaccinatorName,
            supervisorName,
            remarks,
            schoolId,
            id,
        ]);

        const updatedRow = updateResult.rows[0];
        if (!updatedRow) {
            res.status(500).json({ message: 'Failed to update immunization record' });
            return;
        }

        res.status(200).json({
            message: 'Immunization record updated successfully',
            data: mapImmunizationRow(updatedRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error updating immunization record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/immunization/dashboard
 * Aggregated KPIs for Immunization module.
 * Access: superuser, admin
 */
export const getImmunizationDashboard = async (req: Request, res: Response): Promise<void> => {
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

        const dashboardData = await fetchImmunizationDashboard(filters);

        res.status(200).json({
            message: 'Immunization dashboard overview fetched successfully',
            data: dashboardData,
        });
    } catch (error) {
        console.error('Immunization dashboard error:', error);
        res.status(500).json({ message: 'Internal server error while generating dashboard data' });
    }
};
