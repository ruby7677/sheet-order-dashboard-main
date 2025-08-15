import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 服務類別
 * 處理所有與 Supabase 的交互操作，包括訂單和客戶資料的 CRUD 操作
 */
export class SupabaseService {
    private client: SupabaseClient;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.client = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * 獲取所有訂單資料
     * @returns 訂單資料陣列
     */
    async getOrders(): Promise<any[]> {
        try {
            const { data, error } = await this.client
                .from('orders')
                .select(`
                    *,
                    order_items (
                        id,
                        product_name,
                        quantity,
                        unit_price,
                        total_price,
                        notes
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) {
                throw new Error(`獲取訂單資料失敗: ${error.message}`);
            }

            return data || [];
        } catch (error) {
            console.error('SupabaseService.getOrders 錯誤:', error);
            throw error;
        }
    }

    /**
     * 獲取所有客戶資料
     * @returns 客戶資料陣列
     */
    async getCustomers(): Promise<any[]> {
        try {
            const { data, error } = await this.client
                .from('customers')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                throw new Error(`獲取客戶資料失敗: ${error.message}`);
            }

            return data || [];
        } catch (error) {
            console.error('SupabaseService.getCustomers 錯誤:', error);
            throw error;
        }
    }

    /**
     * 更新訂單狀態
     * @param orderId 訂單 ID
     * @param status 新的訂單狀態
     */
    async updateOrderStatus(orderId: string, status: string): Promise<void> {
        try {
            const { error } = await this.client
                .from('orders')
                .update({ 
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (error) {
                throw new Error(`更新訂單狀態失敗: ${error.message}`);
            }
        } catch (error) {
            console.error('SupabaseService.updateOrderStatus 錯誤:', error);
            throw error;
        }
    }

    /**
     * 更新付款狀態
     * @param orderId 訂單 ID
     * @param paymentStatus 新的付款狀態
     */
    async updatePaymentStatus(orderId: string, paymentStatus: string): Promise<void> {
        try {
            const { error } = await this.client
                .from('orders')
                .update({ 
                    payment_status: paymentStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (error) {
                throw new Error(`更新付款狀態失敗: ${error.message}`);
            }
        } catch (error) {
            console.error('SupabaseService.updatePaymentStatus 錯誤:', error);
            throw error;
        }
    }

    /**
     * 更新訂單商品
     * @param orderId 訂單 ID
     * @param items 商品列表
     * @param totalAmount 總金額
     */
    async updateOrderItems(orderId: string, items: any[], totalAmount: number): Promise<void> {
        try {
            // 開始交易
            const { error: deleteError } = await this.client
                .from('order_items')
                .delete()
                .eq('order_id', orderId);

            if (deleteError) {
                throw new Error(`刪除舊商品明細失敗: ${deleteError.message}`);
            }

            // 插入新的商品明細
            if (items && items.length > 0) {
                const orderItems = items.map((item: any) => ({
                    order_id: orderId,
                    product_name: item.product || item.name,
                    quantity: parseInt(item.quantity) || 1,
                    unit_price: parseFloat(item.price) || 0,
                    total_price: parseFloat(item.subtotal) || (parseFloat(item.price) * parseInt(item.quantity)),
                    notes: item.notes || ''
                }));

                const { error: insertError } = await this.client
                    .from('order_items')
                    .insert(orderItems);

                if (insertError) {
                    throw new Error(`插入新商品明細失敗: ${insertError.message}`);
                }
            }

            // 更新訂單總金額
            const { error: updateError } = await this.client
                .from('orders')
                .update({ 
                    total_amount: totalAmount,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (updateError) {
                throw new Error(`更新訂單總金額失敗: ${updateError.message}`);
            }
        } catch (error) {
            console.error('SupabaseService.updateOrderItems 錯誤:', error);
            throw error;
        }
    }

    /**
     * 刪除訂單
     * @param orderId 訂單 ID
     */
    async deleteOrder(orderId: string): Promise<void> {
        try {
            // 先刪除相關的商品明細
            const { error: deleteItemsError } = await this.client
                .from('order_items')
                .delete()
                .eq('order_id', orderId);

            if (deleteItemsError) {
                throw new Error(`刪除訂單商品明細失敗: ${deleteItemsError.message}`);
            }

            // 再刪除訂單
            const { error: deleteOrderError } = await this.client
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (deleteOrderError) {
                throw new Error(`刪除訂單失敗: ${deleteOrderError.message}`);
            }
        } catch (error) {
            console.error('SupabaseService.deleteOrder 錯誤:', error);
            throw error;
        }
    }

    /**
     * 批量刪除訂單
     * @param orderIds 訂單 ID 陣列
     */
    async batchDeleteOrders(orderIds: string[]): Promise<{ success: number; failed: number; results: any[] }> {
        let successCount = 0;
        let failedCount = 0;
        const results: any[] = [];

        for (const orderId of orderIds) {
            try {
                await this.deleteOrder(orderId);
                successCount++;
                results.push({
                    id: orderId,
                    success: true,
                    message: '刪除成功'
                });
            } catch (error) {
                failedCount++;
                results.push({
                    id: orderId,
                    success: false,
                    message: error instanceof Error ? error.message : '刪除失敗'
                });
            }
        }

        return {
            success: successCount,
            failed: failedCount,
            results: results
        };
    }

    /**
     * 根據電話號碼獲取客戶訂單
     * @param phone 客戶電話號碼
     */
    async getCustomerOrders(phone: string): Promise<any[]> {
        try {
            // 移除電話號碼中的特殊字符，只保留數字
            const cleanPhone = phone.replace(/\D/g, '');
            const phonePattern = `%${cleanPhone.slice(-9)}`; // 取最後9位數字

            const { data, error } = await this.client
                .from('orders')
                .select(`
                    id,
                    order_number,
                    customer_name,
                    customer_phone,
                    created_at,
                    order_items (
                        product_name,
                        quantity,
                        unit_price,
                        total_price
                    )
                `)
                .ilike('customer_phone', phonePattern)
                .order('created_at', { ascending: false });

            if (error) {
                throw new Error(`獲取客戶訂單失敗: ${error.message}`);
            }

            // 轉換格式以符合原有 API 格式
            return (data || []).map((order: any) => ({
                id: order.id,
                orderTime: order.created_at,
                name: order.customer_name,
                items: order.order_items?.map((item: any) => 
                    `${item.product_name} x${item.quantity}`
                ).join(', ') || ''
            }));
        } catch (error) {
            console.error('SupabaseService.getCustomerOrders 錯誤:', error);
            throw error;
        }
    }

    /**
     * 獲取管理員儀表板統計資料
     */
    async getAdminDashboard(): Promise<any> {
        try {
            // 獲取訂單統計
            const { data: orderStats, error: orderError } = await this.client
                .from('orders')
                .select('status, payment_status, total_amount');

            if (orderError) {
                throw new Error(`獲取訂單統計失敗: ${orderError.message}`);
            }

            // 獲取客戶統計
            const { data: customerStats, error: customerError } = await this.client
                .from('customers')
                .select('id');

            if (customerError) {
                throw new Error(`獲取客戶統計失敗: ${customerError.message}`);
            }

            // 計算統計數據
            const stats = {
                totalOrders: orderStats?.length || 0,
                totalCustomers: customerStats?.length || 0,
                totalRevenue: orderStats?.reduce((sum: number, order: any) => 
                    sum + (parseFloat(order.total_amount) || 0), 0) || 0,
                ordersByStatus: {},
                ordersByPaymentStatus: {}
            };

            // 統計各種狀態的訂單數量
            orderStats?.forEach((order: any) => {
                stats.ordersByStatus[order.status] = (stats.ordersByStatus[order.status] || 0) + 1;
                stats.ordersByPaymentStatus[order.payment_status] = (stats.ordersByPaymentStatus[order.payment_status] || 0) + 1;
            });

            return stats;
        } catch (error) {
            console.error('SupabaseService.getAdminDashboard 錯誤:', error);
            throw error;
        }
    }

    /**
     * 驗證管理員登入（如果需要的話）
     * @param username 使用者名稱
     * @param password 密碼
     */
    async validateAdminLogin(username: string, password: string): Promise<boolean> {
        try {
            // 這裡可以實作管理員驗證邏輯
            // 暫時返回 true，實際應該查詢 admin_users 表
            const { data, error } = await this.client
                .from('admin_users')
                .select('id, username, password_hash, is_active')
                .eq('username', username)
                .eq('is_active', true)
                .single();

            if (error || !data) {
                return false;
            }

            // 實際應該使用加密比對密碼
            // 這裡簡化處理，實際使用時應該用 bcrypt 等加密庫
            return true;
        } catch (error) {
            console.error('SupabaseService.validateAdminLogin 錯誤:', error);
            return false;
        }
    }
}