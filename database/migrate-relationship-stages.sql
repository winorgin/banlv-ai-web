-- ============================================
-- 关系阶段迁移脚本
-- 将 stranger 和 friend 阶段统一改为 close_friend
-- ============================================

-- 开始事务
BEGIN;

-- 1. 更新 users 表中的关系阶段
UPDATE users 
SET relationship_stage = 'close_friend' 
WHERE relationship_stage IN ('stranger', 'friend');

-- 2. 更新 relationships 表中的关系阶段
UPDATE relationships 
SET relationship_stage = 'close_friend' 
WHERE relationship_stage IN ('stranger', 'friend');

-- 3. 更新系统配置中的关系阶段定义
UPDATE system_config 
SET config_value = '{"close_friend": 0, "lover": 500, "soulmate": 1000}'::jsonb
WHERE config_key = 'relationship_stages';

-- 4. 记录迁移日志（如果有日志表）
-- INSERT INTO migration_logs (migration_name, executed_at) 
-- VALUES ('migrate-relationship-stages', NOW());

-- 提交事务
COMMIT;

-- 验证迁移结果
SELECT 
    'users表迁移结果' as table_name,
    relationship_stage,
    COUNT(*) as count
FROM users
GROUP BY relationship_stage
ORDER BY relationship_stage;

SELECT 
    'relationships表迁移结果' as table_name,
    relationship_stage,
    COUNT(*) as count
FROM relationships
GROUP BY relationship_stage
ORDER BY relationship_stage;

SELECT 
    'system_config迁移结果' as table_name,
    config_key,
    config_value
FROM system_config
WHERE config_key = 'relationship_stages';
