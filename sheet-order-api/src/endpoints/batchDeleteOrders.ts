import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError } from '../types';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { CacheService } from '../services/CacheService';

/**
 * 批量刪除 Google Sheets 訂單的 API 端點
 * 支援一次刪除多個訂單，並自動重新排序後續訂單的 ID
 */
export class BatchDeleteOrders extends OpenAPIRoute {
	schema = {
		tags: ['Orders'],
		summary: '批量刪除訂單',
		description: '從 Google Sheets 中批量刪除指定訂單，並重新排序所有訂單的 ID',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							ids: z.array(z.string()).min(1).describe('要刪除的訂單 ID 陣列')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '批量刪除完成',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							message: z.string().optional(),
							results: z.array(z.object({
								id: z.string(),
								success: z.boolean(),
								message: z.string(),
								orderNumber: z.string().optional()
							})).optional(),
							totalDeleted: z.number().optional(),
							totalFailed: z.number().optional(),
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
			const { ids } = body;

			// 驗證必要參數
			if (!ids || !Array.isArray(ids) || ids.length === 0) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '缺少參數或參數格式錯誤',
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

			// 驗證所有要刪除的 ID 是否有效
			const validationResult = this.validateOrderIds(ids, sheetData);
			
			if (validationResult.invalidIds.length > 0) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: `以下訂單ID無效：${validationResult.invalidIds.join(', ')}`,
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 404);
			}

			// 獲取工作表 ID
			const sheetId = await this.getSheetId(sheetsService, 'Sheet1');

			// 執行批量刪除
			const deleteResults = await this.batchDeleteRows(
				sheetsService,
				sheetId,
				validationResult.validIds,
				validationResult.orderNumbers
			);

			// 重新排序訂單 ID（只有在有成功刪除的情況下才執行）
			let reorderResult = null;
			if (deleteResults.deletedCount > 0) {
				reorderResult = await this.reorderOrderIdsAfterBatchDelete(
					sheetsService,
					'Sheet1'
				);
			}

			// 刪除成功後清除相關快取
			await this.clearRelatedCache(cacheService);

			const response = {
				success: true,
				message: `批次刪除完成：成功 ${deleteResults.deletedCount} 筆，失敗 ${deleteResults.failedCount} 筆`,
				results: deleteResults.results,
				totalDeleted: deleteResults.deletedCount,
				totalFailed: deleteResults.failedCount,
				reorder_result: reorderResult,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('BatchDeleteOrders 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '批量刪除失敗: ' + (error instanceof Error ? error.message : String(error)),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as any);
		}
	}

	/**
	 * 驗證訂單 ID 的有效性
	 * @param ids 要驗證的 ID 陣列
	 * @param sheetData 工作表資料
	 */
	private validateOrderIds(ids: string[], sheetData: any[][]) {
		const validIds: number[] = [];
		const invalidIds: string[] = [];
		const orderNumbers: { [key: number]: string } = {};

		for (const id of ids) {
			const targetRowIndex = parseInt(id.toString());
			
			// 檢查目標行是否存在（跳過標題行，索引從 1 開始）
			if (isNaN(targetRowIndex) || targetRowIndex < 1 || targetRowIndex >= sheetData.length) {
				invalidIds.push(id);
			} else {
				validIds.push(targetRowIndex);
				// 嘗試獲取訂單編號（假設在第 B 欄，索引 1）
				const orderNumber = sheetData[targetRowIndex] && sheetData[targetRowIndex][1] 
					? sheetData[targetRowIndex][1] 
					: `訂單${id}`;
				orderNumbers[targetRowIndex] = orderNumber;
			}
		}

		return { validIds, invalidIds, orderNumbers };
	}

	/**
	 * 獲取工作表 ID
	 * @param sheetsService Google Sheets 服務實例
	 * @param sheetName 工作表名稱
	 */
	private async getSheetId(sheetsService: GoogleSheetsService, sheetName: string): Promise<number> {
		try {
			// 獲取工作表資訊
			const spreadsheetInfo = await sheetsService.getSpreadsheetInfo();
			
			// 尋找指定名稱的工作表
			const sheet = spreadsheetInfo.sheets?.find((s: any) => 
				s.properties?.title === sheetName
			);
			
			if (!sheet) {
				throw new ApiError(404, `找不到工作表: ${sheetName}`, 'SHEET_NOT_FOUND');
			}
			
			return sheet.properties.sheetId;
		} catch (error) {
			if (error instanceof ApiError) {throw error;}
			throw new ApiError(500, `獲取工作表 ID 失敗: ${error instanceof Error ? error.message : String(error)}`, 'SHEET_ID_ERROR');
		}
	}

	/**
	 * 批量刪除行
	 * @param sheetsService Google Sheets 服務實例
	 * @param sheetId 工作表 ID
	 * @param validIds 有效的行索引陣列
	 * @param orderNumbers 訂單編號對應表
	 */
	private async batchDeleteRows(
		sheetsService: GoogleSheetsService,
		sheetId: number,
		validIds: number[],
		orderNumbers: { [key: number]: string }
	) {
		// 按照行號從大到小排序，這樣刪除時不會影響其他行的索引
		const sortedIds = [...validIds].sort((a, b) => b - a);
		
		const results: any[] = [];
		let deletedCount = 0;
		let failedCount = 0;

		// 逐一刪除每一行
		for (const targetRowIndex of sortedIds) {
			try {
				// 準備刪除行的請求
				const deleteRequest = {
					deleteDimension: {
						range: {
							sheetId: sheetId,
							dimension: 'ROWS',
							startIndex: targetRowIndex, // 0-based index
							endIndex: targetRowIndex + 1 // 刪除一行
						}
					}
				};

				// 執行刪除操作
				await sheetsService.batchUpdate([deleteRequest]);

				results.push({
					id: targetRowIndex.toString(),
					success: true,
					message: '刪除成功',
					orderNumber: orderNumbers[targetRowIndex] || `訂單${targetRowIndex}`
				});
				deletedCount++;

			} catch (error) {
				results.push({
					id: targetRowIndex.toString(),
					success: false,
					message: `刪除失敗：${error instanceof Error ? error.message : String(error)}`,
					orderNumber: orderNumbers[targetRowIndex] || `訂單${targetRowIndex}`
				});
				failedCount++;
			}
		}

		return { results, deletedCount, failedCount };
	}

	/**
	 * 批量刪除後重新排序訂單 ID
	 * 重新獲取所有資料並重新分配連續的 ID
	 * @param sheetsService Google Sheets 服務實例
	 * @param sheetName 工作表名稱
	 */
	private async reorderOrderIdsAfterBatchDelete(
		sheetsService: GoogleSheetsService,
		sheetName: string
	): Promise<{ success: boolean; message: string; updated_rows: number }> {
		try {
			// 重新獲取所有資料
			const rows = await sheetsService.getSheetData(sheetName);

			if (!rows || rows.length <= 1) {
				return {
					success: true,
					message: '沒有需要重新排序的資料',
					updated_rows: 0
				};
			}

			// 準備批量更新的資料
			const updates = [];
			let updatedCount = 0;

			// 從第二行開始（跳過標題行），重新分配 ID
			for (let i = 1; i < rows.length; i++) {
				// 檢查該行是否有資料（避免更新空白行）
				if (!rows[i] || !rows[i][1] || String(rows[i][1]).trim() === '') {
					continue;
				}

				// 新的 ID 應該是當前行索引
				const newId = i;

				// 準備更新資料（假設 ID 在第 N 欄，索引 13）
				const range = `${sheetName}!N${i + 1}`; // N欄，行號+1（因為 Google Sheets 是 1-based）
				updates.push({
					range: range,
					values: [[newId]]
				});

				updatedCount++;
			}

			// 如果有資料需要更新，執行批量更新
			if (updates.length > 0) {
				await sheetsService.batchUpdateSheetData(updates, 'USER_ENTERED');
			}

			return {
				success: true,
				message: `成功重新排序 ${updatedCount} 個訂單的ID`,
				updated_rows: updatedCount
			};

		} catch (error) {
			return {
				success: false,
				message: `重新排序ID時發生錯誤：${error instanceof Error ? error.message : String(error)}`,
				updated_rows: 0
			};
		}
	}

	/**
	 * 清除相關快取
	 * 參考原 PHP 檔案邏輯，刪除後需要清除訂單快取確保下次讀取最新資料
	 */
	private async clearRelatedCache(cacheService: CacheService): Promise<void> {
		try {
			// 清除訂單相關的快取
			const ordersCacheKey = CacheService.generateKey('orders', 'all');
			await cacheService.delete(ordersCacheKey);

			// 可以根據需要清除其他相關快取
			// 例如：客戶快取、統計資料快取等
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