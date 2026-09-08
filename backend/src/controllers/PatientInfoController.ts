import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';

// Strict typing for Patient Info DB row
export interface PatientInfoDbRow {
    id: number;
    student_id: number;
    file_no: string | null;
    recorded_by: number;
    created_at: string | Date;
    updated_at: string | Date;
}

// Strict typing for Animal Bite DB row
export interface AnimalBiteDbRow {
    id: number;
    patient_info_id: number;
    student_id: number;
    rabies_exposure_category: string | null;
    anatomical_locations: string[] | Record<string, unknown> | null;
    animal_type: string | null;
    type_of_exposure: string | null;
    wash_bite: boolean | null;
    date_of_exposure: string | Date | null;
    exposure_region: string | null;
    exposure_province: string | null;
    exposure_municipality: string | null;
    exposure_barangay: string | null;
    arv_day_0: string | Date | null;
    arv_day_3: string | Date | null;
    arv_day_7: string | Date | null;
    arv_day_14: string | Date | null;
    arv_day_28: string | Date | null;
    rig_date: string | Date | null;
    is_active_case: boolean | null;
    recorded_by: number;
    created_at: string | Date;
}

// Formatted response types
export interface PatientInfoResponse {
    id: number;
    student_id: number;
    file_no?: string | undefined;
    recorded_by: number;
    created_at: string;
    updated_at: string;
}

export interface AnimalBiteResponse {
    id: number;
    patient_info_id: number;
    student_id: number;
    rabies_exposure_category?: string | undefined;
    anatomical_locations?: string[] | undefined;
    animal_type?: string | undefined;
    type_of_exposure?: string | undefined;
    wash_bite?: boolean | undefined;
    date_of_exposure?: string | undefined;
    exposure_region?: string | undefined;
    exposure_province?: string | undefined;
    exposure_municipality?: string | undefined;
    exposure_barangay?: string | undefined;
    arv_day_0?: string | undefined;
    arv_day_3?: string | undefined;
    arv_day_7?: string | undefined;
    arv_day_14?: string | undefined;
    arv_day_28?: string | undefined;
    rig_date?: string | undefined;
    is_active_case: boolean;
    recorded_by: number;
    created_at: string;
}

const formatDate = (val: string | Date | null | undefined): string | undefined => {
    if (!val) return undefined;
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const s = String(val).trim();
    if (s.includes('T')) return s.split('T')[0];
    return s;
};

const mapPatientInfoRow = (row: PatientInfoDbRow): PatientInfoResponse => ({
    id: row.id,
    student_id: row.student_id,
    file_no: row.file_no ?? undefined,
    recorded_by: row.recorded_by,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
});

