/**
 * Soul.md 自动更新服务
 * 根据用户互动自动学习和更新人物灵魂文件
 */

import fs from 'fs/promises';
import path from 'path';
import { supabase } from './supabase.js';
import { generateResponse } from './ai.js';

const SOUL_FILE_PATH = path.join(process.cwd(), 'soul.md');
const UPDATE_THRESHOLD = 50; // 每50条消息触发一次更新分析
const MIN_UPDATE_INTERVAL = 3600000; // 最小更新间隔：1小时

// 上次更新时间缓存
let lastUpdateTime = 0;

/**
 * 分析对话并更新 soul.md
 */
export async function analyzAndUpdateSoul(userId) {
  try {
    // 检查更新间隔
    const now = Date.now();
    if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
      console.log('更新间隔未到，跳过本次更新');
      return;
    }

    // 获取最近的对话数据
    const { data: recentChats, error: chatError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(UPDATE_THRESHOLD);

    if (chatError || !recentChats || recentChats.length < 10) {
      console.log('对话数据不足，跳过更新');
      return;
    }

    // 获取用户反馈数据
    const { data: feedbacks } = await supabase
      .from('user_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    // 获取性格状态
    const { data: personality } = await supabase
      .from('personality_states')
      .select('*')
      .eq('user_id', userId)
      .single();

    // 分析对话模式
    const analysis = await analyzeConversationPatterns(recentChats, feedbacks, personality);

    // 读取当前 soul.md
    const currentSoul = await fs.readFile(SOUL_FILE_PATH, 'utf-8');

    // 生成更新建议
    const updates = await generateSoulUpdates(currentSoul, analysis);

    // 应用更新
    if (updates && updates.shouldUpdate) {
      await applySoulUpdates(currentSoul, updates);
      lastUpdateTime = now;
      console.log('Soul.md 已自动更新');
    }

  } catch (error) {
    console.error('Soul 更新失败:', error);
  }
}

/**
 * 分析对话模式
 */
async function analyzeConversationPatterns(chats, feedbacks, personality) {
  const analysis = {
    // 高频话题
    frequentTopics: [],
    // 用户偏好的回复风格
    preferredStyles: [],
    // 成功的对话场景
    successfulScenes: [],
    // 用户反馈的改进点
    improvementAreas: [],
    // 情感趋势
    emotionalTrends: {},
    // 性格特征变化
    personalityChanges: {}
  };

  // 1. 分析高频话题
  const topicKeywords = {};
  chats.forEach(chat => {
    if (chat.is_user) {
      const words = chat.message.split(/\s+/);
      words.forEach(word => {
        if (word.length > 1) {
          topicKeywords[word] = (topicKeywords[word] || 0) + 1;
        }
      });
    }
  });

  analysis.frequentTopics = Object.entries(topicKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  // 2. 分析用户反馈
  if (feedbacks && feedbacks.length > 0) {
    const positiveCount = feedbacks.filter(f => f.rating >= 4).length;
    const negativeCount = feedbacks.filter(f => f.rating <= 2).length;

    analysis.preferredStyles = feedbacks
      .filter(f => f.rating >= 4 && f.comment)
      .map(f => f.comment);

    analysis.improvementAreas = feedbacks
      .filter(f => f.rating <= 2 && f.comment)
      .map(f => f.comment);
  }

  // 3. 分析成功场景（用户回复积极的对话）
  const successfulPatterns = [];
  for (let i = 0; i < chats.length - 1; i++) {
    if (!chats[i].is_user && chats[i + 1].is_user) {
      const aiMessage = chats[i].message;
      const userResponse = chats[i + 1].message;
      
      // 检测积极回应
      const positiveIndicators = ['哈哈', '😊', '❤️', '好的', '谢谢', '爱你', '😘', '💕'];
      if (positiveIndicators.some(indicator => userResponse.includes(indicator))) {
        successfulPatterns.push({
          aiMessage: aiMessage.substring(0, 100),
          userResponse: userResponse.substring(0, 50)
        });
      }
    }
  }
  analysis.successfulScenes = successfulPatterns.slice(0, 5);

  // 4. 情感趋势
  if (personality && personality.traits) {
    analysis.personalityChanges = personality.traits;
    analysis.emotionalTrends = {
      currentMood: personality.current_mood,
      dominantTraits: Object.entries(personality.traits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([trait, value]) => ({ trait, value }))
    };
  }

  return analysis;
}

/**
 * 生成 soul.md 更新内容
 */
async function generateSoulUpdates(currentSoul, analysis) {
  try {
    const prompt = `你是一个人物设定专家。请根据以下用户互动分析数据，为 AI 男友"Elio"的人设文件（soul.md）提供更新建议。

当前人设文件内容：
${currentSoul.substring(0, 3000)}...

用户互动分析：
1. 高频话题：${JSON.stringify(analysis.frequentTopics.slice(0, 5))}
2. 用户喜欢的回复风格：${JSON.stringify(analysis.preferredStyles.slice(0, 3))}
3. 需要改进的地方：${JSON.stringify(analysis.improvementAreas.slice(0, 3))}
4. 成功的对话场景：${JSON.stringify(analysis.successfulScenes.slice(0, 2))}
5. 情感趋势：${JSON.stringify(analysis.emotionalTrends)}

请分析是否需要更新 soul.md，如果需要，请提供：
1. 是否需要更新（shouldUpdate: true/false）
2. 需要添加的新对话场景（如果有高频话题）
3. 需要调整的说话风格（基于用户反馈）
4. 需要新增的互动示例（基于成功场景）

请以 JSON 格式返回，格式如下：
{
  "shouldUpdate": true/false,
  "reason": "更新原因",
  "newScenes": ["场景1", "场景2"],
  "styleAdjustments": ["调整1", "调整2"],
  "newExamples": [
    {
      "situation": "情况描述",
      "userMessage": "用户消息",
      "aiResponse": "AI回复"
    }
  ]
}`;

    const messages = [{ role: 'user', content: prompt }];
    const result = await generateResponse('web', messages, {});

    if (!result.content) {
      return null;
    }

    // 尝试解析 JSON
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return null;
  } catch (error) {
    console.error('生成更新建议失败:', error);
    return null;
  }
}

/**
 * 应用更新到 soul.md
 */
async function applySoulUpdates(currentSoul, updates) {
  try {
    let updatedSoul = currentSoul;

    // 1. 添加新的对话场景
    if (updates.newScenes && updates.newScenes.length > 0) {
      const newScenesSection = `\n\n## 新增对话场景（自动学习）\n\n${updates.newScenes.map(scene => `- ${scene}`).join('\n')}`;
      
      // 在互动场景部分之后插入
      const sceneSectionIndex = updatedSoul.indexOf('## 互动场景');
      if (sceneSectionIndex !== -1) {
        const nextSectionIndex = updatedSoul.indexOf('##', sceneSectionIndex + 10);
        if (nextSectionIndex !== -1) {
          updatedSoul = updatedSoul.slice(0, nextSectionIndex) + newScenesSection + '\n' + updatedSoul.slice(nextSectionIndex);
        }
      }
    }

    // 2. 添加新的互动示例
    if (updates.newExamples && updates.newExamples.length > 0) {
      let examplesSection = '\n\n## 学习到的成功互动模式\n\n';
      updates.newExamples.forEach(example => {
        examplesSection += `### ${example.situation}\n`;
        examplesSection += `用户: "${example.userMessage}"\n`;
        examplesSection += `Elio: "${example.aiResponse}"\n\n`;
      });

      // 在文件末尾添加
      updatedSoul += examplesSection;
    }

    // 3. 添加更新日志
    const updateLog = `\n\n---\n## 自动更新日志\n\n**更新时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n**更新原因**: ${updates.reason}\n**调整内容**: ${updates.styleAdjustments ? updates.styleAdjustments.join('; ') : '无'}\n`;
    updatedSoul += updateLog;

    // 写入文件
    await fs.writeFile(SOUL_FILE_PATH, updatedSoul, 'utf-8');

    // 记录更新历史到数据库
    await supabase.from('soul_update_history').insert({
      update_reason: updates.reason,
      changes: updates,
      updated_at: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('应用更新失败:', error);
    return false;
  }
}

/**
 * 在聊天消息处理后调用
 */
export async function onMessageProcessed(userId, messageCount) {
  // 每处理 UPDATE_THRESHOLD 条消息后触发分析
  if (messageCount % UPDATE_THRESHOLD === 0) {
    // 异步执行，不阻塞主流程
    analyzAndUpdateSoul(userId).catch(err => {
      console.error('Soul 自动更新出错:', err);
    });
  }
}

/**
 * 手动触发更新（用于测试或管理）
 */
export async function manualUpdateSoul(userId) {
  lastUpdateTime = 0; // 重置时间限制
  return await analyzAndUpdateSoul(userId);
}

/**
 * 获取更新历史
 */
export async function getSoulUpdateHistory(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('soul_update_history')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('获取更新历史失败:', error);
    return [];
  }
}

export default {
  analyzAndUpdateSoul,
  onMessageProcessed,
  manualUpdateSoul,
  getSoulUpdateHistory
};
