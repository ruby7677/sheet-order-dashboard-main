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
import { OpenAPIRoute } from 'chanfana';
import type { AppContext } from './types';
import { SupabaseService } from './services/SupabaseService';

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// 配置 CORS 中間件
app.use("*", cors({
	origin: [
		"https://sheet-order-dashboard-main.pages.dev",
		"https://lopokao.767780.xyz",
		"http://localhost:8080",
		"http://127.0.0.1:8080",
		"http://0.0.0.0:8080"
	],
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

// Export the Hono app
export default app;
