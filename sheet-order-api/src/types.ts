import { DateTime, Str } from "chanfana";
import type { Context } from "hono";
import { z } from "zod";

export type AppContext = Context<{ Bindings: Env }>;

// 原有的 Task 類型
export const Task = z.object({
	name: Str({ example: "lorem" }),
	slug: Str(),
	description: Str({ required: false }),
	completed: z.boolean().default(false),
	due_date: DateTime(),
});

// 訂單系統相關類型定義
export const Order = z.object({
	createdAt: z.string().describe("訂單建立時間"),
	id: z.number().describe("訂單 ID (行索引)"),
	orderNumber: z.string().describe("訂單編號 (格式: ORD-XXX)"),
	customerName: z.string().describe("客戶姓名"),
	customerPhone: z.string().describe("客戶電話"),
	items: z.string().describe("訂購商品"),
	amount: z.string().describe("訂單金額"),
	dueDate: z.string().describe("到貨日期 (YYYY-MM-DD)"),
	deliveryTime: z.string().describe("宅配時段"),
	note: z.string().describe("備註"),
	status: z.string().describe("訂單狀態"),
	deliveryMethod: z.string().describe("配送方式"),
	deliveryAddress: z.string().describe("配送地址"),
	paymentMethod: z.string().describe("付款方式"),
	paymentStatus: z.string().describe("款項狀態")
});

export const Customer = z.object({
	id: z.number().describe("客戶 ID (行索引)"),
	name: z.string().describe("客戶姓名"),
	phone: z.string().describe("客戶電話"),
	address: z.string().describe("客戶地址"),
	createdAt: z.string().describe("建立時間")
});

// API 回應格式
export const ApiResponse = z.object({
	success: z.boolean(),
	data: z.any().optional(),
	message: z.string().optional(),
	timestamp: z.number().optional(),
	request_id: z.string().optional()
});

// 自定義錯誤類型
export class ApiError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public code?: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

// 快取相關類型
export interface CacheOptions {
	key: string;
	ttl: number;
	forceRefresh?: boolean;
}

// Cloudflare Workers 環境變數類型
export interface Env {
	CACHE_KV: KVNamespace;
	GOOGLE_SHEET_ID?: string;
	GOOGLE_SERVICE_ACCOUNT_KEY?: string;
	APP_ENV?: string;
	CACHE_DURATION?: string;
	DEBUG_MODE?: string;
	ADMIN_USERNAME?: string;
	ADMIN_PASSWORD?: string;
	SUPABASE_URL?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
	// 其他環境變數...
}

// Google Sheets API 相關類型定義
export interface GoogleSheetsConfig {
	serviceAccountKey: string;
	spreadsheetId: string;
}

export interface SheetData {
	values: string[][];
}

export interface GoogleSheetsApiResponse {
	values?: string[][];
	error?: {
		code: number;
		message: string;
		status: string;
	};
}

export interface SpreadsheetInfo {
	sheets: Array<{
		properties: {
			sheetId: number;
			title: string;
			index: number;
			sheetType: string;
			gridProperties?: {
				rowCount: number;
				columnCount: number;
			};
		};
	}>;
}

// 類型守衛函數
export function isValidEnv(env: unknown): env is Env & Required<Pick<Env, 'GOOGLE_SERVICE_ACCOUNT_KEY' | 'GOOGLE_SHEET_ID'>> {
	return typeof env === 'object' && 
		env !== null && 
		'GOOGLE_SERVICE_ACCOUNT_KEY' in env &&
		'GOOGLE_SHEET_ID' in env &&
		'CACHE_KV' in env &&
		typeof (env as any).GOOGLE_SERVICE_ACCOUNT_KEY === 'string' && 
		(env as any).GOOGLE_SERVICE_ACCOUNT_KEY.length > 0 &&
		typeof (env as any).GOOGLE_SHEET_ID === 'string' && 
		(env as any).GOOGLE_SHEET_ID.length > 0 &&
		(env as any).CACHE_KV !== undefined;
}

// Google Sheets 資料驗證
export function isValidSheetData(data: unknown): data is string[][] {
	return Array.isArray(data) && 
		data.every(row => Array.isArray(row) && 
		row.every(cell => typeof cell === 'string' || cell === null || cell === undefined));
}

// 安全的陣列存取
export function safeArrayAccess<T>(array: T[] | undefined, index: number): T | undefined {
	if (!array || index < 0 || index >= array.length) {
		return undefined;
	}
	return array[index];
}

// 安全的物件存取
export function safeObjectAccess<T, K extends keyof T>(obj: T | undefined | null, key: K): T[K] | undefined {
	if (!obj || typeof obj !== 'object') {
		return undefined;
	}
	return obj[key];
}

export type OrdersResponse = z.infer<typeof ApiResponse> & {
	data?: z.infer<typeof Order>[];
};

export type CustomersResponse = z.infer<typeof ApiResponse> & {
	data?: z.infer<typeof Customer>[];
};

// 儀表板統計類型
export interface DashboardStats {
	todayOrders: number;
	weekOrders: number;
	pendingOrders: number;
	completedOrders: number;
	totalOrders: number;
	totalCustomers: number;
	statusBreakdown: {
		confirming: number;
		processing: number;
		shipping: number;
		delivered: number;
		cancelled: number;
		completed: number;
		pending: number;
	};
	dailyStats: Array<{
		date: string;
		orders: number;
	}>;
}
