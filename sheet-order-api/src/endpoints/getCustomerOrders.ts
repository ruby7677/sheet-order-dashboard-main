import { OpenAPIRoute } from 'chanfana';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError, safeArrayAccess } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { normalizePhoneIdentity, PhoneIdentityError, tryNormalizePhoneIdentity } from '../services/PhoneIdentity';
import { getCustomerSheetName } from '../services/SheetNames';
import { OrderConflict } from '../services/OrderContract';
import { publicApiError } from '../services/PublicApiError';

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
								id: z.string().describe('訂單行號'),
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
			let normalizedPhone: string;
			try {
				normalizedPhone = normalizePhoneIdentity(phone);
			} catch (error) {
				if (!(error instanceof PhoneIdentityError)) throw error;
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					code: error.code,
					message: error.message,
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

			// 從 Google Sheets 獲取客戶名單資料
			const customerData = await this.getCustomerOrdersFromSheet(
				sheetsService,
				normalizedPhone,
				getCustomerSheetName(env)
			);

			// 準備回應資料
			const response = {
				success: true,
				data: customerData,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('get_customer_orders.failed');
			if (error instanceof OrderConflict) {
				return c.json({ success: false, code: error.code, message: error.message }, error.status as 400 | 403 | 404 | 409 | 503);
			}
			const publicError = error instanceof ApiError
				? publicApiError(error, '無法從 Google Sheets 獲取客戶訂單資料')
				: { status: 500, code: 'CUSTOMER_ORDERS_READ_FAILED', message: '無法從 Google Sheets 獲取客戶訂單資料' };
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
	 * 從 Google Sheets 獲取客戶訂單歷史
	 * @param sheetsService Google Sheets 服務實例
	 * @param phone 客戶電話號碼
	 */
	private async getCustomerOrdersFromSheet(
		sheetsService: GoogleSheetsService,
		phone: string,
		customerSheetName: string
	): Promise<{ id: string; orderTime: string; items: string; name: string }[]> {
		try {
			// 從客戶名單工作表獲取資料
			const sheetData = await sheetsService.getSheetData(customerSheetName);

			if (!sheetData || sheetData.length === 0) {
				return [];
			}

			// 第一行是標題
			const header = safeArrayAccess(sheetData, 0);
			if (!header) {
				return [];
			}
			
			const rows = sheetData.slice(1);

			// 建立標題映射
			const headerMap = this.buildHeaderMap(header);

			// 確保必要的欄位存在
			if (headerMap.phone === undefined || headerMap.orderTime === undefined || headerMap.items === undefined) {
				throw new ApiError(500, '客戶名單工作表缺少必要欄位', 'MISSING_REQUIRED_FIELDS');
			}

			// 查找匹配的訂單
			const matchingOrders = this.findMatchingOrders(rows, headerMap, phone);

			// 依訂購時間排序，不以 UUID 當作時間或行位置
			matchingOrders.sort((a, b) => a.orderTime.localeCompare(b.orderTime,undefined,{numeric:true}));

			return matchingOrders;

		} catch (error) {
			if (error instanceof ApiError) {throw error;}
			throw new ApiError(500, '無法從 Google Sheets 獲取客戶訂單資料', 'SHEET_ACCESS_ERROR');
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
		rows: string[][],
		headerMap: { [key: string]: number },
		phone: string
	): Array<{
		id: string;
		orderTime: string;
		items: string;
		name: string;
	}> {
		const matchingOrders: Array<{
			id: string;
			orderTime: string;
			items: string;
			name: string;
		}> = [];

		rows.forEach((row, idx) => {
            if(row[17])return;
			// 確保資料完整性
			if (!row || row.length === 0) {
				return;
			}
			
			const phoneIndex = headerMap.phone;
			if (phoneIndex === undefined) {
				return;
			}
			
			const rowPhone = safeArrayAccess(row, phoneIndex);
			if (!rowPhone) {
				return;
			}

			// 使用電話號碼標準化比對
			if (this.isPhoneMatch(phone, rowPhone)) {
				// 獲取訂單時間和購買項目
				const orderTimeIndex = headerMap.orderTime;
				const itemsIndex = headerMap.items;
				const nameIndex = headerMap.name;
				
				const orderTime = (orderTimeIndex !== undefined ? safeArrayAccess(row, orderTimeIndex) : '') || '';
				const items = (itemsIndex !== undefined ? safeArrayAccess(row, itemsIndex) : '') || '';
				const name = (nameIndex !== undefined ? safeArrayAccess(row, nameIndex) : '') || '';

				// 只有當訂單時間或購買項目不為空時才加入結果
				if (orderTime || items) {
					matchingOrders.push({
						id: row[16]||`legacy-${idx}`, // 行索引作為 ID
						orderTime: orderTime,
						items: items,
						name: name
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
		const normalizedRowPhone = tryNormalizePhoneIdentity(rowPhone);
		return normalizedRowPhone !== null && normalizedRowPhone === queryPhone;
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
