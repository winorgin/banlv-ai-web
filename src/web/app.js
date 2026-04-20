import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

import { SESSION_SECRET } from '../config/secrets.js';

// 导入路由
import webRoutes from './routes/index.js';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 18043; // Web server port

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session 配置
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 静态文件
app.use(express.static(path.join(__dirname, '../../public')));

// 路由
app.use('/', webRoutes);
app.use('/api', apiRoutes);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Web Server running on port ${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
});

export default app;
