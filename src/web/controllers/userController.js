import { getUserFullInfo, bindPlatform } from '../../services/supabase.js';
import { createPaymentOrder } from '../../services/payment.js';

// 获取用户统计
export async function getStats(req, res) {
  try {
    const user = req.user;
    const { data: fullInfo } = await getUserFullInfo(user.id);
    
    const level = Math.floor((fullInfo?.intimacy_level || 0) / 100) + 1;
    const nextLevelIntimacy = level * 100;
    const progress = (fullInfo?.intimacy_level || 0) % 100;
    
    res.json({
      code: 200,
      message: 'success',
      success: true,
      data: {
        username: user.username,
        dolBalance: fullInfo?.dol_balance || 0,
        intimacy: fullInfo?.intimacy_level || 0,
        level,
        nextLevelIntimacy,
        progress,
        relationshipStage: fullInfo?.relationship_stage || 'stranger',
        totalMessages: fullInfo?.total_messages || 0,
        personality: {},
        currentMood: 'neutral',
        createdAt: user.created_at,
        lastActive: user.last_active
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ code: 500, success: false, message: '获取统计信息失败', data: null });
  }
}

// 生成账号绑定码
export async function generateBindCode(req, res) {
  try {
    const user = req.user;
    
    // 生成绑定码：WEB_{user_id}_{timestamp}_{random}
    const code = `WEB_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    res.json({
      code: 200,
      message: 'success',
      success: true,
      data: { code, expiresIn: 300 }
    });
  } catch (error) {
    console.error('Generate bind code error:', error);
    res.status(500).json({ code: 500, success: false, message: '生成绑定码失败', data: null });
  }
}

// 创建充值订单
export async function createRecharge(req, res) {
  try {
    const user = req.user;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ code: 400, success: false, message: '充値金额无效', data: null });
    }
    
    const dolAmount = amount * 10; // 1元 = 10 DOL
    const payment = await createPaymentOrder(user.id, 'web', amount, dolAmount);
    
    res.json({
      code: 200,
      message: 'success',
      success: true,
      data: {
        id: payment.id,
        amount,
        dolAmount,
        status: payment.status,
        createdAt: payment.created_at
      }
    });
  } catch (error) {
    console.error('Create recharge error:', error);
    res.status(500).json({ code: 500, success: false, message: '创建充値订单失败', data: null });
  }
}
