import pool from './src/database/db.js';
async function run() {
    try {
        const studentCols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'students'`);
        const patientInfoCols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'patient_info'`);
        console.log("STUDENTS:", studentCols.rows);
        console.log("PATIENT_INFO:", patientInfoCols.rows);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
