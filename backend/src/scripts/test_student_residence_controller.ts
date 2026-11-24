import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';
import { createStudent, updateStudent } from '../controllers/StudentController.js';

// These tests invoke the real controllers. Every database and audit entry point
// is replaced before invocation; unrecognized SQL fails instead of using a DB.
interface Call { source: 'pool' | 'client' | 'audit'; sql: string; params: unknown[] }
interface Outcome { status: number; body: Record<string, unknown> }
const originalQuery = pool.query;
const originalConnect = pool.connect;
const originalAudit = AuditService.logEvent;
const originalConsoleError = console.error;
const calls: Call[] = [];
const errors: unknown[][] = [];
const baseline: Record<string, unknown> = {
  id: 501, first_name: 'Address', last_name: 'Regression', student_lrn: 'TEST-ADDRESS-501',
  sex: 'Female', date_of_birth: '2014-01-01', school_id: 123, registered_by: 99,
  municipality_id: 1, barangay_id: 10, street_address: 'Original street',
};
let stored = { ...baseline };
let pending: Record<string, unknown> | null = null;
let releases = 0;

function boundAssignment(sql: string, column: string, params: unknown[]): unknown {
  const match = new RegExp(`\\b${column}\\s*=\\s*\\$(\\d+)`).exec(sql);
  assert.ok(match, `Expected a parameterized ${column} assignment.`);
  return params[Number(match[1]) - 1];
}

const client = {
  async query(sql: string, params: unknown[] = []) {
    calls.push({ source: 'client', sql, params });
    const normalized = sql.trim();
    if (normalized === 'BEGIN') { pending = null; return { rows: [] }; }
    if (normalized === 'COMMIT') {
      if (pending) stored = { ...pending };
      pending = null;
      return { rows: [] };
    }
    if (normalized === 'ROLLBACK') { pending = null; return { rows: [] }; }
    if (/^SELECT id FROM MUNICIPALITIES/.test(normalized)) {
      return { rows: [1, 2].includes(Number(params[0])) ? [{ id: params[0] }] : [] };
    }
    if (/^SELECT id FROM BARANGAYS/.test(normalized)) {
      const parent = new Map([[10, 1], [20, 2]]).get(Number(params[0]));
      return { rows: parent === params[1] ? [{ id: params[0] }] : [] };
    }
    if (/^UPDATE STUDENTS/.test(normalized)) {
      pending = {
        ...stored,
        municipality_id: boundAssignment(sql, 'municipality_id', params),
        barangay_id: boundAssignment(sql, 'barangay_id', params),
        street_address: boundAssignment(sql, 'street_address', params),
        school_id: boundAssignment(sql, 'school_id', params),
      };
      return { rows: [{ ...pending }] };
    }
    if (/^INSERT INTO STUDENTS/.test(normalized)) {
      const match = /INSERT INTO STUDENTS\s*\(([\s\S]+?)\)\s*VALUES/i.exec(sql);
      assert.ok(match?.[1], 'Expected explicit student INSERT columns.');
      const inserted = Object.fromEntries(match[1].split(',').map((column, index) => [column.trim(), params[index]]));
      pending = { ...inserted, id: 502 };
      return { rows: [{ id: 502 }] };
    }
    throw new Error(`Unexpected mocked client query: ${normalized.slice(0, 80)}`);
  },
  release() { releases++; },
};

async function poolQuery(sql: string, params: unknown[] = []) {
  calls.push({ source: 'pool', sql, params });
  if (/^SELECT \* FROM STUDENTS WHERE id/.test(sql.trim())) return { rows: [{ ...stored }] };
  if (/^SELECT id, is_active FROM SCHOOLS/.test(sql.trim())) {
    return { rows: params[0] === 123 ? [{ id: 123, is_active: true }] : [] };
  }
  throw new Error(`Unexpected mocked pool query: ${sql.trim().slice(0, 80)}`);
}

async function invoke(controller: typeof updateStudent, body: Record<string, unknown>): Promise<Outcome> {
  const result: Outcome = { status: 0, body: {} };
  const response = {
    status(code: number) { result.status = code; return response; },
    json(value: Record<string, unknown>) { result.body = value; return response; },
  };
  await controller({
    params: { id: '501' }, body,
    user: { id: 99, portal_role: 'superuser' },
    ip: '127.0.0.1',
  } as unknown as Request, response as unknown as Response);
  return result;
}

