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

    const apiUrl = `${getApiBaseUrl()}/sync/auto`;
    
    // 調用自動同步 API（公開的，不需要認證）
    const response = await fetch(apiUrl, {
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API 請求失敗: ${response.status}`);
    }

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
  } catch (error: any) {
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