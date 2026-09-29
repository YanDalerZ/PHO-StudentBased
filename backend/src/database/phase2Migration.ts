import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const PHASE2_CONTRACT_MIGRATION_VERSION = '008';
export const PHASE2_CONTRACT_MIGRATION_NAME = '008_v5_phase2_contract_reconciliation';

interface MigrationRow { checksum: string }

function loadMigration(): { sql: string; checksum: string } {
    const file = path.join(
        process.cwd(),
        'database',
        'migrations',
        `${PHASE2_CONTRACT_MIGRATION_NAME}.sql`,
    );
    const sql = fs.readFileSync(file, 'utf8');
    return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

export async function applyPhase2ContractMigration(client: PoolClient): Promise<{
    applied: boolean;
    checksum: string;
}> {
    const { sql, checksum } = loadMigration();
    await client.query('BEGIN');
    try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const prerequisites = await client.query<{ phase1_baseline: string | null; submissions: string | null }>(`
            SELECT
                (SELECT version FROM PHO_SCHEMA_MIGRATIONS
                 WHERE (version = '006' AND name = '006_v5_phase1_schema_reconciliation')
                    OR (version = '007' AND name = '007_v5_phase1_release_reconciliation')
                 ORDER BY version DESC LIMIT 1) AS phase1_baseline,
                to_regclass('public.registration_submissions')::text AS submissions
        `);
        if (!prerequisites.rows[0]?.phase1_baseline || !prerequisites.rows[0]?.submissions) {
            throw new Error('Migration 008 requires a verified Phase 1 migration 006/007 baseline.');
        }
        const recorded = await client.query<MigrationRow>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1',
            [PHASE2_CONTRACT_MIGRATION_VERSION],
        );
        if (recorded.rows[0]) {
            if (recorded.rows[0].checksum.trim() !== checksum) {
                throw new Error('Migration 008 checksum differs from the applied migration.');
            }
            await client.query('COMMIT');
            return { applied: false, checksum };
        }
        await client.query(sql);
        await client.query(`
            INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum)
            VALUES ($1, $2, $3)
        `, [PHASE2_CONTRACT_MIGRATION_VERSION, PHASE2_CONTRACT_MIGRATION_NAME, checksum]);
        await client.query('COMMIT');
        return { applied: true, checksum };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

