import pool from './src/database/db.js';

async function addColumn() {
    try {
        await pool.query('ALTER TABLE USERS ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0');
        console.log('✅ Added failed_login_attempts column to USERS table.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

addColumn();
