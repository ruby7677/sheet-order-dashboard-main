/**
 * 自動同步服務
 * 負責定期將 Google Sheets 數據同步到 Supabase
 */

import { SupabaseService } from './SupabaseService';
import { GoogleSheetsService } from './GoogleSheetsService';

export interface SyncResult {
  success: boolean;
  message: string;
  stats: {
    ordersProcessed: number;
    customersProcessed: number;
    productsProcessed: number;
    errors: string[];
  };
  timestamp: string;
}

export interface SyncOptions {
  forceFullSync?: boolean; // 強制完整同步，忽略增量邏輯
  dryRun?: boolean; // 試運行模式
  syncOrders?: boolean; // 是否同步訂單
  syncCustomers?: boolean; // 是否同步客戶
}

export class AutoSyncService {
  private supabaseService: SupabaseService;
  private sheetsService: GoogleSheetsService;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.supabaseService = new SupabaseService(env);
    this.sheetsService = new GoogleSheetsService(
      env.GOOGLE_SERVICE_ACCOUNT_KEY,
      env.GOOGLE_SHEET_ID
    );
  }

  /**
   * 執行自動同步
   */
  async executeAutoSync(options: SyncOptions = {}): Promise<SyncResult> {
    const {
      forceFullSync = false,
      dryRun = false,
      syncOrders = true,
      syncCustomers = true
    } = options;

    console.log('🔄 開始自動同步:', {
      forceFullSync,
      dryRun,
      syncOrders,
      syncCustomers,
      timestamp: new Date().toISOString()
    });

    const result: SyncResult = {
      success: true,
      message: '',
      stats: {
        ordersProcessed: 0,
        customersProcessed: 0,
        productsProcessed: 0,
        errors: []
      },
      timestamp: new Date().toISOString()
    };

    try {
      // 記錄同步開始
      await this.logSyncStart(dryRun);

      const syncPromises: Promise<any>[] = [];

      // 同步客戶資料
      if (syncCustomers) {
        console.log('📝 開始同步客戶資料...');
        syncPromises.push(
          this.syncCustomersData(forceFullSync, dryRun)
            .then(customerResult => {
              result.stats.customersProcessed = customerResult.processed;
              result.stats.errors.push(...customerResult.errors);
              console.log(`✅ 客戶同步完成: ${customerResult.processed} 筆`);
            })
            .catch(error => {
              console.error('❌ 客戶同步失敗:', error);
              result.stats.errors.push(`客戶同步失敗: ${error.message}`);
            })
        );
      }

      // 同步訂單資料
      if (syncOrders) {
        console.log('📋 開始同步訂單資料...');
        syncPromises.push(
          this.syncOrdersData(forceFullSync, dryRun)
            .then(orderResult => {
              result.stats.ordersProcessed = orderResult.processed;
              result.stats.productsProcessed = orderResult.itemsProcessed;
              result.stats.errors.push(...orderResult.errors);
              console.log(`✅ 訂單同步完成: ${orderResult.processed} 筆，項目: ${orderResult.itemsProcessed} 筆`);
            })
            .catch(error => {
              console.error('❌ 訂單同步失敗:', error);
              result.stats.errors.push(`訂單同步失敗: ${error.message}`);
            })
        );
      }

      // 等待所有同步完成
      await Promise.all(syncPromises);

      // 設定最終結果
      result.success = result.stats.errors.length === 0;
      result.message = result.success 
        ? `自動同步完成 - 訂單: ${result.stats.ordersProcessed}, 客戶: ${result.stats.customersProcessed}`
        : `自動同步完成但有錯誤 - 訂單: ${result.stats.ordersProcessed}, 客戶: ${result.stats.customersProcessed}, 錯誤: ${result.stats.errors.length}`;

      // 記錄同步完成
      await this.logSyncComplete(result, dryRun);

      console.log('🎉 自動同步結果:', result);
      return result;

    } catch (error) {
      console.error('💥 自動同步失敗:', error);
      result.success = false;
      result.message = `自動同步失敗: ${error instanceof Error ? error.message : error}`;
      result.stats.errors.push(result.message);

      // 記錄同步失敗
      await this.logSyncError(error, dryRun);

      return result;
    }
  }

  /**
   * 同步客戶資料
   */
  private async syncCustomersData(forceFullSync: boolean, dryRun: boolean) {
    const lastSyncTime = forceFullSync ? null : await this.getLastSyncTime('customers');
    console.log('👥 客戶資料最後同步時間:', lastSyncTime);

    // 從 Google Sheets 獲取客戶資料
    const customersData = await this.sheetsService.getCustomersData();
    console.log(`📊 從 Sheets 讀取到 ${customersData.length} 行客戶資料`);

    return await this.processCustomersData(customersData, dryRun, !forceFullSync);
  }

  /**
   * 同步訂單資料
   */
  private async syncOrdersData(forceFullSync: boolean, dryRun: boolean) {
    const lastSyncTime = forceFullSync ? null : await this.getLastSyncTime('orders');
    console.log('📋 訂單資料最後同步時間:', lastSyncTime);

    // 從 Google Sheets 獲取訂單資料
    const ordersData = await this.sheetsService.getOrdersData();
    console.log(`📊 從 Sheets 讀取到 ${ordersData.length} 行訂單資料`);

    return await this.processOrdersData(ordersData, dryRun, !forceFullSync);
  }

  /**
   * 處理客戶資料
   */
  private async processCustomersData(customersData: any[][], dryRun: boolean, skipExisting: boolean) {
    if (customersData.length === 0) {
      return { processed: 0, errors: [] };
    }

    const header = customersData[0];
    const rows = customersData.slice(1);
    const errors: string[] = [];
    let processed = 0;

    // 建立欄位映射
    const headerMap: { [key: string]: number } = {};
    if (header) {
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
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      if (!row || !row[headerMap['name']] || !row[headerMap['phone']]) {
        continue; // 跳過沒有必要資料的行
      }

      try {
        const customerData = {
          name: row[headerMap['name']]?.toString().trim() || '',
          phone: this.normalizePhone(row[headerMap['phone']]?.toString().trim() || ''),
          address: row[headerMap['address']]?.toString().trim() || '',
          delivery_method: row[headerMap['deliveryMethod']]?.toString().trim() || '',
          contact_method: row[headerMap['contactMethod']]?.toString().trim() || '',
          social_id: row[headerMap['socialId']]?.toString().trim() || '',
          created_at: this.parseDate(row[headerMap['orderTime']]) || new Date().toISOString()
        };

        if (dryRun) {
          console.log('🔍 試運行 - 客戶資料:', customerData);
          processed++;
          continue;
        }

        // 檢查是否已存在
        if (skipExisting) {
          const existing = await this.supabaseService.getCustomerByPhone(customerData.phone);
          if (existing) {
            console.log(`⏭️ 客戶已存在，跳過: ${customerData.phone}`);
            continue;
          }
        }

        // 更新或插入客戶資料
        await this.supabaseService.upsertCustomer(customerData);
        processed++;

      } catch (error) {
        const errorMsg = `處理客戶資料第 ${i + 2} 行時發生錯誤: ${error instanceof Error ? error.message : error}`;
        errors.push(errorMsg);
        console.error('❌', errorMsg);
      }
    }

    return { processed, errors };
  }

  /**
   * 處理訂單資料
   */
  private async processOrdersData(ordersData: any[][], dryRun: boolean, skipExisting: boolean) {
    if (ordersData.length === 0) {
      return { processed: 0, itemsProcessed: 0, errors: [] };
    }

    const rows = ordersData.slice(1); // 跳過標題行
    const errors: string[] = [];
    let processed = 0;
    let itemsProcessed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // 跳過空白行
      if (!row || !row[1] || row[1].toString().trim() === '') {
        continue;
      }

      try {
        const orderData = {
          order_number: `ORD-${(i + 1).toString().padStart(3, '0')}`,
          customer_name: row[1]?.toString().trim() || '',
          customer_phone: row[2]?.toString().trim() || '',
          delivery_method: row[3]?.toString().trim() || '',
          customer_address: row[4]?.toString().trim() || '',
          due_date: this.parseDate(row[5]),
          delivery_time: row[6]?.toString().trim() || '',
          notes: row[7]?.toString().trim() || '',
          payment_method: row[12]?.toString().trim() || '',
          status: row[14]?.toString().trim() || '訂單確認中',
          payment_status: row[15]?.toString().trim() || '未收費',
          total_amount: parseFloat(row[9]) || 0,
          google_sheet_id: i + 1,
          created_at: this.parseDate(row[0]) || new Date().toISOString()
        };

        if (dryRun) {
          console.log('🔍 試運行 - 訂單資料:', orderData);
          processed++;
          continue;
        }

        // 檢查是否已存在
        if (skipExisting) {
          const existing = await this.supabaseService.getOrderByGoogleSheetId(orderData.google_sheet_id);
          if (existing) {
            console.log(`⏭️ 訂單已存在，跳過: ${orderData.google_sheet_id}`);
            continue;
          }
        }

        // 更新或插入訂單資料
        const savedOrder = await this.supabaseService.upsertOrder(orderData);
        processed++;

        // 處理訂單項目
        if (savedOrder && savedOrder.id && row) {
          const itemsCount = await this.processOrderItems(savedOrder.id, row[8], dryRun);
          itemsProcessed += itemsCount;
        }

      } catch (error) {
        const errorMsg = `處理訂單第 ${i + 2} 行時發生錯誤: ${error instanceof Error ? error.message : error}`;
        errors.push(errorMsg);
        console.error('❌', errorMsg);
      }
    }

    return { processed, itemsProcessed, errors };
  }

  /**
   * 處理訂單項目
   */
  private async processOrderItems(orderId: string, itemsRaw: any, dryRun: boolean): Promise<number> {
    if (!itemsRaw) return 0;

    try {
      const itemsStr = itemsRaw.toString().trim();
      if (!itemsStr) return 0;

      const itemStrings = itemsStr.split(/[,，、\n]/).map((s: string) => s.trim()).filter(Boolean);
      const items = itemStrings.map((s: string) => {
        const m = s.split(/\s*[xX×]\s*/);
        const product = (m[0] ?? '').trim();
        const quantity = Math.max(0, parseInt((m[1] ?? '1'), 10) || 1);
        const price = Math.max(0, parseFloat(m[2] ?? '0') || 0);
        const subtotal = price * quantity;
        return { product, quantity, price, subtotal };
      }).filter((it: any) => it.product);

      if (dryRun) {
        console.log('🔍 試運行 - 訂單項目:', items);
        return items.length;
      }

      if (items.length > 0) {
        // 先刪除現有項目，再插入新項目（確保冪等性）
        await this.supabaseService.deleteOrderItems(orderId);
        await this.supabaseService.insertOrderItems(orderId, items);
      }

      return items.length;
    } catch (error) {
      console.error('❌ 處理訂單項目失敗:', error);
      return 0;
    }
  }

  /**
   * 獲取最後同步時間
   */
  private async getLastSyncTime(type: 'orders' | 'customers'): Promise<string | null> {
    try {
      return await this.supabaseService.getLastSyncTime(type);
    } catch (error) {
      console.warn('⚠️ 無法獲取最後同步時間:', error);
      return null;
    }
  }

  /**
   * 記錄同步開始
   */
  private async logSyncStart(dryRun: boolean) {
    try {
      await this.supabaseService.logSyncOperation({
        operation: 'AUTO_SYNC_START',
        table_name: 'auto_sync',
        sync_status: 'pending',
        old_data: null,
        new_data: { dryRun, timestamp: new Date().toISOString() }
      });
    } catch (error) {
      console.warn('⚠️ 記錄同步開始失敗:', error);
    }
  }

  /**
   * 記錄同步完成
   */
  private async logSyncComplete(result: SyncResult, dryRun: boolean) {
    try {
      await this.supabaseService.logSyncOperation({
        operation: 'AUTO_SYNC_COMPLETE',
        table_name: 'auto_sync',
        sync_status: result.success ? 'completed' : 'failed',
        old_data: null,
        new_data: { ...result, dryRun }
      });
    } catch (error) {
      console.warn('⚠️ 記錄同步完成失敗:', error);
    }
  }

  /**
   * 記錄同步錯誤
   */
  private async logSyncError(error: any, dryRun: boolean) {
    try {
      await this.supabaseService.logSyncOperation({
        operation: 'AUTO_SYNC_ERROR',
        table_name: 'auto_sync',
        sync_status: 'failed',
        old_data: null,
        new_data: { 
          error: error instanceof Error ? error.message : String(error),
          dryRun,
          timestamp: new Date().toISOString()
        }
      });
    } catch (logError) {
      console.warn('⚠️ 記錄同步錯誤失敗:', logError);
    }
  }

  /**
   * 正規化電話號碼 - 僅保留數字
   */
  private normalizePhone(phone: string): string {
    return (phone || '').replace(/[^0-9]/g, '');
  }

  /**
   * 解析日期
   */
  private parseDate(dateStr: string): string | null {
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch {
      // 忽略錯誤
    }
    
    return null;
  }
}