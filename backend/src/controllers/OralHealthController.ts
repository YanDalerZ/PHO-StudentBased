import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import {
    dashboardFiltersSchema,
    validateGeographyHierarchy,
    getOralHealthDashboard as fetchOralHealthDashboard,
} from '../services/dashboard.service.js';

// Strict typing for Oral Health DB row
export interface OralHealthDbRow {
    id: number;
    student_id: number;
    date_examined: string | Date;
    is_pregnant: boolean | null;
    has_oral_screening: boolean | null;
    has_risk_assessment: boolean | null;
    has_oral_prophylaxis: boolean | null;
    has_counseling: boolean | null;
    has_fluoride_varnish: boolean | null;
    is_rpoc_complete: boolean | null;
    service_location: 'FACILITY' | 'NON-FACILITY' | null;
    visit_type: '1ST VISIT' | '2ND VISIT' | null;
    administered_by: string | null;
    remarks: string | null;
    recorded_by: number;
    created_at: string | Date;
    updated_at: string | Date;
    tooth_chart_upper: Record<string, boolean | string> | null;
    tooth_chart_lower: Record<string, boolean | string> | null;
    oral_health_condition: string | null;
    no_of_perm_teeth: number | null;
    no_of_perm_sound_teeth: number | null;
    no_of_decayed_teeth: number | null;
    no_of_missing_teeth: number | null;
    no_of_filled_teeth: number | null;
    total_dmft: number | null;
    no_of_primary_teeth: number | null;
    no_of_primary_sound_teeth: number | null;
    no_of_primary_decayed: number | null;
    no_of_primary_missing: number | null;
    no_of_primary_filled: number | null;
    total_dmft_primary: number | null;
    remarks_diagnosis: string | null;
    recommended_treatment: string | null;
    treatment_type: string | null;
    consent_given: boolean | null;
    consent_notes: string | null;
}

// Formatted response shape
export interface OralHealthResponse {
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
    service_location?: 'FACILITY' | 'NON-FACILITY' | undefined;
    visit_type?: '1ST VISIT' | '2ND VISIT' | undefined;
    administered_by?: string | undefined;
    remarks?: string | undefined;
    recorded_by: number;
    created_at: string;
    updated_at: string;
    tooth_chart_upper?: Record<string, boolean | string> | undefined;
    tooth_chart_lower?: Record<string, boolean | string> | undefined;
    oral_health_condition?: string | undefined;
    no_of_perm_teeth?: number | undefined;
    no_of_perm_sound_teeth?: number | undefined;
    no_of_decayed_teeth?: number | undefined;
    no_of_missing_teeth?: number | undefined;
    no_of_filled_teeth?: number | undefined;
    total_dmft?: number | undefined;
    no_of_primary_teeth?: number | undefined;
    no_of_primary_sound_teeth?: number | undefined;
    no_of_primary_decayed?: number | undefined;
    no_of_primary_missing?: number | undefined;
    no_of_primary_filled?: number | undefined;
    total_dmft_primary?: number | undefined;
    remarks_diagnosis?: string | undefined;
    recommended_treatment?: string | undefined;
    treatment_type?: string | undefined;
    consent_given: boolean;
    consent_notes?: string | undefined;
}

const formatDate = (val: string | Date | null | undefined): string => {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0] ?? '';
    const s = String(val).trim();
    if (s.includes('T')) return s.split('T')[0] ?? s;
    return s;
};

