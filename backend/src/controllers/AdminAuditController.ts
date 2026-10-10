import type { Request, Response } from 'express';
import { z } from 'zod';
import { listAuditEvents } from '../services/auditBrowser.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const positiveInt = z.coerce.number().int().positive().safe();
const querySchema = z.object({
    actor_id: positiveInt.optional(),
    action: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,99}$/).optional(),
    entity_type: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,99}$/).optional(),
    date_from: date.optional(),
    date_to: date.optional(),
    page: positiveInt.max(100000).default(1),
    pageSize: positiveInt.max(100).default(25),
}).strict().refine(value => !value.date_from || !value.date_to || value.date_from <= value.date_to);

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid audit log filters.' });
        return;
    }
    try {
        res.status(200).json(await listAuditEvents(parsed.data));
    } catch (error) {
        const code = error && typeof error === 'object' ? Reflect.get(error, 'code') : null;
        console.error('Audit browser query failed', { code });
        res.status(500).json({ error: 'Unable to load audit events.' });
    }
}
