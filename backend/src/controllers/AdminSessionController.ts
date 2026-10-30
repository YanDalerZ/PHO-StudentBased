import type { Request, Response } from 'express';
import { z } from 'zod';
import pool from '../database/db.js';
import { AuditService } from '../services/AuditService.js';

const updateSchema = z.strictObject({ inactivityMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]) });

export async function getSessionPolicy(_req: Request, res: Response): Promise<void> {
    try {
        const result = await pool.query<{ inactivity_minutes: number; updated_at: Date }>(
            'SELECT inactivity_minutes, updated_at FROM PORTAL_SESSION_POLICY WHERE id = 1');
        if (!result.rows[0]) throw new Error('Session policy row missing');
        res.set('Cache-Control', 'no-store').json({ inactivityMinutes: result.rows[0].inactivity_minutes, updatedAt: result.rows[0].updated_at });
    } catch (error) {
        console.error('Session policy read failed:', error);
        res.status(503).json({ message: 'Session policy unavailable' });
    }
}

export async function updateSessionPolicy(req: Request, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Select 5, 10, or 15 minutes.' }); return; }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query<{ inactivity_minutes: number }>(
            'SELECT inactivity_minutes FROM PORTAL_SESSION_POLICY WHERE id = 1 FOR UPDATE');
        if (!current.rows[0]) throw new Error('Session policy row missing');
        const previous = current.rows[0].inactivity_minutes;
        if (previous !== parsed.data.inactivityMinutes) {
            await client.query(`UPDATE PORTAL_SESSION_POLICY
                SET inactivity_minutes = $1, updated_by = $2, updated_at = NOW() WHERE id = 1`,
                [parsed.data.inactivityMinutes, req.user!.id]);
            await AuditService.logEvent({
                actor_id: req.user!.id, portal_role: req.user!.portal_role,
                action: 'UPDATE_PORTAL_SESSION_TIMEOUT', entity_type: 'PORTAL_SESSION_POLICY', entity_id: '1',
                details: { previous_minutes: previous, new_minutes: parsed.data.inactivityMinutes }, ip_address: req.ip,
            }, client);
        }
        await client.query('COMMIT');
        res.set('Cache-Control', 'no-store').json({ inactivityMinutes: parsed.data.inactivityMinutes });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Session policy update failed:', error);
        res.status(500).json({ message: 'Unable to update session timeout.' });
    } finally {
        client.release();
    }
}
