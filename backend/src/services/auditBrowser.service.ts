import pool from '../database/db.js';

export interface AuditBrowserFilters {
    actor_id?: number | undefined;
    action?: string | undefined;
    entity_type?: string | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    page: number;
    pageSize: number;
}

type RawAuditRow = {
    id: number;
    created_at: Date | null;
    actor_id: number | null;
    portal_role: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: unknown;
};

const governanceEntities = new Set(['USER', 'SCHOOL', 'MODULE', 'REGISTRATION_INVITATION', 'REGISTRATION_PUBLIC_POLICY']);
const governanceActions = new Set([
    'CREATE_USER', 'UPDATE_USER', 'UPDATE_USER_STATUS', 'UPDATE_MODULE_PERMISSIONS',
    'UPDATE_SCHOOL_ASSIGNMENTS', 'CREATE_SCHOOL', 'UPDATE_SCHOOL', 'DEACTIVATE_SCHOOL',
    'UPDATE_MODULE', 'DEACTIVATE_MODULE', 'ACTIVATE_MODULE',
    'UPDATE_REGISTRATION_INVITATION_POLICY', 'ADMIN_REVOKE_REGISTRATION_INVITATION',
]);
const knownActions = new Set([
    ...governanceActions, 'AUTHORIZATION_DENIED', 'LOGIN_FAILED', 'login',
    'REVOKE_REGISTRATION_INVITATION', 'APPROVE_REGISTRATION', 'LINK_REGISTRATION_SUBMISSION',
    'REJECT_REGISTRATION_SUBMISSION', 'CREATE_STUDENT', 'UPDATE_STUDENT',
    'PATIENT_INFO_CREATED', 'PATIENT_INFO_UPDATED', 'ANIMAL_BITE_CREATED', 'ANIMAL_BITE_UPDATED',
    'ORAL_HEALTH_CREATED', 'ORAL_HEALTH_UPDATED', 'DEWORMING_RECORD_CREATED', 'DEWORMING_RECORD_UPDATED',
    'IMMUNIZATION_CREATED', 'IMMUNIZATION_UPDATED', 'VITAL_SIGNS_CREATED', 'VITAL_SIGNS_UPDATED',
    'REPORT_VIEWED', 'REPORT_PRINT_INITIATED', 'REPORT_EXPORT_REQUESTED',
    'REPORT_EXPORT_COMPLETED', 'REPORT_EXPORT_DOWNLOADED', 'REPORT_EXPORT_FAILED',
]);
const knownEntities = new Set([
    ...governanceEntities, 'ACCESS_POLICY', 'AUTH', 'auth', 'REGISTRATION_SUBMISSION',
    'STUDENT', 'patient_info', 'animal_bite', 'oral_health', 'deworming', 'immunization',
    'vital_signs', 'CONSOLIDATED_REPORT', 'REPORT_EXPORT',
]);
const safeFieldNames = new Set([
    'portal_role', 'job_title', 'is_active', 'name', 'school_id', 'module_id',
    'municipality_id', 'barangay_id', 'max_expiry_days', 'max_submission_limit',
]);

export function presentAuditEvent(row: RawAuditRow) {
    const action = knownActions.has(row.action) ? row.action : 'OTHER_EVENT';
    const entity_type = knownEntities.has(row.entity_type) ? row.entity_type : 'OTHER_ENTITY';
    const role = row.portal_role;
    const details: Record<string, boolean | number | string[]> = {};
    if (governanceActions.has(action) && governanceEntities.has(entity_type) &&
        row.details && typeof row.details === 'object' && !Array.isArray(row.details)) {
        const source = row.details as Record<string, unknown>;
        for (const key of ['previous_active', 'is_active'] as const) {
            if (typeof source[key] === 'boolean') details[key] = source[key];
        }
        for (const key of ['revoked_assignment_count', 'revoked_permission_count'] as const) {
            if (Number.isSafeInteger(source[key]) && (source[key] as number) >= 0) details[key] = source[key] as number;
        }
        if (Array.isArray(source.changed_fields)) {
            details.changed_fields = source.changed_fields.filter(
                (field): field is string => typeof field === 'string' && safeFieldNames.has(field),
            ).slice(0, 20);
        }
    }
    return {
        id: row.id,
        created_at: row.created_at,
        actor_id: row.actor_id,
        portal_role: role === 'admin' || role === 'superuser' || role === 'school_staff' ? role : null,
        action,
        entity_type,
        entity_id: governanceActions.has(action) && governanceEntities.has(entity_type) && row.entity_id && /^\d{1,15}$/.test(row.entity_id)
            ? row.entity_id : null,
        details,
    };
}

export async function listAuditEvents(filters: AuditBrowserFilters) {
    const values: Array<string | number> = [];
    const clauses: string[] = [];
    const add = (sql: string, value: string | number) => {
        values.push(value);
        clauses.push(sql.replace('?', `$${values.length}`));
    };
    if (filters.actor_id !== undefined) add('actor_id = ?', filters.actor_id);
    if (filters.action) add('action = ?', filters.action);
    if (filters.entity_type) add('entity_type = ?', filters.entity_type);
    if (filters.date_from) add("created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Manila')", filters.date_from);
    if (filters.date_to) add("created_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')", filters.date_to);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM AUDIT_EVENTS ${where}`, values);
    const rows = await pool.query<RawAuditRow>(
        `SELECT id, created_at, actor_id, portal_role, action, entity_type, entity_id, details
         FROM AUDIT_EVENTS ${where} ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
    );
    return { data: rows.rows.map(presentAuditEvent), meta: {
        page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0),
    } };
}
