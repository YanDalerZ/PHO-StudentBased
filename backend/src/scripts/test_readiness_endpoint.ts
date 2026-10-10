import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://readiness_check:unused@127.0.0.1:1/unreachable';
process.env.JWT_SECRET = 'readiness-check-only-not-a-real-secret';

const { app } = await import('../index.js');
const { default: pool } = await import('../database/db.js');
const server = app.listen(0, '127.0.0.1');
try {
    await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    console.log('PASS: /healthz returns 503 without disclosing database details when unavailable.');
} finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
}
