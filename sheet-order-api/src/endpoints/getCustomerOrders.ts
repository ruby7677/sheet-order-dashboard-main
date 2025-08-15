import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 客戶訂單歷史查詢 API 端點
 * 根據客戶電話號碼查詢該客戶的所有訂單歷史記錄
 */
export class GetCustomerOrders extends OpenAPIRoute {
	schema = {
		tags: ['Customers'],
		summary: '取得客戶訂單歷史',
		description: '根據客戶電話號碼查詢該客戶的所有訂單歷史記錄',
		request: {
			query: z.object({
				phone: z.string().min(1).describe('客戶電話號碼'),
				nonce: z.string().optional().describe('請求識別碼'),
				refresh: z.enum(['1']).optional().describe('強制刷新快取')
			})
		},
		responses: {
			200: {
				description: '成功取得客戶訂單歷史',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							data: z.array(z.object({
								id: z.number().describe('訂單行號'),
								orderTime: z.string().describe('訂單時間'),
								items: z.string().describe('購買項目'),
								name: z.string().describe('客戶姓名')
							})).optional()
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
		const requestId = c.req.query('nonce') || this.generateRequestId();
		const startTime = Date.now();

		// 設定回應標頭
		c.header('X-Request-ID', requestId);
		c.header('Content-Type', 'application/json');

		try {
			// 獲取查詢參數
			const phone = c.req.query('phone');
			const forceRefresh = c.req.query('refresh') === '1';

			// 驗證必要參數
			if (!phone) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少必要參數：phone',
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

			// 檢查快取
			const cacheKey = CacheService.generateKey('customer_orders', phone);
			let cachedData = null;

			if (!forceRefresh) {
				cachedData = await cacheService.get(cacheKey);
				if (cachedData) {
					c.header('X-Cache', 'HIT');
					c.header('X-Cache-Age', Math.floor((Date.now() - cachedData.timestamp * 1000) / 1000).toString());
					c.header('X-Response-Time', `${Date.now() - startTime}ms`);
					return c.json({
						...cachedData,
						request_id: requestId
					});
				}
			}

			// 快取未命中或強制刷新
			c.header('X-Cache', 'MISS');
			if (forceRefresh) {
				c.header('X-Cache-Refresh', 'Forced');
			}

			// 從 Supabase 獲取客戶訂單資料
			const customerData = await supabaseService.getCustomerOrders(phone);

			// 準備回應資料
			const response = {
				success: true,
				data: customerData,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			// 更新快取
			await cacheService.set(cacheKey, response);

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('GetCustomerOrders 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '無法從 Supabase 獲取客戶訂單資料',
				error: error instanceof Error ? error.message : String(error),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	// 這些方法不再需要，因為 SupabaseService 直接處理客戶訂單查詢

	/**
	 * 生成請求 ID
	 */
	private generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 9999) + 1000;
		return `${timestamp.toString(36)}-${random.toString(36)}`;
	}
}