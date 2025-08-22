import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MigrationRequest {
  sheetId: string;
  dryRun?: boolean;
  skipExisting?: boolean;
}

interface MigrationResult {
  success: boolean;
  message: string;
  stats: {
    ordersProcessed: number;
    customersProcessed: number;
    productsProcessed: number;
    ordersDeleted?: number;
    errors: string[];
  };
}

async function getGoogleSheetsData(sheetId: string, range: string, accessToken: string) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Google Sheets API 錯誤: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  return data.values || [];
}

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountKey);
  
  // 建立 JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // 創建 JWT (使用 Web Crypto API)
  const jwt = await createJWT(payload, serviceAccount.private_key);

  // 獲取 access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    throw new Error(`OAuth 認證失敗: ${await response.text()}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

async function createJWT(payload: any, privateKey: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // 處理私鑰
  const keyData = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

function base64UrlEncode(data: string | Uint8Array): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// 僅保留數字作為標準化電話
function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^0-9]/g, '');
}

// 重試工具（指數退避）
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = Math.pow(2, attempt) * 200;
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) {return null;}
  
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  } catch {
    // 嘗試其他日期格式
  }
  
  return null;
}

async function migrateCustomers(supabase: any, customersData: any[][], dryRun: boolean, skipExisting: boolean) {
  if (customersData.length === 0) {return { processed: 0, errors: [] };}
  
  const header = customersData[0];
  const rows = customersData.slice(1);
  const errors: string[] = [];
  let processed = 0;

  // 建立欄位映射
  const headerMap: { [key: string]: number } = {};
  header.forEach((title: string, idx: number) => {
    switch (title.trim()) {
      case '姓名': headerMap['name'] = idx; break;
      case '電話': headerMap['phone'] = idx; break;
      case '取貨方式': headerMap['deliveryMethod'] = idx; break;
      case '地址': headerMap['address'] = idx; break;
      case '透過什麼聯繫賣家': headerMap['contactMethod'] = idx; break;
      case '社交軟體名字': headerMap['socialId'] = idx; break;
      case '訂單時間': headerMap['orderTime'] = idx; break;
    }
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    if (!row[headerMap['name']] || !row[headerMap['phone']]) {
      continue; // 跳過沒有必要資料的行
    }

    try {
      const customerData = {
        name: row[headerMap['name']]?.toString().trim() || '',
        phone: normalizePhone(row[headerMap['phone']]?.toString().trim() || ''),
        address: row[headerMap['address']]?.toString().trim() || '',
        delivery_method: row[headerMap['deliveryMethod']]?.toString().trim() || '',
        contact_method: row[headerMap['contactMethod']]?.toString().trim() || '',
        social_id: row[headerMap['socialId']]?.toString().trim() || '',
        created_at: parseDate(row[headerMap['orderTime']]) || new Date().toISOString()
      };

      if (dryRun) {
        console.log('Dry run - 客戶資料:', customerData);
        processed++;
        continue;
      }

      // 檢查是否已存在
      if (skipExisting) {
        const { data: existing } = await withRetry(() =>
          supabase
            .from('customers')
            .select('id')
            .eq('phone', customerData.phone)
            .single()
        );
        
        if (existing) {
          console.log(`客戶已存在: ${customerData.phone}`);
          continue;
        }
      }

      const { error } = await withRetry(() =>
        supabase
          .from('customers')
          .upsert(customerData, { onConflict: 'phone' })
      );

      if (error) {
        errors.push(`客戶 ${customerData.name}: ${error.message}`);
      } else {
        processed++;
      }
    } catch (error) {
      errors.push(`處理客戶資料第 ${i + 2} 行時發生錯誤: ${error}`);
    }
  }

  return { processed, errors };
}

async function migrateOrders(supabase: any, ordersData: any[][], dryRun: boolean, skipExisting: boolean) {
  if (ordersData.length === 0) {return { processed: 0, itemsProcessed: 0, errors: [], deleted: 0 };}
  
  const rows = ordersData.slice(1); // 跳過標題行
  const errors: string[] = [];
  let processed = 0;
  let itemsProcessed = 0;
  let deleted = 0;

  // 如果不是試運行，處理刪除邏輯
  if (!dryRun) {
    try {
      // 取得 Sheets 中現有的所有訂單 ID (使用 google_sheet_id)
      const sheetsOrderIds = new Set<number>();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row[1] && row[1].toString().trim() !== '') {
          sheetsOrderIds.add(i + 1);
        }
      }

      // 如果有 Sheets 數據，刪除 Supabase 中不再存在於 Sheets 的訂單
      if (sheetsOrderIds.size > 0) {
        const { data: existingOrders } = await supabase
          .from('orders')
          .select('id, google_sheet_id')
          .not('google_sheet_id', 'is', null);

        if (existingOrders && existingOrders.length > 0) {
          const ordersToDelete = existingOrders.filter(
            order => order.google_sheet_id && !sheetsOrderIds.has(order.google_sheet_id)
          );

          for (const orderToDelete of ordersToDelete) {
            // 先刪除 order_items
            await withRetry(() => supabase.from('order_items').delete().eq('order_id', orderToDelete.id));
            // 再刪除 order
            await withRetry(() => supabase.from('orders').delete().eq('id', orderToDelete.id));
            deleted++;
          }
        }
      }
    } catch (error) {
      errors.push(`處理訂單deletion時發生錯誤: ${error instanceof Error ? error.message : error}`);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // 跳過空白行
    if (!row[1] || row[1].toString().trim() === '') {continue;}

    try {
      const orderData = {
        order_number: `ORD-${(i + 1).toString().padStart(3, '0')}`,
        customer_name: row[1]?.toString().trim() || '',
        customer_phone: row[2]?.toString().trim() || '',
        delivery_method: row[3]?.toString().trim() || '',
        customer_address: row[4]?.toString().trim() || '',
        due_date: parseDate(row[5]),
        delivery_time: row[6]?.toString().trim() || '',
        notes: row[7]?.toString().trim() || '',
        payment_method: row[12]?.toString().trim() || '',
        status: row[14]?.toString().trim() || '訂單確認中',
        payment_status: row[15]?.toString().trim() || '未收費',
        total_amount: parseFloat(row[9]) || 0,
        google_sheet_id: i + 1,
        created_at: parseDate(row[0]) || new Date().toISOString()
      };

      if (dryRun) {
        console.log('Dry run - 訂單資料:', orderData);
        // 仍然嘗試解析 items 計數，便於評估
        try {
          const itemsRaw = (rows[i][8] ?? '').toString().trim();
          if (itemsRaw) {
            const itemStrings = itemsRaw.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
            const items = itemStrings.map((s) => {
              const m = s.split(/\s*[xX×]\s*/);
              const product = (m[0] ?? '').trim();
              const quantity = Math.max(0, parseInt((m[1] ?? '1'), 10) || 1);
              const price = Math.max(0, parseFloat(m[2] ?? '0') || 0);
              const subtotal = price * quantity;
              return { product, quantity, price, subtotal };
            }).filter(it => it.product);
            itemsProcessed += items.length;
          }
        } catch {}
        processed++;
        continue;
      }

      // 取得訂單 id：若已存在且 skipExisting 為 true，則沿用既有 id；否則 upsert 並取得 id
      let orderId: string | null = null;
      if (skipExisting) {
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('google_sheet_id', orderData.google_sheet_id)
          .single();
        if (existing?.id) {
          orderId = existing.id;
        }
      }

      if (!orderId) {
        const { data: upsertedOrders, error: upsertErr } = await withRetry(() =>
          supabase
            .from('orders')
            .upsert(orderData, { onConflict: 'google_sheet_id' })
            .select('id')
            .eq('google_sheet_id', orderData.google_sheet_id)
            .limit(1)
        );
        if (upsertErr) {
          errors.push(`訂單 ${orderData.order_number}: ${upsertErr.message}`);
          continue;
        }
        orderId = upsertedOrders && upsertedOrders[0]?.id;
      }

      if (!orderId) {
        errors.push(`訂單 ${orderData.order_number}: 無法取得 order.id`);
        continue;
      }

      // 解析購買項目字串並 upsert 至 order_items（冪等）
      try {
        const itemsRaw = (rows[i][8] ?? '').toString().trim();
        if (itemsRaw) {
          const itemStrings = itemsRaw.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
          const toHalfWidthDigits = (str: string) => str.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
          const extractNumbers = (str: string): number[] => {
            const normalized = toHalfWidthDigits(str);
            const matches = normalized.match(/\d+(?:\.\d+)?/g);
            return matches ? matches.map(v => parseFloat(v)) : [];
          };
          const items = itemStrings.map((s) => {
            const m = s.split(/\s*[xX×]\s*/);
            let left = (m[0] ?? '').trim();
            let right = (m[1] ?? '').trim();

            // 解析數量與單價：
            // 優先在右側找 [數量(必)] [單價(可選)]
            const rightNums = extractNumbers(right);
            let quantity = rightNums.length >= 1 ? Math.max(1, Math.floor(rightNums[0])) : 1;
            let price = rightNums.length >= 2 ? Math.max(0, rightNums[1]) : 0;

            // 若右側未取得單價，嘗試於左側尾端抽出單價，並從商品名移除
            if (!price) {
              const leftNums = extractNumbers(left);
              if (leftNums.length >= 1) {
                price = Math.max(0, leftNums[leftNums.length - 1]);
                // 移除左側尾端數字（及可能的貨幣符號）
                left = left.replace(/(?:NT\$|\$)?\s*\d+(?:\.\d+)?\s*$/, '').trim();
              }
            }

            const product = left;
            const subtotal = (price || 0) * (quantity || 0);
            return { product, quantity, price, subtotal };
          }).filter(it => it.product);

          if (!dryRun && items.length > 0) {
            // 冪等：先刪舊再插入
            await withRetry(() => supabase.from('order_items').delete().eq('order_id', orderId));

            // 查詢所有商品以進行名稱匹配
            const { data: products } = await supabase.from('products').select('id, name, price');
            const productMap = new Map(products?.map(p => [p.name.trim(), p]) || []);

            // 處理商品項目，匹配 product_id 和價格
            const processedItems = items.map(it => {
              const matchedProduct = productMap.get(it.product.trim());
              let finalUnitPrice = it.price;
              let finalProductId = null;

              if (matchedProduct) {
                finalProductId = matchedProduct.id;
                // 如果解析出的價格為 0，使用商品表中的價格
                if (it.price === 0) {
                  finalUnitPrice = matchedProduct.price;
                }
              } else if (it.price === 0 && orderData.total_amount > 0) {
                // 如果沒有匹配到商品且價格為 0，按數量分攤總金額
                const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
                finalUnitPrice = totalQuantity > 0 ? orderData.total_amount / totalQuantity : 0;
              }

              return {
                ...it,
                product_id: finalProductId,
                price: finalUnitPrice,
                subtotal: finalUnitPrice * it.quantity
              };
            });

            // 優先使用新版欄位（product_name, unit_price, total_price），失敗則回退舊版（product, price, subtotal）
            const payloadNew = processedItems.map(it => ({
              order_id: orderId,
              product_id: it.product_id,
              product_name: it.product,
              quantity: it.quantity,
              unit_price: it.price,
              total_price: it.subtotal,
            }));

            let insertOk = false;
            let itemErrMsg: string | null = null;
            try {
              const { error: itemErr } = await withRetry(() => supabase.from('order_items').insert(payloadNew));
              if (itemErr) { throw new Error(itemErr.message); }
              insertOk = true;
            } catch (e) {
              itemErrMsg = e instanceof Error ? e.message : String(e);
              // 回退舊欄位
              const payloadOld = items.map(it => ({
                order_id: orderId,
                product: it.product,
                quantity: it.quantity,
                price: it.price,
                subtotal: it.subtotal,
              }));
              const { error: itemErr2 } = await withRetry(() => supabase.from('order_items').insert(payloadOld));
              if (itemErr2) {
                errors.push(`訂單 ${orderData.order_number}: 寫入 order_items 失敗 - new: ${itemErrMsg}; old: ${itemErr2.message}`);
              } else {
                insertOk = true;
              }
            }

            if (insertOk) { itemsProcessed += items.length; }
          } else if (dryRun) {
            itemsProcessed += items.length;
          }
        }
      } catch (e) {
        errors.push(`訂單 ${orderData.order_number}: 解析/寫入購買項目失敗 - ${e instanceof Error ? e.message : e}`);
      }

      processed++;
    } catch (error) {
      errors.push(`處理訂單第 ${i + 2} 行時發生錯誤: ${error}`);
    }
  }

  return { processed, itemsProcessed, errors, deleted };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sheetId, dryRun = false, skipExisting = true }: MigrationRequest = await req.json();

    if (!sheetId) {
      return new Response(
        JSON.stringify({ success: false, message: '請提供 Google Sheets ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 初始化服務
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleServiceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`開始資料遷移 - Sheet ID: ${sheetId}, 試運行: ${dryRun}`);

    // 獲取 Google Sheets 存取權杖
    const accessToken = await getAccessToken(googleServiceAccountKey);

    // 讀取兩個工作表
    const [ordersData, customersData] = await Promise.all([
      getGoogleSheetsData(sheetId, 'Sheet1', accessToken),
      getGoogleSheetsData(sheetId, '客戶名單', accessToken).catch(() => [])
    ]);

    console.log(`讀取到 ${ordersData.length} 行訂單資料；${customersData.length} 行客戶資料`);

    // 執行遷移
    const [ordersResult, customersResult] = await Promise.all([
      migrateOrders(supabase, ordersData, dryRun, skipExisting),
      migrateCustomers(supabase, customersData, dryRun, skipExisting)
    ]);

    const allErrors = [...ordersResult.errors, ...customersResult.errors];

    const result: MigrationResult = {
      success: allErrors.length === 0,
      message: dryRun ? '試運行完成' : (allErrors.length ? '資料遷移完成（含錯誤）' : '資料遷移完成'),
      stats: {
        ordersProcessed: ordersResult.processed,
        customersProcessed: customersResult.processed,
        productsProcessed: ordersResult.itemsProcessed,
        ordersDeleted: ordersResult.deleted || 0,
        errors: allErrors
      }
    };

    console.log('遷移結果:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('遷移錯誤:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '遷移過程中發生錯誤',
        stats: {
          ordersProcessed: 0,
          customersProcessed: 0,
          productsProcessed: 0,
          ordersDeleted: 0,
          errors: [error instanceof Error ? error.message : String(error)]
        }
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});