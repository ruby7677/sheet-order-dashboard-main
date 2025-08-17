import { ApiError } from '../types';

/**
 * Google Sheets API 服務類別
 * 處理與 Google Sheets 的所有互動，包括認證、資料讀取和錯誤處理
 */
export class GoogleSheetsService {
	private serviceAccountKey: string;
	private spreadsheetId: string;
	private accessToken: string | null = null;
	private tokenExpiry: number = 0;

	constructor(serviceAccountKey: string | undefined, spreadsheetId: string | undefined) {
		if (!serviceAccountKey) {
			throw new Error('Google Service Account Key is required but not provided');
		}
		if (!spreadsheetId) {
			throw new Error('Google Spreadsheet ID is required but not provided');
		}
		this.serviceAccountKey = serviceAccountKey;
		this.spreadsheetId = spreadsheetId;
	}

	/**
	 * 獲取 Google Sheets API 存取權杖
	 * 使用 Service Account 進行 JWT 認證
	 */
	private async getAccessToken(): Promise<string> {
		// 檢查現有權杖是否仍然有效
		if (this.accessToken && Date.now() < this.tokenExpiry) {
			return this.accessToken;
		}

		try {
			// 增加除錯資訊
			if (!this.serviceAccountKey) {
				throw new ApiError(500, '環境變數 GOOGLE_SERVICE_ACCOUNT_KEY 未設定', 'ENV_VAR_MISSING');
			}
			
			// 檢查 JSON 格式
			if (typeof this.serviceAccountKey !== 'string') {
				throw new ApiError(500, `Service account key 類型錯誤: ${typeof this.serviceAccountKey}`, 'INVALID_KEY_TYPE');
			}
			
			// 嘗試解析 JSON，提供更詳細的錯誤資訊
			let serviceAccount;
			try {
				serviceAccount = JSON.parse(this.serviceAccountKey);
			} catch (parseError) {
				throw new ApiError(500, `JSON 解析失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}。Key 長度: ${this.serviceAccountKey.length}，前100字元: ${this.serviceAccountKey.substring(0, 100)}`, 'JSON_PARSE_ERROR');
			}
			
			// 建立 JWT payload
			const now = Math.floor(Date.now() / 1000);
			const payload = {
				iss: serviceAccount.client_email,
				scope: 'https://www.googleapis.com/auth/spreadsheets',
				aud: 'https://oauth2.googleapis.com/token',
				exp: now + 3600, // 1 小時後過期
				iat: now
			};

			// 使用 Web Crypto API 建立 JWT
			const jwt = await this.createJWT(payload, serviceAccount.private_key);

			// 向 Google OAuth2 端點請求存取權杖
			const response = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					assertion: jwt
				})
			});

			if (!response.ok) {
				const error = await response.text();
				throw new ApiError(401, `Google OAuth 認證失敗: ${error}`, 'AUTH_FAILED');
			}

			const tokenData: any = await response.json();
			this.accessToken = tokenData.access_token;
			this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000; // 提前1分鐘過期

			return this.accessToken;
		} catch (error) {
			if (error instanceof ApiError) throw error;
			throw new ApiError(500, `取得存取權杖失敗: ${error instanceof Error ? error.message : String(error)}`, 'TOKEN_ERROR');
		}
	}

	/**
	 * 使用 Web Crypto API 建立 JWT
	 */
	private async createJWT(payload: any, privateKey: string): Promise<string> {
		try {
			// JWT Header
			const header = {
				alg: 'RS256',
				typ: 'JWT'
			};

			// Base64URL 編碼
			const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
			const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
			const signingInput = `${encodedHeader}.${encodedPayload}`;

			// 匯入私鑰
			const keyData = privateKey
				.replace(/-----BEGIN PRIVATE KEY-----/, '')
				.replace(/-----END PRIVATE KEY-----/, '')
				.replace(/\s/g, '');
			
			const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
			const cryptoKey = await crypto.subtle.importKey(
				'pkcs8',
				binaryKey,
				{
					name: 'RSASSA-PKCS1-v1_5',
					hash: 'SHA-256'
				},
				false,
				['sign']
			);

			// 簽名
			const signature = await crypto.subtle.sign(
				'RSASSA-PKCS1-v1_5',
				cryptoKey,
				new TextEncoder().encode(signingInput)
			);

			const encodedSignature = this.base64UrlEncode(new Uint8Array(signature));
			return `${signingInput}.${encodedSignature}`;
		} catch (error) {
			throw new ApiError(500, `JWT 建立失敗: ${error instanceof Error ? error.message : String(error)}`, 'JWT_ERROR');
		}
	}

	/**
	 * Base64URL 編碼
	 */
	private base64UrlEncode(data: string | Uint8Array): string {
		let base64: string;
		if (typeof data === 'string') {
			base64 = btoa(data);
		} else {
			base64 = btoa(String.fromCharCode(...data));
		}
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	}

	/**
	 * 從 Google Sheets 讀取資料
	 * @param range 要讀取的範圍 (例如: 'Sheet1' 或 'Sheet1!A1:Z100')
	 * @param retryCount 重試次數
	 */
	async getSheetData(range: string, retryCount: number = 3): Promise<any[][]> {
		for (let attempt = 1; attempt <= retryCount; attempt++) {
			try {
				const accessToken = await this.getAccessToken();
				
				const response = await fetch(
					`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}`,
					{
						headers: {
							'Authorization': `Bearer ${accessToken}`,
							'Content-Type': 'application/json'
						}
					}
				);

				if (!response.ok) {
					const errorText = await response.text();
					
					// 如果是認證錯誤，清除快取的權杖並重試
					if (response.status === 401 && attempt < retryCount) {
						this.accessToken = null;
						this.tokenExpiry = 0;
						continue;
					}
					
					throw new ApiError(
						response.status,
						`Google Sheets API 錯誤: ${errorText}`,
						'SHEETS_API_ERROR'
					);
				}

				const data: any = await response.json();
				return data.values || [];
			} catch (error) {
				if (error instanceof ApiError) {
					// 如果是最後一次嘗試，直接拋出錯誤
					if (attempt === retryCount) throw error;
					
					// 如果不是認證錯誤，等待後重試
					if (error.statusCode !== 401) {
						await this.delay(Math.pow(2, attempt) * 1000); // 指數退避
					}
				} else {
					// 網路錯誤等，等待後重試
					if (attempt === retryCount) {
						throw new ApiError(500, `網路錯誤: ${error instanceof Error ? error.message : String(error)}`, 'NETWORK_ERROR');
					}
					await this.delay(Math.pow(2, attempt) * 1000);
				}
			}
		}
	}

	/**
	 * 更新 Google Sheets 資料
	 * @param range 要更新的範圍
	 * @param values 要更新的值
	 * @param valueInputOption 值輸入選項
	 */
	async updateSheetData(range: string, values: any[][], valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW', retryCount: number = 3): Promise<void> {
		for (let attempt = 1; attempt <= retryCount; attempt++) {
			try {
				const accessToken = await this.getAccessToken();
				
				const response = await fetch(
					`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
					{
						method: 'PUT',
						headers: {
							'Authorization': `Bearer ${accessToken}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							values: values
						})
					}
				);

				if (!response.ok) {
					const errorText = await response.text();
					
					if (response.status === 401 && attempt < retryCount) {
						this.accessToken = null;
						this.tokenExpiry = 0;
						continue;
					}
					
					throw new ApiError(
						response.status,
						`Google Sheets 更新失敗: ${errorText}`,
						'SHEETS_UPDATE_ERROR'
					);
				}

				return; // 成功更新
			} catch (error) {
				if (error instanceof ApiError) {
					if (attempt === retryCount) throw error;
					if (error.statusCode !== 401) {
						await this.delay(Math.pow(2, attempt) * 1000);
					}
				} else {
					if (attempt === retryCount) {
						throw new ApiError(500, `網路錯誤: ${error instanceof Error ? error.message : String(error)}`, 'NETWORK_ERROR');
					}
					await this.delay(Math.pow(2, attempt) * 1000);
				}
			}
		}
	}

	/**
	 * 批次更新 Google Sheets 資料
	 * @param updates 批次更新的資料陣列
	 * @param valueInputOption 值輸入選項
	 * @param retryCount 重試次數
	 */
	async batchUpdateSheetData(
		updates: Array<{ range: string; values: any[][] }>,
		valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
		retryCount: number = 3
	): Promise<void> {
		for (let attempt = 1; attempt <= retryCount; attempt++) {
			try {
				const accessToken = await this.getAccessToken();
				
				// 準備批次更新請求體
				const requestBody = {
					valueInputOption: valueInputOption,
					data: updates.map(update => ({
						range: update.range,
						values: update.values
					}))
				};

				const response = await fetch(
					`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values:batchUpdate`,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${accessToken}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(requestBody)
					}
				);

				if (!response.ok) {
					const errorText = await response.text();
					
					if (response.status === 401 && attempt < retryCount) {
						this.accessToken = null;
						this.tokenExpiry = 0;
						continue;
					}
					
					throw new ApiError(
						response.status,
						`Google Sheets 批次更新失敗: ${errorText}`,
						'SHEETS_BATCH_UPDATE_ERROR'
					);
				}

				return; // 成功更新
			} catch (error) {
				if (error instanceof ApiError) {
					if (attempt === retryCount) throw error;
					if (error.statusCode !== 401) {
						await this.delay(Math.pow(2, attempt) * 1000);
					}
				} else {
					if (attempt === retryCount) {
						throw new ApiError(500, `網路錯誤: ${error instanceof Error ? error.message : String(error)}`, 'NETWORK_ERROR');
					}
					await this.delay(Math.pow(2, attempt) * 1000);
				}
			}
		}
	}

	/**
	 * 執行 Google Sheets batchUpdate 請求
	 * 支援各種批次操作，包括刪除行、插入行等
	 * @param requests 批次請求陣列
	 * @param retryCount 重試次數
	 */
	async batchUpdate(
		requests: any[],
		retryCount: number = 3
	): Promise<any> {
		for (let attempt = 1; attempt <= retryCount; attempt++) {
			try {
				const accessToken = await this.getAccessToken();
				
				// 準備 batchUpdate 請求體
				const requestBody = {
					requests: requests
				};

				const response = await fetch(
					`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}:batchUpdate`,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${accessToken}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(requestBody)
					}
				);

				if (!response.ok) {
					const errorText = await response.text();
					
					if (response.status === 401 && attempt < retryCount) {
						this.accessToken = null;
						this.tokenExpiry = 0;
						continue;
					}
					
					throw new ApiError(
						response.status,
						`Google Sheets batchUpdate 失敗: ${errorText}`,
						'SHEETS_BATCH_UPDATE_ERROR'
					);
				}

				const result = await response.json();
				return result;
			} catch (error) {
				if (error instanceof ApiError) {
					if (attempt === retryCount) throw error;
					if (error.statusCode !== 401) {
						await this.delay(Math.pow(2, attempt) * 1000);
					}
				} else {
					if (attempt === retryCount) {
						throw new ApiError(500, `網路錯誤: ${error instanceof Error ? error.message : String(error)}`, 'NETWORK_ERROR');
					}
					await this.delay(Math.pow(2, attempt) * 1000);
				}
			}
		}
	}

	/**
	 * 獲取工作表的基本資訊，包括工作表 ID
	 * @param retryCount 重試次數
	 */
	async getSpreadsheetInfo(retryCount: number = 3): Promise<any> {
		for (let attempt = 1; attempt <= retryCount; attempt++) {
			try {
				const accessToken = await this.getAccessToken();
				
				const response = await fetch(
					`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}`,
					{
						headers: {
							'Authorization': `Bearer ${accessToken}`,
							'Content-Type': 'application/json'
						}
					}
				);

				if (!response.ok) {
					const errorText = await response.text();
					
					if (response.status === 401 && attempt < retryCount) {
						this.accessToken = null;
						this.tokenExpiry = 0;
						continue;
					}
					
					throw new ApiError(
						response.status,
						`Google Sheets API 錯誤: ${errorText}`,
						'SHEETS_API_ERROR'
					);
				}

				const data = await response.json();
				return data;
			} catch (error) {
				if (error instanceof ApiError) {
					if (attempt === retryCount) throw error;
					if (error.statusCode !== 401) {
						await this.delay(Math.pow(2, attempt) * 1000);
					}
				} else {
					if (attempt === retryCount) {
						throw new ApiError(500, `網路錯誤: ${error instanceof Error ? error.message : String(error)}`, 'NETWORK_ERROR');
					}
					await this.delay(Math.pow(2, attempt) * 1000);
				}
			}
		}
	}

	/**
	 * 延遲函數，用於重試機制
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}