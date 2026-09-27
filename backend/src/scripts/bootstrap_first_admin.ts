import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import pool from '../database/db.js';

const REQUIRED_ACK = '--ack=CREATE_FIRST_ADMIN';

const bootstrapInputSchema = z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(12, 'Password must contain at least 12 characters.').max(128),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
}).strict();

async function readHidden(prompt: string): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('A terminal is required for masked password entry.');
    }

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    return new Promise<string>((resolve, reject) => {
        let value = '';
        const finish = (error?: Error): void => {
            process.stdin.off('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\n');
            if (error) reject(error);
            else resolve(value);
        };
        const onData = (chunk: string): void => {
            for (const character of chunk) {
                if (character === '\u0003') {
                    finish(new Error('Administrator bootstrap cancelled.'));
                    return;
                }
                if (character === '\r' || character === '\n') {
                    finish();
                    return;
                }
                if (character === '\u007f' || character === '\b') {
                    if (value.length > 0) {
                        value = value.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    continue;
                }
                if (character >= ' ') {
                    value += character;
                    process.stdout.write('*');
                }
            }
        };
        process.stdin.on('data', onData);
    });
}

async function getBootstrapInput(): Promise<z.input<typeof bootstrapInputSchema>> {
    const envValues = {
        email: process.env.PHO_BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.PHO_BOOTSTRAP_ADMIN_PASSWORD,
        firstName: process.env.PHO_BOOTSTRAP_ADMIN_FIRST_NAME,
        lastName: process.env.PHO_BOOTSTRAP_ADMIN_LAST_NAME,
    };
    if (Object.values(envValues).every(value => typeof value === 'string' && value.length > 0)) {
        return envValues as z.input<typeof bootstrapInputSchema>;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Run this command in an interactive terminal or provide every bootstrap environment variable.');
    }

    const readline = createInterface({ input: process.stdin, output: process.stdout });
    const email = await readline.question('Admin email: ');
    const firstName = await readline.question('First name: ');
    const lastName = await readline.question('Last name: ');
    readline.close();

    const password = await readHidden('Password (minimum 12 characters): ');
    const confirmation = await readHidden('Confirm password: ');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    return { email, password, firstName, lastName };
}

if (!process.argv.includes(REQUIRED_ACK)) {
    throw new Error(`First-admin bootstrap requires the explicit argument ${REQUIRED_ACK}.`);
}

const input = bootstrapInputSchema.parse(await getBootstrapInput());

const passwordHash = await bcrypt.hash(input.password, 12);
delete process.env.PHO_BOOTSTRAP_ADMIN_PASSWORD;

const client = await pool.connect();
try {
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_first_admin_bootstrap'))");

        const readiness = await client.query<{
            users_table: string | null;
            migration_010: string | null;
            user_count: number;
        }>(`
            SELECT
                to_regclass('public.users')::text AS users_table,
                (SELECT version FROM pho_schema_migrations
                 WHERE version = '010' AND name = '010_v5_phase2_public_intake_controls') AS migration_010,
                CASE WHEN to_regclass('public.users') IS NULL THEN -1
                     ELSE (SELECT COUNT(*)::int FROM users) END AS user_count
        `);
        const state = readiness.rows[0];
        if (!state?.users_table || state.migration_010 !== '010') {
            throw new Error('The database schema is not ready through migration 010.');
        }
        if (state.user_count !== 0) {
            throw new Error('First-admin bootstrap is disabled because a user already exists.');
        }

        const inserted = await client.query<{ id: number }>(`
            INSERT INTO users (
                email, password_hash, role, portal_role, job_title,
                first_name, last_name, is_active, failed_login_attempts
            ) VALUES ($1, $2, 'admin', 'admin', 'Administrator', $3, $4, TRUE, 0)
            RETURNING id
        `, [input.email.toLowerCase(), passwordHash, input.firstName, input.lastName]);
        const adminId = inserted.rows[0]?.id;
        if (!adminId) throw new Error('PostgreSQL did not return the new administrator id.');

        await client.query(`
            INSERT INTO audit_events (
                actor_id, portal_role, action, entity_type, entity_id, details
            ) VALUES (
                $1, 'admin', 'BOOTSTRAP_FIRST_ADMIN', 'USER', $2,
                jsonb_build_object('source', 'controlled_first_admin_bootstrap')
            )
        `, [adminId, String(adminId)]);

        await client.query('COMMIT');
        console.log(JSON.stringify({
            status: 'created',
            portalRole: 'admin',
            clinicalPermissions: 0,
            nextStep: 'Sign in at http://localhost:5173/Login using the locally supplied credentials.',
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
} finally {
    client.release();
    await pool.end();
}
