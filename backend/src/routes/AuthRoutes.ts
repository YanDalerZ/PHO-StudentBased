import { Router } from 'express';
import { login, logout, getMe } from '../controllers/AuthController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

export default router;
