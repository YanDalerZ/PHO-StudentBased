import assert from 'node:assert/strict';
import {
    buildReportQueryParts, normalizeReportFilters, ReportContractError, validateReportGeography,
} from '../services/report.service.js';
import {
    getConsistentReportDocument, getReportDocument, type ReportDocumentExecutor,
} from '../services/report-document.service.js';
import type { ModuleSlug } from '../types/auth.types.js';

const modules: ModuleSlug[] = ['patient-info', 'oral-health', 'deworming', 'immunization', 'vital-signs'];
const schoolFilters = normalizeReportFilters({ period: '2026-11' }, { purpose: 'preview' });
const residenceFilters = normalizeReportFilters({
    period: '2026-11', geography_basis: 'residence', municipality_id: 2, barangay_id: 22, school_id: 11,
}, { purpose: 'preview' });
assert.equal(schoolFilters.geography_basis, undefined, 'Omitted basis preserves the school default contract.');
assert.equal(residenceFilters.geography_basis, 'residence');
assert.throws(() => normalizeReportFilters({ geography_basis: 'anything' }, { purpose: 'preview' }),
    error => error instanceof ReportContractError && error.status === 400);

for (const module of modules) {
    const schoolQuery = buildReportQueryParts(module, schoolFilters, { mode: 'province' });
    assert.match(schoolQuery.fromSql, /LEFT JOIN BARANGAYS b ON sc\.barangay_id = b\.id/);
    assert.match(schoolQuery.fromSql, /LEFT JOIN SCHOOLS/, 'Unassigned school geography must remain visible.');
    const residenceQuery = buildReportQueryParts(module, residenceFilters, { mode: 'restricted', schoolIds: [11] });
    assert.match(residenceQuery.fromSql, /LEFT JOIN MUNICIPALITIES m ON s\.municipality_id = m\.id/);
    assert.match(residenceQuery.fromSql, /s\.barangay_id = b\.id AND b\.municipality_id = m\.id/);
    assert.match(residenceQuery.whereSql, /m\.id = \$1/);
    assert.match(residenceQuery.whereSql, /b\.id = \$2/);
    assert.match(residenceQuery.whereSql, /sc\.id = \$3/);
    assert.match(residenceQuery.whereSql, /s\.school_id = ANY\(\$6::int\[\]\)/,
        'Residence filters must never replace the school authorization boundary.');
    assert.deepEqual(residenceQuery.params, [2, 22, 11, '2026-11-01', '2026-11-30', [11]]);
}

const geographyQueries: Array<{ sql: string; params: unknown[] }> = [];
await validateReportGeography({ query: async (sql, params) => {
    geographyQueries.push({ sql, params });
    return { rows: [{ id: 1 }] };
} }, residenceFilters);
assert.equal(geographyQueries.length, 2);
assert.deepEqual(geographyQueries[0]?.params, [11], 'Validate school independently of residence.');
assert.doesNotMatch(geographyQueries[0]!.sql, /BARANGAYS/);
assert.deepEqual(geographyQueries[1]?.params, [22, 2], 'Validate residence municipality/barangay together.');
await assert.rejects(validateReportGeography({ query: async () => ({ rows: [] }) }, residenceFilters),
    error => error instanceof ReportContractError && error.status === 400);

class MemoryReportExecutor implements ReportDocumentExecutor {
    readonly calls: string[] = [];
    constructor(readonly residence = false, readonly count = 20) {}
    async query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
        this.calls.push(sql);
        let rows: Array<Record<string, unknown>>;
        if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) rows = [];
        else if (sql.includes('SELECT sc.id AS school_id')) rows = [{ school_id: 11, municipality_id: 1, municipality: 'School town' }];
        else if (sql.includes('COUNT(DISTINCT s.id) FILTER')) {
            assert.equal(sql.includes('s.municipality_id = m.id'), this.residence);
            const count = this.count;
            rows = [{ municipality_id: this.residence ? 2 : 1,
                municipality: this.residence ? 'Home town' : 'School town',
                accomplished: count, male: Math.floor(count / 2), female: Math.ceil(count / 2), other_sex: 0,
                examinations: count, rpoc_complete: count, oral_screening: count,
                dmft_known: count, dmft_tooth_total: count },
            { municipality_id: null, municipality: null, accomplished: 10, male: 5, female: 5,
                other_sex: 0, examinations: 10, rpoc_complete: 10, oral_screening: 10,
                dmft_known: 10, dmft_tooth_total: 10 }];
        } else if (sql.includes('FROM REPORT_TARGET_REVISIONS')) {
            assert.equal(this.residence, false, 'Residence must never borrow school targets.');
            rows = [{ school_id: 11, indicator: 'examined_students', target_count: 1000 }];
        } else if (sql.includes('SELECT id, name FROM MUNICIPALITIES')) rows = [
            { id: 2, name: 'Home town' }, { id: 1, name: 'School town' },
        ];
        else if (sql.includes('WHERE report_rank = 1')) {
            assert.match(sql, /COALESCE\(m\.name, 'Unassigned municipality'\)/);
            rows = [{ lrn: '123456789012', student_name: 'Example, Student',
                school: 'Example school', municipality: 'Unassigned municipality', barangay: null,
                event_date: '2026-11-10' }];
        } else throw new Error(`Unexpected test query: ${sql}`);
        return { rows: rows as T[] };
    }
}

