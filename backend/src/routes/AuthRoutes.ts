import { Router } from 'express';
import { login, logout, getMe, getSession, continueSession } from '../controllers/AuthController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.get('/session', authenticate, getSession);
router.post('/session/activity', authenticate, continueSession);

export default router;
