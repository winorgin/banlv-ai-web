-- ============================================
-- AI Boyfriend 统一数据库架构
-- 支持 Web 和 Discord 双平台
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 统一用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  platform_user_id TEXT,
  avatar_url TEXT,
  dol_balance INTEGER DEFAULT 0,
  intimacy INTEGER DEFAULT 0,
  intimacy_level INTEGER DEFAULT 0,
  relationship_stage TEXT DEFAULT '密友',
  total_messages INTEGER DEFAULT 0,
  current_mood TEXT DEFAULT 'happy',
  personality_traits JSONB DEFAULT '{"cheerful":0.5,"caring":0.5,"playful":0.5,"serious":0.5,"romantic":0.5}'::jsonb,
  preferred_language TEXT DEFAULT 'zh',
  preferences JSONB DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(username, platform)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
CREATE INDEX IF NOT EXISTS idx_users_relationship_stage ON users(relationship_stage);

-- ============================================
-- 平台账号绑定表
-- ============================================
CREATE TABLE IF NOT EXISTS user_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  is_primary BOOLEAN DEFAULT false,
  bound_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_platforms_user_id ON user_platforms(user_id);
CREATE INDEX IF NOT EXISTS idx_user_platforms_platform ON user_platforms(platform, platform_user_id);

-- ============================================
-- 聊天消息表
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'web',
  session_id UUID,
  message TEXT NOT NULL,
  reply TEXT,
  voice_url TEXT,
  intimacy_change INTEGER DEFAULT 0,
  user_emotion TEXT,
  ai_mood TEXT,
  is_user BOOLEAN NOT NULL DEFAULT TRUE,
  emotion TEXT,
  emotion_score DECIMAL(3,2),
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_platform ON chat_messages(platform);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- ============================================
-- 会话表
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  session_data JSONB DEFAULT '{}'::jsonb,
  conversation_history JSONB DEFAULT '[]'::jsonb,
  context_summary TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions(platform);
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active DESC);

-- ============================================
-- 关系状态表
-- ============================================
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  intimacy_points INTEGER DEFAULT 0,
  relationship_stage TEXT DEFAULT 'close_friend',
  last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  interaction_count INTEGER DEFAULT 0,
  positive_interactions INTEGER DEFAULT 0,
  negative_interactions INTEGER DEFAULT 0,
  special_moments JSONB DEFAULT '[]'::jsonb,
  milestones JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_user_id ON relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_stage ON relationships(relationship_stage);
CREATE INDEX IF NOT EXISTS idx_relationships_intimacy ON relationships(intimacy_points DESC);

-- ============================================
-- 灵魂记忆表
-- ============================================
CREATE TABLE IF NOT EXISTS soul_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 2,
  context TEXT,
  emotional_weight DECIMAL(3,2) DEFAULT 0.5,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  platform TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_soul_memories_user_id ON soul_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_soul_memories_type ON soul_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_soul_memories_importance ON soul_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_soul_memories_last_accessed_at ON soul_memories(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_soul_memories_tags ON soul_memories USING GIN(tags);

-- ============================================
-- 情绪历史表
-- ============================================
CREATE TABLE IF NOT EXISTS mood_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mood_history_user_id ON mood_history(user_id);
CREATE INDEX IF NOT EXISTS idx_mood_history_created_at ON mood_history(created_at DESC);

-- ============================================
-- 性格状态表
-- ============================================
CREATE TABLE IF NOT EXISTS personality_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  personality_traits JSONB NOT NULL DEFAULT '{
    "openness": 0.7,
    "conscientiousness": 0.6,
    "extraversion": 0.8,
    "agreeableness": 0.9,
    "neuroticism": 0.3
  }'::jsonb,
  adjustments JSONB DEFAULT '{}'::jsonb,
  mood_state TEXT DEFAULT 'neutral',
  energy_level INTEGER DEFAULT 50,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_personality_states_user_id ON personality_states(user_id);
CREATE INDEX IF NOT EXISTS idx_personality_states_mood ON personality_states(mood_state);

-- ============================================
-- 支付记录表
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  dol_amount INTEGER NOT NULL,
  payment_method TEXT DEFAULT 'creem',
  transaction_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_platform ON payments(platform);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

-- ============================================
-- 每日 DOL 重置记录表
-- ============================================
CREATE TABLE IF NOT EXISTS daily_dol_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reset_date DATE NOT NULL,
  dol_granted INTEGER DEFAULT 10,
  platform TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, reset_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_resets_user_id ON daily_dol_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_resets_date ON daily_dol_resets(reset_date DESC);

-- ============================================
-- 用户等级表
-- ============================================
CREATE TABLE IF NOT EXISTS user_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  next_level_xp INTEGER DEFAULT 100,
  total_spent DECIMAL(10,2) DEFAULT 0,
  achievements JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_levels_user_id ON user_levels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC);

