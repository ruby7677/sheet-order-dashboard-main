import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, ArrowLeft, Save, RefreshCw, Eye, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deliverySettingsService, type DeliverySettingsFormData } from '@/services/deliverySettingsService';
import type { AvailableDateItem } from '@/services/deliverySettingsService';

interface DeliverySettingsPageProps {
  onBack?: () => void;
}

interface CurrentSettings {
  id: string;
  start_date: string;
  end_date: string;
  description: string | null;
  is_active: boolean | null;
  updated_by: string | null;
  updated_at: string | null;
}

const DeliverySettingsPage: React.FC<DeliverySettingsPageProps> = ({ onBack }) => {
  const { toast } = useToast();
  
  // 表單狀態
  const [formData, setFormData] = useState<DeliverySettingsFormData>({
    start_date: '',
    end_date: '',
    description: '',
    updated_by: 'admin'
  });
  
  // UI 狀態
  const [currentSettings, setCurrentSettings] = useState<CurrentSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // 預覽數據
  const [homeDeliveryDates, setHomeDeliveryDates] = useState<AvailableDateItem[]>([]);
  const [storePickupDates, setStorePickupDates] = useState<AvailableDateItem[]>([]);

  // 載入當前設定
  const loadCurrentSettings = async () => {
    setIsLoading(true);
    try {
      const response = await deliverySettingsService.getCurrentSettings();
      
      if (response.success && response.data) {
        setCurrentSettings(response.data);
        setFormData({
          start_date: response.data.start_date,
          end_date: response.data.end_date,
          description: response.data.description || '',
          updated_by: 'admin'
        });
        
        // 自動載入預覽
        await updatePreview(response.data.start_date, response.data.end_date);
      } else {
        toast({
          title: '載入失敗',
          description: response.message || '無法載入當前設定',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('載入設定錯誤:', error);
      toast({
        title: '載入錯誤',
        description: '載入配送設定時發生錯誤',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 更新預覽
  const updatePreview = async (startDate?: string, endDate?: string) => {
    const start = startDate || formData.start_date;
    const end = endDate || formData.end_date;
    
    if (!start || !end) return;

    try {
      const [homeResponse, storeResponse] = await Promise.all([
        deliverySettingsService.getAvailableDates('宅配到府', start, end),
        deliverySettingsService.getAvailableDates('超商取貨', start, end)
      ]);

      if (homeResponse.success && homeResponse.data) {
        setHomeDeliveryDates(homeResponse.data);
      }
      
      if (storeResponse.success && storeResponse.data) {
        setStorePickupDates(storeResponse.data);
      }
      
      setShowPreview(true);
    } catch (error) {
      console.error('更新預覽失敗:', error);
    }
  };

  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.start_date || !formData.end_date) {
      toast({
        title: '表單錯誤',
        description: '請填寫開始日期和結束日期',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await deliverySettingsService.updateSettings(formData);
      
      if (response.success) {
        toast({
          title: '設定更新成功',
          description: '配送日期設定已成功更新',
        });
        
        // 重新載入設定
        await loadCurrentSettings();
      } else {
        toast({
          title: '更新失敗',
          description: response.message || '無法更新配送設定',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('更新設定錯誤:', error);
      toast({
        title: '更新錯誤',
        description: '更新配送設定時發生錯誤',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 表單變更處理
  const handleFormChange = (field: keyof DeliverySettingsFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // 如果是日期變更，自動更新預覽
    if (field === 'start_date' || field === 'end_date') {
      const newFormData = { ...formData, [field]: value };
      if (newFormData.start_date && newFormData.end_date) {
        updatePreview(newFormData.start_date, newFormData.end_date);
      }
    }
  };

  // 格式化更新時間
  const formatUpdateTime = (timeString: string | null) => {
    if (!timeString) return '未知';
    
    try {
      const date = new Date(timeString);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return timeString;
    }
  };

  // 組件掛載時載入設定
  useEffect(() => {
    loadCurrentSettings();
  }, []);

  return (
    <div className="space-y-6">
      {/* 標題區域 */}
      <div className="flex items-center gap-4">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground">設定到貨日期</h1>
          <p className="text-muted-foreground">管理訂單配送時程設定</p>
        </div>
      </div>

      {/* 當前設定顯示 */}
      {currentSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              當前設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between">
                <span className="font-medium">開始日期：</span>
                <span className="text-muted-foreground">{currentSettings.start_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">結束日期：</span>
                <span className="text-muted-foreground">{currentSettings.end_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">設定說明：</span>
                <span className="text-muted-foreground">{currentSettings.description || '無'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">最後更新：</span>
                <span className="text-muted-foreground">
                  {formatUpdateTime(currentSettings.updated_at)} ({currentSettings.updated_by})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 設定表單 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            配送日期設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">開始日期 *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleFormChange('start_date', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">結束日期 *</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleFormChange('end_date', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">設定說明</Label>
              <Textarea
                id="description"
                placeholder="例如：春節檔期到貨日設定"
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="submit"
                disabled={isSaving || isLoading}
                className="flex items-center gap-2"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? '儲存中...' : '儲存設定'}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={loadCurrentSettings}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                重新載入
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => updatePreview()}
                disabled={!formData.start_date || !formData.end_date}
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                更新預覽
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 預覽區域 */}
      {showPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              可選日期預覽
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>配送規則：</strong>宅配到府排除星期日，7-11門市取貨包含星期日
              </AlertDescription>
            </Alert>

            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                宅配到府可選日期
                <Badge variant="secondary">{homeDeliveryDates.length} 天</Badge>
              </h4>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {homeDeliveryDates.slice(0, 16).map((date) => (
                  <div
                    key={date.value}
                    className={`p-2 text-xs text-center rounded border ${
                      date.isSunday 
                        ? 'bg-red-50 border-red-200 text-red-600' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {date.display}
                  </div>
                ))}
                {homeDeliveryDates.length > 16 && (
                  <div className="p-2 text-xs text-center rounded border bg-muted text-muted-foreground">
                    +{homeDeliveryDates.length - 16}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                7-11門市取貨可選日期
                <Badge variant="secondary">{storePickupDates.length} 天</Badge>
              </h4>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {storePickupDates.slice(0, 16).map((date) => (
                  <div
                    key={date.value}
                    className={`p-2 text-xs text-center rounded border ${
                      date.isSunday 
                        ? 'bg-red-50 border-red-200 text-red-600' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {date.display}
                  </div>
                ))}
                {storePickupDates.length > 16 && (
                  <div className="p-2 text-xs text-center rounded border bg-muted text-muted-foreground">
                    +{storePickupDates.length - 16}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 系統說明 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            系統說明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            • 配送日期設定會即時生效，影響客戶在前台下單時可選擇的配送日期
          </p>
          <p className="text-sm text-muted-foreground">
            • 宅配到府服務會自動排除星期日，7-11門市取貨則包含星期日
          </p>
          <p className="text-sm text-muted-foreground">
            • 開始日期不能早於今天，結束日期可以與開始日期同一天（設定單日配送）
          </p>
          <p className="text-sm text-muted-foreground">
            • 每次更新設定會創建新的記錄並保留歷史版本
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeliverySettingsPage;