import { CacheOptions } from '../types';

/**
 * KV Store 快取管理服務
 * 處理 Cloudflare KV 的快取操作，包括讀取、寫入、失效和 TTL 管理
 */
export class CacheService {
	private kv: KVNamespace;
	private defaultTTL: number;
	private static readonly MAX_TTL_SECONDS = 86_400;

	constructor(kv: KVNamespace, defaultTTL: number = 60) {
		this.kv = kv;
		this.defaultTTL = defaultTTL;
	}

	/**
	 * 從快取中獲取資料
	 * @param key 快取鍵
	 * @returns 快取的資料或 null
	 */
	async get<T>(key: string): Promise<T | null> {
		try {
			const cached = await this.kv.get(key, 'json');
			if (cached === null) return null;
			const now=Date.now(),envelope=this.envelope<T>(cached,now);
			if(!envelope||now-envelope.timestamp>=envelope.ttl*1000)return null;
			return envelope.data;
		} catch {
			console.error('cache.get.failed');
			return null;
		}
	}

	/**
	 * 將資料寫入快取
	 * @param key 快取鍵
	 * @param data 要快取的資料
	 * @param ttl TTL (秒)，預設使用建構函數中的 defaultTTL
	 */
	async set<T>(key: string, data: T, ttl?: number): Promise<void> {
		try {
			const actualTTL = ttl ?? this.defaultTTL;
			if(!Number.isSafeInteger(actualTTL)||actualTTL<1||actualTTL>CacheService.MAX_TTL_SECONDS)throw new Error('Invalid cache TTL');
			const cacheData = {
				data,
				timestamp: Date.now(),
				ttl: actualTTL
			};

			// 使用 KV 的 expirationTtl 作為備用過期機制
			// 確保 expirationTtl 至少 60 秒（Cloudflare KV 限制）
			// 設定為 TTL 的 2 倍，但最少 60 秒
			const kvExpirationTtl = Math.max(60, actualTTL * 2);
			
			await this.kv.put(key, JSON.stringify(cacheData), {
				expirationTtl: kvExpirationTtl
			});
		} catch {
			console.error('cache.set.failed');
			// 快取寫入失敗不應該影響主要功能
		}
	}

	/**
	 * 刪除快取
	 * @param key 快取鍵
	 */
	async delete(key: string): Promise<void> {
		try {
			await this.kv.delete(key);
		} catch {
			console.error('cache.delete.failed');
		}
	}

	/**
	 * 使快取失效（批量刪除）
	 * @param pattern 快取鍵的模式或前綴
	 */
	async invalidate(pattern: string): Promise<void> {
		try {
			// KV 不支援模式匹配刪除，需要列出所有鍵然後過濾
			const list = await this.kv.list({ prefix: pattern });
			
			const deletePromises = list.keys.map(key => this.delete(key.name));
			await Promise.all(deletePromises);
		} catch {
			console.error('cache.invalidate.failed');
		}
	}

	/**
	 * 檢查快取是否存在且未過期
	 * @param key 快取鍵
	 * @returns 快取狀態資訊
	 */
	async getStatus(key: string): Promise<{
		exists: boolean;
		expired: boolean;
		age?: number;
		ttl?: number;
	}> {
		try {
			const cached = await this.kv.get(key, 'json');
			if (cached === null) {
				return { exists: false, expired: false };
			}
			const now=Date.now(),envelope=this.envelope(cached,now);
			if(!envelope)return {exists:false,expired:true};
			const age=Math.floor((now-envelope.timestamp)/1000);
			return {exists:true,expired:age>=envelope.ttl,age,ttl:envelope.ttl};
		} catch {
			console.error('cache.get_status.failed');
			return { exists: false, expired: false };
		}
	}

	private envelope<T>(value:unknown,now:number):{data:T;timestamp:number;ttl:number}|null{
		if(!value||typeof value!=='object'||Array.isArray(value))return null;
		const candidate=value as Record<string,unknown>;
		if(!Object.prototype.hasOwnProperty.call(candidate,'data')||!Number.isSafeInteger(candidate.timestamp)||!Number.isSafeInteger(candidate.ttl))return null;
		const timestamp=candidate.timestamp as number,ttl=candidate.ttl as number;
		if(timestamp<1||timestamp>now||ttl<1||ttl>CacheService.MAX_TTL_SECONDS)return null;
		return {data:candidate.data as T,timestamp,ttl};
	}

	/**
	 * 生成標準化的快取鍵
	 * @param prefix 前綴
	 * @param identifier 識別符
	 * @returns 標準化的快取鍵
	 */
	static generateKey(prefix: string, identifier: string = ''): string {
		const parts = [prefix];
		if (identifier) {
			parts.push(identifier);
		}
		return parts.join(':').toLowerCase();
	}

	/**
	 * 快取包裝器 - 自動處理快取邏輯
	 * @param options 快取選項
	 * @param fetchFunction 資料獲取函數
	 * @returns 快取的資料或新獲取的資料
	 */
	async wrap<T>(
		options: CacheOptions,
		fetchFunction: () => Promise<T>
	): Promise<T> {
		// 如果強制刷新，直接獲取新資料
		if (options.forceRefresh) {
			const freshData = await fetchFunction();
			await this.set(options.key, freshData, options.ttl);
			return freshData;
		}

		// 嘗試從快取獲取
		const cachedData = await this.get<T>(options.key);
		if (cachedData !== null) {
			return cachedData;
		}

		// 快取未命中，獲取新資料
		const freshData = await fetchFunction();
		await this.set(options.key, freshData, options.ttl);
		return freshData;
	}

	/**
	 * 獲取快取統計資訊
	 * @param prefix 快取鍵前綴
	 * @returns 快取統計
	 */
	async getStats(prefix?: string): Promise<{
		total: number;
		expired: number;
		valid: number;
	}> {
		try {
			const listOptions = prefix ? { prefix } : {};
			const list = await this.kv.list(listOptions);
			
			let expired = 0;
			let valid = 0;

			for (const key of list.keys) {
				const status = await this.getStatus(key.name);
				if (status.exists) {
					if (status.expired) {
						expired++;
					} else {
						valid++;
					}
				}
			}

			return {
				total: list.keys.length,
				expired,
				valid
			};
		} catch {
			console.error('cache.get_stats.failed');
			return { total: 0, expired: 0, valid: 0 };
		}
	}
}
