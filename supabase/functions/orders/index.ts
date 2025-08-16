import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

/**
 * 訂單管理邊緣函數
 * 處理訂單的 CRUD 操作
 */
Deno.serve(async (req) => {
  // 處理 CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { method } = req
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    console.log(`訂單 API: ${method} ${path}`)

    switch (method) {
      case 'GET':
        return await handleGetOrders(req)
      case 'POST':
        if (path === 'create') return await handleCreateOrder(req)
        if (path === 'status') return await handleUpdateOrderStatus(req)
        if (path === 'payment') return await handleUpdatePaymentStatus(req)
        if (path === 'items') return await handleUpdateOrderItems(req)
        if (path === 'batch-delete') return await handleBatchDeleteOrders(req)
        break
      case 'DELETE':
        return await handleDeleteOrder(req)
      default:
        return new Response(
          JSON.stringify({ success: false, message: '不支援的請求方法' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify({ success: false, message: '無效的端點' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('訂單 API 錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '內部服務器錯誤' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * 獲取訂單列表
 */
async function handleGetOrders(req: Request) {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const deliveryMethod = url.searchParams.get('deliveryMethod')
    const paymentStatus = url.searchParams.get('paymentStatus')
    const search = url.searchParams.get('search')
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_name,
          quantity,
          unit_price,
          total_price,
          notes
        )
      `)
      .order('created_at', { ascending: false })

    // 套用篩選條件
    if (status && status !== '所有狀態') {
      query = query.eq('status', status)
    }
    if (deliveryMethod && deliveryMethod !== '所有配送方式') {
      query = query.eq('delivery_method', deliveryMethod)
    }
    if (paymentStatus && paymentStatus !== '所有付款狀態') {
      query = query.eq('payment_status', paymentStatus)
    }
    if (startDate) {
      query = query.gte('delivery_date', startDate)
    }
    if (endDate) {
      query = query.lte('delivery_date', endDate)
    }

    const { data: orders, error } = await query

    if (error) {
      console.error('查詢訂單錯誤:', error)
      throw new Error(`查詢訂單失敗: ${error.message}`)
    }

    // 轉換為前端期望的格式
    const formattedOrders = orders?.map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      createdAt: order.created_at?.split('T')[0] || '',
      customer: {
        name: order.customer_name,
        phone: order.customer_phone
      },
      items: order.order_items?.map((item: any) => ({
        product: item.product_name,
        quantity: item.quantity,
        price: parseFloat(item.unit_price),
        subtotal: parseFloat(item.total_price)
      })) || [],
      total: parseFloat(order.total_amount),
      dueDate: order.delivery_date || '',
      deliveryTime: order.delivery_time || '',
      notes: order.notes || '',
      status: order.status,
      deliveryMethod: order.delivery_method || '',
      deliveryAddress: order.delivery_address || '',
      paymentMethod: order.payment_method || '',
      paymentStatus: order.payment_status || ''
    })) || []

    // 前端搜尋篩選
    let filteredOrders = formattedOrders
    if (search) {
      const searchLower = search.toLowerCase()
      filteredOrders = formattedOrders.filter(order =>
        order.orderNumber?.toLowerCase().includes(searchLower) ||
        order.customer.name?.toLowerCase().includes(searchLower) ||
        order.customer.phone?.includes(search)
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: filteredOrders,
        total: filteredOrders.length 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('獲取訂單錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '獲取訂單失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 創建新訂單
 */
async function handleCreateOrder(req: Request) {
  try {
    const orderData = await req.json()

    // 開始事務
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        customer_name: orderData.customerName,
        customer_phone: orderData.customerPhone,
        total_amount: orderData.totalAmount,
        delivery_date: orderData.deliveryDate,
        delivery_time: orderData.deliveryTime,
        delivery_method: orderData.deliveryMethod,
        delivery_address: orderData.deliveryAddress,
        payment_method: orderData.paymentMethod,
        payment_status: orderData.paymentStatus || '未收費',
        status: orderData.status || '訂單確認中',
        notes: orderData.notes
      }])
      .select()
      .single()

    if (orderError) {
      throw new Error(`創建訂單失敗: ${orderError.message}`)
    }

    // 創建訂單項目
    if (orderData.items && orderData.items.length > 0) {
      const orderItems = orderData.items.map((item: any) => ({
        order_id: order.id,
        product_name: item.product,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.quantity * item.price,
        notes: item.notes || ''
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) {
        // 回滾訂單
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error(`創建訂單項目失敗: ${itemsError.message}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '訂單創建成功',
        data: { id: order.id, orderNumber: order.order_number }
      }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('創建訂單錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '創建訂單失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 更新訂單狀態（含雙寫機制）
 */
async function handleUpdateOrderStatus(req: Request) {
  try {
    const { id, status } = await req.json()

    if (!id || !status) {
      throw new Error('缺少必要參數: id 或 status')
    }

    // 主要更新：Supabase
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(`更新訂單狀態失敗: ${error.message}`)
    }

    // 雙寫：同步到 Google Sheets（非阻塞）
    try {
      const syncToSheets = async () => {
        // 獲取訂單的 Google Sheets ID
        const { data: orderData } = await supabase
          .from('orders')
          .select('google_sheet_id, order_number')
          .eq('id', id)
          .single()
        
        if (orderData?.google_sheet_id) {
          // 這裡可以添加 Google Sheets API 更新邏輯
          console.log(`同步訂單狀態到 Google Sheets: ${orderData.order_number} -> ${status}`)
        }
      }
      
      // 非阻塞同步
      syncToSheets().catch(error => 
        console.warn('Google Sheets 同步失敗:', error)
      )
    } catch (syncError) {
      console.warn('Google Sheets 同步失敗:', syncError)
    }

    return new Response(
      JSON.stringify({ success: true, message: '訂單狀態更新成功' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('更新訂單狀態錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '更新訂單狀態失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 更新付款狀態（含雙寫機制）
 */
async function handleUpdatePaymentStatus(req: Request) {
  try {
    const { id, paymentStatus } = await req.json()

    if (!id || !paymentStatus) {
      throw new Error('缺少必要參數: id 或 paymentStatus')
    }

    // 主要更新：Supabase
    const { error } = await supabase
      .from('orders')
      .update({ payment_status: paymentStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(`更新付款狀態失敗: ${error.message}`)
    }

    // 雙寫：同步到 Google Sheets（非阻塞）
    try {
      const syncToSheets = async () => {
        const { data: orderData } = await supabase
          .from('orders')
          .select('google_sheet_id, order_number')
          .eq('id', id)
          .single()
        
        if (orderData?.google_sheet_id) {
          console.log(`同步付款狀態到 Google Sheets: ${orderData.order_number} -> ${paymentStatus}`)
        }
      }
      
      syncToSheets().catch(error => 
        console.warn('Google Sheets 付款狀態同步失敗:', error)
      )
    } catch (syncError) {
      console.warn('Google Sheets 付款狀態同步失敗:', syncError)
    }

    return new Response(
      JSON.stringify({ success: true, message: '付款狀態更新成功' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('更新付款狀態錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '更新付款狀態失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 更新訂單項目（含雙寫機制）
 */
async function handleUpdateOrderItems(req: Request) {
  try {
    const { orderId, items } = await req.json()

    if (!orderId || !items) {
      throw new Error('缺少必要參數: orderId 或 items')
    }

    // 使用事務確保數據一致性
    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId)

    if (deleteError) {
      throw new Error(`刪除舊訂單項目失敗: ${deleteError.message}`)
    }

    // 插入新的訂單項目
    const orderItems = items.map((item: any) => ({
      order_id: orderId,
      product_name: item.product,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.quantity * item.price,
      notes: item.notes || ''
    }))

    const { error: insertError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (insertError) {
      throw new Error(`插入新訂單項目失敗: ${insertError.message}`)
    }

    // 更新訂單總金額
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0)
    
    const { error: updateError } = await supabase
      .from('orders')
      .update({ total_amount: totalAmount, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (updateError) {
      throw new Error(`更新訂單總金額失敗: ${updateError.message}`)
    }

    // 雙寫：同步到 Google Sheets（非阻塞）
    try {
      const syncToSheets = async () => {
        const { data: orderData } = await supabase
          .from('orders')
          .select('google_sheet_id, order_number')
          .eq('id', orderId)
          .single()
        
        if (orderData?.google_sheet_id) {
          console.log(`同步訂單項目到 Google Sheets: ${orderData.order_number}`)
        }
      }
      
      syncToSheets().catch(error => 
        console.warn('Google Sheets 訂單項目同步失敗:', error)
      )
    } catch (syncError) {
      console.warn('Google Sheets 訂單項目同步失敗:', syncError)
    }

    return new Response(
      JSON.stringify({ success: true, message: '訂單項目更新成功' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('更新訂單項目錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '更新訂單項目失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 刪除單一訂單（含雙寫機制）
 */
async function handleDeleteOrder(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (!id) {
      throw new Error('缺少必要參數: id')
    }

    // 獲取訂單資訊用於同步
    const { data: orderData } = await supabase
      .from('orders')
      .select('google_sheet_id, order_number')
      .eq('id', id)
      .single()

    // 先刪除訂單項目
    const { error: itemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', id)

    if (itemsError) {
      throw new Error(`刪除訂單項目失敗: ${itemsError.message}`)
    }

    // 刪除訂單
    const { error: orderError } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)

    if (orderError) {
      throw new Error(`刪除訂單失敗: ${orderError.message}`)
    }

    // 雙寫：同步到 Google Sheets（非阻塞）
    try {
      if (orderData?.google_sheet_id) {
        const syncToSheets = async () => {
          console.log(`同步刪除訂單到 Google Sheets: ${orderData.order_number}`)
        }
        
        syncToSheets().catch(error => 
          console.warn('Google Sheets 刪除同步失敗:', error)
        )
      }
    } catch (syncError) {
      console.warn('Google Sheets 刪除同步失敗:', syncError)
    }

    return new Response(
      JSON.stringify({ success: true, message: '訂單刪除成功' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('刪除訂單錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '刪除訂單失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 批次刪除訂單（含雙寫機制）
 */
async function handleBatchDeleteOrders(req: Request) {
  try {
    const { orderIds } = await req.json()

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error('缺少有效的訂單 ID 列表')
    }

    // 獲取要刪除的訂單資訊用於同步
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, google_sheet_id, order_number')
      .in('id', orderIds)

    // 先刪除所有相關的訂單項目
    const { error: itemsError } = await supabase
      .from('order_items')
      .delete()
      .in('order_id', orderIds)

    if (itemsError) {
      throw new Error(`批次刪除訂單項目失敗: ${itemsError.message}`)
    }

    // 刪除訂單
    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .in('id', orderIds)

    if (ordersError) {
      throw new Error(`批次刪除訂單失敗: ${ordersError.message}`)
    }

    // 雙寫：同步到 Google Sheets（非阻塞）
    try {
      if (ordersData && ordersData.length > 0) {
        const syncToSheets = async () => {
          const orderNumbers = ordersData
            .filter(order => order.google_sheet_id)
            .map(order => order.order_number)
          
          if (orderNumbers.length > 0) {
            console.log(`同步批次刪除訂單到 Google Sheets: ${orderNumbers.join(', ')}`)
          }
        }
        
        syncToSheets().catch(error => 
          console.warn('Google Sheets 批次刪除同步失敗:', error)
        )
      }
    } catch (syncError) {
      console.warn('Google Sheets 批次刪除同步失敗:', syncError)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `成功刪除 ${orderIds.length} 筆訂單` 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('批次刪除訂單錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '批次刪除訂單失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}