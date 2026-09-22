import pool from '../database/db.js';

export interface AuditEventParams {
    actor_id: number;
    action: string;
    entity_type: string;
    entity_id: number;
    correlation_id?: string;
    before_data?: Record<string, any> | null;
    after_data?: Record<string, any> | null;
}

export class AuditService {
    /**
     * Logs an audit event into AUDIT_EVENTS.
     * Note: This method runs independently. If the audit event must be 
     * in the same transaction as the change, pass the `client` from 
     * a `pool.connect()` transaction instead of using the default pool.
     */
    static async logEvent(params: AuditEventParams, client: any = pool) {
        // Redact passwords or sensitive health payloads if they accidentally get passed
        const redact = (data: any): any => {
            if (!data) return data;
            if (Array.isArray(data)) {
                return data.map(item => redact(item));
            }
            if (typeof data === 'object') {
                const redacted: Record<string, any> = {};
                for (const key in data) {
                    const lkey = key.toLowerCase();
                    if (lkey.includes('password') || lkey.includes('token') || lkey.includes('payload') || lkey.includes('health') || lkey.includes('clinical') || lkey === 'qr_data' || lkey.includes('identifier')) {
                        redacted[key] = '[REDACTED]';
                    } else {
                        redacted[key] = redact(data[key]);
                    }
                }
                return redacted;
            }
            return data;
        };

        const before = redact(params.before_data);
        const after = redact(params.after_data);

        await client.query(
            `INSERT INTO AUDIT_EVENTS 
             (actor_id, action, entity_type, entity_id, correlation_id, before_data, after_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                params.actor_id,
                params.action,
                params.entity_type,
                params.entity_id,
                params.correlation_id || null,
                before ? JSON.stringify(before) : null,
                after ? JSON.stringify(after) : null
            ]
        );
    }
}
