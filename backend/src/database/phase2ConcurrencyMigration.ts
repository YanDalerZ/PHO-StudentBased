import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const PHASE2_CONCURRENCY_MIGRATION_VERSION = '009';
export const PHASE2_CONCURRENCY_MIGRATION_NAME = '009_v5_phase2_concurrency_controls';

interface MigrationRow { checksum: string }

function loadMigration(): { sql: string; checksum: string } {
    const file = path.join(
        process.cwd(),
        'database',
        'migrations',
        `${PHASE2_CONCURRENCY_MIGRATION_NAME}.sql`,
    );
    const sql = fs.readFileSync(file, 'utf8');
    return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

export async function applyPhase2ConcurrencyMigration(client: PoolClient): Promise<{
    applied: boolean;
    checksum: string;
}> {
    const { sql, checksum } = loadMigration();
    await client.query('BEGIN');
    try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const baseline = await client.query<{ checksum: string }>(`
            SELECT checksum FROM PHO_SCHEMA_MIGRATIONS
            WHERE version = '008' AND name = '008_v5_phase2_contract_reconciliation'
        `);
        if (!baseline.rows[0]) {
            throw new Error('Migration 009 requires the verified Phase 2 migration 008 baseline.');
        }
        const recorded = await client.query<MigrationRow>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1',
            [PHASE2_CONCURRENCY_MIGRATION_VERSION],
        );
        if (recorded.rows[0]) {
            if (recorded.rows[0].checksum.trim() !== checksum) {
                throw new Error('Migration 009 checksum differs from the applied migration.');
            }
            await client.query('COMMIT');
            return { applied: false, checksum };
        }
        const duplicatePendingLrns = await client.query<{ lrn: string; count: number }>(`
            SELECT BTRIM(payload->>'student_lrn') AS lrn, COUNT(*)::int AS count
            FROM REGISTRATION_SUBMISSIONS
            WHERE status = 'pending'
              AND NULLIF(BTRIM(payload->>'student_lrn'), '') IS NOT NULL
            GROUP BY BTRIM(payload->>'student_lrn')
            HAVING COUNT(*) > 1
            LIMIT 1
        `);
        if (duplicatePendingLrns.rows[0]) {
            throw new Error('Migration 009 requires owner review of duplicate pending LRNs before it can proceed.');
        }
        await client.query(sql);
        await client.query(`
            INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum)
            VALUES ($1, $2, $3)
        `, [PHASE2_CONCURRENCY_MIGRATION_VERSION, PHASE2_CONCURRENCY_MIGRATION_NAME, checksum]);
        await client.query('COMMIT');
        return { applied: true, checksum };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
