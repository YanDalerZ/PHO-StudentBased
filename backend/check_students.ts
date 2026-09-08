import pool from './src/database/db.js';

async function check() {
    const r = await pool.query(
        'SELECT id, student_lrn, first_name, last_name, municipality_id, barangay_id, school_id, grade_level, section, mobile, registered_by FROM STUDENTS'
    );
    console.log('Students in database:');
    console.table(r.rows);
    process.exit(0);
}

check();