function reset() { stored = { ...baseline }; pending = null; calls.length = 0; errors.length = 0; releases = 0; }
const writes = () => calls.filter(call => /^(UPDATE|INSERT INTO) STUDENTS/.test(call.sql.trim()));
const transaction = () => calls.filter(call => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(call.sql.trim())).map(call => call.sql.trim());

try {
  pool.query = poolQuery as typeof pool.query;
  pool.connect = (async () => client) as unknown as typeof pool.connect;
  AuditService.logEvent = async event => { calls.push({ source: 'audit', sql: event.action, params: [] }); };
  console.error = (...values: unknown[]) => { errors.push(values); };

  reset();
  const edited = await invoke(updateStudent, {
    municipality: '2', municipality_id: 2, barangay: '20', barangay_id: 20,
    address: 'Updated street', street_address: 'Updated street',
  });
  assert.equal(edited.status, 200);
  const updated = edited.body.data as Record<string, unknown>;
  assert.equal(updated.municipality_id, 2);
  assert.equal(updated.barangay_id, 20);
  assert.equal(updated.street_address, 'Updated street');
  assert.equal(stored.school_id, 123, 'Residence edits preserve school assignment.');
  assert.deepEqual(transaction(), ['BEGIN', 'COMMIT']);
  assert.equal(releases, 1);
  assert.equal(errors.length, 0);
  assert.ok(calls.findIndex(call => /FROM BARANGAYS/.test(call.sql)) < calls.findIndex(call => /^\s*UPDATE STUDENTS/.test(call.sql)),
    'The controller validates the hierarchy before updating.');

  reset();
  const conflicting = await invoke(updateStudent, { municipality_id: 1, municipality: '2', barangay_id: 10, barangay: '10' });
  assert.equal(conflicting.status, 400);
  assert.equal(writes().length, 0);
  assert.deepEqual(stored, baseline);
  assert.deepEqual(transaction(), []);

  reset();
  const mismatched = await invoke(updateStudent, { municipality_id: 2, barangay_id: 10 });
  assert.equal(mismatched.status, 400, 'A real controller call must reject a barangay under another municipality.');
  assert.equal(writes().length, 0);
  assert.deepEqual(transaction(), ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(stored, baseline);
  assert.equal(releases, 1);
  assert.equal(calls.filter(call => call.source === 'audit').length, 0);

  reset();
  const cleared = await invoke(updateStudent, { municipality_id: null });
  assert.equal(cleared.status, 200);
  const clearedStudent = cleared.body.data as Record<string, unknown>;
  assert.equal(clearedStudent.municipality_id, null);
  assert.equal(clearedStudent.barangay_id, null, 'Clearing the parent alone clears the existing child.');
  assert.equal(stored.street_address, baseline.street_address, 'Omitted street address remains intact.');
  assert.deepEqual(transaction(), ['BEGIN', 'COMMIT']);

  const newStudent = {
    first_name: 'New', last_name: 'Regression', sex: 'Female', date_of_birth: '2014-01-01',
    student_lrn: 'TEST-ADDRESS-502', school_id: 123, municipality_id: 2, barangay_id: 20,
  };
  reset();
  const created = await invoke(createStudent, newStudent);
  assert.equal(created.status, 201);
  assert.equal(stored.municipality_id, 2);
  assert.equal(stored.barangay_id, 20);
  assert.deepEqual(transaction(), ['BEGIN', 'COMMIT']);

  reset();
  const invalidCreate = await invoke(createStudent, { ...newStudent, barangay_id: 10 });
  assert.equal(invalidCreate.status, 400);
  assert.equal(writes().length, 0);
  assert.deepEqual(transaction(), ['BEGIN', 'ROLLBACK']);
  assert.equal(releases, 1);

  console.log('Student residence controller persistence and rollback checks passed (database fully mocked).');
} finally {
  pool.query = originalQuery;
  pool.connect = originalConnect;
  AuditService.logEvent = originalAudit;
  console.error = originalConsoleError;
  await pool.end();
}
