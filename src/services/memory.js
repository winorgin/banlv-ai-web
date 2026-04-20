/**
 * 分层记忆系统 (Tiered Memory System)
 * 实现事实层 + 情感层的记忆架构
 */

import { supabase } from './supabase.js';

// ============================================
// 记忆类型定义
// ============================================

/**
 * 事实层记忆 (Factual Layer)
 * 存储客观信息：用户偏好、生活细节、重要事件
 */
const MEMORY_TYPE = {
  FACT: 'fact',           // 客观事实
  PREFERENCE: 'preference', // 用户偏好
  EVENT: 'event',         // 重要事件
  EMOTION: 'emotion',     // 情感记忆
  RELATIONSHIP: 'relationship' // 关系变化
};

/**
 * 记忆重要性等级
 */
const IMPORTANCE_LEVEL = {
  LOW: 1,      // 日常琐事
  MEDIUM: 2,   // 一般重要
  HIGH: 3,     // 很重要
  CRITICAL: 4  // 关键记忆
};

// ============================================
// 记忆存储
// ============================================

/**
 * 创建新记忆
 */
export async function createMemory(userId, memoryData) {
  try {
    const {
      type,
      content,
      importance = IMPORTANCE_LEVEL.MEDIUM,
      emotionalTag = null,
      relatedTopics = []
    } = memoryData;

    const { data, error } = await supabase
      .from('memories')
      .insert({
        user_id: userId,
        type,
        content,
        importance,
        emotional_tag: emotionalTag,
        related_topics: relatedTopics,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('创建记忆失败:', error);
    return null;
  }
}

/**
 * 从对话中提取记忆
 */
export async function extractMemoriesFromConversation(userId, userMessage, aiResponse, emotion) {
  const memories = [];

  // 提取事实性信息
  const factPatterns = [
    { regex: /我(在|是|做|学|工作在)(.+)/g, type: MEMORY_TYPE.FACT },
    { regex: /我(喜欢|爱|讨厌|不喜欢)(.+)/g, type: MEMORY_TYPE.PREFERENCE },
    { regex: /我(今天|昨天|最近)(.+)/g, type: MEMORY_TYPE.EVENT }
  ];

  for (const pattern of factPatterns) {
    const matches = userMessage.matchAll(pattern.regex);
    for (const match of matches) {
      memories.push({
        type: pattern.type,
        content: match[0],
        importance: IMPORTANCE_LEVEL.MEDIUM,
        emotionalTag: emotion.primary,
        relatedTopics: extractTopics(userMessage)
      });
    }
  }

  // 提取情感记忆
  if (emotion.intensity > 0.6) {
    memories.push({
      type: MEMORY_TYPE.EMOTION,
      content: {
        message: userMessage,
        emotion: emotion.primary,
        intensity: emotion.intensity,
        context: aiResponse
      },
      importance: emotion.intensity > 0.8 ? IMPORTANCE_LEVEL.HIGH : IMPORTANCE_LEVEL.MEDIUM,
      emotionalTag: emotion.primary,
      relatedTopics: extractTopics(userMessage)
    });
  }

  // 批量创建记忆
  for (const memory of memories) {
    await createMemory(userId, memory);
  }

  return memories;
}

// ============================================
// 记忆检索
// ============================================

/**
 * 检索相关记忆
 */
export async function retrieveRelevantMemories(userId, currentContext, limit = 5) {
  try {
    const topics = extractTopics(currentContext);
    
    // 1. 检索话题相关的记忆
    const { data: topicMemories, error: topicError } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .contains('related_topics', topics)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (topicError) throw topicError;

    // 2. 检索高重要性记忆
    const { data: importantMemories, error: importantError } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .gte('importance', IMPORTANCE_LEVEL.HIGH)
      .order('created_at', { ascending: false })
      .limit(3);

    if (importantError) throw importantError;

    // 3. 合并去重
    const allMemories = [...topicMemories, ...importantMemories];
    const uniqueMemories = Array.from(
      new Map(allMemories.map(m => [m.id, m])).values()
    );

    // 4. 按重要性和时间排序
    return uniqueMemories
      .sort((a, b) => {
        if (a.importance !== b.importance) {
          return b.importance - a.importance;
        }
        return new Date(b.created_at) - new Date(a.created_at);
      })
      .slice(0, limit);
  } catch (error) {
    console.error('检索记忆失败:', error);
    return [];
  }
}

/**
 * 获取情感记忆
 */
export async function getEmotionalMemories(userId, emotionType = null, limit = 5) {
  try {
    let query = supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('type', MEMORY_TYPE.EMOTION);

    if (emotionType) {
      query = query.eq('emotional_tag', emotionType);
    }

    const { data, error } = await query
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('获取情感记忆失败:', error);
    return [];
  }
}

/**
 * 获取用户偏好记忆
 */
export async function getUserPreferences(userId) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('type', MEMORY_TYPE.PREFERENCE)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('获取用户偏好失败:', error);
    return [];
  }
}

