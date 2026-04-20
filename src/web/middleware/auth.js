import jwt from 'jsonwebtoken';
import { supabase } from '../../services/supabase.js';
import { JWT_SECRET } from '../../config/secrets.js';

// 生成 JWT token
export function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// 验证 JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// 认证中间件
export async function authenticate(req, res, next) {
  try {
    // 从 header 或 session 获取 token
    const token = req.headers.authorization?.replace('Bearer ', '') || req.session.token;
    
    if (!token) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token 无效' });
    }
    
    // 获取用户信息
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ success: false, error: '用户不存在' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, error: '认证失败' });
  }
}

// 可选认证中间件（不强制要求登录）
export async function optionalAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.session.token;
    
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('id', decoded.userId)
          .single();
        
        if (user) {
          req.user = user;
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
}
