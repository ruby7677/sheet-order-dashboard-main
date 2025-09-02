import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

interface DeliverySettingsFormData {
  start_date: string;
  end_date: string;
  description?: string;
  updated_by: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    // Create supabase admin client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: '未授權訪問' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.substring(7)
    
    // Verify admin token (basic JWT verification)
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid token format')
      }

      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired')
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: '令牌無效' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'GET') {
      // 獲取當前有效的配送設定
      const { data, error } = await supabaseClient
        .from('delivery_date_settings')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: data,
          message: data ? '獲取配送設定成功' : '沒有找到有效的配送設定'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (req.method === 'POST') {
      // 更新配送設定
      const formData: DeliverySettingsFormData = await req.json()

      // 驗證輸入資料
      if (!formData.start_date || !formData.end_date) {
        return new Response(
          JSON.stringify({ error: '開始日期和結束日期不能為空' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 驗證日期格式
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(formData.start_date) || !dateRegex.test(formData.end_date)) {
        return new Response(
          JSON.stringify({ error: '日期格式錯誤' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 驗證日期邏輯
      if (new Date(formData.start_date) > new Date(formData.end_date)) {
        return new Response(
          JSON.stringify({ error: '結束日期不能早於開始日期' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 先將現有的設定標記為非活動
      await supabaseClient
        .from('delivery_date_settings')
        .update({ is_active: false })
        .eq('is_active', true)

      // 創建新的設定記錄
      const newSetting = {
        start_date: formData.start_date,
        end_date: formData.end_date,
        description: formData.description || null,
        updated_by: formData.updated_by,
        is_active: true
      }

      const { data, error } = await supabaseClient
        .from('delivery_date_settings')
        .insert(newSetting)
        .select()
        .single()

      if (error) {
        throw error
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: data,
          message: '配送設定更新成功'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // 不支援的方法
    return new Response(
      JSON.stringify({ error: '不支援的請求方法' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Delivery settings function error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : '伺服器內部錯誤',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})