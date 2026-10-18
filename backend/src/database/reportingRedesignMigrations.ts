import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

const migrations = [
    ['015', '015_reporting_immunization_vaccine_lots'],
    ['016', '016_reporting_target_revisions'],
] as const;

export async function applyReportingRedesignMigrations(client: PoolClient): Promise<string[]> {
    const applied: string[] = [];
    for (const [version, name] of migrations) {
        const sql = fs.readFileSync(path.join(process.cwd(), 'database', 'migrations', `${name}.sql`), 'utf8')
            .replace(/\r\n?/g, '\n');
        const checksum = createHash('sha256').update(sql).digest('hex');
        await client.query('BEGIN');
        try {
            await client.query("SET LOCAL lock_timeout = '10s'");
            await client.query("SET LOCAL statement_timeout = '5min'");
            await client.query("SELECT pg_advisory_xact_lock(hashtext('pho_schema_migrations'))");
            const prior = await client.query<{ name: string; checksum: string }>(
                'SELECT name, checksum FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', [version],
            );
            if (prior.rows[0]) {
                if (prior.rows[0].name !== name || prior.rows[0].checksum.trim() !== checksum) {
                    throw new Error(`Migration ${version} ledger entry differs from the reviewed SQL.`);
                }
                await client.query('COMMIT');
                continue;
            }
            const predecessor = version === '015' ? '014' : '015';
            const baseline = await client.query('SELECT 1 FROM PHO_SCHEMA_MIGRATIONS WHERE version = $1', [predecessor]);
            if (!baseline.rows[0]) throw new Error(`Migration ${version} requires migration ${predecessor}.`);
            await client.query(sql);
            await client.query(
                'INSERT INTO PHO_SCHEMA_MIGRATIONS (version, name, checksum) VALUES ($1, $2, $3)',
                [version, name, checksum],
            );
            await client.query('COMMIT');
            applied.push(version);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    }
    return applied;
}
