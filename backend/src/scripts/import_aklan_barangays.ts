import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../database/db.js';

type Entry = { municipality: string; barangay: string };
type Source = { source_filename: string; source_sha256: string; rows: Entry[] };

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const expectedHost = [...args].find(arg => arg.startsWith('--expected-host='))?.split('=')[1];
const expectedDatabase = [...args].find(arg => arg.startsWith('--expected-database='))?.split('=')[1];

if (!expectedHost || !expectedDatabase) {
    throw new Error('Pass --expected-host=<host> and --expected-database=<database>. Add --apply only to insert.');
}

const configuredUrl = new URL(process.env.DATABASE_URL ?? '');
const configuredDatabase = decodeURIComponent(configuredUrl.pathname.slice(1));
if (configuredUrl.hostname !== expectedHost || configuredDatabase !== expectedDatabase) {
    throw new Error('Configured database does not match the explicitly expected target.');
}

const sourcePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/aklan_barangays_import.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as Source;
const rows = source.rows;
const names = [...new Set(rows.map(row => row.municipality))];
const pairs = new Set(rows.map(row => `${row.municipality.toLocaleLowerCase('en')}\u0000${row.barangay.toLocaleLowerCase('en')}`));

if (rows.length !== 311 || names.length !== 16 || pairs.size !== rows.length || rows.some(row =>
    !row.municipality || !row.barangay || row.municipality !== row.municipality.trim() ||
    row.barangay !== row.barangay.trim() || row.barangay.length > 255 || row.municipality === 'Kalibo'
)) {
    throw new Error('Import data failed validation; no database changes were made.');
}

const expectedCounts = new Map<string, number>();
for (const row of rows) expectedCounts.set(row.municipality, (expectedCounts.get(row.municipality) ?? 0) + 1);

const client = await pool.connect();
try {
    await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const province = await client.query<{ id: number }>(
        "SELECT id FROM provinces WHERE lower(name) = 'aklan'"
    );
    if (province.rowCount !== 1) throw new Error('Expected exactly one Aklan province.');
    const provinceId = province.rows[0]!.id;

    const municipalities = await client.query<{ id: number; name: string }>(
        `SELECT id, name FROM municipalities WHERE province_id = $1 ORDER BY id ${apply ? 'FOR UPDATE' : ''}`,
        [provinceId]
    );
    const actualNames = municipalities.rows.map(row => row.name);
    if (actualNames.length !== 17 || actualNames.some(name => name !== 'Kalibo' && !expectedCounts.has(name)) ||
        names.some(name => !actualNames.includes(name))) {
        throw new Error('Municipality names do not match the workbook; no database changes were made.');
    }

    const before = await client.query<{ name: string; count: number }>(
        `SELECT m.name, count(b.id)::int AS count
         FROM municipalities m LEFT JOIN barangays b ON b.municipality_id = m.id
         WHERE m.province_id = $1 GROUP BY m.id, m.name ORDER BY m.name`,
        [provinceId]
    );
    if (before.rows.some(row => row.count !== (row.name === 'Kalibo' ? 16 : 0))) {
        throw new Error('Barangay counts changed since preflight; no database changes were made.');
    }

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', target: `${expectedHost}/${expectedDatabase}`,
        source: source.source_filename, source_sha256: source.source_sha256,
        existing_kalibo: 16, municipalities_to_fill: 16, planned_inserts: rows.length,
        by_municipality: Object.fromEntries([...expectedCounts].sort(([a], [b]) => a.localeCompare(b))) }, null, 2));

    if (apply) {
        const inserted = await client.query(
            `INSERT INTO barangays (name, municipality_id)
             SELECT source.barangay, m.id
             FROM jsonb_to_recordset($1::jsonb) AS source(municipality text, barangay text)
             JOIN municipalities m ON m.name = source.municipality AND m.province_id = $2`,
            [JSON.stringify(rows), provinceId]
        );
        if (inserted.rowCount !== rows.length) throw new Error('Inserted row count differs from source.');

        const after = await client.query<{ name: string; count: number }>(
            `SELECT m.name, count(b.id)::int AS count
             FROM municipalities m LEFT JOIN barangays b ON b.municipality_id = m.id
             WHERE m.province_id = $1 GROUP BY m.id, m.name ORDER BY m.name`,
            [provinceId]
        );
        if (after.rows.some(row => row.count !== (row.name === 'Kalibo' ? 16 : expectedCounts.get(row.name)))) {
            throw new Error('Post-import counts do not match the workbook.');
        }
        await client.query('COMMIT');
        console.log(`Committed ${inserted.rowCount} barangays; Kalibo remains at 16.`);
    } else {
        await client.query('ROLLBACK');
        console.log('Dry run complete; no database changes were made.');
    }
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
    await pool.end();
}
