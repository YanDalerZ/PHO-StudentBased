import pool from '../database/db.js';
import { applyPhase3ReportingMigration } from '../database/phase3ReportingMigration.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    const result = await applyPhase3ReportingMigration(client);
    console.log(JSON.stringify({
        target: formatSafeDatabaseIdentity(identity),
        migration: '011_v5_phase3_reporting_foundation',
        result: result.applied ? 'applied' : 'already-applied',
        checksum: result.checksum,
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}

