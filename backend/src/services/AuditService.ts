import type pg from 'pg';
import pool from '../database/db.js';
import type { PortalRole } from '../types/auth.types.js';

export interface AuditEventPayload {
    actor_id?: number | null | undefined;
    portal_role?: PortalRole | null | undefined;
    action: string;
    entity_type: string;
    entity_id?: string | null | undefined;
    school_id?: number | null | undefined;
    details?: unknown;
    ip_address?: string | null | undefined;
}

export class AuditService {
    /**
     * Redacts sensitive information from details payload before logging.
     * @param details JSON object containing potentially sensitive fields
     * @returns Redacted JSON object
     */
    static redactDetails(details: unknown): unknown {
        if (details === undefined || details === null) return null;

        const sensitiveFields = new Set([
            'password', 'password_hash', 'token', 'token_hash', 'pin', 'secret',
            'payload', 'event_metadata', 'duplicate_match_summary', 'photo_url',
            'student_lrn', 'contact_no', 'mobile', 'email', 'first_name',
            'middle_name', 'last_name', 'date_of_birth', 'philhealth_no',
            'psa_national_id', 'tax_id_no', 'pwd_id',
        ]);

        const redactRecursive = (value: unknown): unknown => {
            if (Array.isArray(value)) return value.map(redactRecursive);
            if (typeof value !== 'object' || value === null) return value;

            return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
                key,
                sensitiveFields.has(key.toLowerCase()) ? '[REDACTED]' : redactRecursive(nested),
            ]));
        };

        return redactRecursive(details);
    }

    /**
     * Logs an audit event to the AUDIT_EVENTS table.
     * If a transaction client is provided, the audit write is part of that transaction,
     * ensuring atomicity with the mutation. If the write fails in a transaction, the error
     * is thrown so the entire transaction rolls back.
     */
    static async logEvent(payload: AuditEventPayload, client?: pg.PoolClient): Promise<void> {
        const query = `
            INSERT INTO AUDIT_EVENTS (
                actor_id, portal_role, action, entity_type, entity_id, school_id, details, ip_address
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8
            )
        `;
        
        const redactedDetails = AuditService.redactDetails(payload.details);
        
        const values = [
            payload.actor_id ?? null,
            payload.portal_role ?? null,
            payload.action,
            payload.entity_type,
            payload.entity_id ?? null,
            payload.school_id ?? null,
            redactedDetails ? JSON.stringify(redactedDetails) : null,
            payload.ip_address ?? null
        ];

        if (client) {
            // Part of an active mutation transaction - must be atomic with the mutation
            await client.query(query, values);
            return;
        }

        try {
            await pool.query(query, values);
        } catch (error: unknown) {
            // Non-transactional logging (e.g. failed login, denial): log failure without leaking sensitive data
            const failure = error && typeof error === 'object'
                ? { name: String(Reflect.get(error, 'name') ?? 'Error'), code: Reflect.get(error, 'code') ?? null }
                : { name: 'Error', code: null };
            console.error('CRITICAL: Audit log failed to write to database', failure);
            console.error('Failed Audit Action:', payload.action, 'Entity:', payload.entity_type);
        }
    }
}
