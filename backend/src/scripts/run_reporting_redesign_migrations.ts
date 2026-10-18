import pool from '../database/db.js';
import { applyReportingRedesignMigrations } from '../database/reportingRedesignMigrations.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

await requireVerifiedTestDatabase(pool);
const client = await pool.connect();
try {
    const applied = await applyReportingRedesignMigrations(client);
    console.log(`Local reporting redesign migrations applied: ${applied.join(', ') || 'none'}`);
} finally {
    client.release();
    await pool.end();
}