const mapOralHealthRow = (row: OralHealthDbRow): OralHealthResponse => {
    return {
        id: row.id,
        student_id: row.student_id,
        date_examined: formatDate(row.date_examined),
        is_pregnant: Boolean(row.is_pregnant),
        has_oral_screening: Boolean(row.has_oral_screening),
        has_risk_assessment: Boolean(row.has_risk_assessment),
        has_oral_prophylaxis: Boolean(row.has_oral_prophylaxis),
        has_counseling: Boolean(row.has_counseling),
        has_fluoride_varnish: Boolean(row.has_fluoride_varnish),
        is_rpoc_complete: Boolean(row.is_rpoc_complete),
        service_location: row.service_location ?? undefined,
        visit_type: row.visit_type ?? undefined,
        administered_by: row.administered_by ?? undefined,
        remarks: row.remarks ?? undefined,
        recorded_by: row.recorded_by,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        tooth_chart_upper: row.tooth_chart_upper ?? undefined,
        tooth_chart_lower: row.tooth_chart_lower ?? undefined,
        oral_health_condition: row.oral_health_condition ?? undefined,
        no_of_perm_teeth: row.no_of_perm_teeth !== null ? Number(row.no_of_perm_teeth) : undefined,
        no_of_perm_sound_teeth: row.no_of_perm_sound_teeth !== null ? Number(row.no_of_perm_sound_teeth) : undefined,
        no_of_decayed_teeth: row.no_of_decayed_teeth !== null ? Number(row.no_of_decayed_teeth) : undefined,
        no_of_missing_teeth: row.no_of_missing_teeth !== null ? Number(row.no_of_missing_teeth) : undefined,
        no_of_filled_teeth: row.no_of_filled_teeth !== null ? Number(row.no_of_filled_teeth) : undefined,
        total_dmft: row.total_dmft !== null ? Number(row.total_dmft) : undefined,
        no_of_primary_teeth: row.no_of_primary_teeth !== null ? Number(row.no_of_primary_teeth) : undefined,
        no_of_primary_sound_teeth: row.no_of_primary_sound_teeth !== null ? Number(row.no_of_primary_sound_teeth) : undefined,
        no_of_primary_decayed: row.no_of_primary_decayed !== null ? Number(row.no_of_primary_decayed) : undefined,
        no_of_primary_missing: row.no_of_primary_missing !== null ? Number(row.no_of_primary_missing) : undefined,
        no_of_primary_filled: row.no_of_primary_filled !== null ? Number(row.no_of_primary_filled) : undefined,
        total_dmft_primary: row.total_dmft_primary !== null ? Number(row.total_dmft_primary) : undefined,
        remarks_diagnosis: row.remarks_diagnosis ?? undefined,
        recommended_treatment: row.recommended_treatment ?? undefined,
        treatment_type: row.treatment_type ?? undefined,
        consent_given: Boolean(row.consent_given),
        consent_notes: row.consent_notes ?? undefined,
    };
};

const oralHealthSchema = z.object({
    student_id: z.number().int().positive().optional(),
    date_examined: z.string().min(1, 'Date examined is required'),
    is_pregnant: z.boolean().optional(),
    has_oral_screening: z.boolean().optional(),
    has_risk_assessment: z.boolean().optional(),
    has_oral_prophylaxis: z.boolean().optional(),
    has_counseling: z.boolean().optional(),
    has_fluoride_varnish: z.boolean().optional(),
    is_rpoc_complete: z.boolean().optional(),
    service_location: z.enum(['FACILITY', 'NON-FACILITY']).optional().nullable(),
    visit_type: z.enum(['1ST VISIT', '2ND VISIT']).optional().nullable(),
    administered_by: z.string().max(200).optional().nullable(),
    remarks: z.string().optional().nullable(),
    tooth_chart_upper: z.record(z.string(), z.union([z.boolean(), z.string()])).optional().nullable(),
    tooth_chart_lower: z.record(z.string(), z.union([z.boolean(), z.string()])).optional().nullable(),
    oral_health_condition: z.string().max(100).optional().nullable(),
    no_of_perm_teeth: z.number().int().min(0).optional().nullable(),
    no_of_perm_sound_teeth: z.number().int().min(0).optional().nullable(),
    no_of_decayed_teeth: z.number().int().min(0).optional().nullable(),
    no_of_missing_teeth: z.number().int().min(0).optional().nullable(),
    no_of_filled_teeth: z.number().int().min(0).optional().nullable(),
    total_dmft: z.number().int().min(0).optional().nullable(),
    no_of_primary_teeth: z.number().int().min(0).optional().nullable(),
    no_of_primary_sound_teeth: z.number().int().min(0).optional().nullable(),
    no_of_primary_decayed: z.number().int().min(0).optional().nullable(),
    no_of_primary_missing: z.number().int().min(0).optional().nullable(),
    no_of_primary_filled: z.number().int().min(0).optional().nullable(),
    total_dmft_primary: z.number().int().min(0).optional().nullable(),
    remarks_diagnosis: z.string().optional().nullable(),
    recommended_treatment: z.string().optional().nullable(),
    treatment_type: z.string().max(50).optional().nullable(),
    consent_given: z.boolean().optional(),
    consent_notes: z.string().optional().nullable(),
});

const createOralHealthSchema = oralHealthSchema.extend({
    student_id: z.number().int().positive('Valid student ID is required'),
});

const updateOralHealthSchema = oralHealthSchema.partial();

/**
 * POST /api/modules/oral-health
 * Create an Oral Health record for a student.
 */
