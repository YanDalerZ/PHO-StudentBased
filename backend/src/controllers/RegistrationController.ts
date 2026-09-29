import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import pool from '../database/db.js';
import { buildRegistrationUrl, readPublicRegistrationPolicy } from '../config/publicRegistration.js';
import { AuditService } from '../services/AuditService.js';
import {
    invitationCreateSchema,
    invitationListQuerySchema,
    publicFormDefinition,
    publicRegistrationPayloadSchema,
    rejectionDecisionSchema,
    registrationRejectionReasons,
    submissionDecisionSchema,
    submissionListQuerySchema,
    type PublicRegistrationPayload,
} from '../types/registration.types.js';

type JsonRecord = Record<string, unknown>;

interface InvitationRow {
    id: number;
    token_hash: string;
    school_id: number;
    school_name?: string;
    district?: string | null;
    barangay_id?: number;
    barangay_name?: string;
    municipality_id?: number;
    municipality_name?: string;
    created_by: number;
    expires_at: string | Date;
    status: 'active' | 'revoked' | 'expired';
    submission_limit: number;
    submission_count: number;
    revoked_at?: string | Date | null;
    revocation_reason?: string | null;
    created_at: string | Date;
}

interface SubmissionRow {
    id: number;
    invitation_id: number;
    school_id: number;
    school_name?: string;
    payload: PublicRegistrationPayload;
    payload_schema_version: string;
    status: 'pending' | 'approved' | 'rejected';
    duplicate_match_summary: JsonRecord | null;
    reviewed_by: number | null;
    reviewed_at: string | Date | null;
    decision_reason: string | null;
    created_student_id: number | null;
    submitted_at: string | Date;
}

interface DuplicateCandidate {
    id: number;
    student_lrn: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    date_of_birth: string | Date;
    sex: 'Male' | 'Female';
    school_id: number;
    school_name: string;
    grade_level: string | null;
    section: string | null;
    parent_guardian_name: string | null;
    parent_guardian_contact: string | null;
    match_reasons: string[];
    confidence: 'exact' | 'probable';
}

interface DuplicateReview {
    has_exact_lrn_match: boolean;
    has_pending_lrn_match: boolean;
    has_probable_match: boolean;
    is_possible_duplicate: boolean;
    candidates: DuplicateCandidate[];
}

function validationError(res: Response, error: z.ZodError): void {
    res.status(400).json({
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            fieldErrors: error.flatten().fieldErrors,
        },
    });
}

function errorResponse(res: Response, status: number, code: string, message: string): void {
    res.status(status).json({ error: { code, message } });
}

function postgresError(error: unknown): { code: string | undefined; constraint: string | undefined } {
    if (!error || typeof error !== 'object') return { code: undefined, constraint: undefined };
    const candidate = error as { code?: unknown; constraint?: unknown };
    return {
        code: typeof candidate.code === 'string' ? candidate.code : undefined,
        constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
    };
}

async function idempotencyReplayState(
    key: string,
    invitationId: number,
    payload: PublicRegistrationPayload,
): Promise<'match' | 'conflict' | 'missing'> {
    const result = await pool.query<{ invitation_id: number; same_payload: boolean }>(`
        SELECT invitation_id, payload = $2::jsonb AS same_payload
        FROM REGISTRATION_SUBMISSIONS
        WHERE idempotency_key = $1
    `, [key, payload]);
    const prior = result.rows[0];
    if (!prior) return 'missing';
    return prior.invitation_id === invitationId && prior.same_payload ? 'match' : 'conflict';
}

function paramValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function parseId(value: string | string[] | undefined): number | null {
    value = paramValue(value);
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function hasSchoolAccess(req: Request, schoolId: number): boolean {
    return req.effectiveAccess?.assignedSchoolIds.includes(schoolId) ?? false;
}

async function rollback(client: PoolClient): Promise<void> {
    try {
        await client.query('ROLLBACK');
    } catch {
        // Preserve the original failure.
    }
}

async function duplicateReviewForSubmission(
    client: PoolClient,
    submission: SubmissionRow,
): Promise<DuplicateReview> {
    const data = submission.payload;
    const exact = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
            SELECT 1 FROM STUDENTS WHERE student_lrn = $1
        ) AS exists
    `, [data.student_lrn]);
    const pending = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
            SELECT 1 FROM REGISTRATION_SUBMISSIONS
            WHERE id <> $1 AND status = 'pending'
              AND BTRIM(payload->>'student_lrn') = BTRIM($2)
        ) AS exists
    `, [submission.id, data.student_lrn]);
    const candidates = await client.query<DuplicateCandidate>(`
        SELECT st.id, st.student_lrn, st.first_name, st.middle_name, st.last_name,
               st.suffix, st.date_of_birth, st.sex, st.school_id, sc.name AS school_name,
               st.grade_level, st.section, st.parent_guardian_name,
               st.parent_guardian_contact,
               CASE
                   WHEN st.student_lrn = $1 THEN ARRAY['exact_lrn']::text[]
                   ELSE ARRAY['normalized_name', 'date_of_birth', 'school']::text[]
               END AS match_reasons,
               CASE WHEN st.student_lrn = $1 THEN 'exact' ELSE 'probable' END AS confidence
        FROM STUDENTS st
        JOIN SCHOOLS sc ON sc.id = st.school_id
        WHERE st.school_id = $5
          AND (
              st.student_lrn = $1
              OR (
                  REGEXP_REPLACE(LOWER(BTRIM(st.first_name)), '\\s+', ' ', 'g') =
                      REGEXP_REPLACE(LOWER(BTRIM($2)), '\\s+', ' ', 'g')
                  AND REGEXP_REPLACE(LOWER(BTRIM(st.last_name)), '\\s+', ' ', 'g') =
                      REGEXP_REPLACE(LOWER(BTRIM($3)), '\\s+', ' ', 'g')
                  AND st.date_of_birth = $4
              )
          )
        ORDER BY CASE WHEN st.student_lrn = $1 THEN 0 ELSE 1 END, st.id
    `, [data.student_lrn, data.first_name, data.last_name, data.date_of_birth, submission.school_id]);
    const hasProbable = candidates.rows.some((candidate) => candidate.confidence === 'probable');
    const hasExact = Boolean(exact.rows[0]?.exists);
    const hasPending = Boolean(pending.rows[0]?.exists);
    return {
        has_exact_lrn_match: hasExact,
        has_pending_lrn_match: hasPending,
        has_probable_match: hasProbable,
        is_possible_duplicate: hasExact || hasPending || hasProbable,
        candidates: candidates.rows,
    };
}

export const generateInvitation = async (req: Request, res: Response): Promise<void> => {
    const parsed = invitationCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (!req.user || !hasSchoolAccess(req, parsed.data.school_id)) {
        return errorResponse(res, 403, 'FORBIDDEN', 'School is outside the active assignment scope');
    }

    const policy = readPublicRegistrationPolicy();
    if (!policy) {
        return errorResponse(res, 503, 'PUBLIC_REGISTRATION_POLICY_UNAVAILABLE', 'Public registration is temporarily unavailable');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const school = await client.query<{ id: number }>(`
            SELECT s.id
            FROM SCHOOLS s
            JOIN MODULES m ON m.slug = 'patient-info' AND m.is_active = TRUE
            WHERE s.id = $1 AND s.is_active = TRUE
            FOR UPDATE OF s
        `,
            [parsed.data.school_id],
        );
        if (!school.rowCount) {
            await rollback(client);
            return errorResponse(res, 422, 'SCHOOL_UNAVAILABLE', 'School or Patient Information module is unavailable');
        }

        await client.query(`
            UPDATE REGISTRATION_INVITATIONS
            SET status = 'expired'
            WHERE school_id = $1 AND status = 'active' AND expires_at <= NOW()
        `, [parsed.data.school_id]);

        const rawToken = crypto.randomBytes(16).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const result = await client.query<InvitationRow>(`
            INSERT INTO REGISTRATION_INVITATIONS
                (token_hash, school_id, created_by, expires_at, submission_limit)
            VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 day'), $5)
            RETURNING id, school_id, created_by, expires_at, status,
                      submission_limit, submission_count, created_at
        `, [tokenHash, parsed.data.school_id, req.user.id, parsed.data.expires_in_days, parsed.data.submission_limit]);

        await client.query('COMMIT');
        res.status(201).json({
            data: {
                ...result.rows[0],
                token: rawToken,
                registration_url: buildRegistrationUrl(policy, rawToken),
            },
        });
    } catch (error) {
        await rollback(client);
        const databaseError = postgresError(error);
        if (databaseError.code === '23505'
            && databaseError.constraint === 'unique_active_registration_invitation_school') {
            return errorResponse(res, 409, 'ACTIVE_INVITATION_EXISTS', 'This school already has an active invitation');
        }
        console.error('Invitation creation failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to create invitation');
    } finally {
        client.release();
    }
};

