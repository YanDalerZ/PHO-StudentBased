import assert from 'node:assert/strict';
import {
    getDisposableDatabasePolicy,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const validEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PHO_ALLOW_DESTRUCTIVE_TESTS: 'true',
    PHO_EXPECTED_DB_HOST: 'localhost',
    PHO_EXPECTED_DB_PORT: '5432',
    PHO_EXPECTED_DB_NAME: 'pho_test',
    PHO_EXPECTED_DB_USER: 'postgres',
    DATABASE_URL: 'postgres://postgres:password@localhost:5432/pho_test',
};

function expectRejectedEnvironment(overrides: NodeJS.ProcessEnv, message: string): void {
    assert.throws(
        () => getDisposableDatabasePolicy({ ...validEnvironment, ...overrides }),
        message,
    );
}

const policy = getDisposableDatabasePolicy(validEnvironment);
assert.deepEqual(policy, { host: 'localhost', port: 5432, database: 'pho_test', user: 'postgres' });

expectRejectedEnvironment(
    { DATABASE_URL: 'postgres://localhost:password@database.example:5432/pho_test' },
    'A misleading username must not make a remote hostname look local.',
);
expectRejectedEnvironment(
    { DATABASE_URL: 'postgres://postgres:password@localhost:5432/project_test_copy' },
    'A local database whose name merely contains test must be rejected.',
);
expectRejectedEnvironment({ PHO_ALLOW_DESTRUCTIVE_TESTS: 'false' }, 'Explicit opt-in is required.');
expectRejectedEnvironment(
    { PHO_EXPECTED_DB_NAME: 'project_test_copy', DATABASE_URL: 'postgres://postgres:password@localhost:5432/project_test_copy' },
    'Only the exact approved database name may be used.',
);
expectRejectedEnvironment({ PHO_EXPECTED_DB_USER: 'other_user' }, 'The URL user must match.');

const goodConnection = {
    async query<T extends Record<string, unknown>>(): Promise<{ rows: T[] }> {
        return { rows: [{
            database: 'pho_test', user_name: 'postgres', server_address: '127.0.0.1', server_port: 5432,
        } as unknown as T] };
    },
};
assert.equal((await verifyConnectedDatabaseIdentity(goodConnection, policy)).database, 'pho_test');

const ipv6Connection = {
    async query<T extends Record<string, unknown>>(): Promise<{ rows: T[] }> {
        return { rows: [{
            database: 'pho_test', user_name: 'postgres', server_address: '::1/128', server_port: 5432,
        } as unknown as T] };
    },
};
await verifyConnectedDatabaseIdentity(ipv6Connection, policy);

const wrongDatabaseConnection = {
    async query<T extends Record<string, unknown>>(): Promise<{ rows: T[] }> {
        return { rows: [{
            database: 'pho_shared', user_name: 'postgres', server_address: '127.0.0.1', server_port: 5432,
        } as unknown as T] };
    },
};
await assert.rejects(verifyConnectedDatabaseIdentity(wrongDatabaseConnection, policy), /does not match/);

console.log('Phase 1 database safety checks passed.');
