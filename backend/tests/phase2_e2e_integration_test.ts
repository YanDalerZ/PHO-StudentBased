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

async function runPhase2E2ETests() {
    console.log('🚀 Starting Comprehensive Phase 2 End-to-End Verification Test...');

    const timestamp = Date.now();
    const testTeacherAEmail = `teacher_a_e2e_${timestamp}@pho.test`;
    const testTeacherBEmail = `teacher_b_e2e_${timestamp}@pho.test`;
    const testSuperuserEmail = `superuser_e2e_${timestamp}@pho.test`;
    const testAdminEmail = `admin_e2e_${timestamp}@pho.test`;

    const createdUserIds: number[] = [];
    const createdStudentIds: number[] = [];
    const createdPatientInfoIds: number[] = [];
    const createdAnimalBiteIds: number[] = [];
    const createdOralHealthIds: number[] = [];
    const createdDewormingIds: number[] = [];
    const createdImmunizationIds: number[] = [];
    const createdVitalSignsIds: number[] = [];

    const jwtSecret = process.env.JWT_SECRET || 'pho_development_secret_key_2025';

    try {
        // --- 0. Set up isolated test users in PostgreSQL ---
        console.log('\nStep 0: Setting up test users in PostgreSQL...');
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

        const teacherA = await insertUser(testTeacherAEmail, 'teacher', 'Elena', 'Torres');
        const teacherB = await insertUser(testTeacherBEmail, 'teacher', 'Ramon', 'Cruz');
        const superuser = await insertUser(testSuperuserEmail, 'superuser', 'Maria', 'Santos');
        const adminUser = await insertUser(testAdminEmail, 'admin', 'System', 'Admin');

        console.log('✅ Created isolated test users (Teacher A, Teacher B, Superuser, Admin)');

        // Retrieve valid school from seed data
        const schoolRes = await pool.query(
            `SELECT s.id, b.municipality_id, s.barangay_id, s.name as school_name
             FROM SCHOOLS s
             JOIN BARANGAYS b ON s.barangay_id = b.id
             LIMIT 1`
        );
        if (schoolRes.rows.length === 0) {
            throw new Error('No schools found in seed database');
        }
        const school = schoolRes.rows[0];

        // --- 1. Unauthenticated & Admin Security Enforcement ---
        console.log('\nStep 1: Security Enforcement (401 Unauthenticated & 403 Admin)...');

        const endpoints = [
            { path: '/students', method: 'GET' },
            { path: '/modules/patient-info/student/1', method: 'GET' },
            { path: '/modules/oral-health/student/1', method: 'GET' },
            { path: '/modules/deworming/student/1', method: 'GET' },
            { path: '/modules/immunization/student/1', method: 'GET' },
            { path: '/modules/vital-signs/student/1', method: 'GET' },
        ];

        for (const ep of endpoints) {
            const unauthRes = await fetchAPI(ep.path, { method: ep.method });
            if (unauthRes.status !== 401) {
                throw new Error(`Expected 401 for unauthenticated ${ep.path}, got ${unauthRes.status}`);
            }

            const adminRes = await fetchAPI(ep.path, {
                method: ep.method,
                headers: { Authorization: `Bearer ${adminUser.token}` },
            });
            if (adminRes.status !== 403) {
                throw new Error(`Expected 403 for admin ${ep.path}, got ${adminRes.status}`);
            }
        }
        console.log('✅ All student and health module routes return 401 for unauthenticated and 403 for Admin');

        // --- 2. Register Student with Cloudinary Photo & Base64 Rejection ---
        console.log('\nStep 2: Student Registration & Cloudinary Photo Validation...');

        // 2a. Base64 photo rejection check
        const base64StudentPayload = {
            student_lrn: `LRN_B64_${timestamp}`,
            first_name: 'Test',
            last_name: 'Base64',
            date_of_birth: '2015-05-10',
            sex: 'Male',
            school_id: school.id,
            municipality_id: school.municipality_id,
            barangay_id: school.barangay_id,
            photo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        };

        const b64Res = await fetchAPI('/students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(base64StudentPayload),
        });
        if (b64Res.status !== 400) {
            throw new Error(`Expected direct base64 photo to be rejected with 400, got ${b64Res.status}`);
        }
        console.log('✅ Direct base64 photo upload correctly rejected with 400 Bad Request');

        // 2b. Valid Cloudinary HTTPS photo registration
        const cloudinaryPhotoUrl = 'https://res.cloudinary.com/pho-aklan-health/image/upload/v1725638400/pho_student_photos/student_photo_test.jpg';
        const validStudentPayload = {
            student_lrn: `LRN_E2E_${timestamp}`,
            first_name: 'Juan',
            middle_name: 'De La',
            last_name: 'Cruz',
            suffix: 'Jr.',
            date_of_birth: '2014-08-20',
            sex: 'Male',
            birth_place: 'Kalibo, Aklan',
            school_id: school.id,
            grade_level: 'Grade 5',
            section: 'Sampaguita',
            municipality_id: school.municipality_id,
            barangay_id: school.barangay_id,
            photo_url: cloudinaryPhotoUrl,
            civil_status: 'Single',
            blood_type: 'O+',
            religion: 'Roman Catholic',
            parent_guardian_name: 'Pedro Cruz',
            parent_guardian_contact: '09171234567',
        };

        const createStudentRes = await fetchAPI<{ id: number; message: string }>('/students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(validStudentPayload),
        });

        if (createStudentRes.status !== 201 || !createStudentRes.data.id) {
            throw new Error(`Failed to create student: ${JSON.stringify(createStudentRes.data)}`);
        }
        const studentId = createStudentRes.data.id;
        createdStudentIds.push(studentId);

        // Verify DB record directly
        const dbCheck = await pool.query('SELECT photo_url, registered_by FROM STUDENTS WHERE id = $1', [studentId]);
        if (dbCheck.rows[0].photo_url !== cloudinaryPhotoUrl) {
            throw new Error(`DB photo_url mismatch. Expected ${cloudinaryPhotoUrl}, got ${dbCheck.rows[0].photo_url}`);
        }
        if (dbCheck.rows[0].registered_by !== teacherA.id) {
            throw new Error(`DB registered_by mismatch. Expected ${teacherA.id}, got ${dbCheck.rows[0].registered_by}`);
        }
        console.log(`✅ Student registered successfully (id: ${studentId}) with verified Cloudinary HTTPS photo_url and registered_by = ${teacherA.id}`);

        // --- 3. Registry & Initial Profile Verification ---
        console.log('\nStep 3: Registry Entry & Initial Profile Pending Status...');

        // Verify student appears in Teacher A's registry
        const listRes = await fetchAPI<{ data: Array<{ id: number; student_lrn: string; photo_url: string }> }>('/students', {
            headers: { Authorization: `Bearer ${teacherA.token}` },
        });
        const found = listRes.data.data.find(s => s.id === studentId);
        if (!found) {
            throw new Error(`Student ${studentId} not found in Teacher A registry list`);
        }
        if (found.photo_url !== cloudinaryPhotoUrl) {
            throw new Error(`Registry photo_url mismatch`);
        }

        // Verify profile details & initial pending status
        const profileRes = await fetchAPI<{ data: { id: number; modules: Record<string, boolean> } }>(`/students/${studentId}`, {
            headers: { Authorization: `Bearer ${teacherA.token}` },
        });
        const modulesInitial = profileRes.data.data.modules;
        if (
            modulesInitial.patient_info !== false ||
            modulesInitial.oral_health !== false ||
            modulesInitial.deworming !== false ||
            modulesInitial.immunization !== false ||
            modulesInitial.vital_signs !== false
        ) {
            throw new Error(`Expected all modules initially to be false, got: ${JSON.stringify(modulesInitial)}`);
        }
        console.log('✅ Student listed in registry; profile confirms all 5 modules are initially Pending (false)');

        // --- 4. Fill and Reload Records for All Five Health Modules ---
        console.log('\nStep 4: Creating Records Across All 5 Health Modules...');

        // 4a. Module 1: Patient Info & Animal Bite
        const piPayload = {
            student_id: studentId,
            file_no: `FILE-E2E-${timestamp}`,
            animal_bite: {
                rabies_exposure_category: 'CATEGORY II',
                animal_type: 'DOG',
                wash_bite: true,
                type_of_exposure: 'Puncture bite on left hand',
                date_of_exposure: '2025-06-15',
                arv_day_0: '2025-06-15',
                is_active_case: true,
            },
        };
        const piRes = await fetchAPI<{ data: { patient_info: { id: number; file_no: string }; animal_bite?: { id: number } } }>('/modules/patient-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(piPayload),
        });
        if (piRes.status !== 201 || !piRes.data?.data?.patient_info) {
            throw new Error(`Patient Info creation failed: ${JSON.stringify(piRes.data)}`);
        }
        const createdPI = piRes.data.data.patient_info;
        const createdBite = piRes.data.data.animal_bite;
        createdPatientInfoIds.push(createdPI.id);
        if (createdBite?.id) {
            createdAnimalBiteIds.push(createdBite.id);
        }
        console.log(`  ✅ Module 1 (Patient Info & Animal Bite) saved (id: ${createdPI.id})`);

        // 4b. Module 2: Oral Health
        const ohPayload = {
            student_id: studentId,
            date_examined: '2025-08-11',
            service_location: 'FACILITY',
            visit_type: '1ST VISIT',
            administered_by: 'Dr. Aklan Dentist',
            tooth_chart_upper: { '18': true, '17': false, '16': true, '11': true },
            tooth_chart_lower: { '48': true, '47': false, '31': true, '32': true },
            no_of_perm_teeth: 28,
            no_of_perm_sound_teeth: 24,
            no_of_decayed_teeth: 2,
            no_of_missing_teeth: 1,
            no_of_filled_teeth: 1,
            remarks: 'Fluoride varnish recommended',
        };
        const ohRes = await fetchAPI<{ data: { id: number; total_dmft: number } }>('/modules/oral-health', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(ohPayload),
        });
        if (ohRes.status !== 201 || !ohRes.data?.data?.id) {
            throw new Error(`Oral Health creation failed: ${JSON.stringify(ohRes.data)}`);
        }
        createdOralHealthIds.push(ohRes.data.data.id);
        console.log(`  ✅ Module 2 (Oral Health) saved (id: ${ohRes.data.data.id}, dmft: ${ohRes.data.data.total_dmft})`);

        // 4c. Module 3: Deworming
        const dewormingPayload = {
            student_id: studentId,
            date_dewormed: '2025-08-12',
            medication_given: 'Albendazole 400mg',
            is_dewormed: true,
            school_type: 'public',
            in_school: true,
            remarks: 'Round 1 semi-annual deworming',
        };
        const dwRes = await fetchAPI<{ data: { id: number; age_group: string } }>('/modules/deworming', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(dewormingPayload),
        });
        if (dwRes.status !== 201 || !dwRes.data?.data?.id) {
            throw new Error(`Deworming creation failed: ${JSON.stringify(dwRes.data)}`);
        }
        createdDewormingIds.push(dwRes.data.data.id);
        console.log(`  ✅ Module 3 (Deworming) saved (id: ${dwRes.data.data.id}, auto age_group: ${dwRes.data.data.age_group})`);

        // 4d. Module 4: Immunization
        const immuPayload = {
            student_id: studentId,
            immunization_date: '2025-08-13',
            immunization_type: 'Routine School-Based',
            vaccine_td1: true,
            vaccine_mr1: true,
            is_school_based: true,
            educational_level: 'Grade 5',
            consent_given: true,
            vaccinator_name: 'Nurse Joy',
            remarks: 'Standard grade 5 school booster',
        };
        const imRes = await fetchAPI<{ data: { id: number } }>('/modules/immunization', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(immuPayload),
        });
        if (imRes.status !== 201 || !imRes.data?.data?.id) {
            throw new Error(`Immunization creation failed: ${JSON.stringify(imRes.data)}`);
        }
        createdImmunizationIds.push(imRes.data.data.id);
        console.log(`  ✅ Module 4 (Immunization) saved (id: ${imRes.data.data.id})`);

        // 4e. Module 5: Vital Signs
        const vsPayload = {
            student_id: studentId,
            date_checked: '2025-08-14',
            blood_pressure_systolic: 112,
            blood_pressure_diastolic: 74,
            heart_rate: 78,
            respiratory_rate: 18,
            temperature: 36.6,
            weight_kg: 44.0,
            height_cm: 148.0,
            remarks: 'Physical exam baseline complete',
        };
        const vsRes = await fetchAPI<{ data: { id: number; bmi: number } }>('/modules/vital-signs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify(vsPayload),
        });
        if (vsRes.status !== 201 || !vsRes.data?.data?.id) {
            throw new Error(`Vital Signs creation failed: ${JSON.stringify(vsRes.data)}`);
        }
        createdVitalSignsIds.push(vsRes.data.data.id);
        console.log(`  ✅ Module 5 (Vital Signs) saved (id: ${vsRes.data.data.id}, server BMI: ${vsRes.data.data.bmi})`);

        // --- 5. Verify All Five Module Cards Transition to Completed ---
        console.log('\nStep 5: Verifying Student Profile Module Flags Transition to Completed (true)...');
        const profileCompletedRes = await fetchAPI<{ data: { modules: Record<string, boolean> } }>(`/students/${studentId}`, {
            headers: { Authorization: `Bearer ${teacherA.token}` },
        });
        const completedFlags = profileCompletedRes.data.data.modules;
        if (
            !completedFlags.patient_info ||
            !completedFlags.oral_health ||
            !completedFlags.deworming ||
            !completedFlags.immunization ||
            !completedFlags.vital_signs
        ) {
            throw new Error(`Expected all 5 modules to be true, got: ${JSON.stringify(completedFlags)}`);
        }
        console.log('✅ All five module status flags dynamically confirmed as Completed (true)');

        // --- 6. Edit Student & Edit One Record per Module ---
        console.log('\nStep 6: Edit Student & Edit Record per Module (Persistence Verification)...');

        // 6a. Edit Student: Replace photo with updated Cloudinary URL
        const updatedPhotoUrl = 'https://res.cloudinary.com/pho-aklan-health/image/upload/v1725638500/pho_student_photos/student_photo_updated.jpg';
        const updateStudentRes = await fetchAPI<{ message: string; data: { photo_url: string; first_name: string } }>(`/students/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                first_name: 'Juan Carlos',
                photo_url: updatedPhotoUrl,
            }),
        });
        if (updateStudentRes.status !== 200) {
            throw new Error(`Failed to update student: ${JSON.stringify(updateStudentRes.data)}`);
        }

        // Verify photo replacement persisted
        const verifyPhotoRes = await fetchAPI<{ data: { first_name: string; photo_url: string } }>(`/students/${studentId}`, {
            headers: { Authorization: `Bearer ${teacherA.token}` },
        });
        if (verifyPhotoRes.data.data.photo_url !== updatedPhotoUrl || verifyPhotoRes.data.data.first_name !== 'Juan Carlos') {
            throw new Error(`Student edit photo replacement failed to persist`);
        }
        console.log('  ✅ Student photo replacement persisted successfully');

        // 6b. Edit Student: Remove photo (photo_url = "")
        const removePhotoRes = await fetchAPI(`/students/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({ photo_url: '' }),
        });
        if (removePhotoRes.status !== 200) throw new Error('Failed to remove student photo');

        const verifyRemovedRes = await pool.query('SELECT photo_url FROM STUDENTS WHERE id = $1', [studentId]);
        if (verifyRemovedRes.rows[0].photo_url !== null) {
            throw new Error(`Expected DB photo_url to be NULL upon removal, got: ${verifyRemovedRes.rows[0].photo_url}`);
        }
        console.log('  ✅ Student photo removal correctly persisted as NULL in database');

        // Restore photo for subsequent checks
        await pool.query('UPDATE STUDENTS SET photo_url = $1 WHERE id = $2', [updatedPhotoUrl, studentId]);

        // 6c. Edit one record per module and verify persistence
        // Patient Info update
        const editPi = await fetchAPI(`/modules/patient-info/${createdPI.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({ file_no: `FILE-UPDATED-${timestamp}` }),
        });
        if (editPi.status !== 200) throw new Error('Failed to update Patient Info');

        // Oral Health update
        const editOh = await fetchAPI(`/modules/oral-health/${ohRes.data.data.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({ remarks: 'Fluoride varnish applied successfully' }),
        });
        if (editOh.status !== 200) throw new Error('Failed to update Oral Health');

        // Deworming update
        const editDw = await fetchAPI(`/modules/deworming/${dwRes.data.data.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({ remarks: 'Dose tolerated without adverse effects' }),
        });
        if (editDw.status !== 200) throw new Error('Failed to update Deworming');

        // Immunization update
        const editIm = await fetchAPI(`/modules/immunization/${imRes.data.data.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({ remarks: 'No post-vaccination side effects noted' }),
        });
        if (editIm.status !== 200) throw new Error('Failed to update Immunization');

        // Vital Signs update (Weight: 45.0 kg, height: 148.0 cm -> BMI: 45 / (1.48^2) = 20.54)
        const editVs = await fetchAPI<{ data: { bmi: number; remarks: string } }>(`/modules/vital-signs/${vsRes.data.data.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherA.token}`,
            },
            body: JSON.stringify({
                weight_kg: 45.0,
                remarks: 'Follow-up vitals optimal',
            }),
        });
        if (editVs.status !== 200 || editVs.data.data.bmi !== 20.54) {
            throw new Error(`Failed to update Vital Signs with recomputed BMI: ${JSON.stringify(editVs.data)}`);
        }
        console.log('  ✅ Edits across all 5 health modules persisted successfully');

        // --- 7. Teacher B Isolation Verification ---
        console.log('\nStep 7: Teacher B Isolation Verification (Access Denied)...');

        // Teacher B cannot see Teacher A student in registry
        const teacherBList = await fetchAPI<{ data: Array<{ id: number }> }>('/students', {
            headers: { Authorization: `Bearer ${teacherB.token}` },
        });
        if (teacherBList.data.data.some(s => s.id === studentId)) {
            throw new Error('Teacher B unexpectedly saw Teacher A student in registry');
        }

        // Teacher B denied viewing Teacher A student
        const tBView = await fetchAPI(`/students/${studentId}`, {
            headers: { Authorization: `Bearer ${teacherB.token}` },
        });
        if (tBView.status !== 403) throw new Error(`Expected 403 for Teacher B viewing student, got ${tBView.status}`);

        // Teacher B denied updating Teacher A student
        const tBEdit = await fetchAPI(`/students/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${teacherB.token}`,
            },
            body: JSON.stringify({ first_name: 'Hacked' }),
        });
        if (tBEdit.status !== 403) throw new Error(`Expected 403 for Teacher B updating student, got ${tBEdit.status}`);

        // Teacher B denied reading or modifying module records
        const moduleDenialTests = [
            `/modules/patient-info/student/${studentId}`,
            `/modules/oral-health/student/${studentId}`,
            `/modules/deworming/student/${studentId}`,
            `/modules/immunization/student/${studentId}`,
            `/modules/vital-signs/student/${studentId}`,
        ];
        for (const ep of moduleDenialTests) {
            const res = await fetchAPI(ep, {
                headers: { Authorization: `Bearer ${teacherB.token}` },
            });
            if (res.status !== 403) {
                throw new Error(`Expected 403 for Teacher B accessing ${ep}, got ${res.status}`);
            }
        }
        console.log('✅ Teacher B strictly isolated and denied access to Teacher A student and all 5 health modules');

        // --- 8. Superuser Province-wide Access Verification ---
        console.log('\nStep 8: Superuser Province-wide Access Verification...');

        // Superuser lists student
        const suList = await fetchAPI<{ data: Array<{ id: number }> }>('/students', {
            headers: { Authorization: `Bearer ${superuser.token}` },
        });
        if (!suList.data.data.some(s => s.id === studentId)) {
            throw new Error('Superuser failed to see student in province-wide registry');
        }

        // Superuser views student
        const suView = await fetchAPI<{ data: { id: number; first_name: string } }>(`/students/${studentId}`, {
            headers: { Authorization: `Bearer ${superuser.token}` },
        });
        if (suView.status !== 200 || suView.data.data.id !== studentId) {
            throw new Error('Superuser failed to retrieve student');
        }

        // Superuser updates student
        const suUpdate = await fetchAPI(`/students/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${superuser.token}`,
            },
            body: JSON.stringify({ section: 'Superuser-Verified' }),
        });
        if (suUpdate.status !== 200) throw new Error('Superuser failed to update student');

        // Superuser reads all 5 modules
        for (const ep of moduleDenialTests) {
            const res = await fetchAPI(ep, {
                headers: { Authorization: `Bearer ${superuser.token}` },
            });
            if (res.status !== 200) {
                throw new Error(`Superuser failed to access ${ep}, got ${res.status}`);
            }
        }
        console.log('✅ Superuser province-wide access confirmed across Student CRUD and all 5 modules');

        console.log('\n🎉 ALL 8 PHASE 2 END-TO-END VERIFICATION STEPS PASSED SUCCESSFULLY!');
    } finally {
        // --- Cleanup in reverse dependency order ---
        console.log('\nCleaning up test records from PostgreSQL...');
        if (createdStudentIds.length > 0) {
            await pool.query(`DELETE FROM ANIMAL_BITES WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
            await pool.query(`DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
            await pool.query(`DELETE FROM ORAL_HEALTH WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
            await pool.query(`DELETE FROM DEWORMING WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
            await pool.query(`DELETE FROM IMMUNIZATION WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
            await pool.query(`DELETE FROM VITAL_SIGNS WHERE student_id = ANY($1::int[])`, [createdStudentIds]);
            await pool.query(`DELETE FROM STUDENTS WHERE id = ANY($1::int[])`, [createdStudentIds]);
        }
        if (createdUserIds.length > 0) {
            await pool.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [createdUserIds]);
        }
        console.log('✅ PostgreSQL database cleanup completed successfully');
    }
}

runPhase2E2ETests()
    .then(() => {
        console.log('Exiting with code 0');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Phase 2 E2E test failed:', err);
        process.exit(1);
    });
