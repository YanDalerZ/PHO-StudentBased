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

async function runImmunizationTests() {
    console.log('🚀 Starting Immunization Module Integration Tests...');

    const timestamp = Date.now();
    const testAdminEmail = `test_admin_immu_${timestamp}@pho.test`;
    const testTeacherAEmail = `test_teacher_a_immu_${timestamp}@pho.test`;
    const testTeacherBEmail = `test_teacher_b_immu_${timestamp}@pho.test`;
    const testSuperuserEmail = `test_superuser_immu_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];
    const createdImmunizationIds: number[] = [];

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

        // Teacher A registers Student A (DOB: 2015-04-10)
        const studentResA = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Female', '2015-04-10', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['ImmuStudentA', 'Test', `LRN_IM_A_${timestamp}`, schoolA.id, schoolA.municipality_id, schoolA.barangay_id, teacherA.id]
        );
        const studentAId = studentResA.rows[0].id as number;
        createdStudentIds.push(studentAId);

        // Teacher B registers Student B (DOB: 2017-09-18)
        const studentResB = await pool.query(
            `INSERT INTO STUDENTS (
                first_name, last_name, sex, date_of_birth, student_lrn,
                school_id, municipality_id, barangay_id, registered_by
            ) VALUES ($1, $2, 'Male', '2017-09-18', $3, $4, $5, $6, $7)
            RETURNING id`,
            ['ImmuStudentB', 'Test', `LRN_IM_B_${timestamp}`, schoolB.id, schoolB.municipality_id, schoolB.barangay_id, teacherB.id]
        );
        const studentBId = studentResB.rows[0].id as number;
        createdStudentIds.push(studentBId);

        console.log(`✅ Test students created: Student A (id=${studentAId}), Student B (id=${studentBId})`);

        // --- 1. TEST: Unauthenticated requests -> 401 ---
        console.log('\nTesting 1: Unauthenticated request to /api/modules/immunization -> 401');
        const unauthGet = await fetchAPI(`/modules/immunization/student/${studentAId}`);
        if (unauthGet.status !== 401) {
            throw new Error(`Expected 401 for unauth GET, got ${unauthGet.status}`);
        }
        const unauthPost = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentAId, immunization_date: '2026-09-01' }),
        });
        if (unauthPost.status !== 401) {
            throw new Error(`Expected 401 for unauth POST, got ${unauthPost.status}`);
        }
        console.log('✅ Unauthenticated requests correctly returned 401');

        // --- 2. TEST: Admin accessing immunization routes -> 403 Forbidden ---
        console.log('\nTesting 2: Admin accessing immunization routes -> 403 Forbidden on all');
        const adminHeaders = { Authorization: `Bearer ${adminUser.token}`, 'Content-Type': 'application/json' };
        const adminRoutes = [
            { method: 'POST', path: '/modules/immunization', body: { student_id: studentAId, immunization_date: '2026-09-01' } },
            { method: 'GET', path: `/modules/immunization/student/${studentAId}` },
            { method: 'PUT', path: '/modules/immunization/1', body: { immunization_date: '2026-09-01' } },
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
        console.log('✅ Admin blocked with 403 on all Immunization endpoints');

        // --- 3. TEST: Validation error handling -> 400; Missing student -> 404 ---
        console.log('\nTesting 3: Validation failure -> 400; Missing student -> 404');
        const teacherAHeaders = { Authorization: `Bearer ${teacherA.token}`, 'Content-Type': 'application/json' };

        // Missing immunization_date -> 400
        const badPayloadRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: studentAId }),
        });
        if (badPayloadRes.status !== 400) {
            throw new Error(`Expected 400 for missing immunization_date, got ${badPayloadRes.status}`);
        }

        // Non-existent student -> 404
        const nonExistentRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({ student_id: 9999999, immunization_date: '2026-09-01', vaccine_td1: true }),
        });
        if (nonExistentRes.status !== 404) {
            throw new Error(`Expected 404 for non-existent student, got ${nonExistentRes.status}`);
        }
        console.log('✅ Validation (400) and missing student (404) properly handled');

        // --- 4. TEST: Impossible Date (date < DOB) -> 400 ---
        console.log('\nTesting 4: Impossible date combination (immunization_date < date_of_birth) -> 400');
        const impossibleDateRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2010-01-01', // Student A DOB is 2015-04-10
                vaccine_td1: true,
            }),
        });
        if (impossibleDateRes.status !== 400) {
            throw new Error(`Expected 400 for impossible date combination, got ${impossibleDateRes.status}`);
        }
        console.log('✅ Impossible date combination rejected with 400 Bad Request');

        // --- 5. TEST: Cross-Field Logical Validations ---
        console.log('\nTesting 5: Cross-field logical validations:');

        // 5a. At least one vaccine required when not deferred/refused -> 400
        console.log('  5a. No vaccine selected on active vaccination -> 400');
        const noVaccineRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2026-09-01',
                // No vaccines checked, not deferred, not refused
            }),
        });
        if (noVaccineRes.status !== 400) {
            throw new Error(`Expected 400 for missing vaccine selection, got ${noVaccineRes.status}`);
        }
        console.log('  ✅ No vaccine selection rejected with 400');

        // 5b. is_refused = true without refusal reason -> 400
        console.log('  5b. is_refused = true without reason -> 400');
        const noRefusalReasonRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2026-09-01',
                is_refused: true,
            }),
        });
        if (noRefusalReasonRes.status !== 400) {
            throw new Error(`Expected 400 for refusal without reason, got ${noRefusalReasonRes.status}`);
        }
        console.log('  ✅ Refusal without reason code or text rejected with 400');

        // 5c. is_from_other_facility = true without other_facility_name -> 400
        console.log('  5c. is_from_other_facility = true without name -> 400');
        const noFacilityNameRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2026-09-01',
                vaccine_mr1: true,
                is_from_other_facility: true,
            }),
        });
        if (noFacilityNameRes.status !== 400) {
            throw new Error(`Expected 400 for missing other facility name, got ${noFacilityNameRes.status}`);
        }
        console.log('  ✅ Missing other facility name rejected with 400');

        // 5d. is_refused or is_deferred with is_fully_immunized = true -> 400
        console.log('  5d. Refused/deferred record marked as fully immunized -> 400');
        const invalidFicRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2026-09-01',
                is_refused: true,
                refusal_reason_code: '2',
                is_fully_immunized: true,
            }),
        });
        if (invalidFicRes.status !== 400) {
            throw new Error(`Expected 400 for refused record with is_fully_immunized=true, got ${invalidFicRes.status}`);
        }
        console.log('  ✅ Refused record with is_fully_immunized=true rejected with 400');

        // --- 6. TEST: School Scope Validation -> 403 for unauthorized teacher school override ---
        console.log('\nTesting 6: School scope validation -> 403 for teacher assigning different school');
        const unauthorizedSchoolRes = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2026-09-01',
                vaccine_td1: true,
                school_id: schoolB.id,
            }),
        });
        if (unauthorizedSchoolRes.status !== 403) {
            throw new Error(`Expected 403 for teacher overriding school scope, got ${unauthorizedSchoolRes.status}`);
        }
        console.log('✅ School scope override blocked with 403 Forbidden');

        // --- 7. TEST: Teacher A creates Immunization record with multiple vaccines ---
        console.log('\nTesting 7: Teacher A creates Immunization record with multiple vaccines (Td1, MR1, HPV1)');
        const createRes = await fetchAPI<{
            data: {
                id: number;
                recorded_by: number;
                student_id: number;
                vaccine_td1: boolean;
                vaccine_mr1: boolean;
                vaccine_hpv1: boolean;
                is_school_based: boolean;
                educational_level: string;
                lot_batch_no: string;
                is_fully_immunized: boolean;
            };
        }>('/modules/immunization', {
            method: 'POST',
            headers: teacherAHeaders,
            body: JSON.stringify({
                student_id: studentAId,
                immunization_date: '2026-09-02',
                immunization_type: 'SCHOOL & COMMUNITY BASED IMMUNIZATION',
                vaccine_td1: true,
                vaccine_mr1: true,
                vaccine_hpv1: true,
                is_school_based: true,
                educational_level: 'Grade 4',
                lot_batch_no: 'LOT-2026-MR-001',
                consent_given: true,
                is_sick_today: false,
                is_fully_immunized: true,
                vaccinator_name: 'Maria Santos, RN',
                supervisor_name: 'Dr. Clara Recto, MD',
                remarks: 'Doses administered with consent and observation',
            }),
        });

        if (createRes.status !== 201 || !createRes.data?.data?.id) {
            throw new Error(`Expected 201 with created record, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
        }

        const immuA = createRes.data.data;
        const immuAId = immuA.id;
        createdImmunizationIds.push(immuAId);

        if (immuA.recorded_by !== teacherA.id) {
            throw new Error(`Expected recorded_by=${teacherA.id}, got ${immuA.recorded_by}`);
        }
        if (immuA.student_id !== studentAId) {
            throw new Error(`Expected student_id=${studentAId}, got ${immuA.student_id}`);
        }
        if (!immuA.vaccine_td1 || !immuA.vaccine_mr1 || !immuA.vaccine_hpv1) {
            throw new Error(`Expected vaccines td1, mr1, and hpv1 to be true`);
        }
        console.log(`✅ Immunization record created: id=${immuAId}, recorded_by=${immuA.recorded_by}`);

        // --- 8. TEST: Teacher A reloads Immunization records for Student A ---
        console.log('\nTesting 8: Teacher A reloads Immunization records via GET /api/modules/immunization/student/:studentId');
        const getRecordsRes = await fetchAPI<{
            data: {
                immunization: { id: number; vaccine_td1: boolean; vaccine_mr1: boolean; vaccine_hpv1: boolean; lot_batch_no: string };
                records: unknown[];
            };
        }>(`/modules/immunization/student/${studentAId}`, { headers: teacherAHeaders });

        if (getRecordsRes.status !== 200 || !getRecordsRes.data?.data?.immunization) {
            throw new Error(`Expected 200 with immunization record, got ${getRecordsRes.status}`);
        }
        const retrieved = getRecordsRes.data.data.immunization;
        if (retrieved.id !== immuAId) {
            throw new Error(`Expected record id ${immuAId}, got ${retrieved.id}`);
        }
        if (!retrieved.vaccine_td1 || !retrieved.vaccine_mr1 || !retrieved.vaccine_hpv1) {
            throw new Error('Multiple vaccines did not persist accurately');
        }
        if (retrieved.lot_batch_no !== 'LOT-2026-MR-001') {
            throw new Error(`Expected lot_batch_no 'LOT-2026-MR-001', got '${retrieved.lot_batch_no}'`);
        }
        console.log('✅ Multiple selected vaccines persisted and retrieved with 100% accuracy');

        // --- 9. TEST: Teacher A updates the Immunization record ---
        console.log('\nTesting 9: Teacher A updates Immunization record via PUT /api/modules/immunization/:id');
        const updateRes = await fetchAPI<{
            data: {
                id: number;
                vaccine_hpv2: boolean;
                lot_batch_no: string;
                remarks: string;
            };
        }>(`/modules/immunization/${immuAId}`, {
            method: 'PUT',
            headers: teacherAHeaders,
            body: JSON.stringify({
                vaccine_hpv2: true,
                lot_batch_no: 'LOT-2026-HPV-002',
                remarks: 'Updated with HPV Dose 2 completion',
            }),
        });

        if (updateRes.status !== 200 || !updateRes.data?.data) {
            throw new Error(`Expected 200 on update, got ${updateRes.status}`);
        }
        if (!updateRes.data.data.vaccine_hpv2) {
            throw new Error('Failed to update vaccine_hpv2');
        }
        if (updateRes.data.data.lot_batch_no !== 'LOT-2026-HPV-002') {
            throw new Error(`Expected updated lot batch 'LOT-2026-HPV-002', got '${updateRes.data.data.lot_batch_no}'`);
        }
        console.log('✅ Teacher A successfully updated Immunization record');

        // --- 10. TEST: Teacher B isolation -> 403 for Teacher A's student and record ---
        console.log('\nTesting 10: Teacher B receives 403 for Teacher A student/record');
        const teacherBHeaders = { Authorization: `Bearer ${teacherB.token}`, 'Content-Type': 'application/json' };

        // GET student A's immunization records -> 403
        const teacherBGet = await fetchAPI(`/modules/immunization/student/${studentAId}`, { headers: teacherBHeaders });
        if (teacherBGet.status !== 403) {
            throw new Error(`Expected 403 for Teacher B GET student A records, got ${teacherBGet.status}`);
        }

        // POST for student A -> 403
        const teacherBPost = await fetchAPI('/modules/immunization', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({ student_id: studentAId, immunization_date: '2026-09-02', vaccine_td1: true }),
        });
        if (teacherBPost.status !== 403) {
            throw new Error(`Expected 403 for Teacher B POST to student A, got ${teacherBPost.status}`);
        }

        // PUT for student A's record -> 403
        const teacherBPut = await fetchAPI(`/modules/immunization/${immuAId}`, {
            method: 'PUT',
            headers: teacherBHeaders,
            body: JSON.stringify({ remarks: 'Malicious modification' }),
        });
        if (teacherBPut.status !== 403) {
            throw new Error(`Expected 403 for Teacher B PUT on student A record, got ${teacherBPut.status}`);
        }
        console.log('✅ Teacher B correctly blocked with 403 on all Teacher A student Immunization actions');

        // --- 11. TEST: Superuser has province-wide access to view and update ---
        console.log('\nTesting 11: Superuser has province-wide read/update access');
        const superuserHeaders = { Authorization: `Bearer ${superuser.token}`, 'Content-Type': 'application/json' };

        // Superuser GET Teacher A's student immunization record -> 200
        const superuserGet = await fetchAPI<{ data: { immunization: { id: number } } }>(
            `/modules/immunization/student/${studentAId}`,
            { headers: superuserHeaders }
        );
        if (superuserGet.status !== 200 || !superuserGet.data?.data?.immunization) {
            throw new Error(`Expected 200 for superuser GET, got ${superuserGet.status}`);
        }

        // Superuser PUT Teacher A's record -> 200
        const superuserPut = await fetchAPI<{ data: { remarks: string } }>(
            `/modules/immunization/${immuAId}`,
            {
                method: 'PUT',
                headers: superuserHeaders,
                body: JSON.stringify({ remarks: 'Verified and approved by Provincial Superuser' }),
            }
        );
        if (superuserPut.status !== 200 || superuserPut.data?.data?.remarks !== 'Verified and approved by Provincial Superuser') {
            throw new Error(`Expected 200 for superuser PUT, got ${superuserPut.status}`);
        }
        console.log('✅ Superuser province-wide read and update succeeded');

        // --- 12. TEST: Refusal & Other-Facility Scenarios succeed when properly specified ---
        console.log('\nTesting 12: Refusal and other-facility valid flows');

        // Teacher B records a valid refusal record for Student B
        const refusalRes = await fetchAPI<{ data: { id: number; is_refused: boolean; refusal_reason_code: string } }>('/modules/immunization', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({
                student_id: studentBId,
                immunization_date: '2026-09-02',
                is_refused: true,
                refusal_reason_code: '2',
                refusal_reason_text: 'Parents expressed fear of fever/side effects',
            }),
        });
        if (refusalRes.status !== 201 || !refusalRes.data?.data?.id) {
            throw new Error(`Expected 201 for valid refusal record, got ${refusalRes.status}`);
        }
        const refusalId = refusalRes.data.data.id;
        createdImmunizationIds.push(refusalId);
        console.log(`  ✅ Valid refusal record created: id=${refusalId}, code=${refusalRes.data.data.refusal_reason_code}`);

        // Teacher B records a valid other-facility record for Student B
        const otherFacilityRes = await fetchAPI<{ data: { id: number; is_from_other_facility: boolean; other_facility_name: string } }>('/modules/immunization', {
            method: 'POST',
            headers: teacherBHeaders,
            body: JSON.stringify({
                student_id: studentBId,
                immunization_date: '2026-09-03',
                vaccine_mr2: true,
                is_from_other_facility: true,
                other_facility_name: 'Banga Rural Health Unit',
            }),
        });
        if (otherFacilityRes.status !== 201 || !otherFacilityRes.data?.data?.id) {
            throw new Error(`Expected 201 for valid other-facility record, got ${otherFacilityRes.status}`);
        }
        const otherFacId = otherFacilityRes.data.data.id;
        createdImmunizationIds.push(otherFacId);
        console.log(`  ✅ Valid other-facility record created: id=${otherFacId}, facility=${otherFacilityRes.data.data.other_facility_name}`);

        // --- 13. TEST: Student Profile Module Summary (Pending -> Completed) ---
        console.log('\nTesting 13: Student Profile module summary changes to Completed');

        // Fetch Student B -> modules.immunization must now be true (Completed)!
        const profileAfterRes = await fetchAPI<{ data: { modules?: { immunization?: boolean } } }>(
            `/students/${studentBId}`,
            { headers: teacherBHeaders }
        );
        if (profileAfterRes.status !== 200) {
            throw new Error(`Expected 200 for student profile, got ${profileAfterRes.status}`);
        }
        if (profileAfterRes.data?.data?.modules?.immunization !== true) {
            throw new Error(`Expected modules.immunization to be true after record creation, got ${profileAfterRes.data?.data?.modules?.immunization}`);
        }

        // Full profile endpoint verification (/api/students/:id/profile)
        const fullProfileRes = await fetchAPI<{ data: { module_summary: { immunization: boolean }; modules: { immunization: unknown[] } } }>(
            `/students/${studentBId}/profile`,
            { headers: teacherBHeaders }
        );
        if (fullProfileRes.status !== 200) {
            throw new Error(`Expected 200 for full student profile, got ${fullProfileRes.status}`);
        }
        if (fullProfileRes.data?.data?.module_summary?.immunization !== true) {
            throw new Error(`Expected module_summary.immunization to be true, got ${fullProfileRes.data?.data?.module_summary?.immunization}`);
        }
        if (!fullProfileRes.data?.data?.modules?.immunization?.length) {
            throw new Error('Expected modules.immunization array to contain at least 1 record');
        }
        console.log('✅ Student Profile reflects Immunization as Completed (true) after record is saved');

        // --- 14. TEST: Missing Immunization record on PUT -> 404 ---
        console.log('\nTesting 14: Missing Immunization record on PUT -> 404');
        const notFoundPut = await fetchAPI('/modules/immunization/9999999', {
            method: 'PUT',
            headers: teacherAHeaders,
            body: JSON.stringify({ remarks: 'Ghost update' }),
        });
        if (notFoundPut.status !== 404) {
            throw new Error(`Expected 404 for non-existent record update, got ${notFoundPut.status}`);
        }
        console.log('✅ Non-existent immunization record update returns 404');

        console.log('\n🎉 ALL 14 IMMUNIZATION INTEGRATION TESTS PASSED SUCCESSFULLY!');
    } finally {
        console.log('\nCleaning up test artifacts in PostgreSQL...');
        if (createdImmunizationIds.length > 0) {
            await pool.query('DELETE FROM IMMUNIZATION WHERE id = ANY($1)', [createdImmunizationIds]);
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

runImmunizationTests().catch((err) => {
    console.error('\n❌ Immunization integration test failed:', err);
    process.exit(1);
});
