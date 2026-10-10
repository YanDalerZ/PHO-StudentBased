import pool from '../database/db.js';
import { applyAuditBrowserMigration, AUDIT_BROWSER_MIGRATION_NAME } from '../database/phase4bAuditBrowserMigration.js';
import {
    formatSafeDatabaseIdentity, requireDisposableDatabase, verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const guard = requireDisposableDatabase();
const client = await pool.connect();
try {
    const identity = await verifyConnectedDatabaseIdentity(client, guard);
    const result = await applyAuditBrowserMigration(client);
    console.log(JSON.stringify({ target: formatSafeDatabaseIdentity(identity), migration: AUDIT_BROWSER_MIGRATION_NAME, result }));
} finally {
    client.release();
    await pool.end();
}
