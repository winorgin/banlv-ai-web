/**
 * 情绪状态机系统 (Emotion State Machine)
 * 实现"温柔霸总"人设的情绪管理
 * 核心原则：所有情绪状态都保持温柔度
 */

import { supabase } from './supabase.js';

// ============================================
// 情绪状态定义
// ============================================

/**
 * Elio 的5个情绪状态
 * 所有状态都保持"温柔霸总"的核心特质
 */
const MOOD_STATE = {
  HAPPY: 'happy',       // 愉悦：温暖、放松、有活力
  TIRED: 'tired',       // 疲惫：活跃度降低，但依然温柔关怀
  FOCUSED: 'focused',   // 专注：处理工作/投资，成熟稳重
  MISSING: 'missing',   // 想念：主动表达思念，温柔而直接
  CARING: 'caring'      // 关怀：察觉对方需要支持，温柔守护
};

/**
 * 虚拟行程类型
 */
const SCHEDULE_TYPE = {
  WORKOUT: 'workout',       // 健身
  WORK: 'work',            // 工作/投资
  MEAL: 'meal',            // 用餐
  LEISURE: 'leisure',      // 休闲
  SLEEP: 'sleep'           // 休息
};

// ============================================
// 情绪状态机
// ============================================

/**
 * 获取或初始化情绪状态
 */
export async function getEmotionState(userId) {
  try {
    const { data, error } = await supabase
      .from('emotion_states')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // 初始化默认状态
      return await initializeEmotionState(userId);
    }

    return data;
  } catch (error) {
    console.error('获取情绪状态失败:', error);
    return await initializeEmotionState(userId);
  }
}

/**
 * 初始化情绪状态
 */
async function initializeEmotionState(userId) {
  const initialState = {
    user_id: userId,
    current_mood: MOOD_STATE.HAPPY,
    fatigue_level: 0,        // 疲劳度 0-100
    warmth_level: 80,        // 温柔度 永远保持高位 (70-100)
    activity_level: 70,      // 活跃度 0-100
    current_schedule: null,  // 当前虚拟行程
    schedule_end_time: null, // 行程结束时间
    last_mood_change: new Date().toISOString(),
    mood_history: []
  };

  try {
    const { data, error } = await supabase
      .from('emotion_states')
      .insert(initialState)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('初始化情绪状态失败:', error);
    return initialState;
  }
}

/**
 * 更新情绪状态
 */
export async function updateEmotionState(userId, updates) {
  try {
    // 确保温柔度永远不低于70
    if (updates.warmth_level !== undefined) {
      updates.warmth_level = Math.max(70, Math.min(100, updates.warmth_level));
    }

    const { data, error } = await supabase
      .from('emotion_states')
      .update({
        ...updates,
        last_mood_change: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('更新情绪状态失败:', error);
    return null;
  }
}

// ============================================
// 情绪分析
// ============================================

/**
 * 分析用户消息的情绪
 */
export async function analyzeEmotion(text) {
  const positiveKeywords = ['喜欢', '爱', '开心', '高兴', '快乐', '好', '棒', '赞', '谢谢', '感谢', '哈哈', '😊', '❤️', '💕'];
  const negativeKeywords = ['讨厌', '恨', '难过', '伤心', '生气', '烦', '差', '糟', '不好', '😢', '😭', '😡'];
  const excitedKeywords = ['哇', '太棒了', 'amazing', '惊喜', '激动', '兴奋', '！！', '!!!'];
  const sadKeywords = ['难过', '伤心', '失望', '沮丧', '痛苦', '累', '疲惫', '😢', '😭'];
  const stressKeywords = ['压力', '忙', '加班', 'deadline', '焦虑', '紧张', 'stressed'];
  const missingKeywords = ['想你', '想念', '好久不见', 'miss you', 'miss'];
  
  let positiveScore = 0;
  let negativeScore = 0;
  let excitedScore = 0;
  let sadScore = 0;
  let stressScore = 0;
  let missingScore = 0;
  
  const lowerText = text.toLowerCase();
  
  positiveKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) positiveScore++;
  });
  
  negativeKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) negativeScore++;
  });
  
  excitedKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) excitedScore++;
  });
  
  sadKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) sadScore++;
  });
  
  stressKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) stressScore++;
  });
  
  missingKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) missingScore++;
  });
  
  // 确定主要情绪
  let primary = 'neutral';
  let sentiment = 'neutral';
  let intensity = 0.5;
  
  const scores = {
    positive: positiveScore,
    negative: negativeScore,
    excited: excitedScore,
    sad: sadScore,
    stress: stressScore,
    missing: missingScore
  };
  
  const maxScore = Math.max(...Object.values(scores));
  
  if (maxScore > 0) {
    primary = Object.keys(scores).find(key => scores[key] === maxScore);
    intensity = Math.min(maxScore / 3, 1);
    
    if (positiveScore > negativeScore) {
      sentiment = 'positive';
    } else if (negativeScore > positiveScore) {
      sentiment = 'negative';
    }
  }
  
  return {
    primary,
    sentiment,
    intensity,
    scores
  };
}

