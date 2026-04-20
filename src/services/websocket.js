import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets.js';
import { getUserFullInfo } from './supabase.js';

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Map();   // userId -> WebSocket connection
    this.userInfo = new Map();  // userId -> user object
    this.messageHandler = null; // 由 server.js 注入，避免循环 import
  }

  initialize(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', async (ws, req) => {
      try {
        // 从 URL 参数中获取 token
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
          ws.close(1008, 'No token provided');
          return;
        }

        // 验证 token
        const decoded = jwt.verify(token, JWT_SECRET);
        // 兼容 FastAPI 签发的 user_id（snake_case）和 Node.js 原生的 userId（camelCase）
        const decodedUserId = decoded.userId || decoded.user_id;
        const { data: user, error } = await getUserFullInfo(decodedUserId);

        if (!user || error) {
          ws.close(1008, 'Invalid user');
          return;
        }

        // 保存连接和用户信息
        const userId = user.id;
        this.clients.set(userId, ws);
        this.userInfo.set(userId, user);

        console.log(`[WebSocket] 用户 ${user.username} (${userId}) 已连接`);

        // 发送连接成功消息
        this.sendToUser(userId, {
          type: 'connected',
          message: '实时连接已建立'
        });

        // 处理客户端消息
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleClientMessage(userId, message);
          } catch (error) {
            console.error('[WebSocket] 消息解析失败:', error);
          }
        });

        // 处理断开连接
        ws.on('close', () => {
          this.clients.delete(userId);
          this.userInfo.delete(userId);
          console.log(`[WebSocket] 用户 ${user.username} (${userId}) 已断开`);
        });

        // 处理错误
        ws.on('error', (error) => {
          console.error(`[WebSocket] 用户 ${userId} 连接错误:`, error);
          this.clients.delete(userId);
        });

        // 心跳检测
        ws.isAlive = true;
        ws.on('pong', () => {
          ws.isAlive = true;
        });

      } catch (error) {
        console.error('[WebSocket] 连接认证失败:', error);
        ws.close(1008, 'Authentication failed');
      }
    });

    // 心跳检测定时器
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30秒检测一次

    console.log('[WebSocket] 服务器已启动');
  }

  // 注册聊天消息处理器（由 server.js 启动时注入，避免循环 import）
  setMessageHandler(fn) {
    this.messageHandler = fn;
  }

  handleClientMessage(userId, message) {
    switch (message.type) {
      case 'ping':
        this.sendToUser(userId, { type: 'pong' });
        break;

      case 'message': {
        // 客户端通过 WS 直接发送 JSON 聊天消息：{ type: 'message', content: '...' }
        const content = (message.content || '').trim();
        if (!content) {
          this.sendError(userId, '消息内容不能为空', 'EMPTY_MESSAGE');
          break;
        }
        if (!this.messageHandler) {
          this.sendError(userId, '服务尚未就绪，请稍后重试', 'NOT_READY');
          break;
        }
        const user = this.userInfo.get(userId);
        if (!user) {
          this.sendError(userId, '用户信息丢失，请重新连接', 'USER_NOT_FOUND');
          break;
        }
        this.sendTypingStatus(userId, true);
        this.sendToUser(userId, { type: 'message_ack', status: 'processing', timestamp: new Date().toISOString() });
        this.messageHandler(user, content).catch(err => {
          console.error('[WebSocket] 消息处理失败:', err);
          this.sendError(userId, '处理消息时出错', 'PROCESSING_ERROR');
        });
        break;
      }

      default:
        console.log(`[WebSocket] 收到未知消息类型: ${message.type}`);
    }
  }

  // 发送消息给指定用户
  sendToUser(userId, data) {
    const ws = this.clients.get(userId);
    if (ws && ws.readyState === 1) { // 1 = OPEN
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        console.error(`[WebSocket] 发送消息失败 (用户 ${userId}):`, error);
        return false;
      }
    }
    return false;
  }

  // 发送消息确认
  sendMessageAck(userId, messageId) {
    return this.sendToUser(userId, {
      type: 'message_ack',
      messageId,
      timestamp: new Date().toISOString()
    });
  }

  // 发送 AI 响应
  sendAIResponse(userId, content, emotion) {
    return this.sendToUser(userId, {
      type: 'ai_response',
      content,
      emotion,
      timestamp: new Date().toISOString()
    });
  }

  // 发送语音就绪通知
  sendVoiceReady(userId, audioUrl) {
    return this.sendToUser(userId, {
      type: 'voice_ready',
      audioUrl,
      timestamp: new Date().toISOString()
    });
  }

  // 发送亲密度更新
  sendIntimacyUpdate(userId, intimacyChange, newIntimacy) {
    return this.sendToUser(userId, {
      type: 'intimacy_update',
      intimacyChange,
      newIntimacy,
      timestamp: new Date().toISOString()
    });
  }

  // 发送正在输入状态
  sendTypingStatus(userId, isTyping) {
    return this.sendToUser(userId, {
      type: 'typing',
      isTyping,
      timestamp: new Date().toISOString()
    });
  }

  // 发送情绪更新
  sendMoodUpdate(userId, mood, reason = '') {
    return this.sendToUser(userId, {
      type: 'mood_update',
      mood,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  // 发送主动消息（Elio 主动发起对话）
  sendProactiveMessage(userId, content, audioUrl = null) {
    return this.sendToUser(userId, {
      type: 'proactive_message',
      content,
      audioUrl,
      trigger: 'server_initiated',
      timestamp: new Date().toISOString()
    });
  }

  // 发送错误消息
  sendError(userId, error, code) {
    return this.sendToUser(userId, {
      type: 'error',
      error,
      code,
      timestamp: new Date().toISOString()
    });
  }

  // 检查用户是否在线
  isUserOnline(userId) {
    const ws = this.clients.get(userId);
    return ws && ws.readyState === 1;
  }

  // 获取在线用户数
  getOnlineCount() {
    return this.clients.size;
  }

  // 关闭服务器
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

// 创建单例
const wsManager = new WebSocketManager();

export default wsManager;
