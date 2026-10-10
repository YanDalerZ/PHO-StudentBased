import pool from '../database/db.js';
import { readRetentionMigration, RETENTION_MIGRATION_NAME } from '../database/retentionMigration.js';
import { countEligibleRetentionRows, runRetentionBatch } from '../services/retention.service.js';
import { formatSafeDatabaseTarget, readSafeDatabaseIdentity } from '../utils/productionDatabase.js';

const apply = process.argv.includes('--apply');
const client = await pool.connect();
try {
    const identity = await readSafeDatabaseIdentity(client);
    const target = formatSafeDatabaseTarget(identity);
    const recorded = await client.query<{ name: string; checksum: string }>(
        'SELECT name, checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', ['014'],
    );
    const expected = readRetentionMigration();
    if (recorded.rows[0]?.name !== RETENTION_MIGRATION_NAME
        || recorded.rows[0]?.checksum.trim() !== expected.checksum) {
        throw new Error('Retention migration 014 is missing or its checksum differs.');
    }

    if (!apply) {
        await client.query('BEGIN TRANSACTION READ ONLY');
        try {
            await client.query("SET LOCAL statement_timeout = '60s'");
            const eligible = await countEligibleRetentionRows(client);
            await client.query('ROLLBACK');
            console.log(JSON.stringify({ target, mode: 'READ ONLY', eligible }, null, 2));
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    } else {
        if (process.env.NODE_ENV !== 'production'
            || process.env.PHO_RETENTION_APPLY_ACK !== 'PURGE_APPROVED_RETENTION_V5'
            || process.env.PHO_RETENTION_EXPECTED_TARGET !== target) {
            throw new Error('Retention apply requires production mode, the exact acknowledgement, and the matching preflight target.');
        }
        const limit = Number(process.env.PHO_RETENTION_BATCH_LIMIT ?? 100);
        const maxBatches = Number(process.env.PHO_RETENTION_MAX_BATCHES ?? 10);
        if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 20) {
            throw new Error('PHO_RETENTION_MAX_BATCHES must be an integer from 1 to 20.');
        }
        const deleted = { pending: 0, rejected: 0, auditEvents: 0 };
        for (let index = 0; index < maxBatches; index += 1) {
            const batch = await runRetentionBatch(client, limit);
            deleted.pending += batch.pending;
            deleted.rejected += batch.rejected;
            deleted.auditEvents += batch.auditEvents;
            if (batch.pending + batch.rejected + batch.auditEvents === 0) break;
        }
        const remaining = await countEligibleRetentionRows(client);
        console.log(JSON.stringify({ target, mode: 'APPLIED', deleted, remaining }, null, 2));
        if (remaining.pending + remaining.rejected + remaining.auditEvents > 0) {
            process.exitCode = 2;
        }
    }
} finally {
    client.release();
    await pool.end();
}
