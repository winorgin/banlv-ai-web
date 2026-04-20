// 全局变量
let currentUser = null;
const API_BASE = '/api';

// ── 设备用户模式（免登录自动注册） ──────────────────────────────
let isGuestMode = false;  // true = 设备用户（已入库，无需本地存储）
const DEVICE_ID_KEY = 'device_id';

function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

function getActiveToken() {
    return localStorage.getItem('token');
}

function injectGuestBanner() {
    if (document.getElementById('guestBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'guestBanner';
    banner.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
        'background:#f59e0b', 'color:#1c1917', 'text-align:center',
        'padding:8px 16px', 'font-size:13px', 'display:flex',
        'align-items:center', 'justify-content:center', 'gap:12px',
    ].join(';');
    banner.innerHTML = `
        <span>👤 设备用户 · 聊天记录已自动保存，注册后解锁更多功能</span>
        <a href="/login" style="color:#1c1917;font-weight:700;text-decoration:underline">登录</a>
        <a href="/register" style="color:#1c1917;font-weight:700;text-decoration:underline">注册</a>
    `;
    document.body.prepend(banner);
    document.body.style.paddingTop = (document.body.style.paddingTop
        ? parseInt(document.body.style.paddingTop) + 40
        : 40) + 'px';
}

async function initGuestMode() {
    isGuestMode = true;
    injectGuestBanner();
    // 设备用户已有token，直接用
    if (localStorage.getItem('token')) return;
    try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(`${API_BASE}/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId }),
        });
        const data = await res.json();
        if (data.success && data.data && data.data.token) {
            // 存入 localStorage，持久化，与正式用户相同的认证流程
            localStorage.setItem('token', data.data.token);
        }
    } catch (e) {
        console.warn('[Guest] 无法获取设备 token:', e);
    }
}
// ─────────────────────────────────────────────────────────

// WebSocket 相关变量
let ws = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY = 3000;

// 语音相关变量
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let synthesis = window.speechSynthesis;

// 图片相关变量
let pendingImageDataUrl = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadUserInfo();
    await loadChatHistory();
    setupVoiceButton();
    initWebSocket(); // 初始化 WebSocket
    
    // 加载语音列表
    if (synthesis) {
        synthesis.onvoiceschanged = () => {
            const voices = synthesis.getVoices();
            console.log('可用语音:', voices.filter(v => v.lang.includes('zh')));
        };
    }
});

// 检查认证状态
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        await initGuestMode();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            localStorage.removeItem('token');
            await initGuestMode();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        await initGuestMode();
    }
}

// 加载用户信息
async function loadUserInfo() {
    try {
        const response = await fetch(`${API_BASE}/user/stats`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        if (data.success) {
            const stats = data.data;
            const el = id => document.getElementById(id);
            if (el('username')) el('username').textContent = stats.username || '用户';
            if (el('level'))    el('level').textContent    = stats.level ?? '-';
            if (el('intimacy')) el('intimacy').textContent = stats.intimacy ?? '-';
            if (el('dol'))      el('dol').textContent      = stats.dolBalance ?? '-';
            const stageNames = {
                close_friend: '密友',
                lover: '恋人',
                soulmate: '灵魂伴侣',
                密友: '密友',
                恋人: '恋人',
                灵魂伴侣: '灵魂伴侣',
            };
            if (el('relationship')) el('relationship').textContent = stageNames[stats.relationshipStage] || '密友';
        }
    } catch (error) {
        console.error('Load user info failed:', error);
    }
}

// 加载聊天历史
async function loadChatHistory() {
    try {
        const response = await fetch(`${API_BASE}/chat/history?limit=50`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        const messages = data.data?.messages || [];
        if (data.success && messages.length > 0) {
            const messagesDiv = document.getElementById('messages');
            messagesDiv.innerHTML = '';
            
            messages.forEach(msg => {
                addMessageToUI(msg.role, msg.content, false);
            });
            
            scrollToBottom();
        }
    } catch (error) {
        console.error('Load history failed:', error);
    }
}

// ========== WebSocket 功能 ==========

// 初始化 WebSocket 连接
function initWebSocket() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('[WebSocket] 游客模式，跳过 WebSocket 连接');
        return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('[WebSocket] 连接已建立');
            wsReconnectAttempts = 0;
            showNotification('🔌 实时连接已建立');
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('[WebSocket] 消息解析失败:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('[WebSocket] 连接错误:', error);
        };
        
        ws.onclose = () => {
            console.log('[WebSocket] 连接已关闭');
            ws = null;
            
            // 尝试重连
            if (wsReconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS) {
                wsReconnectAttempts++;
                console.log(`[WebSocket] ${WS_RECONNECT_DELAY/1000}秒后尝试重连 (${wsReconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(initWebSocket, WS_RECONNECT_DELAY);
            } else {
                console.log('[WebSocket] 已达到最大重连次数，停止重连');
                showError('实时连接已断开，请刷新页面');
            }
        };
        
    } catch (error) {
        console.error('[WebSocket] 初始化失败:', error);
    }
}

// 处理 WebSocket 消息
function handleWebSocketMessage(data) {
    console.log('[WebSocket] 收到消息:', data.type);
    
    switch (data.type) {
        case 'connected':
            console.log('[WebSocket] 服务器确认连接');
            break;
            
        case 'typing':
            if (data.isTyping) {
                showTypingIndicator('zh');
            } else {
                hideTypingIndicator();
            }
            break;
            
        case 'ai_response':
            hideTypingIndicator();
            addMessageToUI('assistant', data.content);
            break;
            
        case 'voice_ready':
            // 为最后一条 AI 消息添加语音播放按钮
            addVoiceButtonToLastMessage(data.audioUrl);
            break;
            
        case 'intimacy_update':
            document.getElementById('intimacy').textContent = data.newIntimacy;
            showIntimacyChange(data.intimacyChange);
            loadUserInfo(); // 重新加载用户信息
            break;
            
        case 'error':
            hideTypingIndicator();
            showError(data.error);
            break;

        case 'ping':
            // 服务器心跳检测：收到 ping 必须立即回复 pong
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;
            
        case 'pong':
            // 服务器响应客户端主动发出的 ping（连接健康确认）
            break;

        case 'mood_update':
            // Elio 情绪变化
            console.log('[WebSocket] Elio 情绪更新:', data.mood);
            break;

        case 'proactive_message':
            // Elio 主动发起的消息
            hideTypingIndicator();
            addMessageToUI('assistant', data.content);
            if (data.audioUrl) {
                addVoiceButtonToLastMessage(data.audioUrl);
            }
            break;

        case 'system':
            // 系统通知
            showNotification(`📢 ${data.message}`);
            break;

        default:
            console.log('[WebSocket] 未知消息类型:', data.type);
    }
}

// 为最后一条消息添加语音按钮
function addVoiceButtonToLastMessage(audioUrl) {
    const messages = document.querySelectorAll('.message.assistant');
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    
    // 检查是否已经有语音按钮
    if (lastMessage.querySelector('.voice-play-btn')) return;
    
    // 添加语音消息样式
    lastMessage.classList.add('voice-message');
    
    // 创建消息头部（如果不存在）
    let headerEl = lastMessage.querySelector('.message-header');
    if (!headerEl) {
        headerEl = document.createElement('div');
        headerEl.className = 'message-header';
        
        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-avatar';
        const img = document.createElement('img');
        img.src = '/images/Elio.avif';
        img.alt = 'Elio';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        avatarEl.appendChild(img);
        
        const senderEl = document.createElement('span');
        senderEl.className = 'message-sender';
        senderEl.textContent = 'Elio';
        
        headerEl.appendChild(avatarEl);
        headerEl.appendChild(senderEl);
        
        lastMessage.insertBefore(headerEl, lastMessage.firstChild);
    }
    
    // 添加播放按钮
    const playBtn = document.createElement('button');
    playBtn.className = 'voice-play-btn';
    playBtn.innerHTML = '🔊';
    playBtn.onclick = () => playVoiceMessage(audioUrl, playBtn);
    headerEl.appendChild(playBtn);
    
    console.log('[WebSocket] 语音按钮已添加到最后一条消息');
}

// 检测消息语言
function detectLanguage(text) {
    const chineseRegex = /[\u4e00-\u9fa5]/;
    return chineseRegex.test(text) ? 'zh' : 'en';
}

// 显示"正在输入"提示
function showTypingIndicator(language) {
    const indicator = document.getElementById('typingIndicator');
    const text = document.getElementById('typingText');
    text.textContent = language === 'zh' ? '对方正在输入中...' : 'Typing...';
    indicator.style.display = 'block';
}

// 隐藏"正在输入"提示
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.style.display = 'none';
}

