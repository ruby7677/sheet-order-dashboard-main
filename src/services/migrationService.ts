import { supabase } from "@/integrations/supabase/client";
import SecureApiService from './secureApiService';

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
 * 執行 Google Sheets 到 Supabase 的資料遷移
 */
export async function migrateGoogleSheetsData(options: MigrationOptions): Promise<MigrationResult> {
  try {
    // 驗證 Sheet ID 格式
    if (!SecureApiService.validateSheetId(options.sheetId)) {
      throw new Error('無效的 Google Sheets ID 格式');
    }

    const apiService = new SecureApiService();
    const result = await apiService.migrateGoogleSheetsData(options.sheetId, {
      dryRun: options.dryRun || false,
      skipExisting: options.skipExisting || true
    });
    
    return result as MigrationResult;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '資料遷移失敗';
    throw new Error(`資料遷移失敗: ${message}`);
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
    const [ordersResult, customersResult, productsResult] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true })
    ]);

    const issues: string[] = [];

    if (ordersResult.error) issues.push(`訂單查詢錯誤: ${ordersResult.error.message}`);
    if (customersResult.error) issues.push(`客戶查詢錯誤: ${customersResult.error.message}`);
    if (productsResult.error) issues.push(`商品查詢錯誤: ${productsResult.error.message}`);

    return {
      ordersCount: ordersResult.count || 0,
      customersCount: customersResult.count || 0,
      productsCount: productsResult.count || 0,
      issues
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '資料驗證失敗';
    throw new Error(message);
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '清空資料失敗';
    throw new Error(message);
  }
}