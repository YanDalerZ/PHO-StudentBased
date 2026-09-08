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

async function runPatientInfoTests() {
    console.log('🚀 Starting Patient Info & Animal Bite Integration Tests...');

    const timestamp = Date.now();
    const testAdminEmail = `test_admin_pi_${timestamp}@pho.test`;
    const testTeacherAEmail = `test_teacher_a_pi_${timestamp}@pho.test`;
    const testTeacherBEmail = `test_teacher_b_pi_${timestamp}@pho.test`;
    const testSuperuserEmail = `test_superuser_pi_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];
    const createdPatientInfoIds: number[] = [];
    const createdAnimalBiteIds: number[] = [];

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

        // Get school reference
        const schoolRes = await pool.query(`SELECT s.id, b.municipality_id, s.barangay_id FROM SCHOOLS s JOIN BARANGAYS b ON s.barangay_id = b.id LIMIT 1`);
        if (schoolRes.rows.length === 0) {
            throw new Error('No school found for test');
        }
        const schoolId = schoolRes.rows[0].id;
        const municipalityId = schoolRes.rows[0].municipality_id;
        const barangayId = schoolRes.rows[0].barangay_id;

        // Teacher A registers a test student
        const studentResA = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Male', '2015-05-15', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['StudentA', 'Test', `LRN_A_${timestamp}`, schoolId, municipalityId, barangayId, teacherA.id]
        );
        const studentAId = studentResA.rows[0].id as number;
        createdStudentIds.push(studentAId);
        console.log(`✅ Teacher A student created: id=${studentAId}`);

        // --- 1. TEST: Unauthenticated requests -> 401 ---
        console.log('\nTesting 1: Unauthenticated request to /api/modules/patient-info -> 401');
        const unauthGet = await fetchAPI(`/modules/patient-info/student/${studentAId}`);
        if (unauthGet.status !== 401) {
            throw new Error(`Expected 401 for unauth GET, got ${unauthGet.status}`);
        }
        const unauthPost = await fetchAPI('/modules/patient-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentAId, file_no: 'FILE-001' }),
        });
        if (unauthPost.status !== 401) {
            throw new Error(`Expected 401 for unauth POST, got ${unauthPost.status}`);
        }
        console.log('✅ Unauthenticated requests correctly returned 401');

        // --- 2. TEST: Admin accessing patient info routes -> 403 Forbidden ---
        console.log('\nTesting 2: Admin accessing patient info routes -> 403 Forbidden on all');
        const adminHeaders = { Authorization: `Bearer ${adminUser.token}`, 'Content-Type': 'application/json' };
        const adminRoutes = [
            { method: 'POST', path: '/modules/patient-info', body: { student_id: studentAId } },
            { method: 'GET', path: `/modules/patient-info/student/${studentAId}` },
            { method: 'PUT', path: '/modules/patient-info/1', body: { file_no: 'F' } },
            { method: 'POST', path: '/modules/patient-info/animal-bites', body: { student_id: studentAId, patient_info_id: 1 } },
            { method: 'PUT', path: '/modules/patient-info/animal-bites/1', body: { animal_type: 'DOG' } },
        ];
        for (const route of adminRoutes) {
            const res = await fetchAPI(route.path, {
                method: route.method,
                headers: adminHeaders,
                body: route.body ? JSON.stringify(route.body) : undefined,
            });
            if (res.status !== 403) {
                throw new Error(`Admin got ${res.status} instead of 403 on ${route.method} ${route.path}`);
            }
        }
        console.log('✅ Admin blocked with 403 on all Patient Info & Animal Bite endpoints');

        // --- 3. TEST: Missing student / invalid payload -> 404 / 400 ---
        console.log('\nTesting 3: Non-existent student -> 404; Invalid body -> 400');
        const teacherAHeaders = { Authorization: `Bearer ${teacherA.token}`, 'Content-Type': 'application/json' };
        const notFoundRes = await fetchAPI('/modules/patient-info', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: 9999999, file_no: 'NONE' }),
        });
        if (notFoundRes.status !== 404) {
            throw new Error(`Expected 404 for non-existent student, got ${notFoundRes.status}`);
        }

        const invalidRes = await fetchAPI('/modules/patient-info', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: 'invalid-string' }),
        });
        if (invalidRes.status !== 400) {
            throw new Error(`Expected 400 for invalid body, got ${invalidRes.status}`);
        }
        console.log('✅ 404 and 400 error handlers verified');

        // --- 4. TEST: Teacher A creates Patient Info + Animal Bite ---
        console.log('\nTesting 4: Teacher A creates Patient Info + Animal Bite record for their student');
        const createPayload = {
            student_id: studentAId,
            file_no: `FILE-${timestamp}`,
            animal_bite: {
                rabies_exposure_category: 'CATEGORY II',
                animal_type: 'DOG',
                wash_bite: true,
                type_of_exposure: 'Puncture bite on left hand',
                date_of_exposure: '2026-09-01',
                anatomical_locations: ['Hand'],
                exposure_municipality: 'Kalibo',
                arv_day_0: '2026-09-01',
                arv_day_3: '2026-09-04',
                is_active_case: true,
            },
        };
        const createRes = await fetchAPI<{ data: { patient_info: { id: number; file_no: string; recorded_by: number }; animal_bite?: { id: number; animal_type: string; is_active_case: boolean } } }>('/modules/patient-info', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify(createPayload),
        });

        if (createRes.status !== 201 || !createRes.data?.data?.patient_info) {
            throw new Error(`Failed to create patient info: status ${createRes.status}`);
        }
        const createdPI = createRes.data.data.patient_info;
        const createdBite = createRes.data.data.animal_bite;
        createdPatientInfoIds.push(createdPI.id);
        if (createdBite?.id) createdAnimalBiteIds.push(createdBite.id);

        if (createdPI.recorded_by !== teacherA.id) {
            throw new Error(`recorded_by was ${createdPI.recorded_by}, expected ${teacherA.id}`);
        }
        if (createdPI.file_no !== createPayload.file_no) {
            throw new Error(`file_no mismatch: expected ${createPayload.file_no}, got ${createdPI.file_no}`);
        }
        if (!createdBite || createdBite.animal_type !== 'DOG' || !createdBite.is_active_case) {
            throw new Error('Animal bite sub-record creation failed or returned invalid shape');
        }
        console.log(`✅ Teacher A successfully created Patient Info (id=${createdPI.id}) and Animal Bite (id=${createdBite.id})`);

        // --- 5. TEST: Teacher A reads Patient Info & Animal Bite ---
        console.log('\nTesting 5: Teacher A reads records for their student');
        const getStudentPIRes = await fetchAPI<{ data: { patient_info: { id: number; file_no: string }; animal_bites: Array<{ id: number; animal_type: string }> } }>(`/modules/patient-info/student/${studentAId}`, {
            headers: teacherAHeaders,
        });
        if (getStudentPIRes.status !== 200 || !getStudentPIRes.data?.data?.patient_info) {
            throw new Error(`Expected 200 reading patient info, got ${getStudentPIRes.status}`);
        }
        if (getStudentPIRes.data.data.animal_bites.length !== 1) {
            throw new Error(`Expected 1 animal bite record, got ${getStudentPIRes.data.data.animal_bites.length}`);
        }
        console.log('✅ Teacher A successfully retrieved patient info and animal bite records');

        // --- 6. TEST: Teacher A updates Patient Info & Animal Bite ---
        console.log('\nTesting 6: Teacher A updates Patient Info & Animal Bite');
        const updatePayload = {
            file_no: `FILE-UPDATED-${timestamp}`,
            animal_bite: {
                id: createdBite.id,
                animal_type: 'CAT',
                wash_bite: true,
                is_active_case: false,
            },
        };
        const updateRes = await fetchAPI<{ data: { patient_info: { file_no: string }; animal_bite?: { animal_type: string; is_active_case: boolean } } }>(`/modules/patient-info/${createdPI.id}`, {
            method: 'PUT',
            headers: teacherAHeaders,
            body: JSON.stringify(updatePayload),
        });
        if (updateRes.status !== 200) {
            throw new Error(`Failed to update patient info: status ${updateRes.status}`);
        }
        if (updateRes.data.data.patient_info.file_no !== updatePayload.file_no) {
            throw new Error('Updated file_no did not match');
        }
        if (updateRes.data.data.animal_bite?.animal_type !== 'CAT' || updateRes.data.data.animal_bite?.is_active_case !== false) {
            throw new Error('Updated animal bite fields did not match');
        }
        console.log('✅ Teacher A successfully updated patient info and animal bite');

        // --- 7. TEST: Teacher B isolation from Teacher A's student and records -> 403 ---
        console.log("\nTesting 7: Teacher B isolation from Teacher A's student & records -> 403");
        const teacherBHeaders = { Authorization: `Bearer ${teacherB.token}`, 'Content-Type': 'application/json' };

        // Attempt read
        const bGet = await fetchAPI(`/modules/patient-info/student/${studentAId}`, { headers: teacherBHeaders });
        if (bGet.status !== 403) {
            throw new Error(`Teacher B reading Teacher A student expected 403, got ${bGet.status}`);
        }

        // Attempt create for Teacher A's student
        const bCreate = await fetchAPI('/modules/patient-info', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({ student_id: studentAId, file_no: 'MALICIOUS' }),
        });
        if (bCreate.status !== 403) {
            throw new Error(`Teacher B creating for Teacher A student expected 403, got ${bCreate.status}`);
        }

        // Attempt update of Teacher A's patient info
        const bUpdate = await fetchAPI(`/modules/patient-info/${createdPI.id}`, {
            method: 'PUT',
            headers: teacherBHeaders,
            body: JSON.stringify({ file_no: 'MALICIOUS' }),
        });
        if (bUpdate.status !== 403) {
            throw new Error(`Teacher B updating Teacher A record expected 403, got ${bUpdate.status}`);
        }

        // Attempt create bite for Teacher A's student
        const bBiteCreate = await fetchAPI('/modules/patient-info/animal-bites', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({ student_id: studentAId, patient_info_id: createdPI.id, animal_type: 'DOG' }),
        });
        if (bBiteCreate.status !== 403) {
            throw new Error(`Teacher B creating bite for Teacher A student expected 403, got ${bBiteCreate.status}`);
        }

        // Attempt update bite of Teacher A's student
        const bBiteUpdate = await fetchAPI(`/modules/patient-info/animal-bites/${createdBite.id}`, {
            method: 'PUT',
            headers: teacherBHeaders,
            body: JSON.stringify({ animal_type: 'WOLF' }),
        });
        if (bBiteUpdate.status !== 403) {
            throw new Error(`Teacher B updating Teacher A bite expected 403, got ${bBiteUpdate.status}`);
        }
        console.log('✅ Teacher B strictly forbidden (403) on all access to Teacher A data');

        // --- 8. TEST: Superuser province-wide access ---
        console.log("\nTesting 8: Superuser province-wide access (read and update Teacher A's records)");
        const superuserHeaders = { Authorization: `Bearer ${superuser.token}`, 'Content-Type': 'application/json' };

        const superGet = await fetchAPI<{ data: { patient_info: { id: number }; animal_bites: unknown[] } }>(`/modules/patient-info/student/${studentAId}`, {
            headers: superuserHeaders,
        });
        if (superGet.status !== 200 || !superGet.data?.data?.patient_info) {
            throw new Error(`Superuser failed to read records: status ${superGet.status}`);
        }

        const superUpdate = await fetchAPI<{ data: { patient_info: { file_no: string } } }>(`/modules/patient-info/${createdPI.id}`, {
            method: 'PUT',
            headers: superuserHeaders,
            body: JSON.stringify({ file_no: `SUPERUSER-VERIFIED-${timestamp}` }),
        });
        if (superUpdate.status !== 200 || superUpdate.data?.data?.patient_info?.file_no !== `SUPERUSER-VERIFIED-${timestamp}`) {
            throw new Error(`Superuser failed to update patient info: status ${superUpdate.status}`);
        }

        // Superuser creates dedicated standalone animal bite record
        const superBiteRes = await fetchAPI<{ data: { id: number } }>('/modules/patient-info/animal-bites', {
            method: 'POST',
            headers: superuserHeaders,
            body: JSON.stringify({
                patient_info_id: createdPI.id,
                student_id: studentAId,
                animal_type: 'BAT',
                rabies_exposure_category: 'CATEGORY III',
                is_active_case: true,
            }),
        });
        if (superBiteRes.status !== 201 || !superBiteRes.data?.data?.id) {
            throw new Error(`Superuser standalone bite create failed: status ${superBiteRes.status}`);
        }
        createdAnimalBiteIds.push(superBiteRes.data.data.id);
        console.log('✅ Superuser successfully read, updated, and created records province-wide');

        // --- 9. TEST: Student Profile reflects Completed status ---
        console.log('\nTesting 9: Student Profile reflects patient_info module as Completed (true)');
        const profileRes = await fetchAPI<{ data: { module_summary: { patient_info: boolean }; modules: { patient_info: unknown[] } } }>(`/students/${studentAId}/profile`, {
            headers: teacherAHeaders,
        });
        if (profileRes.status !== 200) {
            throw new Error(`Failed to fetch student profile: status ${profileRes.status}`);
        }
        if (profileRes.data.data.module_summary.patient_info !== true) {
            throw new Error(`Expected module_summary.patient_info to be true, got ${profileRes.data.data.module_summary.patient_info}`);
        }
        if (!Array.isArray(profileRes.data.data.modules.patient_info) || profileRes.data.data.modules.patient_info.length === 0) {
            throw new Error('Expected student profile modules.patient_info array to contain records');
        }

        // Also test GET /api/students/:id
        const detailRes = await fetchAPI<{ data: { modules: { patient_info: boolean } } }>(`/students/${studentAId}`, {
            headers: teacherAHeaders,
        });
        if (detailRes.status !== 200 || detailRes.data.data.modules.patient_info !== true) {
            throw new Error(`Expected GET /api/students/:id to have modules.patient_info === true, got ${detailRes.data?.data?.modules?.patient_info}`);
        }
        console.log('✅ Student Profile correctly displays Patient Info module as Completed');

        console.log('\n🎉 ALL PATIENT INFO & ANIMAL BITE INTEGRATION TESTS PASSED!');
    } finally {
        // --- CLEANUP ---
        console.log('\nCleaning up isolated test data from database...');
        try {
            if (createdAnimalBiteIds.length > 0) {
                await pool.query(`DELETE FROM ANIMAL_BITES WHERE id = ANY($1::int[])`, [createdAnimalBiteIds]);
            }
            if (createdPatientInfoIds.length > 0) {
                await pool.query(`DELETE FROM ANIMAL_BITES WHERE patient_info_id = ANY($1::int[])`, [createdPatientInfoIds]);
                await pool.query(`DELETE FROM PATIENT_INFO WHERE id = ANY($1::int[])`, [createdPatientInfoIds]);
            }
            if (createdStudentIds.length > 0) {
                await pool.query(`DELETE FROM ANIMAL_BITES WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
                await pool.query(`DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
                await pool.query(`DELETE FROM STUDENTS WHERE id = ANY($1::int[])`, [createdStudentIds]);
            }
            if (createdUserIds.length > 0) {
                await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
            }
            console.log('✅ Test data cleaned up safely.');
        } catch (cleanupErr) {
            console.error('⚠️ Cleanup warning:', cleanupErr);
        }
        await pool.end();
    }
}

runPatientInfoTests().catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
