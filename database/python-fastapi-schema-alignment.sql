-- ============================================
-- Python/FastAPI 运行时数据库对齐迁移
-- 用于将旧 unified-schema 结构补齐到当前 app/** 的字段约定
-- ============================================

BEGIN;

-- ============================================
-- users 表：补齐 Python 运行时依赖字段
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE users ALTER COLUMN platform SET DEFAULT 'web';

UPDATE users u
SET platform = source.platform
FROM (
  SELECT DISTINCT ON (user_id)
    user_id,
    platform
  FROM user_platforms
  ORDER BY user_id, is_primary DESC, bound_at ASC
) AS source
WHERE u.id = source.user_id
  AND (u.platform IS NULL OR u.platform = '');

UPDATE users
SET platform = 'web'
WHERE platform IS NULL OR platform = '';

ALTER TABLE users ADD COLUMN IF NOT EXISTS intimacy INTEGER;
UPDATE users
SET intimacy = COALESCE(intimacy, intimacy_level, 0)
WHERE intimacy IS NULL;
ALTER TABLE users ALTER COLUMN intimacy SET DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_mood TEXT;
UPDATE users
SET current_mood = 'happy'
WHERE current_mood IS NULL OR current_mood = '';
ALTER TABLE users ALTER COLUMN current_mood SET DEFAULT 'happy';

ALTER TABLE users ADD COLUMN IF NOT EXISTS personality_traits JSONB;
UPDATE users
SET personality_traits = COALESCE(
  personality_traits,
  CASE
    WHEN jsonb_typeof(preferences) = 'object' THEN preferences -> 'personality_traits'
    ELSE NULL
  END,
  '{"cheerful":0.5,"caring":0.5,"playful":0.5,"serious":0.5,"romantic":0.5}'::jsonb
)
WHERE personality_traits IS NULL;
ALTER TABLE users ALTER COLUMN personality_traits SET DEFAULT '{"cheerful":0.5,"caring":0.5,"playful":0.5,"serious":0.5,"romantic":0.5}'::jsonb;

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT;
UPDATE users
SET preferred_language = COALESCE(
  preferred_language,
  NULLIF(preferences ->> 'preferred_language', ''),
  'zh'
)
WHERE preferred_language IS NULL OR preferred_language = '';
ALTER TABLE users ALTER COLUMN preferred_language SET DEFAULT 'zh';

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;

UPDATE users
SET relationship_stage = CASE relationship_stage
  WHEN 'stranger' THEN '密友'
  WHEN 'friend' THEN '密友'
  WHEN 'close_friend' THEN '密友'
  WHEN 'lover' THEN '恋人'
  WHEN 'soulmate' THEN '灵魂伴侣'
  WHEN '密友' THEN '密友'
  WHEN '恋人' THEN '恋人'
  WHEN '灵魂伴侣' THEN '灵魂伴侣'
  ELSE COALESCE(relationship_stage, '密友')
END;
ALTER TABLE users ALTER COLUMN relationship_stage SET DEFAULT '密友';

CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
CREATE INDEX IF NOT EXISTS idx_users_username_platform ON users(username, platform);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_users_username_platform_unique'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM users
      GROUP BY username, platform
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX idx_users_username_platform_unique ON users(username, platform);
    ELSE
      RAISE NOTICE '跳过 users(username, platform) 唯一索引：现有数据存在重复用户名';
    END IF;
  END IF;
END $$;

-- ============================================
-- chat_messages 表：补齐 Python 聊天接口字段
-- ============================================
ALTER TABLE chat_messages ALTER COLUMN platform SET DEFAULT 'web';
UPDATE chat_messages
SET platform = 'web'
WHERE platform IS NULL OR platform = '';

ALTER TABLE chat_messages ALTER COLUMN is_user SET DEFAULT TRUE;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS voice_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS intimacy_change INTEGER;
UPDATE chat_messages
SET intimacy_change = 0
WHERE intimacy_change IS NULL;
ALTER TABLE chat_messages ALTER COLUMN intimacy_change SET DEFAULT 0;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_emotion TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS ai_mood TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);

-- ============================================
-- soul_memories 表：补齐 Python 记忆服务字段
-- ============================================
ALTER TABLE soul_memories ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE soul_memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE;

UPDATE soul_memories
SET last_accessed_at = COALESCE(last_accessed_at, accessed_at, created_at, NOW())
WHERE last_accessed_at IS NULL;

ALTER TABLE soul_memories ALTER COLUMN importance SET DEFAULT 2;
CREATE INDEX IF NOT EXISTS idx_soul_memories_last_accessed_at ON soul_memories(last_accessed_at DESC);

-- ============================================
-- mood_history 表：当前 Python 情绪服务依赖
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

ALTER TABLE mood_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mood_history'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON mood_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;