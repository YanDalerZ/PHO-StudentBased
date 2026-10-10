import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const AUDIT_BROWSER_MIGRATION_NAME = '013_v5_phase4b_audit_browser_indexes';

export async function applyAuditBrowserMigration(client: PoolClient): Promise<'applied' | 'already-applied'> {
    const sql = fs.readFileSync(path.join(process.cwd(), 'database', 'migrations', `${AUDIT_BROWSER_MIGRATION_NAME}.sql`), 'utf8');
    const normalized = sql.replace(/\r\n?/g, '\n');
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const checksum = hash(normalized);
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '5min'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const existing = await client.query<{ checksum: string }>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['013'],
        );
        if (existing.rows[0]) {
            if (![normalized, sql, normalized.replace(/\n/g, '\r\n')].map(hash).includes(existing.rows[0].checksum.trim())) {
                throw new Error('Migration 013 checksum differs from the applied migration.');
            }
            await client.query('COMMIT');
            return 'already-applied';
        }
        const prior = await client.query('SELECT 1 FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['012']);
        if (!prior.rows[0]) throw new Error('Migration 013 requires the Phase 4B migration 012 baseline.');
        await client.query(sql);
        await client.query(
            'INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum) VALUES ($1, $2, $3)',
            ['013', AUDIT_BROWSER_MIGRATION_NAME, checksum],
        );
        await client.query('COMMIT');
        return 'applied';
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
