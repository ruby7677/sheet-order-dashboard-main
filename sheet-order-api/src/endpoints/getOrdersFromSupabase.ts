import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { AppContext, ApiResponse } from '../types';
import { SupabaseService, type OrderQuery } from '../services/SupabaseService';

/**
 * 從 Supabase 讀取訂單（取代 Google Sheets）
 * 支援分頁/篩選/排序，並轉換為前端使用的 Order 形狀
 */
export class GetOrdersFromSupabase extends OpenAPIRoute {
  schema = {
    tags: ['Orders'],
    summary: '從 Supabase 取得訂單',
    request: {
      query: z.object({
        page: z.coerce.number().optional(),
        pageSize: z.coerce.number().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
        paymentStatus: z.string().optional(),
        deliveryMethod: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        sort: z.string().optional(), // e.g. created_at:desc
      })
    },
    responses: {
      200: {
        description: '成功取得訂單',
        content: {
          'application/json': {
            schema: ApiResponse
          }
        }
      }
    }
  };

  async handle(c: AppContext) {
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const start = Date.now();
    c.header('X-Request-ID', requestId);
    c.header('Content-Type', 'application/json');

    try {
      const q = c.req.query();
      const query: OrderQuery = {
        page: q.page ? Number(q.page) : 1,
        pageSize: q.pageSize ? Number(q.pageSize) : 50,
        search: q.search,
        status: q.status,
        paymentStatus: q.paymentStatus,
        deliveryMethod: q.deliveryMethod,
        dateRange: { startDate: q.startDate, endDate: q.endDate },
      };

      // 排序解析
      if (q.sort) {
        const [col, dir] = q.sort.split(':');
        if (col) {
          query.sort = { column: col, ascending: dir !== 'desc' };
        }
      }

      const svc = new SupabaseService(c.env as any);
      const paged = await svc.getOrders(query);

      // 轉換為前端 Order 形狀
      const orders = paged.data.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        customer: {
          name: r.customer_name,
          phone: r.customer_phone,
        },
        items: [], // items 在前端可再查，或由另一端點提供；此處暫空
        total: Number(r.total_amount ?? 0),
        status: r.status as any,
        createdAt: r.created_at,
        deliveryMethod: r.delivery_method ?? '',
        deliveryAddress: r.delivery_address ?? '',
        dueDate: r.due_date ?? '',
        deliveryTime: r.delivery_time ?? '',
        paymentMethod: r.payment_method ?? '',
        notes: (r as any).notes ?? '',
        paymentStatus: (r.payment_status ?? '') as any,
      }));

      const response = {
        success: true,
        data: orders,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
        timestamp: Math.floor(Date.now() / 1000),
        request_id: requestId,
      };

      c.header('X-Response-Time', `${Date.now() - start}ms`);
      return c.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      c.header('X-Response-Time', `${Date.now() - start}ms`);
      return c.json({ success: false, message: msg, request_id: requestId }, 500 as any);
    }
  }
}


