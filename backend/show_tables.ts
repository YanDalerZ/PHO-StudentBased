import pool from './src/database/db.js';

async function run() {
    try {
        const res = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public';");
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
