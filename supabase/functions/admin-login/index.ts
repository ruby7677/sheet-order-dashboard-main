import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password }: LoginRequest = await req.json();

    if (!username || !password) {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 查詢用戶
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

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(password, adminUser.password_hash);
    
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