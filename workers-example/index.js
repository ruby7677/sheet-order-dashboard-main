// Cloudflare Workers 範例 - 將 PHP API 轉換為 Workers
// 這是一個示範如何將 get_orders_from_sheet.php 轉換為 Workers 的範例

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    const path = url.pathname;
    
    try {
      let response;
      
      switch (path) {
        case '/api/get_orders_from_sheet.php':
          response = await getOrdersFromSheet(request, env);
          break;
        case '/api/update_order_status.php':
          response = await updateOrderStatus(request, env);
          break;
        case '/api/check_api_path.php':
          response = checkApiPath();
          break;
        default:
          response = new Response('Not Found', { status: 404 });
      }

      // Add CORS headers to response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Internal server error',
          timestamp: Date.now()
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }
  }
};

// 取得訂單列表 (轉換自 get_orders_from_sheet.php)
async function getOrdersFromSheet(request, env) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh');
  
  // 檢查快取 (使用 KV 儲存)
  const cacheKey = 'orders_cache';
  
  if (!refresh) {
    const cachedData = await env.CACHE_KV.get(cacheKey);
    if (cachedData) {
      const cached = JSON.parse(cachedData);
      const now = Date.now();
      
      // 檢查快取是否仍然有效 (15秒)
      if (now - cached.timestamp < 15000) {
        return new Response(JSON.stringify({
          success: true,
          data: cached.data,
          timestamp: now,
          request_id: generateRequestId(),
          cached: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      }
    }
  }

  try {
    // Google Sheets API 調用
    const ordersData = await fetchFromGoogleSheets(env);
    
    // 儲存到快取
    await env.CACHE_KV.put(cacheKey, JSON.stringify({
      data: ordersData,
      timestamp: Date.now()
    }), { expirationTtl: 60 }); // 60秒 TTL

    return new Response(JSON.stringify({
      success: true,
      data: ordersData,
      timestamp: Date.now(),
      request_id: generateRequestId(),
      cached: false
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('Google Sheets API error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch orders from Google Sheets',
      timestamp: Date.now(),
      request_id: generateRequestId()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Google Sheets API 調用
async function fetchFromGoogleSheets(env) {
  // 解析 Service Account 金鑰
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  
  // 建立 JWT Token
  const jwtToken = await createJWT(serviceAccount);
  
  // 取得 Access Token
  const accessToken = await getAccessToken(jwtToken);
  
  // 呼叫 Google Sheets API
  const spreadsheetId = env.GOOGLE_SHEET_ID;
  const range = 'Sheet1!A:P'; // A到P欄，對應原本的15個欄位
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Sheets API error: ${response.status}`);
  }

  const data = await response.json();
  
  // 轉換資料格式 (與 PHP 版本保持一致)
  return transformSheetsData(data.values);
}

// 建立 JWT Token
async function createJWT(serviceAccount) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // 使用 Web Crypto API 簽署 JWT
  const encoder = new TextEncoder();
  const keyData = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const signatureData = encoder.encode(`${headerB64}.${payloadB64}`);
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureData
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

// 取得 Access Token
async function getAccessToken(jwtToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`
  });

  if (!response.ok) {
    throw new Error(`OAuth error: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// 轉換 Google Sheets 資料格式
function transformSheetsData(values) {
  if (!values || values.length <= 1) {
    return [];
  }

  // 跳過標題列，轉換每一行資料
  return values.slice(1).map((row, index) => {
    return {
      id: (index + 2).toString(), // 行號從2開始 (跳過標題)
      orderNumber: `ORD-${String(index + 1).padStart(3, '0')}`,
      customer: {
        name: row[1] || '',
        phone: row[2] || ''
      },
      deliveryMethod: row[3] || '',
      deliveryAddress: row[4] || '',
      dueDate: row[5] || '',
      deliveryTime: row[6] || '',
      notes: row[7] || '',
      items: parseOrderItems(row[8] || ''),
      total: parseFloat(row[9]) || 0,
      contactMethod: row[10] || '',
      socialAccount: row[11] || '',
      paymentMethod: row[12] || '',
      rowNumber: parseInt(row[13]) || (index + 2),
      status: row[14] || '訂單確認中',
      paymentStatus: row[15] || '未收費',
      createdAt: row[0] || ''
    };
  }).filter(order => order.customer.name); // 過濾空白行
}

// 解析訂單商品
function parseOrderItems(itemsString) {
  if (!itemsString) return [];
  
  const items = [];
  const parts = itemsString.split(',');
  
  // 商品價格對應
  const prices = {
    '原味蘿蔔糕': 250,
    '芋頭粿': 350,
    '台式鹹蘿蔔糕': 350,
    '鳳梨豆腐乳': 300
  };
  
  parts.forEach(part => {
    const match = part.trim().match(/(.+?)\s*x\s*(\d+)/);
    if (match) {
      const product = match[1].trim();
      const quantity = parseInt(match[2]);
      const price = prices[product] || 0;
      
      items.push({
        product,
        price,
        quantity,
        subtotal: price * quantity
      });
    }
  });
  
  return items;
}

// 更新訂單狀態 (轉換自 update_order_status.php)
async function updateOrderStatus(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const { id, status, timestamp, nonce } = body;

    // 驗證參數
    if (!id || !status) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing required parameters',
        timestamp: Date.now()
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 這裡需要實作 Google Sheets 寫入邏輯
    // 類似於 PHP 版本的 updateOrderInSheet()
    
    // 清除快取
    await env.CACHE_KV.delete('orders_cache');

    return new Response(JSON.stringify({
      success: true,
      message: 'Order status updated successfully',
      timestamp: Date.now(),
      request_id: generateRequestId()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to update order status',
      timestamp: Date.now()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// API 路徑檢查
function checkApiPath() {
  return new Response(JSON.stringify({
    success: true,
    message: 'Cloudflare Workers API is working',
    environment: 'production',
    timestamp: Date.now(),
    worker_version: '1.0.0'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 產生請求 ID
function generateRequestId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}