import type { ModuleSlug } from './index';

export interface ReportRequestFilters {
  municipality_id?: number;
  barangay_id?: number;
  school_id?: number;
  period?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
}

export interface ProtectedReportCount {
  value: number | null;
  suppressed: boolean;
  suppression_reason?: string;
}

export type ReportBreakdownRow = Record<string, string | number | boolean | null | ProtectedReportCount>;

export interface ConsolidatedReportPreview {
  module: ModuleSlug;
  filters: {
    municipality_id?: number;
    barangay_id?: number;
    school_id?: number;
    requested_period?: string;
    period_source: 'default' | 'named' | 'explicit';
    date_from: string;
    date_to: string;
    date_span_days: number;
    page: number;
    pageSize: number;
    offset: number;
    timezone: 'Asia/Manila';
  };
  scope: { mode: 'province' } | { mode: 'restricted'; schoolIds: number[] };
  summary: Record<string, unknown>;
  breakdowns: Record<string, ReportBreakdownRow[]>;
  coverage: Record<string, unknown>;
  classifications: Record<string, unknown>;
  empty: boolean;
  empty_message: string | null;
  privacy: Record<string, unknown>;
}

export interface ReportExportJob {
  id: number;
  module_slug: ModuleSlug;
  format: 'csv' | 'xlsx';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'expired';
  row_count: number | null;
  error_code: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  download_token?: string;
  download_token_expires_at?: string;
}