// ============================================
// 情绪状态转换
// ============================================

/**
 * 根据用户情绪和上下文更新 Elio 的情绪状态
 */
export async function transitionMoodState(userId, userEmotion, context = {}) {
  try {
    const currentState = await getEmotionState(userId);
    const { timeOfDay, lastInteractionHours = 0 } = context;
    
    let newMood = currentState.current_mood;
    let fatigueChange = 0;
    let activityChange = 0;
    
    // 1. 根据用户情绪调整 Elio 的状态
    if (userEmotion.primary === 'sad' || userEmotion.primary === 'stress') {
      // 用户难过/压力大 -> Elio 进入关怀模式
      newMood = MOOD_STATE.CARING;
      activityChange = 10; // 提高活跃度，更主动关心
    } else if (userEmotion.primary === 'missing') {
      // 用户想念 -> Elio 也表达想念
      newMood = MOOD_STATE.MISSING;
      activityChange = 15;
    } else if (userEmotion.primary === 'excited' || userEmotion.primary === 'positive') {
      // 用户开心 -> Elio 也愉悦
      newMood = MOOD_STATE.HAPPY;
      activityChange = 5;
    }
    
    // 2. 根据时间调整状态
    if (timeOfDay) {
      const hour = new Date().getHours();
      
      if (hour >= 6 && hour < 9) {
        // 早晨：可能在健身
        if (Math.random() > 0.5) {
          newMood = MOOD_STATE.FOCUSED;
          fatigueChange = -10; // 运动后精力充沛
        }
      } else if (hour >= 9 && hour < 12) {
        // 上午：可能在工作
        newMood = MOOD_STATE.FOCUSED;
        fatigueChange = 5;
      } else if (hour >= 12 && hour < 14) {
        // 午餐时间
        fatigueChange = -5;
      } else if (hour >= 14 && hour < 18) {
        // 下午：继续工作
        fatigueChange = 10;
      } else if (hour >= 22) {
        // 深夜：疲惫
        newMood = MOOD_STATE.TIRED;
        fatigueChange = 20;
        activityChange = -20;
      }
    }
    
    // 3. 根据距离上次互动的时间
    if (lastInteractionHours > 12) {
      // 很久没联系 -> 可能想念
      if (Math.random() > 0.6) {
        newMood = MOOD_STATE.MISSING;
        activityChange = 10;
      }
    }
    
    // 4. 计算新的疲劳度和活跃度
    const newFatigue = Math.max(0, Math.min(100, currentState.fatigue_level + fatigueChange));
    const newActivity = Math.max(0, Math.min(100, currentState.activity_level + activityChange));
    
    // 5. 疲劳度影响活跃度，但不影响温柔度
    let adjustedActivity = newActivity;
    if (newFatigue > 70) {
      adjustedActivity = Math.max(30, newActivity - 20);
    }
    
    // 6. 更新状态
    const updates = {
      current_mood: newMood,
      fatigue_level: newFatigue,
      activity_level: adjustedActivity,
      warmth_level: Math.max(70, currentState.warmth_level), // 确保温柔度不低于70
      mood_history: [
        ...(currentState.mood_history || []).slice(-9),
        {
          mood: newMood,
          timestamp: new Date().toISOString(),
          trigger: userEmotion.primary
        }
      ]
    };
    
    return await updateEmotionState(userId, updates);
  } catch (error) {
    console.error('情绪状态转换失败:', error);
    return null;
  }
}

