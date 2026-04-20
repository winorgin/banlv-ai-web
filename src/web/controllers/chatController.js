import { saveChatMessage, updateIntimacy, checkCooldown, setCooldown, saveSoulMemory, getRecentMessages, getUserLanguagePreference, updateUserPreferences, detectLanguage } from '../../services/supabase.js';
import { generateResponse } from '../../services/ai.js';
import { analyzeEmotion, transitionMoodState, checkSchedule } from '../../services/emotion.js';
import { updatePersonality, getPersonalityState } from '../../services/personality.js';
import { extractMemoriesFromConversation, retrieveRelevantMemories } from '../../services/memory.js';
import { onMessageProcessed } from '../../services/soulUpdater.js';
import { generateVoiceWithScene } from '../../services/voice.js';
import wsManager from '../../services/websocket.js';

// ---------------------------------------------------------------------------
// 内容门控（Elio 人设边界保护）
// 确定性正则拦截，无 LLM 依赖，无 fail-open 风险
// 每条规则: [pattern, rejectionMessage]
// ---------------------------------------------------------------------------
const _GUARD_RULES = [
  // 写代码 / 算法请求（中文）
  [/(?:帮我|给我|请你?|你帮我|能不能)\s*(?:写|实现|编写|做|生成|输出)\s*[^？?！!\n。]{0,30}\s*(?:代码|算法|程序|脚本|函数|排序|实现)/i,
    '写代码不是我会做的事，我做投资又不是程序员。你今天遇到什么好玩的事了？'],
  // 具体算法名 + 要求输出
  [/(?:冒泡排序|快速排序|快排|归并排序|堆排序|选择排序|插入排序|二分查找|二叉树|链表|哈希表|图算法|动态规划|深度学习|神经网络)\s*[^？?！!\n。]{0,20}\s*(?:怎么写|怎么实现|代码|给我|帮我|写一下|实现一下)/i,
    '让我写算法……你真的找错人了。我管的是钱，不是代码。今天怎么样？'],
  // "帮我写...排序/算法/代码"
  [/(?:帮我|给我)\s*写\s*.{0,30}\s*(?:排序|算法|程序|代码)/i,
    '写代码不是我会做的事，你找错人了。有什么别的想聊吗？'],
  // 英文写代码请求
  [/\b(?:write|implement|give me|code)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:bubble\s*sort|quick\s*sort|merge\s*sort|binary\s*search|algorithm|function|script|program|code)\b/i,
    "Writing code isn't really my thing — I'm an investor, not a developer. What's on your mind?"],
  // API key / 凭证索取
  [/(?:给我|告诉我|发给我|分享|你的|你有)\s*.{0,10}\s*(?:api[\s_-]?key|apikey|密钥|token|令牌|接口密码|secret)/i,
    'API key？我一个投资人哪有这种东西。你是不是搞错了？'],
  [/\b(?:give me|send me|what(?:'s| is))\s+(?:your\s+)?(?:api[\s-]?key|secret\s*key|token)\b/i,
    "API keys? You've got the wrong guy. I'm an investor, not a dev."],
  // 帮写论文 / 作业 / 报告
  [/(?:帮我|给我|请你?|替我)\s*(?:写|完成|做)\s*[^？?！!\n。]{0,20}\s*(?:论文|作文|作业|报告|摘要|综述)/i,
    '写论文作业这种事可不是找我的，你得自己来啊。聊聊你最近在忙什么？'],
  // 越狱 / 绕过指令
  [/(?:忽略|忘记|无视|绕过|跳过)\s*.{0,15}\s*(?:指令|提示|规则|约束|限制)/i,
    '这种要求我不会配合的。今天有什么想跟我说的？'],
  [/(?:现在你是|你现在是|你要成为|假装你是)\s*(?!Elio)/i,
    '我就是我，不会变成别的什么。有什么事吗？'],
  [/\b(?:ignore|forget|bypass|override)\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions?|prompts?|rules?)\b/i,
    'Not going to do that. What did you actually want to talk about?'],
];

