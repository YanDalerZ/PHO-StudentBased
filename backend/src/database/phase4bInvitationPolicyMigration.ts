import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const INVITATION_POLICY_MIGRATION_NAME = '012_v5_phase4b_invitation_policy';

export async function applyInvitationPolicyMigration(client: PoolClient): Promise<'applied' | 'already-applied'> {
    const sql = fs.readFileSync(path.join(process.cwd(), 'database', 'migrations', `${INVITATION_POLICY_MIGRATION_NAME}.sql`), 'utf8');
    const normalized = sql.replace(/\r\n?/g, '\n');
    const checksum = createHash('sha256').update(normalized).digest('hex');
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '5min'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const prior = await client.query<{ checksum: string }>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['012'],
        );
        if (prior.rows[0]) {
            const accepted = [normalized, sql, normalized.replace(/\n/g, '\r\n')]
                .map(value => createHash('sha256').update(value).digest('hex'));
            if (!accepted.includes(prior.rows[0].checksum.trim())) {
                throw new Error('Migration 012 checksum differs from the applied migration.');
            }
            await client.query('COMMIT');
            return 'already-applied';
        }
        const baseline = await client.query('SELECT 1 FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['011']);
        if (!baseline.rows[0]) throw new Error('Migration 012 requires the Phase 3 migration 011 baseline.');
        await client.query(sql);
        await client.query(
            'INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum) VALUES ($1, $2, $3)',
            ['012', INVITATION_POLICY_MIGRATION_NAME, checksum],
        );
        await client.query('COMMIT');
        return 'applied';
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