// 处理图片选择
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        pendingImageDataUrl = e.target.result;
        // 显示预览
        const btn = document.getElementById('imageBtn');
        if (btn) btn.title = `已选: ${file.name}`;
        showNotification(`📷 图片已选择: ${file.name}`);
    };
    reader.readAsDataURL(file);
    // 清空 input 以允许重复选同一文件
    event.target.value = '';
}

// 发送消息
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    const imageDataUrl = pendingImageDataUrl;
    
    if (!message && !imageDataUrl) return;
    
    // 清除图片预览状态
    pendingImageDataUrl = null;
    const imgBtn = document.getElementById('imageBtn');
    if (imgBtn) imgBtn.title = '发送图片';
    
    // 检测语言
    const language = detectLanguage(message || '');
    
    // 添加用户消息到UI（带图片预览）
    if (imageDataUrl) {
        addImageMessageToUI('user', message, imageDataUrl);
    } else {
        addMessageToUI('user', message);
    }
    input.value = '';
    
    // 显示"正在输入"提示
    showTypingIndicator(language);
    
    try {
        const body = { message: message || '' };
        if (imageDataUrl) body.image = imageDataUrl;
        const response = await fetch(`${API_BASE}/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getActiveToken()}`
            },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.data?.mode === 'websocket') {
                // WebSocket 模式：消息已通过 WebSocket 推送，无需额外处理
                console.log('[WebSocket] 使用实时推送模式');
                // 保持"正在输入"提示，等待 WebSocket 推送
            } else {
                // 传统模式：直接处理响应
                console.log('[传统模式] 使用同步响应模式');
                hideTypingIndicator();
                
                const resData = data.data || {};
                const reply = resData.reply || resData.response;
                if (resData.audioUrl) {
                    addMessageWithAudioToUI('assistant', reply, resData.audioUrl);
                } else if (reply) {
                    addMessageToUI('assistant', reply);
                }

                if (resData.intimacyChange) {
                    document.getElementById('intimacy').textContent = resData.newIntimacy;
                    showIntimacyChange(resData.intimacyChange);
                }
                
                await loadUserInfo();
            }
        } else {
            hideTypingIndicator();
            showError(data.message || '发送失败');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('Send message failed:', error);
        showError('网络错误，请重试');
    }
}

