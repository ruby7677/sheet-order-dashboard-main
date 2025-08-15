import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { CacheService } from '../services/CacheService';

/**
 * 更新 Google Sheets 訂單商品和金額的 API 端點
 * 接收新的商品清單，重新計算總金額，並更新到 Google Sheets
 */
export class UpdateOrderItems extends OpenAPIRoute {
	// 商品項目的 Zod 驗證結構
	private readonly OrderItemSchema = z.object({
		product: z.string().describe('商品名稱'),
		quantity: z.number().positive().describe('商品數量'),
		price: z.number().positive().describe('商品單價'),
		subtotal: z.number().positive().describe('商品小計')
	});

	schema = {
		tags: ['Orders'],
		summary: '更新訂單商品和金額',
		description: '更新 Google Sheets 中指定訂單的商品清單和總金額',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							id: z.string().describe('訂單 ID (行索引)'),
							items: z.array(this.OrderItemSchema).describe('商品清單'),
							total: z.number().positive().describe('訂單總金額')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '訂單商品更新成功',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional(),
							updated_items: z.string().optional(),
							updated_total: z.number().optional()
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
			404: {
				description: '找不到指定訂單',
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
			// 解析請求體
			const body = await c.req.json();
			const { id, items, total } = body;

			// 驗證必要參數
			if (!id || !Array.isArray(items) || typeof total !== 'number') {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少必要參數或參數格式錯誤',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 400);
			}

			// 驗證商品資料格式（參考原 PHP 邏輯）
			for (const item of items) {
				if (!item.product || typeof item.quantity !== 'number' || 
					typeof item.price !== 'number' || typeof item.subtotal !== 'number') {
					c.header('X-Response-Time', `${Date.now() - startTime}ms`);
					return c.json({
						success: false,
						message: '商品資料格式錯誤',
						timestamp: Math.floor(Date.now() / 1000),
						request_id: requestId
					}, 400);
				}

				if (typeof item.product !== 'string' || item.quantity <= 0 || 
					item.price <= 0 || item.subtotal <= 0) {
					c.header('X-Response-Time', `${Date.now() - startTime}ms`);
					return c.json({
						success: false,
						message: '商品資料類型錯誤',
						timestamp: Math.floor(Date.now() / 1000),
						request_id: requestId
					}, 400);
				}
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

			// 從 Google Sheets 讀取當前資料（Sheet1 工作表）
			const sheetData = await sheetsService.getSheetData('Sheet1');

			if (!sheetData || sheetData.length === 0) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '無法讀取工作表資料',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 500);
			}

			// 根據原 PHP 邏輯，使用固定的欄位索引
			// items 在第 8 欄 (索引 8)，amount 在第 9 欄 (索引 9)
			const itemsCol = 8;  // I欄 - 購買項目
			const amountCol = 9; // J欄 - 金額

			// 尋找目標訂單行（使用行索引作為 ID）
			const parsedId = parseInt(id.toString());
			if (isNaN(parsedId) || parsedId <= 0 || parsedId >= sheetData.length) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '找不到指定訂單',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 404);
			}

			const targetRow = parsedId;

			// 將商品陣列轉換為字串格式 (例如: "原味蘿蔔糕 x 2, 芋頭粿 x 1")
			const itemsString = items.map(item => 
				`${item.product} x ${item.quantity}`
			).join(', ');

			// Google Sheets API 使用 1-based 行號，所以需要 +1
			const sheetRow = targetRow + 1;

			// 準備批次更新資料
			const updates = [];

			// 更新商品欄位 (I欄)
			const itemsRange = `Sheet1!${String.fromCharCode(65 + itemsCol)}${sheetRow}`;
			updates.push({
				range: itemsRange,
				values: [[itemsString]]
			});

			// 更新金額欄位 (J欄)
			const amountRange = `Sheet1!${String.fromCharCode(65 + amountCol)}${sheetRow}`;
			updates.push({
				range: amountRange,
				values: [[total]]
			});

			// 執行批次更新
			await sheetsService.batchUpdateSheetData(updates, 'RAW');

			// 更新成功後清除相關快取（參考原 PHP 邏輯）
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: '訂單商品已成功更新',
				updated_items: itemsString,
				updated_total: total,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('UpdateOrderItems 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '更新失敗: ' + (error instanceof Error ? error.message : String(error)),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	/**
	 * 清除相關快取
	 * 參考原 PHP 檔案邏輯，更新後需要清除訂單快取確保下次讀取最新資料
	 */
	private async clearRelatedCache(cacheService: CacheService): Promise<void> {
		try {
			// 清除訂單相關的快取
			const ordersCacheKey = CacheService.generateKey('orders', 'all');
			await cacheService.delete(ordersCacheKey);

			// 可以根據需要清除其他相關快取
			// 例如：特定訂單的快取、統計資料快取等
		} catch (error) {
			// 快取清除失敗不應影響主要操作
			console.warn('清除快取時發生錯誤:', error);
		}
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