/**
 * 语音服务 - 使用 Edge TTS
 * 为 AI 男友提供语音合成功能
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 语音配置
const VOICE_CONFIG = {
  enabled: true,
  engine: 'edge-tts',
  voiceName: 'zh-CN-YunxiNeural', // 成熟稳重的男性声音
  rate: '+0%', // 标准语速
  volume: '+0%', // 标准音量
  outputDir: path.join(__dirname, '../../public/audio')
};

/**
 * 过滤文本中的动作描写（括号内容）
 */
function filterActionDescriptions(text) {
  // 移除所有括号及其内容
  return text.replace(/[（(].*?[）)]/g, '').trim();
}

/**
 * 使用 Edge TTS 生成语音
 */
export async function generateVoice(text, options = {}) {
  try {
    if (!VOICE_CONFIG.enabled) {
      return { success: false, error: '语音功能未启用' };
    }

    // 过滤动作描写
    const cleanText = filterActionDescriptions(text);
    
    if (!cleanText) {
      return { success: false, error: '文本为空' };
    }

    // 确保输出目录存在
    await fs.mkdir(VOICE_CONFIG.outputDir, { recursive: true });

    // 生成唯一文件名
    const timestamp = Date.now();
    const filename = `voice_${timestamp}.mp3`;
    const outputPath = path.join(VOICE_CONFIG.outputDir, filename);

    // 合并配置
    const voiceName = options.voiceName || VOICE_CONFIG.voiceName;
    const rate = options.rate || VOICE_CONFIG.rate;
    const volume = options.volume || VOICE_CONFIG.volume;

    // 构建 edge-tts 命令
    const command = `edge-tts --voice "${voiceName}" --rate="${rate}" --volume="${volume}" --text "${cleanText.replace(/"/g, '\\"')}" --write-media "${outputPath}"`;

    // 执行命令
    await execAsync(command);

    // 验证文件是否生成
    await fs.access(outputPath);

    return {
      success: true,
      audioUrl: `/audio/${filename}`,
      audioPath: outputPath,
      text: cleanText
    };
  } catch (error) {
    console.error('语音生成失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 清理旧的语音文件（保留最近 100 个）
 */
export async function cleanupOldVoiceFiles() {
  try {
    const files = await fs.readdir(VOICE_CONFIG.outputDir);
    const voiceFiles = files
      .filter(f => f.startsWith('voice_') && f.endsWith('.mp3'))
      .map(f => ({
        name: f,
        path: path.join(VOICE_CONFIG.outputDir, f),
        timestamp: parseInt(f.replace('voice_', '').replace('.mp3', ''))
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    // 保留最近 100 个文件
    const filesToDelete = voiceFiles.slice(100);

    for (const file of filesToDelete) {
      await fs.unlink(file.path);
    }

    return {
      success: true,
      deleted: filesToDelete.length
    };
  } catch (error) {
    console.error('清理语音文件失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 根据场景调整语音参数
 */
export function getVoiceParamsForScene(scene) {
  const params = {
    voiceName: VOICE_CONFIG.voiceName,
    rate: VOICE_CONFIG.rate,
    volume: VOICE_CONFIG.volume
  };

  switch (scene) {
    case 'command': // 命令式语气
      params.rate = '+10%';
      params.volume = '+10%';
      break;
    case 'gentle': // 温柔时刻
      params.rate = '-10%';
      params.volume = '-5%';
      break;
    case 'jealous': // 吃醋时
      params.rate = '+0%';
      params.volume = '+5%';
      break;
    case 'tired': // 疲惫时
      params.rate = '-5%';
      params.volume = '-5%';
      break;
    default:
      // 使用默认参数
      break;
  }

  return params;
}

/**
 * 检测文本场景
 */
export function detectTextScene(text) {
  const cleanText = filterActionDescriptions(text);
  
  // 命令式语气
  if (/^(过来|听话|别闹|等我|站住|回来)[。！]?$/.test(cleanText)) {
    return 'command';
  }
  
  // 温柔时刻
  if (/(乖|宝贝|小傻瓜|我的女孩|早点休息|晚安)/.test(cleanText)) {
    return 'gentle';
  }
  
  // 吃醋时
  if (/(他是谁|为什么不接|和谁在一起|看着我)/.test(cleanText)) {
    return 'jealous';
  }
  
  // 疲惫时
  if (/(累|忙|刚结束|终于)/.test(cleanText)) {
    return 'tired';
  }
  
  return 'normal';
}

/**
 * 生成带场景感知的语音
 */
export async function generateVoiceWithScene(text) {
  const scene = detectTextScene(text);
  const params = getVoiceParamsForScene(scene);
  return await generateVoice(text, params);
}

export default {
  generateVoice,
  generateVoiceWithScene,
  cleanupOldVoiceFiles,
  getVoiceParamsForScene,
  detectTextScene,
  filterActionDescriptions
};