export const createOralHealth = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const validated = createOralHealthSchema.parse(req.body);

        // Verify student existence and authorization
        const studentRes = await pool.query('SELECT id, registered_by FROM STUDENTS WHERE id = $1', [validated.student_id]);
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only record oral health for students you registered' });
            return;
        }

        // Auto-calculate DMFT totals if not explicitly provided
        const totalDmft = validated.total_dmft !== undefined && validated.total_dmft !== null
            ? validated.total_dmft
            : (validated.no_of_decayed_teeth || 0) + (validated.no_of_missing_teeth || 0) + (validated.no_of_filled_teeth || 0);

        const totalDmftPrimary = validated.total_dmft_primary !== undefined && validated.total_dmft_primary !== null
            ? validated.total_dmft_primary
            : (validated.no_of_primary_decayed || 0) + (validated.no_of_primary_missing || 0) + (validated.no_of_primary_filled || 0);

        const insertSql = `
            INSERT INTO ORAL_HEALTH (
                student_id,
                date_examined,
                is_pregnant,
                has_oral_screening,
                has_risk_assessment,
                has_oral_prophylaxis,
                has_counseling,
                has_fluoride_varnish,
                is_rpoc_complete,
                service_location,
                visit_type,
                administered_by,
                remarks,
                recorded_by,
                tooth_chart_upper,
                tooth_chart_lower,
                oral_health_condition,
                no_of_perm_teeth,
                no_of_perm_sound_teeth,
                no_of_decayed_teeth,
                no_of_missing_teeth,
                no_of_filled_teeth,
                total_dmft,
                no_of_primary_teeth,
                no_of_primary_sound_teeth,
                no_of_primary_decayed,
                no_of_primary_missing,
                no_of_primary_filled,
                total_dmft_primary,
                remarks_diagnosis,
                recommended_treatment,
                treatment_type,
                consent_given,
                consent_notes
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34
            )
            RETURNING *
        `;

        const result = await pool.query<OralHealthDbRow>(insertSql, [
            validated.student_id,
            formatDate(validated.date_examined),
            validated.is_pregnant ?? false,
            validated.has_oral_screening ?? false,
            validated.has_risk_assessment ?? false,
            validated.has_oral_prophylaxis ?? false,
            validated.has_counseling ?? false,
            validated.has_fluoride_varnish ?? false,
            validated.is_rpoc_complete ?? false,
            validated.service_location || null,
            validated.visit_type || null,
            validated.administered_by || null,
            validated.remarks || null,
            req.user.id,
            validated.tooth_chart_upper ? JSON.stringify(validated.tooth_chart_upper) : null,
            validated.tooth_chart_lower ? JSON.stringify(validated.tooth_chart_lower) : null,
            validated.oral_health_condition || null,
            validated.no_of_perm_teeth ?? null,
            validated.no_of_perm_sound_teeth ?? null,
            validated.no_of_decayed_teeth ?? null,
            validated.no_of_missing_teeth ?? null,
            validated.no_of_filled_teeth ?? null,
            totalDmft,
            validated.no_of_primary_teeth ?? null,
            validated.no_of_primary_sound_teeth ?? null,
            validated.no_of_primary_decayed ?? null,
            validated.no_of_primary_missing ?? null,
            validated.no_of_primary_filled ?? null,
            totalDmftPrimary,
            validated.remarks_diagnosis || null,
            validated.recommended_treatment || null,
            validated.treatment_type || null,
            validated.consent_given ?? false,
            validated.consent_notes || null,
        ]);

        const createdRow = result.rows[0];
        if (!createdRow) {
            throw new Error('Failed to insert oral health record');
        }

        res.status(201).json({
            message: 'Oral health record created successfully',
            data: mapOralHealthRow(createdRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error creating oral health record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/oral-health/student/:studentId
 * Retrieve Oral Health records for a specific student.
 */
export const getOralHealthByStudent = async (req: Request, res: Response): Promise<void> => {
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

        // Verify student existence and permissions
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
            SELECT * FROM ORAL_HEALTH
            WHERE student_id = $1
            ORDER BY date_examined DESC, created_at DESC
        `;
        const result = await pool.query<OralHealthDbRow>(querySql, [studentId]);
        const mappedList = result.rows.map(mapOralHealthRow);

        res.status(200).json({
            data: {
                oral_health: mappedList[0] || null,
                records: mappedList,
            },
        });
    } catch (error: unknown) {
        console.error('Error fetching oral health records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/modules/oral-health/:id
 * Update an existing Oral Health record.
 */
export const updateOralHealth = async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ message: 'Invalid oral health record ID' });
            return;
        }

        // Verify record existence and check teacher ownership of the student
        const checkSql = `
            SELECT oh.*, s.registered_by
            FROM ORAL_HEALTH oh
            JOIN STUDENTS s ON oh.student_id = s.id
            WHERE oh.id = $1
        `;
        const existingRes = await pool.query(checkSql, [id]);
        if (existingRes.rows.length === 0) {
            res.status(404).json({ message: 'Oral health record not found' });
            return;
        }

        const existingRecord = existingRes.rows[0];
        if (req.user.role === 'teacher' && existingRecord.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only update records for students you registered' });
            return;
        }

        const validated = updateOralHealthSchema.parse(req.body);

        const dateExamined = validated.date_examined !== undefined ? formatDate(validated.date_examined) : existingRecord.date_examined;
        const isPregnant = validated.is_pregnant !== undefined ? validated.is_pregnant : existingRecord.is_pregnant;
        const hasOralScreening = validated.has_oral_screening !== undefined ? validated.has_oral_screening : existingRecord.has_oral_screening;
        const hasRiskAssessment = validated.has_risk_assessment !== undefined ? validated.has_risk_assessment : existingRecord.has_risk_assessment;
        const hasOralProphylaxis = validated.has_oral_prophylaxis !== undefined ? validated.has_oral_prophylaxis : existingRecord.has_oral_prophylaxis;
        const hasCounseling = validated.has_counseling !== undefined ? validated.has_counseling : existingRecord.has_counseling;
        const hasFluorideVarnish = validated.has_fluoride_varnish !== undefined ? validated.has_fluoride_varnish : existingRecord.has_fluoride_varnish;
        const isRpocComplete = validated.is_rpoc_complete !== undefined ? validated.is_rpoc_complete : existingRecord.is_rpoc_complete;
        const serviceLocation = validated.service_location !== undefined ? validated.service_location : existingRecord.service_location;
        const visitType = validated.visit_type !== undefined ? validated.visit_type : existingRecord.visit_type;
        const administeredBy = validated.administered_by !== undefined ? validated.administered_by : existingRecord.administered_by;
        const remarks = validated.remarks !== undefined ? validated.remarks : existingRecord.remarks;

        const toothChartUpper = validated.tooth_chart_upper !== undefined
            ? (validated.tooth_chart_upper ? JSON.stringify(validated.tooth_chart_upper) : null)
            : (existingRecord.tooth_chart_upper ? JSON.stringify(existingRecord.tooth_chart_upper) : null);

        const toothChartLower = validated.tooth_chart_lower !== undefined
            ? (validated.tooth_chart_lower ? JSON.stringify(validated.tooth_chart_lower) : null)
            : (existingRecord.tooth_chart_lower ? JSON.stringify(existingRecord.tooth_chart_lower) : null);

        const oralHealthCondition = validated.oral_health_condition !== undefined ? validated.oral_health_condition : existingRecord.oral_health_condition;
        const noOfPermTeeth = validated.no_of_perm_teeth !== undefined ? validated.no_of_perm_teeth : existingRecord.no_of_perm_teeth;
        const noOfPermSoundTeeth = validated.no_of_perm_sound_teeth !== undefined ? validated.no_of_perm_sound_teeth : existingRecord.no_of_perm_sound_teeth;
        const noOfDecayedTeeth = validated.no_of_decayed_teeth !== undefined ? validated.no_of_decayed_teeth : existingRecord.no_of_decayed_teeth;
        const noOfMissingTeeth = validated.no_of_missing_teeth !== undefined ? validated.no_of_missing_teeth : existingRecord.no_of_missing_teeth;
        const noOfFilledTeeth = validated.no_of_filled_teeth !== undefined ? validated.no_of_filled_teeth : existingRecord.no_of_filled_teeth;

        const totalDmft = validated.total_dmft !== undefined && validated.total_dmft !== null
            ? validated.total_dmft
            : (noOfDecayedTeeth || 0) + (noOfMissingTeeth || 0) + (noOfFilledTeeth || 0);

        const noOfPrimaryTeeth = validated.no_of_primary_teeth !== undefined ? validated.no_of_primary_teeth : existingRecord.no_of_primary_teeth;
        const noOfPrimarySoundTeeth = validated.no_of_primary_sound_teeth !== undefined ? validated.no_of_primary_sound_teeth : existingRecord.no_of_primary_sound_teeth;
        const noOfPrimaryDecayed = validated.no_of_primary_decayed !== undefined ? validated.no_of_primary_decayed : existingRecord.no_of_primary_decayed;
        const noOfPrimaryMissing = validated.no_of_primary_missing !== undefined ? validated.no_of_primary_missing : existingRecord.no_of_primary_missing;
        const noOfPrimaryFilled = validated.no_of_primary_filled !== undefined ? validated.no_of_primary_filled : existingRecord.no_of_primary_filled;

        const totalDmftPrimary = validated.total_dmft_primary !== undefined && validated.total_dmft_primary !== null
            ? validated.total_dmft_primary
            : (noOfPrimaryDecayed || 0) + (noOfPrimaryMissing || 0) + (noOfPrimaryFilled || 0);

        const remarksDiagnosis = validated.remarks_diagnosis !== undefined ? validated.remarks_diagnosis : existingRecord.remarks_diagnosis;
        const recommendedTreatment = validated.recommended_treatment !== undefined ? validated.recommended_treatment : existingRecord.recommended_treatment;
        const treatmentType = validated.treatment_type !== undefined ? validated.treatment_type : existingRecord.treatment_type;
        const consentGiven = validated.consent_given !== undefined ? validated.consent_given : existingRecord.consent_given;
        const consentNotes = validated.consent_notes !== undefined ? validated.consent_notes : existingRecord.consent_notes;

        const updateSql = `
            UPDATE ORAL_HEALTH SET
                date_examined = $1,
                is_pregnant = $2,
                has_oral_screening = $3,
                has_risk_assessment = $4,
                has_oral_prophylaxis = $5,
                has_counseling = $6,
                has_fluoride_varnish = $7,
                is_rpoc_complete = $8,
                service_location = $9,
                visit_type = $10,
                administered_by = $11,
                remarks = $12,
                tooth_chart_upper = $13,
                tooth_chart_lower = $14,
                oral_health_condition = $15,
                no_of_perm_teeth = $16,
                no_of_perm_sound_teeth = $17,
                no_of_decayed_teeth = $18,
                no_of_missing_teeth = $19,
                no_of_filled_teeth = $20,
                total_dmft = $21,
                no_of_primary_teeth = $22,
                no_of_primary_sound_teeth = $23,
                no_of_primary_decayed = $24,
                no_of_primary_missing = $25,
                no_of_primary_filled = $26,
                total_dmft_primary = $27,
                remarks_diagnosis = $28,
                recommended_treatment = $29,
                treatment_type = $30,
                consent_given = $31,
                consent_notes = $32,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $33
            RETURNING *
        `;

        const result = await pool.query<OralHealthDbRow>(updateSql, [
            dateExamined,
            isPregnant,
            hasOralScreening,
            hasRiskAssessment,
            hasOralProphylaxis,
            hasCounseling,
            hasFluorideVarnish,
            isRpocComplete,
            serviceLocation,
            visitType,
            administeredBy,
            remarks,
            toothChartUpper,
            toothChartLower,
            oralHealthCondition,
            noOfPermTeeth,
            noOfPermSoundTeeth,
            noOfDecayedTeeth,
            noOfMissingTeeth,
            noOfFilledTeeth,
            totalDmft,
            noOfPrimaryTeeth,
            noOfPrimarySoundTeeth,
            noOfPrimaryDecayed,
            noOfPrimaryMissing,
            noOfPrimaryFilled,
            totalDmftPrimary,
            remarksDiagnosis,
            recommendedTreatment,
            treatmentType,
            consentGiven,
            consentNotes,
            id,
        ]);

        const updatedRow = result.rows[0];
        if (!updatedRow) {
            throw new Error('Failed to update oral health record');
        }

        res.status(200).json({
            message: 'Oral health record updated successfully',
            data: mapOralHealthRow(updatedRow),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error updating oral health record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/oral-health/dashboard
 * Aggregated KPIs for Oral Health module (RPOC-based).
 * Access: superuser, admin
 */
export const getOralHealthDashboard = async (req: Request, res: Response): Promise<void> => {
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

        // Validate geographic hierarchy
        const geoValidation = await validateGeographyHierarchy(filters);
        if (!geoValidation.valid) {
            res.status(400).json({
                message: 'Invalid geography hierarchy',
                error: geoValidation.error,
            });
            return;
        }

        const dashboardData = await fetchOralHealthDashboard(filters);

        res.status(200).json({
            message: 'Oral Health dashboard overview fetched successfully',
            data: dashboardData,
        });
    } catch (error) {
        console.error('Oral Health dashboard error:', error);
        res.status(500).json({ message: 'Internal server error while generating dashboard data' });
    }
};
