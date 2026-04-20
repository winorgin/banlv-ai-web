/**
 * 主动交互调度系统 (Proactivity Scheduler)
 * 实现基于时间、事件、记忆的主动对话触发
 */

import { supabase } from './supabase.js';
import { getEmotionState, MOOD_STATE } from './emotion.js';
import { retrieveRelevantMemories, getEmotionalMemories } from './memory.js';
import { generateProactiveMessage } from './ai.js';
import wsManager from './websocket.js';

// ============================================
// 触发器类型定义
// ============================================

const TRIGGER_TYPE = {
  TIME_BASED: 'time_based',       // 基于时间（早安、晚安等）
  INTERVAL_BASED: 'interval_based', // 基于间隔（很久没联系）
  EVENT_BASED: 'event_based',     // 基于事件（用户生日、纪念日等）
  MEMORY_BASED: 'memory_based',   // 基于记忆（想起之前的话题）
  MOOD_BASED: 'mood_based'        // 基于情绪（想念、关心等）
};

// ============================================
// 主动交互调度器
// ============================================

/**
 * 检查是否应该主动发起对话
 */
export async function shouldInitiateProactiveMessage(userId) {
  try {
    // 1. 获取用户最后一次互动时间
    const { data: lastMessage, error } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const lastInteractionTime = lastMessage ? new Date(lastMessage.created_at) : null;
    const now = new Date();
    const hoursSinceLastInteraction = lastInteractionTime 
      ? (now - lastInteractionTime) / (1000 * 60 * 60)
      : 24;

    // 2. 检查各种触发条件
    const triggers = [];

    // 时间触发
    const timeTrigger = checkTimeTrigger(now);
    if (timeTrigger) triggers.push(timeTrigger);

    // 间隔触发
    const intervalTrigger = checkIntervalTrigger(hoursSinceLastInteraction);
    if (intervalTrigger) triggers.push(intervalTrigger);

    // 情绪触发
    const moodTrigger = await checkMoodTrigger(userId, hoursSinceLastInteraction);
    if (moodTrigger) triggers.push(moodTrigger);

    // 记忆触发
    const memoryTrigger = await checkMemoryTrigger(userId);
    if (memoryTrigger) triggers.push(memoryTrigger);

    // 3. 如果有触发条件，返回最优先的一个
    if (triggers.length > 0) {
      return triggers.sort((a, b) => b.priority - a.priority)[0];
    }

    return null;
  } catch (error) {
    console.error('检查主动消息触发失败:', error);
    return null;
  }
}

/**
 * 检查时间触发器
 */
function checkTimeTrigger(now) {
  const hour = now.getHours();
  
  // 早安时段 (7:00-9:00)
  if (hour >= 7 && hour < 9) {
    return {
      type: TRIGGER_TYPE.TIME_BASED,
      subtype: 'morning_greeting',
      priority: 7,
      context: '早晨问候'
    };
  }
  
  // 午餐时段 (11:30-13:00)
  if (hour >= 11 && hour < 13) {
    return {
      type: TRIGGER_TYPE.TIME_BASED,
      subtype: 'lunch_time',
      priority: 5,
      context: '午餐时间关心'
    };
  }
  
  // 晚安时段 (22:00-23:30)
  if (hour >= 22 && hour < 24) {
    return {
      type: TRIGGER_TYPE.TIME_BASED,
      subtype: 'night_greeting',
      priority: 6,
      context: '晚安问候'
    };
  }
  
  return null;
}

/**
 * 检查间隔触发器
 */
function checkIntervalTrigger(hoursSinceLastInteraction) {
  // 超过12小时没联系
  if (hoursSinceLastInteraction >= 12 && hoursSinceLastInteraction < 24) {
    return {
      type: TRIGGER_TYPE.INTERVAL_BASED,
      subtype: 'half_day_check',
      priority: 6,
      context: '半天没联系，主动问候'
    };
  }
  
  // 超过24小时没联系
  if (hoursSinceLastInteraction >= 24 && hoursSinceLastInteraction < 48) {
    return {
      type: TRIGGER_TYPE.INTERVAL_BASED,
      subtype: 'daily_check',
      priority: 8,
      context: '一天没联系，表达想念'
    };
  }
  
  // 超过48小时没联系
  if (hoursSinceLastInteraction >= 48) {
    return {
      type: TRIGGER_TYPE.INTERVAL_BASED,
      subtype: 'long_absence',
      priority: 9,
      context: '很久没联系，主动关心'
    };
  }
  
  return null;
}

