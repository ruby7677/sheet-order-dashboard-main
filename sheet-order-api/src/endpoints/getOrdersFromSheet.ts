import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, Order, ApiResponse, ApiError, isValidEnv, safeArrayAccess } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { CacheService } from '../services/CacheService';

/**
 * 從 Google Sheets 讀取訂單資料的 API 端點
 * 支援快取機制和強制刷新功能
 */
export class GetOrdersFromSheet extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '從 Google Sheets 讀取訂單資料',
		description: '讀取 Google Sheets 中的所有訂單資料，支援 15 秒快取和強制刷新',
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
			
			// 驗證環境變數
			if (!isValidEnv(env)) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '環境配置錯誤：缺少必要的環境變數',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 500);
			}
			
			const sheetsService = new GoogleSheetsService(
				env.GOOGLE_SERVICE_ACCOUNT_KEY,
				env.GOOGLE_SHEET_ID
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

			// 快取未命中或強制刷新，從 Google Sheets 獲取資料
			c.header('X-Cache', 'MISS');
			if (forceRefresh) {
				c.header('X-Cache-Refresh', 'Forced');
			}

			// 從 Google Sheets 讀取資料
			const sheetData = await sheetsService.getSheetData('Sheet1');

			if (!sheetData || sheetData.length === 0) {
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

			// 處理資料轉換（參考原 PHP 邏輯）
			const orders = this.transformSheetDataToOrders(sheetData);

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
			return c.json(errorResponse, statusCode as 200 | 400 | 401 | 403 | 404 | 422 | 500);
		}
	}

	/**
	 * 將 Google Sheets 原始資料轉換為訂單物件陣列
	 * 參考原始 PHP 檔案的轉換邏輯
	 */
	private transformSheetDataToOrders(sheetData: string[][]): Array<z.infer<typeof Order>> {
		if (!sheetData || sheetData.length === 0) {
			return [];
		}

		// 第一列為標題，跳過
		const orders: Array<z.infer<typeof Order>> = [];
		
		for (let idx = 1; idx < sheetData.length; idx++) {
			const row = safeArrayAccess(sheetData, idx);
			if (!row) continue;

			// 安全存取陣列元素
			const customerName = safeArrayAccess(row, 1);
			
			// 跳過空白列（已刪除訂單或空白）
			if (!customerName || customerName.toString().trim() === '') {
				continue;
			}

			// 轉換到貨日期格式
			const rawDate = safeArrayAccess(row, 5) || '';
			let dueDate: string = '';
			if (rawDate) {
				try {
					const dt = new Date(rawDate);
					if (!isNaN(dt.getTime())) {
						dueDate = dt.toISOString().split('T')[0] || ''; // YYYY-MM-DD 格式
					} else {
						dueDate = String(rawDate);
					}
				} catch {
					dueDate = String(rawDate);
				}
			}

			// 建立訂單物件（對應原 PHP 的欄位映射）
			orders.push({
				createdAt: safeArrayAccess(row, 0) || '', // A欄 訂單時間
				id: idx, // 使用當前行索引作為 ID
				orderNumber: `ORD-${idx.toString().padStart(3, '0')}`, // 生成格式化的訂單編號
				customerName: customerName || '', // B欄 客戶姓名
				customerPhone: safeArrayAccess(row, 2) || '', // C欄 客戶電話
				items: safeArrayAccess(row, 8) || '', // I欄 訂購商品
				amount: safeArrayAccess(row, 9) || '', // J欄 訂單金額
				dueDate: dueDate, // F欄 到貨日期 (已轉為 YYYY-MM-DD)
				deliveryTime: safeArrayAccess(row, 6) || '', // G欄 宅配時段
				note: safeArrayAccess(row, 7) || '', // H欄 備註
				status: safeArrayAccess(row, 14) || '', // O欄 訂單狀態
				deliveryMethod: safeArrayAccess(row, 3) || '', // D欄 配送方式
				deliveryAddress: safeArrayAccess(row, 4) || '', // E欄 配送地址
				paymentMethod: safeArrayAccess(row, 12) || '', // M欄 付款方式
				paymentStatus: safeArrayAccess(row, 15) || '' // P欄 款項狀態
			});
		}

		return orders;
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