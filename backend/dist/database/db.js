import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Read ca.pem from your database folder
const caCert = fs.readFileSync(path.join(__dirname, 'ca.pem')).toString();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true, // Enforce SSL validation using the CA below
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
//# sourceMappingURL=db.js.map