import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to resolve ca.pem: checks local folder first, then Render secrets
const getCaCert = (): string => {
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

const getIsLocal = (urlStr?: string): boolean => {
    if (!urlStr) return false;
    try {
        const parsed = new URL(urlStr);
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    } catch {
        // A legacy local .env may contain an unescaped reserved character in
        // the password. Never use this fallback to classify a remote target.
        return /@(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(urlStr);
    }
};

const isLocal = getIsLocal(process.env.DATABASE_URL);

// Only try to load the CA cert if we are connecting to a remote DB (SSL required)
const caCert = isLocal ? undefined : getCaCert();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : {
        rejectUnauthorized: true,
        ca: caCert,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

export default pool;
