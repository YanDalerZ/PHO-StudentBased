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
    // 1. Check in the same directory (development / local build output)
    const localPath = path.join(__dirname, 'ca.pem');
    if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf8');
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

const caCert = getCaCert();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
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