// ============================================
// 记忆关联
// ============================================

/**
 * 提取话题关键词
 */
function extractTopics(text) {
  const topics = [];
  
  // 常见话题关键词
  const topicKeywords = {
    work: ['工作', '项目', '忙', '加班', 'work', 'job', 'project', 'busy'],
    study: ['学习', '考试', '作业', '课程', 'study', 'exam', 'homework', 'class'],
    fitness: ['健身', '运动', '跑步', '锻炼', 'gym', 'workout', 'exercise', 'run'],
    food: ['吃', '饭', '餐', '美食', 'eat', 'food', 'meal', 'restaurant'],
    travel: ['旅行', '旅游', '出差', '度假', 'travel', 'trip', 'vacation'],
    emotion: ['开心', '难过', '生气', '想念', 'happy', 'sad', 'angry', 'miss'],
    relationship: ['喜欢', '爱', '想你', '关系', 'love', 'like', 'relationship'],
    investment: ['投资', '市场', '股票', '基金', 'investment', 'market', 'stock']
  };

  const lowerText = text.toLowerCase();
  
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword.toLowerCase()))) {
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * 查找相关记忆
 */
export async function findRelatedMemories(userId, memoryId, limit = 3) {
  try {
    // 获取目标记忆
    const { data: targetMemory, error: targetError } = await supabase
      .from('memories')
      .select('*')
      .eq('id', memoryId)
      .single();

    if (targetError) throw targetError;

    // 查找相同话题的记忆
    const { data: relatedMemories, error: relatedError } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .neq('id', memoryId)
      .contains('related_topics', targetMemory.related_topics)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (relatedError) throw relatedError;
    return relatedMemories || [];
  } catch (error) {
    console.error('查找相关记忆失败:', error);
    return [];
  }
}

// ============================================
// 记忆更新
// ============================================

/**
 * 更新记忆重要性
 */
export async function updateMemoryImportance(memoryId, newImportance) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({ importance: newImportance })
      .eq('id', memoryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('更新记忆重要性失败:', error);
    return null;
  }
}

/**
 * 记忆衰减（降低旧记忆的重要性）
 */
export async function decayOldMemories(userId, daysThreshold = 30) {
  try {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .lt('created_at', thresholdDate.toISOString())
      .gte('importance', IMPORTANCE_LEVEL.MEDIUM);

    if (error) throw error;

    // 降低重要性
    for (const memory of data || []) {
      if (memory.importance > IMPORTANCE_LEVEL.LOW) {
        await updateMemoryImportance(memory.id, memory.importance - 1);
      }
    }

    return data?.length || 0;
  } catch (error) {
    console.error('记忆衰减失败:', error);
    return 0;
  }
}

// ============================================
// 记忆摘要
// ============================================

/**
 * 生成记忆摘要
 */
export async function generateMemorySummary(userId) {
  try {
    const preferences = await getUserPreferences(userId);
    const emotionalMemories = await getEmotionalMemories(userId);
    const importantMemories = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .gte('importance', IMPORTANCE_LEVEL.HIGH)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      preferences: preferences.map(m => m.content),
      emotionalHighlights: emotionalMemories.map(m => ({
        emotion: m.emotional_tag,
        content: m.content
      })),
      importantEvents: importantMemories.data?.map(m => m.content) || []
    };
  } catch (error) {
    console.error('生成记忆摘要失败:', error);
    return null;
  }
}

// ============================================
// 导出
// ============================================

export default {
  MEMORY_TYPE,
  IMPORTANCE_LEVEL,
  createMemory,
  extractMemoriesFromConversation,
  retrieveRelevantMemories,
  getEmotionalMemories,
  getUserPreferences,
  findRelatedMemories,
  updateMemoryImportance,
  decayOldMemories,
  generateMemorySummary
};
