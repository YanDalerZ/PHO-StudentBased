import express, { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { publicRegistrationHeaders } from '../middleware/publicRegistrationSecurity.js';
import { completeAccountSetup } from '../services/accountSetup.js';

const router = Router();
const attemptsByIp = new Map<string, number>();
const windowMs = 15 * 60_000;
let resetAt = 0;
let total = 0;
const form = z.strictObject({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: z.string().min(12).max(72).refine(password => Buffer.byteLength(password, 'utf8') <= 72),
});

router.use(publicRegistrationHeaders);
router.post('/', (req, res, next) => {
    const now = Date.now();
    if (now >= resetAt) {
        resetAt = now + windowMs;
        attemptsByIp.clear();
        total = 0;
    }
    const ip = req.ip ?? 'unknown';
    const attempts = attemptsByIp.get(ip) ?? 0;
    if (attempts >= 10 || total >= 100) {
        res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
        res.status(429).json({ error: 'Too many attempts. Try again later.' });
        return;
    }
    attemptsByIp.set(ip, attempts + 1);
    total++;
    if (!req.is('application/json')) {
        res.status(415).json({ error: 'Invalid setup request.' });
        return;
    }
    next();
}, express.json({ limit: '2kb', inflate: false }), async (req, res) => {
    const parsed = form.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Use a valid setup link and a password of at least 12 characters and at most 72 bytes.' });
        return;
    }
    if (!await completeAccountSetup(parsed.data.token, parsed.data.password, req.ip)) {
        res.status(400).json({ error: 'This setup link is invalid, expired, or already used. Ask your PHO administrator for help.' });
        return;
    }
    res.sendStatus(204);
});
const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    if (status === 400 || status === 413 || status === 415) {
        res.status(status).json({ error: 'Invalid setup request.' });
        return;
    }
    console.error('Account setup failed.');
    res.status(503).json({ error: 'Password setup is temporarily unavailable. Try again later.' });
};
router.use(handleError);
export default router;
