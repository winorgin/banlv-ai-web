/**
 * Supabase 数据库服务 - 统一多平台
 * 提供跨平台的数据库操作接口
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 配置缺失！');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// 用户管理
// ============================================

/**
 * 通过平台信息获取或创建用户
 */
export async function getOrCreateUserByPlatform(platform, platformUserId, platformUsername) {
  try {
    // 先查找是否已有绑定
    const { data: binding } = await supabase
      .from('user_platforms')
      .select('user_id, users(*)')
      .eq('platform', platform)
      .eq('platform_user_id', platformUserId)
      .single();

    if (binding) {
      return { data: binding.users, error: null };
    }

    // 创建新用户
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        username: platformUsername,
        dol_balance: 10,
        intimacy_level: 0,
        relationship_stage: 'close_friend'
      })
      .select()
      .single();

    if (createError) {
      return { data: null, error: createError };
    }

    // 创建平台绑定
    await supabase.from('user_platforms').insert({
      user_id: newUser.id,
      platform: platform,
      platform_user_id: platformUserId,
      platform_username: platformUsername,
      is_primary: true
    });

    // 初始化关联数据
    await Promise.all([
      supabase.from('relationships').insert({
        user_id: newUser.id,
        intimacy_points: 0,
        relationship_stage: 'close_friend'
      }),
      supabase.from('personality_states').insert({
        user_id: newUser.id
      }),
      supabase.from('user_levels').insert({
        user_id: newUser.id,
        level: 1,
        experience_points: 0
      })
    ]);

    return { data: newUser, error: null };
  } catch (error) {
    console.error('获取或创建用户失败:', error);
    return { data: null, error };
  }
}

/**
 * 绑定平台账号
 */
export async function bindPlatform(userId, platform, platformUserId, platformUsername) {
  try {
    const { data, error } = await supabase
      .from('user_platforms')
      .insert({
        user_id: userId,
        platform: platform,
        platform_user_id: platformUserId,
        platform_username: platformUsername
      })
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('绑定平台失败:', error);
    return { data: null, error };
  }
}

/**
 * 更新 DOL 余额
 */
export async function updateDolBalance(userId, amount) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ dol_balance: amount })
      .eq('id', userId)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('更新 DOL 余额失败:', error);
    return { data: null, error };
  }
}

/**
 * 扣除 DOL
 */
export async function deductDol(userId, amount = 1) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('dol_balance')
      .eq('id', userId)
      .single();

    if (!user || user.dol_balance < amount) {
      return { success: false, error: 'DOL 余额不足' };
    }

    const newBalance = user.dol_balance - amount;
    await updateDolBalance(userId, newBalance);

    return { success: true, newBalance };
  } catch (error) {
    console.error('扣除 DOL 失败:', error);
    return { success: false, error };
  }
}

// ============================================
// 聊天记录管理
// ============================================

/**
 * 保存聊天消息
 */
export async function saveChatMessage(userId, platform, message, isUser, sessionId = null, emotion = null, tokensUsed = 0) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        platform: platform,
        session_id: sessionId,
        message: message,
        is_user: isUser,
        emotion: emotion,
        tokens_used: tokensUsed
      })
      .select()
      .single();

    // 更新用户总消息数
    if (!error && !isUser) {
      await supabase.rpc('increment', {
        table_name: 'users',
        row_id: userId,
        column_name: 'total_messages'
      });
    }

    return { data, error };
  } catch (error) {
    console.error('保存聊天消息失败:', error);
    return { data: null, error };
  }
}

/**
 * 获取最近的聊天记录
 */
export async function getRecentMessages(userId, platform = null, limit = 50) {
  try {
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;

    return { data: data?.reverse() || [], error };
  } catch (error) {
    console.error('获取聊天记录失败:', error);
    return { data: [], error };
  }
}

// ============================================
// 会话管理
// ============================================

/**
 * 获取或创建会话
 */
export async function getOrCreateSession(userId, platform) {
  try {
    // 查找活跃会话
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .gte('last_active', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('last_active', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      return { data: existingSession, error: null };
    }

    // 创建新会话
    const { data: newSession, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        platform: platform,
        session_data: {},
        conversation_history: []
      })
      .select()
      .single();

    return { data: newSession, error };
  } catch (error) {
    console.error('获取或创建会话失败:', error);
    return { data: null, error };
  }
}

/**
 * 更新会话
 */
