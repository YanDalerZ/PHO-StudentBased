import pool from '../database/db.js';

interface DatabaseIdentity {
    database_name: string;
    user_name: string;
    server_address: string | null;
    server_port: number | null;
    transaction_read_only: string;
}

const localAddresses = new Set(['127.0.0.1', '::1', 'localhost']);

try {
    const result = await pool.query<DatabaseIdentity>(`
        SELECT current_database() AS database_name,
               current_user AS user_name,
               inet_server_addr()::text AS server_address,
               inet_server_port() AS server_port,
               current_setting('transaction_read_only') AS transaction_read_only
    `);
    const identity = result.rows[0];

    if (!identity) {
        throw new Error('PostgreSQL did not return its connected identity.');
    }
    const normalizedAddress = identity.server_address?.split('/')[0];
    if (!normalizedAddress || localAddresses.has(normalizedAddress)) {
        throw new Error('DATABASE_URL still targets a local PostgreSQL server. Configure the shared Aiven URL.');
    }

    console.log(JSON.stringify({
        status: 'connected',
        target: 'shared-remote-postgresql',
        database: identity.database_name,
        user: identity.user_name,
        serverAddress: identity.server_address,
        serverPort: identity.server_port,
        transactionReadOnly: identity.transaction_read_only,
    }, null, 2));
} finally {
    await pool.end();
}
