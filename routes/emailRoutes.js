import express from 'express';
import { sendTestEmail } from '../controllers/emailController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/test', sendTestEmail);

export default router;
