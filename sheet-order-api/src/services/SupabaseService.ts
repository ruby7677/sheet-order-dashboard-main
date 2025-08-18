/*
  SupabaseService.ts - Cloudflare Workers 環境下的 Supabase 存取服務骨架
  - 初始化 Supabase Client（Service Role）
  - 統一錯誤處理與回應格式
  - 分頁/篩選參數型別與回傳型別
  - 訂單/客戶的常用查詢與更新方法骨架
*/

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '../types'

// Env 型別：從 worker-configuration.d.ts 繼承
export type SupabaseEnv = Env & {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

// 通用：分頁與排序
export interface Pagination {
  page?: number // 1-based
  pageSize?: number // 預設 50, 上限 200
}

export interface SortOption {
  column: string
  ascending?: boolean
}

// 查詢參數：訂單
export interface OrderQuery extends Pagination {
  search?: string // 客戶姓名/電話等關鍵字
  status?: string
  paymentStatus?: string
  deliveryMethod?: string
  dateRange?: { startDate?: string; endDate?: string }
  sort?: SortOption
}

// 查詢參數：客戶
export interface CustomerQuery extends Pagination {
  search?: string
  region?: string
  sort?: SortOption
}

// 資料模型（可依實際 DB 欄位命名調整）
export interface OrderRecord {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  status: string
  payment_status: string | null
  total_amount: number | null
  delivery_method: string | null
  delivery_address: string | null
  due_date: string | null // YYYY-MM-DD
  delivery_time: string | null
  payment_method: string | null
  notes: string | null
  created_at: string // ISO timestamp
}

export interface CustomerRecord {
  id: string
  name: string
  phone: string
  address?: string | null
  region?: string | null
  created_at: string
}

export interface PagedResult<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

export class SupabaseService {
  private client: SupabaseClient

  constructor(env: SupabaseEnv) {
    const url = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new ApiError(500, 'SUPABASE_URL 未設定', 'ENV_MISSING')
    if (!key) throw new ApiError(500, 'SUPABASE_SERVICE_ROLE_KEY 未設定', 'ENV_MISSING')

    this.client = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        headers: { 'X-Client-Info': 'sheet-order-api/1.0' },
      },
    })
  }

  // 取得訂單（支援分頁/篩選/排序）
  async getOrders(query: OrderQuery = {}): Promise<PagedResult<OrderRecord>> {
    const page = query.page && query.page > 0 ? query.page : 1
    const size = Math.min(query.pageSize ?? 50, 200)

    let q = this.client
      .from('orders')
      .select('*', { count: 'exact' })

    if (query.status) q = q.eq('status', query.status)
    if (query.paymentStatus) q = q.eq('payment_status', query.paymentStatus)
    if (query.deliveryMethod) q = q.eq('delivery_method', query.deliveryMethod)
    if (query.search) {
      // 以 ilike 搜姓名/電話/訂單號
      q = q.or(
        `customer_name.ilike.%${query.search}%,customer_phone.ilike.%${query.search}%,order_number.ilike.%${query.search}%`
      )
    }
    if (query.dateRange?.startDate) q = q.gte('due_date', query.dateRange.startDate)
    if (query.dateRange?.endDate) q = q.lte('due_date', query.dateRange.endDate)

    // 排序
    if (query.sort?.column) {
      q = q.order(query.sort.column, { ascending: query.sort.ascending ?? false })
    } else {
      q = q.order('created_at', { ascending: false })
    }

    // 分頁
    const from = (page - 1) * size
    const to = page * size - 1
    q = q.range(from, to)

    const { data, error, count } = await q
    if (error) throw new ApiError(500, `查詢訂單失敗: ${error.message}`, 'DB_QUERY_ERROR')

    return {
      data: (data ?? []) as OrderRecord[],
      page,
      pageSize: size,
      total: count ?? 0,
    }
  }

  // 取得客戶
  async getCustomers(query: CustomerQuery = {}): Promise<PagedResult<CustomerRecord>> {
    const page = query.page && query.page > 0 ? query.page : 1
    const size = Math.min(query.pageSize ?? 50, 200)

    let q = this.client
      .from('customers')
      .select('*', { count: 'exact' })

    if (query.region) q = q.eq('region', query.region)
    if (query.search) {
      q = q.or(`name.ilike.%${query.search}%,phone.ilike.%${query.search}%`)
    }

    if (query.sort?.column) {
      q = q.order(query.sort.column, { ascending: query.sort.ascending ?? true })
    } else {
      q = q.order('created_at', { ascending: false })
    }

    const from = (page - 1) * size
    const to = page * size - 1
    q = q.range(from, to)

    const { data, error, count } = await q
    if (error) throw new ApiError(500, `查詢客戶失敗: ${error.message}`, 'DB_QUERY_ERROR')

    return {
      data: (data ?? []) as CustomerRecord[],
      page,
      pageSize: size,
      total: count ?? 0,
    }
  }

  // 更新訂單狀態
  async updateOrderStatus(id: string, status: string): Promise<void> {
    const { error } = await this.client.from('orders').update({ status }).eq('id', id)
    if (error) throw new ApiError(500, `更新訂單狀態失敗: ${error.message}`, 'DB_UPDATE_ERROR')
  }

  // 更新付款狀態
  async updatePaymentStatus(id: string, paymentStatus: string): Promise<void> {
    const { error } = await this.client
      .from('orders')
      .update({ payment_status: paymentStatus })
      .eq('id', id)
    if (error) throw new ApiError(500, `更新付款狀態失敗: ${error.message}`, 'DB_UPDATE_ERROR')
  }

  // 更新訂單項目（示意：實際可改為透過 order_items 表維護）
  async updateOrderItems(
    id: string,
    itemsJson: string, // 可改為結構化型別並寫入 order_items 關聯表
    totalAmount?: number
  ): Promise<void> {
    const payload: Record<string, unknown> = { notes: itemsJson }
    if (typeof totalAmount === 'number') payload.total_amount = totalAmount
    const { error } = await this.client.from('orders').update(payload).eq('id', id)
    if (error) throw new ApiError(500, `更新訂單項目失敗: ${error.message}`, 'DB_UPDATE_ERROR')
  }

  // 刪除訂單
  async deleteOrder(id: string): Promise<void> {
    const { error } = await this.client.from('orders').delete().eq('id', id)
    if (error) throw new ApiError(500, `刪除訂單失敗: ${error.message}`, 'DB_DELETE_ERROR')
  }

  // 批次刪除
  async batchDeleteOrders(ids: string[]): Promise<number> {
    if (!ids.length) return 0
    const { error, count } = await this.client
      .from('orders')
      .delete({ count: 'exact' })
      .in('id', ids)
    if (error) throw new ApiError(500, `批次刪除訂單失敗: ${error.message}`, 'DB_DELETE_ERROR')
    return count ?? 0
  }
}

