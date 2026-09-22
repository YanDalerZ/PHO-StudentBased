import { createSchoolStaffUser, assignUserToSchool, grantModulePermissions, revokeModulePermissions } from './helpers/testHelpers.js';
import pool from '../src/database/db.js';
import type { TestContext } from './helpers/testContext.js';
import { cleanupTestFixtures } from './helpers/cleanup.js';
import { changeResidence } from '../../frontend/src/utils/residentialLocation.js';

interface ApiResponse<T = Record<string, unknown>> {
    status: number;
    data: T | undefined;
}

export async function runAuthorizationTests(context: TestContext): Promise<void> {
    const { apiBaseUrl, runId } = context;

    async function fetchAPI<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
        const res = await fetch(`${apiBaseUrl}${path}`, options);
        let data: T | undefined;
        try { data = (await res.json()) as T; } catch(e) {}
        return { status: res.status, data };
    }

    console.log('--- Phase 1 Authorization Foundation Tests (v5) ---');
    let errors = 0;
    const assert = (condition: boolean, msg: string) => {
        if (!condition) {
            console.error(`❌ FAILED: ${msg}`);
            errors++;
        } else {
            console.log(`✅ ${msg}`);
        }
    };

    try {
        // Setup Dedicated Test Users
        const staff = await createSchoolStaffUser(`staff_${runId}@pho.test`, 'Test', 'Staff', context.apiBaseUrl);
        
        // Setup dedicated Admin
        const adminRes = await pool.query(
            "INSERT INTO USERS (role, email, password_hash, first_name, last_name, is_active) VALUES ('admin', $1, 'hash', 'Test', 'Admin', true) RETURNING id",
            [`admin_${runId}@pho.test`]
        );
        const adminId = adminRes.rows[0].id;
        const adminTokenRes = await pool.query("SELECT * FROM USERS WHERE id = $1", [adminId]); // Normally we generate JWT, let's just do a mock JWT or call login.
        
        // Wait, the tests need a real JWT. We can use the login endpoint if we know the password.
        // It's easier to create the user with bcrypt hash of 'password123'. 
        // Let's use a quick helper to create these users with proper passwords, or just inject a token.
        // Let's generate tokens using the actual logic.
        const jwt = await import('jsonwebtoken');
        const signToken = (id: number, email: string, role: string) => jwt.default.sign({ id, email, role }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

        const adminToken = signToken(adminId, `admin_${runId}@pho.test`, 'admin');
        const admin = { id: adminId, token: adminToken };

        // Setup dedicated Superuser
        const superuserRes = await pool.query(
            "INSERT INTO USERS (role, email, password_hash, first_name, last_name, is_active) VALUES ('superuser', $1, 'hash', 'Test', 'Super', true) RETURNING id",
            [`super_${runId}@pho.test`]
        );
        const superuserId = superuserRes.rows[0].id;
        const superuserToken = signToken(superuserId, `super_${runId}@pho.test`, 'superuser');
        const superuser = { id: superuserId, token: superuserToken };

        // Test 1: Admin cannot access clinical endpoints
        const adminClinicalRes = await fetchAPI('/students', { headers: { Authorization: `Bearer ${admin.token}` } });
        assert(adminClinicalRes.status === 403, 'Admin cannot access clinical endpoints (GET /students -> 403)');

        // Grant can_view for patient-info first so staff can reach the controller
        await grantModulePermissions(staff.id, 'patient-info', { can_view: true }, admin.id);

        // Test 2: No school assignment returns no records
        interface StudentListResponse {
            data: unknown[];
        }
        const noSchoolRes = await fetchAPI<StudentListResponse>('/students', { headers: { Authorization: `Bearer ${staff.token}` } });
        assert(noSchoolRes.status === 200 && Boolean(noSchoolRes.data?.data && noSchoolRes.data.data.length === 0), 'No school assignment returns 0 student records');

        // Fetch two distinct valid schools
        const schoolsRes = await pool.query('SELECT id FROM SCHOOLS WHERE is_active = true LIMIT 2');
        if (schoolsRes.rows.length < 2) throw new Error("At least 2 active schools are required for tests.");
        const schoolId = schoolsRes.rows[0].id;
        const unassignedSchoolId = schoolsRes.rows[1].id;

        // Test 3: Requested unassigned school returns 403
        await assignUserToSchool(staff.id, schoolId, admin.id); // Assign the first school
        const unassignedSchoolRes = await fetchAPI(`/students?school_id=${unassignedSchoolId}`, { headers: { Authorization: `Bearer ${staff.token}` } });
        assert(unassignedSchoolRes.status === 403, 'Requested unassigned school returns 403');

        // Test 4: Missing can_create blocks creation
        const createWithoutPerms = await fetchAPI('/students', {
            method: 'POST',
            headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ school_id: schoolId, first_name: 'Test', last_name: 'Test', student_lrn: `LRN_${runId}`, sex: 'Male', date_of_birth: '2010-01-01' })
        });
        assert(createWithoutPerms.status === 403, 'Missing can_create blocks student creation');

        // Test 5: Grant can_create for patient-info
        await grantModulePermissions(staff.id, 'patient-info', { can_create: true, can_view: true }, admin.id);

        // Residence and campus geography are independent.
        const homeRows = await pool.query<{ id: number; municipality_id: number }>(
            "SELECT b.id, b.municipality_id FROM BARANGAYS b JOIN MUNICIPALITIES m ON m.id = b.municipality_id WHERE m.name = 'Altavas' ORDER BY b.name LIMIT 2"
        );
        const home = homeRows.rows[0];
        const otherHome = homeRows.rows[1];
        if (!home || !otherHome) throw new Error('Altavas residence fixtures missing');
        const current = { municipality: String(home.municipality_id), barangay: String(home.id), school_id: schoolId };
        const changed = changeResidence(current, 'barangay', String(otherHome.id));
        assert(changed.school_id === schoolId && changed.barangay === String(otherHome.id),
            'Changing residential barangay preserves the selected school');
        const cleared = changeResidence(changed, 'municipality', '');
        assert(cleared.school_id === schoolId && cleared.barangay === '',
            'Clearing residential municipality preserves the selected school');

        interface SchoolLookup { id: number; barangay_id: number; municipality_id: number; municipality_name: string; barangay_name: string; is_active: boolean }
        const staffOptions = await fetchAPI<SchoolLookup[]>('/lookup/schools', { headers: { Authorization: `Bearer ${staff.token}` } });
        assert(staffOptions.status === 200 && staffOptions.data?.length === 1 && staffOptions.data[0]?.id === schoolId,
            'School staff selection contains only assigned active schools');
        const allOptions = await fetchAPI<SchoolLookup[]>('/lookup/schools', { headers: { Authorization: `Bearer ${superuser.token}` } });
        assert(allOptions.status === 200 && Boolean(allOptions.data?.some(s => s.id === unassignedSchoolId)),
            'Superuser selection includes schools without an assignment');
        const campus = allOptions.data?.find(s => s.id === schoolId);
        if (!campus || campus.municipality_name !== 'Kalibo') throw new Error('Expected Kalibo school fixture');
        const filtered = await fetchAPI<SchoolLookup[]>(`/lookup/schools?search=Kalibo&municipality_id=${campus.municipality_id}&barangay_id=${campus.barangay_id}`,
            { headers: { Authorization: `Bearer ${superuser.token}` } });
        assert(filtered.status === 200 && Boolean(filtered.data?.length) && Boolean(filtered.data?.every(s => s.barangay_id === campus.barangay_id)),
            'School search and campus municipality/barangay filters work');
        const invalid = await fetchAPI('/lookup/schools?municipality_id=invalid', { headers: { Authorization: `Bearer ${staff.token}` } });
        assert(invalid.status === 400, 'Invalid school filters return 400');
        await pool.query('UPDATE SCHOOLS SET is_active = false WHERE id = $1', [unassignedSchoolId]);
        try {
            const activeOnly = await fetchAPI<SchoolLookup[]>('/lookup/schools?includeInactive=true', { headers: { Authorization: `Bearer ${superuser.token}` } });
            assert(activeOnly.status === 200 && !activeOnly.data?.some(s => s.id === unassignedSchoolId), 'Inactive schools are excluded');
        } finally {
            await pool.query('UPDATE SCHOOLS SET is_active = true WHERE id = $1', [unassignedSchoolId]);
        }
        const payload = { school_id: schoolId, municipality_id: home.municipality_id, barangay_id: home.id,
            first_name: 'CrossMunicipality', last_name: 'Student', student_lrn: `cross_${runId}`, sex: 'Male', date_of_birth: '2010-01-01' };
        const createOptions = (token: string, body: object): RequestInit => ({
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const created = await fetchAPI<{ id: number }>('/students', createOptions(staff.token, payload));
        assert(created.status === 201, 'Staff can register an Altavas resident at an assigned Kalibo school');
        const saved = await pool.query<{ id: number; school_id: number; barangay_id: number }>('SELECT id, school_id, barangay_id FROM STUDENTS WHERE student_lrn = $1', [payload.student_lrn]);
        const student = saved.rows[0];
        if (!student) throw new Error('Cross-municipality student was not saved');
        assert(student.school_id === schoolId && student.barangay_id === home.id, 'Residence and school are stored independently');
        const forbidden = await fetchAPI('/students', createOptions(staff.token, { ...payload, school_id: unassignedSchoolId, student_lrn: `deny_${runId}` }));
        assert(forbidden.status === 403, 'Staff cannot register at an unassigned school');
        await grantModulePermissions(staff.id, 'patient-info', { can_create: true, can_view: true, can_edit: true }, admin.id);
        const transfer = await fetchAPI(`/students/${student.id}`, { ...createOptions(staff.token, { school_id: unassignedSchoolId }), method: 'PUT' });
        assert(transfer.status === 403, 'Staff cannot transfer a student to an unassigned school');
        const homeUpdate = await fetchAPI(`/students/${student.id}`, { ...createOptions(staff.token, { barangay_id: otherHome.id }), method: 'PUT' });
        const afterUpdate = await pool.query<{ school_id: number; barangay_id: number }>('SELECT school_id, barangay_id FROM STUDENTS WHERE id = $1', [student.id]);
        assert(homeUpdate.status === 200 && afterUpdate.rows[0]?.school_id === schoolId && afterUpdate.rows[0]?.barangay_id === otherHome.id,
            'Updating residence keeps the Kalibo school');
        await grantModulePermissions(superuser.id, 'patient-info', { can_create: true, can_view: true }, admin.id);
        for (const target of allOptions.data ?? []) {
            const superCreate = await fetchAPI('/students', createOptions(superuser.token,
                { ...payload, school_id: target.id, student_lrn: `super_${target.id}_${runId}` }));
            assert(superCreate.status === 201, `Superuser can register at active school ${target.id} without assignment`);
        }
        await grantModulePermissions(staff.id, 'patient-info', { can_create: true, can_view: true }, admin.id);
        
        // Test 6: Missing can_edit blocks updates
        const updateWithoutPerms = await fetchAPI('/students/1', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: 'Test' })
        });
        assert(updateWithoutPerms.status === 403, 'Missing can_edit blocks updates');

        // Test 7: Missing can_report blocks dashboards (Superuser role test)
        await grantModulePermissions(superuser.id, 'patient-info', { can_view: true, can_report: false }, admin.id);
        const dashWithoutPerms = await fetchAPI('/modules/patient-info/dashboard', { headers: { Authorization: `Bearer ${superuser.token}` } });
        assert(dashWithoutPerms.status === 403, 'Missing can_report blocks dashboards');

        // Test 8: Superuser without active grant gets 403
        await revokeModulePermissions(superuser.id, 'patient-info', admin.id);
        const superuserNoGrant = await fetchAPI('/students', { headers: { Authorization: `Bearer ${superuser.token}` } });
        assert(superuserNoGrant.status === 403, 'Superuser without active grant gets 403');

        // Test 9: Permission revocation takes effect on the next request
        await revokeModulePermissions(staff.id, 'patient-info', admin.id);
        const viewAfterRevoke = await fetchAPI('/students', { headers: { Authorization: `Bearer ${staff.token}` } });
        assert(viewAfterRevoke.status === 403, 'Permission revocation takes effect on the next request');

        // Test 10: Inactive users receive 401
        await pool.query('UPDATE USERS SET is_active = false WHERE id = $1', [staff.id]);
        const inactiveRes = await fetchAPI('/students', { headers: { Authorization: `Bearer ${staff.token}` } });
        assert(inactiveRes.status === 401, 'Inactive users receive 401');

        if (errors > 0) {
            throw new Error(`Tests finished with ${errors} error(s).`);
        } else {
            console.log('✅ All authorization tests passed successfully!');
        }

    } finally {
        // Cleanup all tagged fixtures
        await cleanupTestFixtures(runId);
    }
}
