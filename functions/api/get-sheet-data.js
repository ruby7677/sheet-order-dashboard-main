// functions/api/get-sheet-data.js

// 引入 Google API 相關函式庫
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

// Cloudflare Function 的主要處理函式
export async function onRequest(context) {
  // --- 1. 從環境變數安全地讀取金鑰 ---
  // 這部分取代了 PHP 中的 setAuthConfig(__DIR__ . '/../service-account-key2.json')
  const { GCP_PROJECT_ID, GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY } = context.env;

  // --- 2. 設定要讀取的試算表資訊 ---
  // 這部分對應您 PHP 程式碼中的變數
  const spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo';
  const sheetName = 'Sheet1';
  const range = `${sheetName}!A:Z`; // 您可以指定一個範圍，例如 'Sheet1!A1:D10' 或整個工作表 'Sheet1'

  try {
    // --- 3. 建立 Google API 客戶端並進行驗證 ---
    // 這部分取代了 PHP 中的 new Client() 和相關設定
    const auth = new GoogleAuth({
      projectId: GCP_PROJECT_ID,
      credentials: {
        client_email: GCP_CLIENT_EMAIL,
        // Google Auth Library 需要將環境變數中的 `\n` 字串轉為真正的換行符
        private_key: GCP_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      // 這部分對應 PHP 中的 setScopes()
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
      ],
    });

    // 取得已驗證的客戶端
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // --- 4. 執行 API 請求，獲取資料 ---
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
    });

    // --- 5. 將結果以 JSON 格式回傳給前端 ---
    return new Response(JSON.stringify(response.data.values), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=600', // 在 CDN 快取 10 分鐘，減少對 Google API 的請求
      },
    });

  } catch (error) {
    console.error('Google API Error:', error);
    // 如果發生錯誤，回傳錯誤訊息
    return new Response(JSON.stringify({ error: '無法從 Google Sheets 獲取資料。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}