import pool from '../database/db.js';
import { applyInvitationPolicyMigration, INVITATION_POLICY_MIGRATION_NAME } from '../database/phase4bInvitationPolicyMigration.js';
import {
    formatSafeDatabaseIdentity, requireDisposableDatabase, verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const guard = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, guard);
    const result = await applyInvitationPolicyMigration(client);
    console.log(JSON.stringify({ target: formatSafeDatabaseIdentity(identity), migration: INVITATION_POLICY_MIGRATION_NAME, result }));
} finally {
    client.release();
    await pool.end();
}
