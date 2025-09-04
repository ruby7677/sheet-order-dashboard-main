import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse, ApiError, Env } from '../types';

/**
 * 管理員登入 API 端點
 * 提供簡單的硬編碼認證機制，驗證成功後返回存取權杖
 */
export class AdminLogin extends OpenAPIRoute {
	schema = {
		tags: ['Admin'],
		summary: '管理員登入',
		description: '驗證管理員帳號密碼，成功後返回存取權杖',
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.object({
							username: z.string().min(1).describe('管理員帳號'),
							password: z.string().min(1).describe('管理員密碼')
						})
					}
				}
			}
		},
		responses: {
			200: {
				description: '登入成功',
				content: {
					'application/json': {
						schema: ApiResponse.extend({
							token: z.string().optional().describe('存取權杖')
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
			401: {
				description: '帳號或密碼錯誤',
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
			const { username, password } = body;

			// 驗證必要參數
			if (!username || !password) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '請以 JSON 格式傳送帳號密碼',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 400);
			}

			// 驗證帳號密碼
			const isValidCredentials = this.validateCredentials(
				username.toString().trim(),
				password.toString().trim(),
				c.env
			);

			if (!isValidCredentials) {
				c.header('X-Response-Time', `${Date.now() - startTime}ms`);
				return c.json({
					success: false,
					message: '帳號或密碼錯誤',
					timestamp: Math.floor(Date.now() / 1000),
					request_id: requestId
				}, 401);
			}

			// 生成存取權杖
			const token = await this.generateAccessToken();

			const response = {
				success: true,
				token: token,
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(response);

		} catch (error) {
			console.error('AdminLogin 錯誤:', error);

			const errorResponse = {
				success: false,
				message: error instanceof ApiError ? error.message : '登入失敗: ' + (error instanceof Error ? error.message : String(error)),
				timestamp: Math.floor(Date.now() / 1000),
				request_id: requestId
			};

			const statusCode = error instanceof ApiError ? error.statusCode : 500;
			c.header('X-Response-Time', `${Date.now() - startTime}ms`);
			return c.json(errorResponse, statusCode as 400 | 401 | 500);
		}
	}

	/**
	 * 驗證管理員帳號密碼
	 * 支援環境變數配置或硬編碼預設值
	 * @param username 使用者名稱
	 * @param password 密碼
	 * @param env 環境變數
	 */
	private validateCredentials(username: string, password: string, env: Env): boolean {
		// 優先使用環境變數中的管理員帳號密碼
		const validUsername = env.ADMIN_USERNAME || 'admin';
		const validPassword = env.ADMIN_PASSWORD || 'admin123';

		// 進行帳號密碼比對
		return username === validUsername && password === validPassword;
	}

	/**
	 * 生成存取權杖
	 * 使用 Web Crypto API 生成安全的隨機權杖
	 */
	private async generateAccessToken(): Promise<string> {
		try {
			// 生成 16 位元組的隨機資料
			const randomBytes = crypto.getRandomValues(new Uint8Array(16));
			
			// 轉換為十六進位字串
			const token = Array.from(randomBytes)
				.map(byte => byte.toString(16).padStart(2, '0'))
				.join('');

			return token;
		} catch (error) {
			// 如果 Web Crypto API 失敗，使用備用方案
			console.warn('Web Crypto API 失敗，使用備用權杖生成方案:', error);
			
			// 備用方案：使用時間戳和隨機數
			const timestamp = Date.now().toString(36);
			const random = Math.floor(Math.random() * 0xFFFFFFFF).toString(36);
			return `${timestamp}-${random}`;
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