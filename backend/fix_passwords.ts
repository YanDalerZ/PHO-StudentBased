import pool from './src/database/db.js';
import bcrypt from 'bcryptjs';

async function fixPasswords() {
    try {
        const hash = await bcrypt.hash('password123', 10);
        await pool.query('UPDATE USERS SET password_hash = $1', [hash]);
        console.log('✅ Passwords updated to password123 successfully!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixPasswords();
