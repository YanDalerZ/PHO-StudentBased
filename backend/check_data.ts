import pool from './src/database/db.js';

async function check() {
    const r = await pool.query(`
        SELECT m.id, m.name, 
            (SELECT COUNT(*) FROM BARANGAYS b WHERE b.municipality_id = m.id) as bgy_count
        FROM MUNICIPALITIES m ORDER BY m.id
    `);
    console.table(r.rows);

    const s = await pool.query('SELECT id, name, barangay_id FROM SCHOOLS ORDER BY id');
    console.log('\nSchools:');
    console.table(s.rows);

    process.exit(0);
}

check();
