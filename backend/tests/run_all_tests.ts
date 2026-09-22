// tests/run_all_tests.ts
// 1. Set NODE_ENV before importing anything else
process.env.NODE_ENV = 'test';

import type { Server } from 'http';
import type { TestContext } from './helpers/testContext.js';
import type { Pool } from 'pg';

async function main() {
    console.log('🚀 Initializing Phase 1 Test Runner...');
    let server: Server | undefined;
    let pool: Pool | undefined;
    let exitCode = 0;

    try {
        // 2. Dynamic imports
        const { default: app } = await import('../src/app.js');
        pool = (await import('../src/database/db.js')).default;
        
        // 3. Prepare the test database
        console.log('📦 Setting up test DB (schema -> seed -> migrations)...');
        const fs = await import('fs');
        const path = await import('path');
        
        // Strengthened assertion
        if (process.env.NODE_ENV !== 'test') throw new Error('NODE_ENV is not test');
        const testDbUrl = process.env.TEST_DATABASE_URL;
        if (!testDbUrl) throw new Error('TEST_DATABASE_URL is not set');
        
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(testDbUrl);
        } catch {
            throw new Error('TEST_DATABASE_URL is not a valid URL');
        }

        // Decode and validate pathname: must have exactly one non-empty database name (e.g. /dbname)
        const rawPathname = decodeURIComponent(parsedUrl.pathname);
        const pathSegments = rawPathname.split('/').filter(Boolean);
        if (pathSegments.length !== 1 || !pathSegments[0]) {
            throw new Error('TEST_DATABASE_URL pathname must contain exactly one database name');
        }
        const expectedDbName = pathSegments[0];
        
        if (!expectedDbName.endsWith('_test')) {
            throw new Error(`CRITICAL: Parsed test database name '${expectedDbName}' does not end in _test.`);
        }

        const dbRes = await pool.query('SELECT current_database() as db');
        const currentDb = dbRes.rows[0]?.db;
        
        if (!currentDb || !currentDb.endsWith('_test')) {
            throw new Error(`CRITICAL: current_database() '${currentDb}' does not end in _test.`);
        }
        if (currentDb !== expectedDbName) {
            throw new Error(`CRITICAL: current_database() '${currentDb}' does not match parsed TEST_DATABASE_URL '${expectedDbName}'.`);
        }

        console.log(`Guarded test database: ${currentDb}`);

        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        console.log('✅ Cleaned schema');

        const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
        await pool.query(schema);
        console.log('✅ Executed schema.sql');

        // Non-default sequence starts catch accidental hardcoded geographic IDs.
        await pool.query('ALTER SEQUENCE municipalities_id_seq RESTART WITH 101; ALTER SEQUENCE barangays_id_seq RESTART WITH 1001;');
        
        const seed = fs.readFileSync(path.join(process.cwd(), 'database', 'seed.sql'), 'utf8');
        await pool.query(seed);
        console.log('✅ Executed seed.sql');

        const counts = await pool.query<{ municipalities: number; barangays: number; schools: number }>(
            'SELECT (SELECT COUNT(*)::int FROM municipalities) AS municipalities, (SELECT COUNT(*)::int FROM barangays) AS barangays, (SELECT COUNT(*)::int FROM schools) AS schools'
        );
        const totals = counts.rows[0];
        if (!totals || totals.municipalities !== 17 || totals.barangays !== 327 || totals.schools !== 2) {
            throw new Error('Expected seed totals: 17 municipalities, 327 barangays, 2 sample schools.');
        }
        const missing = await pool.query(
            'SELECT m.name FROM municipalities m LEFT JOIN barangays b ON b.municipality_id = m.id GROUP BY m.id, m.name HAVING COUNT(b.id) = 0'
        );
        if (missing.rows.length > 0) throw new Error('Every seeded municipality must have barangays.');
        console.log(`✅ Seed counts: ${totals.municipalities} municipalities, ${totals.barangays} barangays, ${totals.schools} sample schools.`);
        
        const { runMigrations } = await import('../database/run_migrations.js');
        await runMigrations(pool);

        // 4. Start the server on ephemeral port
        server = await new Promise<Server>((resolve, reject) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
            s.on('error', reject);
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to get server address');
        }
        const apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1`;
        console.log(`✅ Server bound to ephemeral port: ${address.port}`);

        const context: TestContext = {
            apiBaseUrl,
            runId: `test_run_${Date.now()}`,
        };

        const { runMigrationTests } = await import('./migration_002.test.js');
        const { runAuthorizationTests } = await import('./authorization.test.js');
        const { runPhase1SmokeTests } = await import('./phase1_smoke_test.js');

        console.log('\n--- 🧪 Running Migration 002 Test ---');
        await runMigrationTests(context);

        console.log('\n--- 🧪 Running Authorization Foundation Tests ---');
        await runAuthorizationTests(context);

        console.log('\n--- 🧪 Running Phase 1 Smoke Tests ---');
        await runPhase1SmokeTests(context);
        
        console.log('\n✅ Certified Suites Passed: Migration 002 test, Authorization boundary tests, Phase 1 smoke tests');
        console.log('Note: Legacy integration tests are NOT included in this run until refactored.');
    } catch (error) {
        console.error('❌ Tests failed:', error);
        exitCode = 1;
    } finally {
        console.log('🛑 Shutting down...');
        const shutdownErrors: unknown[] = [];

        if (server) {
            try {
                await new Promise<void>((resolve, reject) => {
                    server!.close((error) => (error ? reject(error) : resolve()));
                });
                console.log('✅ HTTP server closed cleanly.');
            } catch (serverErr) {
                console.error('❌ HTTP server shutdown error:', serverErr);
                shutdownErrors.push(serverErr);
            }
        }

        if (pool) {
            try {
                await pool.end();
                console.log('✅ PostgreSQL pool closed cleanly.');
            } catch (poolErr) {
                console.error('❌ PostgreSQL pool shutdown error:', poolErr);
                shutdownErrors.push(poolErr);
            }
        }

        if (shutdownErrors.length > 0) {
            console.error(`❌ Suite shutdown encountered ${shutdownErrors.length} error(s).`);
            exitCode = 1;
        }

        process.exit(exitCode);
    }
}

main();