-- ============================================
-- 冷却时间表
-- ============================================
CREATE TABLE IF NOT EXISTS cooldowns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  platform TEXT,
  cooldown_until TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, action_type, platform)
);

CREATE INDEX IF NOT EXISTS idx_cooldowns_user_id ON cooldowns(user_id);
CREATE INDEX IF NOT EXISTS idx_cooldowns_action_type ON cooldowns(action_type);
CREATE INDEX IF NOT EXISTS idx_cooldowns_until ON cooldowns(cooldown_until);

-- ============================================
-- 上下文摘要表
-- ============================================
CREATE TABLE IF NOT EXISTS context_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT,
  summary_text TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_summaries_user_id ON context_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_context_summaries_platform ON context_summaries(platform);
CREATE INDEX IF NOT EXISTS idx_context_summaries_created_at ON context_summaries(created_at DESC);

-- ============================================
-- 主动聊天记录表
-- ============================================
CREATE TABLE IF NOT EXISTS proactive_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  message TEXT NOT NULL,
  trigger_type TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proactive_chats_user_id ON proactive_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_proactive_chats_platform ON proactive_chats(platform);
CREATE INDEX IF NOT EXISTS idx_proactive_chats_created_at ON proactive_chats(created_at DESC);

-- ============================================
-- 生成图片表
-- ============================================
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_images_user_id ON generated_images(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_platform ON generated_images(platform);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at DESC);

-- ============================================
-- 系统配置表
-- ============================================
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_relationships_updated_at ON relationships;
CREATE TRIGGER update_relationships_updated_at BEFORE UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_personality_states_updated_at ON personality_states;
CREATE TRIGGER update_personality_states_updated_at BEFORE UPDATE ON personality_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_levels_updated_at ON user_levels;
CREATE TRIGGER update_user_levels_updated_at BEFORE UPDATE ON user_levels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_config_updated_at ON system_config;
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 触发器：更新会话最后活跃时间
-- ============================================
CREATE OR REPLACE FUNCTION update_session_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sessions 
  SET last_active = NOW() 
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_session_on_message ON chat_messages;
CREATE TRIGGER update_session_on_message AFTER INSERT ON chat_messages
  FOR EACH ROW 
  WHEN (NEW.session_id IS NOT NULL)
  EXECUTE FUNCTION update_session_last_active();

-- ============================================
-- 行级安全策略 (RLS)
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE soul_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE personality_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_dol_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooldowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- 服务角色完全访问策略
DROP POLICY IF EXISTS "Service role full access" ON users;
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON user_platforms;
CREATE POLICY "Service role full access" ON user_platforms FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON chat_messages;
CREATE POLICY "Service role full access" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON sessions;
CREATE POLICY "Service role full access" ON sessions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON relationships;
CREATE POLICY "Service role full access" ON relationships FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON soul_memories;
CREATE POLICY "Service role full access" ON soul_memories FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON mood_history;
CREATE POLICY "Service role full access" ON mood_history FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON personality_states;
CREATE POLICY "Service role full access" ON personality_states FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON payments;
CREATE POLICY "Service role full access" ON payments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON daily_dol_resets;
CREATE POLICY "Service role full access" ON daily_dol_resets FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON user_levels;
CREATE POLICY "Service role full access" ON user_levels FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON cooldowns;
CREATE POLICY "Service role full access" ON cooldowns FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON context_summaries;
CREATE POLICY "Service role full access" ON context_summaries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON proactive_chats;
CREATE POLICY "Service role full access" ON proactive_chats FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON generated_images;
CREATE POLICY "Service role full access" ON generated_images FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON system_config;
CREATE POLICY "Service role full access" ON system_config FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 初始化系统配置
-- ============================================
INSERT INTO system_config (config_key, config_value, description) VALUES
  ('daily_dol_amount', '10', '每日免费 DOL 数量'),
  ('dol_per_message', '1', '每条消息消耗的 DOL'),
  ('intimacy_per_message', '1', '每条消息增加的亲密度'),
  ('payment_rates', '{"100": 10, "500": 50, "1000": 100}', '充值档位配置'),
  ('relationship_stages', '{"密友": 0, "恋人": 500, "灵魂伴侣": 1000}', '关系阶段亲密度要求')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================
