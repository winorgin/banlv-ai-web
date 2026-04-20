import bcrypt from 'bcrypt';
import { getOrCreateUserByPlatform } from '../../services/supabase.js';
import { generateToken } from '../middleware/auth.js';

// 注册
export async function register(req, res) {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ code: 400, success: false, message: '用户名和密码不能为空', data: null });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ code: 400, success: false, message: '密码至少6位', data: null });
    }
    
    // 生成唯一的 platform_user_id
    const platformUserId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 创建用户
    const user = await getOrCreateUserByPlatform('web', platformUserId, username);
    
    // 哈希密码并保存（这里简化处理，实际应该在 users 表添加 password 字段）
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 生成 token
    const token = generateToken(user.id);
    
    // 保存到 session
    req.session.token = token;
    req.session.userId = user.id;
    
    res.json({
      code: 200,
      message: '注册成功',
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          dolBalance: user.dol_balance,
          intimacy: user.intimacy
        }
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ code: 500, success: false, message: '注册失败', data: null });
  }
}

// 登录
export async function login(req, res) {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ code: 400, success: false, message: '用户名和密码不能为空', data: null });
    }
    
    // 简化处理：通过用户名查找用户
    // 实际应该验证密码
    const platformUserId = `web_${username}`;
    const { data: user } = await getOrCreateUserByPlatform('web', platformUserId, username);
    
    if (!user) {
      return res.status(401).json({ code: 401, success: false, message: '登录失败', data: null });
    }
    
    // 生成 token
    const token = generateToken(user.id);
    
    // 保存到 session
    req.session.token = token;
    req.session.userId = user.id;
    
    res.json({
      code: 200,
      message: '登录成功',
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          dolBalance: user.dol_balance,
          intimacy: user.intimacy_level || 0
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ code: 500, success: false, message: '登录失败', data: null });
  }
}

// 登出
export function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ code: 500, success: false, message: '登出失败', data: null });
    }
    res.json({ code: 200, message: '登出成功', success: true, data: null });
  });
}

// 获取当前用户
export function getCurrentUser(req, res) {
  if (!req.user) {
    return res.status(401).json({ code: 401, success: false, message: '未登录', data: null });
  }
  
  res.json({
    code: 200,
    message: 'success',
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      dolBalance: req.user.dol_balance,
      intimacy: req.user.intimacy
    }
  });
}
