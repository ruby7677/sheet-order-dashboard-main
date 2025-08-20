import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

interface JwtPayload {
  sub: string;
  username?: string;
  role?: string;
  exp?: number;
  iat?: number;
  aud?: string;
}

async function verifyJWT(token: string): Promise<JwtPayload | null> {
  try {
    const secret = Deno.env.get('JWT_SECRET') || 'your-secret-key-change-in-production';
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {return null}

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(signingInput)
    );
    if (!isValid) {return null}

    const payload: JwtPayload = JSON.parse(atob(payloadB64));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {return null}
    return payload;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type ProductRow = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  weight?: number | null;
  unit?: string | null;
  description?: string | null;
  detailed_description?: string | null;
  ingredients?: string | null;
  image_url?: string | null;
  is_vegetarian?: boolean | null;
  shipping_note?: string | null;
  sort_order?: number | null;
  stock_quantity?: number | null;
  is_active?: boolean | null;
  stock_status?: string | null;
  category?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 驗證管理員 JWT（僅對寫入操作）
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token ? await verifyJWT(token) : null;
  
  // 讀取操作不需要認證，寫入操作需要認證
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !payload) {
    return jsonResponse({ success: false, message: '未授權或 Token 失效' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const search = url.searchParams.get('search')?.trim();
      const category = url.searchParams.get('category')?.trim();
      const active = url.searchParams.get('active');

      let query = supabase.from('products').select('*').order('sort_order', { ascending: true });
      if (search) {
        query = query.or(`name.ilike.%${search}%,product_id.ilike.%${search}%`);
      }
      if (category) {
        query = query.eq('category', category);
      }
      if (active === 'true') {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) {return jsonResponse({ success: false, message: error.message }, 500)}
      return jsonResponse({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = (await req.json()) as Partial<ProductRow>;
      if (!body.product_id || !body.name || typeof body.price !== 'number') {
        return jsonResponse({ success: false, message: '缺少必要欄位: product_id/name/price' }, 400);
      }
      const payloadRow: Partial<ProductRow> = {
        ...body,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('products').insert([payloadRow]).select('*').single();
      if (error) {return jsonResponse({ success: false, message: error.message }, 500)}
      return jsonResponse({ success: true, data });
    }

    if (req.method === 'PUT') {
      const body = (await req.json()) as Partial<ProductRow> & { id?: string };
      if (!body.id) {return jsonResponse({ success: false, message: '缺少 id' }, 400)}
      const { id, ...rest } = body;
      const updateRow: Partial<ProductRow> = {
        ...rest,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('products').update(updateRow).eq('id', id).select('*').single();
      if (error) {return jsonResponse({ success: false, message: error.message }, 500)}
      return jsonResponse({ success: true, data });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id');
      if (!id) {return jsonResponse({ success: false, message: '缺少 id' }, 400)}
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {return jsonResponse({ success: false, message: error.message }, 500)}
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, message: '方法不被允許' }, 405);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ success: false, message }, 500);
  }
});


