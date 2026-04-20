import { supabase } from './supabase.js';

/**
 * Elio 性格特征系统
 * 基于 base.md 的 Elio 人设
 */

// 更新性格特征（Elio 版本）
export async function updatePersonality(userId, emotion, messageContent) {
  try {
    // 获取当前性格状态
    const { data: personality, error: fetchError } = await supabase
      .from('personality_states')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Elio 性格特征：愉悦度、关怀度、玩心、严肃度、浪漫度
    let traits = personality?.traits || {
      cheerful: 0.6,    // 愉悦度：影响温暖和积极性（Elio 较为平和愉快）
      caring: 0.7,      // 关怀度：关心和支持程度（初始较高，成熟关怀）
      playful: 0.5,     // 玩心：调侃和幽默（Elio 有适度的玩味感）
      serious: 0.5,     // 严肃度：专注和直接程度（平衡状态）
      romantic: 0.4     // 浪漫度：情感表达（逐步发展）
    };
    
    // 根据情感调整性格特征（Elio 视角）
    const adjustmentRate = 0.02; // 每次调整2%
    
    // 积极情绪：Elio 会更加温暖和放松
    if (emotion.sentiment === 'positive') {
      traits.cheerful = Math.min(1, traits.cheerful + adjustmentRate);
      traits.caring = Math.min(1, traits.caring + adjustmentRate * 0.5);
      traits.playful = Math.min(0.8, traits.playful + adjustmentRate * 0.3);
    }
    
    // 悲伤情绪：Elio 会更加关心和支持
    if (emotion.primary === 'sad') {
      traits.caring = Math.min(1, traits.caring + adjustmentRate * 1.5);
      traits.romantic = Math.min(1, traits.romantic + adjustmentRate * 0.5);
      traits.playful = Math.max(0.2, traits.playful - adjustmentRate * 0.5);
      traits.serious = Math.min(0.8, traits.serious + adjustmentRate * 0.3);
    }
    
    // 长消息：说明对方在分享，Elio 会认真倾听
    if (messageContent.length > 100) {
      traits.caring = Math.min(1, traits.caring + adjustmentRate * 0.5);
      traits.serious = Math.min(0.8, traits.serious + adjustmentRate * 0.2);
    }
    
    // 兴奋情绪：Elio 会展现更多活力和热情
    if (emotion.primary === 'excited') {
      traits.cheerful = Math.min(1, traits.cheerful + adjustmentRate);
      traits.playful = Math.min(0.8, traits.playful + adjustmentRate * 0.5);
    }
    
    // 检测浪漫相关内容：Elio 的浪漫度提升
    const romanticKeywords = ['love', 'like', 'miss', 'kiss', 'hug', '💕', '❤️', '😘', 'babe', 'honey', '爱', '喜欢', '想你'];
    if (romanticKeywords.some(keyword => messageContent.toLowerCase().includes(keyword.toLowerCase()))) {
      traits.romantic = Math.min(1, traits.romantic + adjustmentRate * 1.5);
      traits.caring = Math.min(1, traits.caring + adjustmentRate);
      traits.playful = Math.min(0.8, traits.playful + adjustmentRate * 0.3);
    }
    
    // 检测调侃/玩笑内容：Elio 会回应得更有趣
    const playfulKeywords = ['haha', 'lol', 'funny', 'joke', '哈哈', '笑', '有趣'];
    if (playfulKeywords.some(keyword => messageContent.toLowerCase().includes(keyword.toLowerCase()))) {
      traits.playful = Math.min(0.8, traits.playful + adjustmentRate);
      traits.cheerful = Math.min(1, traits.cheerful + adjustmentRate * 0.5);
    }
    
    // 检测工作/投资相关：Elio 会展现专业的一面
    const workKeywords = ['work', 'job', 'project', 'busy', 'investment', 'market', '工作', '项目', '忙', '投资'];
    if (workKeywords.some(keyword => messageContent.toLowerCase().includes(keyword.toLowerCase()))) {
      traits.serious = Math.min(0.8, traits.serious + adjustmentRate * 0.5);
      traits.caring = Math.min(1, traits.caring + adjustmentRate);
    }
    
    // 检测健身/运动相关：Elio 的兴趣领域
    const fitnessKeywords = ['gym', 'workout', 'exercise', 'run', 'fitness', '健身', '运动', '跑步'];
    if (fitnessKeywords.some(keyword => messageContent.toLowerCase().includes(keyword.toLowerCase()))) {
      traits.cheerful = Math.min(1, traits.cheerful + adjustmentRate * 0.5);
      traits.playful = Math.min(0.8, traits.playful + adjustmentRate * 0.3);
    }
    
    // 保持 Elio 特质的边界
    // 关怀度保持较高（最低50%），体现成熟关怀
    traits.caring = Math.max(0.5, traits.caring);
    // 愉悦度保持适度（最低40%），体现平和心态
    traits.cheerful = Math.max(0.4, traits.cheerful);
    // 玩心保持适度（最高80%），不过度轻浮
    traits.playful = Math.min(0.8, traits.playful);
    // 严肃度保持平衡（30%-80%），不过度严肃或轻浮
    traits.serious = Math.max(0.3, Math.min(0.8, traits.serious));
    
    // 保存或更新性格状态
    if (personality) {
      await supabase
        .from('personality_states')
        .update({
          traits,
          current_mood: emotion.primary,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    } else {
      await supabase
        .from('personality_states')
        .insert({
          user_id: userId,
          traits,
          current_mood: emotion.primary
        });
    }
    
    return traits;
  } catch (error) {
    console.error('Update personality error:', error);
    return null;
  }
}

// 获取性格状态
export async function getPersonalityState(userId) {
  try {
    const { data, error } = await supabase
      .from('personality_states')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get personality error:', error);
    return null;
  }
}
