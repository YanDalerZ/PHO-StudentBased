import type { PoolClient } from 'pg';

export interface SafeDatabaseIdentity {
    database: string;
    serverAddress: string | null;
    serverPort: number | null;
}

export async function readSafeDatabaseIdentity(client: PoolClient): Promise<SafeDatabaseIdentity> {
    const result = await client.query<{
        database: string;
        server_address: string | null;
        server_port: number | null;
    }>(`
        SELECT current_database() AS database,
               inet_server_addr()::text AS server_address,
               inet_server_port() AS server_port
    `);
    const row = result.rows[0];
    if (!row) throw new Error('PostgreSQL did not return its connected identity.');
    return {
        database: row.database,
        serverAddress: row.server_address,
        serverPort: row.server_port === null ? null : Number(row.server_port),
    };
}

export function formatSafeDatabaseTarget(identity: SafeDatabaseIdentity): string {
    return `${identity.serverAddress ?? 'local-socket'}:${identity.serverPort ?? 'unknown'}/${identity.database}`;
}

export function requireProductionMigrationAcknowledgement(env: NodeJS.ProcessEnv = process.env): void {
    if (env.NODE_ENV !== 'production') {
        throw new Error('Production migration requires NODE_ENV=production.');
    }
    if (env.PHO_PRODUCTION_MIGRATION_ACK !== 'APPLY_PHASE1_V5') {
        throw new Error('Set PHO_PRODUCTION_MIGRATION_ACK=APPLY_PHASE1_V5 for this explicit migration invocation.');
    }
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
}
