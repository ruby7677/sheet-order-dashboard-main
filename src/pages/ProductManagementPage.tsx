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
import { listSettingsProducts, saveSettingsProduct, deleteSettingsProduct, updateSettingsStock } from '@/services/settingsApi';
import { getStockStatusLabel, getStockStatusVariant, STOCK_STATUS_OPTIONS, type StockStatus } from '@/utils/stockStatusUtils';

interface Product {
  id: string;
  product_id: string;
  name: string;
  price: number;
  weight?: string | number;
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

const ProductManagementPage: React.FC = () => {
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [readOnly,setReadOnly]=useState(true);
  const [revision,setRevision]=useState(0);
  const [saving,setSaving]=useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});

  // 載入商品資料
  const loadProducts = async () => {
    try {
      setLoading(true);
      const result = await listSettingsProducts();
      setProducts(result.data);setRevision(result.revision);setReadOnly(result.readOnly);
    } catch (error) {
      console.error('載入商品失敗:', error);
      toast({
        title: '錯誤',
        description: error instanceof Error ? error.message : '載入商品資料失敗',
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
      stock_status: 'in_stock' as StockStatus,
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

  const writeError=(error:unknown)=>toast({title:'操作失敗',description:error instanceof Error?error.message:'請重新載入後再試',variant:'destructive'});
  const handleSave=async()=>{if(readOnly||saving)return;setSaving(true);try{await saveSettingsProduct({...formData,product_id:editingProduct?.product_id||formData.product_id},revision,!editingProduct);setIsModalOpen(false);await loadProducts();toast({title:'商品已儲存',description:'前台與下單驗證會讀取同一份設定。'});}catch(error){writeError(error);}finally{setSaving(false);}};
  const handleDelete=async(product:Product)=>{if(readOnly||saving)return;setSaving(true);try{await deleteSettingsProduct(product.id,revision);await loadProducts();toast({title:'商品已下架'});}catch(error){writeError(error);}finally{setSaving(false);}};
  const handleQuickStockUpdate=async(product:Product,status:StockStatus,quantity?:number)=>{if(readOnly||saving)return;setSaving(true);try{await updateSettingsStock(product.id,status,quantity??product.stock_quantity,revision);await loadProducts();}catch(error){writeError(error);}finally{setSaving(false);}};

  // 渲染庫存狀態Badge（使用中文顯示）
  const renderStockStatusBadge = (status: string) => {
    const label = getStockStatusLabel(status);
    const variant = getStockStatusVariant(status);
    return <Badge variant={variant}>{label}</Badge>;
  };

  // 渲染可編輯的庫存狀態下拉選單（表格內快速編輯）
  const renderStockStatusSelect = (product: Product) => {
    return (
      <Select
        disabled={readOnly || saving}
        value={product.stock_status}
        onValueChange={(value: StockStatus) => handleQuickStockUpdate(product, value)}
      >
        <SelectTrigger className="w-32">
          <SelectValue>
            {renderStockStatusBadge(product.stock_status)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STOCK_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <Badge variant={getStockStatusVariant(option.value)}>
                {option.label}
              </Badge>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4">
        {/* 標題和操作按鈕 */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Package className="h-6 w-6" />
              商品管理
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">管理商品資料和庫存狀態</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadProducts} disabled={loading} aria-label="重新載入">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              重新載入
            </Button>
            <Button onClick={handleAdd} aria-label="新增商品">
              <Plus className="h-4 w-4 mr-2" />
              新增商品
            </Button>
          </div>
        </div>
        
        <Alert className="mb-4"><AlertDescription>{readOnly?'前後台資料來源尚未完成切換，暫停儲存。':'商品、價格與庫存與前台共用；若其他管理員或訂單已更新庫存，請重新載入後再修改。'}</AlertDescription></Alert>
        {/* 商品列表卡片 */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-gray-600">載入中...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">尚無商品資料</p>
                <Button className="mt-4" onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  新增第一個商品
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[960px] lg:min-w-[1120px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 whitespace-nowrap">排序</TableHead>
                      <TableHead className="w-36 whitespace-nowrap">商品ID</TableHead>
                      <TableHead className="w-[320px] whitespace-nowrap">商品名稱</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">價格</TableHead>
                      <TableHead className="w-20 whitespace-nowrap">單位</TableHead>
                      <TableHead className="w-40 whitespace-nowrap">庫存狀態</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">庫存數量</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">分類</TableHead>
                      <TableHead className="w-24 whitespace-nowrap">狀態</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="whitespace-nowrap">{product.sort_order}</TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{product.product_id}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{product.name}</TableCell>
                        <TableCell>NT$ {product.price}</TableCell>
                        <TableCell>{product.unit}</TableCell>
                        <TableCell>{renderStockStatusSelect(product)}</TableCell>
                        <TableCell className="whitespace-nowrap">{product.stock_quantity}</TableCell>
                        <TableCell className="whitespace-nowrap">{product.category}</TableCell>
                        <TableCell>
                          {product.is_active ? (
                            <Badge className="bg-green-100 text-green-800">啟用</Badge>
                          ) : (
                            <Badge variant="secondary">停用</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(product)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(product)} disabled={readOnly || saving}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 新增/編輯商品對話框 */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? '編輯商品' : '新增商品'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product_id">商品 ID *</Label>
                <Input
                  id="product_id"
                  disabled={Boolean(editingProduct)}
                  value={formData.product_id || ''}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  placeholder="請輸入商品 ID"
                />
              </div>
              
              <div>
                <Label htmlFor="name">商品名稱 *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="請輸入商品名稱"
                />
              </div>
              
              <div>
                <Label htmlFor="price">價格 (NT$) *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price || 0}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                />
              </div>
              
              <div>
                <Label htmlFor="weight">重量</Label>
                <Input
                  id="weight"
                  type="text"
                  
                  value={formData.weight ?? ''}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  placeholder="例如: 1500"
                />
              </div>
              
              <div>
                <Label htmlFor="unit">單位</Label>
                <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="條">條</SelectItem>
                    <SelectItem value="個">個</SelectItem>
                    <SelectItem value="盒">盒</SelectItem>
                    <SelectItem value="包">包</SelectItem>
                    <SelectItem value="份">份</SelectItem>
                    <SelectItem value="組">組</SelectItem>
                    <SelectItem value="瓶">瓶</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="stock_status">庫存狀態</Label>
                <Select 
                  value={formData.stock_status} 
                  onValueChange={(value: StockStatus) => setFormData({ ...formData, stock_status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
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
              
              <div>
                <Label htmlFor="stock_quantity">庫存數量</Label>
                <Input
                  id="stock_quantity"
                  type="number"
                  min="0"
                  value={formData.stock_quantity || 0}
                  onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                />
              </div>
              
              <div>
                <Label htmlFor="category">分類</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="蘿蔔糕">蘿蔔糕</SelectItem>
                    <SelectItem value="traditional">傳統口味</SelectItem>
                    <SelectItem value="premium">精選系列</SelectItem>
                    <SelectItem value="seasonal">季節限定</SelectItem>
                    <SelectItem value="general">一般商品</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="sort_order">排序順序</Label>
                <Input
                  id="sort_order"
                  type="number"
                  min="1"
                  value={formData.sort_order || 1}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="description">商品描述</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="例如: 1條約1500克(+-5%)"
                rows={2}
              />
            </div>
            
            <div>
              <Label htmlFor="detailed_description">詳細描述</Label>
              <Textarea
                id="detailed_description"
                value={formData.detailed_description || ''}
                onChange={(e) => setFormData({ ...formData, detailed_description: e.target.value })}
                placeholder="詳細的商品介紹..."
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="shipping_note">運費說明</Label>
              <Input
                id="shipping_note"
                value={formData.shipping_note || ''}
                onChange={(e) => setFormData({ ...formData, shipping_note: e.target.value })}
                placeholder="例如: 購買二條即可免運費"
              />
            </div>
            
            <div>
              <Label htmlFor="ingredients">成分</Label>
              <Textarea
                id="ingredients"
                value={formData.ingredients || ''}
                onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                placeholder="水,在來米,白蘿蔔"
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="image_url">圖片 URL</Label>
              <Input
                id="image_url"
                type="url"
                value={formData.image_url || ''}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_vegetarian"
                  checked={formData.is_vegetarian || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_vegetarian: checked })}
                />
                <Label htmlFor="is_vegetarian">素食</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active !== false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">啟用</Label>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="h-4 w-4 mr-2" />
                取消
              </Button>
              <Button onClick={handleSave} disabled={readOnly || saving}>
                <Save className="h-4 w-4 mr-2" />
                儲存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductManagementPage;
