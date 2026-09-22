import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to resolve ca.pem: checks local folder first, then Render secrets.
// Local PostgreSQL does not require the Aiven CA certificate.
const getCaCert = (databaseUrl: string): string | undefined => {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return undefined;
    }

    // If testing without SSL, return undefined
    if (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_SSL === 'false') {
        return undefined;
    }

    // 1. Check in the same directory, source directory, or process cwd
    const candidatePaths = [
        path.join(__dirname, 'ca.pem'),
        path.join(__dirname, '../src/database/ca.pem'),
        path.join(process.cwd(), 'src/database/ca.pem'),
        path.join(process.cwd(), 'backend/src/database/ca.pem'),
    ];
    for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate)) {
            return fs.readFileSync(candidate, 'utf8');
        }
    }

    // 2. Fallback to Render's secret mount path (/etc/secrets/ca.pem)
    const renderSecretPath = '/etc/secrets/ca.pem';
    if (fs.existsSync(renderSecretPath)) {
        return fs.readFileSync(renderSecretPath, 'utf8');
    }

    // 3. Fallback to direct environment variable if set
    if (process.env.DB_CA_CERT) {
        return process.env.DB_CA_CERT;
    }

    throw new Error('SSL CA Certificate (ca.pem) not found locally or in Render secrets.');
};

// --- Test Safeguards ---
let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is required');
}

if (process.env.NODE_ENV === 'test') {
    if (!process.env.TEST_DATABASE_URL) {
        throw new Error('TEST_DATABASE_URL is required in test mode');
    }
    if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
        throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL');
    }
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(process.env.TEST_DATABASE_URL);
    } catch {
        throw new Error('TEST_DATABASE_URL is not a valid URL');
    }
    const rawPathname = decodeURIComponent(parsedUrl.pathname);
    const pathSegments = rawPathname.split('/').filter(Boolean);
    if (pathSegments.length !== 1 || !pathSegments[0]) {
        throw new Error('TEST_DATABASE_URL pathname must contain exactly one database name');
    }
    const dbName = pathSegments[0];
    if (!dbName.endsWith('_test')) {
        throw new Error('Test database name must end with _test');
    }
    connectionString = process.env.TEST_DATABASE_URL;
}

const parsedConnection = new URL(connectionString);
const databaseName = decodeURIComponent(parsedConnection.pathname).replace(/^\//, '');
const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(parsedConnection.hostname.toLowerCase());

// Prevent a local development server from silently writing to the production
// Aiven database. Render must set NODE_ENV=production to use `defaultdb`.
if (process.env.NODE_ENV !== 'production' && !isLocalDatabase && databaseName === 'defaultdb') {
    throw new Error(
        'Refusing to connect a non-production process to production database "defaultdb". ' +
        'Point DATABASE_URL to a dedicated pho_dev database.'
    );
}

const caCert = getCaCert(connectionString);

const pool = new Pool({
    connectionString,
    ssl: caCert ? {
        rejectUnauthorized: true,
        ca: caCert,
    } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

export default pool;
