import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, Customer, ApiResponse, ApiError } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { CacheService } from '../services/CacheService';

/**
 * 從 Google Sheets 讀取客戶資料的 API 端點
 * 支援快取機制和強制刷新功能
 */
export class GetCustomersFromSheet extends OpenAPIRoute {
	schema = {
		tags: ['Customers'],
		summary: '從 Google Sheets 讀取客戶資料',
		description: '讀取 Google Sheets 中的所有客戶資料，支援 15 秒快取和強制刷新',
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
			const sheetsService = new GoogleSheetsService(
				env.GOOGLE_SERVICE_ACCOUNT_KEY,
				env.GOOGLE_SHEET_ID
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

			// 快取未命中或強制刷新，從 Google Sheets 獲取資料
			c.header('X-Cache', 'MISS');
			if (forceRefresh) {
				c.header('X-Cache-Refresh', 'Forced');
			}

			// 從 Google Sheets 讀取資料（客戶名單工作表）
			const sheetData = await sheetsService.getSheetData('客戶名單');

			if (!sheetData || sheetData.length === 0) {
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

			// 處理資料轉換（參考原 PHP 邏輯）
			const customers = this.transformSheetDataToCustomers(sheetData);

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
				message: error instanceof ApiError ? error.message : '無法從 Google Sheets 獲取客戶資料',
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
	 * 將 Google Sheets 原始資料轉換為客戶物件陣列
	 * 參考原始 PHP 檔案的轉換邏輯，支援動態標題映射
	 */
	private transformSheetDataToCustomers(sheetData: any[][]): any[] {
		if (sheetData.length === 0) {return [];}

		// 第一行是標題
		const header = sheetData[0];
		const dataRows = sheetData.slice(1);

		// 建立標題映射（參考原 PHP 邏輯）
		const headerMap: { [key: string]: number } = {};
		header.forEach((title: string, idx: number) => {
			switch (title) {
				case '姓名':
					headerMap['name'] = idx;
					break;
				case '電話':
					headerMap['phone'] = idx;
					break;
				case '取貨方式':
					headerMap['deliveryMethod'] = idx;
					break;
				case '地址':
					headerMap['address'] = idx;
					break;
				case '透過什麼聯繫賣家':
					headerMap['contactMethod'] = idx;
					break;
				case '社交軟體名字':
					headerMap['socialId'] = idx;
					break;
				case '訂單時間':
					headerMap['orderTime'] = idx;
					break;
				case '購買項目':
					headerMap['items'] = idx;
					break;
				default:
					// 其他欄位，使用小寫作為鍵
					headerMap[title.toLowerCase()] = idx;
					break;
			}
		});

		const customers = [];
		dataRows.forEach((row: any[], idx: number) => {
			// 確保資料完整性
			if (!row || row.length === 0) {return;}
			
			// 檢查必要欄位
			if (!headerMap.hasOwnProperty('name') || !row[headerMap['name']] ||
				!headerMap.hasOwnProperty('phone') || !row[headerMap['phone']]) {
				return;
			}

			// 建立客戶物件
			customers.push({
				id: idx,
				name: row[headerMap['name']] || '',
				phone: row[headerMap['phone']] || '',
				address: (headerMap['address'] !== undefined && row[headerMap['address']]) ? row[headerMap['address']] : '',
				createdAt: (headerMap['orderTime'] !== undefined && row[headerMap['orderTime']]) ? row[headerMap['orderTime']] : '',
				// 額外欄位
				deliveryMethod: (headerMap['deliveryMethod'] !== undefined && row[headerMap['deliveryMethod']]) ? row[headerMap['deliveryMethod']] : '',
				contactMethod: (headerMap['contactMethod'] !== undefined && row[headerMap['contactMethod']]) ? row[headerMap['contactMethod']] : '',
				socialId: (headerMap['socialId'] !== undefined && row[headerMap['socialId']]) ? row[headerMap['socialId']] : '',
				orderTime: (headerMap['orderTime'] !== undefined && row[headerMap['orderTime']]) ? row[headerMap['orderTime']] : '',
				items: (headerMap['items'] !== undefined && row[headerMap['items']]) ? row[headerMap['items']] : ''
			});
		});

		return customers;
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