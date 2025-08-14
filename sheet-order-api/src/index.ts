import { fromHono } from "chanfana";
import { Hono } from "hono";
import { TaskCreate } from "./endpoints/taskCreate";
import { TaskDelete } from "./endpoints/taskDelete";
import { TaskFetch } from "./endpoints/taskFetch";
import { TaskList } from "./endpoints/taskList";
import { GetOrdersFromSheet } from './endpoints/getOrdersFromSheet';
import { GetCustomersFromSheet } from './endpoints/getCustomersFromSheet';
import { UpdateOrderStatus } from './endpoints/updateOrderStatus';
import { UpdatePaymentStatus } from './endpoints/updatePaymentStatus';
import { UpdateOrderItems } from './endpoints/updateOrderItems';
import { DeleteOrder } from './endpoints/deleteOrder';
import { BatchDeleteOrders } from './endpoints/batchDeleteOrders';
import { AdminLogin } from './endpoints/adminLogin';
import { GetCustomerOrders } from './endpoints/getCustomerOrders';
import { GetAdminDashboard } from './endpoints/getAdminDashboard';

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

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
openapi.get("/api/orders", GetOrdersFromSheet);
openapi.get("/api/customers", GetCustomersFromSheet);
openapi.put("/api/orders/status", UpdateOrderStatus);
openapi.put("/api/orders/payment", UpdatePaymentStatus);
openapi.put("/api/orders/items", UpdateOrderItems);
openapi.delete("/api/orders", DeleteOrder);
openapi.delete("/api/orders/batch", BatchDeleteOrders);
openapi.post("/api/admin/login", AdminLogin);
openapi.get("/api/customers/orders", GetCustomerOrders);
openapi.get("/api/admin/dashboard", GetAdminDashboard);

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
