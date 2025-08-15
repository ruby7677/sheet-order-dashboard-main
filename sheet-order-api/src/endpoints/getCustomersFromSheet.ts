import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, Customer, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 從 Supabase 讀取客戶資料的 API 端點
 * 支援快取機制和強制刷新功能
 */
export class GetCustomersFromSheet extends OpenAPIRoute {
	schema = {
		tags: ['Customers'],
		summary: '從 Supabase 讀取客戶資料',
		description: '讀取 Supabase 中的所有客戶資料，支援 15 秒快取和強制刷新',
		request: {
			query: z.object({
				refresh: z.string().optional().describe('強制刷新快取 (設為 "1" 啟用)'),
				nonce: z.string().optional().describe('請求唯一識別碼')
			})
		},
		responses: {
			200: {
				description: '成功讀取客戶資料',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							data: z.array(Customer.extend({
								deliveryMethod: z.string().optional(),
								contactMethod: z.string().optional(),
								socialId: z.string().optional(),
								orderTime: z.string().optional(),
								items: z.string().optional()
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
		const requestId = this.generateRequestId();
		const startTime = Date.now();

		// 設定回應標頭
		c.header('X-Request-ID', requestId);
		c.header('Content-Type', 'application/json');

		try {
			// 解析查詢參數
			const { refresh, nonce } = c.req.query();
			const forceRefresh = refresh === '1';
			const actualRequestId = nonce || requestId;

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

			// 生成快取鍵
			const cacheKey = CacheService.generateKey('customers', 'all');

			// 檢查快取狀態
			const cacheStatus = await cacheService.getStatus(cacheKey);
			let useCache = false;

			if (!forceRefresh && cacheStatus.exists && !cacheStatus.expired) {
				useCache = true;
			}

			// 如果使用快取
			if (useCache) {
				const cachedData = await cacheService.get(cacheKey);
				if (cachedData) {
					c.header('X-Cache', 'HIT');
					c.header('X-Cache-Age', `${cacheStatus.age || 0}s`);
					c.header('X-Response-Time', `${Date.now() - startTime}ms`);
					return c.json(cachedData);
				}
			}

			// 快取未命中或強制刷新，從 Supabase 獲取資料
			c.header('X-Cache', 'MISS');
			if (forceRefresh) {
				c.header('X-Cache-Refresh', 'Forced');
			}

			// 從 Supabase 讀取資料
			const supabaseData = await supabaseService.getCustomers();

			if (!supabaseData || supabaseData.length === 0) {
				const emptyResponse = {
					success: true,
					data: [],
					timestamp: Math.floor(Date.now() / 1000),
					request_id: actualRequestId
				};

				// 快取空結果
				await cacheService.set(cacheKey, emptyResponse);
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json(emptyResponse);
			}

			// 處理資料轉換
			const customers = this.transformSupabaseDataToCustomers(supabaseData);

			const response = {
				success: true,
				data: customers,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: actualRequestId
			};

			// 更新快取
			await cacheService.set(cacheKey, response);

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('GetCustomersFromSheet 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '無法從 Supabase 獲取客戶資料',
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
	 * 將 Supabase 原始資料轉換為客戶物件陣列
	 * 保持與原有 API 格式的兼容性
	 */
	private transformSupabaseDataToCustomers(supabaseData: any[]): any[] {
		if (!supabaseData || supabaseData.length === 0) return [];

		return supabaseData.map((customer: any, index: number) => ({
			id: index, // 使用索引作為 ID 以保持兼容性
			name: customer.name || '',
			phone: customer.phone || '',
			address: customer.address || '',
			createdAt: customer.created_at || '',
			// 額外欄位
			deliveryMethod: customer.delivery_method || '',
			contactMethod: customer.contact_method || '',
			socialId: customer.social_id || '',
			orderTime: customer.created_at || '', // 使用 created_at 作為 orderTime
			items: '' // Supabase 客戶表中沒有直接的商品字段，留空
		}));
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