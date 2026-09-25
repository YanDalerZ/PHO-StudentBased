import type { Pool } from 'pg';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from './testGuard.js';

export async function requireVerifiedTestDatabase(pool: Pool): Promise<void> {
    const policy = requireDisposableDatabase();
    const identity = await verifyConnectedDatabaseIdentity(pool, policy);
    console.log(`Verified disposable PostgreSQL target: ${formatSafeDatabaseIdentity(identity)}`);
}
