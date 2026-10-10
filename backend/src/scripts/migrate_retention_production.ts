import pool from '../database/db.js';
import { applyRetentionMigration } from '../database/retentionMigration.js';
import {
    formatSafeDatabaseTarget, readSafeDatabaseIdentity, requireProductionMigrationAcknowledgement,
} from '../utils/productionDatabase.js';

requireProductionMigrationAcknowledgement('APPLY_RETENTION_CONTROLS_V5');
const client = await pool.connect();
try {
    const identity = await readSafeDatabaseIdentity(client);
    const target = formatSafeDatabaseTarget(identity);
    if (process.env.PHO_PRODUCTION_MIGRATION_EXPECTED_TARGET !== target) {
        throw new Error('PHO_PRODUCTION_MIGRATION_EXPECTED_TARGET must match the reviewed preflight target.');
    }
    const result = await applyRetentionMigration(client);
    console.log(JSON.stringify({
        target,
        migration: '014_v5_retention_controls',
        result,
        note: 'This creates retention controls only; no records are purged.',
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}
