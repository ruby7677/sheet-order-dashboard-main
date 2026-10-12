import { OpenAPIRoute } from 'chanfana';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError, DashboardStats } from '../types';
import { OrderSheets } from '../services/OrderSheets';
import { CacheService } from '../services/CacheService';
import { getSheetNames } from '../services/SheetNames';
import { OrderColumn, OrderConflict, rowCells } from '../services/OrderContract';
import { tryNormalizePhoneIdentity } from '../services/PhoneIdentity';
import { publicApiError } from '../services/PublicApiError';
import { safeArrayAccess } from '../types';
import { countDashboardOrderDates } from '../services/DashboardCalendar';

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
			if (!env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
				throw new ApiError(503, '訂單資料服務尚未配置', 'GOOGLE_SHEETS_NOT_CONFIGURED');
			}
			const sheetNames = getSheetNames(env);
			const sheetsService = new OrderSheets(
				env.GOOGLE_SERVICE_ACCOUNT_KEY,
				env.GOOGLE_SHEET_ID,
				sheetNames.orders
			);
			const cacheService = new CacheService(
				env.CACHE_KV,
				parseInt(env.CACHE_DURATION || '15')
			);

			// 檢查快取
			const cacheKey = CacheService.generateKey('admin_dashboard_v2');
			let cachedData: any = null;

			if (!forceRefresh) {
				cachedData = await cacheService.get(cacheKey);
				if (cachedData) {
					c.header('X-Cache', 'HIT');
					// 如果有 timestamp 屬性則計算快取年齡，否則跳過
					if (cachedData.timestamp) {
						c.header('X-Cache-Age', Math.floor((Date.now() - cachedData.timestamp * 1000) / 1000).toString());
					}
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

			// 從 Google Sheets 獲取統計資料
			const dashboardStats = await this.getDashboardStatsFromSheet(sheetsService, sheetNames.customers);

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
			console.error('get_admin_dashboard.failed');
			if (error instanceof OrderConflict) {
				return c.json({ success: false, code: error.code, message: error.message }, error.status as 400 | 403 | 404 | 409 | 503);
			}
			const publicError = error instanceof ApiError
				? publicApiError(error, '無法從 Google Sheets 獲取儀表板統計資料')
				: { status: 500, code: 'ADMIN_DASHBOARD_READ_FAILED', message: '無法從 Google Sheets 獲取儀表板統計資料' };
			const errorResponse = {
				success: false,
				code: publicError.code,
				message: publicError.message,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, publicError.status as ContentfulStatusCode);
		}
	}

	/**
	 * 從 Google Sheets 獲取儀表板統計資料
	 * @param sheetsService Google Sheets 服務實例
	 */
	private async getDashboardStatsFromSheet(
		sheetsService: OrderSheets,
		customerSheetName: string
	): Promise<DashboardStats> {
		try {
			// Use the same bounded A:R snapshot and archive column as the order list.
			const sheetData = await sheetsService.rows();

			if (!sheetData || sheetData.length === 0) {
				return this.getEmptyStats();
			}

			// Share the fixed A:R positional contract with readOrders; exclude archive column R.
			const rows = sheetData.slice(1).map(rowCells).filter(row=>row[OrderColumn.customerName].trim()&&!row[OrderColumn.archivedAt]);

			// 計算統計資料
			const stats = this.calculateStats(rows);

			// 獲取客戶統計
			const customerStats = await this.getCustomerStats(sheetsService, customerSheetName);

			return {
				...stats,
				totalCustomers: customerStats.totalCustomers
			};

		} catch (error) {
			if (error instanceof ApiError) {throw error;}
			throw new ApiError(500, '無法取得儀表板統計資料', 'SHEET_ACCESS_ERROR');
		}
	}

	/**
	 * 計算統計資料
	 * @param rows 資料行
	 */
	private calculateStats(rows: Array<ReturnType<typeof rowCells>>) {
		const { todayOrders, weekOrders } = countDashboardOrderDates(rows.map(row => row[OrderColumn.timestamp]));
		let totalOrders = 0;
		let pendingOrders = 0;
		let completedOrders = 0;

		const statusBreakdown = {
			confirming: 0,
			processing: 0,
			shipping: 0,
			delivered: 0,
			cancelled: 0,
			completed: 0,
			pending: 0
		};

		const paymentBreakdown = {
			paid: 0,
			unpaid: 0,
			partial: 0
		};

		rows.forEach((row) => {
			totalOrders++;

			// 處理訂單狀態統計
			if (row[OrderColumn.status]) {
				const status = row[OrderColumn.status];
				switch (status) {
					case '訂單確認中':
						statusBreakdown.confirming++;
						statusBreakdown.pending++;
						pendingOrders++;
						break;
					case '已抄單':
						statusBreakdown.processing++;
						statusBreakdown.pending++;
						pendingOrders++;
						break;
					case '已出貨':
						statusBreakdown.shipping++;
						statusBreakdown.completed++;
						completedOrders++;
						break;
					case '已送達':
						statusBreakdown.delivered++;
						statusBreakdown.completed++;
						completedOrders++;
						break;
					case '取消訂單':
						statusBreakdown.cancelled++;
						completedOrders++;
						break;
					default:
						// 未知狀態視為待處理
						pendingOrders++;
						break;
				}
			} else {
				// 沒有狀態資訊視為待處理
				pendingOrders++;
			}

			// 處理付款狀態統計
			if (row[OrderColumn.paymentStatus]) {
				const paymentStatus = row[OrderColumn.paymentStatus];
				switch (paymentStatus) {
					case '已付款':
						paymentBreakdown.paid++;
						break;
					case '未付款':
						paymentBreakdown.unpaid++;
						break;
					case '部分付款':
						paymentBreakdown.partial++;
						break;
					default:
						// 未知付款狀態視為未付款
						paymentBreakdown.unpaid++;
						break;
				}
			} else {
				// 沒有付款狀態資訊視為未付款
				paymentBreakdown.unpaid++;
			}
		});

		return {
			todayOrders,
			weekOrders,
			pendingOrders,
			completedOrders,
			totalOrders,
			totalCustomers: 0, // 會在調用方處更新
			statusBreakdown,
			dailyStats: [] // TODO: 實現每日統計數據
		};
	}

	/**
	 * 獲取客戶統計資料
	 * @param sheetsService Google Sheets 服務實例
	 */
	private async getCustomerStats(sheetsService: OrderSheets, customerSheetName: string): Promise<{ totalCustomers: number }> {
		try {
			// 從客戶名單工作表獲取資料
			const customerSheetData = await sheetsService.getSheetData(customerSheetName);
			if (!customerSheetData || customerSheetData.length <= 1) {
				return { totalCustomers: 0 };
			}

			// 扣除標題行
			const header = safeArrayAccess(customerSheetData, 0);
			if (!header) return { totalCustomers: 0 };
			const nameIndex = header.indexOf('姓名');
			const phoneIndex = header.indexOf('電話');
			if (nameIndex < 0 || phoneIndex < 0) return { totalCustomers: 0 };

			const identities = new Set<string>();
			let invalidPhoneRows = 0;
			customerSheetData.slice(1).forEach((row, index) => {
				if (!row || !String(row[nameIndex] ?? '').trim() || !String(row[phoneIndex] ?? '').trim()) return;
				const identity = tryNormalizePhoneIdentity(String(row[phoneIndex] ?? ''));
				if (identity) identities.add(identity);
				else invalidPhoneRows++;
			});
			return { totalCustomers: identities.size + invalidPhoneRows };

		} catch (error) {
			if (error instanceof ApiError) throw error;
			throw new ApiError(500, '無法取得客戶統計資料', 'CUSTOMER_STATS_UNAVAILABLE');
		}
	}

	/**
	 * 取得空的統計資料
	 */
	private getEmptyStats(): DashboardStats {
		return {
			todayOrders: 0,
			weekOrders: 0,
			pendingOrders: 0,
			completedOrders: 0,
			totalOrders: 0,
			totalCustomers: 0,
			statusBreakdown: {
				confirming: 0,
				processing: 0,
				shipping: 0,
				delivered: 0,
				cancelled: 0,
				completed: 0,
				pending: 0
			},
			dailyStats: []
		};
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
