import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { register, login, logout, getCurrentUser } from '../controllers/authController.js';
import { sendMessage, getHistory } from '../controllers/chatController.js';
import { getStats, generateBindCode, createRecharge } from '../controllers/userController.js';

const router = express.Router();

// 认证相关
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/logout', logout);
router.get('/auth/me', authenticate, getCurrentUser);

// 聊天相关
router.post('/chat/send', authenticate, sendMessage);
router.get('/chat/history', authenticate, getHistory);

// 用户相关
router.get('/user/stats', authenticate, getStats);
router.get('/user/bind-code', authenticate, generateBindCode);
router.post('/user/recharge', authenticate, createRecharge);

export default router;
