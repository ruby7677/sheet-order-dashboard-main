import { ApiError } from '../types';

const SAFE_MESSAGES: Record<string, string> = {
	MISSING_REQUIRED_FIELDS: '客戶名單工作表缺少必要欄位',
	CUSTOMER_STATS_UNAVAILABLE: '無法取得客戶統計資料',
	GOOGLE_SHEETS_NOT_CONFIGURED: '訂單資料服務尚未配置',
};

/** Keep controlled API status/codes while replacing provider details with a safe Chinese message. */
export function publicApiError(error: ApiError, fallback: string): {
	status: number;
	code: string;
	message: string;
} {
	const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
		? error.statusCode
		: 500;
	const code = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
		? error.code
		: 'INTERNAL_ERROR';
	return {
		status,
		code,
		message: SAFE_MESSAGES[code] ?? fallback,
	};
}
