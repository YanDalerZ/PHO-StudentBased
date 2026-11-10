import express, { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { publicRegistrationHeaders } from '../middleware/publicRegistrationSecurity.js';
import { submitAccountRequest, submitProblem } from '../services/support.service.js';

const router = Router();
const windowMs = 15 * 60_000;
const buckets = new Map<string, number>();
let resetAt = 0;
let total = 0;
const neutral = { message: 'Your request was received. If action is needed, a PHO administrator will contact you.' };

const email = z.string().trim().max(254).email().transform(value => value.toLowerCase());
const name = z.string().trim().min(2).max(200);
const trap = z.string().max(200).optional();
const problem = z.strictObject({
    name, reply_email: email, category: z.enum(['login', 'technical', 'access', 'other']),
    description: z.string().trim().min(10).max(2000),
    page_or_module: z.string().trim().max(150).optional(),
    website: trap,
});
const account = z.strictObject({
    name, work_email: email, contact_no: z.string().trim().max(30).regex(/^(?=(?:\D*\d){7,15}\D*$)\+?[\d ()-]+$/),
    job_title: z.string().trim().min(1).max(100),
    school_or_office: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(10).max(2000),
    website: trap,
});

router.use(publicRegistrationHeaders);
router.post(['/reports', '/accounts'], (req, res, next) => {
    const now = Date.now();
    if (now >= resetAt) {
        resetAt = now + windowMs;
        buckets.clear();
        total = 0;
    }
    const key = req.ip ?? 'unknown';
    const attempts = buckets.get(key) ?? 0;
    if (attempts >= 10 || total >= 300) {
        res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
        res.status(429).json({ error: 'Too many submissions. Please try again later.' });
        return;
    }
    buckets.set(key, attempts + 1);
    total++;
    if (!req.is('application/json')) {
        res.status(415).json({ error: 'Send the form as JSON.' });
        return;
    }
    next();
}, express.json({ limit: '16kb', inflate: false }));

router.post('/reports', async (req, res) => {
    const parsed = problem.safeParse(req.body);
    if (!parsed.success || parsed.data.website) {
        res.status(400).json({ error: 'Check the form and try again.', fieldErrors: parsed.success ? {} : parsed.error.flatten().fieldErrors });
        return;
    }
    const reference = await submitProblem(parsed.data);
    res.status(201).json({ reference });
});

router.post('/accounts', async (req, res) => {
    const parsed = account.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Check the form and try again.', fieldErrors: parsed.error.flatten().fieldErrors });
        return;
    }
    if (!parsed.data.website) await submitAccountRequest(parsed.data);
    res.status(202).json(neutral);
});

const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    if (status === 413 || status === 400 || status === 415) {
        res.status(status).json({ error: status === 413 ? 'The form is too large.' : 'Invalid form submission.' });
        return;
    }
    console.error('Public support submission failed.');
    res.status(503).json({ error: 'Support submissions are temporarily unavailable. Please try again later.' });
};
router.use(handleError);

export default router;
