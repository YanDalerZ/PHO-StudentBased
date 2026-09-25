import path from 'node:path';
import pool from '../database/db.js';
import { applyPhase1Release, RELEASE_MIGRATION_NAME } from '../database/phase1Release.js';
import {
    formatSafeDatabaseTarget,
    readSafeDatabaseIdentity,
    requireProductionMigrationAcknowledgement,
} from '../utils/productionDatabase.js';

requireProductionMigrationAcknowledgement();
const manifestSetting = process.env.PHO_ACCESS_MANIFEST_PATH?.trim();
const manifestPath = manifestSetting ? path.resolve(manifestSetting) : undefined;
const client = await pool.connect();
try {
    const identity = await readSafeDatabaseIdentity(client);
    const result = await applyPhase1Release(client, manifestPath);
    console.log(JSON.stringify({
        target: formatSafeDatabaseTarget(identity),
        migration: RELEASE_MIGRATION_NAME,
        startingState: result.startingState,
        result: result.applied ? 'applied' : 'already-applied',
        checksum: result.checksum,
    }, null, 2));
} finally {
    client.release();
    await pool.end();
}
