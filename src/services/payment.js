import { supabase } from './supabase.js';

// 创建支付订单
export async function createPaymentOrder(userId, platform, amount, dolAmount) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        platform,
        amount,
        dol_amount: dolAmount,
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Create payment error:', error);
    throw error;
  }
}

// 处理支付回调
export async function handlePaymentCallback(paymentId, paymentData) {
  try {
    // 验证支付
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (payment.status !== 'pending') {
      return { success: false, error: '订单状态异常' };
    }
    
    // 更新支付状态
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: 'completed',
        paid_at: new Date().toISOString(),
        transaction_id: paymentData.transactionId
      })
      .eq('id', paymentId);
    
    if (updateError) throw updateError;
    
    // 增加用户 DOL 余额
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('dol_balance')
      .eq('id', payment.user_id)
      .single();
    
    if (userError) throw userError;
    
    const newBalance = user.dol_balance + payment.dol_amount;
    
    const { error: balanceError } = await supabase
      .from('users')
      .update({ dol_balance: newBalance })
      .eq('id', payment.user_id);
    
    if (balanceError) throw balanceError;
    
    return { 
      success: true, 
      newBalance,
      dolAmount: payment.dol_amount
    };
  } catch (error) {
    console.error('Payment callback error:', error);
    return { success: false, error: error.message };
  }
}

// 获取支付订单
export async function getPaymentOrder(paymentId) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get payment error:', error);
    return null;
  }
}

// 取消支付订单
export async function cancelPaymentOrder(paymentId) {
  try {
    const { error } = await supabase
      .from('payments')
      .update({ status: 'cancelled' })
      .eq('id', paymentId)
      .eq('status', 'pending');
    
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Cancel payment error:', error);
    return { success: false, error: error.message };
  }
}
