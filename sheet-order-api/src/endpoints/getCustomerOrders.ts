import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
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
			const sheetsService = new GoogleSheetsService(
				env.GOOGLE_SERVICE_ACCOUNT_KEY,
				env.GOOGLE_SHEET_ID
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

			// 從 Google Sheets 獲取客戶名單資料
			const customerData = await this.getCustomerOrdersFromSheet(
				sheetsService,
				phone
			);

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
				message: error instanceof ApiError ? error.message : '無法從 Google Sheets 獲取客戶訂單資料',
				error: error instanceof Error ? error.message : String(error),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	/**
	 * 從 Google Sheets 獲取客戶訂單歷史
	 * @param sheetsService Google Sheets 服務實例
	 * @param phone 客戶電話號碼
	 */
	private async getCustomerOrdersFromSheet(
		sheetsService: GoogleSheetsService,
		phone: string
	): Promise<any[]> {
		try {
			// 從客戶名單工作表獲取資料
			const sheetName = '客戶名單';
			const sheetData = await sheetsService.getSheetData(sheetName);

			if (!sheetData || sheetData.length === 0) {
				return [];
			}

			// 第一行是標題
			const header = sheetData[0];
			const rows = sheetData.slice(1);

			// 建立標題映射
			const headerMap = this.buildHeaderMap(header);

			// 確保必要的欄位存在
			if (!headerMap.phone || !headerMap.orderTime || !headerMap.items) {
				throw new ApiError(500, '客戶名單工作表缺少必要欄位', 'MISSING_REQUIRED_FIELDS');
			}

			// 查找匹配的訂單
			const matchingOrders = this.findMatchingOrders(rows, headerMap, phone);

			// 根據列數排序（列數越小的為最早訂購的資訊）
			matchingOrders.sort((a, b) => a.id - b.id);

			return matchingOrders;

		} catch (error) {
			if (error instanceof ApiError) throw error;
			throw new ApiError(500, `獲取客戶訂單資料失敗: ${error instanceof Error ? error.message : String(error)}`, 'SHEET_ACCESS_ERROR');
		}
	}

	/**
	 * 建立標題欄位映射
	 * @param header 標題行資料
	 */
	private buildHeaderMap(header: any[]): { [key: string]: number } {
		const headerMap: { [key: string]: number } = {};

		header.forEach((title, idx) => {
			switch (title) {
				case '姓名':
					headerMap.name = idx;
					break;
				case '電話':
					headerMap.phone = idx;
					break;
				case '取貨方式':
					headerMap.deliveryMethod = idx;
					break;
				case '地址':
					headerMap.address = idx;
					break;
				case '透過什麼聯繫賣家':
					headerMap.contactMethod = idx;
					break;
				case '社交軟體名字':
					headerMap.socialId = idx;
					break;
				case '訂單時間':
					headerMap.orderTime = idx;
					break;
				case '購買項目':
					headerMap.items = idx;
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
	 * 查找匹配的訂單記錄
	 * @param rows 資料行
	 * @param headerMap 標題映射
	 * @param phone 查詢的電話號碼
	 */
	private findMatchingOrders(
		rows: any[][],
		headerMap: { [key: string]: number },
		phone: string
	): any[] {
		const matchingOrders: any[] = [];

		rows.forEach((row, idx) => {
			// 確保資料完整性
			if (!row || row.length === 0) return;
			if (!row[headerMap.phone]) return;

			// 檢查電話是否匹配
			const rowPhone = row[headerMap.phone];

			// 使用電話號碼標準化比對
			if (this.isPhoneMatch(phone, rowPhone)) {
				// 獲取訂單時間和購買項目
				const orderTime = row[headerMap.orderTime] || '';
				const items = row[headerMap.items] || '';

				// 只有當訂單時間或購買項目不為空時才加入結果
				if (orderTime || items) {
					matchingOrders.push({
						id: idx, // 行索引作為 ID
						orderTime: orderTime,
						items: items,
						name: row[headerMap.name] || ''
					});
				}
			}
		});

		return matchingOrders;
	}

	/**
	 * 電話號碼匹配檢查
	 * 標準化電話號碼並比較後九碼
	 * @param queryPhone 查詢的電話號碼
	 * @param rowPhone 資料行中的電話號碼
	 */
	private isPhoneMatch(queryPhone: string, rowPhone: string): boolean {
		// 標準化電話號碼，只保留數字
		const normalizedQueryPhone = queryPhone.replace(/[^0-9]/g, '');
		const normalizedRowPhone = rowPhone.replace(/[^0-9]/g, '');

		// 取得後九碼進行比較（如果電話號碼長度大於9）
		const lastNineQuery = normalizedQueryPhone.length >= 9 
			? normalizedQueryPhone.slice(-9) 
			: normalizedQueryPhone;
		const lastNineRow = normalizedRowPhone.length >= 9 
			? normalizedRowPhone.slice(-9) 
			: normalizedRowPhone;

		// 比較電話號碼的後九碼
		return lastNineQuery === lastNineRow;
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