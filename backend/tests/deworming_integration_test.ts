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

async function runDewormingTests() {
    console.log('🚀 Starting Deworming Module Integration Tests...');

    const timestamp = Date.now();
    const testAdminEmail = `test_admin_deworm_${timestamp}@pho.test`;
    const testTeacherAEmail = `test_teacher_a_deworm_${timestamp}@pho.test`;
    const testTeacherBEmail = `test_teacher_b_deworm_${timestamp}@pho.test`;
    const testSuperuserEmail = `test_superuser_deworm_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];
    const createdDewormingIds: number[] = [];

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

        // Retrieve schools for testing school scope
        const schoolRes = await pool.query(
            `SELECT s.id, b.municipality_id, s.barangay_id FROM SCHOOLS s JOIN BARANGAYS b ON s.barangay_id = b.id LIMIT 2`
        );
        if (schoolRes.rows.length < 2) {
            throw new Error('At least 2 schools required for testing');
        }
        const schoolA = schoolRes.rows[0];
        const schoolB = schoolRes.rows[1];

        // Teacher A registers Student A (DOB: 2016-05-15, aged 10 on 2026-06-01)
        const studentResA = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Female', '2016-05-15', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['DewormStudentA', 'Test', `LRN_DW_A_${timestamp}`, schoolA.id, schoolA.municipality_id, schoolA.barangay_id, teacherA.id]
        );
        const studentAId = studentResA.rows[0].id as number;
        createdStudentIds.push(studentAId);

        // Teacher B registers Student B (DOB: 2018-08-20, aged 7 on 2026-06-01)
        const studentResB = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Male', '2018-08-20', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['DewormStudentB', 'Test', `LRN_DW_B_${timestamp}`, schoolB.id, schoolB.municipality_id, schoolB.barangay_id, teacherB.id]
        );
        const studentBId = studentResB.rows[0].id as number;
        createdStudentIds.push(studentBId);

        console.log(`✅ Test students created: Student A (id=${studentAId}), Student B (id=${studentBId})`);

        // --- 1. TEST: Unauthenticated requests -> 401 ---
        console.log('\nTesting 1: Unauthenticated request to /api/modules/deworming -> 401');
        const unauthGet = await fetchAPI(`/modules/deworming/student/${studentAId}`);
        if (unauthGet.status !== 401) {
            throw new Error(`Expected 401 for unauth GET, got ${unauthGet.status}`);
        }
        const unauthPost = await fetchAPI('/modules/deworming', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentAId, date_dewormed: '2026-06-01' }),
        });
        if (unauthPost.status !== 401) {
            throw new Error(`Expected 401 for unauth POST, got ${unauthPost.status}`);
        }
        console.log('✅ Unauthenticated requests correctly returned 401');

        // --- 2. TEST: Admin accessing deworming routes -> 403 Forbidden ---
        console.log('\nTesting 2: Admin accessing deworming routes -> 403 Forbidden on all');
        const adminHeaders = { Authorization: `Bearer ${adminUser.token}`, 'Content-Type': 'application/json' };
        const adminRoutes = [
            { method: 'POST', path: '/modules/deworming', body: { student_id: studentAId, date_dewormed: '2026-06-01' } },
            { method: 'GET', path: `/modules/deworming/student/${studentAId}` },
            { method: 'PUT', path: '/modules/deworming/1', body: { date_dewormed: '2026-06-01' } },
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
        console.log('✅ Admin blocked with 403 on all Deworming endpoints');

        // --- 3. TEST: Validation error handling -> 400; Missing student -> 404 ---
        console.log('\nTesting 3: Validation failure -> 400; Missing student -> 404');
        const teacherAHeaders = { Authorization: `Bearer ${teacherA.token}`, 'Content-Type': 'application/json' };

        // Missing date_dewormed -> 400
        const badPayloadRes = await fetchAPI('/modules/deworming', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: studentAId }),
        });
        if (badPayloadRes.status !== 400) {
            throw new Error(`Expected 400 for missing date_dewormed, got ${badPayloadRes.status}`);
        }

        // Non-existent student -> 404
        const nonExistentRes = await fetchAPI('/modules/deworming', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: 9999999, date_dewormed: '2026-06-01' }),
        });
        if (nonExistentRes.status !== 404) {
            throw new Error(`Expected 404 for non-existent student, got ${nonExistentRes.status}`);
        }
        console.log('✅ Validation (400) and missing student (404) properly handled');

        // --- 4. TEST: Impossible Date of Birth / Date Dewormed combination -> 400 ---
        console.log('\nTesting 4: Impossible date combination (date_dewormed < date_of_birth) -> 400');
        const impossibleDateRes = await fetchAPI('/modules/deworming', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                date_dewormed: '2010-01-01', // DOB is 2016-05-15
            }),
        });
        if (impossibleDateRes.status !== 400) {
            throw new Error(`Expected 400 for impossible date combination, got ${impossibleDateRes.status}`);
        }
        console.log('✅ Impossible date combination rejected with 400 Bad Request');

        // --- 5. TEST: School Scope Validation -> 403 for unauthorized teacher school override ---
        console.log('\nTesting 5: School scope validation -> 403 for teacher assigning different school');
        const unauthorizedSchoolRes = await fetchAPI('/modules/deworming', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                date_dewormed: '2026-06-01',
                school_id: schoolB.id, // School B is different from Student A's enrolled School A
            }),
        });
        if (unauthorizedSchoolRes.status !== 403) {
            throw new Error(`Expected 403 for teacher overriding school scope, got ${unauthorizedSchoolRes.status}`);
        }
        console.log('✅ School scope override blocked with 403 Forbidden');

        // --- 6. TEST: Teacher A creates Deworming record with omitted age_group -> auto-derived ---
        console.log('\nTesting 6: Teacher A creates Deworming record (omitted age_group auto-derived from DOB)');
        const createRes = await fetchAPI<{ data: { id: number; age_group: string; recorded_by: number; student_id: number; medication_given: string; is_dewormed: boolean; in_school: boolean } }>('/modules/deworming', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                date_dewormed: '2026-06-01', // DOB: 2016-05-15 -> Age 10 -> Expected: '10-14'
                medication_given: 'Albendazole 400mg',
                is_dewormed: true,
                school_type: 'public',
                in_school: true,
                remarks: 'Regular 1st round deworming',
            }),
        });

        if (createRes.status !== 201 || !createRes.data?.data?.id) {
            throw new Error(`Expected 201 with record data, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
        }

        const dewormingA = createRes.data.data;
        const dewormingAId = dewormingA.id;
        createdDewormingIds.push(dewormingAId);

        if (dewormingA.age_group !== '10-14') {
            throw new Error(`Expected auto-derived age_group '10-14', got '${dewormingA.age_group}'`);
        }
        if (dewormingA.recorded_by !== teacherA.id) {
            throw new Error(`Expected recorded_by=${teacherA.id}, got ${dewormingA.recorded_by}`);
        }
        if (dewormingA.student_id !== studentAId) {
            throw new Error(`Expected student_id=${studentAId}, got ${dewormingA.student_id}`);
        }
        console.log(`✅ Deworming record created: id=${dewormingAId}, age_group=${dewormingA.age_group}, recorded_by=${dewormingA.recorded_by}`);

        // --- 7. TEST: Teacher A reloads Deworming records for Student A ---
        console.log('\nTesting 7: Teacher A reloads Deworming records via GET /api/modules/deworming/student/:studentId');
        const getStudentDewormRes = await fetchAPI<{ data: { deworming: { id: number; age_group: string; medication_given: string }; records: unknown[] } }>(
            `/modules/deworming/student/${studentAId}`,
            { headers: teacherAHeaders }
        );

        if (getStudentDewormRes.status !== 200 || !getStudentDewormRes.data?.data?.deworming) {
            throw new Error(`Expected 200 with deworming record, got ${getStudentDewormRes.status}`);
        }
        if (getStudentDewormRes.data.data.deworming.id !== dewormingAId) {
            throw new Error(`Expected record id ${dewormingAId}, got ${getStudentDewormRes.data.data.deworming.id}`);
        }
        if (getStudentDewormRes.data.data.deworming.age_group !== '10-14') {
            throw new Error(`Expected age_group '10-14', got ${getStudentDewormRes.data.data.deworming.age_group}`);
        }
        console.log('✅ Teacher A successfully retrieved student deworming records');

        // --- 8. TEST: Teacher A updates the Deworming record ---
        console.log('\nTesting 8: Teacher A updates Deworming record via PUT /api/modules/deworming/:id');
        const updateRes = await fetchAPI<{ data: { remarks: string; medication_given: string; age_group: string } }>(
            `/modules/deworming/${dewormingAId}`,
            {
                method: 'PUT',
                headers: teacherAHeaders,
                body: JSON.stringify({
                    medication_given: 'Mebendazole 500mg Chewable',
                    remarks: 'Updated dosage per health guidelines',
                }),
            }
        );

        if (updateRes.status !== 200 || !updateRes.data?.data) {
            throw new Error(`Expected 200 on update, got ${updateRes.status}`);
        }
        if (updateRes.data.data.medication_given !== 'Mebendazole 500mg Chewable') {
            throw new Error(`Update failed, medication_given is '${updateRes.data.data.medication_given}'`);
        }
        if (updateRes.data.data.remarks !== 'Updated dosage per health guidelines') {
            throw new Error(`Update failed, remarks is '${updateRes.data.data.remarks}'`);
        }
        console.log('✅ Teacher A successfully updated Deworming record');

        // --- 9. TEST: Teacher B isolation -> 403 for Teacher A's student and record ---
        console.log('\nTesting 9: Teacher B receives 403 for Teacher A student/record');
        const teacherBHeaders = { Authorization: `Bearer ${teacherB.token}`, 'Content-Type': 'application/json' };

        // GET student A's deworming records -> 403
        const teacherBGet = await fetchAPI(`/modules/deworming/student/${studentAId}`, { headers: teacherBHeaders });
        if (teacherBGet.status !== 403) {
            throw new Error(`Expected 403 for Teacher B GET student A records, got ${teacherBGet.status}`);
        }

        // POST for student A -> 403
        const teacherBPost = await fetchAPI('/modules/deworming', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({ student_id: studentAId, date_dewormed: '2026-06-01' }),
        });
        if (teacherBPost.status !== 403) {
            throw new Error(`Expected 403 for Teacher B POST to student A, got ${teacherBPost.status}`);
        }

        // PUT for student A's record -> 403
        const teacherBPut = await fetchAPI(`/modules/deworming/${dewormingAId}`, {
            method: 'PUT',
            headers: teacherBHeaders,
            body: JSON.stringify({ remarks: 'Malicious modification' }),
        });
        if (teacherBPut.status !== 403) {
            throw new Error(`Expected 403 for Teacher B PUT on student A record, got ${teacherBPut.status}`);
        }
        console.log('✅ Teacher B correctly blocked with 403 on all Teacher A student Deworming actions');

        // --- 10. TEST: Superuser has province-wide access to view and update ---
        console.log('\nTesting 10: Superuser has province-wide read/update access');
        const superuserHeaders = { Authorization: `Bearer ${superuser.token}`, 'Content-Type': 'application/json' };

        // Superuser GET Teacher A's student deworming record -> 200
        const superuserGet = await fetchAPI<{ data: { deworming: { id: number } } }>(
            `/modules/deworming/student/${studentAId}`,
            { headers: superuserHeaders }
        );
        if (superuserGet.status !== 200 || !superuserGet.data?.data?.deworming) {
            throw new Error(`Expected 200 for superuser GET, got ${superuserGet.status}`);
        }

        // Superuser PUT Teacher A's record -> 200
        const superuserPut = await fetchAPI<{ data: { remarks: string } }>(
            `/modules/deworming/${dewormingAId}`,
            {
                method: 'PUT',
                headers: superuserHeaders,
                body: JSON.stringify({ remarks: 'Verified by Provincial Superuser' }),
            }
        );
        if (superuserPut.status !== 200 || superuserPut.data?.data?.remarks !== 'Verified by Provincial Superuser') {
            throw new Error(`Expected 200 for superuser PUT, got ${superuserPut.status}`);
        }
        console.log('✅ Superuser province-wide read and update succeeded');

        // --- 11. TEST: Student Profile Module Summary (Pending -> Completed) ---
        console.log('\nTesting 11: Student Profile module summary changes from Pending to Completed');

        // Student B starts with no Deworming record -> has_deworming must be false
        const profileBeforeRes = await fetchAPI<{ data: { modules?: { deworming?: boolean } } }>(
            `/students/${studentBId}`,
            { headers: teacherBHeaders }
        );
        if (profileBeforeRes.status !== 200) {
            throw new Error(`Expected 200 for student profile, got ${profileBeforeRes.status}`);
        }
        if (profileBeforeRes.data?.data?.modules?.deworming !== false) {
            throw new Error(`Expected modules.deworming to be false before record creation, got ${profileBeforeRes.data?.data?.modules?.deworming}`);
        }
        console.log('  Confirmed: Student B deworming module status is Pending (false)');

        // Teacher B creates Deworming record for Student B
        const teacherBCreateRes = await fetchAPI<{ data: { id: number } }>('/modules/deworming', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({
                student_id: studentBId,
                date_dewormed: '2026-06-02',
                medication_given: 'Albendazole 400mg',
            }),
        });
        if (teacherBCreateRes.status !== 201 || !teacherBCreateRes.data?.data?.id) {
            throw new Error(`Expected 201 for Teacher B deworming creation, got ${teacherBCreateRes.status}`);
        }
        createdDewormingIds.push(teacherBCreateRes.data.data.id);

        // Fetch Student B again -> modules.deworming must now be true (Completed)!
        const profileAfterRes = await fetchAPI<{ data: { modules?: { deworming?: boolean } } }>(
            `/students/${studentBId}`,
            { headers: teacherBHeaders }
        );
        if (profileAfterRes.status !== 200) {
            throw new Error(`Expected 200 for student profile after record creation, got ${profileAfterRes.status}`);
        }
        if (profileAfterRes.data?.data?.modules?.deworming !== true) {
            throw new Error(`Expected modules.deworming to be true after record creation, got ${profileAfterRes.data?.data?.modules?.deworming}`);
        }

        // Full profile endpoint verification (/api/students/:id/profile)
        const fullProfileRes = await fetchAPI<{ data: { module_summary: { deworming: boolean }; modules: { deworming: unknown[] } } }>(
            `/students/${studentBId}/profile`,
            { headers: teacherBHeaders }
        );
        if (fullProfileRes.status !== 200) {
            throw new Error(`Expected 200 for full student profile, got ${fullProfileRes.status}`);
        }
        if (fullProfileRes.data?.data?.module_summary?.deworming !== true) {
            throw new Error(`Expected module_summary.deworming to be true, got ${fullProfileRes.data?.data?.module_summary?.deworming}`);
        }
        if (!fullProfileRes.data?.data?.modules?.deworming?.length) {
            throw new Error('Expected modules.deworming array to contain at least 1 record');
        }
        console.log('✅ Student Profile reflects Deworming as Completed (true) after record is saved');

        // --- 12. TEST: Missing Deworming record on PUT -> 404 ---
        console.log('\nTesting 12: Missing Deworming record on PUT -> 404');
        const notFoundPut = await fetchAPI('/modules/deworming/9999999', {
            method: 'PUT',
            headers: teacherAHeaders,
            body: JSON.stringify({ remarks: 'Ghost update' }),
        });
        if (notFoundPut.status !== 404) {
            throw new Error(`Expected 404 for non-existent record update, got ${notFoundPut.status}`);
        }
        console.log('✅ Non-existent deworming record update returns 404');

        console.log('\n🎉 ALL 12 DEWORMING INTEGRATION TESTS PASSED SUCCESSFULLY!');
    } finally {
        console.log('\nCleaning up test artifacts in PostgreSQL...');
        if (createdDewormingIds.length > 0) {
            await pool.query('DELETE FROM DEWORMING WHERE id = ANY($1)', [createdDewormingIds]);
        }
        if (createdStudentIds.length > 0) {
            await pool.query('DELETE FROM STUDENTS WHERE id = ANY($1)', [createdStudentIds]);
        }
        if (createdUserIds.length > 0) {
            await pool.query('DELETE FROM USERS WHERE id = ANY($1)', [createdUserIds]);
        }
        console.log('✅ Test cleanup completed');
        await pool.end();
    }
}

runDewormingTests().catch((err) => {
    console.error('\n❌ Deworming integration test failed:', err);
    process.exit(1);
});