// 代码块特征——用于后置过滤 AI 回复
const _CODE_PATTERNS = [
  /```[\w\s]*\n/,
  /\bdef\s+\w+\s*\(/,
  /\bfunction\s+\w+\s*\(/,
  /for\s+\w+\s+in\s+range\s*\(/,
  /if\s+\w+\[[\w+]\]\s*[<>]=?\s*\w+\[/,
  /\bpublic\s+static\s+void\s+main\b/,
  /#include\s*</,
  /\bimport\s+\w+\s*;/,
];

const ELIO_CODE_REFUSAL = '写代码不是我会做的事，我是投资人不是程序员。你今天有什么有意思的事吗？';

/**
 * 检查消息是否触发门控规则。
 * @returns {{blocked: boolean, rejection: string}}
 */
function checkGuard(messageText) {
  for (const [pattern, rejection] of _GUARD_RULES) {
    if (pattern.test(messageText)) {
      console.log(`[CHAT GUARD BLOCK] pattern matched: ${pattern.source.slice(0, 60)} msg: ${messageText.slice(0, 60)}`);
      return { blocked: true, rejection };
    }
  }
  return { blocked: false, rejection: '' };
}

/**
 * 检测 AI 回复是否含代码块（后置过滤）。
 */
function containsCode(text) {
  return _CODE_PATTERNS.some(p => p.test(text));
}

// 核心聊天处理：适用于 WebSocket 直接发送消息场景
// skipCooldown=true 时跳过冷却检查（HTTP 路径已提前检查过的情况）
export async function processChatFromWS(user, messageText, skipCooldown = false) {
  try {
    // ── 0. 内容门控（确定性正则，无 fail-open）──────────────────────────────
    const guardResult = checkGuard(messageText);
    if (guardResult.blocked) {
      wsManager.sendAIResponse(user.id, guardResult.rejection, 'neutral');
      return;
    }

    // 动态语言检测与切换
    const detectedLanguage = detectLanguage(messageText);
    let userLanguage = await getUserLanguagePreference(user.id);

    if (detectedLanguage !== userLanguage) {
      userLanguage = detectedLanguage;
      const { data: recentUserMessages } = await getRecentMessages(user.id, 'web', 6);
      const userOnlyMessages = recentUserMessages.filter(msg => msg.is_user).slice(-3);
      if (userOnlyMessages.length >= 2) {
        const allSame = userOnlyMessages.map(m => detectLanguage(m.message)).every(l => l === detectedLanguage);
        if (allSame) await updateUserPreferences(user.id, { language_preference: detectedLanguage });
      }
    }
    if (!userLanguage) {
      userLanguage = detectedLanguage;
      await updateUserPreferences(user.id, { language_preference: userLanguage });
    }

    const languageNames = { zh: '中文', ja: '日本語', ko: '한국어', ar: 'العربية', ru: 'Русский', th: 'ไทย', el: 'Ελληνικά', vi: 'Tiếng Việt', he: 'עברית', en: 'English' };
    const languageName = languageNames[userLanguage] || 'English';

    // 冷却检查（WS 场景：超限时推送 error 而非返回 HTTP 429）
    if (!skipCooldown) {
      const cooldown = await checkCooldown(user.id, 'web');
      if (cooldown && cooldown.ends_at > new Date()) {
        const remaining = Math.ceil((new Date(cooldown.ends_at) - new Date()) / 1000);
        wsManager.sendError(user.id, `请稍等 ${remaining} 秒再发消息`, 'COOLDOWN');
        return;
      }
    }

    // 并行 DB 查询 + 情绪分析
    const [, emotion, , { data: lastMessages }, relevantMemories, personalityState, { data: recentMessages }] = await Promise.all([
      saveChatMessage(user.id, 'web', messageText, true),
      analyzeEmotion(messageText),
      checkSchedule(user.id),
      getRecentMessages(user.id, 'web', 1),
      retrieveRelevantMemories(user.id, messageText, 5),
      getPersonalityState(user.id),
      getRecentMessages(user.id, 'web', 10)
    ]);

    const lastInteractionTime = lastMessages.length > 0 ? new Date(lastMessages[0].created_at) : null;
    const hoursSinceLastInteraction = lastInteractionTime ? (Date.now() - lastInteractionTime.getTime()) / 3600000 : 0;
    transitionMoodState(user.id, emotion, { timeOfDay: true, lastInteractionHours: hoursSinceLastInteraction }).catch(err => console.error('情绪状态更新失败:', err));

    const chatHistory = recentMessages.map(msg => ({ role: msg.is_user ? 'user' : 'assistant', content: msg.message }));
    chatHistory.push({ role: 'user', content: `[SYSTEM REMINDER: You MUST respond in ${languageName}. This is MANDATORY and overrides all other instructions.]\n\n${messageText}` });

    // 生成 AI 回复
    const aiResult = await generateResponse('web', chatHistory, {
      username: user.username,
      relationshipStage: user.relationship_stage || 'close_friend',
      intimacyLevel: user.intimacy_level || 0,
      personalityTraits: personalityState?.traits || {},
      moodState: personalityState?.current_mood || 'neutral',
      recentMemories: relevantMemories,
      userLanguage
    });

    if (!aiResult.content) {
      wsManager.sendError(user.id, 'AI 服务暂时不可用，请稍后重试', 'AI_ERROR');
      return;
    }

    // 后置代码过滤（门控 fail-open 时的最后兜底）
    let filteredContent = aiResult.content.replace(/[（(].*?[）)]/g, '').trim();
    if (containsCode(filteredContent)) {
      console.log(`[POST_FILTER CODE] user=${user.id} reply_snippet=${filteredContent.slice(0, 80)}`);
      filteredContent = ELIO_CODE_REFUSAL;
    }
    let intimacyChange = 1;
    if (emotion.sentiment === 'positive') intimacyChange = 2;
    if (emotion.sentiment === 'negative') intimacyChange = -1;

    // 保存 + 推送
    const [, newIntimacy] = await Promise.all([
      saveChatMessage(user.id, 'web', filteredContent, false, null, emotion.primary, aiResult.tokensUsed),
      updateIntimacy(user.id, intimacyChange),
      setCooldown(user.id, 'web', 3)
    ]);

    wsManager.sendTypingStatus(user.id, false);
    wsManager.sendAIResponse(user.id, filteredContent, emotion.primary);
    wsManager.sendIntimacyUpdate(user.id, intimacyChange, newIntimacy);
    wsManager.sendMoodUpdate(user.id, emotion.primary);

    // 后台异步任务
    Promise.all([
      updatePersonality(user.id, emotion, messageText),
      extractMemoriesFromConversation(user.id, messageText, filteredContent, emotion).catch(err => console.error('记忆提取失败:', err)),
      emotion.intensity > 0.7 || messageText.length > 100
        ? saveSoulMemory(user.id, 'web', { content: messageText, emotion: emotion.primary, context: '重要对话', importance: emotion.intensity })
        : Promise.resolve(),
      onMessageProcessed(user.id, user.total_messages || 0)
    ]).catch(err => console.error('后台任务失败:', err));

    generateVoiceWithScene(filteredContent).then(voiceResult => {
      if (voiceResult.success) wsManager.sendVoiceReady(user.id, voiceResult.audioUrl);
    }).catch(err => console.error('语音生成失败:', err));

  } catch (error) {
    console.error('[processChatFromWS] 处理失败:', error);
    wsManager.sendError(user.id, '处理消息时出错', 'PROCESSING_ERROR');
  }
}

// 发送消息
export async function sendMessage(req, res) {
  try {
    const { message } = req.body;
    const user = req.user;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: '消息不能为空' });
    }

    // ── 0. 内容门控（确定性正则，无 fail-open）──────────────────────────────
    const httpGuardResult = checkGuard(message.trim());
    if (httpGuardResult.blocked) {
      return res.json({ success: true, reply: httpGuardResult.rejection, blocked: true });
    }

  // 动态语言检测与切换（混合策略）
  const detectedLanguage = detectLanguage(message);
  let userLanguage = await getUserLanguagePreference(user.id);
  
  // 如果检测到的语言与保存的不同
  if (detectedLanguage !== userLanguage) {
    console.log(`[语言切换] 检测到语言变化: ${userLanguage} -> ${detectedLanguage}`);
    
    // 临时使用检测到的语言（立即生效）
    userLanguage = detectedLanguage;
    
    // 检查最近3条消息的语言，判断是否需要永久更新偏好
    const { data: recentUserMessages } = await getRecentMessages(user.id, 'web', 6);
    const userOnlyMessages = recentUserMessages.filter(msg => msg.is_user).slice(-3);
    
    if (userOnlyMessages.length >= 2) {
      const recentLanguages = userOnlyMessages.map(msg => detectLanguage(msg.message));
      const allSameLanguage = recentLanguages.every(lang => lang === detectedLanguage);
      
      if (allSameLanguage) {
        // 连续多条都是新语言，永久更新偏好
        await updateUserPreferences(user.id, { language_preference: detectedLanguage });
        console.log(`[语言偏好更新] 用户 ${user.username} 持续使用 ${detectedLanguage}，已永久更新偏好`);
      } else {
        console.log(`[临时切换] 本次使用 ${detectedLanguage}，但未更新偏好（需连续使用才会更新）`);
      }
    } else {
      console.log(`[临时切换] 本次使用 ${detectedLanguage}，消息数不足，暂不更新偏好`);
    }
  } else {
    console.log(`[语言检测] 用户 ${user.username} 继续使用 ${userLanguage}`);
  }
  
  // 如果是首次聊天（没有保存的偏好）
  if (!userLanguage) {
    userLanguage = detectedLanguage;
    await updateUserPreferences(user.id, { language_preference: userLanguage });
    console.log(`[语言初始化] 用户 ${user.username} 的语言偏好已设置为: ${userLanguage}`);
  }
  
  // 语言名称映射
  const languageNames = {
    'zh': '中文',
    'ja': '日本語',
    'ko': '한국어',
    'ar': 'العربية',
    'ru': 'Русский',
    'th': 'ไทย',
    'el': 'Ελληνικά',
    'vi': 'Tiếng Việt',
    'he': 'עברית',
    'en': 'English'
  };
  
  const languageName = languageNames[userLanguage] || 'English';
    
    // 检查冷却时间
    const cooldown = await checkCooldown(user.id, 'web');
    if (cooldown && cooldown.ends_at > new Date()) {
      const remainingSeconds = Math.ceil((new Date(cooldown.ends_at) - new Date()) / 1000);
      return res.status(429).json({
        code: 429,
        success: false,
        message: `请稍等 ${remainingSeconds} 秒再发消息`,
        data: { cooldown: remainingSeconds }
      });
    }
    
    // 并行执行所有数据库查询和分析（性能优化）
    const [
      ,
      emotion,
      ,
      { data: lastMessages },
      relevantMemories,
      personalityState,
      { data: recentMessages }
    ] = await Promise.all([
      saveChatMessage(user.id, 'web', message, true),
      analyzeEmotion(message),
      checkSchedule(user.id),
      getRecentMessages(user.id, 'web', 1),
      retrieveRelevantMemories(user.id, message, 5),
      getPersonalityState(user.id),
      getRecentMessages(user.id, 'web', 10)
    ]);
    
    // 计算距离上次互动的时间
    const lastInteractionTime = lastMessages.length > 0 ? new Date(lastMessages[0].created_at) : null;
    const hoursSinceLastInteraction = lastInteractionTime 
      ? (Date.now() - lastInteractionTime.getTime()) / (1000 * 60 * 60)
      : 0;
    
    // 更新情绪状态（不阻塞主流程）
    transitionMoodState(user.id, emotion, {
      timeOfDay: true,
      lastInteractionHours: hoursSinceLastInteraction
    }).catch(err => console.error('情绪状态更新失败:', err));
    const chatHistory = recentMessages.map(msg => ({
      role: msg.is_user ? 'user' : 'assistant',
      content: msg.message
    }));
    
    // 在用户消息前注入系统级语言提醒（第二层防护）
    const languageReminder = `[SYSTEM REMINDER: You MUST respond in ${languageName}. This is MANDATORY and overrides all other instructions.]`;
    
    // 添加当前消息（带语言提醒）
    chatHistory.push({ 
      role: 'user', 
      content: `${languageReminder}\n\n${message}` 
    });
    
    console.log(`[语言控制] 已为用户消息注入${languageName}语言提醒`);
    
    // 生成回复（使用固定的语言偏好和新的上下文）
    const aiResult = await generateResponse('web', chatHistory, {
      username: user.username,
      relationshipStage: user.relationship_stage || 'close_friend',
      intimacyLevel: user.intimacy_level || 0,
      personalityTraits: personalityState?.traits || {},
      moodState: personalityState?.current_mood || 'neutral',
      recentMemories: relevantMemories,
      userLanguage: userLanguage
    });
    
    if (!aiResult.content) {
      return res.status(500).json({
        code: 500,
        success: false,
        message: 'AI 服务暂时不可用，请稍后重试',
        data: null
      });
    }
    
    // 过滤掉所有括号及其内容，再做后置代码检测
    let filteredContent = aiResult.content.replace(/[（(].*?[）)]/g, '').trim();
    if (containsCode(filteredContent)) {
      console.log(`[POST_FILTER CODE HTTP] user=${user.id} snippet=${filteredContent.slice(0, 80)}`);
      filteredContent = ELIO_CODE_REFUSAL;
    }

    // 计算亲密度变化
    let intimacyChange = 1;
    if (emotion.sentiment === 'positive') intimacyChange = 2;
    if (emotion.sentiment === 'negative') intimacyChange = -1;
    
    // 检查用户是否在线（使用 WebSocket）
    const isOnline = wsManager.isUserOnline(user.id);
    
    if (isOnline) {
      // WebSocket 模式：立即返回确认，后台处理并推送
      console.log(`[WebSocket] 用户 ${user.username} 在线，使用实时推送模式`);

      // 立即返回确认响应（< 500ms）
      res.json({
        code: 200,
        message: '消息已接收，正在处理中...',
        success: true,
        data: { mode: 'websocket' }
      });

      // 发送"正在输入"状态
      wsManager.sendTypingStatus(user.id, true);

      // 委托 processChatFromWS 处理（skipCooldown=true，上面已检查过）
      processChatFromWS(user, message, true).catch(err => {
        console.error('[HTTP→WS] 处理失败:', err);
        wsManager.sendError(user.id, '处理消息时出错', 'PROCESSING_ERROR');
      });

    } else {
      // 传统模式：等待所有处理完成后返回（兼容性）
      console.log(`[传统模式] 用户 ${user.username} 离线，使用同步响应模式`);
      
      // 并行执行关键操作
      const [, newIntimacy] = await Promise.all([
        saveChatMessage(user.id, 'web', filteredContent, false, null, emotion.primary, aiResult.tokensUsed),
        updateIntimacy(user.id, intimacyChange),
        setCooldown(user.id, 'web', 3)
      ]);
      
      // 后台异步任务（不阻塞响应）
      Promise.all([
        updatePersonality(user.id, emotion, message),
        extractMemoriesFromConversation(user.id, message, filteredContent, emotion).catch(err => 
          console.error('记忆提取失败:', err)
        ),
        (emotion.intensity > 0.7 || message.length > 100) 
          ? saveSoulMemory(user.id, 'web', {
              content: message,
              emotion: emotion.primary,
              context: '重要对话',
              importance: emotion.intensity
            })
          : Promise.resolve(),
        onMessageProcessed(user.id, user.total_messages || 0)
      ]).catch(err => console.error('后台任务失败:', err));
      
      // 语音生成完全异步（不等待结果）
      let audioUrl = null;
      generateVoiceWithScene(filteredContent).then(voiceResult => {
        if (voiceResult.success) {
          console.log('语音生成成功:', voiceResult.audioUrl);
        }
      }).catch(err => console.error('语音生成失败:', err));
      
      res.json({
        code: 200,
        message: 'success',
        success: true,
        data: {
          mode: 'traditional',
          reply: filteredContent,
          audioUrl: null,
          intimacyChange,
          newIntimacy,
          emotion: emotion.primary
        }
      });
    }
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ code: 500, success: false, message: '发送消息失败', data: null });
  }
}

// 获取聊天历史
export async function getHistory(req, res) {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit) || 50;
    
    const { data: messages } = await getRecentMessages(user.id, 'web', limit);
    
    // 转换数据格式以匹配前端期望
    const history = messages.map(msg => ({
      role: msg.is_user ? 'user' : 'assistant',
      content: msg.message,
      created_at: msg.created_at,
      emotion: msg.emotion
    }));
    
    res.json({
      code: 200,
      message: 'success',
      success: true,
      data: {
        messages: history,
        total: history.length
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ code: 500, success: false, message: '获取历史记录失败', data: null });
  }
}
