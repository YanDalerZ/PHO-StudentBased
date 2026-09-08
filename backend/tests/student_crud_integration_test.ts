import pool from '../src/database/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const API_URL = 'http://localhost:3000/api';

async function fetchAPI(path: string, options: RequestInit = {}) {
    const res = await fetch(`${API_URL}${path}`, options);
    let data: any;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    return {
        status: res.status,
        ok: res.ok,
        data,
    };
}

async function runStudentCrudTests() {
    console.log('🚀 Starting Comprehensive Student CRUD Integration Tests...');

    const timestamp = Date.now();
    const testAdminEmail = `test_admin_${timestamp}@pho.test`;
    const testTeacherAEmail = `test_teacher_a_${timestamp}@pho.test`;
    const testTeacherBEmail = `test_teacher_b_${timestamp}@pho.test`;
    const testSuperuserEmail = `test_superuser_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];

    const jwtSecret = process.env.JWT_SECRET || 'pho_development_secret_key_2025';

    try {
        // --- 0. PREPARATION: Setup isolated test users in DB ---
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

        // Get a valid school and municipality for references
        const schoolRes = await pool.query(`SELECT s.id, s.name, s.barangay_id, b.municipality_id FROM SCHOOLS s JOIN BARANGAYS b ON s.barangay_id = b.id LIMIT 1`);
        if (schoolRes.rows.length === 0) {
            throw new Error('No schools found in database for testing');
        }
        const testSchool = schoolRes.rows[0];
        const schoolId = testSchool.id;
        const barangayId = testSchool.barangay_id;
        const municipalityId = testSchool.municipality_id;

        // --- 1. TEST: No token -> 401 Unauthorized ---
        console.log('\nTesting 1: Unauthenticated request to /api/students -> 401');
        const unauthGet = await fetchAPI('/students');
        if (unauthGet.status !== 401) {
            throw new Error(`Expected 401 for unauthenticated GET /students, got ${unauthGet.status}`);
        }
        const unauthPost = await fetchAPI('/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: 'Test' })
        });
        if (unauthPost.status !== 401) {
            throw new Error(`Expected 401 for unauthenticated POST /students, got ${unauthPost.status}`);
        }
        console.log('✅ Unauthenticated requests correctly returned 401');

        // --- 2. TEST: Admin accessing each student route -> 403 Forbidden ---
        console.log('\nTesting 2: Admin accessing student routes -> 403 Forbidden on all');
        const adminHeaders = { Authorization: `Bearer ${adminUser.token}`, 'Content-Type': 'application/json' };

        const adminRoutesToTest = [
            { method: 'GET', path: '/students' },
            { method: 'POST', path: '/students', body: { first_name: 'Admin' } },
            { method: 'GET', path: '/students/1' },
            { method: 'PUT', path: '/students/1', body: { first_name: 'Admin' } },
            { method: 'GET', path: '/students/1/profile' }
        ];

        for (const route of adminRoutesToTest) {
            const res = await fetchAPI(route.path, {
                method: route.method,
                headers: adminHeaders,
                ...(route.body ? { body: JSON.stringify(route.body) } : {})
            });
            if (res.status !== 403) {
                throw new Error(`Expected 403 for Admin on ${route.method} ${route.path}, got ${res.status} (${JSON.stringify(res.data)})`);
            }
        }
        console.log('✅ Admin blocked with 403 on all 5 Student endpoints');

        // --- 3. TEST: Validation error -> 400 Bad Request ---
        console.log('\nTesting 3: Invalid student payload -> 400 Bad Request');
        const teacherAHeaders = { Authorization: `Bearer ${teacherA.token}`, 'Content-Type': 'application/json' };
        const invalidPayloadRes = await fetchAPI('/students', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                // Missing required first_name, last_name, sex, date_of_birth, student_lrn
                first_name: ''
            })
        });
        if (invalidPayloadRes.status !== 400) {
            throw new Error(`Expected 400 for invalid payload, got ${invalidPayloadRes.status}`);
        }
        console.log('✅ Zod validation rejected invalid payload with 400');

        // --- 4. TEST: Teacher A creates a student ---
        console.log('\nTesting 4: Teacher A creates a student');
        const lrnA = `LRN-${timestamp}-A`;
        const studentAPayload = {
            first_name: 'Juan',
            middle_name: 'Protacio',
            last_name: 'Rizal',
            suffix: 'NOT APPLICABLE',
            sex: 'Male',
            date_of_birth: '2015-06-19',
            student_lrn: lrnA,
            school_id: schoolId,
            municipality_id: municipalityId,
            barangay_id: barangayId,
            grade_level: 'Grade 3',
            section: 'Mabini'
        };

        const createResA = await fetchAPI('/students', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify(studentAPayload)
        });

        if (createResA.status !== 201 || !createResA.data?.id) {
            throw new Error(`Failed to create student for Teacher A: ${createResA.status} - ${JSON.stringify(createResA.data)}`);
        }
        const studentAId = createResA.data.id as number;
        createdStudentIds.push(studentAId);
        console.log(`✅ Teacher A created student id=${studentAId}`);

        // --- 5. TEST: Duplicate LRN -> 409 Conflict ---
        console.log('\nTesting 5: Duplicate LRN rejection -> 409 Conflict');
        const dupLrnRes = await fetchAPI('/students', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                ...studentAPayload,
                first_name: 'Duplicate'
            })
        });
        if (dupLrnRes.status !== 409) {
            throw new Error(`Expected 409 Conflict for duplicate LRN, got ${dupLrnRes.status}`);
        }
        console.log('✅ Duplicate LRN rejected with 409 Conflict');

        // --- 6. TEST: Teacher A lists and views their student ---
        console.log('\nTesting 6: Teacher A lists and views their own student');
        const listA = await fetchAPI('/students', { headers: teacherAHeaders });
        if (listA.status !== 200 || !Array.isArray(listA.data?.data)) {
            throw new Error(`Expected list of students for Teacher A, got status ${listA.status}`);
        }
        const foundAInListA = listA.data.data.some((s: any) => s.id === studentAId);
        if (!foundAInListA) {
            throw new Error(`Teacher A could not find their own student ${studentAId} in list`);
        }

        const viewA = await fetchAPI(`/students/${studentAId}`, { headers: teacherAHeaders });
        if (viewA.status !== 200 || viewA.data?.data?.id !== studentAId) {
            throw new Error(`Teacher A failed to view student ${studentAId}`);
        }
        console.log('✅ Teacher A successfully listed and viewed their student');

        // --- 7. TEST: Teacher A updates their student ---
        console.log('\nTesting 7: Teacher A updates their own student');
        const updateA = await fetchAPI(`/students/${studentAId}`, {
            method: 'PUT',
            headers: teacherAHeaders,
            body: JSON.stringify({
                section: 'Rizal Section Updated'
            })
        });
        if (updateA.status !== 200 || updateA.data?.data?.section !== 'Rizal Section Updated') {
            throw new Error(`Teacher A update failed: ${updateA.status} - ${JSON.stringify(updateA.data)}`);
        }
        console.log('✅ Teacher A successfully updated their student');

        // --- 8. TEST: Student Profile returns 5 modules pending when no records exist ---
        console.log('\nTesting 8: Student profile returns five module statuses as pending');
        const profileA = await fetchAPI(`/students/${studentAId}/profile`, { headers: teacherAHeaders });
        if (profileA.status !== 200 || !profileA.data?.data) {
            throw new Error(`Failed to fetch student profile: ${profileA.status}`);
        }
        const profileData = profileA.data.data;
        const summary = profileData.module_summary;
        if (!summary) {
            throw new Error('module_summary missing from profile response');
        }
        if (
            summary.patient_info !== false ||
            summary.oral_health !== false ||
            summary.deworming !== false ||
            summary.immunization !== false ||
            summary.vital_signs !== false
        ) {
            throw new Error(`Expected all five modules to be pending (false), got ${JSON.stringify(summary)}`);
        }
        console.log('✅ Student profile correctly returned all five modules as pending (false)');

        // --- 9. TEST: Teacher B isolation (Teacher B cannot view, update, profile, or see in list) ---
        console.log("\nTesting 9: Teacher B isolation from Teacher A's student");
        const teacherBHeaders = { Authorization: `Bearer ${teacherB.token}`, 'Content-Type': 'application/json' };

        // 9a. List: Teacher B must not see Teacher A's student
        const listB = await fetchAPI('/students', { headers: teacherBHeaders });
        if (listB.status !== 200) {
            throw new Error(`Teacher B list failed with status ${listB.status}`);
        }
        const foundAInListB = (listB.data?.data || []).some((s: any) => s.id === studentAId);
        if (foundAInListB) {
            throw new Error("Teacher B's list leaked Teacher A's student!");
        }

        // 9b. View: Teacher B gets 403
        const viewB = await fetchAPI(`/students/${studentAId}`, { headers: teacherBHeaders });
        if (viewB.status !== 403) {
            throw new Error(`Expected 403 for Teacher B viewing student A, got ${viewB.status}`);
        }

        // 9c. Update: Teacher B gets 403
        const updateB = await fetchAPI(`/students/${studentAId}`, {
            method: 'PUT',
            headers: teacherBHeaders,
            body: JSON.stringify({ section: 'Hacked' })
        });
        if (updateB.status !== 403) {
            throw new Error(`Expected 403 for Teacher B updating student A, got ${updateB.status}`);
        }

        // 9d. Profile: Teacher B gets 403
        const profileB = await fetchAPI(`/students/${studentAId}/profile`, { headers: teacherBHeaders });
        if (profileB.status !== 403) {
            throw new Error(`Expected 403 for Teacher B profiling student A, got ${profileB.status}`);
        }
        console.log("✅ Teacher B strictly forbidden (403 or filtered list) from accessing Teacher A's student");

        // --- 10. TEST: Teacher B creates their own student ---
        console.log('\nTesting 10: Teacher B creates their own student');
        const lrnB = `LRN-${timestamp}-B`;
        const createResB = await fetchAPI('/students', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({
                first_name: 'Maria',
                last_name: 'Clara',
                sex: 'Female',
                date_of_birth: '2016-01-01',
                student_lrn: lrnB,
                school_id: schoolId,
                municipality_id: municipalityId,
                barangay_id: barangayId,
                grade_level: 'Grade 2',
                section: 'Del Pilar'
            })
        });
        if (createResB.status !== 201 || !createResB.data?.id) {
            throw new Error(`Failed to create student for Teacher B: ${createResB.status}`);
        }
        const studentBId = createResB.data.id as number;
        createdStudentIds.push(studentBId);
        console.log(`✅ Teacher B created student id=${studentBId}`);

        // --- 11. TEST: Superuser has province-wide access to BOTH students ---
        console.log('\nTesting 11: Superuser province-wide access (lists, views, updates, profiles both students)');
        const superHeaders = { Authorization: `Bearer ${superuser.token}`, 'Content-Type': 'application/json' };

        const superList = await fetchAPI('/students', { headers: superHeaders });
        if (superList.status !== 200) {
            throw new Error(`Superuser list failed with status ${superList.status}`);
        }
        const superIds = (superList.data?.data || []).map((s: any) => s.id);
        if (!superIds.includes(studentAId) || !superIds.includes(studentBId)) {
            throw new Error(`Superuser list missing student A or student B. Found: ${JSON.stringify(superIds)}`);
        }

        // View both
        const superViewA = await fetchAPI(`/students/${studentAId}`, { headers: superHeaders });
        const superViewB = await fetchAPI(`/students/${studentBId}`, { headers: superHeaders });
        if (superViewA.status !== 200 || superViewB.status !== 200) {
            throw new Error(`Superuser failed to view student A (${superViewA.status}) or B (${superViewB.status})`);
        }

        // Update both
        const superUpdateA = await fetchAPI(`/students/${studentAId}`, {
            method: 'PUT',
            headers: superHeaders,
            body: JSON.stringify({ parent_guardian_name: 'Superuser Updated Guardian A' })
        });
        const superUpdateB = await fetchAPI(`/students/${studentBId}`, {
            method: 'PUT',
            headers: superHeaders,
            body: JSON.stringify({ parent_guardian_name: 'Superuser Updated Guardian B' })
        });
        if (superUpdateA.status !== 200 || superUpdateB.status !== 200) {
            throw new Error(`Superuser failed to update student A or B`);
        }

        // Profile both
        const superProfileA = await fetchAPI(`/students/${studentAId}/profile`, { headers: superHeaders });
        const superProfileB = await fetchAPI(`/students/${studentBId}/profile`, { headers: superHeaders });
        if (superProfileA.status !== 200 || superProfileB.status !== 200) {
            throw new Error(`Superuser failed to profile student A or B`);
        }
        console.log('✅ Superuser successfully listed, viewed, updated, and profiled both students');

        // --- 12. TEST: Safe Filters: Search, School, Grade Level ---
        console.log('\nTesting 12: Search, School ID, and Grade Level query filters');
        // Search by LRN
        const searchRes = await fetchAPI(`/students?search=${lrnA}`, { headers: superHeaders });
        if (searchRes.status !== 200 || !searchRes.data?.data?.some((s: any) => s.student_lrn === lrnA)) {
            throw new Error(`Search filter failed to find student by LRN ${lrnA}`);
        }

        // Filter by School ID
        const schoolFilterRes = await fetchAPI(`/students?school_id=${schoolId}`, { headers: superHeaders });
        if (schoolFilterRes.status !== 200 || !schoolFilterRes.data?.data?.every((s: any) => s.school_id === schoolId)) {
            throw new Error(`School filter failed`);
        }

        // Filter by Grade Level
        const gradeFilterRes = await fetchAPI(`/students?grade_level=Grade 3`, { headers: superHeaders });
        if (gradeFilterRes.status !== 200 || !gradeFilterRes.data?.data?.some((s: any) => s.id === studentAId)) {
            throw new Error(`Grade level filter failed to match student A`);
        }
        console.log('✅ All query filters (search, school_id, grade_level) verified successfully');

        console.log('\n🎉 ALL STUDENT CRUD INTEGRATION TESTS PASSED!');
    } finally {
        // --- CLEANUP: Safely remove test students and test users ---
        console.log('\nCleaning up isolated test data from database...');
        try {
            if (createdStudentIds.length > 0) {
                await pool.query(`DELETE FROM STUDENTS WHERE id = ANY($1::int[])`, [createdStudentIds]);
                console.log(`✅ Cleaned up ${createdStudentIds.length} test student(s)`);
            }
            if (createdUserIds.length > 0) {
                await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
                console.log(`✅ Cleaned up ${createdUserIds.length} test user(s)`);
            }
        } catch (cleanupErr) {
            console.error('⚠️ Cleanup error:', cleanupErr);
        }
        await pool.end();
    }
}

runStudentCrudTests().catch((err) => {
    console.error('\n❌ TEST RUN FAILED:', err.message);
    process.exit(1);
});