-- 视图：用户完整统计
-- ============================================
DROP VIEW IF EXISTS user_full_stats;
CREATE OR REPLACE VIEW user_full_stats AS
SELECT 
  u.id,
  u.email,
  u.username,
  u.platform,
  u.dol_balance,
  COALESCE(u.intimacy, u.intimacy_level, 0) as intimacy,
  u.relationship_stage,
  u.total_messages,
  r.intimacy_points,
  r.interaction_count,
  r.positive_interactions,
  r.negative_interactions,
  ul.level,
  ul.experience_points,
  COALESCE(u.current_mood, ps.mood_state, 'happy') as current_mood,
  ps.energy_level,
  COUNT(DISTINCT up.id) as platform_count,
  COUNT(DISTINCT cm.id) as total_chat_messages,
  COUNT(DISTINCT p.id) as total_payments,
  COALESCE(SUM(p.amount), 0) as total_spent,
  u.created_at,
  u.updated_at
FROM users u
LEFT JOIN relationships r ON u.id = r.user_id
LEFT JOIN user_levels ul ON u.id = ul.user_id
LEFT JOIN personality_states ps ON u.id = ps.user_id
LEFT JOIN user_platforms up ON u.id = up.user_id
LEFT JOIN chat_messages cm ON u.id = cm.user_id
LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'completed'
GROUP BY u.id, r.intimacy_points, r.interaction_count, r.positive_interactions, 
         r.negative_interactions, ul.level, ul.experience_points, ps.mood_state, ps.energy_level;

-- ============================================
-- 函数：获取用户跨平台信息
-- ============================================
CREATE OR REPLACE FUNCTION get_user_cross_platform(p_platform TEXT, p_platform_user_id TEXT)
RETURNS TABLE (
  user_info JSONB,
  platforms JSONB,
  relationship_info JSONB,
  personality_info JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    row_to_json(u.*)::jsonb as user_info,
    (
      SELECT jsonb_agg(row_to_json(up.*))
      FROM user_platforms up
      WHERE up.user_id = u.id
    ) as platforms,
    row_to_json(r.*)::jsonb as relationship_info,
    row_to_json(ps.*)::jsonb as personality_info
  FROM users u
  LEFT JOIN user_platforms up_main ON u.id = up_main.user_id 
    AND up_main.platform = p_platform 
    AND up_main.platform_user_id = p_platform_user_id
  LEFT JOIN relationships r ON u.id = r.user_id
  LEFT JOIN personality_states ps ON u.id = ps.user_id
  WHERE up_main.id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：清理过期数据
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- 清理过期的冷却时间
  DELETE FROM cooldowns WHERE cooldown_until < NOW();
  
  -- 清理超过30天的旧会话
  DELETE FROM sessions 
  WHERE last_active < NOW() - INTERVAL '30 days'
    AND id NOT IN (
      SELECT DISTINCT session_id 
      FROM chat_messages 
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND session_id IS NOT NULL
    );
  
  -- 清理超过90天的聊天记录（保留重要对话）
  DELETE FROM chat_messages 
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND emotion NOT IN ('love', 'joy', 'surprise');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Soul 更新历史表
-- ============================================
CREATE TABLE IF NOT EXISTS soul_update_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  update_reason TEXT NOT NULL,
  changes JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soul_update_history_updated_at ON soul_update_history(updated_at DESC);

-- ============================================
-- 用户反馈表
-- ============================================
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  feedback_type TEXT,
  related_message_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating ON user_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);

-- 启用 RLS
ALTER TABLE soul_update_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- 服务角色完全访问策略
DROP POLICY IF EXISTS "Service role full access" ON soul_update_history;
CREATE POLICY "Service role full access" ON soul_update_history FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON user_feedback;
CREATE POLICY "Service role full access" ON user_feedback FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 完成
-- ============================================
COMMENT ON TABLE users IS '统一用户表 - 支持多平台';
COMMENT ON TABLE user_platforms IS '平台账号绑定表';
COMMENT ON TABLE chat_messages IS '跨平台聊天消息表';
COMMENT ON TABLE sessions IS '跨平台会话表';
COMMENT ON TABLE relationships IS '用户关系状态表';
COMMENT ON TABLE soul_memories IS '灵魂记忆表';
COMMENT ON TABLE personality_states IS '性格状态表';
COMMENT ON TABLE payments IS '支付记录表';
COMMENT ON TABLE daily_dol_resets IS '每日 DOL 重置记录表';
COMMENT ON TABLE user_levels IS '用户等级表';
COMMENT ON TABLE cooldowns IS '冷却时间表';
COMMENT ON TABLE context_summaries IS '上下文摘要表';
COMMENT ON TABLE proactive_chats IS '主动聊天记录表';
COMMENT ON TABLE generated_images IS '生成图片表';
COMMENT ON TABLE system_config IS '系统配置表';
COMMENT ON TABLE soul_update_history IS 'Soul.md 自动更新历史表';
COMMENT ON TABLE user_feedback IS '用户反馈表';
