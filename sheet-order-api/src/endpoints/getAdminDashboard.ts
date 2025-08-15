import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { SupabaseService } from '../services/SupabaseService';
import { CacheService } from '../services/CacheService';

/**
 * 管理員儀表板統計資料 API 端點
 * 提供訂單統計、狀態分析等管理員儀表板所需的統計資料
 */
export class GetAdminDashboard extends OpenAPIRoute {
	schema = {
		tags: ['Admin'],
		summary: '取得管理員儀表板統計資料',
		description: '提供訂單統計、狀態分析等管理員儀表板所需的統計資料',
		request: {
			query: z.object({
				nonce: z.string().optional().describe('請求識別碼'),
				refresh: z.enum(['1']).optional().describe('強制刷新快取')
			})
		},
		responses: {
			200: {
				description: '成功取得儀表板統計資料',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							data: z.object({
								todayOrders: z.number().describe('今日訂單數'),
								weekOrders: z.number().describe('本週訂單數'),
								pendingOrders: z.number().describe('待處理訂單數'),
								completedOrders: z.number().describe('已完成訂單數'),
								totalOrders: z.number().describe('總訂單數'),
								totalCustomers: z.number().describe('總客戶數'),
								statusBreakdown: z.object({
									confirming: z.number().describe('訂單確認中'),
									copied: z.number().describe('已抄單'),
									shipped: z.number().describe('已出貨'),
									cancelled: z.number().describe('取消訂單')
								}).describe('訂單狀態分佈'),
								paymentBreakdown: z.object({
									paid: z.number().describe('已付款'),
									unpaid: z.number().describe('未付款'),
									partial: z.number().describe('部分付款')
								}).describe('付款狀態分佈')
							}).optional()
						})
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
			const forceRefresh = c.req.query('refresh') === '1';

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
			const cacheKey = CacheService.generateKey('admin_dashboard');
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

			// 從 Supabase 獲取統計資料
			const dashboardStats = await supabaseService.getAdminDashboard();

			// 準備回應資料
			const response = {
				success: true,
				data: dashboardStats,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			// 更新快取（快取時間較短，5分鐘）
			await cacheService.set(cacheKey, response, 300);

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('GetAdminDashboard 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '無法從 Supabase 獲取儀表板統計資料',
				error: error instanceof Error ? error.message : String(error),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	// 統計邏輯已移到 SupabaseService

	/**
	 * 生成請求 ID
	 */
	private generateRequestId(): string {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 9999) + 1000;
		return `${timestamp.toString(36)}-${random.toString(36)}`;
	}
}