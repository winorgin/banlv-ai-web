import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const flutterIndex = path.join(__dirname, '../../../frontend_build/my_alpha/index.html');

const router = express.Router();

function sendFlutterApp(res, next) {
  if (!fs.existsSync(flutterIndex)) {
    return next();
  }
  return res.sendFile(flutterIndex);
}

// 首页
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/index.html'));
});

// 登录页
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/login.html'));
});

// 注册页
router.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/register.html'));
});

// 隐私策略页
router.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/privacy-policy.html'));
});

router.get('/app', (req, res, next) => {
  sendFlutterApp(res, next);
});

router.get('/app/*', (req, res, next) => {
  sendFlutterApp(res, next);
});

export default router;
