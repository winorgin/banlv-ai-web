-- ============================================
-- 系统优化数据库迁移
-- 支持分层记忆、情绪状态机、主动交互功能
-- ============================================

-- 1. 创建记忆表 (Memories Table)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- fact, preference, event, emotion, relationship
  content JSONB NOT NULL, -- 记忆内容（可以是字符串或对象）
  importance INTEGER NOT NULL DEFAULT 2, -- 1-4: low, medium, high, critical
  emotional_tag VARCHAR(50), -- 情感标签
  related_topics TEXT[], -- 相关话题数组
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为记忆表创建索引
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_emotional_tag ON memories(emotional_tag);
CREATE INDEX IF NOT EXISTS idx_memories_related_topics ON memories USING GIN(related_topics);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

-- 2. 创建情绪状态表 (Emotion States Table)
CREATE TABLE IF NOT EXISTS emotion_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_mood VARCHAR(50) NOT NULL DEFAULT 'happy', -- happy, tired, focused, missing, caring
  fatigue_level INTEGER NOT NULL DEFAULT 0, -- 0-100
  warmth_level INTEGER NOT NULL DEFAULT 80, -- 70-100 (永远保持高位)
  activity_level INTEGER NOT NULL DEFAULT 70, -- 0-100
  current_schedule VARCHAR(50), -- workout, work, meal, leisure, sleep
  schedule_end_time TIMESTAMP WITH TIME ZONE,
  last_mood_change TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  mood_history JSONB DEFAULT '[]', -- 情绪历史记录
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为情绪状态表创建索引
CREATE INDEX IF NOT EXISTS idx_emotion_states_user_id ON emotion_states(user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_states_current_mood ON emotion_states(current_mood);

-- 3. 为消息表添加主动交互相关字段
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS is_proactive BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS trigger_context TEXT;

-- 为消息表创建主动交互索引
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_proactive ON chat_messages(is_proactive);
CREATE INDEX IF NOT EXISTS idx_chat_messages_trigger_type ON chat_messages(trigger_type);

-- 4. 创建更新时间戳的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 为记忆表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. 为情绪状态表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_emotion_states_updated_at ON emotion_states;
CREATE TRIGGER update_emotion_states_updated_at
  BEFORE UPDATE ON emotion_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. 创建记忆清理函数（可选，用于定期清理低重要性的旧记忆）
CREATE OR REPLACE FUNCTION cleanup_old_memories()
RETURNS void AS $$
BEGIN
  -- 删除90天前的低重要性记忆
  DELETE FROM memories
  WHERE importance = 1
    AND created_at < NOW() - INTERVAL '90 days';
  
  -- 删除180天前的中等重要性记忆
  DELETE FROM memories
  WHERE importance = 2
    AND created_at < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql;

-- 8. 创建视图：用户记忆摘要
CREATE OR REPLACE VIEW user_memory_summary AS
SELECT 
  user_id,
  COUNT(*) as total_memories,
  COUNT(*) FILTER (WHERE type = 'fact') as fact_count,
  COUNT(*) FILTER (WHERE type = 'preference') as preference_count,
  COUNT(*) FILTER (WHERE type = 'event') as event_count,
  COUNT(*) FILTER (WHERE type = 'emotion') as emotion_count,
  COUNT(*) FILTER (WHERE importance >= 3) as important_memories,
  MAX(created_at) as last_memory_created
FROM memories
GROUP BY user_id;

-- 9. 创建视图：主动消息统计
CREATE OR REPLACE VIEW proactive_message_stats AS
SELECT 
  user_id,
  COUNT(*) as total_proactive_messages,
  COUNT(*) FILTER (WHERE trigger_type = 'time_based') as time_based_count,
  COUNT(*) FILTER (WHERE trigger_type = 'interval_based') as interval_based_count,
  COUNT(*) FILTER (WHERE trigger_type = 'mood_based') as mood_based_count,
  COUNT(*) FILTER (WHERE trigger_type = 'memory_based') as memory_based_count,
  MAX(created_at) as last_proactive_message
FROM chat_messages
WHERE is_proactive = TRUE
GROUP BY user_id;

-- 10. 插入示例数据（可选，用于测试）
-- 注意：实际使用时应该删除或注释掉这部分

-- 示例：为测试用户创建初始情绪状态
-- INSERT INTO emotion_states (user_id, current_mood, fatigue_level, warmth_level, activity_level)
-- SELECT id, 'happy', 0, 80, 70
-- FROM users
-- WHERE email = 'test@example.com'
-- ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 迁移完成说明
-- ============================================

-- 此迁移添加了以下功能：
-- 1. 分层记忆系统 (memories 表)
--    - 支持多种记忆类型（事实、偏好、事件、情感、关系）
--    - 记忆重要性分级
--    - 情感标签和相关话题
--    - 高效的索引支持快速检索

-- 2. 情绪状态机 (emotion_states 表)
--    - 5种情绪状态（happy, tired, focused, missing, caring）
--    - 疲劳度、温柔度、活跃度追踪
--    - 虚拟行程管理
--    - 情绪历史记录

-- 3. 主动交互支持 (messages 表扩展)
--    - 标记主动发起的消息
--    - 记录触发类型和上下文
--    - 支持多种触发机制

-- 4. 辅助功能
--    - 自动更新时间戳
--    - 记忆清理函数
--    - 统计视图

-- 使用方法：
-- psql -U your_username -d your_database -f system-optimization-migration.sql

COMMENT ON TABLE memories IS '分层记忆系统：存储用户相关的事实、偏好、事件、情感等记忆';
COMMENT ON TABLE emotion_states IS '情绪状态机：追踪 Elio 的情绪状态、疲劳度、活跃度等';
COMMENT ON COLUMN chat_messages.is_proactive IS '标记是否为主动发起的消息';
COMMENT ON COLUMN chat_messages.trigger_type IS '主动消息的触发类型';
