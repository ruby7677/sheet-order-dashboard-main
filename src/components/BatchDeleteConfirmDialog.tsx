import React from 'react';
import { Button } from '@/components/ui/button';
import { Order } from '@/types/order';
import { AlertTriangle, X } from 'lucide-react';

interface BatchDeleteConfirmDialogProps {
  /** 是否顯示對話框 */
  isOpen: boolean;
  /** 關閉對話框的回調函數 */
  onClose: () => void;
  /** 確認刪除的回調函數 */
  onConfirm: () => void;
  /** 要刪除的訂單列表 */
  orders: Order[];
  /** 是否正在處理刪除 */
  isDeleting: boolean;
}

/**
 * 批次刪除訂單確認對話框元件
 * 提供二次確認機制，顯示將要刪除的訂單詳情
 */
const BatchDeleteConfirmDialog: React.FC<BatchDeleteConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  orders,
  isDeleting
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* 標題列 */}
        <div className="flex items-center justify-between p-6 border-b bg-red-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-red-900">
                批次刪除訂單確認
              </h2>
              <p className="text-sm text-red-700">
                此操作將永久刪除選中的訂單，無法復原
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isDeleting}
            className="text-red-600 hover:bg-red-100"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 內容區域 */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 mb-2">
              您即將刪除 <span className="font-semibold text-red-600">{orders.length}</span> 筆訂單：
            </p>
          </div>

          {/* 訂單列表 */}
          <div className="max-h-60 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-700">訂單編號</th>
                  <th className="text-left p-3 font-medium text-gray-700">客戶姓名</th>
                  <th className="text-left p-3 font-medium text-gray-700">商品摘要</th>
                  <th className="text-right p-3 font-medium text-gray-700">總金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order, index) => (
                  <tr key={order.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {order.orderNumber}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-900">
                      {order.customer.name}
                    </td>
                    <td className="p-3 text-gray-600 max-w-xs truncate">
                      {order.items.map(item => `${item.product} x${item.quantity}`).join('、')}
                    </td>
                    <td className="p-3 text-right font-semibold text-gray-900">
                      ${order.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 警告訊息 */}
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium mb-1">⚠️ 重要提醒：</p>
                <ul className="list-disc list-inside space-y-1 text-red-700">
                  <li>此操作將從 Google Sheets 中永久刪除這些訂單</li>
                  <li>刪除後無法復原，請確認您真的要執行此操作</li>
                  <li>後續訂單的ID將會自動重新排序</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 按鈕區域 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="border-2 border-gray-300 hover:bg-gray-100"
          >
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white border-2 border-red-600 hover:border-red-700 font-medium"
          >
            {isDeleting ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                刪除中...
              </div>
            ) : (
              `確認刪除 ${orders.length} 筆訂單`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BatchDeleteConfirmDialog;
