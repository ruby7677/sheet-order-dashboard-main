import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 刪除 Supabase 訂單的 API 端點
 * 刪除訂單及其相關的商品明細
 */
export class DeleteOrder extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '刪除訂單',
		description: '從 Supabase 中刪除指定訂單及其相關商品明細',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							id: z.string().describe('訂單 ID (行索引)')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '訂單刪除成功',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional()
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
			const { id } = body;

			// 驗證必要參數
			if (!id) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少參數',
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

			// 直接刪除 Supabase 中的訂單
			try {
				await supabaseService.deleteOrder(id);
			} catch (error) {
				if (error instanceof Error && error.message.includes('找不到')) {
					c.header('X-Response-Time', `${Date.now() - startTime}ms`);
					return c.json({
						success: false,
						message: '指定的訂單不存在',
						timestamp: Math.floor(Date.now() / 1000),
						request_id: requestId
					}, 404);
				}
				throw error;
			}

			// 刪除成功後清除相關快取
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: '訂單已成功從 Supabase 中刪除',
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('DeleteOrder 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '刪除失敗: ' + (error instanceof Error ? error.message : String(error)),
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