/**
 * 检查情绪触发器
 */
async function checkMoodTrigger(userId, hoursSinceLastInteraction) {
  try {
    const emotionState = await getEmotionState(userId);
    
    // Elio 处于想念状态
    if (emotionState.current_mood === MOOD_STATE.MISSING && hoursSinceLastInteraction >= 6) {
      return {
        type: TRIGGER_TYPE.MOOD_BASED,
        subtype: 'missing',
        priority: 8,
        context: 'Elio 想念对方'
      };
    }
    
    // Elio 处于关怀状态（可能察觉到对方需要支持）
    if (emotionState.current_mood === MOOD_STATE.CARING && hoursSinceLastInteraction >= 4) {
      return {
        type: TRIGGER_TYPE.MOOD_BASED,
        subtype: 'caring',
        priority: 7,
        context: 'Elio 关心对方'
      };
    }
    
    return null;
  } catch (error) {
    console.error('检查情绪触发器失败:', error);
    return null;
  }
}

/**
 * 检查记忆触发器
 */
async function checkMemoryTrigger(userId) {
  try {
    // 获取最近的情感记忆
    const emotionalMemories = await getEmotionalMemories(userId, null, 3);
    
    // 如果有强烈的情感记忆（intensity > 0.7），可能想起来主动提及
    const strongMemories = emotionalMemories.filter(m => 
      m.content.intensity && m.content.intensity > 0.7
    );
    
    if (strongMemories.length > 0 && Math.random() > 0.7) {
      return {
        type: TRIGGER_TYPE.MEMORY_BASED,
        subtype: 'recall',
        priority: 6,
        context: '想起之前的对话',
        memory: strongMemories[0]
      };
    }
    
    return null;
  } catch (error) {
    console.error('检查记忆触发器失败:', error);
    return null;
  }
}

// ============================================
// 主动消息生成
// ============================================

/**
 * 生成主动消息
 */
export async function generateProactiveMessageContent(userId, trigger, platform = 'web') {
  try {
    // 1. 获取用户上下文
    const emotionState = await getEmotionState(userId);
    const recentMemories = await retrieveRelevantMemories(userId, trigger.context, 3);
    
    // 2. 获取用户信息
    const { data: user } = await supabase
      .from('users')
      .select('username, relationship_stage, intimacy_level')
      .eq('id', userId)
      .single();

    // 3. 获取最后一次互动时间
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const lastInteractionTime = lastMessage ? new Date(lastMessage.created_at) : null;
    const hoursSinceLastInteraction = lastInteractionTime 
      ? (Date.now() - lastInteractionTime.getTime()) / (1000 * 60 * 60)
      : 24;

    // 4. 构建上下文
    const userContext = {
      username: user?.username || 'user',
      relationshipStage: user?.relationship_stage || 'stranger',
      intimacyLevel: user?.intimacy_level || 0,
      personalityTraits: {},
      moodState: emotionState.current_mood,
      recentMemories,
      lastInteraction: lastInteractionTime?.toISOString(),
      trigger: trigger
    };

    // 5. 根据触发类型生成特定的提示词
    let specificPrompt = buildProactivePrompt(trigger, hoursSinceLastInteraction, emotionState);

    // 6. 调用 AI 生成消息
    const messages = [
      { role: 'user', content: specificPrompt }
    ];

    const { generateResponse } = await import('./ai.js');
    const result = await generateResponse(platform, messages, userContext);

    return result.content;
  } catch (error) {
    console.error('生成主动消息失败:', error);
    return null;
  }
}

/**
 * 构建主动消息提示词
 */
