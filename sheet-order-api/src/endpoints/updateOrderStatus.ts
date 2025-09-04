import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError, safeArrayAccess } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { CacheService } from '../services/CacheService';

/**
 * 更新 Google Sheets 訂單狀態的 API 端點
 * 支援四種合法狀態更新並自動清除相關快取
 */
export class UpdateOrderStatus extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '更新訂單狀態',
		description: '更新 Google Sheets 中指定訂單的狀態，僅允許四種合法狀態值',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							id: z.string().describe('訂單 ID'),
							status: z.enum(['訂單確認中', '已抄單', '已出貨', '取消訂單']).describe('新的訂單狀態')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '訂單狀態更新成功',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional()
						})
					}
				}
			},
			400: {
				description: '請求參數錯誤或狀態值不正確',
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

	// 合法的訂單狀態值（參考原 PHP 檔案）
	private readonly VALID_STATUSES = ['訂單確認中', '已抄單', '已出貨', '取消訂單'] as const;

	async handle(c: AppContext) {
		const requestId = this.generateRequestId();
		const startTime = Date.now();

		// 設定回應標頭
		c.header('X-Request-ID', requestId);
		c.header('Content-Type', 'application/json');

		try {
			// 解析請求體
			const body = await c.req.json();
			const { id, status } = body;

			// 驗證必要參數
			if (!id || !status) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少參數',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 400);
			}

			// 驗證狀態值是否合法（參考原 PHP 邏輯）
			if (!this.VALID_STATUSES.includes(status)) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '狀態值不正確',
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

			// 尋找標題行中的 id 和 status 欄位索引
			const header = safeArrayAccess(sheetData, 0);
			if (!header) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '無法讀取工作表標題行',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 500);
			}
			
			const idCol = header.indexOf('id');
			const statusCol = header.indexOf('status');

			if (idCol === -1 || statusCol === -1) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '找不到 id 或 status 欄位',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 500);
			}

			// 尋找目標訂單行
			let targetRow = -1;
			for (let i = 1; i < sheetData.length; i++) {
				const row = sheetData[i];
				if (row && row[idCol] && row[idCol].toString() === id.toString()) {
					targetRow = i + 1; // Google Sheets API 使用 1-based 索引
					break;
				}
			}

			if (targetRow === -1) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '找不到指定訂單',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 404);
			}

			// 計算要更新的儲存格範圍（參考原 PHP 邏輯）
			const columnLetter = String.fromCharCode(65 + statusCol); // A=65, B=66, ...
			const rangeToUpdate = `Sheet1!${columnLetter}${targetRow}`;

			// 更新 Google Sheets 中的狀態
			await sheetsService.updateSheetData(rangeToUpdate, [[status]]);

			// 更新成功後清除相關快取（參考原 PHP 邏輯）
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: '訂單狀態已成功更新',
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('UpdateOrderStatus 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '無法更新訂單狀態',
				error: error instanceof ApiError ? undefined : (error instanceof Error ? error.message : String(error)),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as 200 | 400 | 401 | 403 | 404 | 422 | 500);
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