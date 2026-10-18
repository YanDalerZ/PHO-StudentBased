import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { resolveNamedReportPeriod } from './report.service.js';
import type { ModuleSlug } from '../types/auth.types.js';

export const REPORT_TARGET_INDICATORS: Record<ModuleSlug, readonly string[]> = {
    'patient-info': ['registrations'],
    'oral-health': ['examined_students'],
    deworming: ['eligible_students'],
    immunization: ['mr_td_grade1', 'mr_td_grade7', 'hpv_grade4_female'],
    'vital-signs': ['screened_students'],
};

const isoDate = z.iso.date();
const periodSchema = z.object({
    period: z.string().regex(/^(?:\d{4}-(?:0[1-9]|1[0-2])|\d{4}-Q[1-4]|\d{4}-SY-R[12])$/).optional(),
    date_from: isoDate.optional(),
    date_to: isoDate.optional(),
}).superRefine((value, context) => {
    if (Boolean(value.period) === Boolean(value.date_from && value.date_to)) {
        context.addIssue({ code: 'custom', message: 'Provide one named period or both exact dates.' });
    }
    if (Boolean(value.date_from) !== Boolean(value.date_to)) {
        context.addIssue({ code: 'custom', message: 'Both exact dates are required.' });
    }
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
        context.addIssue({ code: 'custom', message: 'date_from must be on or before date_to.' });
    }
});

export const targetQuerySchema = periodSchema.safeExtend({
    school_id: z.coerce.number().int().positive().optional(),
    indicator: z.string().max(40).optional(),
});

export const targetWriteSchema = periodSchema.safeExtend({
    school_id: z.number().int().positive(),
    indicator: z.string().max(40),
    target_count: z.number().int().nonnegative(),
    source_note: z.string().trim().min(5).max(500),
});

export function targetPeriod(value: { period?: string | undefined; date_from?: string | undefined; date_to?: string | undefined }) {
    if (value.period) return { ...resolveNamedReportPeriod(value.period), period_label: value.period };
    if (!value.date_from || !value.date_to) throw new Error('Target period was not validated.');
    return { date_from: value.date_from, date_to: value.date_to, period_label: null };
}

export interface TargetRevision {
    id: number;
    school_id: number;
    school_name: string;
    municipality_name: string;
    indicator: string;
    date_from: string;
    date_to: string;
    period_label: string | null;
    target_count: number;
    source_note: string;
    changed_by: number;
    changed_at: string;
}

export async function readTargetRevisions(
    executor: Pool | PoolClient,
    moduleSlug: ModuleSlug,
    input: { date_from: string; date_to: string; school_id?: number | undefined; indicator?: string | undefined },
    permittedSchoolIds: number[] | null,
): Promise<TargetRevision[]> {
    const result = await executor.query<TargetRevision>(`
        SELECT r.id, r.school_id, sc.name AS school_name, m.name AS municipality_name,
               r.indicator, TO_CHAR(r.date_from, 'YYYY-MM-DD') AS date_from,
               TO_CHAR(r.date_to, 'YYYY-MM-DD') AS date_to, r.period_label,
               r.target_count, r.source_note, r.changed_by, r.changed_at
        FROM REPORT_TARGET_REVISIONS r
        JOIN SCHOOLS sc ON sc.id = r.school_id
        JOIN BARANGAYS b ON b.id = sc.barangay_id
        JOIN MUNICIPALITIES m ON m.id = b.municipality_id
        WHERE r.module_slug = $1 AND r.date_from = $2::date AND r.date_to = $3::date
          AND ($4::int IS NULL OR r.school_id = $4)
          AND ($5::text IS NULL OR r.indicator = $5)
          AND ($6::int[] IS NULL OR r.school_id = ANY($6::int[]))
        ORDER BY m.name, sc.name, r.indicator, r.id DESC
    `, [moduleSlug, input.date_from, input.date_to, input.school_id ?? null, input.indicator ?? null, permittedSchoolIds]);
    return result.rows;
}

export async function appendTargetRevision(
    client: PoolClient,
    input: {
        moduleSlug: ModuleSlug;
        indicator: string;
        schoolId: number;
        period: { date_from: string; date_to: string; period_label: string | null };
        targetCount: number;
        sourceNote: string;
        actorId: number;
    },
): Promise<{ id: number; previousCount: number | null }> {
    const lockKey = `${input.moduleSlug}:${input.indicator}:${input.schoolId}:${input.period.date_from}:${input.period.date_to}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
    const previous = await client.query<{ target_count: number }>(`
        SELECT target_count FROM REPORT_TARGET_REVISIONS
        WHERE school_id = $1 AND module_slug = $2 AND indicator = $3
          AND date_from = $4::date AND date_to = $5::date
        ORDER BY id DESC LIMIT 1
    `, [input.schoolId, input.moduleSlug, input.indicator, input.period.date_from, input.period.date_to]);
    const result = await client.query<{ id: number }>(`
        INSERT INTO REPORT_TARGET_REVISIONS
            (school_id, module_slug, indicator, period_label, date_from, date_to,
             target_count, source_note, changed_by)
        VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
        RETURNING id
    `, [input.schoolId, input.moduleSlug, input.indicator, input.period.period_label,
        input.period.date_from, input.period.date_to, input.targetCount, input.sourceNote, input.actorId]);
    return { id: Number(result.rows[0]!.id), previousCount: previous.rows[0]?.target_count ?? null };
}
