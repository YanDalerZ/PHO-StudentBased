import api from './api';

export interface InvitationPolicy {
    origin: string;
    rateWindowMs: number;
    rateLimitPerIp: number;
    rateLimitPerInvitation: number;
    maxBodyBytes: number;
    privacyNotice: string;
    retentionNotice: string;
    contact: string;
    maxExpiryDays: number;
    maxSubmissionLimit: number;
}

export interface AdminInvitationMetadata {
    id: number;
    school_id: number;
    school_name: string;
    created_by: number;
    created_at: string;
    expires_at: string;
    status: 'active' | 'expired' | 'revoked';
    submission_count: number;
    submission_limit: number;
    revoked_at: string | null;
    revoked_by: number | null;
}

export async function getInvitationPolicy(): Promise<{ data: InvitationPolicy; approved_origins: string[] }> {
    return (await api.get('/admin/registration-invitation-policy')).data;
}

export async function updateInvitationPolicy(policy: InvitationPolicy): Promise<InvitationPolicy> {
    return (await api.put<{ data: InvitationPolicy }>('/admin/registration-invitation-policy', policy)).data.data;
}

export async function listAdminInvitations(params: { page: number; pageSize: number; school_id?: number; status?: string }) {
    return (await api.get<{ data: AdminInvitationMetadata[]; meta: { page: number; pageSize: number; total: number } }>(
        '/admin/registration-invitations', { params },
    )).data;
}

export async function revokeAdminInvitation(id: number, reason: string): Promise<void> {
    await api.post(`/admin/registration-invitations/${id}/revoke`, { reason });
}
