import { Router } from 'express';
import { createStudent } from '../controllers/StudentController.js';

const router = Router();

router.post('/', createStudent);

export default router;
