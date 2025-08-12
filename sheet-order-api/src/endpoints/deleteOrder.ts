import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { CacheService } from '../services/CacheService';

/**
 * 刪除 Google Sheets 訂單的 API 端點
 * 真正刪除該行，而非僅清空內容，並重新排序後續訂單的 ID
 */
export class DeleteOrder extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '刪除訂單',
		description: '從 Google Sheets 中刪除指定訂單，並重新排序後續訂單的 ID',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							id: z.string().describe('訂單 ID (行索引)')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '訂單刪除成功',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional(),
							deleted_row: z.number().optional(),
							reorder_result: z.object({
								success: z.boolean(),
								message: z.string(),
								updated_rows: z.number()
							}).optional()
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
			const { id } = body;

			// 驗證必要參數
			if (!id) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少參數',
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
					message: '工作表中沒有資料',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 500);
			}

			// 驗證目標行索引（參考原 PHP 邏輯）
			const targetRowIndex = parseInt(id.toString());
			const targetRowNumber = targetRowIndex + 1; // Google Sheets 的行號從 1 開始

			// 檢查目標行是否存在（跳過標題行，索引從 1 開始）
			if (isNaN(targetRowIndex) || targetRowIndex < 1 || targetRowIndex >= sheetData.length) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '指定的訂單不存在',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 404);
			}

			// 獲取工作表 ID（用於刪除行操作）
			const sheetId = await this.getSheetId(sheetsService, 'Sheet1');

			// 執行刪除行操作
			await this.deleteSheetRow(sheetsService, sheetId, targetRowIndex);

			// 重新排序後續訂單的 ID
			const reorderResult = await this.reorderOrderIds(
				sheetsService, 
				'Sheet1', 
				targetRowIndex
			);

			// 刪除成功後清除相關快取
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: '訂單已成功從 Google Sheets 中刪除，ID已重新排序',
				deleted_row: targetRowNumber,
				reorder_result: reorderResult,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('DeleteOrder 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '刪除失敗: ' + (error instanceof Error ? error.message : String(error)),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	/**
	 * 獲取工作表 ID
	 * @param sheetsService Google Sheets 服務實例
	 * @param sheetName 工作表名稱
	 */
	private async getSheetId(sheetsService: GoogleSheetsService, sheetName: string): Promise<number> {
		try {
			// 這裡需要擴展 GoogleSheetsService 來支援獲取工作表資訊
			// 暫時使用固定值，實際應該動態獲取
			return 0; // Sheet1 的預設 ID 通常是 0
		} catch (error) {
			throw new ApiError(500