export async function updateSession(sessionId, sessionData = null, conversationHistory = null) {
  try {
    const updateData = { last_active: new Date().toISOString() };
    
    if (sessionData) updateData.session_data = sessionData;
    if (conversationHistory) updateData.conversation_history = conversationHistory;

    const { data, error } = await supabase
      .from('sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('更新会话失败:', error);
    return { data: null, error };
  }
}

// ============================================
// 关系管理
// ============================================

/**
 * 更新亲密度
 */
export async function updateIntimacy(userId, points) {
  try {
    const { data: relationship } = await supabase
      .from('relationships')
      .select('intimacy_points')
      .eq('user_id', userId)
      .single();

    if (!relationship) {
      return { data: null, error: '关系记录不存在' };
    }

    const newPoints = relationship.intimacy_points + points;
    
    // 确定关系阶段
    let stage = 'close_friend';
    if (newPoints >= 1000) stage = 'soulmate';
    else if (newPoints >= 500) stage = 'lover';

    const { data, error } = await supabase
      .from('relationships')
      .update({
        intimacy_points: newPoints,
        relationship_stage: stage,
        last_interaction: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    // 同步更新 users 表
    await supabase
      .from('users')
      .update({
        intimacy_level: newPoints,
        relationship_stage: stage
      })
      .eq('id', userId);

    return { data, error };
  } catch (error) {
    console.error('更新亲密度失败:', error);
    return { data: null, error };
  }
}

/**
 * 添加特殊时刻
 */
export async function addSpecialMoment(userId, moment) {
  try {
    const { data: relationship } = await supabase
      .from('relationships')
      .select('special_moments')
      .eq('user_id', userId)
      .single();

    const moments = relationship?.special_moments || [];
    moments.push({
      ...moment,
      timestamp: new Date().toISOString()
    });

    const { data, error } = await supabase
      .from('relationships')
      .update({ special_moments: moments })
      .eq('user_id', userId)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('添加特殊时刻失败:', error);
    return { data: null, error };
  }
}

// ============================================
// 灵魂记忆管理
// ============================================

/**
 * 保存灵魂记忆
 */
export async function saveSoulMemory(userId, memoryType, content, importance = 5, tags = [], platform = null) {
  try {
    const { data, error } = await supabase
      .from('soul_memories')
      .insert({
        user_id: userId,
        memory_type: memoryType,
        content: content,
        importance: importance,
        tags: tags,
        platform: platform
      })
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('保存灵魂记忆失败:', error);
    return { data: null, error };
  }
}

/**
 * 获取重要记忆
 */
export async function getImportantMemories(userId, minImportance = 7, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('soul_memories')
      .select('*')
      .eq('user_id', userId)
      .gte('importance', minImportance)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    return { data: data || [], error };
  } catch (error) {
    console.error('获取重要记忆失败:', error);
    return { data: [], error };
  }
}

// ============================================
// 支付管理
// ============================================

/**
 * 创建支付记录
 */
export async function createPayment(userId, platform, amount, dolAmount, transactionId) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        platform: platform,
        amount: amount,
        dol_amount: dolAmount,
        transaction_id: transactionId,
        status: 'pending'
      })
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('创建支付记录失败:', error);
    return { data: null, error };
  }
}

/**
 * 完成支付
 */
export async function completePayment(transactionId, userId, dolAmount) {
  try {
    // 更新支付状态
    await supabase
      .from('payments')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId);

    // 增加 DOL 余额
    const { data: user } = await supabase
      .from('users')
      .select('dol_balance')
      .eq('id', userId)
      .single();

    const newBalance = (user?.dol_balance || 0) + dolAmount;
    await updateDolBalance(userId, newBalance);

    return { success: true, newBalance };
  } catch (error) {
    console.error('完成支付失败:', error);
    return { success: false, error };
  }
}

// ============================================
// 每日 DOL 重置
// ============================================

/**
 * 检查并执行每日 DOL 重置
 */
