import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { OrderItem } from '@/types/order';
import { Plus, Minus, Trash2, ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// 可用商品清單及價格
const AVAILABLE_PRODUCTS = [
  { name: '原味蘿蔔糕', price: 250 },
  { name: '芋頭粿', price: 350 },
  { name: '台式鹹蘿蔔糕', price: 350 },
  { name: '鳳梨豆腐乳', price: 350 },
] as const;

interface OrderItemEditorProps {
  items: OrderItem[];
  open: boolean;
  onClose: () => void;
  onSave: (items: OrderItem[], newTotal: number) => void;
  isLoading?: boolean;
}

/**
 * 訂單商品編輯對話框組件
 * 提供商品數量調整、新增、刪除功能，並即時計算總金額
 */
const OrderItemEditor: React.FC<OrderItemEditorProps> = ({
  items,
  open,
  onClose,
  onSave,
  isLoading = false
}) => {
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [newProductName, setNewProductName] = useState<string>('');
  const { toast } = useToast();

  // 當對話框開啟時，初始化編輯項目
  useEffect(() => {
    if (open) {
      setEditedItems([...items]);
      setNewProductName('');
    }
  }, [open, items]);

  /**
   * 計算總金額
   */
  const calculateTotal = (itemList: OrderItem[]): number => {
    return itemList.reduce((total, item) => total + item.subtotal, 0);
  };

  /**
   * 更新商品數量
   */
  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) {return;}

    const updatedItems = [...editedItems];
    updatedItems[index] = {
      ...updatedItems[index],
      quantity: newQuantity,
      subtotal: updatedItems[index].price * newQuantity
    };
    setEditedItems(updatedItems);
  };

  /**
   * 刪除商品項目
   */
  const removeItem = (index: number) => {
    const updatedItems = editedItems.filter((_, i) => i !== index);
    setEditedItems(updatedItems);

    toast({
      title: '商品已移除',
      description: '商品項目已從訂單中移除',
    });
  };

  /**
   * 新增商品
   */
  const addProduct = () => {
    if (!newProductName) {
      toast({
        title: '請選擇商品',
        description: '請先選擇要新增的商品',
        variant: 'destructive',
      });
      return;
    }

    const product = AVAILABLE_PRODUCTS.find(p => p.name === newProductName);
    if (!product) {
      toast({
        title: '商品不存在',
        description: '選擇的商品不在可用清單中',
        variant: 'destructive',
      });
      return;
    }

    // 檢查是否已存在相同商品
    const existingIndex = editedItems.findIndex(item => item.product === product.name);

    if (existingIndex >= 0) {
      // 如果已存在，增加數量
      updateQuantity(existingIndex, editedItems[existingIndex].quantity + 1);
      toast({
        title: '商品數量已增加',
        description: `${product.name} 數量已增加 1`,
      });
    } else {
      // 新增商品項目
      const newItem: OrderItem = {
        product: product.name,
        price: product.price,
        quantity: 1,
        subtotal: product.price
      };

      setEditedItems([...editedItems, newItem]);
      toast({
        title: '商品已新增',
        description: `${product.name} 已新增到訂單中`,
      });
    }

    setNewProductName('');
  };

  /**
   * 儲存變更
   */
  const handleSave = () => {
    if (editedItems.length === 0) {
      toast({
        title: '訂單不能為空',
        description: '訂單至少需要包含一個商品項目',
        variant: 'destructive',
      });
      return;
    }

    const newTotal = calculateTotal(editedItems);
    onSave(editedItems, newTotal);
  };

  /**
   * 取消編輯
   */
  const handleCancel = () => {
    setEditedItems([...items]);
    setNewProductName('');
    onClose();
  };

  const currentTotal = calculateTotal(editedItems);

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            編輯訂單商品
          </DialogTitle>
          <DialogDescription>
            調整商品數量、新增或刪除商品項目，系統會自動重新計算總金額
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* 現有商品清單 */}
          <div>
            <h3 className="font-medium mb-3">訂單商品</h3>
            {editedItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                目前沒有商品項目
              </div>
            ) : (
              <div className="space-y-2">
                {editedItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 border rounded-lg bg-muted/[0.2]"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{item.product}</div>
                      <div className="text-sm text-muted-foreground">
                        單價: ${item.price}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const newQuantity = parseInt(e.target.value) || 1;
                          updateQuantity(index, newQuantity);
                        }}
                        className="w-16 text-center"
                        min="1"
                      />

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="w-20 text-right font-medium">
                      ${item.subtotal}
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 新增商品區域 */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">新增商品</h3>
            <div className="flex gap-2">
              <Select value={newProductName} onValueChange={setNewProductName}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="選擇要新增的商品" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PRODUCTS.map((product) => (
                    <SelectItem key={product.name} value={product.name}>
                      {product.name} - ${product.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={addProduct} disabled={!newProductName}>
                <Plus className="h-4 w-4 mr-2" />
                新增
              </Button>
            </div>
          </div>

          {/* 總金額顯示 */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>訂單總金額:</span>
              <span>${currentTotal}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? '儲存中...' : '儲存變更'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderItemEditor;
