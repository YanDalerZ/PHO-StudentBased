import assert from 'node:assert/strict';
import { z } from 'zod';
import { resolveStudentResidence, validateStudentResidence } from '../services/student-residence.service.js';

const original = { municipality_id: 1, barangay_id: 10 };
assert.deepEqual(resolveStudentResidence({}, original), original, 'Unrelated edits preserve the residence.');
assert.deepEqual(resolveStudentResidence({ municipality: '2', municipality_id: 2, barangay: '20', barangay_id: 20 }, original),
    { municipality_id: 2, barangay_id: 20 }, 'Changed selections replace both canonical IDs.');
assert.deepEqual(resolveStudentResidence({ municipality_id: 2 }, original),
    { municipality_id: 2, barangay_id: null }, 'Changing only municipality clears the previous barangay.');
assert.deepEqual(resolveStudentResidence({ municipality_id: null }, original),
    { municipality_id: null, barangay_id: null }, 'Clearing the municipality also clears its old barangay.');
assert.deepEqual(resolveStudentResidence({ municipality_id: 1, municipality: 'Kalibo', barangay_id: 10, barangay: 'Poblacion' }),
    original, 'Display names from read responses are not numeric aliases.');
assert.deepEqual(resolveStudentResidence({ municipality: '', municipality_id: null, barangay: '', barangay_id: null }),
    { municipality_id: null, barangay_id: null });
assert.throws(() => resolveStudentResidence({ municipality: '2', municipality_id: 1 }, original), z.ZodError,
    'A conflicting stale canonical ID cannot silently win over a changed selection.');
assert.throws(() => resolveStudentResidence({ barangay: '20', barangay_id: 10 }, original), z.ZodError);
for (const municipality_id of ['Kalibo', 'NaN', '1.5', '0', -1, 2_147_483_648]) {
    assert.throws(() => resolveStudentResidence({ municipality_id }), z.ZodError);
}
assert.throws(() => resolveStudentResidence({ municipality_id: null, barangay_id: 10 }), z.ZodError);

const calls: Array<{ sql: string; params: unknown[] }> = [];
const directory = {
    query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        assert.match(sql, /^SELECT /, 'Validation never mutates data.');
        assert.match(sql, /FOR SHARE$/, 'Hierarchy is held stable until the write transaction commits.');
        const id = Number(params[0]);
        const found = sql.includes('MUNICIPALITIES') ? [1, 2].includes(id)
            : id === 10 && params[1] === 1 || id === 20 && params[1] === 2;
        return { rows: found ? [{ id }] : [] };
    },
};
await validateStudentResidence(directory, { municipality_id: 2, barangay_id: 20 });
assert.deepEqual(calls.map(call => call.params), [[2], [20, 2]], 'Both IDs are bound query parameters.');
await assert.rejects(validateStudentResidence(directory, { municipality_id: 2, barangay_id: 10 }), z.ZodError,
    'Barangays from another municipality are rejected.');
await assert.rejects(validateStudentResidence(directory, { municipality_id: 99, barangay_id: null }), z.ZodError,
    'Unknown municipality IDs are rejected.');
calls.length = 0;
await validateStudentResidence(directory, { municipality_id: null, barangay_id: null });
assert.equal(calls.length, 0, 'Unassigned residence is allowed without guessing a municipality.');

console.log('Student residence ID, stale-alias, nullable-update and hierarchy regression checks passed.');
