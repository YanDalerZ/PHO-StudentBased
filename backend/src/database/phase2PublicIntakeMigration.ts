import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const PHASE2_PUBLIC_INTAKE_MIGRATION_VERSION = '010';
export const PHASE2_PUBLIC_INTAKE_MIGRATION_NAME = '010_v5_phase2_public_intake_controls';

interface MigrationRow { checksum: string }

function loadMigration(): { sql: string; checksum: string } {
    const file = path.join(process.cwd(), 'database', 'migrations', `${PHASE2_PUBLIC_INTAKE_MIGRATION_NAME}.sql`);
    const sql = fs.readFileSync(file, 'utf8');
    return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

export async function applyPhase2PublicIntakeMigration(client: PoolClient): Promise<{
    applied: boolean;
    checksum: string;
}> {
    const { sql, checksum } = loadMigration();
    await client.query('BEGIN');
    try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const baseline = await client.query(`
            SELECT 1 FROM PHO_SCHEMA_MIGRATIONS
            WHERE version = '009' AND name = '009_v5_phase2_concurrency_controls'
        `);
        if (!baseline.rows[0]) throw new Error('Migration 010 requires the verified migration 009 baseline.');

        const recorded = await client.query<MigrationRow>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1',
            [PHASE2_PUBLIC_INTAKE_MIGRATION_VERSION],
        );
        if (recorded.rows[0]) {
            if (recorded.rows[0].checksum.trim() !== checksum) {
                throw new Error('Migration 010 checksum differs from the applied migration.');
            }
            await client.query('COMMIT');
            return { applied: false, checksum };
        }

        const overlapping = await client.query(`
            SELECT school_id
            FROM REGISTRATION_INVITATIONS
            WHERE status = 'active' AND expires_at > NOW()
            GROUP BY school_id HAVING COUNT(*) > 1 LIMIT 1
        `);
        if (overlapping.rows[0]) {
            throw new Error('Migration 010 requires owner review of overlapping active school invitations.');
        }

        await client.query(sql);
        await client.query(`
            INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum)
            VALUES ($1, $2, $3)
        `, [PHASE2_PUBLIC_INTAKE_MIGRATION_VERSION, PHASE2_PUBLIC_INTAKE_MIGRATION_NAME, checksum]);
        await client.query('COMMIT');
        return { applied: true, checksum };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}