// 添加消息到UI
function addMessageToUI(role, content, scroll = true) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;
    
    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);
    
    if (scroll) {
        scrollToBottom();
    }
}

// 添加带图片的用户消息到UI
function addImageMessageToUI(role, text, imageDataUrl, scroll = true) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.style.cssText = 'max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:4px';
    contentEl.appendChild(img);

    if (text) {
        const textNode = document.createTextNode(text);
        contentEl.appendChild(textNode);
    }

    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);

    if (scroll) scrollToBottom();
}

// 添加带语音的消息到UI
function addMessageWithAudioToUI(role, content, audioUrl, scroll = true) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role} voice-message`;
    
    // 创建消息头部（头像 + 名字 + 播放按钮）
    const headerEl = document.createElement('div');
    headerEl.className = 'message-header';
    
    const avatarEl = document.createElement('div');
    avatarEl.className = 'message-avatar';
    
    if (role === 'user') {
        avatarEl.textContent = '👤';
    } else {
        const img = document.createElement('img');
        img.src = '/images/Elio.avif';
        img.alt = 'Elio';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        avatarEl.appendChild(img);
    }
    
    const senderEl = document.createElement('span');
    senderEl.className = 'message-sender';
    senderEl.textContent = role === 'user' ? '我' : 'Elio';
    
    const playBtn = document.createElement('button');
    playBtn.className = 'voice-play-btn';
    playBtn.innerHTML = '🔊';
    playBtn.onclick = () => playVoiceMessage(audioUrl, playBtn);
    
    headerEl.appendChild(avatarEl);
    headerEl.appendChild(senderEl);
    headerEl.appendChild(playBtn);
    
    // 创建消息内容
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;
    
    messageEl.appendChild(headerEl);
    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);
    
    if (scroll) {
        scrollToBottom();
    }
}

// 播放音频消息
function playAudioMessage(audioUrl) {
    try {
        const audio = new Audio(audioUrl);
        audio.play().catch(error => {
            console.error('播放语音失败:', error);
        });
    } catch (error) {
        console.error('创建音频失败:', error);
    }
}

// 滚动到底部
function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 处理键盘事件
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// 显示统计信息
async function showStats() {
    try {
        const response = await fetch(`${API_BASE}/user/stats`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        if (data.success) {
            const stats = data.stats;
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <h2>📊 统计信息</h2>
                <div class="stats-detail">
                    <p><strong>用户名:</strong> ${stats.username}</p>
                    <p><strong>等级:</strong> Lv.${stats.level}</p>
                    <p><strong>亲密度:</strong> ${stats.intimacy}/${stats.nextLevelIntimacy} (${stats.progress}%)</p>
                    <p><strong>DOL 余额:</strong> ${stats.dolBalance}</p>
                    <p><strong>关系阶段:</strong> ${stats.relationshipStage}</p>
                    <p><strong>总消息数:</strong> ${stats.totalMessages}</p>
                    <p><strong>当前心情:</strong> ${stats.currentMood}</p>
                </div>
            `;
            openModal();
        }
    } catch (error) {
        showError('获取统计信息失败');
    }
}

