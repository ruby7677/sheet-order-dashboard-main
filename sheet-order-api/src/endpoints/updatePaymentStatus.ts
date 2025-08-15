import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 更新 Supabase 付款狀態的 API 端點
 * 直接更新指定訂單的付款狀態欄位
 */
export class UpdatePaymentStatus extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '更新付款狀態',
		description: '更新 Supabase 中指定訂單的付款狀態（款項欄位）',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							id: z.string().describe('訂單 ID'),
							status: z.enum(['', '未收費', '已收費', '待轉帳', '未全款', '特殊']).describe('新的付款狀態')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '付款狀態更新成功',
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
			const { id: rowId, status: paymentStatus } = body;

			// 驗證必要參數
			if (rowId === null || rowId === undefined || !paymentStatus) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少必要參數',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 400);
			}

			// 驗證 rowId 是否為有效的非負整數
			const parsedRowId = parseInt(rowId.toString());
			if (isNaN(parsedRowId) || parsedRowId < 0) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '行 ID 必須為非負整數',
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

			// 直接更新 Supabase 中的付款狀態
			// 由於前端可能傳入的是行索引，我們需要轉換為實際的訂單 ID
			try {
				await supabaseService.updatePaymentStatus(rowId.toString(), paymentStatus);
			} catch (error) {
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
				message: '付款狀態已成功更新',
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('UpdatePaymentStatus 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '無法更新付款狀態',
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