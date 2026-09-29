import pool from '../database/db.js';
import { applyPhase2ContractMigration } from '../database/phase2Migration.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    const result = await applyPhase2ContractMigration(client);
    console.log(JSON.stringify({
        target: formatSafeDatabaseIdentity(identity),
        migration: '008_v5_phase2_contract_reconciliation',
        result: result.applied ? 'applied' : 'already-applied',
        checksum: result.checksum,
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}

