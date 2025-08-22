import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import type { AppContext } from '../types';
import { AutoSyncService } from '../services/AutoSyncService';

// 請求參數驗證 schema
const AutoSyncSchema = z.object({
  forceFullSync: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  syncOrders: z.boolean().optional().default(true),
  syncCustomers: z.boolean().optional().default(true),
  triggerType: z.enum(['manual', 'cron']).optional().default('manual')
});

export class AutoSyncOrders extends OpenAPIRoute {
  schema = {
    tags: ['Auto Sync'],
    summary: '自動同步 Google Sheets 資料到 Supabase',
    description: '定期自動同步訂單和客戶資料，支援增量同步和錯誤處理',
    request: {
      body: {
        content: {
          'application/json': {
            schema: AutoSyncSchema
          }
        }
      }
    },
    responses: {
      '200': {
        description: '同步成功',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
              stats: z.object({
                ordersProcessed: z.number(),
                customersProcessed: z.number(),
                productsProcessed: z.number(),
                errors: z.array(z.string())
              }),
              timestamp: z.string(),
              request_id: z.string()
            })
          }
        }
      },
      '500': {
        description: '同步失敗',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean().default(false),
              message: z.string(),
              error: z.string(),
              request_id: z.string()
            })
          }
        }
      }
    }
  };

  async handle(c: AppContext) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      console.log(`🚀 [${requestId}] 自動同步請求開始`);

      // 驗證環境變數
      if (!c.env.GOOGLE_SERVICE_ACCOUNT_KEY || !c.env.GOOGLE_SHEET_ID) {
        throw new Error('缺少必要的環境變數: GOOGLE_SERVICE_ACCOUNT_KEY 或 GOOGLE_SHEET_ID');
      }

      // 解析請求參數
      const requestBody = await c.req.json();
      const params = AutoSyncSchema.parse(requestBody);

      console.log(`📋 [${requestId}] 同步參數:`, params);

      // 檢查是否為 CRON 觸發
      const isCronTrigger = params.triggerType === 'cron' || 
                           c.req.header('CF-Cron') || 
                           c.req.header('X-Cron-Trigger');

      if (isCronTrigger) {
        console.log(`⏰ [${requestId}] CRON 觸發的自動同步`);
      } else {
        console.log(`👤 [${requestId}] 手動觸發的同步`);
      }

      // 創建自動同步服務
      const autoSyncService = new AutoSyncService(c.env);

      // 執行自動同步
      const result = await autoSyncService.executeAutoSync({
        forceFullSync: params.forceFullSync,
        dryRun: params.dryRun,
        syncOrders: params.syncOrders,
        syncCustomers: params.syncCustomers
      });

      const responseTime = Date.now() - startTime;

      // 設定回應標頭
      c.header('X-Request-ID', requestId);
      c.header('X-Response-Time', `${responseTime}ms`);
      c.header('X-Sync-Type', isCronTrigger ? 'cron' : 'manual');

      console.log(`✅ [${requestId}] 自動同步完成，耗時: ${responseTime}ms`);

      return c.json({
        ...result,
        request_id: requestId
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ [${requestId}] 自動同步失敗:`, error);

      // 設定錯誤回應標頭
      c.header('X-Request-ID', requestId);
      c.header('X-Response-Time', `${responseTime}ms`);
      c.header('X-Error', 'true');

      return c.json({
        success: false,
        message: '自動同步失敗',
        error: errorMessage,
        request_id: requestId
      }, 500);
    }
  }
}

export class GetSyncStatus extends OpenAPIRoute {
  schema = {
    tags: ['Auto Sync'],
    summary: '獲取同步狀態',
    description: '查詢最近的同步記錄和狀態',
    responses: {
      '200': {
        description: '狀態查詢成功',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                lastSyncTime: z.string().nullable(),
                lastSyncStatus: z.string().nullable(),
                recentSyncs: z.array(z.object({
                  timestamp: z.string(),
                  status: z.string(),
                  operation: z.string(),
                  message: z.string().optional()
                })),
                nextScheduledSync: z.string().nullable()
              }),
              request_id: z.string()
            })
          }
        }
      }
    }
  };

  async handle(c: AppContext) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      console.log(`📊 [${requestId}] 查詢同步狀態`);

      const autoSyncService = new AutoSyncService(c.env);
      
      // 獲取同步狀態（這需要在 SupabaseService 中實現）
      const statusData = {
        lastSyncTime: await autoSyncService['getLastSyncTime']('orders'),
        lastSyncStatus: 'unknown', // 需要從 sync_logs 表查詢
        recentSyncs: [], // 需要從 sync_logs 表查詢最近的同步記錄
        nextScheduledSync: null // 如果有固定排程，可以計算下一次執行時間
      };

      const responseTime = Date.now() - startTime;

      c.header('X-Request-ID', requestId);
      c.header('X-Response-Time', `${responseTime}ms`);

      console.log(`✅ [${requestId}] 同步狀態查詢完成`);

      return c.json({
        success: true,
        data: statusData,
        request_id: requestId
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ [${requestId}] 查詢同步狀態失敗:`, error);

      c.header('X-Request-ID', requestId);
      c.header('X-Response-Time', `${responseTime}ms`);
      c.header('X-Error', 'true');

      return c.json({
        success: false,
        message: '查詢同步狀態失敗',
        error: errorMessage,
        request_id: requestId
      }, 500);
    }
  }
}