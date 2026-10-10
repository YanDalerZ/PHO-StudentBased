import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const entrypoint = path.resolve(process.cwd(), 'dist/index.js');
const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://startup_check:unused@127.0.0.1:1/unreachable',
        JWT_SECRET: 'startup-check-only-not-a-real-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
child.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });

const timeout = setTimeout(() => child.kill(), 35_000);
try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
    });
    assert.equal(exitCode, 1, `Expected failed startup to exit 1; got ${exitCode}. Output: ${output}`);
    assert.match(output, /Database connection failed during startup\./);
    assert.doesNotMatch(output, /Server running on port/);
    console.log('PASS: an unreachable database prevents the server from listening and exits non-zero.');
} finally {
    clearTimeout(timeout);
}
