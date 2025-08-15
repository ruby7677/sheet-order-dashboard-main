import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 批量刪除 Supabase 訂單的 API 端點
 * 支援一次刪除多個訂單
 */
export class BatchDeleteOrders extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '批量刪除訂單',
		description: '從 Supabase 中批量刪除指定訂單',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							ids: z.array(z.string()).min(1).describe('要刪除的訂單 ID 陣列')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '批量刪除完成',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional(),
							results: z.array(z.object({
								id: z.string(),
								success: z.boolean(),
								message: z.string(),
								orderNumber: z.string().optional()
							})).optional(),
							totalDeleted: z.number().optional(),
							totalFailed: z.number().optional(),
							reorder_result: z.object({
								success: z.boolean(),
								message: z.string(),
								updated_rows: z.number()
							}).optional()
						})
					}
				}
			},
			400: {
				description: '請求參數錯誤',
				content: {
					'application/json': {
						schema: ApiResponse
					}
				}
			},
			404: {
				description: '找不到指定訂單',
				content: {
					'application/json': {
						schema: ApiResponse
					}
				}
			},
			500: {
				description: '伺服器內部錯誤',
				content: {
					'application/json': {
						schema: ApiResponse
					}
				}
			}
		}
	};

	async handle(c: AppContext) {
		const requestId = this.generateRequestId();
		const startTime = Date.now();

		// 設定回應標頭
		c.header('X-Request-ID', requestId);
		c.header('Content-Type', 'application/json');

		try {
			// 解析請求體
			const body = await c.req.json();
			const { ids } = body;

			// 驗證必要參數
			if (!ids || !Array.isArray(ids) || ids.length === 0) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少參數或參數格式錯誤',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 400);
			}

			// 初始化服務
			const env = c.env;
			const supabaseService = new SupabaseService(
				env.SUPABASE_URL,
				env.SUPABASE_ANON_KEY
			);
			const cacheService = new CacheService(
				env.CACHE_KV,
				parseInt(env.CACHE_DURATION || '15')
			);

			// 執行批量刪除
			const deleteResults = await supabaseService.batchDeleteOrders(ids);

			// 刪除成功後清除相關快取
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: `批次刪除完成：成功 ${deleteResults.success} 筆，失敗 ${deleteResults.failed} 筆`,
				results: deleteResults.results,
				totalDeleted: deleteResults.success,
				totalFailed: deleteResults.failed,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('BatchDeleteOrders 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '批量刪除失敗: ' + (error instanceof Error ? error.message : String(error)),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	/**
	 * 清除相關快取
	 * 參考原 PHP 檔案邏輯，刪除後需要清除訂單快取確保下次讀取最新資料
	 */
	private async clearRelatedCache(cacheService: CacheService): Promise<void> {
		try {
			// 清除訂單相關的快取
			const ordersCacheKey = CacheService.generateKey('orders', 'all');
			await cacheService.delete(ordersCacheKey);

			// 可以根據需要清除其他相關快取
			// 例如：客戶快取、統計資料快取等
		} catch (error) {
			// 快取清除失敗不應影響主要操作
			console.warn('清除快取時發生錯誤:', error);
		}
	}

	/**
	 * 生成請求 ID
	 */
	private generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 9999) + 1000;
		return `${timestamp.toString(36)}-${random.toString(36)}`;
	}
}