export const getInvitations = async (req: Request, res: Response): Promise<void> => {
    const parsed = invitationListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const assigned = req.effectiveAccess?.assignedSchoolIds ?? [];
    if (parsed.data.school_id && !assigned.includes(parsed.data.school_id)) {
        return errorResponse(res, 403, 'FORBIDDEN', 'School is outside the active assignment scope');
    }
    if (assigned.length === 0) {
        res.json({ data: [], meta: { page: parsed.data.page, pageSize: parsed.data.pageSize, total: 0, availableSchools: [] } });
        return;
    }

    const filters: string[] = ['i.school_id = ANY($1::int[])'];
    const params: unknown[] = [assigned];
    if (parsed.data.school_id) {
        params.push(parsed.data.school_id);
        filters.push(`i.school_id = $${params.length}`);
    }
    if (parsed.data.status) {
        params.push(parsed.data.status);
        filters.push(`i.status = $${params.length}`);
    }
    params.push(parsed.data.pageSize, (parsed.data.page - 1) * parsed.data.pageSize);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    try {
        await pool.query(`
            UPDATE REGISTRATION_INVITATIONS
            SET status = 'expired'
            WHERE school_id = ANY($1::int[]) AND status = 'active' AND expires_at <= NOW()
        `, [assigned]);
        const schools = await pool.query<{ id: number; name: string; district: string | null }>(`
            SELECT id, name, district FROM SCHOOLS
            WHERE id = ANY($1::int[]) AND is_active = TRUE
            ORDER BY name ASC
        `, [assigned]);
        const result = await pool.query<InvitationRow & { total_count: number }>(`
            SELECT i.id, i.school_id, s.name AS school_name, i.created_by,
                   i.expires_at, i.status, i.submission_limit, i.submission_count,
                   i.revoked_at, i.revocation_reason, i.created_at,
                   COUNT(*) OVER()::int AS total_count
            FROM REGISTRATION_INVITATIONS i
            JOIN SCHOOLS s ON s.id = i.school_id
            WHERE ${filters.join(' AND ')}
            ORDER BY i.created_at DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, params);
        const total = result.rows[0]?.total_count ?? 0;
        res.json({
            data: result.rows.map(({ total_count: _total, ...row }) => row),
            meta: {
                page: parsed.data.page,
                pageSize: parsed.data.pageSize,
                total,
                availableSchools: schools.rows,
            },
        });
    } catch (error) {
        console.error('Invitation listing failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to list invitations');
    }
};

export const revokeInvitation = async (req: Request, res: Response): Promise<void> => {
    const id = parseId(req.params.id);
    const reasonResult = z.strictObject({ reason: z.string().trim().min(1).max(500) }).safeParse(req.body);
    if (!id) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid invitation ID');
    if (!reasonResult.success) return validationError(res, reasonResult.error);
    if (!req.user) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');

    try {
        const invitation = await pool.query<InvitationRow>(
            'SELECT * FROM REGISTRATION_INVITATIONS WHERE id = $1',
            [id],
        );
        const row = invitation.rows[0];
        if (!row) return errorResponse(res, 404, 'NOT_FOUND', 'Invitation not found');
        if (!hasSchoolAccess(req, row.school_id)) {
            return errorResponse(res, 403, 'FORBIDDEN', 'Invitation is outside the active assignment scope');
        }
        if (row.status !== 'active') {
            return errorResponse(res, 409, 'INVITATION_NOT_ACTIVE', 'Invitation is not active');
        }
        const updated = await pool.query<InvitationRow>(`
            UPDATE REGISTRATION_INVITATIONS
            SET status = 'revoked', revoked_at = NOW(), revoked_by = $1, revocation_reason = $2
            WHERE id = $3 AND status = 'active'
            RETURNING id, school_id, created_by, expires_at, status, submission_limit,
                      submission_count, revoked_at, revocation_reason, created_at
        `, [req.user.id, reasonResult.data.reason, id]);
        res.json({ data: updated.rows[0] });
    } catch (error) {
        console.error('Invitation revocation failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to revoke invitation');
    }
};

export const getInvitationDetails = async (req: Request, res: Response): Promise<void> => {
    const token = paramValue(req.params.token);
    if (!token || !/^[a-f0-9]{32}$/i.test(token)) {
        return errorResponse(res, 404, 'INVITATION_UNAVAILABLE', 'Registration invitation is unavailable');
    }
    const policy = readPublicRegistrationPolicy();
    if (!policy) {
        return errorResponse(res, 503, 'PUBLIC_REGISTRATION_POLICY_UNAVAILABLE', 'Public registration is temporarily unavailable');
    }
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const result = await pool.query<InvitationRow>(`
            SELECT i.id, i.school_id, i.expires_at, i.status, i.submission_limit,
                   i.submission_count, s.name AS school_name, s.district, s.is_active,
                   b.id AS barangay_id, b.name AS barangay_name,
                   m2.id AS municipality_id, m2.name AS municipality_name
            FROM REGISTRATION_INVITATIONS i
            JOIN SCHOOLS s ON s.id = i.school_id
            JOIN BARANGAYS b ON b.id = s.barangay_id
            JOIN MUNICIPALITIES m2 ON m2.id = b.municipality_id
            JOIN MODULES m ON m.slug = 'patient-info'
            WHERE i.token_hash = $1 AND s.is_active = TRUE AND m.is_active = TRUE
        `, [tokenHash]);
        const invitation = result.rows[0];
        if (!invitation || invitation.status !== 'active'
            || new Date(invitation.expires_at) <= new Date()
            || invitation.submission_count >= invitation.submission_limit) {
            return errorResponse(res, 404, 'INVITATION_UNAVAILABLE', 'Registration invitation is unavailable');
        }
        res.json({
            data: {
                school: {
                    id: invitation.school_id,
                    name: invitation.school_name,
                    district: invitation.district,
                    barangay_id: invitation.barangay_id,
                    barangay_name: invitation.barangay_name,
                    municipality_id: invitation.municipality_id,
                    municipality_name: invitation.municipality_name,
                },
                expires_at: invitation.expires_at,
                form: {
                    ...publicFormDefinition,
                    privacy: {
                        notice: policy.privacyNotice,
                        retention: policy.retentionNotice,
                        contact: policy.contact,
                    },
                },
            },
        });
    } catch (error) {
        console.error('Invitation lookup failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to load invitation');
    }
};

export const submitRegistration = async (req: Request, res: Response): Promise<void> => {
    const parsed = publicRegistrationPayloadSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const token = paramValue(req.params.token);
    if (!token || !/^[a-f0-9]{32}$/i.test(token)) {
        return errorResponse(res, 404, 'INVITATION_UNAVAILABLE', 'Registration invitation is unavailable');
    }
    const idempotencyKey = req.header('Idempotency-Key')?.trim() || null;
    if (idempotencyKey && idempotencyKey.length > 100) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Idempotency-Key is too long');
    }

    const client = await pool.connect();
    let resolvedInvitationId: number | null = null;
    try {
        await client.query('BEGIN');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const invitationResult = await client.query<InvitationRow>(`
            SELECT i.* FROM REGISTRATION_INVITATIONS i
            JOIN SCHOOLS s ON s.id = i.school_id AND s.is_active = TRUE
            JOIN MODULES m ON m.slug = 'patient-info' AND m.is_active = TRUE
            WHERE i.token_hash = $1 FOR UPDATE OF i
        `, [tokenHash]);
        const invitation = invitationResult.rows[0];
        if (!invitation || invitation.status !== 'active'
            || new Date(invitation.expires_at) <= new Date()
            || invitation.submission_count >= invitation.submission_limit) {
            await rollback(client);
            return errorResponse(res, 404, 'INVITATION_UNAVAILABLE', 'Registration invitation is unavailable');
        }
        resolvedInvitationId = invitation.id;

        if (idempotencyKey) {
            const prior = await client.query<{ invitation_id: number; same_payload: boolean }>(
                `SELECT invitation_id, payload = $2::jsonb AS same_payload
                 FROM REGISTRATION_SUBMISSIONS WHERE idempotency_key = $1`,
                [idempotencyKey, parsed.data],
            );
            if (prior.rows[0]) {
                if (prior.rows[0].invitation_id !== invitation.id || !prior.rows[0].same_payload) {
                    await rollback(client);
                    return errorResponse(
                        res,
                        409,
                        'IDEMPOTENCY_KEY_REUSED',
                        'Idempotency key was already used for a different submission',
                    );
                }
                await client.query('COMMIT');
                res.status(200).json({ data: { status: 'pending', receipt: 'Submission received for review' } });
                return;
            }
        }

        const exact = await client.query<{ id: number }>(
            'SELECT id FROM STUDENTS WHERE student_lrn = $1 LIMIT 1',
            [parsed.data.student_lrn],
        );
        const probable = await client.query<{ id: number }>(`
            SELECT id FROM STUDENTS
            WHERE LOWER(TRIM(first_name)) = LOWER(TRIM($1))
              AND LOWER(TRIM(last_name)) = LOWER(TRIM($2))
              AND date_of_birth = $3
              AND school_id = $4
        `, [parsed.data.first_name, parsed.data.last_name, parsed.data.date_of_birth, invitation.school_id]);
        const duplicateSummary = {
            exact_lrn_match: Boolean(exact.rowCount),
            probable_match_count: probable.rowCount ?? 0,
            is_possible_duplicate: Boolean(exact.rowCount || probable.rowCount),
        };
        const submission = await client.query<{ id: number }>(`
            INSERT INTO REGISTRATION_SUBMISSIONS
                (invitation_id, school_id, payload, payload_schema_version,
                 idempotency_key, duplicate_match_summary, consent_metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [invitation.id, invitation.school_id, parsed.data, publicFormDefinition.schema_version,
            idempotencyKey, duplicateSummary, {
                guardian_consent: true,
                privacy_notice_version: parsed.data.privacy_notice_version,
                recorded_at: new Date().toISOString(),
            }]);
        await client.query(
            'UPDATE REGISTRATION_INVITATIONS SET submission_count = submission_count + 1 WHERE id = $1',
            [invitation.id],
        );
        await client.query(`
            INSERT INTO REGISTRATION_SUBMISSION_EVENTS
                (submission_id, event_type, event_metadata)
            VALUES ($1, $2, $3)
        `, [submission.rows[0]?.id,
            duplicateSummary.is_possible_duplicate ? 'duplicate_flagged' : 'submitted',
            duplicateSummary]);
        await client.query('COMMIT');
        res.status(201).json({ data: { status: 'pending', receipt: 'Submission received for review' } });
    } catch (error) {
        await rollback(client);
        const databaseError = postgresError(error);
        if (databaseError.code === '23505' && idempotencyKey && resolvedInvitationId) {
            const replay = await idempotencyReplayState(idempotencyKey, resolvedInvitationId, parsed.data);
            if (replay === 'match') {
                res.status(200).json({ data: { status: 'pending', receipt: 'Submission received for review' } });
            } else if (replay === 'conflict') {
                errorResponse(
                    res,
                    409,
                    'IDEMPOTENCY_KEY_REUSED',
                    'Idempotency key was already used for a different submission',
                );
            } else if (databaseError.constraint === 'unique_pending_registration_lrn') {
                errorResponse(res, 409, 'SUBMISSION_CONFLICT', 'Submission conflicts with an item already under review');
            } else {
                errorResponse(res, 409, 'SUBMISSION_CONFLICT', 'Submission could not be accepted');
            }
        } else if (databaseError.code === '23505'
            && databaseError.constraint === 'unique_pending_registration_lrn') {
            errorResponse(res, 409, 'SUBMISSION_CONFLICT', 'Submission conflicts with an item already under review');
        } else {
            console.error('Public registration failed', error instanceof Error ? error.message : 'unknown error');
            errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to submit registration');
        }
    } finally {
        client.release();
    }
};

export const getRegistrationSubmissions = async (req: Request, res: Response): Promise<void> => {
    const parsed = submissionListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const assigned = req.effectiveAccess?.assignedSchoolIds ?? [];
    if (parsed.data.school_id && !assigned.includes(parsed.data.school_id)) {
        return errorResponse(res, 403, 'FORBIDDEN', 'School is outside the active assignment scope');
    }
    if (assigned.length === 0) {
        res.json({
            data: [],
            meta: {
                page: parsed.data.page,
                pageSize: parsed.data.pageSize,
                total: 0,
                rejectionReasons: registrationRejectionReasons,
            },
        });
        return;
    }

    const exactExpression = `EXISTS (
        SELECT 1 FROM STUDENTS exact_student
        WHERE exact_student.student_lrn = r.payload->>'student_lrn'
    )`;
    const probableExpression = `EXISTS (
        SELECT 1 FROM STUDENTS probable_student
        WHERE probable_student.school_id = r.school_id
          AND REGEXP_REPLACE(LOWER(BTRIM(probable_student.first_name)), '\\s+', ' ', 'g') =
              REGEXP_REPLACE(LOWER(BTRIM(r.payload->>'first_name')), '\\s+', ' ', 'g')
          AND REGEXP_REPLACE(LOWER(BTRIM(probable_student.last_name)), '\\s+', ' ', 'g') =
              REGEXP_REPLACE(LOWER(BTRIM(r.payload->>'last_name')), '\\s+', ' ', 'g')
          AND probable_student.date_of_birth = (r.payload->>'date_of_birth')::date
    )`;
    const pendingExpression = `EXISTS (
        SELECT 1 FROM REGISTRATION_SUBMISSIONS other_pending
        WHERE other_pending.id <> r.id AND other_pending.status = 'pending'
          AND BTRIM(other_pending.payload->>'student_lrn') = BTRIM(r.payload->>'student_lrn')
    )`;
    const filters = ['r.school_id = ANY($1::int[])', 'r.status = $2'];
    const params: unknown[] = [assigned, parsed.data.status];
    if (parsed.data.school_id) {
        params.push(parsed.data.school_id);
        filters.push(`r.school_id = $${params.length}`);
    }
    if (parsed.data.possible_duplicate) {
        const expected = parsed.data.possible_duplicate === 'true';
        params.push(expected);
        filters.push(`(${exactExpression} OR ${probableExpression} OR ${pendingExpression}) = $${params.length}`);
    }
    params.push(parsed.data.pageSize, (parsed.data.page - 1) * parsed.data.pageSize);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    try {
        const result = await pool.query<SubmissionRow & {
            total_count: number;
            has_exact_lrn_match: boolean;
            has_probable_match: boolean;
            has_pending_lrn_match: boolean;
        }>(`
            SELECT r.*, s.name AS school_name,
                   ${exactExpression} AS has_exact_lrn_match,
                   ${probableExpression} AS has_probable_match,
                   ${pendingExpression} AS has_pending_lrn_match,
                   COUNT(*) OVER()::int AS total_count
            FROM REGISTRATION_SUBMISSIONS r
            JOIN SCHOOLS s ON s.id = r.school_id
            WHERE ${filters.join(' AND ')}
            ORDER BY r.submitted_at DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, params);
        const total = result.rows[0]?.total_count ?? 0;
        res.json({
            data: result.rows.map(({
                total_count: _total,
                has_exact_lrn_match,
                has_probable_match,
                has_pending_lrn_match,
                ...row
            }) => ({
                ...row,
                duplicate_review: {
                    has_exact_lrn_match: Boolean(has_exact_lrn_match),
                    has_probable_match: Boolean(has_probable_match),
                    has_pending_lrn_match: Boolean(has_pending_lrn_match),
                    is_possible_duplicate: Boolean(
                        has_exact_lrn_match || has_probable_match || has_pending_lrn_match
                    ),
                },
            })),
            meta: {
                page: parsed.data.page,
                pageSize: parsed.data.pageSize,
                total,
                rejectionReasons: registrationRejectionReasons,
            },
        });
    } catch (error) {
        console.error('Submission listing failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to list submissions');
    }
};

export const getRegistrationSubmission = async (req: Request, res: Response): Promise<void> => {
    const id = parseId(req.params.id);
    if (!id) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid submission ID');
    const client = await pool.connect();
    try {
        const result = await client.query<SubmissionRow>(`
            SELECT r.*, s.name AS school_name
            FROM REGISTRATION_SUBMISSIONS r
            JOIN SCHOOLS s ON s.id = r.school_id
            WHERE r.id = $1
        `, [id]);
        const submission = result.rows[0];
        if (!submission) return errorResponse(res, 404, 'NOT_FOUND', 'Submission not found');
        if (!hasSchoolAccess(req, submission.school_id)) {
            return errorResponse(res, 403, 'FORBIDDEN', 'Submission is outside the active assignment scope');
        }
        const duplicateReview = await duplicateReviewForSubmission(client, submission);
        res.json({
            data: {
                ...submission,
                duplicate_review: duplicateReview,
                review_policy: { rejection_reasons: registrationRejectionReasons },
            },
        });
    } catch (error) {
        console.error('Submission lookup failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to load submission');
    } finally {
        client.release();
    }
};

export const approveSubmission = async (req: Request, res: Response): Promise<void> => {
    const id = parseId(req.params.id);
    const decision = submissionDecisionSchema.safeParse(req.body);
    if (!id) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid submission ID');
    if (!decision.success) return validationError(res, decision.error);
    if (!req.user) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query<SubmissionRow>(
            'SELECT * FROM REGISTRATION_SUBMISSIONS WHERE id = $1 FOR UPDATE',
            [id],
        );
        const submission = result.rows[0];
        if (!submission) {
            await rollback(client);
            return errorResponse(res, 404, 'NOT_FOUND', 'Submission not found');
        }
        if (!hasSchoolAccess(req, submission.school_id)) {
            await rollback(client);
            return errorResponse(res, 403, 'FORBIDDEN', 'Submission is outside the active assignment scope');
        }
        if (submission.status !== 'pending') {
            await rollback(client);
            return errorResponse(res, 409, 'ALREADY_REVIEWED', 'Submission has already been reviewed');
        }

        const duplicateReview = await duplicateReviewForSubmission(client, submission);

        let studentId: number;
        let eventType: 'approved_new' | 'merged';
        let auditAction: 'APPROVE_REGISTRATION' | 'LINK_REGISTRATION_SUBMISSION';
        let patientInfoCreated = false;
        if (decision.data.decision === 'merge') {
            const target = await client.query<{ id: number; school_id: number }>(
                'SELECT id, school_id FROM STUDENTS WHERE id = $1 AND school_id = $2 FOR UPDATE',
                [decision.data.target_student_id, submission.school_id],
            );
            if (!target.rows[0]) {
                await rollback(client);
                return errorResponse(res, 409, 'INVALID_MERGE_TARGET', 'Link target must belong to the submission school');
            }
            if (!duplicateReview.candidates.some((candidate) => candidate.id === target.rows[0]!.id)) {
                await rollback(client);
                return errorResponse(res, 409, 'INVALID_MERGE_TARGET', 'Link target is not a verified duplicate candidate');
            }
            studentId = target.rows[0].id;
            const patientInfo = await client.query<{ id: number }>(`
                INSERT INTO PATIENT_INFO (student_id, recorded_by)
                SELECT $1, $2
                WHERE NOT EXISTS (
                    SELECT 1 FROM PATIENT_INFO WHERE student_id = $1
                )
                RETURNING id
            `, [studentId, req.user.id]);
            patientInfoCreated = Boolean(patientInfo.rowCount);
            eventType = 'merged';
            auditAction = 'LINK_REGISTRATION_SUBMISSION';
        } else {
            const data = submission.payload;
            if (duplicateReview.has_exact_lrn_match || duplicateReview.has_pending_lrn_match) {
                await rollback(client);
                return errorResponse(res, 409, 'DUPLICATE_LRN', 'Submission requires duplicate review');
            }
            const student = await client.query<{ id: number }>(`
                INSERT INTO STUDENTS
                    (student_lrn, first_name, middle_name, last_name, suffix, sex, date_of_birth,
                     birth_place, civil_status, educational_attainment, employment_status, tax_id_no,
                     religion, is_indigenous, indigenous_group, blood_type, mother_first_name,
                     mother_last_name, mother_middle_name, mother_birthdate, country, region, province,
                     municipality_id, barangay_id, street_address, zip_code, email, mobile, landline,
                     psa_national_id, is_4ps_member, fourps_household_no, is_pwd, pwd_type, pwd_id,
                     is_philhealth_member, philhealth_no, philhealth_status_type, philhealth_category,
                     school_id, grade_level, section, parent_guardian_name, parent_guardian_contact,
                     registered_by)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                     $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                     $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
                     $41, $42, $43, $44, $45, $46)
                RETURNING id
            `, [data.student_lrn, data.first_name, data.middle_name, data.last_name,
                data.suffix || 'NOT APPLICABLE', data.sex, data.date_of_birth, data.birth_place,
                data.civil_status, data.educational_attainment, data.employment_status, data.tax_id_no,
                data.religion, data.is_indigenous ?? false, data.indigenous_group, data.blood_type,
                data.mother_first_name, data.mother_last_name, data.mother_middle_name,
                data.mother_birthdate || null, data.country || 'PHILIPPINES', data.region || 'REGION 6',
                data.province || 'AKLAN', data.municipality_id, data.barangay_id, data.street_address,
                data.zip_code, data.email, data.mobile, data.landline, data.psa_national_id,
                data.is_4ps_member ?? false, data.fourps_household_no, data.is_pwd ?? false,
                data.pwd_type, data.pwd_id, data.is_philhealth_member ?? false, data.philhealth_no,
                data.philhealth_status_type, data.philhealth_category, submission.school_id,
                data.grade_level, data.section, data.parent_guardian_name,
                data.parent_guardian_contact, req.user.id]);
            studentId = student.rows[0]!.id;
            await client.query(
                'INSERT INTO PATIENT_INFO (student_id, recorded_by) VALUES ($1, $2)',
                [studentId, req.user.id],
            );
            patientInfoCreated = true;
            eventType = 'approved_new';
            auditAction = 'APPROVE_REGISTRATION';
        }

        await client.query(`
            UPDATE REGISTRATION_SUBMISSIONS
            SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(),
                decision_reason = $2, created_student_id = $3
            WHERE id = $4
        `, [req.user.id, decision.data.decision_reason, studentId, id]);
        await client.query(`
            INSERT INTO REGISTRATION_SUBMISSION_EVENTS
                (submission_id, event_type, actor_id, event_metadata)
            VALUES ($1, $2, $3, $4)
        `, [id, eventType, req.user.id, {
            student_id: studentId,
            operation: decision.data.decision === 'merge' ? 'link_only' : 'create_canonical_student',
            patient_info_created: patientInfoCreated,
            decision_reason_present: true,
        }]);
        await AuditService.logEvent({
            actor_id: req.user.id,
            portal_role: req.user.portal_role,
            action: auditAction,
            entity_type: 'REGISTRATION_SUBMISSION',
            entity_id: String(id),
            school_id: submission.school_id,
            details: {
                decision: decision.data.decision,
                linked_student_id: studentId,
                merge_mode: decision.data.decision === 'merge' ? 'link_only' : null,
                patient_info_created: patientInfoCreated,
                probable_match_reviewed: duplicateReview.has_probable_match,
            },
            ip_address: req.ip,
        }, client);
        await client.query('COMMIT');
        res.json({
            data: {
                submission_id: id,
                status: 'approved',
                student_id: studentId,
                decision: decision.data.decision,
                merge_mode: decision.data.decision === 'merge' ? 'link_only' : null,
            },
        });
    } catch (error) {
        await rollback(client);
        const databaseError = postgresError(error);
        if (databaseError.code === '23505') {
            errorResponse(res, 409, 'DUPLICATE_LRN', 'Submission requires duplicate review');
        } else {
            console.error('Submission approval failed', error instanceof Error ? error.message : 'unknown error');
            errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to approve submission');
        }
    } finally {
        client.release();
    }
};

export const rejectSubmission = async (req: Request, res: Response): Promise<void> => {
    const id = parseId(req.params.id);
    const decision = rejectionDecisionSchema.safeParse(req.body);
    if (!id) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid submission ID');
    if (!decision.success) return validationError(res, decision.error);
    if (!req.user) return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query<SubmissionRow>(
            'SELECT * FROM REGISTRATION_SUBMISSIONS WHERE id = $1 FOR UPDATE',
            [id],
        );
        const submission = result.rows[0];
        if (!submission) {
            await rollback(client);
            return errorResponse(res, 404, 'NOT_FOUND', 'Submission not found');
        }
        if (!hasSchoolAccess(req, submission.school_id)) {
            await rollback(client);
            return errorResponse(res, 403, 'FORBIDDEN', 'Submission is outside the active assignment scope');
        }
        if (submission.status !== 'pending') {
            await rollback(client);
            return errorResponse(res, 409, 'ALREADY_REVIEWED', 'Submission has already been reviewed');
        }
        const storedReason = decision.data.reason_note
            ? `${decision.data.reason_code}: ${decision.data.reason_note}`
            : decision.data.reason_code;
        await client.query(`
            UPDATE REGISTRATION_SUBMISSIONS
            SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), decision_reason = $2
            WHERE id = $3
        `, [req.user.id, storedReason, id]);
        await client.query(`
            INSERT INTO REGISTRATION_SUBMISSION_EVENTS
                (submission_id, event_type, actor_id, event_metadata)
            VALUES ($1, 'rejected', $2, $3)
        `, [id, req.user.id, {
            reason_code: decision.data.reason_code,
            note_present: Boolean(decision.data.reason_note),
        }]);
        await AuditService.logEvent({
            actor_id: req.user.id,
            portal_role: req.user.portal_role,
            action: 'REJECT_REGISTRATION_SUBMISSION',
            entity_type: 'REGISTRATION_SUBMISSION',
            entity_id: String(id),
            school_id: submission.school_id,
            details: {
                reason_code: decision.data.reason_code,
                note_present: Boolean(decision.data.reason_note),
            },
            ip_address: req.ip,
        }, client);
        await client.query('COMMIT');
        res.json({ data: { submission_id: id, status: 'rejected' } });
    } catch (error) {
        await rollback(client);
        console.error('Submission rejection failed', error instanceof Error ? error.message : 'unknown error');
        errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to reject submission');
    } finally {
        client.release();
    }
};
