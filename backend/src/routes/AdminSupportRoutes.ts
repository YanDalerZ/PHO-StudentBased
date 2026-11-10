import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import * as support from '../services/support.service.js';
import { attemptAccountNotification, refreshAccountDelivery } from '../services/supportNotification.js';
import { createUserSchema, handleControllerError } from '../controllers/AdminController.js';
import { updateModulePermissionsSchema } from '../controllers/AdminAccessController.js';
import { AdminServiceError } from '../services/admin.service.js';

const router = Router();
const reports = z.enum(['open', 'in_review', 'resolved']);
const accounts = z.enum(['pending', 'approved', 'rejected']);
const page = z.coerce.number().int().min(1).max(100000).default(1);
const notes = z.string().trim().max(2000);
const provision = z.strictObject({
    user: createUserSchema.omit({ password: true }).strict().extend({
        email: z.string().trim().max(254).email(),
        first_name: z.string().trim().min(1).max(100),
        last_name: z.string().trim().min(1).max(100),
        contact_no: z.string().trim().max(50).optional().nullable(),
    }),
    school_ids: z.array(z.number().int().min(1).max(2147483647)).max(500),
    permissions: updateModulePermissionsSchema,
});

function action(handler: (req: Request, res: Response, actorId: number) => Promise<void>): RequestHandler {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            if (!req.user) { res.sendStatus(401); return; }
            await handler(req, res, req.user.id);
        } catch (error) {
            handleControllerError(error, res, 'Could not complete the support action.');
        }
    };
}
const id = (req: Request) => z.uuid().parse(req.params.id);

router.get('/reports', action(async (req, res) => {
    const query = z.strictObject({ status: reports.optional(), page }).parse(req.query);
    res.json(await support.listSupport('reports', query.status, query.page));
}));
router.get('/accounts', action(async (req, res) => {
    const query = z.strictObject({ status: accounts.optional(), page }).parse(req.query);
    res.json(await support.listSupport('accounts', query.status, query.page));
}));
router.get('/accounts/:id', action(async (req, res) => {
    res.json({ data: await support.getAccountRequest(id(req)) });
}));
router.patch('/reports/:id', action(async (req, res, actorId) => {
    const body = z.strictObject({ status: reports, resolution_notes: notes.optional() })
        .refine(value => value.status !== 'resolved' || !!value.resolution_notes, 'Add resolution notes before resolving.')
        .parse(req.body);
    await support.updateReport(id(req), body.status, body.resolution_notes, actorId, req.ip);
    res.sendStatus(204);
}));
router.post('/accounts/:id/reject', action(async (req, res, actorId) => {
    const body = z.strictObject({ note: notes.min(1) }).parse(req.body);
    await support.rejectAccountRequest(id(req), body.note, actorId, req.ip);
    res.sendStatus(204);
}));
router.post('/accounts/:id/provision', action(async (req, res, actorId) => {
    const { user: { portal_role, ...user }, school_ids, permissions } = provision.parse(req.body);
    const created = await support.provisionAccountRequest(id(req), { ...user, role: portal_role }, school_ids, permissions, actorId, req.ip);
    res.status(201).json({ data: created });
}));
router.post('/accounts/:id/retry-notification', action(async (req, res) => {
    z.strictObject({}).parse(req.body ?? {});
    if (!await attemptAccountNotification(id(req), true)) {
        throw new AdminServiceError(409, 'The notification is in progress, was sent in the last minute, or is no longer eligible.');
    }
    res.json({ data: await support.getAccountRequest(id(req)) });
}));
router.post('/accounts/:id/check-delivery', action(async (req, res) => {
    z.strictObject({}).parse(req.body ?? {});
    await refreshAccountDelivery(id(req));
    res.json({ data: await support.getAccountRequest(id(req)) });
}));

export default router;
