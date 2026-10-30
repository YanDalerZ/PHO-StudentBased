import type pg from 'pg';
import pool from '../database/db.js';

export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

export type SessionExpiry = 'inactivity' | 'maximum' | 'revoked';
export interface SessionStatus {
    inactivityMinutes: 5 | 10 | 15;
    serverTime: string;
    idleExpiresAt: string;
    maxExpiresAt: string;
}

interface SessionRow {
    created_at: Date;
    last_activity_at: Date;
    revoked_at: Date | null;
    inactivity_minutes: 5 | 10 | 15;
    server_time: Date;
}

async function terminateObservedExpiry(
    sessionId: string,
    userId: number,
    client: pg.Pool | pg.PoolClient,
): Promise<void> {
    // Expiry is terminal once observed. Persisting it prevents a later policy
    // increase from reviving a session that the server already rejected.
    await client.query(`
        UPDATE PORTAL_SESSIONS
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = $1 AND user_id = $2
    `, [sessionId, userId]);
}

export async function sessionStatus(sessionId: string, userId: number, client: pg.Pool | pg.PoolClient = pool): Promise<{ status?: SessionStatus; expired?: SessionExpiry }> {
    const result = await client.query<SessionRow>(`
        SELECT s.created_at, s.last_activity_at, s.revoked_at,
               p.inactivity_minutes, NOW() AS server_time
        FROM PORTAL_SESSIONS s CROSS JOIN PORTAL_SESSION_POLICY p
        WHERE s.id = $1 AND s.user_id = $2 AND p.id = 1
    `, [sessionId, userId]);
    const row = result.rows[0];
    if (!row) return { expired: 'revoked' };
    const now = row.server_time.getTime();
    const maxExpiresAt = row.created_at.getTime() + MAX_SESSION_MS;
    const idleExpiresAt = row.last_activity_at.getTime() + row.inactivity_minutes * 60_000;
    // Evaluate fixed maximum expiry before revoked_at so a browser returning
    // with an expired JWT still receives the specific maximum-lifetime reason.
    if (now >= maxExpiresAt) {
        await terminateObservedExpiry(sessionId, userId, client);
        return { expired: 'maximum' };
    }
    if (now >= idleExpiresAt) {
        await terminateObservedExpiry(sessionId, userId, client);
        return { expired: 'inactivity' };
    }
    if (row.revoked_at) return { expired: 'revoked' };
    return { status: {
        inactivityMinutes: row.inactivity_minutes,
        serverTime: row.server_time.toISOString(),
        idleExpiresAt: new Date(idleExpiresAt).toISOString(),
        maxExpiresAt: new Date(maxExpiresAt).toISOString(),
    } };
}

// A guarded UPDATE makes activity atomic with a concurrent policy change. A
// background GET or other protected request never calls this function.
export async function recordActivity(sessionId: string, userId: number): Promise<{ status?: SessionStatus; expired?: SessionExpiry }> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const policy = await client.query<{ inactivity_minutes: number }>(
            'SELECT inactivity_minutes FROM PORTAL_SESSION_POLICY WHERE id = 1 FOR SHARE');
        if (!policy.rows[0]) throw new Error('Session policy is missing');
        await client.query(`
            UPDATE PORTAL_SESSIONS SET last_activity_at = NOW()
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
              AND created_at + INTERVAL '8 hours' > NOW()
              AND last_activity_at + ($3 * INTERVAL '1 minute') > NOW()
        `, [sessionId, userId, policy.rows[0].inactivity_minutes]);
        const result = await sessionStatus(sessionId, userId, client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
