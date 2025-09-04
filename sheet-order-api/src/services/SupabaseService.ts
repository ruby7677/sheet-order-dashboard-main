/*
  SupabaseService.ts - Cloudflare Workers 環境下的 Supabase 存取服務骨架
  - 初始化 Supabase Client（Service Role）
  - 統一錯誤處理與回應格式
  - 分頁/篩選參數型別與回傳型別
  - 訂單/客戶的常用查詢與更新方法骨架
*/

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ApiError, Env } from '../types'

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

// 訂單項目資料模型
export interface OrderItemRecord {
  id?: string
  order_id: string
  product_name?: string
  product?: string
  unit_price?: number
  price?: number
  quantity?: number
  total_price?: number
  subtotal?: number
}

// 產品資料模型
export interface ProductRecord {
  id: string
  product_id: string
  name: string
  price: number
  weight?: number | null
  unit?: string | null
  description?: string | null
  detailed_description?: string | null
  ingredients?: string | null
  image_url?: string | null
  is_vegetarian?: boolean | null
  shipping_note?: string | null
  sort_order?: number | null
  stock_quantity?: number | null
  is_active?: boolean | null
  stock_status?: string | null
  category?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export class SupabaseService {
  private client: SupabaseClient

  constructor(env: Env) {
    const url = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) {throw new ApiError(500, 'SUPABASE_URL 未設定', 'ENV_MISSING')}
    if (!key) {throw new ApiError(500, 'SUPABASE_SERVICE_ROLE_KEY 未設定', 'ENV_MISSING')}

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

    if (query.status) {q = q.eq('status', query.status)}
    if (query.paymentStatus) {q = q.eq('payment_status', query.paymentStatus)}
    if (query.deliveryMethod) {q = q.eq('delivery_method', query.deliveryMethod)}
    if (query.search) {
      // 以 ilike 搜姓名/電話/訂單號
      q = q.or(
        `customer_name.ilike.%${query.search}%,customer_phone.ilike.%${query.search}%,order_number.ilike.%${query.search}%`
      )
    }
    if (query.dateRange?.startDate) {q = q.gte('due_date', query.dateRange.startDate)}
    if (query.dateRange?.endDate) {q = q.lte('due_date', query.dateRange.endDate)}

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
    if (error) {throw new ApiError(500, `查詢訂單失敗: ${error.message}`, 'DB_QUERY_ERROR')}

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

    if (query.region) {q = q.eq('region', query.region)}
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
    if (error) {throw new ApiError(500, `查詢客戶失敗: ${error.message}`, 'DB_QUERY_ERROR')}

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
    if (error) {throw new ApiError(500, `更新訂單狀態失敗: ${error.message}`, 'DB_UPDATE_ERROR')}
  }

  // 更新付款狀態
  async updatePaymentStatus(id: string, paymentStatus: string): Promise<void> {
    const { error } = await this.client
      .from('orders')
      .update({ payment_status: paymentStatus })
      .eq('id', id)
    if (error) {throw new ApiError(500, `更新付款狀態失敗: ${error.message}`, 'DB_UPDATE_ERROR')}
  }

  // 更新訂單項目（示意：實際可改為透過 order_items 表維護）
  async updateOrderItems(
    id: string,
    itemsJson: string, // 可改為結構化型別並寫入 order_items 關聯表
    totalAmount?: number
  ): Promise<void> {
    const payload: Record<string, unknown> = { notes: itemsJson }
    if (typeof totalAmount === 'number') {payload.total_amount = totalAmount}
    const { error } = await this.client.from('orders').update(payload).eq('id', id)
    if (error) {throw new ApiError(500, `更新訂單項目失敗: ${error.message}`, 'DB_UPDATE_ERROR')}
  }

  // 刪除訂單
  async deleteOrder(id: string): Promise<void> {
    const { error } = await this.client.from('orders').delete().eq('id', id)
    if (error) {throw new ApiError(500, `刪除訂單失敗: ${error.message}`, 'DB_DELETE_ERROR')}
  }

