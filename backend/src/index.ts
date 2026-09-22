import 'dotenv/config';
import pool from './database/db.js';
import app from './app.js';

const PORT = Number(process.env.PORT) || 3000;

// Start Server and Verify Aiven Postgres Connection
app.listen(PORT, '0.0.0.0', async () => {
    try {
        // Test query to confirm Aiven PostgreSQL connection
        const result = await pool.query('SELECT NOW() as current_time, current_setting(\'TIMEZONE\') as tz');
        console.log(`✅ Server running on port ${PORT}`);
        console.log('✅ Connected to Aiven PostgreSQL:', result.rows[0]);
    } catch (err) {
        console.error('❌ Database connection failed.');
        console.error(err);
    }
});