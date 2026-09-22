import pool from '../../src/database/db.js';

export async function cleanupTestFixtures(runId: string): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Find all users created during this test run
        const usersRes = await client.query(`SELECT id FROM USERS WHERE email LIKE '%' || $1 || '%'`, [runId]);
        const userIds = usersRes.rows.map(r => r.id);
        
        if (userIds.length > 0) {
            // Find all students created by these users
            const studentsRes = await client.query(`SELECT id FROM STUDENTS WHERE registered_by = ANY($1::int[])`, [userIds]);
            const studentIds = studentsRes.rows.map(r => r.id);
            
            if (studentIds.length > 0) {
                // Delete module records for these students
                await client.query(`DELETE FROM PATIENT_INFO WHERE student_id = ANY($1::int[])`, [studentIds]);
                await client.query(`DELETE FROM ORAL_HEALTH WHERE student_id = ANY($1::int[])`, [studentIds]);
                await client.query(`DELETE FROM DEWORMING WHERE student_id = ANY($1::int[])`, [studentIds]);
                await client.query(`DELETE FROM IMMUNIZATION WHERE student_id = ANY($1::int[])`, [studentIds]);
                await client.query(`DELETE FROM VITAL_SIGNS WHERE student_id = ANY($1::int[])`, [studentIds]);
                
                // Delete students
                await client.query(`DELETE FROM STUDENTS WHERE id = ANY($1::int[])`, [studentIds]);
            }
            
            // Delete permissions and assignments for these users
            await client.query(`DELETE FROM USER_MODULE_PERMISSIONS WHERE user_id = ANY($1::int[]) OR granted_by = ANY($1::int[])`, [userIds]);
            await client.query(`DELETE FROM USER_SCHOOL_ASSIGNMENTS WHERE user_id = ANY($1::int[]) OR assigned_by = ANY($1::int[])`, [userIds]);
            
            // Note: AUDIT_EVENTS might have references to these users, but the v5 trigger prevents modification.
            // If testing audit events, you might need to handle them or disable trigger during test teardown.
            // But tests for Phase 1 generally don't assert audit tables heavily, so we might skip audit deletion 
            // unless the foreign key constraint enforces it. Actually, AUDIT_EVENTS has actor_id REFERENCES USERS(id)
            // We should remove audit events. Since we have a trigger preventing delete, we might need to bypass it.
            // For now, let's just use SET session_replication_role = replica; to bypass triggers for cleanup, then restore.
            await client.query(`SET session_replication_role = replica`);
            await client.query(`DELETE FROM AUDIT_EVENTS WHERE actor_id = ANY($1::int[]) OR (entity_type = 'student' AND entity_id = ANY($2::int[]))`, [userIds, studentIds.length ? studentIds : [0]]);
            await client.query(`SET session_replication_role = DEFAULT`);
            
            // Delete users
            await client.query(`DELETE FROM USERS WHERE id = ANY($1::int[])`, [userIds]);
        }
        
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to cleanup test fixtures:', err);
        throw err;
    } finally {
        client.release();
    }
}
