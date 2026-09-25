import type { Request, Response, NextFunction } from 'express';
import pool from '../database/db.js';

/**
 * Extends the Request interface to hold the resolved school_id
 */
declare global {
    namespace Express {
        interface Request {
            targetSchoolId?: number;
        }
    }
}

const ALLOWED_TABLES = [
    'STUDENTS',
    'PATIENT_INFO',
    'ANIMAL_BITES',
    'ORAL_HEALTH',
    'DEWORMING',
    'VITAL_SIGNS',
    'IMMUNIZATION'
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

/**
 * Asynchronously resolves the school_id associated with a request and attaches it to req.targetSchoolId.
 * Enforces strict identifier precedence:
 * - URL parameters (:id, :studentId) are authoritative over any body values.
 * - For STUDENTS table (:id), resolves school_id directly from the STUDENTS record.
 * - For clinical tables (:id), resolves student_id from the record, then school_id from STUDENTS.
 * - For history routes (:studentId), resolves school_id from STUDENTS.
 * - For clinical creation routes, resolves school_id from STUDENTS using req.body.student_id (ignoring any body school_id).
 * - Enforces fixed allowlist of clinical table names.
 */
export const resolveSchoolScope = (options?: { tableName?: string }) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (options?.tableName) {
                const upperTable = options.tableName.toUpperCase() as AllowedTable;
                if (!ALLOWED_TABLES.includes(upperTable)) {
                    res.status(500).json({ message: `Internal server error: Invalid table name '${options.tableName}'` });
                    return;
                }

                const recordId = Number(req.params.id);
                if (isNaN(recordId)) {
                    res.status(400).json({ message: 'Invalid record ID' });
                    return;
                }

                if (upperTable === 'STUDENTS') {
                    // Authoritative: resolve school_id directly from the STUDENTS record
                    const studentRes = await pool.query('SELECT school_id FROM STUDENTS WHERE id = $1', [recordId]);
                    if (studentRes.rows.length === 0) {
                        res.status(404).json({ message: 'Student not found' });
                        return;
                    }
                    req.targetSchoolId = studentRes.rows[0].school_id;
                    return next();
                }

                // Clinical table: resolve student_id from record, then school_id from STUDENTS
                const recordRes = await pool.query(`SELECT student_id FROM ${upperTable} WHERE id = $1`, [recordId]);
                if (recordRes.rows.length === 0) {
                    res.status(404).json({ message: 'Record not found' });
                    return;
                }

                const studentId = recordRes.rows[0].student_id;
                const studentRes = await pool.query('SELECT school_id FROM STUDENTS WHERE id = $1', [studentId]);
                if (studentRes.rows.length === 0) {
                    res.status(404).json({ message: 'Associated student not found' });
                    return;
                }

                req.targetSchoolId = studentRes.rows[0].school_id;
                return next();
            }

            // No tableName provided: check authoritative sources by precedence
            let studentId: number | null = null;

            if (req.params.studentId) {
                // Authoritative URL studentId parameter
                studentId = Number(req.params.studentId);
            } else if (req.body && req.body.student_id !== undefined && req.body.student_id !== null) {
                // Authoritative body student_id for creation
                studentId = Number(req.body.student_id);
            }

            if (!studentId || isNaN(studentId)) {
                // Cannot resolve studentId; pass to requireSchoolScope which will reject if scope is required
                return next();
            }

            const studentRes = await pool.query('SELECT school_id FROM STUDENTS WHERE id = $1', [studentId]);
            if (studentRes.rows.length === 0) {
                res.status(404).json({ message: 'Associated student not found' });
                return;
            }

            req.targetSchoolId = studentRes.rows[0].school_id;
            next();
        } catch (error) {
            console.error('Error resolving school scope:', error);
            res.status(500).json({ message: 'Internal server error during scope resolution' });
        }
    };
};
