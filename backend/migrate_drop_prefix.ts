import pool from './src/database/db.js';

async function migrate() {
    try {
        console.log("Starting migration to drop 'prefix' column from STUDENTS table...");
        
        await pool.query(`ALTER TABLE STUDENTS DROP COLUMN IF EXISTS prefix;`);
        console.log("Successfully dropped 'prefix' column.");

    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await pool.end();
        console.log("Database connection closed.");
    }
}

migrate();
