import React from 'react';
import { Button } from '@/components/ui/button';
import { DuplicateGroup } from '@/services/orderService';
import { AlertTriangle, X, Phone, User, Hash } from 'lucide-react';

interface DuplicateOrdersDialogProps {
  /** 是否顯示對話框 */
  isOpen: boolean;
  /** 關閉對話框的回調函數 */
  onClose: () => void;
  /** 重複訂單群組列表 */
  duplicateGroups: DuplicateGroup[];
  /** 點擊訂單的回調函數 */
  onOrderClick?: (orderId: string) => void;
  /** 是否為自動警示模式 */
  isAutoAlert?: boolean;
}

/**
 * 重複訂單顯示對話框元件
 * 顯示所有重複電話號碼的訂單群組
 */
const DuplicateOrdersDialog: React.FC<DuplicateOrdersDialogProps> = ({
  isOpen,
  onClose,
  duplicateGroups,
  onOrderClick,
  isAutoAlert = false
}) => {
  if (!isOpen) return null;

  // 計算總重複訂單數量
  const totalDuplicateOrders = duplicateGroups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* 標題列 */}
        <div className={`flex items-center justify-between p-6 border-b ${isAutoAlert ? 'bg-red-50' : 'bg-yellow-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isAutoAlert ? 'bg-red-100' : 'bg-yellow-100'}`}>
              <AlertTriangle className={`h-5 w-5 ${isAutoAlert ? 'text-red-600' : 'text-yellow-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isAutoAlert ? 'text-red-900' : 'text-yellow-900'}`}>
                {isAutoAlert ? '⚠️ 重複訂單警示' : '重複訂單檢測結果'}
              </h2>
              <p className={`text-sm ${isAutoAlert ? 'text-red-700' : 'text-yellow-700'}`}>
                {isAutoAlert
                  ? `系統檢測到 ${duplicateGroups.length} 組重複電話，共 ${totalDuplicateOrders} 筆訂單，請注意檢查！`
                  : `發現 ${duplicateGroups.length} 組重複電話，共 ${totalDuplicateOrders} 筆訂單`
                }
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={`${isAutoAlert ? 'text-red-600 hover:bg-red-100' : 'text-yellow-600 hover:bg-yellow-100'}`}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 內容區域 */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-8">
              <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">沒有發現重複訂單</h3>
              <p className="text-gray-500">所有訂單的電話號碼都是唯一的</p>
            </div>
          ) : (
            <div className="space-y-6">
              {duplicateGroups.map((group, groupIndex) => (
                <div key={group.normalizedPhone} className="border rounded-lg overflow-hidden">
                  {/* 群組標題 */}
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-600" />
                        <span className="font-medium text-gray-900">
                          電話號碼：{group.phone}
                        </span>
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                          {group.count} 筆重複
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        群組 #{groupIndex + 1}
                      </div>
                    </div>
                  </div>

                  {/* 訂單列表 */}
                  <div className="divide-y divide-gray-100">
                    {group.orders.map((order, orderIndex) => (
                      <div
                        key={order.id}
                        className={`p-4 hover:bg-gray-50 transition-colors ${
                          onOrderClick ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => onOrderClick?.(order.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4 text-gray-400" />
                              <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                {order.orderNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <span className="font-medium text-gray-900">
                                {order.customerName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600 font-mono text-sm">
                                {order.customerPhone}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              訂單 #{orderIndex + 1}
                            </span>
                            {onOrderClick && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => onOrderClick(order.id)}
                              >
                                查看詳情
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部按鈕區域 */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {duplicateGroups.length > 0 && (
              <>
                {isAutoAlert
                  ? '🚨 建議立即檢查這些重複訂單，確認是否為同一客戶的重複下單或系統錯誤'
                  : '💡 提示：點擊訂單可查看詳細資訊，建議檢查是否為同一客戶的重複下單'
                }
              </>
            )}
          </div>
          <Button
            onClick={onClose}
            className={`${isAutoAlert ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white`}
          >
            {isAutoAlert ? '我知道了' : '關閉'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateOrdersDialog;
