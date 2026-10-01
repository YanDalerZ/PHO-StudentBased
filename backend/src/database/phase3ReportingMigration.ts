import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

export const PHASE3_REPORTING_MIGRATION_VERSION = '011';
export const PHASE3_REPORTING_MIGRATION_NAME = '011_v5_phase3_reporting_foundation';

interface MigrationRow { checksum: string }

function checksum(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function canonicalSql(value: string): string {
    return value.replace(/\r\n?/g, '\n');
}

export function readPhase3ReportingMigration(): { sql: string; checksum: string } {
    const file = path.join(
        process.cwd(),
        'database',
        'migrations',
        `${PHASE3_REPORTING_MIGRATION_NAME}.sql`,
    );
    const sql = fs.readFileSync(file, 'utf8');
    return { sql, checksum: checksum(canonicalSql(sql)) };
}

export function isRecognizedPhase3ReportingChecksum(recorded: string, sql: string): boolean {
    const normalized = canonicalSql(sql);
    return new Set([
        checksum(normalized),
        checksum(sql),
        checksum(normalized.replace(/\n/g, '\r\n')),
    ]).has(recorded.trim());
}

export async function applyPhase3ReportingMigration(client: PoolClient): Promise<{
    applied: boolean;
    checksum: string;
}> {
    const { sql, checksum } = readPhase3ReportingMigration();
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '5min'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
        const baseline = await client.query(`
            SELECT 1 FROM PHO_SCHEMA_MIGRATIONS
            WHERE version = '010' AND name = '010_v5_phase2_public_intake_controls'
        `);
        if (!baseline.rows[0]) {
            throw new Error('Migration 011 requires the verified Phase 2 migration 010 baseline.');
        }

        const recorded = await client.query<MigrationRow>(
            'SELECT checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1',
            [PHASE3_REPORTING_MIGRATION_VERSION],
        );
        if (recorded.rows[0]) {
            if (!isRecognizedPhase3ReportingChecksum(recorded.rows[0].checksum, sql)) {
                throw new Error('Migration 011 checksum differs from the applied migration.');
            }
            await client.query('COMMIT');
            return { applied: false, checksum };
        }

        await client.query(sql);
        await client.query(`
            INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum)
            VALUES ($1, $2, $3)
        `, [PHASE3_REPORTING_MIGRATION_VERSION, PHASE3_REPORTING_MIGRATION_NAME, checksum]);
        await client.query('COMMIT');
        return { applied: true, checksum };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

