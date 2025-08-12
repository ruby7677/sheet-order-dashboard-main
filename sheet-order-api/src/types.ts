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

export type OrdersResponse = z.infer<typeof ApiResponse> & {
	data?: z.infer<typeof Order>[];
};

export type CustomersResponse = z.infer<typeof ApiResponse> & {
	data?: z.infer<typeof Customer>[];
};
