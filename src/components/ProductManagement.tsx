import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Package, 
  Save, 
  X,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getStockStatusLabel, getStockStatusVariant, STOCK_STATUS_OPTIONS, type StockStatus } from '@/utils/stockStatusUtils';

interface Product {
  id: string;
  product_id: string;
  name: string;
  price: number;
  weight?: number;
  unit: string;
  description?: string;
  detailed_description?: string;
  ingredients?: string;
  image_url?: string;
  is_vegetarian: boolean;
  shipping_note?: string;
  sort_order: number;
  stock_quantity: number;
  is_active: boolean;
  stock_status: StockStatus;
  category: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * 取得 API 基礎 URL
 */
function getApiBaseUrl(): string {
  try {
    const isLocal = typeof window !== 'undefined' && 
                   (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    return isLocal 
      ? 'http://127.0.0.1:5714/api' 
      : 'https://sheet-order-api.ruby7677.workers.dev/api';
  } catch {
    return 'https://sheet-order-api.ruby7677.workers.dev/api';
  }
}

/**
 * 公開的商品管理組件（不需要認證）
 */
export function ProductManagement() {
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});

  // 載入商品資料（使用公開 API）
  const loadProducts = async () => {
    try {
      setLoading(true);
      
      // 使用公開的 API 端點
      const apiUrl = `${getApiBaseUrl()}/products`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProducts((result.data as Product[]) || []);
        } else {
          throw new Error(result.message || '載入商品失敗');
        }
      } else {
        // 後備：直接使用 Supabase
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('sort_order', { ascending: true });
        
        if (error) { 
          throw new Error(error.message); 
        }
        setProducts((data as Product[]) || []);
      }
    } catch (error) {
      console.error('載入商品失敗:', error);
      toast({
        title: '錯誤',
        description: (error as any)?.message || '載入商品資料失敗',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // 開啟新增模態框
  const handleAdd = () => {
    setEditingProduct(null);
    setFormData({
      product_id: '',
      name: '',
      price: 0,
      weight: 0,
      unit: '條',
      description: '',
      detailed_description: '',
      ingredients: '',
      image_url: '',
      is_vegetarian: false,
      shipping_note: '',
      sort_order: products.length + 1,
      stock_quantity: 0,
      is_active: true,
      stock_status: 'available' as StockStatus,
      category: '蘿蔔糕'
    });
    setIsModalOpen(true);
  };

  // 開啟編輯模態框
  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ ...product });
    setIsModalOpen(true);
  };

  // 儲存商品（使用公開 API）
  const handleSave = async () => {
    try {
      if (!formData.product_id || !formData.name || !formData.price) {
        toast({
          title: '錯誤',
          description: '請填寫必要欄位',
          variant: 'destructive',
        });
        return;
      }

      const apiUrl = `${getApiBaseUrl()}/products`;
      let response: Response;

      if (editingProduct) {
        // 更新商品
        response = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingProduct.id,
            ...formData,
            stock_status: formData.stock_status
          })
        });
      } else {
        // 新增商品
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...formData,
            stock_status: formData.stock_status
          })
        });
      }

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          toast({
            title: '成功',
            description: editingProduct ? '商品已更新' : '商品已新增',
          });
          setIsModalOpen(false);
          loadProducts();
        } else {
          throw new Error(result.message || '儲存失敗');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API 請求失敗: ${response.status}`);
      }
    } catch (error: any) {
      console.error('儲存商品失敗:', error);
      toast({
        title: '錯誤',
        description: error?.message || '儲存商品失敗',
        variant: 'destructive',
      });
    }
  };

  // 刪除商品（使用公開 API）
  const handleDelete = async (product: Product) => {
    if (!confirm(`確定要刪除商品「${product.name}」嗎？`)) {
      return;
    }

    try {
      const apiUrl = `${getApiBaseUrl()}/products?id=${encodeURIComponent(product.id)}`;
      const response = await fetch(apiUrl, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          toast({
            title: '成功',
            description: '商品已刪除',
          });
          loadProducts();
        } else {
          throw new Error(result.message || '刪除失敗');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API 請求失敗: ${response.status}`);
      }
    } catch (error: any) {
      console.error('刪除商品失敗:', error);
      toast({
        title: '錯誤',
        description: error?.message || '刪除商品失敗',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            商品管理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <Button onClick={handleAdd} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                新增商品
              </Button>
              <Button variant="outline" onClick={loadProducts} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                重新載入
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">載入中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品代碼</TableHead>
                  <TableHead>商品名稱</TableHead>
                  <TableHead>價格</TableHead>
                  <TableHead>庫存狀態</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.product_id}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>NT$ {product.price}</TableCell>
                    <TableCell>
                      <Badge variant={getStockStatusVariant(product.stock_status)}>
                        {getStockStatusLabel(product.stock_status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>
                      <Badge variant={product.is_active ? "default" : "secondary"}>
                        {product.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(product)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 商品編輯模態框 */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? '編輯商品' : '新增商品'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="product_id">商品代碼 *</Label>
              <Input
                id="product_id"
                value={formData.product_id || ''}
                onChange={(e) => setFormData({...formData, product_id: e.target.value})}
                placeholder="輸入商品代碼"
              />
            </div>
            
            <div>
              <Label htmlFor="name">商品名稱 *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="輸入商品名稱"
              />
            </div>
            
            <div>
              <Label htmlFor="price">價格 *</Label>
              <Input
                id="price"
                type="number"
                value={formData.price || 0}
                onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
                placeholder="輸入價格"
              />
            </div>
            
            <div>
              <Label htmlFor="category">分類</Label>
              <Select value={formData.category || ''} onValueChange={(value) => setFormData({...formData, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇分類" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="蘿蔔糕">蘿蔔糕</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="stock_status">庫存狀態</Label>
              <Select value={formData.stock_status || ''} onValueChange={(value) => setFormData({...formData, stock_status: value as StockStatus})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇庫存狀態" />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active || false}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <Label htmlFor="is_active">啟用商品</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              取消
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              儲存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}