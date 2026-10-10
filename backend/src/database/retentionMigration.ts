import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const RETENTION_MIGRATION_NAME = '014_v5_retention_controls';

export function readRetentionMigration(): { sql: string; checksum: string } {
    const sql = fs.readFileSync(
        path.join(process.cwd(), 'database', 'migrations', `${RETENTION_MIGRATION_NAME}.sql`), 'utf8',
    ).replace(/\r\n?/g, '\n');
    return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

export async function applyRetentionMigration(client: PoolClient): Promise<'applied' | 'already-applied'> {
    const { sql, checksum } = readRetentionMigration();
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '5min'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const existing = await client.query<{ name: string; checksum: string }>(
            'SELECT name, checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['014'],
        );
        if (existing.rows[0]) {
            if (existing.rows[0].name !== RETENTION_MIGRATION_NAME
                || existing.rows[0].checksum.trim() !== checksum) {
                throw new Error('Migration 014 ledger entry differs from the reviewed migration.');
            }
            await client.query('COMMIT');
            return 'already-applied';
        }
        const baseline = await client.query('SELECT 1 FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['013']);
        if (!baseline.rows[0]) throw new Error('Migration 014 requires the Phase 4B migration 013 baseline.');
        await client.query(sql);
        await client.query(
            'INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum) VALUES ($1, $2, $3)',
            ['014', RETENTION_MIGRATION_NAME, checksum],
        );
        await client.query('COMMIT');
        return 'applied';
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
