import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

/**
 * Dashboard 統計邊緣函數
 * 提供高效能的聚合統計查詢
 */
Deno.serve(async (req) => {
  // 處理 CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'GET') {
      return new Response(
        JSON.stringify({ success: false, message: '僅支援 GET 請求' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Dashboard 統計 API: GET')

    // 並行查詢所有統計資料以提高性能
    const [ordersResult, orderStatsResult, productStatsResult] = await Promise.all([
      // 基本訂單統計
      supabase
        .from('orders')
        .select('status, payment_status, total_amount', { count: 'exact' }),
      
      // 訂單狀態統計
      supabase.rpc('get_order_stats'),
      
      // 商品統計
      supabase
        .from('order_items')
        .select(`
          product_name,
          quantity,
          orders!inner(status)
        `)
        .not('orders.status', 'eq', '取消訂單')
    ])

    if (ordersResult.error) {
      throw new Error(`查詢訂單統計失敗: ${ordersResult.error.message}`)
    }

    const orders = ordersResult.data || []
    
    // 計算基本統計
    const totalOrders = orders.length
    const pendingOrders = orders.filter(o => o.status === '訂單確認中').length
    const processingOrders = orders.filter(o => o.status === '已抄單').length
    const completedOrders = orders.filter(o => o.status === '已出貨').length
    const canceledOrders = orders.filter(o => o.status === '取消訂單').length
    
    // 計算未收費訂單
    const unpaidOrders = orders.filter(o => 
      !o.payment_status || 
      o.payment_status === '未收費' || 
      o.payment_status === '未全款'
    ).length
    
    // 計算總金額
    const totalAmount = orders.reduce((sum, order) => 
      sum + (parseFloat(order.total_amount || '0')), 0
    )

    // 計算商品統計
    const productStats = {
      totalRadishCake: 0,
      totalTaroCake: 0,
      totalHKRadishCake: 0,
      totaltest: 0
    }

    if (productStatsResult.data) {
      productStatsResult.data.forEach((item: any) => {
        const productName = item.product_name || ''
        const quantity = parseInt(item.quantity || '0')
        
        if (productName.includes('原味蘿蔔糕')) {
          productStats.totalRadishCake += quantity
        } else if (productName.includes('芋頭粿')) {
          productStats.totalTaroCake += quantity
        } else if (productName.includes('台式鹹蘿蔔糕')) {
          productStats.totalHKRadishCake += quantity
        } else if (productName.includes('鳳梨豆腐乳')) {
          productStats.totaltest += quantity
        }
      })
    }

    const stats = {
      total: totalOrders,
      pending: pendingOrders,
      processing: processingOrders,
      completed: completedOrders,
      canceled: canceledOrders,
      unpaid: unpaidOrders,
      totalAmount: totalAmount,
      ...productStats
    }

    console.log('統計資料查詢成功:', stats)

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: stats
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Dashboard 統計錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '統計查詢失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})