import 'dotenv/config';

export interface DisposableDatabasePolicy {
    host: string;
    port: number;
    database: string;
    user: string;
}

export interface DatabaseIdentity {
    database: string;
    user: string;
    serverAddress: string | null;
    serverPort: number | null;
}

interface Queryable {
    query<T extends Record<string, unknown>>(sql: string): Promise<{ rows: T[] }>;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} must be set for destructive database operations.`);
    return value;
}

function normalizeHost(host: string): string {
    const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\/\d+$/, '');
    return LOCAL_HOSTS.has(normalized) ? 'local' : normalized;
}

export function getDisposableDatabasePolicy(env: NodeJS.ProcessEnv = process.env): DisposableDatabasePolicy {
    if (env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV must be exactly "test" for destructive database operations.');
    }
    if (env.PHO_ALLOW_DESTRUCTIVE_TESTS !== 'true') {
        throw new Error('PHO_ALLOW_DESTRUCTIVE_TESTS must be exactly "true".');
    }

    const databaseUrl = requireValue(env, 'DATABASE_URL');
    const expectedHost = requireValue(env, 'PHO_EXPECTED_DB_HOST').toLowerCase();
    const expectedPortText = requireValue(env, 'PHO_EXPECTED_DB_PORT');
    const expectedDatabase = requireValue(env, 'PHO_EXPECTED_DB_NAME');
    const expectedUser = requireValue(env, 'PHO_EXPECTED_DB_USER');

    let parsed: URL;
    try {
        parsed = new URL(databaseUrl);
    } catch {
        throw new Error('DATABASE_URL is not a valid PostgreSQL URL. Encode reserved password characters.');
    }

    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
        throw new Error('DATABASE_URL must use the postgres or postgresql protocol.');
    }

    const configuredHost = parsed.hostname.toLowerCase();
    const configuredPort = Number(parsed.port || '5432');
    const configuredDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    const configuredUser = decodeURIComponent(parsed.username);
    const expectedPort = Number(expectedPortText);

    if (!Number.isInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535) {
        throw new Error('PHO_EXPECTED_DB_PORT must be a valid TCP port.');
    }
    if (!LOCAL_HOSTS.has(configuredHost) || !LOCAL_HOSTS.has(expectedHost)) {
        throw new Error('Destructive PHO tests are restricted to a local PostgreSQL server.');
    }
    if (normalizeHost(configuredHost) !== normalizeHost(expectedHost)
        || configuredPort !== expectedPort
        || configuredDatabase !== expectedDatabase
        || configuredUser !== expectedUser) {
        throw new Error('DATABASE_URL does not exactly match the explicitly expected disposable target.');
    }
    if (expectedDatabase !== 'pho_test') {
        throw new Error('The only approved disposable database name is exactly "pho_test".');
    }

    return { host: expectedHost, port: expectedPort, database: expectedDatabase, user: expectedUser };
}

export function requireDisposableDatabase(): DisposableDatabasePolicy {
    return getDisposableDatabasePolicy(process.env);
}

export async function verifyConnectedDatabaseIdentity(
    connection: Queryable,
    policy: DisposableDatabasePolicy = requireDisposableDatabase(),
): Promise<DatabaseIdentity> {
    const result = await connection.query<{
        database: string;
        user_name: string;
        server_address: string | null;
        server_port: number | null;
    }>(`
        SELECT current_database() AS database,
               current_user AS user_name,
               inet_server_addr()::text AS server_address,
               inet_server_port() AS server_port
    `);
    const row = result.rows[0];
    if (!row) throw new Error('PostgreSQL did not return its connected identity.');

    const identity: DatabaseIdentity = {
        database: row.database,
        user: row.user_name,
        serverAddress: row.server_address,
        serverPort: row.server_port === null ? null : Number(row.server_port),
    };
    const liveHost = identity.serverAddress === null ? 'local' : normalizeHost(identity.serverAddress);
    if (identity.database !== policy.database
        || identity.user !== policy.user
        || identity.serverPort !== policy.port
        || liveHost !== normalizeHost(policy.host)) {
        throw new Error('Connected PostgreSQL identity does not match the approved disposable target.');
    }
    return identity;
}

export function formatSafeDatabaseIdentity(identity: DatabaseIdentity): string {
    return `${identity.user}@${identity.serverAddress ?? 'local-socket'}:${identity.serverPort ?? 'unknown'}/${identity.database}`;
}
