import { readFile } from 'node:fs/promises';
import pool from '../database/db.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

try {
    await requireVerifiedTestDatabase(pool);
    const column = await pool.query(`SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'immunization' AND column_name = 'deferred_reason_text'`);
    if (column.rowCount) {
        console.log('Deferral column already exists on verified local database.');
    } else {
        const sql = await readFile(new URL('../../database/migrations/018_immunization_deferral_explanation.sql', import.meta.url), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('COMMIT');
            console.log('Migration 018 applied to verified local database only.');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    }
} finally { await pool.end(); }
