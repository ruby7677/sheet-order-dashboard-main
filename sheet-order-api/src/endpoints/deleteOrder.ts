import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError, safeArrayAccess } from '../types';
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
			return c.json(errorResponse, statusCode as 200 | 400 | 401 | 403 | 404 | 422 | 500);
		}
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
			const sheet = spreadsheetInfo.sheets?.find(s => 
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
	 * 刪除 Google Sheets 中的指定行
	 * @param sheetsService Google Sheets 服務實例
	 * @param sheetId 工作表 ID
	 * @param rowIndex 要刪除的行索引（0-based）
	 */
	private async deleteSheetRow(
		sheetsService: GoogleSheetsService, 
		sheetId: number, 
		rowIndex: number
	): Promise<void> {
		try {
			// 準備刪除行的請求
			const deleteRequest = {
				deleteDimension: {
					range: {
						sheetId: sheetId,
						dimension: 'ROWS' as const,
						startIndex: rowIndex, // 0-based index
						endIndex: rowIndex + 1 // 刪除一行
					}
				}
			};

			// 執行刪除行操作
			await sheetsService.batchUpdate([deleteRequest]);
		} catch (error) {
			if (error instanceof ApiError) {throw error;}
			throw new ApiError(500, `刪除行失敗: ${error instanceof Error ? error.message : String(error)}`, 'DELETE_ROW_ERROR');
		}
	}

	/**
	 * 重新排序訂單 ID
	 * 在刪除訂單後，更新後續所有訂單的 ID，確保 ID 的連續性
	 * @param sheetsService Google Sheets 服務實例
	 * @param sheetName 工作表名稱
	 * @param deletedRowIndex 被刪除的行索引（0-based）
	 */
	private async reorderOrderIds(
		sheetsService: GoogleSheetsService,
		sheetName: string,
		deletedRowIndex: number
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

			// 檢查是否有需要更新的行（從被刪除位置開始的所有後續行）
			const totalRows = rows.length;
			const startUpdateIndex = deletedRowIndex; // 因為行已被刪除，原本 deletedRowIndex+1 的行現在變成 deletedRowIndex

			if (startUpdateIndex >= totalRows) {
				return {
					success: true,
					message: '沒有後續行需要重新排序',
					updated_rows: 0
				};
			}

			// 準備批量更新的資料
			const updates = [];
			let updatedCount = 0;

			// 從被刪除位置開始，重新分配 ID
			for (let i = startUpdateIndex; i < totalRows; i++) {
				if (i === 0) {continue;} // 跳過標題行

				// 檢查該行是否有資料（避免更新空白行）
				const currentRow = safeArrayAccess(rows, i);
				const customerName = currentRow ? safeArrayAccess(currentRow, 1) : undefined;
				
				if (!currentRow || !customerName || String(customerName).trim() === '') {
					continue;
				}

				// 新的 ID 應該是當前行索引
				const newId = i;

				// 準備更新資料（假設 ID 在第 N 欄，索引 13）
				// 根據 Google Sheets 結構，ID 可能在不同的欄位
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