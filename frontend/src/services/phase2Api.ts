import api, { publicApi } from './api';
import { phase2Routes } from './phase2Routes';
export { phase2Routes } from './phase2Routes';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface RejectionReason {
    code: string;
    label: string;
}

export interface DuplicateCandidate {
    id: number;
    student_lrn: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    date_of_birth: string;
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

export interface DuplicateReview {
    has_exact_lrn_match: boolean;
    has_pending_lrn_match: boolean;
    has_probable_match: boolean;
    is_possible_duplicate: boolean;
    candidates?: DuplicateCandidate[];
}

export interface PublicRegistrationPayload {
    student_lrn: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    suffix?: string | null;
    date_of_birth: string;
    sex: 'Male' | 'Female';
    municipality_id: number;
    barangay_id: number;
    parent_guardian_name: string;
    parent_guardian_contact: string;
    guardian_consent: true;
    privacy_notice_version: 'v1';
    [field: string]: string | number | boolean | null | undefined;
}

export interface RegistrationSubmission {
    id: number;
    invitation_id: number;
    school_id: number;
    school_name: string;
    payload: PublicRegistrationPayload;
    payload_schema_version: string;
    status: RegistrationStatus;
    duplicate_match_summary: {
        exact_lrn_match?: boolean;
        probable_match_count?: number;
        is_possible_duplicate?: boolean;
    } | null;
    duplicate_review: DuplicateReview;
    review_policy?: { rejection_reasons: RejectionReason[] };
    reviewed_by: number | null;
    reviewed_at: string | null;
    decision_reason: string | null;
    created_student_id: number | null;
    submitted_at: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: { page: number; pageSize: number; total: number };
}

export interface RegistrationSubmissionListResponse extends PaginatedResponse<RegistrationSubmission> {
    meta: PaginatedResponse<RegistrationSubmission>['meta'] & { rejectionReasons: RejectionReason[] };
}

export interface RegistrationInvitation {
    id: number;
    school_id: number;
    school_name?: string;
    created_by: number;
    expires_at: string;
    status: 'active' | 'revoked' | 'expired';
    submission_limit: number;
    submission_count: number;
    revoked_at?: string | null;
    revocation_reason?: string | null;
    created_at: string;
}

export interface CreatedRegistrationInvitation extends RegistrationInvitation {
    token: string;
    registration_url: string;
}

export interface InvitationSchool {
    id: number;
    name: string;
    district?: string | null;
}

export interface InvitationListResponse extends PaginatedResponse<RegistrationInvitation> {
    meta: PaginatedResponse<RegistrationInvitation>['meta'] & { availableSchools: InvitationSchool[] };
}

export const getPublicInvitation = async (token: string) =>
    (await publicApi.get<{
        data: {
            school: {
                id: number;
                name: string;
                district?: string | null;
                barangay_id: number;
                barangay_name: string;
                municipality_id: number;
                municipality_name: string;
            };
            expires_at: string;
            form: {
                schema_version: 'v1';
                privacy_notice_version: 'v1';
                required_fields: readonly string[];
                privacy: { notice: string; retention: string; contact: string };
            };
        };
    }>(phase2Routes.publicInvitation(token))).data.data;

export const submitPublicRegistration = async (
    token: string,
    payload: PublicRegistrationPayload,
    idempotencyKey: string,
) => (await publicApi.post<{ data: { status: 'pending'; receipt: string } }>(
    phase2Routes.publicSubmission(token),
    payload,
    { headers: { 'Idempotency-Key': idempotencyKey } },
)).data.data;

export const createRegistrationInvitation = async (payload: {
    school_id: number;
    expires_in_days?: number;
    submission_limit?: number;
}): Promise<CreatedRegistrationInvitation> =>
    (await api.post<{ data: CreatedRegistrationInvitation }>(phase2Routes.invitations, payload)).data.data;

export const getRegistrationInvitations = async (params?: {
    school_id?: number;
    status?: 'active' | 'revoked' | 'expired';
    page?: number;
    pageSize?: number;
}): Promise<InvitationListResponse> =>
    (await api.get<InvitationListResponse>(phase2Routes.invitations, { params })).data;

export const revokeRegistrationInvitation = async (id: number, reason: string) =>
    (await api.post(phase2Routes.revokeInvitation(id), { reason })).data;

export const getRegistrationSubmissions = async (params?: {
    school_id?: number;
    status?: RegistrationStatus;
    possible_duplicate?: boolean;
    page?: number;
    pageSize?: number;
}): Promise<RegistrationSubmissionListResponse> =>
    (await api.get<RegistrationSubmissionListResponse>(phase2Routes.submissions, { params })).data;

export const getRegistrationSubmission = async (id: number) =>
    (await api.get<{ data: RegistrationSubmission }>(phase2Routes.submission(id))).data.data;

export const approveRegistrationSubmission = async (id: number, decisionReason: string) =>
    (await api.post(phase2Routes.approveSubmission(id), {
        decision: 'new',
        decision_reason: decisionReason,
    })).data;

export const mergeRegistrationSubmission = async (
    id: number,
    targetStudentId: number,
    decisionReason: string,
) => (await api.post(phase2Routes.approveSubmission(id), {
    decision: 'merge',
    target_student_id: targetStudentId,
    decision_reason: decisionReason,
})).data;

export const rejectRegistrationSubmission = async (id: number, reasonCode: string, reasonNote?: string) =>
    (await api.post(phase2Routes.rejectSubmission(id), {
        reason_code: reasonCode,
        ...(reasonNote ? { reason_note: reasonNote } : {}),
    })).data;
