import pool from './src/database/db.js';

async function updatePhotoUrl() {
    try {
        await pool.query('ALTER TABLE STUDENTS ALTER COLUMN photo_url TYPE TEXT');
        console.log('✅ Altered STUDENTS.photo_url to TEXT.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

updatePhotoUrl();
