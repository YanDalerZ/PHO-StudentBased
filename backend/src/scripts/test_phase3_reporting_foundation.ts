import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModuleSlug } from '../types/auth.types.js';
import {
    REPORT_EXPORT_MAX_ROWS,
    ReportContractError,
    buildReportQueryParts,
    normalizeReportFilters,
    resolveNamedReportPeriod,
    resolveReportSchoolScope,
    validateReportGeography,
} from '../services/report.service.js';

const expectContractError = (
    run: () => unknown,
    code: string,
    status: number,
): void => {
    assert.throws(run, error => (
        error instanceof ReportContractError
        && error.code === code
        && error.status === status
    ));
};

assert.deepEqual(resolveNamedReportPeriod('2026-02'), {
    date_from: '2026-02-01',
    date_to: '2026-02-28',
});
assert.deepEqual(resolveNamedReportPeriod('2028-02'), {
    date_from: '2028-02-01',
    date_to: '2028-02-29',
});
assert.deepEqual(resolveNamedReportPeriod('2026-Q4'), {
    date_from: '2026-10-01',
    date_to: '2026-12-31',
});
assert.deepEqual(resolveNamedReportPeriod('2026-SY-R1'), {
    date_from: '2026-07-01',
    date_to: '2026-12-31',
});
assert.deepEqual(resolveNamedReportPeriod('2026-SY-R2'), {
    date_from: '2027-01-01',
    date_to: '2027-06-30',
});

const defaultFilters = normalizeReportFilters({}, {
    purpose: 'preview',
    now: new Date('2026-10-01T02:00:00.000Z'),
});
assert.deepEqual(defaultFilters, {
    period_source: 'default',
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    date_span_days: 31,
    page: 1,
    pageSize: 25,
    offset: 0,
    timezone: 'Asia/Manila',
});

const explicitFilters = normalizeReportFilters({
    municipality_id: '2',
    barangay_id: '3',
    school_id: '4',
    date_from: '2026-01-01',
    date_to: '2026-01-31',
    page: '2',
    pageSize: '10',
}, { purpose: 'preview' });
assert.equal(explicitFilters.period_source, 'explicit');
assert.equal(explicitFilters.offset, 10);
assert.equal(explicitFilters.school_id, 4);

expectContractError(
    () => normalizeReportFilters({ period: '2026-Q1', date_from: '2026-01-01', date_to: '2026-03-31' }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ date_from: '2026-02-30', date_to: '2026-03-01' }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ date_from: '2026-01-01' }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ period: '2026-H1' }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ period: '2026-01', unexpected: true }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ period: '2026-01', pageSize: 9 }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ period: '2026-01', school_id: true }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);
expectContractError(
    () => normalizeReportFilters({ period: '2026-01', school_id: ['4'] }, { purpose: 'preview' }),
    'VALIDATION_ERROR',
    400,
);

const longPreview = normalizeReportFilters({
    date_from: '2024-01-01',
    date_to: '2024-12-31',
}, { purpose: 'preview' });
assert.equal(longPreview.date_span_days, 366);
expectContractError(
    () => normalizeReportFilters({ date_from: '2024-01-01', date_to: '2024-12-31' }, { purpose: 'export' }),
    'EXPORT_LIMIT_EXCEEDED',
    422,
);
assert.equal(REPORT_EXPORT_MAX_ROWS, 50_000);

assert.deepEqual(resolveReportSchoolScope('school_staff', [3, 3, 5], undefined), {
    mode: 'restricted',
    schoolIds: [3, 5],
});
assert.deepEqual(resolveReportSchoolScope('school_staff', [3, 5], 5), {
    mode: 'restricted',
    schoolIds: [5],
});
expectContractError(() => resolveReportSchoolScope('school_staff', [3], 5), 'FORBIDDEN', 403);
assert.deepEqual(resolveReportSchoolScope('school_staff', [], undefined), {
    mode: 'restricted',
    schoolIds: [],
});
assert.deepEqual(resolveReportSchoolScope('superuser', [], undefined), { mode: 'province' });
assert.deepEqual(resolveReportSchoolScope('superuser', [], 8), {
    mode: 'restricted',
    schoolIds: [8],
});
expectContractError(() => resolveReportSchoolScope('admin', [], undefined), 'FORBIDDEN', 403);

const modules: ModuleSlug[] = [
    'patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs',
];
for (const moduleSlug of modules) {
    const query = buildReportQueryParts(moduleSlug, explicitFilters, {
        mode: 'restricted',
        schoolIds: [4, 7],
    });
    assert.match(query.fromSql, /JOIN STUDENTS s/);
    assert.match(query.whereSql, /m\.id = \$1/);
    assert.match(query.whereSql, /s\.school_id = ANY\(\$6::int\[\]\)/);
    assert.deepEqual(query.params, [2, 3, 4, '2026-01-01', '2026-01-31', [4, 7]]);
    assert.equal(query.whereSql.includes('2026-01-01'), false, 'Filter values must remain parameterized.');
}

const emptyScopeQuery = buildReportQueryParts('patient-info', defaultFilters, {
    mode: 'restricted',
    schoolIds: [],
});
assert.match(emptyScopeQuery.whereSql, /FALSE/);

let capturedParams: unknown[] = [];
await validateReportGeography({
    query: async (_sql, params) => {
        capturedParams = params;
        return { rows: [{ id: 4 }] };
    },
}, explicitFilters);
assert.deepEqual(capturedParams, [4, 3, 2]);

await assert.rejects(
    validateReportGeography({
        query: async () => ({ rows: [] }),
    }, explicitFilters),
    error => error instanceof ReportContractError && error.code === 'VALIDATION_ERROR',
);

const currentFile = fileURLToPath(import.meta.url);
const migrationPath = path.resolve(
    path.dirname(currentFile),
    '../../database/migrations/011_v5_phase3_reporting_foundation.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS DEWORMING_TARGETS/);
assert.match(migration, /vital_signs_referral_details_v5_check/);
assert.match(migration, /override_target_count IS NOT NULL/);
assert.doesNotMatch(migration, /CREATE TABLE(?: IF NOT EXISTS)? REPORT_EXPORTS/i);

console.log('Phase 3 Milestone 2 reporting foundation contract checks passed.');

