import pool from './src/database/db.js';

async function migrate() {
    const client = await pool.connect();
    console.log("Starting Part 2 Migration...");

    try {
        await client.query('BEGIN');

        const studentColumns = [
            "ADD COLUMN country VARCHAR(100) DEFAULT 'Philippines'",
            "ADD COLUMN region VARCHAR(100) DEFAULT 'Region VI'",
            "ADD COLUMN zip_code VARCHAR(20)",
            "ADD COLUMN email VARCHAR(255)",
            "ADD COLUMN landline_no VARCHAR(50)",
            "ADD COLUMN psa_national_id VARCHAR(50)"
        ];

        for (const col of studentColumns) {
            try {
                await client.query(`ALTER TABLE STUDENTS ${col};`);
                console.log(`Executed: ALTER TABLE STUDENTS ${col}`);
            } catch (err: any) {
                if (err.code === '42701') { // column already exists in postgres
                    console.log(`Column exists, skipping: ${col}`);
                } else {
                    console.error(`Error altering STUDENTS with ${col}:`, err);
                    throw err;
                }
            }
        }

        const patientInfoColumns = [
            "ADD COLUMN indigenous_group VARCHAR(150)",
            "ADD COLUMN dswd_4ps BOOLEAN DEFAULT FALSE",
            "ADD COLUMN dswd_4ps_no VARCHAR(100)",
            "ADD COLUMN is_pwd BOOLEAN DEFAULT FALSE",
            "ADD COLUMN pwd_type VARCHAR(100)",
            "ADD COLUMN pwd_id_no VARCHAR(100)",
            "ADD COLUMN philhealth_member BOOLEAN DEFAULT FALSE",
            "ADD COLUMN philhealth_status_type VARCHAR(100)",
            "ADD COLUMN philhealth_category VARCHAR(255)"
        ];

        for (const col of patientInfoColumns) {
            try {
                await client.query(`ALTER TABLE PATIENT_INFO ${col};`);
                console.log(`Executed: ALTER TABLE PATIENT_INFO ${col}`);
            } catch (err: any) {
                if (err.code === '42701') { 
                    console.log(`Column exists, skipping: ${col}`);
                } else {
                    console.error(`Error altering PATIENT_INFO with ${col}:`, err);
                    throw err;
                }
            }
        }

        await client.query('COMMIT');
        console.log("Migration successful.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", error);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
