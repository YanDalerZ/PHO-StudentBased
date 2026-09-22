import pool from './src/database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assertSafeResetTarget() {
    if (process.env.ALLOW_DATABASE_RESET !== 'true') {
        throw new Error('Database reset refused. Set ALLOW_DATABASE_RESET=true for an intentional local/test reset.');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required');
    }

    const parsed = new URL(databaseUrl);
    const databaseName = decodeURIComponent(parsed.pathname).replace(/^\//, '');
    if (databaseName !== 'pho_dev' && !databaseName.endsWith('_test')) {
        throw new Error(
            `Database reset refused for '${databaseName}'. Only pho_dev or databases ending in _test may be reset.`
        );
    }
}

async function initDB() {
    try {
        assertSafeResetTarget();
        console.log('Connecting to database...');
        const client = await pool.connect();
        
        console.log('Dropping existing tables to reinitialize (if needed)...');
        // Let's drop existing tables using CASCADE so we can recreate them
        await client.query(`
            DROP TABLE IF EXISTS VITAL_SIGNS CASCADE;
            DROP TABLE IF EXISTS IMMUNIZATION CASCADE;
            DROP TABLE IF EXISTS DEWORMING CASCADE;
            DROP TABLE IF EXISTS ORAL_HEALTH CASCADE;
            DROP TABLE IF EXISTS ANIMAL_BITES CASCADE;
            DROP TABLE IF EXISTS PATIENT_INFO CASCADE;
            DROP TABLE IF EXISTS STUDENTS CASCADE;
            DROP TABLE IF EXISTS MODULES CASCADE;
            DROP TABLE IF EXISTS SCHOOLS CASCADE;
            DROP TABLE IF EXISTS USERS CASCADE;
            DROP TABLE IF EXISTS BARANGAYS CASCADE;
            DROP TABLE IF EXISTS MUNICIPALITIES CASCADE;
            DROP TABLE IF EXISTS PROVINCES CASCADE;
            DROP TABLE IF EXISTS REGIONS CASCADE;
            DROP TABLE IF EXISTS COUNTRIES CASCADE;
            DROP TYPE IF EXISTS user_role CASCADE;
            DROP TYPE IF EXISTS gender_enum CASCADE;
            DROP TYPE IF EXISTS service_location_enum CASCADE;
            DROP TYPE IF EXISTS visit_type_enum CASCADE;
            DROP TYPE IF EXISTS school_type_enum CASCADE;
        `);

        console.log('Reading schema.sql...');
        const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf-8');
        
        console.log('Executing schema.sql...');
        await client.query(schema);
        
        console.log('Reading seed.sql...');
        const seed = fs.readFileSync(path.join(__dirname, 'database', 'seed.sql'), 'utf-8');
        
        console.log('Executing seed.sql...');
        await client.query(seed);
        
        console.log('✅ Database initialized successfully!');
        client.release();
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to initialize database:');
        console.error(error);
        process.exit(1);
    }
}

initDB();
