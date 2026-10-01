import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pool from '../database/db.js';
import {
    buildReportQueryParts,
    normalizeReportFilters,
    resolveReportSchoolScope,
    validateReportGeography,
} from '../services/report.service.js';
import {
    formatSafeDatabaseIdentity,
    requireDisposableDatabase,
    verifyConnectedDatabaseIdentity,
} from '../utils/testGuard.js';

const policy = requireDisposableDatabase();
const client = await pool.connect();

const expectCheckViolation = async (name: string, query: () => Promise<unknown>): Promise<void> => {
    await client.query(`SAVEPOINT ${name}`);
    try {
        await query();
        assert.fail(`Expected ${name} to violate a check constraint.`);
    } catch (error) {
        assert.equal(Reflect.get(Object(error), 'code'), '23514');
    } finally {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await client.query(`RELEASE SAVEPOINT ${name}`);
    }
};

try {
    const identity = await verifyConnectedDatabaseIdentity(client, policy);
    await client.query('BEGIN');
    const marker = randomUUID().slice(0, 8);

    const country = await client.query<{ id: number }>(`
        INSERT INTO COUNTRIES (name, code) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 Country ${marker}`, `P3${marker.slice(0, 4)}`]);
    const region = await client.query<{ id: number }>(`
        INSERT INTO REGIONS (name, code, country_id) VALUES ($1, $2, $3) RETURNING id
    `, [`Phase 3 Region ${marker}`, `R3${marker.slice(0, 4)}`, country.rows[0]!.id]);
    const province = await client.query<{ id: number }>(`
        INSERT INTO PROVINCES (name, region_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 Province ${marker}`, region.rows[0]!.id]);
    const municipalityA = await client.query<{ id: number }>(`
        INSERT INTO MUNICIPALITIES (name, province_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 Municipality A ${marker}`, province.rows[0]!.id]);
    const municipalityB = await client.query<{ id: number }>(`
        INSERT INTO MUNICIPALITIES (name, province_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 Municipality B ${marker}`, province.rows[0]!.id]);
    const barangayA = await client.query<{ id: number }>(`
        INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 Barangay A ${marker}`, municipalityA.rows[0]!.id]);
    const barangayB = await client.query<{ id: number }>(`
        INSERT INTO BARANGAYS (name, municipality_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 Barangay B ${marker}`, municipalityB.rows[0]!.id]);
    const schoolA = await client.query<{ id: number }>(`
        INSERT INTO SCHOOLS (name, barangay_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 School A ${marker}`, barangayA.rows[0]!.id]);
    const schoolB = await client.query<{ id: number }>(`
        INSERT INTO SCHOOLS (name, barangay_id) VALUES ($1, $2) RETURNING id
    `, [`Phase 3 School B ${marker}`, barangayB.rows[0]!.id]);
    const user = await client.query<{ id: number }>(`
        INSERT INTO USERS (
            email, password_hash, role, portal_role, job_title, first_name, last_name
        ) VALUES ($1, $2, 'teacher', 'school_staff', 'Test Nurse', 'Phase', 'Three') RETURNING id
    `, [`phase3-${marker}@example.invalid`, 'not-a-real-password-hash']);

    const studentA = await client.query<{ id: number }>(`
        INSERT INTO STUDENTS (
            first_name, last_name, sex, date_of_birth, school_id, registered_by, student_lrn
        ) VALUES ($1, $2, 'Female', '2013-01-01', $3, $4, $5) RETURNING id
    `, ['Scoped', 'Student', schoolA.rows[0]!.id, user.rows[0]!.id, `P3A${Date.now()}`]);
    const studentB = await client.query<{ id: number }>(`
        INSERT INTO STUDENTS (
            first_name, last_name, sex, date_of_birth, school_id, registered_by, student_lrn
        ) VALUES ($1, $2, 'Male', '2012-01-01', $3, $4, $5) RETURNING id
    `, ['Other', 'Student', schoolB.rows[0]!.id, user.rows[0]!.id, `P3B${Date.now()}`]);

    await client.query(`
        INSERT INTO PATIENT_INFO (student_id, recorded_by, created_at)
        VALUES ($1, $3, '2026-10-10T00:00:00Z'), ($2, $3, '2026-10-11T00:00:00Z')
    `, [studentA.rows[0]!.id, studentB.rows[0]!.id, user.rows[0]!.id]);

    const filters = normalizeReportFilters({
        date_from: '2026-10-01',
        date_to: '2026-10-31',
    }, { purpose: 'preview' });
    const staffScope = resolveReportSchoolScope('school_staff', [schoolA.rows[0]!.id]);
    const staffParts = buildReportQueryParts('patient-info', filters, staffScope);
    const staffCount = await client.query<{ count: number }>(`
        SELECT COUNT(DISTINCT pi.student_id)::int AS count
        ${staffParts.fromSql}
        ${staffParts.whereSql}
    `, staffParts.params);
    assert.equal(staffCount.rows[0]?.count, 1);

    const provinceParts = buildReportQueryParts('patient-info', filters, { mode: 'province' });
    const provinceCount = await client.query<{ count: number }>(`
        SELECT COUNT(DISTINCT pi.student_id)::int AS count
        ${provinceParts.fromSql}
        ${provinceParts.whereSql}
    `, provinceParts.params);
    assert.equal(provinceCount.rows[0]?.count, 2);

    await validateReportGeography({
        query: async (sql, params) => client.query(sql, params),
    }, {
        municipality_id: municipalityA.rows[0]!.id,
        barangay_id: barangayA.rows[0]!.id,
        school_id: schoolA.rows[0]!.id,
    });
    await assert.rejects(
        validateReportGeography({
            query: async (sql, params) => client.query(sql, params),
        }, {
            municipality_id: municipalityB.rows[0]!.id,
            barangay_id: barangayA.rows[0]!.id,
            school_id: schoolA.rows[0]!.id,
        }),
        /do not form a valid hierarchy/,
    );

    await client.query(`
        INSERT INTO DEWORMING_TARGETS (
            school_id, period, baseline_target_count, created_by, updated_by
        ) VALUES ($1, '2026-SY-R1', 2, $2, $2)
    `, [schoolA.rows[0]!.id, user.rows[0]!.id]);
    await expectCheckViolation('invalid_target_override', () => client.query(`
        INSERT INTO DEWORMING_TARGETS (
            school_id, period, baseline_target_count, override_target_count,
            created_by, updated_by
        ) VALUES ($1, '2026-SY-R2', 2, 3, $2, $2)
    `, [schoolA.rows[0]!.id, user.rows[0]!.id]));

    await client.query(`
        INSERT INTO VITAL_SIGNS (
            student_id, date_checked, recorded_by, referral_needed,
            referral_reason, referral_date, referral_facility
        ) VALUES ($1, '2026-10-10', $2, TRUE, 'ABNORMAL_SCREENING', '2026-10-10', 'Test Facility')
    `, [studentA.rows[0]!.id, user.rows[0]!.id]);
    await expectCheckViolation('invalid_referral_shape', () => client.query(`
        INSERT INTO VITAL_SIGNS (
            student_id, date_checked, recorded_by, referral_needed, referral_reason
        ) VALUES ($1, '2026-10-10', $2, FALSE, 'SHOULD_NOT_EXIST')
    `, [studentA.rows[0]!.id, user.rows[0]!.id]));
    await expectCheckViolation('invalid_referral_date', () => client.query(`
        INSERT INTO VITAL_SIGNS (
            student_id, date_checked, recorded_by, referral_needed,
            referral_reason, referral_date
        ) VALUES ($1, '2026-10-10', $2, TRUE, 'ABNORMAL_SCREENING', '2026-10-09')
    `, [studentA.rows[0]!.id, user.rows[0]!.id]));

    console.log(`Phase 3 reporting integration checks passed on ${formatSafeDatabaseIdentity(identity)}.`);
    await client.query('ROLLBACK');
} catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction may not have started */ }
    throw error;
} finally {
    client.release();
    await pool.end();
}