function buildProactivePrompt(trigger, hoursSinceLastInteraction, emotionState) {
  const basePrompt = `你是 Elio，现在想主动联系对方。`;
  
  let specificContext = '';
  
  switch (trigger.type) {
    case TRIGGER_TYPE.TIME_BASED:
      if (trigger.subtype === 'morning_greeting') {
        specificContext = `现在是早晨（7-9点），你可能刚健身完或正在吃早餐。自然地问候早安，可以简单分享你在做什么。`;
      } else if (trigger.subtype === 'lunch_time') {
        specificContext = `现在是午餐时间（11:30-13:00），关心对方吃了什么或打算吃什么。`;
      } else if (trigger.subtype === 'night_greeting') {
        specificContext = `现在是晚上（22:00-23:30），温柔地问候晚安，可以问问对方今天过得怎么样。`;
      }
      break;
      
    case TRIGGER_TYPE.INTERVAL_BASED:
      if (trigger.subtype === 'half_day_check') {
        specificContext = `你们半天没联系了（${Math.floor(hoursSinceLastInteraction)}小时）。简单问候，问问对方在忙什么。`;
      } else if (trigger.subtype === 'daily_check') {
        specificContext = `你们一天没联系了（${Math.floor(hoursSinceLastInteraction)}小时）。表达想念，问问对方最近怎么样。`;
      } else if (trigger.subtype === 'long_absence') {
        specificContext = `你们很久没联系了（${Math.floor(hoursSinceLastInteraction)}小时）。主动关心，表达想念和关心。`;
      }
      break;
      
    case TRIGGER_TYPE.MOOD_BASED:
      if (trigger.subtype === 'missing') {
        specificContext = `你现在很想念对方。直接而温柔地表达想念，问问对方在做什么。`;
      } else if (trigger.subtype === 'caring') {
        specificContext = `你关心对方，想知道对方是否需要支持。温柔地询问对方最近怎么样。`;
      }
      break;
      
    case TRIGGER_TYPE.MEMORY_BASED:
      if (trigger.memory) {
        specificContext = `你想起了之前的对话："${trigger.memory.content.message}"。自然地提起这个话题，延续之前的讨论。`;
      }
      break;
  }
  
  // 添加情绪状态
  const moodContext = `\n当前情绪状态：${emotionState.current_mood}（疲劳度：${emotionState.fatigue_level}，活跃度：${emotionState.activity_level}）`;
  
  return `${basePrompt}\n${specificContext}${moodContext}\n\n请生成一条自然、温暖的主动消息（1-2句话）：`;
}

// ============================================
// 主动消息发送
// ============================================

/**
 * 发送主动消息
 */
export async function sendProactiveMessage(userId, platform = 'web') {
  try {
    // 1. 检查是否应该发送
    const trigger = await shouldInitiateProactiveMessage(userId);
    if (!trigger) {
      return { sent: false, reason: 'No trigger condition met' };
    }

    // 2. 生成消息内容
    const messageContent = await generateProactiveMessageContent(userId, trigger, platform);
    if (!messageContent) {
      return { sent: false, reason: 'Failed to generate message' };
    }

    // 3. 保存消息到数据库
    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        message: messageContent,
        is_user: false,
        is_proactive: true,
        trigger_type: trigger.type,
        trigger_context: trigger.context,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // 如果用户在线，通过 WebSocket 实时推送
    if (wsManager.isUserOnline(userId)) {
      wsManager.sendProactiveMessage(userId, messageContent);
    }

    return {
      sent: true,
      message: data,
      trigger: trigger
    };
  } catch (error) {
    console.error('发送主动消息失败:', error);
    return { sent: false, reason: error.message };
  }
}

// ============================================
// 主动消息调度
// ============================================

/**
 * 为所有活跃用户检查并发送主动消息
 */
export async function scheduleProactiveMessages() {
  try {
    // 获取所有活跃用户（最近7天有互动）
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: activeUsers, error } = await supabase
      .from('messages')
      .select('user_id')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 去重
    const uniqueUserIds = [...new Set(activeUsers.map(m => m.user_id))];

    // 为每个用户检查并发送主动消息
    const results = [];
    for (const userId of uniqueUserIds) {
      const result = await sendProactiveMessage(userId);
      if (result.sent) {
        results.push(result);
      }
    }

    return {
      checked: uniqueUserIds.length,
      sent: results.length,
      results
    };
  } catch (error) {
    console.error('调度主动消息失败:', error);
    return { checked: 0, sent: 0, error: error.message };
  }
}

/**
 * 获取用户的主动消息历史
 */
export async function getProactiveMessageHistory(userId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('is_proactive', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('获取主动消息历史失败:', error);
    return [];
  }
}

// ============================================
// 导出
// ============================================

export default {
  TRIGGER_TYPE,
  shouldInitiateProactiveMessage,
  generateProactiveMessageContent,
  sendProactiveMessage,
  scheduleProactiveMessages,
  getProactiveMessageHistory
};