export async function checkDailyDolReset(userId, platform = null) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 检查今天是否已重置
    const { data: existingReset } = await supabase
      .from('daily_dol_resets')
      .select('*')
      .eq('user_id', userId)
      .eq('reset_date', today)
      .single();

    if (existingReset) {
      return { alreadyReset: true, data: null };
    }

    // 执行重置
    const dolAmount = parseInt(process.env.DAILY_DOL_AMOUNT) || 10;
    const { data: user } = await supabase
      .from('users')
      .select('dol_balance')
      .eq('id', userId)
      .single();

    const newBalance = (user?.dol_balance || 0) + dolAmount;
    await updateDolBalance(userId, newBalance);

    // 记录重置
    await supabase.from('daily_dol_resets').insert({
      user_id: userId,
      reset_date: today,
      dol_granted: dolAmount,
      platform: platform
    });

    return { 
      alreadyReset: false, 
      data: { dolGranted: dolAmount, newBalance } 
    };
  } catch (error) {
    console.error('每日 DOL 重置失败:', error);
    return { alreadyReset: false, data: null, error };
  }
}

// ============================================
// 冷却时间管理
// ============================================

/**
 * 设置冷却时间
 */
export async function setCooldown(userId, actionType, cooldownSeconds, platform = null) {
  try {
    const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();

    await supabase
      .from('cooldowns')
      .upsert({
        user_id: userId,
        action_type: actionType,
        platform: platform,
        cooldown_until: cooldownUntil
      });

    return { success: true };
  } catch (error) {
    console.error('设置冷却时间失败:', error);
    return { success: false, error };
  }
}

/**
 * 检查冷却时间
 */
export async function checkCooldown(userId, actionType, platform = null) {
  try {
    let query = supabase
      .from('cooldowns')
      .select('*')
      .eq('user_id', userId)
      .eq('action_type', actionType);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data } = await query.single();

    if (!data) {
      return { onCooldown: false, remaining: 0 };
    }

    const cooldownUntil = new Date(data.cooldown_until);
    const now = new Date();

    if (now < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - now) / 1000);
      return { onCooldown: true, remaining };
    }

    // 冷却已过期，删除记录
    await supabase.from('cooldowns').delete().eq('id', data.id);
    return { onCooldown: false, remaining: 0 };
  } catch (error) {
    return { onCooldown: false, remaining: 0 };
  }
}

// ============================================
// 统计信息
// ============================================

/**
 * 获取用户完整信息
 */
export async function getUserFullInfo(userId) {
  try {
    const { data, error } = await supabase
      .from('user_full_stats')
      .select('*')
      .eq('id', userId)
      .single();

    return { data, error };
  } catch (error) {
    console.error('获取用户完整信息失败:', error);
    return { data: null, error };
  }
}

// ============================================
// 用户偏好管理
// ============================================

/**
 * 更新用户偏好设置
 */
export async function updateUserPreferences(userId, preferences) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();
    
    const updatedPreferences = { ...(user?.preferences || {}), ...preferences };
    
    const { data, error } = await supabase
      .from('users')
      .update({ preferences: updatedPreferences })
      .eq('id', userId)
      .select()
      .single();
    
    return { data, error };
  } catch (error) {
    console.error('更新用户偏好失败:', error);
    return { data: null, error };
  }
}

/**
 * 获取用户语言偏好
 */
export async function getUserLanguagePreference(userId) {
  try {
    const { data } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();
    
    return data?.preferences?.language_preference || null;
  } catch (error) {
    console.error('获取用户语言偏好失败:', error);
    return null;
  }
}

/**
 * 检测消息语言
 */
export function detectLanguage(text) {
  // 中文（包括繁体）
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
  
  // 日文（平假名、片假名）
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
  
  // 韩文
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  
  // 阿拉伯文
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  
  // 西里尔字母（俄语等）
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  
  // 泰文
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  
  // 希腊文
  if (/[\u0370-\u03ff]/.test(text)) return 'el';
  
  // 越南文
  if (/[\u1ea0-\u1ef9]/.test(text)) return 'vi';
  
  // 希伯来文
  if (/[\u0590-\u05ff]/.test(text)) return 'he';
  
  // 默认为英文或其他拉丁字母语言
  return 'en';
}

export default {
  supabase,
  getOrCreateUserByPlatform,
  bindPlatform,
  updateDolBalance,
  deductDol,
  saveChatMessage,
  getRecentMessages,
  getOrCreateSession,
  updateSession,
  updateIntimacy,
  addSpecialMoment,
  saveSoulMemory,
  getImportantMemories,
  createPayment,
  completePayment,
  checkDailyDolReset,
  setCooldown,
  checkCooldown,
  getUserFullInfo,
  updateUserPreferences,
  getUserLanguagePreference,
  detectLanguage
};
