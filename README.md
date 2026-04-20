# 伴侣 AI 官网 (banlv-ai.com)

这是从 `ai-boyfriend-unified` 项目中提取出来的独立官网项目。

## 📁 项目结构

```
banlv-ai-website/
├── public/                    # 前端静态文件
│   ├── index.html            # 首页
│   ├── login.html            # 登录页
│   ├── register.html         # 注册页
│   ├── css/                  # 样式文件
│   ├── js/                   # JavaScript 文件
│   ├── images/               # 图片资源
│   └── audio/                # 音频资源
├── src/
│   ├── server.js             # 主服务器入口（已移除 Discord 机器人）
│   ├── web/                  # Web 应用代码
│   │   ├── routes/           # API 路由
│   │   ├── controllers/      # 控制器
│   │   └── middleware/       # 中间件
│   ├── services/             # 共享服务
│   │   ├── supabase.js       # 数据库服务
│   │   ├── ai.js             # AI 服务
│   │   ├── emotion.js        # 情感分析
│   │   ├── personality.js    # 性格系统
│   │   ├── soul.js           # 灵魂记忆
│   │   ├── payment.js        # 支付服务
│   │   ├── websocket.js      # WebSocket 管理
│   │   └── voice.js          # 语音服务
│   └── config/               # 配置文件
│       └── secrets.js        # 环境变量管理
├── database/                 # 数据库架构
│   └── unified-schema.sql    # 数据库 Schema
├── package.json              # 项目依赖配置
├── .env.example              # 环境变量示例
└── README.md                 # 本文件
```

## 🚀 快速开始

### 1. 环境要求
- Node.js 18+
- npm 或 yarn
- Supabase 账号
- OpenRouter API Key（用于 AI 服务）
- 豆包 AI API Key（可选）

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

关键配置项：
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_KEY` - Supabase 匿名密钥
- `SUPABASE_SERVICE_KEY` - Supabase 服务角色密钥
- `ARK_API_KEY` - 豆包 AI API 密钥
- `ENDPOINT_ID` - 豆包 AI 端点 ID
- `JWT_SECRET` - JWT 签名密钥（至少 32 字节）
- `SESSION_SECRET` - 会话签名密钥（至少 32 字节）
- `PORT` - 服务器端口（默认 8044）

### 4. 初始化数据库
在 Supabase 控制台执行 `database/unified-schema.sql` 中的 SQL 语句。

### 5. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

服务器将在 `http://localhost:8044` 启动。

## 📱 功能特性

- 🤖 **智能对话** - 基于 AI 的自然对话
- 💝 **情感分析** - 识别和响应用户情绪
- 🎭 **性格系统** - 动态性格调整
- 🧠 **灵魂记忆** - 长期记忆和上下文理解
- 💰 **支付系统** - DOL 虚拟货币和充值
- 📊 **关系管理** - 亲密度和关系阶段
- 🗣️ **语音功能** - 文字转语音
- 🔌 **WebSocket** - 实时双向通信

## 🔌 API 文档

### 认证相关
```
POST /api/auth/register - 注册
POST /api/auth/login - 登录
POST /api/auth/logout - 登出
GET /api/auth/me - 获取用户信息
```

### 聊天相关
```
POST /api/chat/send - 发送消息
GET /api/chat/history - 获取历史记录
```

### 用户相关
```
GET /api/user/stats - 获取统计信息
GET /api/user/bind-code - 生成绑定码
POST /api/user/recharge - 充值 DOL
```

## 🔒 安全性

- JWT Token 认证
- SQL 注入防护
- XSS 防护
- CSRF 防护
- 环境变量保护敏感信息

## 📊 数据库

核心表：
- `users` - 用户表
- `chat_messages` - 聊天记录
- `relationships` - 关系状态
- `soul_memories` - 灵魂记忆
- `payments` - 支付记录

详见 `database/unified-schema.sql`

## 🚀 部署

### 本地部署
```bash
npm install
npm start
```

### Docker 部署
```bash
docker build -t banlv-ai-website .
docker run -p 8044:8044 --env-file .env banlv-ai-website
```

### 云服务部署
支持部署到 Railway、Vercel、Heroku 等平台。

## 📝 注意事项

1. 这是从 `ai-boyfriend-unified` 项目中提取的官网部分
2. Discord 机器人相关代码已移除
3. 确保所有环境变量都正确配置
4. 生产环境建议使用 HTTPS
5. 定期备份数据库

## 🤝 相关项目

- `ai-boyfriend-unified` - 完整的多平台项目（包含 Discord 机器人）

## 📞 支持

如有问题，请参考原项目文档或联系技术支持。

---

**版本**: 1.0.0  
**最后更新**: 2026-04-20
