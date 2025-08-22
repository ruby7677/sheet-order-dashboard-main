import { supabase } from '@/integrations/supabase/client';
import SecureStorage from '@/utils/secureStorage';

class SecureApiService {
  // 兩段式後端：優先 Workers /api，其次 Supabase Edge Functions
  private endpoints: string[] = (() => {
    const list: string[] = [];
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      list.push(isLocal ? 'http://127.0.0.1:5714/api' : 'https://sheet-order-api.ruby7677.workers.dev/api');
    } catch {
      list.push('https://sheet-order-api.ruby7677.workers.dev/api');
    }
    // Supabase Edge Functions 作為次要路徑
    list.push('https://skcdapfynyszxyqqsvib.supabase.co/functions/v1');
    return list;
  })();
  
  private getAuthToken(): string | null {
    return SecureStorage.getItem('admin_token');
  }

  private async makeSecureRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getAuthToken();
    let lastErr: any = null;
    for (const base of this.endpoints) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers as Record<string, string>,
      };
      if (token) { headers['Authorization'] = `Bearer ${token}`; }
      try {
        const response = await fetch(`${base}/${endpoint}`, { ...options, headers });
        if (response.status === 401) {
          SecureStorage.removeItem('admin_token');
          SecureStorage.removeItem('admin_user');
          window.location.href = '/admin';
          throw new Error('會話已過期，請重新登入');
        }
        if (response.ok) { return response; }
        // 非 2xx 也嘗試讀取錯誤訊息，並嘗試下一個端點
        try { lastErr = await response.json(); } catch { lastErr = { message: response.statusText }; }
      } catch (e: any) {
        lastErr = e;
      }
    }
    throw new Error(lastErr?.message || '後端服務不可用');
  }

  async migrateGoogleSheetsData(sheetId: string, options: { dryRun?: boolean; skipExisting?: boolean } = {}) {
    try {
      // 檢查和清理 sheetId
      if (!sheetId || typeof sheetId !== 'string') {
        throw new Error('無效的 Google Sheets ID');
      }
      
      const cleanSheetId = sheetId.trim();
      if (!cleanSheetId) {
        throw new Error('Google Sheets ID 不能為空');
      }
      
      // 直接使用 Supabase Edge Function
      const token = this.getAuthToken();
      if (!token) {
        throw new Error('未登入，無法執行資料遷移');
      }

      // 檢查 token 格式
      if (typeof token !== 'string' || token.trim() === '') {
        throw new Error('無效的授權令牌');
      }

      const requestBody = {
        sheetId: cleanSheetId,
        dryRun: Boolean(options.dryRun),
        skipExisting: Boolean(options.skipExisting),
      };

      console.log('發送遷移請求:', requestBody);

      // 驗證與構造授權標頭，避免 fetch 因無效字元拋出 "Invalid value"
      const bearer = `Bearer ${token.trim()}`
      const jwtLike = /^Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/
      if (!jwtLike.test(bearer)) {
        throw new Error('授權令牌格式錯誤，請重新登入後再試')
      }
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Authorization': bearer,
      })

      let response: Response
      try {
        response = await fetch('https://skcdapfynyszxyqqsvib.supabase.co/functions/v1/migrate-sheets-data', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        })
      } catch (e: any) {
        // 若瀏覽器因 headers 值或其他初始化問題導致失敗，改用後端代理端點再試一次
        const fallbackBody = JSON.stringify(requestBody)
        const res = await this.makeSecureRequest('migrate-sheets-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': bearer },
          body: fallbackBody,
        })
        response = res
      }

      console.log('遷移回應狀態:', response.status);

      if (response.status === 401) {
        SecureStorage.removeItem('admin_token');
        SecureStorage.removeItem('admin_user');
        window.location.href = '/admin';
        throw new Error('會話已過期，請重新登入');
      }

      const result = await response.json();
      console.log('遷移結果:', result);
      
      if (!response.ok) {
        throw new Error(result.message || result.error || '遷移失敗');
      }

      return result;
    } catch (error) {
      console.error('Google Sheets 資料遷移錯誤:', error);
      // 附加診斷資訊，協助使用者快速定位
      const extra = (msg: string) => `${msg} | 請嘗試重新登入、確認 Sheet ID 與網路，再重試`
      if (error instanceof Error) { throw new Error(extra(error.message)) }
      throw new Error(extra('未知錯誤'))
    }
  }

  // 輸入驗證和清理
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // 移除潛在的 HTML 標籤
      .replace(/javascript:/gi, '') // 移除 JavaScript 協議
      .replace(/on\w+\s*=/gi, '') // 移除事件處理器
      .trim();
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePhone(phone: string): boolean {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 8;
  }

  static validateSheetId(sheetId: string): boolean {
    // Google Sheets ID 格式驗證
    const sheetIdRegex = /^[a-zA-Z0-9-_]{44}$/;
    return sheetIdRegex.test(sheetId);
  }

  // 產品 CRUD（透過 Edge Function 保護）
  async listProducts(params?: { search?: string; category?: string; active?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.search) { qs.set('search', params.search); }
    if (params?.category) { qs.set('category', params.category); }
    if (typeof params?.active === 'boolean') { qs.set('active', String(params.active)); }

    const res = await this.makeSecureRequest('products' + (qs.toString() ? `?${qs.toString()}` : ''));
    const json = await res.json();
    if (!res.ok || !json?.success) { throw new Error(json?.message || '載入商品失敗'); }
    return json.data;
  }

  async createProduct(payload: any) {
    const res = await this.makeSecureRequest('products', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || !json?.success) { throw new Error(json?.message || '新增商品失敗'); }
    return json.data;
  }

  async updateProduct(id: string, payload: any) {
    const res = await this.makeSecureRequest('products', {
      method: 'PUT',
      body: JSON.stringify({ id, ...payload })
    });
    const json = await res.json();
    if (!res.ok || !json?.success) { throw new Error(json?.message || '更新商品失敗'); }
    return json.data;
  }

  async deleteProduct(id: string) {
    const res = await this.makeSecureRequest(`products?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (!res.ok || !json?.success) { throw new Error(json?.message || '刪除商品失敗'); }
    return true;
  }
}

export default SecureApiService;