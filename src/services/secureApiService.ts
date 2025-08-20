import { supabase } from '@/integrations/supabase/client';

class SecureApiService {
  private baseUrl = 'https://skcdapfynyszxyqqsvib.supabase.co/functions/v1';
  
  private getAuthToken(): string | null {
    return localStorage.getItem('admin_token');
  }

  private async makeSecureRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error('未授權：請先登入');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // 令牌無效，清除本地存儲並重新導向登入頁
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/admin';
      throw new Error('會話已過期，請重新登入');
    }

    return response;
  }

  async migrateGoogleSheetsData(sheetId: string, options: { dryRun?: boolean; skipExisting?: boolean } = {}) {
    try {
      const response = await this.makeSecureRequest('migrate-sheets-data', {
        method: 'POST',
        body: JSON.stringify({
          sheetId,
          dryRun: options.dryRun || false,
          skipExisting: options.skipExisting || true,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || '遷移失敗');
      }

      return result;
    } catch (error) {
      console.error('Google Sheets 資料遷移錯誤:', error);
      throw error;
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