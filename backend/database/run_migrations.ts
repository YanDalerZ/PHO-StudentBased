import pool from '../src/database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(overridePool?: Pool) {
    const activePool = overridePool || pool;
    const client = await activePool.connect();
    try {
        console.log('Connecting to database for migrations...');
        // Ensure schema_migrations table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get applied migrations
        interface MigrationRow {
            version: string;
        }
        const appliedRes = await client.query<MigrationRow>('SELECT version FROM schema_migrations ORDER BY version ASC');
        const appliedMigrations = new Set(appliedRes.rows.map(r => r.version));

        // Read all migrations
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        let appliedCount = 0;

        for (const file of files) {
            if (!appliedMigrations.has(file)) {
                console.log(`Applying migration: ${file}...`);
                const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                    await client.query('COMMIT');
                    console.log(`✅ Successfully applied ${file}`);
                    appliedCount++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Failed to apply migration ${file}:`, err);
                    throw err;
                }
            }
        }

        if (appliedCount === 0) {
            console.log('No new migrations to apply.');
        } else {
            console.log(`\n🎉 Successfully applied ${appliedCount} migrations!`);
        }
    } catch (error) {
        console.error('Migration runner failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
