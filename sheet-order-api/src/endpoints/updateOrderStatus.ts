import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 更新 Supabase 訂單狀態的 API 端點
 * 支援四種合法狀態更新並自動清除相關快取
 */
export class UpdateOrderStatus extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '更新訂單狀態',
		description: '更新 Supabase 中指定訂單的狀態，僅允許四種合法狀態值',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							id: z.string().describe('訂單 ID'),
							status: z.enum(['訂單確認中', '已抄單', '已出貨', '取消訂單']).describe('新的訂單狀態')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '訂單狀態更新成功',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional()
						})
					}
				}
			},
			400: {
				description: '請求參數錯誤或狀態值不正確',
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

	// 合法的訂單狀態值（參考原 PHP 檔案）
	private readonly VALID_STATUSES = ['訂單確認中', '已抄單', '已出貨', '取消訂單'] as const;

	async handle(c: AppContext) {
		const requestId = this.generateRequestId();
		const startTime = Date.now();

		// 設定回應標頭
		c.header('X-Request-ID', requestId);
		c.header('Content-Type', 'application/json');

		try {
			// 解析請求體
			const body = await c.req.json();
			const { id, status } = body;

			// 驗證必要參數
			if (!id || !status) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少參數',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 400);
			}

			// 驗證狀態值是否合法（參考原 PHP 邏輯）
			if (!this.VALID_STATUSES.includes(status as any)) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '狀態值不正確',
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

			// 直接更新 Supabase 中的訂單狀態
			// 由於前端傳入的 id 可能是索引值，我們需要先轉換為實際的訂單 ID
			// 為了保持兼容性，我們可以使用 order_number 或其他方式來識別訂單
			try {
				await supabaseService.updateOrderStatus(id, status);
			} catch (error) {
				// 如果直接用 ID 失敗，可能是因為 ID 格式問題
				// 這種情況下返回錯誤
				if (error instanceof Error && error.message.includes('找不到')) {
					c.header('X-Response-Time', `${Date.now() - startTime}ms`);
					return c.json({
						success: false,
						message: '找不到指定訂單',
						timestamp: Math.floor(Date.now() / 1000),
						request_id: requestId
					}, 404);
				}
				throw error;
			}

			// 更新成功後清除相關快取（參考原 PHP 邏輯）
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: '訂單狀態已成功更新',
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('UpdateOrderStatus 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '無法更新訂單狀態',
				error: error instanceof ApiError ? undefined : (error instanceof Error ? error.message : String(error)),
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
	 * 參考原 PHP 檔案邏輯，更新後需要清除訂單快取確保下次讀取最新資料
	 */
	private async clearRelatedCache(cacheService: CacheService): Promise<void> {
		try {
			// 清除訂單相關的快取
			const ordersCacheKey = CacheService.generateKey('orders', 'all');
			await cacheService.delete(ordersCacheKey);

			// 可以根據需要清除其他相關快取
			// 例如：特定訂單的快取、統計資料快取等
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