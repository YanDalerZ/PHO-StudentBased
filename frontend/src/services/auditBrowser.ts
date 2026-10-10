import api from './api';

export interface AuditEntry {
    id: number;
    created_at: string | null;
    actor_id: number | null;
    portal_role: 'admin' | 'superuser' | 'school_staff' | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, boolean | number | string[]>;
}

export interface AuditFilters {
    actor_id?: number;
    action?: string;
    entity_type?: string;
    date_from?: string;
    date_to?: string;
    page: number;
    pageSize: number;
}

export async function getAuditLogs(filters: AuditFilters): Promise<{
    data: AuditEntry[];
    meta: { page: number; pageSize: number; total: number };
}> {
    return (await api.get('/admin/audit-logs', { params: filters })).data;
}