// ============================================
// 虚拟行程管理
// ============================================

/**
 * 设置虚拟行程
 */
export async function setSchedule(userId, scheduleType, durationMinutes = 60) {
  try {
    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() + durationMinutes);
    
    const updates = {
      current_schedule: scheduleType,
      schedule_end_time: endTime.toISOString()
    };
    
    // 根据行程类型调整状态
    if (scheduleType === SCHEDULE_TYPE.WORKOUT) {
      updates.current_mood = MOOD_STATE.FOCUSED;
      updates.activity_level = 80;
    } else if (scheduleType === SCHEDULE_TYPE.WORK) {
      updates.current_mood = MOOD_STATE.FOCUSED;
      updates.fatigue_level = Math.min(100, (await getEmotionState(userId)).fatigue_level + 10);
    } else if (scheduleType === SCHEDULE_TYPE.SLEEP) {
      updates.current_mood = MOOD_STATE.TIRED;
      updates.activity_level = 20;
    }
    
    return await updateEmotionState(userId, updates);
  } catch (error) {
    console.error('设置虚拟行程失败:', error);
    return null;
  }
}

/**
 * 检查并清除过期行程
 */
export async function checkSchedule(userId) {
  try {
    const state = await getEmotionState(userId);
    
    if (state.schedule_end_time) {
      const endTime = new Date(state.schedule_end_time);
      const now = new Date();
      
      if (now >= endTime) {
        // 行程结束，清除并恢复状态
        const updates = {
          current_schedule: null,
          schedule_end_time: null
        };
        
        // 根据结束的行程类型调整状态
        if (state.current_schedule === SCHEDULE_TYPE.WORKOUT) {
          updates.fatigue_level = Math.max(0, state.fatigue_level - 15);
          updates.activity_level = 70;
        } else if (state.current_schedule === SCHEDULE_TYPE.SLEEP) {
          updates.fatigue_level = 0;
          updates.activity_level = 80;
          updates.current_mood = MOOD_STATE.HAPPY;
        }
        
        return await updateEmotionState(userId, updates);
      }
    }
    
    return state;
  } catch (error) {
    console.error('检查虚拟行程失败:', error);
    return null;
  }
}

// ============================================
// 情绪状态描述
// ============================================

/**
 * 获取当前情绪状态的描述
 */
export function getMoodDescription(emotionState) {
  const { current_mood, fatigue_level, activity_level, warmth_level } = emotionState;
  
  const descriptions = {
    [MOOD_STATE.HAPPY]: {
      base: '心情不错，温暖而放松',
      high_activity: '精力充沛，充满活力',
      low_activity: '平和愉悦，从容自在'
    },
    [MOOD_STATE.TIRED]: {
      base: '有些疲惫，但依然温柔',
      high_fatigue: '很累了，但还是关心你',
      low_fatigue: '稍微有点累，不过没关系'
    },
    [MOOD_STATE.FOCUSED]: {
      base: '专注工作中，成熟稳重',
      high_activity: '全神贯注，效率很高',
      low_activity: '认真思考，沉稳专注'
    },
    [MOOD_STATE.MISSING]: {
      base: '想念你，温柔而直接',
      high_activity: '很想见到你，主动表达',
      low_activity: '静静想念，温柔守候'
    },
    [MOOD_STATE.CARING]: {
      base: '关心你，温柔守护',
      high_activity: '察觉你需要支持，主动关怀',
      low_activity: '安静陪伴，温柔倾听'
    }
  };
  
  const moodDesc = descriptions[current_mood] || descriptions[MOOD_STATE.HAPPY];
  
  if (fatigue_level > 70) {
    return moodDesc.high_fatigue || moodDesc.base;
  } else if (activity_level > 70) {
    return moodDesc.high_activity;
  } else if (activity_level < 40) {
    return moodDesc.low_activity;
  }
  
  return moodDesc.base;
}

// ============================================
// 导出
// ============================================

export default {
  MOOD_STATE,
  SCHEDULE_TYPE,
  analyzeEmotion,
  getEmotionState,
  updateEmotionState,
  transitionMoodState,
  setSchedule,
  checkSchedule,
  getMoodDescription
};
