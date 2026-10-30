import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pool from '../database/db.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

try {
    await requireVerifiedTestDatabase(pool);
    const existing = await pool.query<{ sessions: string | null; policy: string | null }>(
        "SELECT to_regclass('public.portal_sessions')::text AS sessions, to_regclass('public.portal_session_policy')::text AS policy");
    if (existing.rows[0]?.sessions && existing.rows[0]?.policy) {
        console.log('Portal session tables already exist on the verified local test database.');
    } else if (existing.rows[0]?.sessions || existing.rows[0]?.policy) {
        throw new Error('Partial portal session schema; inspect before migrating.');
    } else {
        const sql = await readFile(path.resolve(process.cwd(), 'database/migrations/017_portal_sessions.sql'), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('COMMIT');
            console.log('Migration 017 applied to the verified local test database only.');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    }
} finally { await pool.end(); }
