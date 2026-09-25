import pool from '../database/db.js';
import { applyPhase1ReconciliationMigration } from '../database/phase1Migration.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    const result = await applyPhase1ReconciliationMigration(client);
    console.log(JSON.stringify({
        target: formatSafeDatabaseIdentity(identity),
        migration: '006_v5_phase1_schema_reconciliation',
        result: result.applied ? 'applied' : 'already-applied',
        checksum: result.checksum,
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}
