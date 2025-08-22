import { supabase } from "@/integrations/supabase/client";

export interface MigrationOptions {
  sheetId: string;
  dryRun?: boolean;
  skipExisting?: boolean;
}

export interface MigrationStats {
  ordersProcessed: number;
  customersProcessed: number;
  productsProcessed: number;
  errors: string[];
}

export interface MigrationResult {
  success: boolean;
  message: string;
  stats: MigrationStats;
}

/**
 * 取得 API 基礎 URL
 */
function getApiBaseUrl(): string {
  try {
    const isLocal = typeof window !== 'undefined' && 
                   (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    return isLocal 
      ? 'http://127.0.0.1:5714/api' 
      : 'https://sheet-order-api.ruby7677.workers.dev/api';
  } catch {
    return 'https://sheet-order-api.ruby7677.workers.dev/api';
  }
}

/**
 * 驗證 Google Sheets ID 格式
 */
function validateSheetId(sheetId: string): boolean {
  // Google Sheets ID 格式驗證
  const sheetIdRegex = /^[a-zA-Z0-9-_]{44}$/;
  return sheetIdRegex.test(sheetId);
}

/**
 * 執行 Google Sheets 到 Supabase 的資料遷移
 * 使用公開的自動同步 API，不需要認證
 */
export async function migrateGoogleSheetsData(options: MigrationOptions): Promise<MigrationResult> {
  try {
    // 驗證 Sheet ID 格式
    if (!validateSheetId(options.sheetId)) {
      throw new Error('無效的 Google Sheets ID 格式');
    }

    // 嘗試第一個 API 端點（Cloudflare Workers）
    const primaryApiUrl = `${getApiBaseUrl()}/sync/auto`;
    
    try {
      console.log('嘗試使用 Cloudflare Workers API:', primaryApiUrl);
      
      const response = await fetch(primaryApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          forceFullSync: true, // 強制完整同步
          dryRun: options.dryRun || false,
          syncOrders: true,
          syncCustomers: true,
          triggerType: 'manual'
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // 轉換 API 回應格式為 MigrationResult
        return {
          success: result.success,
          message: result.message || '同步完成',
          stats: {
            ordersProcessed: result.stats?.ordersProcessed || 0,
            customersProcessed: result.stats?.customersProcessed || 0,
            productsProcessed: result.stats?.productsProcessed || 0,
            errors: result.stats?.errors || []
          }
        };
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        
        // 如果是環境變數問題，直接使用備用方案
        if (errorData.error && errorData.error.includes('環境變數')) {
          throw new Error(`Workers API 環境變數問題: ${errorData.error}`);
        }
        
        throw new Error(errorData.message || `API 請求失敗: ${response.status}`);
      }
    } catch (workerError: any) {
      console.warn('Cloudflare Workers API 失敗，嘗試備用 Supabase Edge Function:', workerError.message);
      
      // 嘗試備用的 Supabase Edge Function
      const fallbackApiUrl = 'https://skcdapfynyszxyqqsvib.supabase.co/functions/v1/migrate-sheets-data';
      
      try {
        console.log('使用備用 Supabase Edge Function:', fallbackApiUrl);
        
        const fallbackResponse = await fetch(fallbackApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_ANON_KEY' // 如果需要的話
          },
          body: JSON.stringify({
            sheetId: options.sheetId,
            dryRun: options.dryRun || false,
            skipExisting: options.skipExisting || true
          })
        });

        if (fallbackResponse.ok) {
          const fallbackResult = await fallbackResponse.json();
          return fallbackResult as MigrationResult;
        } else {
          const fallbackErrorData = await fallbackResponse.json().catch(() => ({}));
          throw new Error(fallbackErrorData.message || `備用 API 請求失敗: ${fallbackResponse.status}`);
        }
      } catch (fallbackError: any) {
        console.error('備用 API 也失敗:', fallbackError.message);
        // 如果所有 API 都失敗，拋出原始錯誤
        throw workerError;
      }
    }
  } catch (error: any) {
    console.error('資料遷移失敗:', error);
    throw new Error(`資料遷移失敗: ${error.message}`);
  }
}

/**
 * 驗證遷移後的資料完整性
 */
export async function validateMigrationData(): Promise<{
  ordersCount: number;
  customersCount: number;
  productsCount: number;
  issues: string[];
}> {
  try {
    const [ordersResult, customersResult, itemsResult] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('order_items').select('*', { count: 'exact', head: true })
    ]);

    const issues: string[] = [];

    if (ordersResult.error) {issues.push(`訂單查詢錯誤: ${ordersResult.error.message}`);}    
    if (customersResult.error) {issues.push(`客戶查詢錯誤: ${customersResult.error.message}`);}    
    if (itemsResult.error) {issues.push(`order_items 查詢錯誤: ${itemsResult.error.message}`);}    

    return {
      ordersCount: ordersResult.count || 0,
      customersCount: customersResult.count || 0,
      productsCount: itemsResult.count || 0,
      issues
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '資料驗證失敗');
  }
}

/**
 * 清空現有資料（危險操作，僅在重新遷移時使用）
 */
export async function clearExistingData(): Promise<void> {
  try {
    // 按照外鍵依賴順序刪除
    await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('現有資料已清空');
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '清空資料失敗');
  }
}