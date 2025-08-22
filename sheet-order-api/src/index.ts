import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { TaskCreate } from "./endpoints/taskCreate";
import { TaskDelete } from "./endpoints/taskDelete";
import { TaskFetch } from "./endpoints/taskFetch";
import { TaskList } from "./endpoints/taskList";
import { GetOrdersFromSheet } from './endpoints/getOrdersFromSheet';
import { GetOrdersFromSupabase } from './endpoints/getOrdersFromSupabase';
import { GetCustomersFromSheet } from './endpoints/getCustomersFromSheet';
import { UpdateOrderStatus } from './endpoints/updateOrderStatus';
import { UpdatePaymentStatus } from './endpoints/updatePaymentStatus';
import { UpdateOrderItems } from './endpoints/updateOrderItems';
import { DeleteOrder } from './endpoints/deleteOrder';
import { BatchDeleteOrders } from './endpoints/batchDeleteOrders';
import { AdminLogin } from './endpoints/adminLogin';
import { GetCustomerOrders } from './endpoints/getCustomerOrders';
import { GetAdminDashboard } from './endpoints/getAdminDashboard';
import { AutoSyncOrders, GetSyncStatus } from './endpoints/autoSync';
import { OpenAPIRoute } from 'chanfana';
import type { AppContext } from './types';
import { SupabaseService } from './services/SupabaseService';

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// 配置 CORS 中間件（以函式動態允許來源）
app.use("*", cors({
	origin: (requestOrigin: string, _c) => {
		if (!requestOrigin) { return null; }
		try {
			const u = new URL(requestOrigin);
			const host = u.hostname.toLowerCase();
			// 明確允許
			const exactHosts = new Set([
				"sheet-order-dashboard-main.pages.dev",
				"lopokao.767780.xyz",
				"node.767780.xyz"
			]);
			if (exactHosts.has(host)) { return requestOrigin; }
			// 支援預覽與子網域
			if (host.endsWith(".lovable.app")) { return requestOrigin; }
			if (host.endsWith(".pages.dev")) { return requestOrigin; }
			if (host.endsWith(".767780.xyz")) { return requestOrigin; }
			// 本機
			if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") { return requestOrigin; }
		} catch {}
		return null;
	},
	allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowHeaders: [
		"Content-Type", 
		"Authorization", 
		"X-Requested-With",
		"Accept",
		"Origin",
		"User-Agent",
		"Cache-Control",
		"Pragma",
		"Expires",
		"If-Modified-Since",
		"If-None-Match"
	],
	credentials: true
}));

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
// 原有的 Task API
openapi.get("/api/tasks", TaskList);
openapi.post("/api/tasks", TaskCreate);
openapi.get("/api/tasks/:taskSlug", TaskFetch);
openapi.delete("/api/tasks/:taskSlug", TaskDelete);

// 訂單系統 API 端點
// 預設仍沿用 Sheets；若要切換至 Supabase，將此行改為 GetOrdersFromSupabase
openapi.get("/api/orders", GetOrdersFromSheet);
openapi.get("/api/orders.supabase", GetOrdersFromSupabase);
openapi.get("/api/customers", GetCustomersFromSheet);
openapi.put("/api/orders/status", UpdateOrderStatus);
openapi.put("/api/orders/payment", UpdatePaymentStatus);
openapi.put("/api/orders/items", UpdateOrderItems);
openapi.delete("/api/orders", DeleteOrder);
openapi.delete("/api/orders/batch", BatchDeleteOrders);
openapi.post("/api/admin/login", AdminLogin);
openapi.get("/api/customers/orders", GetCustomerOrders);
openapi.get("/api/admin/dashboard", GetAdminDashboard);

// 自動同步端點
openapi.post("/api/sync/auto", AutoSyncOrders);
openapi.get("/api/sync/status", GetSyncStatus);

