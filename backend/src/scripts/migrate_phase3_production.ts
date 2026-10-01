import pool from '../database/db.js';
import {
    applyPhase3ReportingMigration,
    PHASE3_REPORTING_MIGRATION_NAME,
} from '../database/phase3ReportingMigration.js';
import {
    formatSafeDatabaseTarget,
    readSafeDatabaseIdentity,
    requireProductionMigrationAcknowledgement,
} from '../utils/productionDatabase.js';

requireProductionMigrationAcknowledgement('APPLY_PHASE3_REPORTING_V5');

const client = await pool.connect();
try {
    const identity = await readSafeDatabaseIdentity(client);
    const result = await applyPhase3ReportingMigration(client);
    console.log(JSON.stringify({
        target: formatSafeDatabaseTarget(identity),
        migration: PHASE3_REPORTING_MIGRATION_NAME,
        result: result.applied ? 'applied' : 'already-applied',
        checksum: result.checksum,
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}
