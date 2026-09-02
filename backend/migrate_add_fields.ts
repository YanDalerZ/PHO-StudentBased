import pool from './src/database/db.js';

async function run() {
    const client = await pool.connect();
    try {
        console.log("Creating/Altering STUDENTS table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                student_lrn VARCHAR(20) UNIQUE NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                middle_name VARCHAR(100),
                last_name VARCHAR(100) NOT NULL,
                suffix VARCHAR(20),
                date_of_birth DATE NOT NULL,
                age INT,
                sex VARCHAR(10) NOT NULL,
                address VARCHAR(500),
                barangay VARCHAR(100),
                municipality VARCHAR(100),
                province VARCHAR(100),
                contact_no VARCHAR(20),
                parent_guardian_name VARCHAR(200),
                parent_guardian_contact VARCHAR(20),
                school_id INT,
                grade_level VARCHAR(50) NOT NULL,
                section VARCHAR(50),
                registered_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                photo_base64 TEXT,
                prefix VARCHAR(50),
                birth_place VARCHAR(255),
                mother_first_name VARCHAR(100),
                mother_last_name VARCHAR(100),
                mother_middle_name VARCHAR(100),
                mother_birth_date DATE
            );
        `);

        console.log("Creating/Altering PATIENT_INFO table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS patient_info (
                id SERIAL PRIMARY KEY,
                student_id INT,
                file_no VARCHAR(50),
                philhealth_id VARCHAR(50),
                criteria VARCHAR(50),
                nationality VARCHAR(100),
                civil_status VARCHAR(50),
                occupation VARCHAR(100),
                has_hypertension BOOLEAN DEFAULT FALSE,
                has_diabetes BOOLEAN DEFAULT FALSE,
                diabetes_duration VARCHAR(100),
                is_deped BOOLEAN DEFAULT FALSE,
                co_morbidities TEXT,
                medical_history TEXT,
                allergies TEXT,
                covid_history TEXT,
                travel_history TEXT,
                dietary_habits TEXT,
                social_habits TEXT,
                recorded_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                educational_attainment VARCHAR(255),
                employment_status VARCHAR(255),
                tin_no VARCHAR(100),
                religion VARCHAR(255),
                blood_type VARCHAR(10)
            );
        `);

        // Array of ALTER commands that we will execute one by one ignoring errors if columns already exist
        const alterCommands = [
            `ALTER TABLE students ADD COLUMN photo_base64 TEXT;`,
            `ALTER TABLE students ADD COLUMN prefix VARCHAR(50);`,
            `ALTER TABLE students ADD COLUMN birth_place VARCHAR(255);`,
            `ALTER TABLE students ADD COLUMN mother_first_name VARCHAR(100);`,
            `ALTER TABLE students ADD COLUMN mother_last_name VARCHAR(100);`,
            `ALTER TABLE students ADD COLUMN mother_middle_name VARCHAR(100);`,
            `ALTER TABLE students ADD COLUMN mother_birth_date DATE;`,
            
            `ALTER TABLE patient_info ADD COLUMN educational_attainment VARCHAR(255);`,
            `ALTER TABLE patient_info ADD COLUMN employment_status VARCHAR(255);`,
            `ALTER TABLE patient_info ADD COLUMN tin_no VARCHAR(100);`,
            `ALTER TABLE patient_info ADD COLUMN religion VARCHAR(255);`,
            `ALTER TABLE patient_info ADD COLUMN blood_type VARCHAR(10);`
        ];

        for (const cmd of alterCommands) {
            try {
                await client.query(cmd);
            } catch (e) {
                // Ignore "column already exists" error
            }
        }

        console.log("Database schema setup successful.");
    } catch (e) {
        console.error("Setup failed:", e);
    } finally {
        client.release();
        process.exit();
    }
}

run();