  // 批次刪除
  async batchDeleteOrders(ids: string[]): Promise<number> {
    if (!ids.length) {return 0}
    const { error, count } = await this.client
      .from('orders')
      .delete({ count: 'exact' })
      .in('id', ids)
    if (error) {throw new ApiError(500, `批次刪除訂單失敗: ${error.message}`, 'DB_DELETE_ERROR')}
    return count ?? 0
  }

  // 取得多筆訂單的 items（order_items）
  async getOrderItemsForOrderIds(orderIds: string[]): Promise<Record<string, Array<{ product: string; quantity: number; price: number; subtotal: number }>>> {
    const result: Record<string, Array<{ product: string; quantity: number; price: number; subtotal: number }>> = {}
    if (!orderIds || orderIds.length === 0) {return result}

    // 以 * 取回所有欄位，後續以相容映射對應不同 schema（product_name/unit_price/total_price 或 product/price/subtotal）
    const { data, error } = await this.client
      .from('order_items')
      .select('*')
      .in('order_id', orderIds)

    if (error) {throw new ApiError(500, `查詢 order_items 失敗: ${error.message}`, 'DB_QUERY_ERROR')}

    for (const row of data ?? []) {
      const r = row as OrderItemRecord
      const oid = String(r.order_id)
      if (!result[oid]) {result[oid] = []}
      const product = r.product_name ?? r.product ?? ''
      const price = r.unit_price ?? r.price ?? 0
      const subtotal = r.total_price ?? r.subtotal ?? (Number(price) * Number(r.quantity ?? 0))
      result[oid].push({
        product: String(product ?? ''),
        quantity: Number(r.quantity ?? 0),
        price: Number(price ?? 0),
        subtotal: Number(subtotal ?? 0),
      })
    }

    return result
  }

  // =============== Products ===============
  async getProducts(params?: { search?: string; category?: string; active?: boolean }): Promise<ProductRecord[]> {
    let q = this.client.from('products').select('*').order('sort_order', { ascending: true })
    if (params?.search) {
      q = q.or(`name.ilike.%${params.search}%,product_id.ilike.%${params.search}%`)
    }
    if (params?.category) { q = q.eq('category', params.category) }
    if (typeof params?.active === 'boolean') { q = q.eq('is_active', params.active) }
    const { data, error } = await q
    if (error) { throw new ApiError(500, `查詢商品失敗: ${error.message}`, 'DB_QUERY_ERROR') }
    return (data ?? []) as ProductRecord[]
  }

  async createProduct(payload: Partial<ProductRecord>): Promise<ProductRecord> {
    if (!payload.product_id || !payload.name || typeof payload.price !== 'number') {
      throw new ApiError(400, '缺少必要欄位: product_id/name/price', 'VALIDATION_ERROR')
    }
    const row = { ...payload, updated_at: new Date().toISOString() } as Partial<ProductRecord>
    const { data, error } = await this.client.from('products').insert([row]).select('*').single()
    if (error) { throw new ApiError(500, `新增商品失敗: ${error.message}`, 'DB_INSERT_ERROR') }
    return data as unknown as ProductRecord
  }

  async updateProduct(id: string, payload: Partial<ProductRecord>): Promise<ProductRecord> {
    const row = { ...payload, updated_at: new Date().toISOString() } as Partial<ProductRecord>
    const { data, error } = await this.client.from('products').update(row).eq('id', id).select('*').single()
    if (error) { throw new ApiError(500, `更新商品失敗: ${error.message}`, 'DB_UPDATE_ERROR') }
    return data as unknown as ProductRecord
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.client.from('products').delete().eq('id', id)
    if (error) { throw new ApiError(500, `刪除商品失敗: ${error.message}`, 'DB_DELETE_ERROR') }
  }
}

