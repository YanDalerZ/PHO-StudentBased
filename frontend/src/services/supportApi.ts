import axios from 'axios';
import api, { publicApi } from './api';
import type { AdminModulePermissionReplacement, CreateAdminUserPayload } from '../types';

export const supportCategories = {
  login: 'Sign-in problem', technical: 'Technical problem', access: 'Permissions or access', other: 'Other',
};
export type ReportStatus = 'open' | 'in_review' | 'resolved';
export type AccountStatus = 'pending' | 'approved' | 'rejected';
interface SupportEntry {
  id: string;
  name: string;
  created_at: string;
}
export interface SupportReport extends SupportEntry {
  reply_email: string;
  category: keyof typeof supportCategories;
  description: string;
  page_or_module: string | null;
  status: ReportStatus;
  resolution_notes: string | null;
}
export interface AccountRequest extends SupportEntry {
  work_email: string;
  contact_no: string;
  job_title: string;
  school_or_office: string;
  reason: string;
  status: AccountStatus;
  decision_note: string | null;
  created_user_id: number | null;
  notification_status: 'pending' | 'sending' | 'accepted' | 'delivered' | 'failed' | null;
  attempt_count: number | null;
  notification_error: string | null;
  notification_provider_id: string | null;
  setup_required: boolean;
  setup_pending: boolean;
  setup_expires_at: string | null;
  setup_completed_at: string | null;
}
type Queue<T> = { data: T[]; hasMore: boolean };
export const submitProblem = async (fields: Record<string, string>) =>
  (await publicApi.post<{ reference: string }>('/contact/reports', fields)).data;
export const submitAccountRequest = async (fields: Record<string, string>) =>
  (await publicApi.post<{ message: string }>('/contact/accounts', fields)).data;
export const listReports = async (status: ReportStatus | undefined, page: number) =>
  (await api.get<Queue<SupportReport>>('/admin/support/reports', { params: { status, page } })).data;
export const listAccountRequests = async (status: AccountStatus | undefined, page: number) =>
  (await api.get<Queue<AccountRequest>>('/admin/support/accounts', { params: { status, page } })).data;
export const getAccountRequest = async (id: string) =>
  (await api.get<{ data: AccountRequest }>(`/admin/support/accounts/${encodeURIComponent(id)}`)).data.data;
export const updateReport = (id: string, status: ReportStatus, resolution_notes: string) =>
  api.patch(`/admin/support/reports/${id}`, { status, resolution_notes });
export const rejectRequest = (id: string, note: string) => api.post(`/admin/support/accounts/${id}/reject`, { note });
export const provisionRequest = (id: string, user: Omit<CreateAdminUserPayload, 'password'>, school_ids: number[], permissions: AdminModulePermissionReplacement[]) =>
  api.post(`/admin/support/accounts/${id}/provision`, { user, school_ids, permissions });
export const retryNotification = (id: string) => api.post(`/admin/support/accounts/${id}/retry-notification`);
export const checkNotificationDelivery = (id: string) => api.post(`/admin/support/accounts/${id}/check-delivery`);
export const completeAccountSetup = (token: string, password: string) => publicApi.post('/auth/account-setup', { token, password });

export function supportError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data?.error === 'string') return data.error;
    if (error.response?.status === 400) return 'Check the required fields and selected access.';
  }
  return 'Could not complete the request. Please try again.';
}
