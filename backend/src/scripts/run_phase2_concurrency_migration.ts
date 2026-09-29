import pool from '../database/db.js';
import { applyPhase2ConcurrencyMigration } from '../database/phase2ConcurrencyMigration.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    const result = await applyPhase2ConcurrencyMigration(client);
    console.log(JSON.stringify({
        target: formatSafeDatabaseIdentity(identity),
        migration: '009_v5_phase2_concurrency_controls',
        result: result.applied ? 'applied' : 'already-applied',
        checksum: result.checksum,
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}
