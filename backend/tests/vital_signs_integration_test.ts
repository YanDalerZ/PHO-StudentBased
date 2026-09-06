import pool from '../src/database/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const API_URL = 'http://localhost:3000/api';

interface ApiResponse<T = unknown> {
    status: number;
    ok: boolean;
    data: T;
}

async function fetchAPI<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const res = await fetch(`${API_URL}${path}`, options);
    let data: unknown;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    return {
        status: res.status,
        ok: res.ok,
        data: data as T,
    };
}

async function runVitalSignsTests() {
    console.log('🚀 Starting Vital Signs Module Integration Tests...');

    const timestamp = Date.now();
    const testAdminEmail = `test_admin_vs_${timestamp}@pho.test`;
    const testTeacherAEmail = `test_teacher_a_vs_${timestamp}@pho.test`;
    const testTeacherBEmail = `test_teacher_b_vs_${timestamp}@pho.test`;
    const testSuperuserEmail = `test_superuser_vs_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];
    const createdVitalSignsIds: number[] = [];

    const jwtSecret = process.env.JWT_SECRET || 'pho_development_secret_key_2025';

    try {
        // --- 0. Setup isolated test users in DB ---
        console.log('\nSetting up isolated test users in PostgreSQL...');
        const passwordHash = await bcrypt.hash('password123', 10);

        const insertUser = async (email: string, role: string, firstName: string, lastName: string) => {
            const res = await pool.query(
                `INSERT INTO USERS (email, password_hash, role, first_name, last_name, is_active)
                 VALUES ($1, $2, $3, $4, $5, TRUE)
                 RETURNING id`,
                [email, passwordHash, role, firstName, lastName]
            );
            const id = res.rows[0].id as number;
            createdUserIds.push(id);
            const token = jwt.sign({ id, email, role }, jwtSecret, { expiresIn: '1h' });
            return { id, token, email, role };
        };

        const adminUser = await insertUser(testAdminEmail, 'admin', 'Test', 'Admin');
        const teacherA = await insertUser(testTeacherAEmail, 'teacher', 'Teacher', 'Alpha');
        const teacherB = await insertUser(testTeacherBEmail, 'teacher', 'Teacher', 'Beta');
        const superuser = await insertUser(testSuperuserEmail, 'superuser', 'Super', 'User');

        console.log('✅ Created test users (Admin, Teacher A, Teacher B, Superuser)');

        // Retrieve schools for testing
        const schoolRes = await pool.query(
            `SELECT s.id, b.municipality_id, s.barangay_id FROM SCHOOLS s JOIN BARANGAYS b ON s.barangay_id = b.id LIMIT 2`
        );
        if (schoolRes.rows.length < 2) {
            throw new Error('At least 2 schools required for testing');
        }
        const schoolA = schoolRes.rows[0];
        const schoolB = schoolRes.rows[1];

        // Teacher A registers Student A (DOB: 2014-06-15)
        const studentResA = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Female', '2014-06-15', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['VSStudentA', 'Test', `LRN_VS_A_${timestamp}`, schoolA.id, schoolA.municipality_id, schoolA.barangay_id, teacherA.id]
        );
        const studentAId = studentResA.rows[0].id as number;
        createdStudentIds.push(studentAId);

        // Teacher B registers Student B (DOB: 2016-03-20)
        const studentResB = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Male', '2016-03-20', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['VSStudentB', 'Test', `LRN_VS_B_${timestamp}`, schoolB.id, schoolB.municipality_id, schoolB.barangay_id, teacherB.id]
        );
        const studentBId = studentResB.rows[0].id as number;
        createdStudentIds.push(studentBId);

        console.log(`✅ Created test Student A (id: ${studentAId}) and Student B (id: ${studentBId})`);

        // --- 1. Verify Module status before Vital Signs creation ---
        console.log('\n--- Test 1: Verify Initial Module Status (Pending) ---');
        const profileBeforeRes = await fetchAPI<{ data: { modules?: { vital_signs?: boolean } } }>(
            `/students/${studentAId}`,
            {
                headers: { Authorization: `Bearer ${teacherA.token}` },
            }
        );
        if (profileBeforeRes.status !== 200 || profileBeforeRes.data?.data?.modules?.vital_signs !== false) {
            throw new Error(`Expected vital_signs to be false before creation, got: ${JSON.stringify(profileBeforeRes.data)}`);
        }
        console.log('✅ Student Profile initially reports vital_signs = false');

        // --- 2. Unauthenticated Access (401) ---
        console.log('\n--- Test 2: Unauthenticated Access ---');
        const unauthPost = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentAId, date_checked: '2025-08-10' }),
        });
        if (unauthPost.status !== 401) {
            throw new Error(`Expected unauthenticated POST to return 401, got ${unauthPost.status}`);
        }

        const unauthGet = await fetchAPI(`/modules/vital-signs/student/${studentAId}`);
        if (unauthGet.status !== 401) {
            throw new Error(`Expected unauthenticated GET to return 401, got ${unauthGet.status}`);
        }

        const unauthPut = await fetchAPI('/modules/vital-signs/99999', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remarks: 'test' }),
        });
        if (unauthPut.status !== 401) {
            throw new Error(`Expected unauthenticated PUT to return 401, got ${unauthPut.status}`);
        }
        console.log('✅ Unauthenticated requests correctly rejected with 401');

        // --- 3. Admin Access Restriction (403) ---
        console.log('\n--- Test 3: Admin Access Restriction ---');
        const adminPost = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminUser.token}`,
            },
            body: JSON.stringify({ student_id: studentAId, date_checked: '2025-08-10' }),
        });
        if (adminPost.status !== 403) {
            throw new Error(`Expected admin POST to return 403, got ${adminPost.status}`);
        }

        const adminGet = await fetchAPI(`/modules/vital-signs/student/${studentAId}`, {
            headers: { Authorization: `Bearer ${adminUser.token}` },
        });
        if (adminGet.status !== 403) {
            throw new Error(`Expected admin GET to return 403, got ${adminGet.status}`);
        }

        const adminPut = await fetchAPI('/modules/vital-signs/99999', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminUser.token}`,
            },
            body: JSON.stringify({ remarks: 'test' }),
        });
        if (adminPut.status !== 403) {
            throw new Error(`Expected admin PUT to return 403, got ${adminPut.status}`);
        }
        console.log('✅ Admin requests correctly rejected with 403');

        // --- 4. Validation & Physiological Bounds ---
        console.log('\n--- Test 4: Validation & Physiological Bounds ---');

        // 4a. Systolic <= Diastolic (100 <= 110)
        const bpInverted = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                student_id: studentAId,
                date_checked: '2025-08-10',
                blood_pressure_systolic: 100,
                blood_pressure_diastolic: 110,
            }),
        });
        if (bpInverted.status !== 400) {
            throw new Error(`Expected systolic <= diastolic to return 400, got ${bpInverted.status}`);
        }
        console.log('✅ Systolic <= diastolic correctly rejected with 400');

        // 4b. Out of bound temperature (28°C)
        const tempLow = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                student_id: studentAId,
                date_checked: '2025-08-10',
                temperature: 28.0,
            }),
        });
        if (tempLow.status !== 400) {
            throw new Error(`Expected temperature < 30 to return 400, got ${tempLow.status}`);
        }

        // 4c. Out of bound heart rate (280 bpm)
        const hrHigh = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                student_id: studentAId,
                date_checked: '2025-08-10',
                heart_rate: 280,
            }),
        });
        if (hrHigh.status !== 400) {
            throw new Error(`Expected heart_rate > 250 to return 400, got ${hrHigh.status}`);
        }

        // 4d. Out of bound weight (1 kg)
        const weightLow = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                student_id: studentAId,
                date_checked: '2025-08-10',
                weight_kg: 1.0,
            }),
        });
        if (weightLow.status !== 400) {
            throw new Error(`Expected weight_kg < 2 to return 400, got ${weightLow.status}`);
        }

        // 4e. Date checked before DOB (DOB is 2014-06-15, date_checked is 2012-01-01)
        const dateBeforeDob = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                student_id: studentAId,
                date_checked: '2012-01-01',
                blood_pressure_systolic: 110,
                blood_pressure_diastolic: 70,
            }),
        });
        if (dateBeforeDob.status !== 400) {
            throw new Error(`Expected date_checked < DOB to return 400, got ${dateBeforeDob.status}`);
        }
        console.log('✅ Physiological bounds and DOB checks validated with 400');

        // --- 5. Teacher A Creates Valid Vital Signs & Verifies Server-side BMI & recorded_by Protection ---
        console.log('\n--- Test 5: Creation with Server-side BMI & Tamper Protection ---');
        // Student A weight = 45.0 kg, height = 150.0 cm -> BMI = 45 / (1.5^2) = 20.0
        // Client attempts to send fake BMI 99.99 and fake recorded_by 9999
        const validPayload = {
            student_id: studentAId,
            date_checked: '2025-08-15',
            blood_pressure_systolic: 110,
            blood_pressure_diastolic: 72,
            heart_rate: 76,
            respiratory_rate: 18,
            temperature: 36.6,
            weight_kg: 45.0,
            height_cm: 150.0,
            bmi: 99.99, // Should be ignored and recalculated
            recorded_by: 9999, // Should be ignored and overwritten by req.user.id
            remarks: 'Baseline vital signs normal',
        };

        const createRes = await fetchAPI<{ message: string; data: { id: number; bmi: number; recorded_by: number; weight_kg: number; height_cm: number } }>(
            '/modules/vital-signs',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${teacherA.token}`,
                },
                body: JSON.stringify(validPayload),
            }
        );

        if (createRes.status !== 201) {
            throw new Error(`Expected 201 on creation, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
        }

        const createdRecord = createRes.data.data;
        createdVitalSignsIds.push(createdRecord.id);

        if (createdRecord.bmi !== 20.0) {
            throw new Error(`Expected server-calculated BMI to be 20.0, got: ${createdRecord.bmi}`);
        }

        if (createdRecord.recorded_by !== teacherA.id) {
            throw new Error(`Expected recorded_by to be Teacher A (${teacherA.id}), got: ${createdRecord.recorded_by}`);
        }
        console.log(`✅ Record created (id: ${createdRecord.id}) with verified server-computed BMI = 20.0 and secure recorded_by = ${teacherA.id}`);

        // --- 6. Read Vital Signs by Student ---
        console.log('\n--- Test 6: Read Vital Signs by Student ---');
        const getStudentARes = await fetchAPI<{ data: { vital_signs: { id: number; bmi: number }; records: unknown[] } }>(
            `/modules/vital-signs/student/${studentAId}`,
            {
                headers: { Authorization: `Bearer ${teacherA.token}` },
            }
        );
        if (getStudentARes.status !== 200 || !getStudentARes.data?.data?.vital_signs) {
            throw new Error(`Expected 200 with record data, got: ${JSON.stringify(getStudentARes.data)}`);
        }
        if (getStudentARes.data.data.vital_signs.id !== createdRecord.id) {
            throw new Error(`ID mismatch on getVitalSignsByStudent`);
        }
        console.log('✅ Teacher A successfully retrieved Student A vital signs');

        // --- 7. Update Vital Signs with Re-calculation of BMI ---
        console.log('\n--- Test 7: Update Vital Signs & Recompute BMI ---');
        // Update weight to 49.5 kg, height remains 150.0 cm -> BMI = 49.5 / (1.5^2) = 22.0
        const updateRes = await fetchAPI<{ message: string; data: { id: number; bmi: number; weight_kg: number } }>(
            `/modules/vital-signs/${createdRecord.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${teacherA.token}`,
                },
                body: JSON.stringify({
                    weight_kg: 49.5,
                    remarks: 'Follow-up: healthy weight gain',
                }),
            }
        );
        if (updateRes.status !== 200) {
            throw new Error(`Expected 200 on update, got ${updateRes.status}: ${JSON.stringify(updateRes.data)}`);
        }
        if (updateRes.data.data.bmi !== 22.0) {
            throw new Error(`Expected recomputed BMI = 22.0, got: ${updateRes.data.data.bmi}`);
        }
        console.log(`✅ Record updated with re-computed BMI = ${updateRes.data.data.bmi}`);

        // --- 8. Teacher Scope Isolation ---
        console.log('\n--- Test 8: Teacher Scope Isolation ---');
        // Teacher B tries to read Student A's record -> 403
        const teacherBGet = await fetchAPI(`/modules/vital-signs/student/${studentAId}`, {
            headers: { Authorization: `Bearer ${teacherB.token}` },
        });
        if (teacherBGet.status !== 403) {
            throw new Error(`Expected Teacher B accessing Student A to get 403, got ${teacherBGet.status}`);
        }

        // Teacher B tries to update Student A's record -> 403
        const teacherBPut = await fetchAPI(`/modules/vital-signs/${createdRecord.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherB.token}`,
            },
            body: JSON.stringify({ remarks: 'Malicious update' }),
        });
        if (teacherBPut.status !== 403) {
            throw new Error(`Expected Teacher B updating Student A's record to get 403, got ${teacherBPut.status}`);
        }

        // Teacher A tries to create record for Student B (registered by Teacher B) -> 403
        const teacherAPostB = await fetchAPI('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                student_id: studentBId,
                date_checked: '2025-08-15',
                blood_pressure_systolic: 115,
                blood_pressure_diastolic: 75,
            }),
        });
        if (teacherAPostB.status !== 403) {
            throw new Error(`Expected Teacher A creating for Student B to get 403, got ${teacherAPostB.status}`);
        }
        console.log('✅ Teacher scope isolation enforced (Teacher B cannot access Student A; Teacher A cannot access Student B)');

        // --- 9. Superuser Province-wide Access ---
        console.log('\n--- Test 9: Superuser Province-wide Access ---');
        // Superuser reads Student A's record
        const superGet = await fetchAPI<{ data: { vital_signs: { id: number } } }>(
            `/modules/vital-signs/student/${studentAId}`,
            {
                headers: { Authorization: `Bearer ${superuser.token}` },
            }
        );
        if (superGet.status !== 200 || !superGet.data?.data?.vital_signs) {
            throw new Error(`Expected Superuser to read Student A record with 200, got ${superGet.status}`);
        }

        // Superuser updates Student A's record
        const superPut = await fetchAPI<{ message: string; data: { remarks: string } }>(
            `/modules/vital-signs/${createdRecord.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${superuser.token}`,
                },
                body: JSON.stringify({ remarks: 'Verified by PHO Superuser' }),
            }
        );
        if (superPut.status !== 200 || superPut.data?.data?.remarks !== 'Verified by PHO Superuser') {
            throw new Error(`Expected Superuser update to succeed, got ${superPut.status}`);
        }

        // Superuser creates record for Student B
        const superPostB = await fetchAPI<{ message: string; data: { id: number } }>(
            '/modules/vital-signs',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${superuser.token}`,
                },
                body: JSON.stringify({
                    student_id: studentBId,
                    date_checked: '2025-08-16',
                    blood_pressure_systolic: 105,
                    blood_pressure_diastolic: 68,
                    heart_rate: 80,
                    respiratory_rate: 20,
                    temperature: 36.7,
                    weight_kg: 32.0,
                    height_cm: 135.0,
                }),
            }
        );
        if (superPostB.status !== 201) {
            throw new Error(`Expected Superuser creation for Student B to return 201, got ${superPostB.status}`);
        }
        createdVitalSignsIds.push(superPostB.data.data.id);
        console.log('✅ Superuser province-wide read, update, and create access verified');

        // --- 10. Missing Records & Edge Cases ---
        console.log('\n--- Test 10: Missing Records & Edge Cases ---');
        // Non-existent student -> 404
        const nonExistentStudent = await fetchAPI('/modules/vital-signs/student/999999', {
            headers: { Authorization: `Bearer ${teacherA.token}` },
        });
        if (nonExistentStudent.status !== 404) {
            throw new Error(`Expected non-existent student GET to return 404, got ${nonExistentStudent.status}`);
        }

        // Non-existent vital signs record PUT -> 404
        const nonExistentRecordPut = await fetchAPI('/modules/vital-signs/999999', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({ remarks: 'test' }),
        });
        if (nonExistentRecordPut.status !== 404) {
            throw new Error(`Expected non-existent record PUT to return 404, got ${nonExistentRecordPut.status}`);
        }

        // Update with inverted blood pressure -> 400
        const invertedUpdate = await fetchAPI(`/modules/vital-signs/${createdRecord.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                blood_pressure_systolic: 80,
                blood_pressure_diastolic: 95,
            }),
        });
        if (invertedUpdate.status !== 400) {
            throw new Error(`Expected inverted blood pressure in PUT to return 400, got ${invertedUpdate.status}`);
        }
        console.log('✅ Edge cases and missing entity 404/400 errors handled properly');

        // --- 11. Verify Student Profile Module Flag Transition ---
        console.log('\n--- Test 11: Dynamic Student Profile Module Flag Transition ---');
        const profileAfterRes = await fetchAPI<{ data: { modules?: { vital_signs?: boolean } } }>(
            `/students/${studentAId}`,
            {
                headers: { Authorization: `Bearer ${teacherA.token}` },
            }
        );
        if (profileAfterRes.status !== 200 || profileAfterRes.data?.data?.modules?.vital_signs !== true) {
            throw new Error(`Expected vital_signs to be true after creation, got: ${JSON.stringify(profileAfterRes.data)}`);
        }
        console.log('✅ Student Profile dynamically transitions vital_signs flag from false to true');

        console.log('\n🎉 ALL 11 VITAL SIGNS INTEGRATION TESTS PASSED!');
    } finally {
        // --- Cleanup ---
        console.log('\nCleaning up test records from PostgreSQL...');
        if (createdVitalSignsIds.length > 0) {
            await pool.query(`DELETE FROM VITAL_SIGNS WHERE id = ANY($1::int[])`, [createdVitalSignsIds]);
        }
        if (createdStudentIds.length > 0) {
            await pool.query(`DELETE FROM STUDENTS WHERE id = ANY($1::int[])`, [createdStudentIds]);
        }
        if (createdUserIds.length > 0) {
            await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
        }
        console.log('✅ Database cleanup completed successfully');
    }
}

runVitalSignsTests()
    .then(() => {
        console.log('Exiting with code 0');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Vital Signs integration test failed:', err);
        process.exit(1);
    });
