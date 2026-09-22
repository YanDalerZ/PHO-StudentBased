import pool from '../src/database/db.js';
import fs from 'fs';
import path from 'path';
import type { TestContext } from './helpers/testContext.js';

export async function runMigrationTests(context: TestContext): Promise<void> {
    console.log('--- Migration 002 Test ---');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        console.log('1. Setting up isolated pre-v5 schema...');
        await client.query('CREATE SCHEMA IF NOT EXISTS migration_test');
        await client.query('SET search_path TO migration_test');

        // Create pre-v5 dependencies
        await client.query(`CREATE TYPE user_role AS ENUM ('teacher', 'superuser', 'admin')`);
        await client.query(`
            CREATE TABLE USERS (
                id SERIAL PRIMARY KEY,
                role user_role NOT NULL,
                email VARCHAR(255)
            )
        `);
        await client.query(`CREATE TABLE SCHOOLS (id SERIAL PRIMARY KEY)`);
        await client.query(`CREATE TABLE MODULES (id SERIAL PRIMARY KEY)`);
        
        // Setup STUDENTS and PATIENT_INFO to test Foreign Keys
        await client.query(`
            CREATE TABLE STUDENTS (
                id SERIAL PRIMARY KEY,
                student_lrn VARCHAR(50),
                registered_by INT REFERENCES USERS(id)
            )
        `);
        await client.query(`
            CREATE TABLE PATIENT_INFO (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES STUDENTS(id),
                recorded_by INT REFERENCES USERS(id)
            )
        `);
        
        console.log('2. Inserting legacy teacher user and related records...');
        const insertRes = await client.query(`
            INSERT INTO USERS (role, email) VALUES ('teacher', 'legacy_teacher@pho.test') RETURNING id
        `);
        const legacyTeacherId = insertRes.rows[0].id;
        
        const studentRes = await client.query(`
            INSERT INTO STUDENTS (student_lrn, registered_by) VALUES ('12345', $1) RETURNING id
        `, [legacyTeacherId]);
        const studentId = studentRes.rows[0].id;

        await client.query(`
            INSERT INTO PATIENT_INFO (student_id, recorded_by) VALUES ($1, $2)
        `, [studentId, legacyTeacherId]);

        console.log('3. Applying migration 002...');
        const migrationPath = path.join(process.cwd(), 'database', 'migrations', '002_v5_authorization_foundation.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        // Remove BEGIN and COMMIT from the script since we are already in a transaction
        const safeSql = sql.replace(/BEGIN;/g, '').replace(/COMMIT;/g, '');
        await client.query(safeSql);

        console.log('4. Verifying migrated role and FKs...');
        const checkRes = await client.query(`SELECT role FROM USERS WHERE id = $1`, [legacyTeacherId]);
        const user = checkRes.rows[0];
        
        if (user.role !== 'school_staff') {
            throw new Error(`Expected role to be 'school_staff', but got ${user.role}`);
        }
        
        const studentCheck = await client.query(`SELECT registered_by FROM STUDENTS WHERE id = $1`, [studentId]);
        if (studentCheck.rows[0].registered_by !== legacyTeacherId) {
            throw new Error(`STUDENTS FK changed unexpectedly.`);
        }

        const patientCheck = await client.query(`SELECT recorded_by FROM PATIENT_INFO WHERE student_id = $1`, [studentId]);
        if (patientCheck.rows[0].recorded_by !== legacyTeacherId) {
            throw new Error(`PATIENT_INFO FK changed unexpectedly.`);
        }

        console.log('✅ User role successfully migrated from teacher to school_staff');
        console.log('✅ Foreign keys preserved correctly');

        console.log('Migration test passed! Rolling back synthetic schema...');
        await client.query('ROLLBACK');
        console.log('✅ Cleanup complete');
    } catch (err) {
        console.error('❌ Migration test failed:', err);
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
