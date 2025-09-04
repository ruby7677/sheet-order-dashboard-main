import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError, safeArrayAccess, DashboardStats } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
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
			const sheetsService = new GoogleSheetsService(
				env.GOOGLE_SERVICE_ACCOUNT_KEY,
				env.GOOGLE_SHEET_ID
			);
			const cacheService = new CacheService(
				env.CACHE_KV,
				parseInt(env.CACHE_DURATION || '15')
			);

			// 檢查快取
			const cacheKey = CacheService.generateKey('admin_dashboard');
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
			const dashboardStats = await this.getDashboardStatsFromSheet(sheetsService);

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
				message: error instanceof ApiError ? error.message : '無法從 Google Sheets 獲取儀表板統計資料',
				error: error instanceof Error ? error.message : String(error),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as 200 | 400 | 401 | 403 | 404 | 422 | 500);
		}
	}

	/**
	 * 從 Google Sheets 獲取儀表板統計資料
	 * @param sheetsService Google Sheets 服務實例
	 */
	private async getDashboardStatsFromSheet(
		sheetsService: GoogleSheetsService
	): Promise<DashboardStats> {
		try {
			// 從訂單工作表獲取資料
			const sheetName = '訂單';
			const sheetData = await sheetsService.getSheetData(sheetName);

			if (!sheetData || sheetData.length === 0) {
				return this.getEmptyStats();
			}

			// 第一行是標題
			const header = safeArrayAccess(sheetData, 0);
			if (!header) {
				return this.getEmptyStats();
			}
			
			const rows = sheetData.slice(1);

			// 建立標題映射
			const headerMap = this.buildHeaderMap(header);

			// 計算統計資料
			const stats = this.calculateStats(rows, headerMap);

			// 獲取客戶統計
			const customerStats = await this.getCustomerStats(sheetsService);

			return {
				...stats,
				totalCustomers: customerStats.totalCustomers
			};

		} catch (error) {
			if (error instanceof ApiError) {throw error;}
			throw new ApiError(500, `獲取儀表板統計資料失敗: ${error instanceof Error ? error.message : String(error)}`, 'SHEET_ACCESS_ERROR');
		}
	}

	/**
	 * 建立標題欄位映射
	 * @param header 標題行資料
	 */
	private buildHeaderMap(header: string[]): { [key: string]: number } {
		const headerMap: { [key: string]: number } = {};

		header.forEach((title, idx) => {
			switch (title) {
				case '訂單時間':
					headerMap.orderTime = idx;
					break;
				case '訂單狀態':
					headerMap.orderStatus = idx;
					break;
				case '付款狀態':
					headerMap.paymentStatus = idx;
					break;
				default:
					// 其他欄位使用小寫作為鍵
					headerMap[title.toLowerCase()] = idx;
					break;
			}
		});

		return headerMap;
	}

	/**
	 * 計算統計資料
	 * @param rows 資料行
	 * @param headerMap 標題映射
	 */
	private calculateStats(rows: string[][], headerMap: { [key: string]: number }) {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const weekStart = new Date(today);
		weekStart.setDate(today.getDate() - today.getDay()); // 本週開始（週日）

		let todayOrders = 0;
		let weekOrders = 0;
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
			if (!row || row.length === 0) {return;}

			totalOrders++;

			// 處理訂單時間統計
			if (headerMap.orderTime !== undefined && row[headerMap.orderTime]) {
				const orderTimeStr = row[headerMap.orderTime];
				if (orderTimeStr && typeof orderTimeStr === 'string') {
					const orderDate = this.parseOrderDate(orderTimeStr);

					if (orderDate) {
						// 今日訂單
						if (orderDate >= today) {
							todayOrders++;
						}

						// 本週訂單
						if (orderDate >= weekStart) {
							weekOrders++;
						}
					}
				}
			}

			// 處理訂單狀態統計
			if (headerMap.orderStatus !== undefined && row[headerMap.orderStatus]) {
				const status = row[headerMap.orderStatus];
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
			if (headerMap.paymentStatus !== undefined && row[headerMap.paymentStatus]) {
				const paymentStatus = row[headerMap.paymentStatus];
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
	private async getCustomerStats(sheetsService: GoogleSheetsService): Promise<{ totalCustomers: number }> {
		try {
			// 從客戶名單工作表獲取資料
			const customerSheetData = await sheetsService.getSheetData('客戶名單');
			if (!customerSheetData || customerSheetData.length <= 1) {
				return { totalCustomers: 0 };
			}

			// 扣除標題行
			const totalCustomers = customerSheetData.length - 1;
			return { totalCustomers };

		} catch (error) {
			// 如果客戶名單工作表不存在或無法存取，返回 0
			console.warn('無法獲取客戶統計資料:', error);
			return { totalCustomers: 0 };
		}
	}

	/**
	 * 解析訂單時間字串
	 * @param orderTimeStr 訂單時間字串
	 */
	private parseOrderDate(orderTimeStr: string): Date | null {
		try {
			// 嘗試多種日期格式
			const formats = [
				// ISO 格式
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
				// 台灣常見格式
				/^\d{4}\/\d{1,2}\/\d{1,2}/,
				/^\d{4}-\d{1,2}-\d{1,2}/,
				// 其他格式
				/^\d{1,2}\/\d{1,2}\/\d{4}/
			];

			for (const format of formats) {
				if (format.test(orderTimeStr)) {
					const date = new Date(orderTimeStr);
					if (!isNaN(date.getTime())) {
						return date;
					}
				}
			}

			return null;
		} catch (error) {
			return null;
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