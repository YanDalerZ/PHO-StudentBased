import { readFile } from 'node:fs/promises';
import pool from '../database/db.js';
import { adminTransaction } from '../services/admin.service.js';
import { requireVerifiedTestDatabase } from '../utils/verifyTestDatabase.js';

try {
    await requireVerifiedTestDatabase(pool);
    await adminTransaction(async client => {
        const sql = await readFile(new URL('../../database/migrations/020_account_setup.sql', import.meta.url), 'utf8');
        await client.query(sql);
    });
    console.log('Migration 020 applied to verified local database only.');
} finally { await pool.end(); }