// 显示绑定码
async function showBindCode() {
    try {
        const response = await fetch(`${API_BASE}/user/bind-code`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        if (data.success) {
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <h2>🔗 账号绑定</h2>
                <p>在 Discord 中使用 /bind 命令，输入以下绑定码：</p>
                <div class="bind-code">${data.code}</div>
                <p class="hint">绑定码有效期：5分钟</p>
            `;
            openModal();
        }
    } catch (error) {
        showError('生成绑定码失败');
    }
}

// 显示充值
function showRecharge() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>💰 充值 DOL</h2>
        <div class="recharge-options">
            <button onclick="recharge(10)" class="recharge-btn">¥10 = 100 DOL</button>
            <button onclick="recharge(30)" class="recharge-btn">¥30 = 300 DOL</button>
            <button onclick="recharge(50)" class="recharge-btn">¥50 = 500 DOL</button>
            <button onclick="recharge(100)" class="recharge-btn">¥100 = 1000 DOL</button>
        </div>
    `;
    openModal();
}

// 充值
async function recharge(amount) {
    try {
        const response = await fetch(`${API_BASE}/user/recharge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ amount })
        });
        
        const data = await response.json();
        if (data.success) {
            alert(`充值订单已创建！订单号：${data.payment.id}`);
            closeModal();
        } else {
            showError(data.error || '创建订单失败');
        }
    } catch (error) {
        showError('网络错误');
    }
}

// 登出
function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
}

// 模态框操作
function openModal() {
    document.getElementById('modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

// 显示亲密度变化
function showIntimacyChange(change) {
    const emoji = change > 0 ? '💕' : '💔';
    const sign = change > 0 ? '+' : '';
    showNotification(`${emoji} 亲密度 ${sign}${change}`);
}

// 显示通知
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 显示错误
function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('modal');
    if (event.target === modal) {
        closeModal();
    }
}

// ========== 移动端侧边栏切换功能 ==========

// 切换侧边栏显示/隐藏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    
    // 防止背景滚动
    if (sidebar.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

// 点击菜单项后自动关闭侧边栏（移动端）
function autoCloseSidebar() {
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// 重写菜单按钮点击事件，添加自动关闭功能
const originalShowStats = showStats;
const originalShowBindCode = showBindCode;
const originalShowRecharge = showRecharge;
const originalLogout = logout;

showStats = async function() {
    await originalShowStats();
    autoCloseSidebar();
};

showBindCode = async function() {
    await originalShowBindCode();
    autoCloseSidebar();
};

showRecharge = function() {
    originalShowRecharge();
    autoCloseSidebar();
};

logout = function() {
    autoCloseSidebar();
    originalLogout();
};


// ========== 语音消息功能 ==========

// 开始录音（按下按钮）
async function startRecording() {
    if (isRecording) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await processVoiceMessage(audioBlob);
            
            // 停止所有音轨
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        const voiceBtn = document.getElementById('voiceBtn');
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '🔴';
        
        showNotification('🎤 正在录音...');
    } catch (error) {
        console.error('录音失败:', error);
        showError('无法访问麦克风，请检查权限设置');
    }
}

// 停止录音（松开按钮）
function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    mediaRecorder.stop();
    isRecording = false;
    
    const voiceBtn = document.getElementById('voiceBtn');
    voiceBtn.classList.remove('recording');
    voiceBtn.textContent = '🎤';
}

// 处理语音消息
async function processVoiceMessage(audioBlob) {
    // 使用Web Speech API识别语音
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    // 创建音频URL用于播放
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // 先显示用户的语音消息（带播放按钮）
    addVoiceMessageToUI('user', audioUrl, '正在识别...');
    
    // 播放音频并同时进行语音识别
    const audio = new Audio(audioUrl);
    audio.play();
    
    // 使用Web Speech API识别
    try {
        const text = await recognizeSpeech(audioBlob);
        
        if (text) {
            // 更新消息显示识别的文字
            updateLastVoiceMessage(text);
            
            // 发送到AI
            await sendTextToAI(text);
        } else {
            updateLastVoiceMessage('[无法识别]');
            showError('无法识别语音内容');
        }
    } catch (error) {
        console.error('语音识别失败:', error);
        updateLastVoiceMessage('[识别失败]');
        showError('语音识别失败');
    }
}

// 语音识别
function recognizeSpeech(audioBlob) {
    return new Promise((resolve, reject) => {
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            resolve(transcript);
        };
        
        recognition.onerror = (event) => {
            reject(event.error);
        };
        
        recognition.onnomatch = () => {
            resolve('');
        };
        
        // 播放音频触发识别
        const audio = new Audio(URL.createObjectURL(audioBlob));
        audio.onplay = () => {
            recognition.start();
        };
        audio.play();
    });
}

// 添加语音消息到UI
function addVoiceMessageToUI(role, audioUrl, text) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role} voice-message`;
    messageEl.dataset.lastMessage = 'true';
    
    // 创建消息头部（头像 + 名字 + 播放按钮）
    const headerEl = document.createElement('div');
    headerEl.className = 'message-header';
    
    const avatarEl = document.createElement('div');
    avatarEl.className = 'message-avatar';
    
    if (role === 'user') {
        avatarEl.textContent = '👤';
    } else {
        const img = document.createElement('img');
        img.src = '/images/Elio.avif';
        img.alt = 'Elio';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        avatarEl.appendChild(img);
    }
    
    const senderEl = document.createElement('span');
    senderEl.className = 'message-sender';
    senderEl.textContent = role === 'user' ? '我' : 'Elio';
    
    const playBtn = document.createElement('button');
    playBtn.className = 'voice-play-btn';
    playBtn.innerHTML = '🔊';
    playBtn.onclick = () => playVoiceMessage(audioUrl, playBtn);
    
    headerEl.appendChild(avatarEl);
    headerEl.appendChild(senderEl);
    headerEl.appendChild(playBtn);
    
    // 创建消息内容
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = text;
    
    messageEl.appendChild(headerEl);
    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);
    
    scrollToBottom();
}

// 更新最后一条语音消息的文字
function updateLastVoiceMessage(text) {
    const lastMessage = document.querySelector('[data-last-message="true"]');
    if (lastMessage) {
        const textEl = lastMessage.querySelector('.voice-text');
        if (textEl) {
            textEl.textContent = text;
        }
        lastMessage.removeAttribute('data-last-message');
    }
}

// 播放语音消息
function playVoiceMessage(audioUrl, button) {
    // 如果按钮已经有关联的音频对象，说明正在播放
    if (button.audioElement) {
        // 暂停播放
        button.audioElement.pause();
        button.innerHTML = '▶️';
        button.audioElement = null;
        return;
    }
    
    // 创建新的音频对象
    const audio = new Audio(audioUrl);
    button.audioElement = audio;
    button.innerHTML = '⏸️';
    
    audio.onended = () => {
        button.innerHTML = '▶️';
        button.audioElement = null;
    };
    
    audio.onerror = () => {
        button.innerHTML = '▶️';
        button.audioElement = null;
        showError('播放语音失败');
    };
    
    audio.play().catch(error => {
        console.error('播放失败:', error);
        button.innerHTML = '▶️';
        button.audioElement = null;
        showError('播放语音失败');
    });
}

// 发送文字到AI并获取语音回复
async function sendTextToAI(text) {
    try {
        const response = await fetch(`${API_BASE}/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const resData = data.data || {};
            // 生成AI回复的语音
            const aiAudioUrl = await textToSpeech(resData.reply);
            
            // 添加AI的语音消息（带播放按鈕，不自动播放）
            addVoiceMessageToUI('assistant', aiAudioUrl, resData.reply);
            
            // 更新亲密度
            if (resData.intimacyChange) {
                document.getElementById('intimacy').textContent = resData.newIntimacy;
                showIntimacyChange(resData.intimacyChange);
            }
            
            await loadUserInfo();
        } else {
            showError(data.error || data.message || '发送失败');
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        showError('网络错误，请重试');
    }
}

// 文字转语音
function textToSpeech(text) {
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        // 选择中文语音
        const voices = synthesis.getVoices();
        const chineseVoice = voices.find(voice => 
            voice.lang.includes('zh') || voice.lang.includes('CN')
        );
        if (chineseVoice) {
            utterance.voice = chineseVoice;
        }
        
        // 创建音频上下文来录制TTS输出
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const destination = audioContext.createMediaStreamDestination();
        const mediaRecorder = new MediaRecorder(destination.stream);
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            resolve(url);
        };
        
        // 开始录制并播放
        mediaRecorder.start();
        synthesis.speak(utterance);
        
        utterance.onend = () => {
            setTimeout(() => mediaRecorder.stop(), 100);
        };
    });
}

// 按钮事件监听
function setupVoiceButton() {
    const voiceBtn = document.getElementById('voiceBtn');
    
    // 鼠标事件
    voiceBtn.addEventListener('mousedown', startRecording);
    voiceBtn.addEventListener('mouseup', stopRecording);
    voiceBtn.addEventListener('mouseleave', () => {
        if (isRecording) stopRecording();
    });
    
    // 触摸事件（移动端）
    voiceBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });
    voiceBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
    });
}
