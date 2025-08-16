import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

/**
 * 客戶管理邊緣函數
 * 處理客戶的 CRUD 操作
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

    console.log(`客戶 API: ${method} ${path}`)

    switch (method) {
      case 'GET':
        if (path === 'orders') return await handleGetCustomerOrders(req)
        return await handleGetCustomers(req)
      case 'POST':
        return await handleCreateCustomer(req)
      case 'PUT':
        return await handleUpdateCustomer(req)
      case 'DELETE':
        return await handleDeleteCustomer(req)
      default:
        return new Response(
          JSON.stringify({ success: false, message: '不支援的請求方法' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('客戶 API 錯誤:', error)
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
 * 獲取客戶列表及統計資訊
 */
async function handleGetCustomers(req: Request) {
  try {
    const url = new URL(req.url)
    const region = url.searchParams.get('region')
    const purchaseCount = url.searchParams.get('purchaseCount')
    const purchasedItem = url.searchParams.get('purchasedItem')
    const search = url.searchParams.get('search')

    // 從訂單和客戶表聯合查詢
    let query = supabase
      .from('customers')
      .select(`
        *,
        orders(count)
      `)
      .order('created_at', { ascending: false })

    // 套用篩選條件
    if (region && region !== '所有地區') {
      query = query.ilike('region', `%${region}%`)
    }

    const { data: customers, error } = await query

    if (error) {
      console.error('查詢客戶錯誤:', error)
      throw new Error(`查詢客戶失敗: ${error.message}`)
    }

    // 從訂單資料補充統計資訊
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        customer_phone,
        customer_name,
        delivery_address,
        delivery_method,
        total_amount,
        created_at,
        order_items(product_name, quantity)
      `)

    if (ordersError) {
      console.error('查詢訂單錯誤:', ordersError)
    }

    // 建立客戶統計映射
    const customerStats: { [phone: string]: any } = {}
    
    if (orders) {
      orders.forEach(order => {
        const phone = order.customer_phone
        if (!phone) return

        if (!customerStats[phone]) {
          customerStats[phone] = {
            name: order.customer_name,
            address: order.delivery_address,
            deliveryMethod: order.delivery_method,
            purchaseCount: 0,
            totalAmount: 0,
            purchasedItems: new Set(),
            lastOrderDate: order.created_at
          }
        }

        const stats = customerStats[phone]
        stats.purchaseCount += 1
        stats.totalAmount += parseFloat(order.total_amount || '0')
        
        // 收集購買商品
        if (order.order_items) {
          order.order_items.forEach((item: any) => {
            stats.purchasedItems.add(item.product_name)
          })
        }

        // 更新最後訂單日期
        if (order.created_at > stats.lastOrderDate) {
          stats.lastOrderDate = order.created_at
        }
      })
    }

    // 轉換為前端期望的格式
    const formattedCustomers = (customers || []).map(customer => {
      const stats = customerStats[customer.phone] || {}
      const purchasedItemsArray = Array.from(stats.purchasedItems || [])
      
      return {
        id: customer.id,
        name: customer.name || stats.name || '',
        phone: customer.phone,
        deliveryMethod: customer.delivery_method || stats.deliveryMethod || '',
        address: customer.address || stats.address || '',
        contactMethod: customer.contact_method || '',
        socialId: customer.social_id || '',
        orderTime: stats.lastOrderDate || customer.created_at,
        items: purchasedItemsArray.join('、'),
        purchaseCount: stats.purchaseCount || 0,
        purchasedItems: purchasedItemsArray,
        region: customer.region || extractRegion(customer.address || stats.address || ''),
        totalAmount: stats.totalAmount || 0
      }
    })

    // 從訂單資料補充缺失的客戶
    Object.entries(customerStats).forEach(([phone, stats]: [string, any]) => {
      const existingCustomer = formattedCustomers.find(c => c.phone === phone)
      if (!existingCustomer) {
        const purchasedItemsArray = Array.from(stats.purchasedItems || [])
        formattedCustomers.push({
          id: phone,
          name: stats.name || '',
          phone: phone,
          deliveryMethod: stats.deliveryMethod || '',
          address: stats.address || '',
          contactMethod: '',
          socialId: '',
          orderTime: stats.lastOrderDate,
          items: purchasedItemsArray.join('、'),
          purchaseCount: stats.purchaseCount || 0,
          purchasedItems: purchasedItemsArray,
          region: extractRegion(stats.address || ''),
          totalAmount: stats.totalAmount || 0
        })
      }
    })

    // 前端篩選
    let filteredCustomers = formattedCustomers

    if (purchaseCount) {
      switch (purchaseCount) {
        case '1':
          filteredCustomers = filteredCustomers.filter(customer => customer.purchaseCount === 1)
          break
        case '2-5':
          filteredCustomers = filteredCustomers.filter(customer => customer.purchaseCount >= 2 && customer.purchaseCount <= 5)
          break
        case '5+':
          filteredCustomers = filteredCustomers.filter(customer => customer.purchaseCount > 5)
          break
      }
    }

    if (purchasedItem && purchasedItem !== '所有商品') {
      filteredCustomers = filteredCustomers.filter(customer =>
        customer.purchasedItems.some((item: string) => item.includes(purchasedItem))
      )
    }

    if (search) {
      const searchLower = search.toLowerCase()
      filteredCustomers = filteredCustomers.filter(customer =>
        customer.name.toLowerCase().includes(searchLower) ||
        customer.phone.includes(search) ||
        customer.address.toLowerCase().includes(searchLower)
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: filteredCustomers,
        total: filteredCustomers.length 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('獲取客戶錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '獲取客戶失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 獲取客戶訂單歷史
 */
async function handleGetCustomerOrders(req: Request) {
  try {
    const url = new URL(req.url)
    const phone = url.searchParams.get('phone')

    if (!phone) {
      throw new Error('缺少必要參數: phone')
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        created_at,
        customer_name,
        order_items(product_name, quantity)
      `)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`查詢客戶訂單失敗: ${error.message}`)
    }

    const formattedOrders = orders?.map(order => ({
      id: order.id,
      orderTime: order.created_at?.split('T')[0] || '',
      items: order.order_items?.map((item: any) => 
        `${item.product_name} x ${item.quantity}`
      ).join(', ') || '',
      name: order.customer_name
    })) || []

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: formattedOrders 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('獲取客戶訂單錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '獲取客戶訂單失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 創建新客戶
 */
async function handleCreateCustomer(req: Request) {
  try {
    const customerData = await req.json()

    const { data: customer, error } = await supabase
      .from('customers')
      .insert([{
        name: customerData.name,
        phone: customerData.phone,
        address: customerData.address,
        delivery_method: customerData.deliveryMethod,
        contact_method: customerData.contactMethod,
        social_id: customerData.socialId,
        region: customerData.region || extractRegion(customerData.address || ''),
        notes: customerData.notes
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`創建客戶失敗: ${error.message}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '客戶創建成功',
        data: customer
      }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('創建客戶錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '創建客戶失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 更新客戶資訊
 */
async function handleUpdateCustomer(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const customerData = await req.json()

    if (!id) {
      throw new Error('缺少必要參數: id')
    }

    const { error } = await supabase
      .from('customers')
      .update({
        name: customerData.name,
        phone: customerData.phone,
        address: customerData.address,
        delivery_method: customerData.deliveryMethod,
        contact_method: customerData.contactMethod,
        social_id: customerData.socialId,
        region: customerData.region || extractRegion(customerData.address || ''),
        notes: customerData.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      throw new Error(`更新客戶失敗: ${error.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: '客戶更新成功' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('更新客戶錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '更新客戶失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 刪除客戶
 */
async function handleDeleteCustomer(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (!id) {
      throw new Error('缺少必要參數: id')
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`刪除客戶失敗: ${error.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: '客戶刪除成功' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('刪除客戶錯誤:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : '刪除客戶失敗' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * 從地址中提取地區資訊
 */
function extractRegion(address: string): string {
  if (!address) return '未知地區'

  // 嘗試匹配常見的地址格式
  const cityMatch = address.match(/^(.*?[市縣])/)
  if (cityMatch) return cityMatch[1]

  // 如果沒有匹配到市或縣，嘗試匹配鄉鎮市區
  const districtMatch = address.match(/^(.*?[鄉鎮市區])/)
  if (districtMatch) return districtMatch[1]

  return '未知地區'
}