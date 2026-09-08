import pool from './src/database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Connecting to database...');
        const migrationPath = path.join(__dirname, 'database', 'migrations', '001_oral_health_dmft_expansion.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration:', migrationPath);
        await client.query(sql);
        console.log('Migration executed successfully!');

        console.log('\nVerifying columns in oral_health:');
        const res = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'oral_health'
            ORDER BY ordinal_position;
        `);
        console.table(res.rows);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
