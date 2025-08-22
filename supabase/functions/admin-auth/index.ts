import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// 使用 bcrypt 進行安全的密碼驗證
async function verifyPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  try {
    // 導入 bcrypt 函式庫
    const bcrypt = await import('https://deno.land/x/bcrypt@v0.4.1/mod.ts');
    
    // 使用 bcrypt 驗證密碼
    return await bcrypt.compare(inputPassword, storedHash);
  } catch (error) {
    console.error('密碼驗證錯誤:', error);
    return false;
  }
}

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
          message: '請提供帳號和密碼' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`嘗試登入: ${username}`);

    // Query admin user from database
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('id, username, email, password_hash, full_name, role, is_active')
      .eq('username', username)
      .eq('is_active', true)
      .single();

    if (error || !adminUser) {
      console.log('用戶不存在或未啟用:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '帳號或密碼錯誤' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, adminUser.password_hash);
    
    if (!isPasswordValid) {
      console.log('密碼驗證失敗');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '帳號或密碼錯誤' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate secure JWT token using Supabase
    const payload = {
      sub: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      iat: Math.floor(Date.now() / 1000),
    };

    // Create a custom JWT token for admin session
    const token = await generateJWT(payload);

    // Update last login time
    await supabase
      .from('admin_users')
      .update({ 
        last_login: new Date().toISOString() 
      })
      .eq('id', adminUser.id);

    console.log(`登入成功: ${username}`);

    const response: LoginResponse = {
      success: true,
      token,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        full_name: adminUser.full_name,
        role: adminUser.role,
      }
    };

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
        message: '伺服器錯誤，請稍後再試',
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function generateJWT(payload: any): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Use secure JWT secret from environment variables
  const secret = Deno.env.get('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '');
  
  return `${signingInput}.${encodedSignature}`;
}