const mapAnimalBiteRow = (row: AnimalBiteDbRow): AnimalBiteResponse => {
    let locations: string[] | undefined;
    if (Array.isArray(row.anatomical_locations)) {
        locations = row.anatomical_locations.map(String);
    } else if (row.anatomical_locations && typeof row.anatomical_locations === 'object') {
        locations = Object.keys(row.anatomical_locations).filter(k => (row.anatomical_locations as Record<string, unknown>)[k]);
    }

    return {
        id: row.id,
        patient_info_id: row.patient_info_id,
        student_id: row.student_id,
        rabies_exposure_category: row.rabies_exposure_category ?? undefined,
        anatomical_locations: locations,
        animal_type: row.animal_type ?? undefined,
        type_of_exposure: row.type_of_exposure ?? undefined,
        wash_bite: row.wash_bite === null ? undefined : Boolean(row.wash_bite),
        date_of_exposure: formatDate(row.date_of_exposure),
        exposure_region: row.exposure_region ?? undefined,
        exposure_province: row.exposure_province ?? undefined,
        exposure_municipality: row.exposure_municipality ?? undefined,
        exposure_barangay: row.exposure_barangay ?? undefined,
        arv_day_0: formatDate(row.arv_day_0),
        arv_day_3: formatDate(row.arv_day_3),
        arv_day_7: formatDate(row.arv_day_7),
        arv_day_14: formatDate(row.arv_day_14),
        arv_day_28: formatDate(row.arv_day_28),
        rig_date: formatDate(row.rig_date),
        is_active_case: Boolean(row.is_active_case),
        recorded_by: row.recorded_by,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
};

// Zod schemas
const animalBiteSchema = z.object({
    id: z.number().int().positive().optional(),
    rabies_exposure_category: z.string().max(20).optional().nullable(),
    anatomical_locations: z.array(z.string()).optional().nullable(),
    animal_type: z.string().max(50).optional().nullable(),
    type_of_exposure: z.string().max(500).optional().nullable(),
    wash_bite: z.boolean().optional().nullable(),
    date_of_exposure: z.string().optional().nullable(),
    exposure_region: z.string().max(100).optional().nullable(),
    exposure_province: z.string().max(100).optional().nullable(),
    exposure_municipality: z.string().max(100).optional().nullable(),
    exposure_barangay: z.string().max(100).optional().nullable(),
    arv_day_0: z.string().optional().nullable(),
    arv_day_3: z.string().optional().nullable(),
    arv_day_7: z.string().optional().nullable(),
    arv_day_14: z.string().optional().nullable(),
    arv_day_28: z.string().optional().nullable(),
    rig_date: z.string().optional().nullable(),
    is_active_case: z.boolean().optional(),
});

const createPatientInfoSchema = z.object({
    student_id: z.number().int().positive(),
    file_no: z.string().max(50).optional().nullable(),
    animal_bite: animalBiteSchema.optional().nullable(),
});

const updatePatientInfoSchema = z.object({
    file_no: z.string().max(50).optional().nullable(),
    animal_bite: animalBiteSchema.optional().nullable(),
});

const standaloneAnimalBiteSchema = animalBiteSchema.extend({
    patient_info_id: z.number().int().positive(),
    student_id: z.number().int().positive(),
});

/**
 * POST /api/modules/patient-info
 * Create a Patient Info record for a student, optionally creating an Animal Bite record in the same transaction.
 */
export const createPatientInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const validated = createPatientInfoSchema.parse(req.body);

        // Verify student existence and authorization
        const studentRes = await pool.query('SELECT id, registered_by FROM STUDENTS WHERE id = $1', [validated.student_id]);
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only record information for students you registered' });
            return;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const insertPatientInfoSql = `
                INSERT INTO PATIENT_INFO (student_id, file_no, recorded_by)
                VALUES ($1, $2, $3)
                RETURNING *
            `;
            const patientInfoResult = await client.query<PatientInfoDbRow>(insertPatientInfoSql, [
                validated.student_id,
                validated.file_no || null,
                req.user.id,
            ]);
            const createdPatientInfo = patientInfoResult.rows[0];
            if (!createdPatientInfo) {
                throw new Error('Failed to create patient info record');
            }

            let createdAnimalBite: AnimalBiteResponse | undefined;
            if (validated.animal_bite) {
                const b = validated.animal_bite;
                const insertAnimalBiteSql = `
                    INSERT INTO ANIMAL_BITES (
                        patient_info_id,
                        student_id,
                        rabies_exposure_category,
                        anatomical_locations,
                        animal_type,
                        type_of_exposure,
                        wash_bite,
                        date_of_exposure,
                        exposure_region,
                        exposure_province,
                        exposure_municipality,
                        exposure_barangay,
                        arv_day_0,
                        arv_day_3,
                        arv_day_7,
                        arv_day_14,
                        arv_day_28,
                        rig_date,
                        is_active_case,
                        recorded_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                    RETURNING *
                `;
                const biteResult = await client.query<AnimalBiteDbRow>(insertAnimalBiteSql, [
                    createdPatientInfo.id,
                    validated.student_id,
                    b.rabies_exposure_category || null,
                    b.anatomical_locations ? JSON.stringify(b.anatomical_locations) : null,
                    b.animal_type || null,
                    b.type_of_exposure || null,
                    b.wash_bite !== undefined ? b.wash_bite : null,
                    b.date_of_exposure ? formatDate(b.date_of_exposure) : null,
                    b.exposure_region || null,
                    b.exposure_province || null,
                    b.exposure_municipality || null,
                    b.exposure_barangay || null,
                    b.arv_day_0 ? formatDate(b.arv_day_0) : null,
                    b.arv_day_3 ? formatDate(b.arv_day_3) : null,
                    b.arv_day_7 ? formatDate(b.arv_day_7) : null,
                    b.arv_day_14 ? formatDate(b.arv_day_14) : null,
                    b.arv_day_28 ? formatDate(b.arv_day_28) : null,
                    b.rig_date ? formatDate(b.rig_date) : null,
                    b.is_active_case ?? false,
                    req.user.id,
                ]);
                const createdBiteRow = biteResult.rows[0];
                if (createdBiteRow) {
                    createdAnimalBite = mapAnimalBiteRow(createdBiteRow);
                }
            }

            await client.query('COMMIT');

            res.status(201).json({
                message: 'Patient info created successfully',
                data: {
                    patient_info: mapPatientInfoRow(createdPatientInfo),
                    animal_bite: createdAnimalBite,
                },
            });
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error creating patient info:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/modules/patient-info/student/:studentId
 * Get Patient Info and Animal Bite records by student ID.
 */
export const getPatientInfoByStudent = async (req: Request, res: Response): Promise<void> => {
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

        const [patientInfoRes, animalBitesRes] = await Promise.all([
            pool.query<PatientInfoDbRow>('SELECT * FROM PATIENT_INFO WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
            pool.query<AnimalBiteDbRow>('SELECT * FROM ANIMAL_BITES WHERE student_id = $1 ORDER BY created_at DESC', [studentId]),
        ]);

        const patientInfoList = patientInfoRes.rows.map(mapPatientInfoRow);
        const animalBitesList = animalBitesRes.rows.map(mapAnimalBiteRow);

        res.status(200).json({
            data: {
                patient_info: patientInfoList[0] || null,
                all_patient_records: patientInfoList,
                animal_bites: animalBitesList,
            },
        });
    } catch (error: unknown) {
        console.error('Error fetching patient info:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/modules/patient-info/:id
 * Update a Patient Info record and optionally create/update associated Animal Bite record.
 */
export const updatePatientInfo = async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ message: 'Invalid patient info ID' });
            return;
        }

        // Verify patient info exists and get student ownership
        const existingQuery = `
            SELECT pi.*, s.registered_by
            FROM PATIENT_INFO pi
            JOIN STUDENTS s ON pi.student_id = s.id
            WHERE pi.id = $1
        `;
        const existingRes = await pool.query(existingQuery, [id]);
        if (existingRes.rows.length === 0) {
            res.status(404).json({ message: 'Patient info record not found' });
            return;
        }

        const existingRecord = existingRes.rows[0];
        if (req.user.role === 'teacher' && existingRecord.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only update records for students you registered' });
            return;
        }

        const validated = updatePatientInfoSchema.parse(req.body);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updateSql = `
                UPDATE PATIENT_INFO
                SET file_no = COALESCE($1, file_no),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `;
            const updatedRes = await client.query<PatientInfoDbRow>(updateSql, [
                validated.file_no !== undefined ? validated.file_no : existingRecord.file_no,
                id,
            ]);
            const updatedPatientInfo = updatedRes.rows[0];
            if (!updatedPatientInfo) {
                throw new Error('Failed to update patient info record');
            }

            let updatedAnimalBite: AnimalBiteResponse | undefined;
            if (validated.animal_bite) {
                const b = validated.animal_bite;
                if (b.id) {
                    // Update existing animal bite
                    const updateBiteSql = `
                        UPDATE ANIMAL_BITES
                        SET rabies_exposure_category = COALESCE($1, rabies_exposure_category),
                            anatomical_locations = COALESCE($2, anatomical_locations),
                            animal_type = COALESCE($3, animal_type),
                            type_of_exposure = COALESCE($4, type_of_exposure),
                            wash_bite = COALESCE($5, wash_bite),
                            date_of_exposure = COALESCE($6, date_of_exposure),
                            exposure_region = COALESCE($7, exposure_region),
                            exposure_province = COALESCE($8, exposure_province),
                            exposure_municipality = COALESCE($9, exposure_municipality),
                            exposure_barangay = COALESCE($10, exposure_barangay),
                            arv_day_0 = COALESCE($11, arv_day_0),
                            arv_day_3 = COALESCE($12, arv_day_3),
                            arv_day_7 = COALESCE($13, arv_day_7),
                            arv_day_14 = COALESCE($14, arv_day_14),
                            arv_day_28 = COALESCE($15, arv_day_28),
                            rig_date = COALESCE($16, rig_date),
                            is_active_case = COALESCE($17, is_active_case)
                        WHERE id = $18 AND patient_info_id = $19
                        RETURNING *
                    `;
                    const biteRes = await client.query<AnimalBiteDbRow>(updateBiteSql, [
                        b.rabies_exposure_category || null,
                        b.anatomical_locations ? JSON.stringify(b.anatomical_locations) : null,
                        b.animal_type || null,
                        b.type_of_exposure || null,
                        b.wash_bite !== undefined ? b.wash_bite : null,
                        b.date_of_exposure ? formatDate(b.date_of_exposure) : null,
                        b.exposure_region || null,
                        b.exposure_province || null,
                        b.exposure_municipality || null,
                        b.exposure_barangay || null,
                        b.arv_day_0 ? formatDate(b.arv_day_0) : null,
                        b.arv_day_3 ? formatDate(b.arv_day_3) : null,
                        b.arv_day_7 ? formatDate(b.arv_day_7) : null,
                        b.arv_day_14 ? formatDate(b.arv_day_14) : null,
                        b.arv_day_28 ? formatDate(b.arv_day_28) : null,
                        b.rig_date ? formatDate(b.rig_date) : null,
                        b.is_active_case !== undefined ? b.is_active_case : null,
                        b.id,
                        id,
                    ]);
                    if (biteRes.rows[0]) {
                        updatedAnimalBite = mapAnimalBiteRow(biteRes.rows[0]);
                    }
                } else {
                    // Check if an existing bite is attached to this patient info
                    const existingBiteRes = await client.query<AnimalBiteDbRow>(
                        'SELECT * FROM ANIMAL_BITES WHERE patient_info_id = $1 ORDER BY created_at DESC LIMIT 1',
                        [id]
                    );
                    const existingBite = existingBiteRes.rows[0];
                    if (existingBite) {
                        const biteId = existingBite.id;
                        const updateBiteSql = `
                            UPDATE ANIMAL_BITES
                            SET rabies_exposure_category = COALESCE($1, rabies_exposure_category),
                                anatomical_locations = COALESCE($2, anatomical_locations),
                                animal_type = COALESCE($3, animal_type),
                                type_of_exposure = COALESCE($4, type_of_exposure),
                                wash_bite = COALESCE($5, wash_bite),
                                date_of_exposure = COALESCE($6, date_of_exposure),
                                exposure_region = COALESCE($7, exposure_region),
                                exposure_province = COALESCE($8, exposure_province),
                                exposure_municipality = COALESCE($9, exposure_municipality),
                                exposure_barangay = COALESCE($10, exposure_barangay),
                                arv_day_0 = COALESCE($11, arv_day_0),
                                arv_day_3 = COALESCE($12, arv_day_3),
                                arv_day_7 = COALESCE($13, arv_day_7),
                                arv_day_14 = COALESCE($14, arv_day_14),
                                arv_day_28 = COALESCE($15, arv_day_28),
                                rig_date = COALESCE($16, rig_date),
                                is_active_case = COALESCE($17, is_active_case)
                            WHERE id = $18
                            RETURNING *
                        `;
                        const biteRes = await client.query<AnimalBiteDbRow>(updateBiteSql, [
                            b.rabies_exposure_category || null,
                            b.anatomical_locations ? JSON.stringify(b.anatomical_locations) : null,
                            b.animal_type || null,
                            b.type_of_exposure || null,
                            b.wash_bite !== undefined ? b.wash_bite : null,
                            b.date_of_exposure ? formatDate(b.date_of_exposure) : null,
                            b.exposure_region || null,
                            b.exposure_province || null,
                            b.exposure_municipality || null,
                            b.exposure_barangay || null,
                            b.arv_day_0 ? formatDate(b.arv_day_0) : null,
                            b.arv_day_3 ? formatDate(b.arv_day_3) : null,
                            b.arv_day_7 ? formatDate(b.arv_day_7) : null,
                            b.arv_day_14 ? formatDate(b.arv_day_14) : null,
                            b.arv_day_28 ? formatDate(b.arv_day_28) : null,
                            b.rig_date ? formatDate(b.rig_date) : null,
                            b.is_active_case !== undefined ? b.is_active_case : null,
                            biteId,
                        ]);
                        if (biteRes.rows[0]) {
                            updatedAnimalBite = mapAnimalBiteRow(biteRes.rows[0]);
                        }
                    } else {
                        // Insert new animal bite record
                        const insertBiteSql = `
                            INSERT INTO ANIMAL_BITES (
                                patient_info_id,
                                student_id,
                                rabies_exposure_category,
                                anatomical_locations,
                                animal_type,
                                type_of_exposure,
                                wash_bite,
                                date_of_exposure,
                                exposure_region,
                                exposure_province,
                                exposure_municipality,
                                exposure_barangay,
                                arv_day_0,
                                arv_day_3,
                                arv_day_7,
                                arv_day_14,
                                arv_day_28,
                                rig_date,
                                is_active_case,
                                recorded_by
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                            RETURNING *
                        `;
                        const biteRes = await client.query<AnimalBiteDbRow>(insertBiteSql, [
                            id,
                            existingRecord.student_id,
                            b.rabies_exposure_category || null,
                            b.anatomical_locations ? JSON.stringify(b.anatomical_locations) : null,
                            b.animal_type || null,
                            b.type_of_exposure || null,
                            b.wash_bite !== undefined ? b.wash_bite : null,
                            b.date_of_exposure ? formatDate(b.date_of_exposure) : null,
                            b.exposure_region || null,
                            b.exposure_province || null,
                            b.exposure_municipality || null,
                            b.exposure_barangay || null,
                            b.arv_day_0 ? formatDate(b.arv_day_0) : null,
                            b.arv_day_3 ? formatDate(b.arv_day_3) : null,
                            b.arv_day_7 ? formatDate(b.arv_day_7) : null,
                            b.arv_day_14 ? formatDate(b.arv_day_14) : null,
                            b.arv_day_28 ? formatDate(b.arv_day_28) : null,
                            b.rig_date ? formatDate(b.rig_date) : null,
                            b.is_active_case ?? false,
                            req.user.id,
                        ]);
                        if (biteRes.rows[0]) {
                            updatedAnimalBite = mapAnimalBiteRow(biteRes.rows[0]);
                        }
                    }
                }
            }

            await client.query('COMMIT');

            res.status(200).json({
                message: 'Patient info updated successfully',
                data: {
                    patient_info: mapPatientInfoRow(updatedPatientInfo),
                    animal_bite: updatedAnimalBite,
                },
            });
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error updating patient info:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /api/modules/patient-info/animal-bites
 * Create an Animal Bite record directly.
 */
export const createAnimalBite = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'admin') {
            res.status(403).json({ message: 'Access forbidden: Admins cannot access module records' });
            return;
        }

        const validated = standaloneAnimalBiteSchema.parse(req.body);

        // Verify student and ownership
        const studentRes = await pool.query('SELECT id, registered_by FROM STUDENTS WHERE id = $1', [validated.student_id]);
        if (studentRes.rows.length === 0) {
            res.status(404).json({ message: 'Student not found' });
            return;
        }

        const student = studentRes.rows[0];
        if (req.user.role === 'teacher' && student.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only record information for students you registered' });
            return;
        }

        // Verify patient info exists and matches student
        const patientInfoRes = await pool.query('SELECT id, student_id FROM PATIENT_INFO WHERE id = $1', [validated.patient_info_id]);
        if (patientInfoRes.rows.length === 0) {
            res.status(404).json({ message: 'Patient info record not found' });
            return;
        }
        if (patientInfoRes.rows[0].student_id !== validated.student_id) {
            res.status(400).json({ message: 'Patient info record does not belong to this student' });
            return;
        }

        const insertSql = `
            INSERT INTO ANIMAL_BITES (
                patient_info_id,
                student_id,
                rabies_exposure_category,
                anatomical_locations,
                animal_type,
                type_of_exposure,
                wash_bite,
                date_of_exposure,
                exposure_region,
                exposure_province,
                exposure_municipality,
                exposure_barangay,
                arv_day_0,
                arv_day_3,
                arv_day_7,
                arv_day_14,
                arv_day_28,
                rig_date,
                is_active_case,
                recorded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            RETURNING *
        `;
        const result = await pool.query<AnimalBiteDbRow>(insertSql, [
            validated.patient_info_id,
            validated.student_id,
            validated.rabies_exposure_category || null,
            validated.anatomical_locations ? JSON.stringify(validated.anatomical_locations) : null,
            validated.animal_type || null,
            validated.type_of_exposure || null,
            validated.wash_bite !== undefined ? validated.wash_bite : null,
            validated.date_of_exposure ? formatDate(validated.date_of_exposure) : null,
            validated.exposure_region || null,
            validated.exposure_province || null,
            validated.exposure_municipality || null,
            validated.exposure_barangay || null,
            validated.arv_day_0 ? formatDate(validated.arv_day_0) : null,
            validated.arv_day_3 ? formatDate(validated.arv_day_3) : null,
            validated.arv_day_7 ? formatDate(validated.arv_day_7) : null,
            validated.arv_day_14 ? formatDate(validated.arv_day_14) : null,
            validated.arv_day_28 ? formatDate(validated.arv_day_28) : null,
            validated.rig_date ? formatDate(validated.rig_date) : null,
            validated.is_active_case ?? false,
            req.user.id,
        ]);

        const createdBite = result.rows[0];
        if (!createdBite) {
            throw new Error('Failed to create animal bite record');
        }

        res.status(201).json({
            message: 'Animal bite record created successfully',
            data: mapAnimalBiteRow(createdBite),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error creating animal bite record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * PUT /api/modules/patient-info/animal-bites/:id
 * Update an Animal Bite record directly.
 */
export const updateAnimalBite = async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ message: 'Invalid animal bite ID' });
            return;
        }

        const existingQuery = `
            SELECT ab.*, s.registered_by
            FROM ANIMAL_BITES ab
            JOIN STUDENTS s ON ab.student_id = s.id
            WHERE ab.id = $1
        `;
        const existingRes = await pool.query(existingQuery, [id]);
        if (existingRes.rows.length === 0) {
            res.status(404).json({ message: 'Animal bite record not found' });
            return;
        }

        const existing = existingRes.rows[0];
        if (req.user.role === 'teacher' && existing.registered_by !== req.user.id) {
            res.status(403).json({ message: 'Access forbidden: You can only update records for students you registered' });
            return;
        }

        const validated = animalBiteSchema.parse(req.body);

        const updateSql = `
            UPDATE ANIMAL_BITES
            SET rabies_exposure_category = COALESCE($1, rabies_exposure_category),
                anatomical_locations = COALESCE($2, anatomical_locations),
                animal_type = COALESCE($3, animal_type),
                type_of_exposure = COALESCE($4, type_of_exposure),
                wash_bite = COALESCE($5, wash_bite),
                date_of_exposure = COALESCE($6, date_of_exposure),
                exposure_region = COALESCE($7, exposure_region),
                exposure_province = COALESCE($8, exposure_province),
                exposure_municipality = COALESCE($9, exposure_municipality),
                exposure_barangay = COALESCE($10, exposure_barangay),
                arv_day_0 = COALESCE($11, arv_day_0),
                arv_day_3 = COALESCE($12, arv_day_3),
                arv_day_7 = COALESCE($13, arv_day_7),
                arv_day_14 = COALESCE($14, arv_day_14),
                arv_day_28 = COALESCE($15, arv_day_28),
                rig_date = COALESCE($16, rig_date),
                is_active_case = COALESCE($17, is_active_case)
            WHERE id = $18
            RETURNING *
        `;
        const result = await pool.query<AnimalBiteDbRow>(updateSql, [
            validated.rabies_exposure_category || null,
            validated.anatomical_locations ? JSON.stringify(validated.anatomical_locations) : null,
            validated.animal_type || null,
            validated.type_of_exposure || null,
            validated.wash_bite !== undefined ? validated.wash_bite : null,
            validated.date_of_exposure ? formatDate(validated.date_of_exposure) : null,
            validated.exposure_region || null,
            validated.exposure_province || null,
            validated.exposure_municipality || null,
            validated.exposure_barangay || null,
            validated.arv_day_0 ? formatDate(validated.arv_day_0) : null,
            validated.arv_day_3 ? formatDate(validated.arv_day_3) : null,
            validated.arv_day_7 ? formatDate(validated.arv_day_7) : null,
            validated.arv_day_14 ? formatDate(validated.arv_day_14) : null,
            validated.arv_day_28 ? formatDate(validated.arv_day_28) : null,
            validated.rig_date ? formatDate(validated.rig_date) : null,
            validated.is_active_case !== undefined ? validated.is_active_case : null,
            id,
        ]);

        const updatedBite = result.rows[0];
        if (!updatedBite) {
            throw new Error('Failed to update animal bite record');
        }

        res.status(200).json({
            message: 'Animal bite record updated successfully',
            data: mapAnimalBiteRow(updatedBite),
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Validation failed', errors: error.issues });
            return;
        }
        console.error('Error updating animal bite record:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
