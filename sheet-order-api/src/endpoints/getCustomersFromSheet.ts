import { OpenAPIRoute } from 'chanfana';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { AppContext, Customer, ApiResponse, ApiError, safeArrayAccess } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { tryNormalizePhoneIdentity } from '../services/PhoneIdentity';
import { getCustomerSheetName } from '../services/SheetNames';
import { OrderConflict } from '../services/OrderContract';
import { publicApiError } from '../services/PublicApiError';

/**
 * 從 Google Sheets 讀取客戶資料的 API 端點
 * 支援快取機制和強制刷新功能
 */
export class GetCustomersFromSheet extends OpenAPIRoute {
	schema = {
		tags: ['Customers'],
		summary: '從 Google Sheets 讀取客戶資料',
		description: '讀取 Google Sheets 中的所有客戶資料，支援 60 秒快取和強制刷新',
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
								items: z.string().optional(),
								normalized_phone: z.string().nullable().optional()
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
			const { nonce } = c.req.query();
			const actualRequestId = nonce || requestId;

			// 初始化服務
			const env = c.env;
			
			// 驗證環境變數
			if (!env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
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
			// 從 Google Sheets 讀取資料（客戶名單工作表）
			const sheetData = await sheetsService.getSheetData(getCustomerSheetName(env));

			if (!sheetData || sheetData.length === 0) {
				const emptyResponse = {
					success: true,
					data: [],
					timestamp: Math.floor(Date.now() / 1000),
					request_id: actualRequestId
				};

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

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('get_customers_from_sheet.failed');
			if (error instanceof OrderConflict) {
				return c.json({ success: false, code: error.code, message: error.message }, error.status as 400 | 403 | 404 | 409 | 503);
			}
			const publicError = error instanceof ApiError
				? publicApiError(error, '無法從 Google Sheets 獲取客戶資料')
				: { status: 500, code: 'CUSTOMER_SHEET_READ_FAILED', message: '無法從 Google Sheets 獲取客戶資料' };

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
	 * 將 Google Sheets 原始資料轉換為客戶物件陣列
	 * 參考原始 PHP 檔案的轉換邏輯，支援動態標題映射
	 */
	private transformSheetDataToCustomers(sheetData: string[][]): Array<z.infer<typeof Customer> & {
		deliveryMethod?: string;
		contactMethod?: string;
		socialId?: string;
		orderTime?: string;
		items?: string;
		normalized_phone?: string | null;
	}> {
		if (!sheetData || sheetData.length === 0) {
			return [];
		}

		// 第一行是標題
		const header = safeArrayAccess(sheetData, 0);
		if (!header) {
			return [];
		}
		
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

		const customers: Array<z.infer<typeof Customer> & {
			deliveryMethod?: string;
			contactMethod?: string;
			socialId?: string;
			orderTime?: string;
			items?: string;
			normalized_phone?: string | null;
		}> = [];
		
		dataRows.forEach((row: string[], idx: number) => {
			// 確保資料完整性
			if (!row || row.length === 0) {
				return;
			}
			
			// 檢查必要欄位
			const nameIndex = headerMap['name'];
			const phoneIndex = headerMap['phone'];
			
			if (nameIndex === undefined || phoneIndex === undefined) {
				return;
			}
			
			const name = safeArrayAccess(row, nameIndex);
			const phone = safeArrayAccess(row, phoneIndex);
			
			if (!name || !phone) {
				return;
			}

			// 建立客戶物件
			const customer: z.infer<typeof Customer> & {
				deliveryMethod?: string;
				contactMethod?: string;
				socialId?: string;
				orderTime?: string;
				items?: string;
					normalized_phone?: string | null;
			} = {
				id: idx,
				name: name || '',
				phone: phone || '',
				address: headerMap['address'] !== undefined ? (safeArrayAccess(row, headerMap['address']) || '') : '',
				createdAt: headerMap['orderTime'] !== undefined ? (safeArrayAccess(row, headerMap['orderTime']) || '') : '',
				// 額外欄位
				deliveryMethod: headerMap['deliveryMethod'] !== undefined ? (safeArrayAccess(row, headerMap['deliveryMethod']) || '') : '',
				contactMethod: headerMap['contactMethod'] !== undefined ? (safeArrayAccess(row, headerMap['contactMethod']) || '') : '',
				socialId: headerMap['socialId'] !== undefined ? (safeArrayAccess(row, headerMap['socialId']) || '') : '',
				orderTime: headerMap['orderTime'] !== undefined ? (safeArrayAccess(row, headerMap['orderTime']) || '') : '',
				items: headerMap['items'] !== undefined ? (safeArrayAccess(row, headerMap['items']) || '') : '',
				normalized_phone: tryNormalizePhoneIdentity(phone)
			};
			
			customers.push(customer);
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
