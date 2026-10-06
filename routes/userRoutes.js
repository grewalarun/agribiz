import express from 'express';
import { signup, register, login, refreshToken, logout, getMe } from '../controllers/userController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

export default router;
