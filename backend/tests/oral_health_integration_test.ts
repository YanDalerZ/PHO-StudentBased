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

async function runOralHealthTests() {
    console.log('🚀 Starting Oral Health Integration Tests...');

    const timestamp = Date.now();
    const testAdminEmail = `test_admin_oh_${timestamp}@pho.test`;
    const testTeacherAEmail = `test_teacher_a_oh_${timestamp}@pho.test`;
    const testTeacherBEmail = `test_teacher_b_oh_${timestamp}@pho.test`;
    const testSuperuserEmail = `test_superuser_oh_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];
    const createdOralHealthIds: number[] = [];

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
            ) VALUES ($1, $2, 'Female', '2014-03-20', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['DentalStudentA', 'Test', `LRN_OH_${timestamp}`, schoolId, municipalityId, barangayId, teacherA.id]
        );
        const studentAId = studentResA.rows[0].id as number;
        createdStudentIds.push(studentAId);
        console.log(`✅ Teacher A student created: id=${studentAId}`);

        // --- 1. TEST: Unauthenticated requests -> 401 ---
        console.log('\nTesting 1: Unauthenticated request to /api/modules/oral-health -> 401');
        const unauthGet = await fetchAPI(`/modules/oral-health/student/${studentAId}`);
        if (unauthGet.status !== 401) {
            throw new Error(`Expected 401 for unauth GET, got ${unauthGet.status}`);
        }
        const unauthPost = await fetchAPI('/modules/oral-health', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentAId, date_examined: '2026-09-01' }),
        });
        if (unauthPost.status !== 401) {
            throw new Error(`Expected 401 for unauth POST, got ${unauthPost.status}`);
        }
        console.log('✅ Unauthenticated requests correctly returned 401');

        // --- 2. TEST: Admin accessing oral health routes -> 403 Forbidden ---
        console.log('\nTesting 2: Admin accessing oral health routes -> 403 Forbidden on all');
        const adminHeaders = { Authorization: `Bearer ${adminUser.token}`, 'Content-Type': 'application/json' };
        const adminRoutes = [
            { method: 'POST', path: '/modules/oral-health', body: { student_id: studentAId, date_examined: '2026-09-01' } },
            { method: 'GET', path: `/modules/oral-health/student/${studentAId}` },
            { method: 'PUT', path: '/modules/oral-health/1', body: { date_examined: '2026-09-01' } },
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
        console.log('✅ Admin blocked with 403 on all Oral Health endpoints');

        // --- 3. TEST: Validation error handling -> 400; Missing student -> 404 ---
        console.log('\nTesting 3: Validation failure -> 400; Missing student -> 404');
        const teacherAHeaders = { Authorization: `Bearer ${teacherA.token}`, 'Content-Type': 'application/json' };

        // Missing date_examined -> 400
        const badPayloadRes = await fetchAPI('/modules/oral-health', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: studentAId }),
        });
        if (badPayloadRes.status !== 400) {
            throw new Error(`Expected 400 for missing date_examined, got ${badPayloadRes.status}`);
        }

        // Non-existent student -> 404
        const nonExistentRes = await fetchAPI('/modules/oral-health', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: 9999999, date_examined: '2026-09-01' }),
        });
        if (nonExistentRes.status !== 404) {
            throw new Error(`Expected 404 for non-existent student, got ${nonExistentRes.status}`);
        }
        console.log('✅ Validation (400) and missing student (404) properly handled');

        // --- 4. TEST: Teacher A creates Oral Health record ---
        console.log('\nTesting 4: Teacher A creates Oral Health record with tooth chart and DMFT values');
        const upperTeeth = { '18': true, '17': false, '16': true, '11': true, '21': true };
        const lowerTeeth = { '48': true, '47': false, '31': true, '32': true };

        const createPayload = {
            student_id: studentAId,
            date_examined: '2026-09-02',
            is_pregnant: false,
            has_oral_screening: true,
            has_risk_assessment: true,
            has_oral_prophylaxis: true,
            has_counseling: true,
            has_fluoride_varnish: true,
            is_rpoc_complete: true,
            service_location: 'FACILITY',
            visit_type: '1ST VISIT',
            administered_by: 'Dr. Jane Smith, DMD',
            tooth_chart_upper: upperTeeth,
            tooth_chart_lower: lowerTeeth,
            oral_health_condition: '{"c":"10000","g":"00000"}',
            no_of_perm_teeth: 28,
            no_of_perm_sound_teeth: 24,
            no_of_decayed_teeth: 2,
            no_of_missing_teeth: 1,
            no_of_filled_teeth: 1,
            // total_dmft auto calculated to 2+1+1=4
            no_of_primary_teeth: 4,
            no_of_primary_sound_teeth: 2,
            no_of_primary_decayed: 1,
            no_of_primary_missing: 1,
            no_of_primary_filled: 0,
            // total_dmft_primary auto calculated to 1+1+0=2
            remarks_diagnosis: 'Mild dental caries on upper molars',
            recommended_treatment: 'Topical fluoride and sealant',
            treatment_type: 'TF',
            consent_given: true,
            consent_notes: 'Parent signed consent form at school clinic',
            remarks: 'Scheduled for 2nd visit in 6 months',
        };

        const createRes = await fetchAPI<{ data: { id: number; total_dmft: number; total_dmft_primary: number; recorded_by: number; tooth_chart_upper: Record<string, boolean> } }>('/modules/oral-health', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify(createPayload),
        });

        if (createRes.status !== 201 || !createRes.data?.data?.id) {
            throw new Error(`Failed to create oral health record: status ${createRes.status}`);
        }
        const createdRecord = createRes.data.data;
        createdOralHealthIds.push(createdRecord.id);

        if (createdRecord.recorded_by !== teacherA.id) {
            throw new Error(`recorded_by was ${createdRecord.recorded_by}, expected ${teacherA.id}`);
        }
        if (createdRecord.total_dmft !== 4) {
            throw new Error(`total_dmft was ${createdRecord.total_dmft}, expected 4`);
        }
        if (createdRecord.total_dmft_primary !== 2) {
            throw new Error(`total_dmft_primary was ${createdRecord.total_dmft_primary}, expected 2`);
        }
        console.log(`✅ Oral Health record created: id=${createdRecord.id}, total_dmft=4, recorded_by=${createdRecord.recorded_by}`);

        // --- 5. TEST: Teacher A reads and verifies exact tooth chart and DMFT persistence ---
        console.log('\nTesting 5: Verify tooth chart and DMFT values persist accurately upon retrieval');
        const getRes = await fetchAPI<{ data: { oral_health: { id: number; tooth_chart_upper: Record<string, boolean>; total_dmft: number; is_rpoc_complete: boolean; date_examined: string } } }>(`/modules/oral-health/student/${studentAId}`, {
            headers: teacherAHeaders,
        });
        if (getRes.status !== 200 || !getRes.data?.data?.oral_health) {
            throw new Error(`Failed to read oral health records: status ${getRes.status}`);
        }
        const loadedRecord = getRes.data.data.oral_health;
        if (loadedRecord.id !== createdRecord.id) {
            throw new Error(`Record ID mismatch: expected ${createdRecord.id}, got ${loadedRecord.id}`);
        }
        if (loadedRecord.tooth_chart_upper['18'] !== true || loadedRecord.tooth_chart_upper['17'] !== false) {
            throw new Error('Tooth chart upper JSON was corrupted or not preserved');
        }
        if (loadedRecord.total_dmft !== 4 || !loadedRecord.is_rpoc_complete) {
            throw new Error('DMFT or RPOC status was not preserved');
        }
        console.log('✅ Tooth chart and DMFT data persisted and retrieved with 100% accuracy');

        // --- 6. TEST: Teacher A updates record ---
        console.log('\nTesting 6: Teacher A updates the Oral Health record');
        const updatePayload = {
            no_of_decayed_teeth: 1,
            no_of_filled_teeth: 2,
            treatment_type: 'OP',
            remarks: 'Treatment completed successfully during 1st visit',
        };
        const updateRes = await fetchAPI<{ data: { total_dmft: number; treatment_type: string; remarks: string } }>(`/modules/oral-health/${createdRecord.id}`, {
            method: 'PUT',
            headers: teacherAHeaders,
            body: JSON.stringify(updatePayload),
        });
        if (updateRes.status !== 200) {
            throw new Error(`Failed to update oral health record: status ${updateRes.status}`);
        }
        // New total DMFT should be 1 decayed + 1 missing + 2 filled = 4
        if (updateRes.data.data.total_dmft !== 4 || updateRes.data.data.treatment_type !== 'OP') {
            throw new Error('Updated fields mismatch');
        }
        console.log('✅ Oral Health record successfully updated');

        // --- 7. TEST: Teacher B isolation from Teacher A's student/records -> 403 Forbidden ---
        console.log("\nTesting 7: Teacher B isolation from Teacher A's student & records -> 403");
        const teacherBHeaders = { Authorization: `Bearer ${teacherB.token}`, 'Content-Type': 'application/json' };

        // Attempt read
        const bGet = await fetchAPI(`/modules/oral-health/student/${studentAId}`, { headers: teacherBHeaders });
        if (bGet.status !== 403) {
            throw new Error(`Teacher B reading Teacher A student expected 403, got ${bGet.status}`);
        }

        // Attempt create
        const bCreate = await fetchAPI('/modules/oral-health', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({ student_id: studentAId, date_examined: '2026-09-03' }),
        });
        if (bCreate.status !== 403) {
            throw new Error(`Teacher B creating for Teacher A student expected 403, got ${bCreate.status}`);
        }

        // Attempt update
        const bUpdate = await fetchAPI(`/modules/oral-health/${createdRecord.id}`, {
            method: 'PUT',
            headers: teacherBHeaders,
            body: JSON.stringify({ treatment_type: 'EXO' }),
        });
        if (bUpdate.status !== 403) {
            throw new Error(`Teacher B updating Teacher A record expected 403, got ${bUpdate.status}`);
        }
        console.log('✅ Teacher B strictly forbidden (403) on all access to Teacher A data');

        // --- 8. TEST: Superuser province-wide access ---
        console.log("\nTesting 8: Superuser province-wide access (read & update Teacher A's records)");
        const superuserHeaders = { Authorization: `Bearer ${superuser.token}`, 'Content-Type': 'application/json' };

        const superGet = await fetchAPI<{ data: { oral_health: { id: number } } }>(`/modules/oral-health/student/${studentAId}`, {
            headers: superuserHeaders,
        });
        if (superGet.status !== 200 || !superGet.data?.data?.oral_health) {
            throw new Error(`Superuser failed to read record: status ${superGet.status}`);
        }

        const superUpdate = await fetchAPI<{ data: { remarks_diagnosis: string } }>(`/modules/oral-health/${createdRecord.id}`, {
            method: 'PUT',
            headers: superuserHeaders,
            body: JSON.stringify({ remarks_diagnosis: 'Superuser verified diagnosis' }),
        });
        if (superUpdate.status !== 200 || superUpdate.data?.data?.remarks_diagnosis !== 'Superuser verified diagnosis') {
            throw new Error(`Superuser failed to update record: status ${superUpdate.status}`);
        }
        console.log('✅ Superuser province-wide read and update verified successfully');

        // --- 9. TEST: Student Profile reflects Completed status ---
        console.log('\nTesting 9: Student Profile reflects oral_health module as Completed (true)');
        const profileRes = await fetchAPI<{ data: { module_summary: { oral_health: boolean }; modules: { oral_health: unknown[] } } }>(`/students/${studentAId}/profile`, {
            headers: teacherAHeaders,
        });
        if (profileRes.status !== 200) {
            throw new Error(`Failed to fetch student profile: status ${profileRes.status}`);
        }
        if (profileRes.data.data.module_summary.oral_health !== true) {
            throw new Error(`Expected module_summary.oral_health to be true, got ${profileRes.data.data.module_summary.oral_health}`);
        }
        if (!Array.isArray(profileRes.data.data.modules.oral_health) || profileRes.data.data.modules.oral_health.length === 0) {
            throw new Error('Expected student profile modules.oral_health array to contain records');
        }

        // Also test GET /api/students/:id
        const detailRes = await fetchAPI<{ data: { modules: { oral_health: boolean } } }>(`/students/${studentAId}`, {
            headers: teacherAHeaders,
        });
        if (detailRes.status !== 200 || detailRes.data.data.modules.oral_health !== true) {
            throw new Error(`Expected GET /api/students/:id to have modules.oral_health === true, got ${detailRes.data?.data?.modules?.oral_health}`);
        }
        console.log('✅ Student Profile correctly displays Oral Health module as Completed');

        console.log('\n🎉 ALL ORAL HEALTH INTEGRATION TESTS PASSED!');
    } finally {
        // --- CLEANUP ---
        console.log('\nCleaning up isolated test data from database...');
        try {
            if (createdOralHealthIds.length > 0) {
                await pool.query(`DELETE FROM ORAL_HEALTH WHERE id = ANY($1::int[])`, [createdOralHealthIds]);
            }
            if (createdStudentIds.length > 0) {
                await pool.query(`DELETE FROM ORAL_HEALTH WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
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

runOralHealthTests().catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
