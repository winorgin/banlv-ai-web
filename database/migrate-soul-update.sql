-- ============================================
-- Soul 自动更新系统数据库迁移脚本
-- 执行此脚本以添加必要的数据表
-- ============================================

-- 检查并创建 soul_update_history 表
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'soul_update_history') THEN
        CREATE TABLE soul_update_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          update_reason TEXT NOT NULL,
          changes JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX idx_soul_update_history_updated_at ON soul_update_history(updated_at DESC);
        
        ALTER TABLE soul_update_history ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Service role full access" ON soul_update_history FOR ALL USING (true) WITH CHECK (true);
        
        COMMENT ON TABLE soul_update_history IS 'Soul.md 自动更新历史表';
        
        RAISE NOTICE 'Table soul_update_history created successfully';
    ELSE
        RAISE NOTICE 'Table soul_update_history already exists';
    END IF;
END $$;

-- 检查并创建 user_feedback 表
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_feedback') THEN
        CREATE TABLE user_feedback (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          platform TEXT,
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          feedback_type TEXT,
          related_message_id UUID,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);
        CREATE INDEX idx_user_feedback_rating ON user_feedback(rating);
        CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at DESC);
        
        ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Service role full access" ON user_feedback FOR ALL USING (true) WITH CHECK (true);
        
        COMMENT ON TABLE user_feedback IS '用户反馈表';
        
        RAISE NOTICE 'Table user_feedback created successfully';
    ELSE
        RAISE NOTICE 'Table user_feedback already exists';
    END IF;
END $$;

-- 验证表创建
DO $$
DECLARE
    soul_history_exists BOOLEAN;
    user_feedback_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'soul_update_history'
    ) INTO soul_history_exists;
    
    SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'user_feedback'
    ) INTO user_feedback_exists;
    
    IF soul_history_exists AND user_feedback_exists THEN
        RAISE NOTICE '✓ 迁移成功！所有表已创建。';
    ELSE
        RAISE EXCEPTION '✗ 迁移失败！请检查错误信息。';
    END IF;
END $$;
