import express from 'express';
import { sendTestEmail, unsubscribe } from '../controllers/emailController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Opened from the link in announcement emails, so it has no login
router.get('/unsubscribe', unsubscribe);

router.use(authenticate);

router.post('/test', sendTestEmail);

export default router;
