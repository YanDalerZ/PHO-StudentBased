import { Router } from 'express';
import { createStudent } from '../controllers/StudentController.js';
import { authenticate } from '../middleware/auth.js';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Optional auth: attaches req.user if token present, but does NOT block if absent.
// This allows the public registration form (no login) to still submit,
// while authenticated teachers get their user ID recorded as registered_by.
const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
            req.user = decoded;
        }
    } catch {
        // Token invalid/expired — just proceed without user context
    }
    next();
};

const router = Router();

// Public-facing registration (optionalAuth captures user if logged in)
router.post('/', optionalAuth, createStudent);

export default router;