// Products API（為 Cloudflare Worker 直接提供的簡易端點，便於統一呼叫）
class GetProducts extends OpenAPIRoute {
  async handle(c: AppContext) {
    try {
      const svc = new SupabaseService(c.env as any);
      const q = c.req.query();
      const data = await svc.getProducts({
        search: q.search,
        category: q.category,
        active: typeof q.active !== 'undefined' ? q.active === 'true' : undefined
      });
      return c.json({ success: true, data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ success: false, message: msg }, 500 as any);
    }
  }
}

class CreateProduct extends OpenAPIRoute {
  async handle(c: AppContext) {
    try {
      const svc = new SupabaseService(c.env as any);
      const payload = await c.req.json();
      const data = await svc.createProduct(payload);
      return c.json({ success: true, data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ success: false, message: msg }, 500 as any);
    }
  }
}

class UpdateProduct extends OpenAPIRoute {
  async handle(c: AppContext) {
    try {
      const svc = new SupabaseService(c.env as any);
      const payload = await c.req.json();
      const id = payload?.id;
      if (!id) { return c.json({ success: false, message: '缺少 id' }, 400 as any); }
      const data = await svc.updateProduct(id, payload);
      return c.json({ success: true, data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ success: false, message: msg }, 500 as any);
    }
  }
}

class DeleteProduct extends OpenAPIRoute {
  async handle(c: AppContext) {
    try {
      const svc = new SupabaseService(c.env as any);
      const q = c.req.query();
      const id = q.id;
      if (!id) { return c.json({ success: false, message: '缺少 id' }, 400 as any); }
      await svc.deleteProduct(id);
      return c.json({ success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ success: false, message: msg }, 500 as any);
    }
  }
}

openapi.get('/api/products', GetProducts);
openapi.post('/api/products', CreateProduct);
openapi.put('/api/products', UpdateProduct);
openapi.delete('/api/products', DeleteProduct);

// PHP 相容性路由 - 支援原有前端代碼
openapi.get("/api/get_orders_from_sheet.php", GetOrdersFromSheet);
openapi.get("/api/get_customers_from_sheet.php", GetCustomersFromSheet);
openapi.post("/api/update_order_status.php", UpdateOrderStatus);
openapi.post("/api/update_payment_status.php", UpdatePaymentStatus);
openapi.post("/api/update_order_items.php", UpdateOrderItems);
openapi.post("/api/delete_order.php", DeleteOrder);
openapi.post("/api/batch_delete_orders.php", BatchDeleteOrders);
openapi.post("/api/admin_login.php", AdminLogin);
openapi.get("/api/get_customer_orders.php", GetCustomerOrders);

// You may also register routes for non OpenAPI directly on Hono
// app.get('/test', (c) => c.text('Hono!'))

// CRON 處理器 - 處理定時自動同步
app.all('/api/sync/auto', async (c) => {
  const isCronTrigger = c.req.header('CF-Cron') || c.req.header('X-Cron-Trigger');
  
  if (isCronTrigger) {
    console.log('🕐 CRON 觸發自動同步');
    
    try {
      // 直接創建 AutoSyncService 來處理 CRON 觸發
      const { AutoSyncService } = await import('./services/AutoSyncService');
      const autoSyncService = new AutoSyncService(c.env as any);
      
      // 執行自動同步
      const result = await autoSyncService.executeAutoSync({
        forceFullSync: false,
        dryRun: false,
        syncOrders: true,
        syncCustomers: true
      });
      
      console.log('✅ CRON 自動同步完成:', result);
      
      return c.json({
        success: true,
        message: 'CRON 自動同步完成',
        result
      });
    } catch (error) {
      console.error('❌ CRON 自動同步失敗:', error);
      
      return c.json({
        success: false,
        message: 'CRON 自動同步失敗',
        error: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  }
  
  // 非 CRON 觸發，繼續正常的 API 處理
  return c.text('Auto sync endpoint - use POST for manual trigger', 200);
});

// Export the Hono app
export default app;