const school = await getReportDocument(new MemoryReportExecutor(), 'oral-health', 'municipality', schoolFilters, { mode: 'province' });
const schoolTown = school.rows.find(row => row.municipality === 'School town')!;
assert.equal(schoolTown.accomplished, 20);
assert.equal(schoolTown.percentage, 2, 'A 2% rate must not trigger small-count suppression.');
assert.equal(schoolTown.target, 1000);
assert.equal(school.rows.find(row => row.municipality === 'Unassigned municipality')?.accomplished, 10);
assert.equal(school.rows.at(-1)?.accomplished, 30, 'Unassigned records belong in the province total.');
assert.equal(school.rows.at(-1)?.target, null, 'Unassigned geography cannot produce a complete target.');
assert.match(school.title, /school location/);

const residenceExecutor = new MemoryReportExecutor(true);
const residence = await getReportDocument(residenceExecutor, 'oral-health', 'municipality',
    normalizeReportFilters({ period: '2026-11', geography_basis: 'residence' }, { purpose: 'preview' }),
    { mode: 'province' });
assert.equal(residence.rows.find(row => row.municipality === 'Home town')?.accomplished, 20);
assert.equal(residence.rows.find(row => row.municipality === 'School town')?.accomplished, 0);
assert.equal(residence.rows.find(row => row.municipality === 'Unassigned municipality')?.accomplished, 10);
assert.equal(residence.rows.at(-1)?.accomplished, school.rows.at(-1)?.accomplished,
    'Changing grouping must preserve the province total.');
for (const row of residence.rows) {
    assert.equal(row.target, null);
    assert.equal(row.percentage, null);
    assert.equal(row.target_status, 'Not defined for residence');
}
assert.match(residence.title, /student residence/);
assert.equal(residence.columns[0]?.label, 'Residence municipality');
assert.equal(residenceExecutor.calls.some(sql => sql.includes('REPORT_TARGET_REVISIONS')), false);

const restrictedResidence = await getReportDocument(new MemoryReportExecutor(true), 'oral-health', 'municipality',
    residenceFilters, { mode: 'restricted', schoolIds: [11] });
assert.equal(restrictedResidence.rows[0]?.municipality, 'Home town', 'Residence rows must not use the school municipality list.');

for (const module of modules) {
    for (const isResidence of [false, true]) {
        const filters = isResidence ? residenceFilters : schoolFilters;
        for (const count of [1, 2, 3, 4]) {
            const summary = await getReportDocument(new MemoryReportExecutor(isResidence, count), module, 'municipality',
                filters, { mode: 'restricted', schoolIds: [11] });
            const town = summary.rows.find(row => row.municipality === (isResidence ? 'Home town' : 'School town'));
            assert.equal(town?.accomplished, count);
            assert.equal(town?.male, Math.floor(count / 2));
            assert.equal(town?.female, Math.ceil(count / 2));
            if (isResidence) assert.equal(town?.target, null);
            assert.equal(summary.rows.at(-1)?.accomplished, count + 10);
            assert.equal(summary.total_students, count + 10);
            assert.equal(summary.empty, false);
            assert.equal(summary.rows.some(row => Object.values(row).includes('Suppressed')), false);
        }
    }
}

for (const module of modules) {
    const summary = await getReportDocument(new MemoryReportExecutor(true), module, 'municipality',
        residenceFilters, { mode: 'restricted', schoolIds: [11] });
    assert.equal(summary.rows.find(row => row.municipality === 'Home town')?.accomplished, 20);
    assert.equal(summary.rows.at(-1)?.accomplished, 30);
    assert.equal(summary.rows.at(-1)?.target, null);
    assert.equal(summary.rows.at(-1)?.percentage, null);
    if (module === 'immunization') {
        assert.equal(summary.rows.at(-1)?.mr_td_grade1, null);
        assert.equal(summary.rows.at(-1)?.mr_td_grade7, null);
        assert.equal(summary.rows.at(-1)?.hpv_grade4_female, null);
    }
    const masterlist = await getReportDocument(new MemoryReportExecutor(true), module, 'masterlist',
        residenceFilters, { mode: 'restricted', schoolIds: [11] });
    assert.equal(masterlist.columns.find(column => column.key === 'municipality')?.label, 'Residence municipality');
    assert.equal(masterlist.columns.find(column => column.key === 'barangay')?.label, 'Residence barangay');
    assert.equal(masterlist.rows[0]?.municipality, 'Unassigned municipality');
}

let released = false;
const snapshotExecutor = new MemoryReportExecutor();
await getConsistentReportDocument({ connect: async () => Object.assign(snapshotExecutor, {
    release: () => { released = true; },
}) }, 'oral-health', 'municipality', schoolFilters, { mode: 'province' });
assert.match(snapshotExecutor.calls[0]!, /REPEATABLE READ READ ONLY/);
assert.equal(snapshotExecutor.calls.at(-1), 'COMMIT');
assert.equal(released, true);
const failedCalls: string[] = [];
released = false;
await assert.rejects(getConsistentReportDocument({ connect: async () => ({
    query: async sql => {
        failedCalls.push(sql);
        if (!/^(BEGIN|ROLLBACK)/.test(sql)) throw new Error('Example query failure');
        return { rows: [] };
    }, release: () => { released = true; },
}) }, 'oral-health', 'municipality', schoolFilters, { mode: 'province' }), /Example query failure/);
assert.equal(failedCalls.at(-1), 'ROLLBACK');
assert.equal(released, true);

console.log('Report geography, school scope, unassigned totals, small counts and snapshot checks passed (no database).');
