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

export interface ReportTargetRevision {
  id: number;
  school_id: number;
  school_name: string;
  municipality_name: string;
  indicator: string;
  date_from: string;
  date_to: string;
  period_label: string | null;
  target_count: number;
  source_note: string;
  changed_by: number;
  changed_at: string;
}

export type ReportView = 'municipality' | 'masterlist';
export interface ReportDocument {
  module: ModuleSlug;
  view: ReportView;
  title: string;
  filters: ConsolidatedReportPreview['filters'];
  scope: { mode: 'province' | 'restricted'; school_ids: number[] | null };
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  total_students: number | null;
  empty: boolean;
  note: string | null;
}
