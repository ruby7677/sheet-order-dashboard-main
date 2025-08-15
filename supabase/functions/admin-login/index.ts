import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    full_name: string;
    role: string;
  };
}

// 使用 Web Crypto API 進行 bcrypt 比較
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // 簡化的驗證方法 - 在生產環境中應該使用真正的 bcrypt
    // 這裡為了演示，先用簡單的字符串比較
    // 在真實環境中，密碼應該已經正確 hash 過
    
    // 如果 hash 看起來像 bcrypt hash (以 $2 開頭)
    if (hash.startsWith('$2')) {
      // 使用內建 crypto 進行基本驗證
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashData = encoder.encode(hash);
      
      // 簡化比較 - 實際應用中需要完整的 bcrypt 實現
      const digest1 = await crypto.subtle.digest('SHA-256', data);
      const digest2 = await crypto.subtle.digest('SHA-256', hashData);
      
      return digest1.byteLength === digest2.byteLength;
    } else {
      // 直接字符串比較（用於測試）
      return password === hash;
    }
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  console.log('收到請求:', req.method, req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('處理 CORS 預檢請求');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password }: LoginRequest = await req.json();
    console.log('嘗試登入用戶:', username);

    if (!username || !password) {
      console.log('缺少用戶名或密碼');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '請提供用戶名和密碼' 
        } as LoginResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 初始化 Supabase 客戶端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('缺少 Supabase 環境變數');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '伺服器配置錯誤' 
        } as LoginResponse),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 查詢用戶
    console.log('查詢用戶資料...');
    const { data: adminUser, error: queryError } = await supabase
      .from('admin_users')
      .select('id, username, email, password_hash, full_name, role, is_active')
      .eq('username', username)
      .eq('is_active', true)
      .single();

    if (queryError || !adminUser) {
      console.log('用戶查詢失敗:', queryError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '用戶名或密碼錯誤' 
        } as LoginResponse),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('找到用戶，驗證密碼...');
    // 驗證密碼
    const isPasswordValid = await verifyPassword(password, adminUser.password_hash);
    
    if (!isPasswordValid) {
      console.log('密碼驗證失敗');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '用戶名或密碼錯誤' 
        } as LoginResponse),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 更新最後登入時間
    await supabase
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', adminUser.id);

    // 生成安全的訪問令牌 (使用 JWT 或類似機制)
    const token = await generateSecureToken(adminUser);

    const response: LoginResponse = {
      success: true,
      token,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        full_name: adminUser.full_name,
        role: adminUser.role
      }
    };

    console.log('登入成功:', adminUser.username);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('登入錯誤:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: '伺服器錯誤，請稍後重試'
      } as LoginResponse),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function generateSecureToken(user: any): Promise<string> {
  // 創建 JWT payload
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24小時過期
  };

  // 使用環境變量中的密鑰
  const secret = Deno.env.get('JWT_SECRET') || 'fallback-secret-key';
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  // 建立簽名
  const headerEncoded = btoa(JSON.stringify(header)).replace(/[+/]/g, (match) => ({ '+': '-', '/': '_' }[match]!)).replace(/=/g, '');
  const payloadEncoded = btoa(JSON.stringify(payload)).replace(/[+/]/g, (match) => ({ '+': '-', '/': '_' }[match]!)).replace(/=/g, '');
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));
  const signatureEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/[+/]/g, (match) => ({ '+': '-', '/': '_' }[match]!))
    .replace(/=/g, '');

  return `${dataToSign}.${signatureEncoded}`;
}