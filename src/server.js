import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

import { SESSION_SECRET } from './config/secrets.js';

// 导入路由
import webRoutes from './web/routes/index.js';
import apiRoutes from './web/routes/api.js';

// 导入 WebSocket 管理器
import wsManager from './services/websocket.js';
// 导入 WS 聊天处理器（在 server.js 注入，避免 websocket ↔ chatController 循环 import）
import { processChatFromWS } from './web/controllers/chatController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8044;
const flutterWebDir = path.join(__dirname, '../frontend_build/my_alpha');

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
app.use(express.static(path.join(__dirname, '../public')));
app.use('/app', express.static(flutterWebDir));

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

// 创建 HTTP 服务器
const server = http.createServer(app);

// 初始化 WebSocket，并注入聊天消息处理器
wsManager.initialize(server);
wsManager.setMessageHandler(processChatFromWS);

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 官网服务器运行在端口 ${PORT}`);
  console.log(`📱 Web 界面: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket 服务器: ws://localhost:${PORT}/ws`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM 信号已接收: 关闭 HTTP 服务器');
  wsManager.close();
  server.close(() => {
    console.log('HTTP 服务器已关闭');
  });
});

export default app;
