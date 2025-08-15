import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, Order, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 從 Supabase 讀取訂單資料的 API 端點
 * 支援快取機制和強制刷新功能
 */
export class GetOrdersFromSheet extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '從 Supabase 讀取訂單資料',
		description: '讀取 Supabase 中的所有訂單資料，支援 15 秒快取和強制刷新',
		request: {
			query: z.object({
				refresh: z.string().optional().describe('強制刷新快取 (設為 "1" 啟用)'),
				_: z.string().optional().describe('時間戳參數')
			})
		},
		responses: {
			200: {
				description: '成功讀取訂單資料',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							data: z.array(Order).optional()
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
			const { refresh, _ } = c.req.query();
			const forceRefresh = refresh === '1';
			const timestamp = _ || Date.now().toString();

			// 檢查 Cloudflare 訪問（如原 PHP 邏輯）
			const cfConnectingIp = c.req.header('CF-Connecting-IP');
			const cfVisitor = c.req.header('CF-Visitor');
			const isCloudflareRequest = !!(cfConnectingIp || cfVisitor);

			if (isCloudflareRequest) {
				c.header('X-CF-Detected', 'Yes');
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

			// 生成快取鍵
			const cacheKey = CacheService.generateKey('orders', 'all');

			// 檢查快取狀態
			const cacheStatus = await cacheService.getStatus(cacheKey);
			let useCache = false;

			if (!forceRefresh && !isCloudflareRequest && cacheStatus.exists && !cacheStatus.expired) {
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
			const supabaseData = await supabaseService.getOrders();

			if (!supabaseData || supabaseData.length === 0) {
				const emptyResponse = {
					success: true,
					data: [],
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				};

				// 快取空結果
				await cacheService.set(cacheKey, emptyResponse);
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json(emptyResponse);
			}

			// 處理資料轉換
			const orders = this.transformSupabaseDataToOrders(supabaseData);

			const response = {
				success: true,
				data: orders,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			// 更新快取
			await cacheService.set(cacheKey, response);

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('GetOrdersFromSheet 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '讀取訂單資料時發生錯誤',
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	/**
	 * 將 Supabase 原始資料轉換為訂單物件陣列
	 * 保持與原有 API 格式的兼容性
	 */
	private transformSupabaseDataToOrders(supabaseData: any[]): any[] {
		if (!supabaseData || supabaseData.length === 0) return [];

		return supabaseData.map((order: any, index: number) => {
			// 處理商品明細
			let itemsText = '';
			if (order.order_items && order.order_items.length > 0) {
				itemsText = order.order_items.map((item: any) => 
					`${item.product_name} x${item.quantity}`
				).join(', ');
			}

			// 轉換日期格式
			let dueDate = '';
			if (order.due_date) {
				try {
					const dt = new Date(order.due_date);
					if (!isNaN(dt.getTime())) {
						dueDate = dt.toISOString().split('T')[0]; // YYYY-MM-DD 格式
					}
				} catch {
					dueDate = order.due_date.toString();
				}
			}

			return {
				createdAt: order.created_at || '',
				id: index + 1, // 使用序號作為 ID 以保持與原有系統兼容
				orderNumber: order.order_number || `ORD-${(index + 1).toString().padStart(3, '0')}`,
				customerName: order.customer_name || '',
				customerPhone: order.customer_phone || '',
				items: itemsText,
				amount: order.total_amount?.toString() || '0',
				dueDate: dueDate,
				deliveryTime: order.delivery_time || '',
				note: order.notes || '',
				status: order.status || '',
				deliveryMethod: order.delivery_method || '',
				deliveryAddress: order.delivery_address || '',
				paymentMethod: order.payment_method || '',
				paymentStatus: order.payment_status || ''
			};
		});
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