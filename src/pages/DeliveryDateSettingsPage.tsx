import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  Save, 
  RefreshCw, 
  Eye, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import SecureApiService from '@/services/secureApiService';

interface DeliverySetting {
  id: string;
  start_date: string;
  end_date: string;
  description?: string;
  is_active: boolean;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

interface PreviewDate {
  date: string;
  display: string;
  dayOfWeek: number;
  isSunday: boolean;
}

const DeliveryDateSettingsPage: React.FC = () => {
  const { toast } = useToast();
  
  const [currentSettings, setCurrentSettings] = useState<DeliverySetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
    description: ''
  });
  const [previewDates, setPreviewDates] = useState({
    homeDelivery: [] as PreviewDate[],
    storePickup: [] as PreviewDate[]
  });

  // 載入當前設定
  const loadCurrentSettings = async () => {
    try {
      setLoading(true);
      
      // 優先走安全 Edge Function（帶有 admin JWT），避免 RLS/匿名權限問題
      try {
        // TODO: 等 SecureApiService 支援 delivery_date_settings API 後使用
        // const data = await new SecureApiService().getDeliveryDateSettings();
        // 暫時直接使用 supabase
        const { data } = await supabase
          .from('delivery_date_settings')
          .select('*')
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data) {
          setCurrentSettings(data);
          setFormData({
            start_date: data.start_date,
            end_date: data.end_date,
            description: data.description || ''
          });
          generatePreviewDates(data.start_date, data.end_date);
        }
      } catch (e) {
        // 後備：若未登入或 Edge Function 尚未部署，才直接走 anon supabase
        try {
          const { data, error, status, statusText } = await supabase
            .from('delivery_date_settings')
            .select('*')
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
          if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            throw new Error(`[${status} ${statusText}] ${error.message}`);
          }
          if (data) {
            setCurrentSettings(data);
            setFormData({
              start_date: data.start_date,
              end_date: data.end_date,
              description: data.description || ''
            });
            generatePreviewDates(data.start_date, data.end_date);
          } else {
            // 如果沒有資料，初始化空的表單
            setCurrentSettings(null);
            setFormData({
              start_date: '',
              end_date: '',
              description: ''
            });
          }
        } catch (fallbackError) {
          console.error('載入設定失敗:', fallbackError);
          setCurrentSettings(null);
          setFormData({
            start_date: '',
            end_date: '',
            description: ''
          });
        }
      }
    } catch (error) {
      console.error('載入設定錯誤:', error);
      toast({
        title: '錯誤',
        description: '載入到貨日期設定失敗',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 生成預覽日期
  const generatePreviewDates = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) {
      setPreviewDates({ homeDelivery: [], storePickup: [] });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: PreviewDate[] = [];
    
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      const isSunday = dayOfWeek === 0;
      
      dates.push({
        date: current.toISOString().split('T')[0],
        display: current.toLocaleDateString('zh-TW', { 
          month: '2-digit', 
          day: '2-digit',
          weekday: 'short'
        }),
        dayOfWeek,
        isSunday
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    setPreviewDates({
      homeDelivery: dates.filter(d => !d.isSunday), // 宅配排除週日
      storePickup: dates // 7-11 包含週日
    });
  };

  // 儲存設定
  const handleSave = async () => {
    if (!formData.start_date || !formData.end_date) {
      toast({
        title: '錯誤',
        description: '請填入開始日期和結束日期',
        variant: 'destructive',
      });
      return;
    }

    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      toast({
        title: '錯誤',
        description: '開始日期不能晚於結束日期',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // 優先 Edge Function（帶有 admin JWT），失敗回退 supabase 直連
      try {
        // TODO: 等 SecureApiService 支援 delivery_date_settings API 後使用
        // await new SecureApiService().updateDeliveryDateSettings({ ... });
        
        // 先將現有的設定設為非活躍
        if (currentSettings) {
          await supabase
            .from('delivery_date_settings')
            .update({ is_active: false })
            .eq('id', currentSettings.id);
        }

        // 新增新設定
        const { data, error } = await supabase
          .from('delivery_date_settings')
          .insert({
            start_date: formData.start_date,
            end_date: formData.end_date,
            description: formData.description,
            is_active: true,
            updated_by: 'admin'
          })
          .select()
          .single();

        if (error) throw error;
        setCurrentSettings(data);
      } catch (_) {
        // 後備方案：直接使用 supabase
        const { error, status, statusText } = await supabase
          .from('delivery_date_settings')
          .update({ is_active: false })
          .neq('id', '00000000-0000-0000-0000-000000000000'); // 更新所有現有記錄

        if (error) throw new Error(`[${status} ${statusText}] ${error.message}`);

        const { data, error: insertError, status: insertStatus, statusText: insertStatusText } = await supabase
          .from('delivery_date_settings')
          .insert({
            start_date: formData.start_date,
            end_date: formData.end_date,
            description: formData.description,
            is_active: true,
            updated_by: 'admin'
          })
          .select()
          .single();

        if (insertError) throw new Error(`[${insertStatus} ${insertStatusText}] ${insertError.message}`);
        setCurrentSettings(data);
      }

      generatePreviewDates(formData.start_date, formData.end_date);
      
      toast({
        title: '成功',
        description: '到貨日期設定已更新',
      });
    } catch (error) {
      console.error('儲存設定錯誤:', error);
      toast({
        title: '錯誤',
        description: '儲存設定失敗',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  // 當表單資料變更時更新預覽
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      generatePreviewDates(formData.start_date, formData.end_date);
    }
  }, [formData.start_date, formData.end_date]);

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4">
        {/* 標題 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            到貨日期設定
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">設定本檔期可選擇的到貨日期範圍</p>
        </div>
        
        <div className="space-y-6">
        {/* 當前設定顯示 */}
        {currentSettings && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                當前設定
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-muted-foreground">開始日期：</span>
                  <span>{currentSettings.start_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-muted-foreground">結束日期：</span>
                  <span>{currentSettings.end_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-muted-foreground">設定說明：</span>
                  <span>{currentSettings.description || '無'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-muted-foreground">最後更新：</span>
                  <span>
                    {formatDateTime(currentSettings.updated_at)} 
                    {currentSettings.updated_by && ` (${currentSettings.updated_by})`}
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
              更新設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="start-date" className="text-base font-semibold text-foreground">
                  開始日期
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  required
                  className="text-lg h-12 border-2 focus:border-primary"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="end-date" className="text-base font-semibold text-foreground">
                  結束日期
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  required
                  className="text-lg h-12 border-2 focus:border-primary"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">設定說明</Label>
              <Textarea
                id="description"
                placeholder="例如：春節檔期到貨日設定"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button 
                onClick={handleSave} 
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                儲存設定
              </Button>
              <Button 
                variant="outline" 
                onClick={loadCurrentSettings}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                重新載入
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 預覽區域 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              可選日期預覽
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>宅配到府：</strong>排除星期日 
                <strong>7-11門市取貨：</strong>包含星期日
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">宅配到府可選日期：</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {previewDates.homeDelivery.length > 0 ? (
                    previewDates.homeDelivery.map((date, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary"
                        className="justify-center text-xs py-1"
                      >
                        {date.display}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground col-span-full">請設定日期範圍</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">7-11門市取貨可選日期：</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {previewDates.storePickup.length > 0 ? (
                    previewDates.storePickup.map((date, index) => (
                      <Badge 
                        key={index} 
                        variant={date.isSunday ? "destructive" : "secondary"}
                        className="justify-center text-xs py-1"
                      >
                        {date.display}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground col-span-full">請設定日期範圍</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default DeliveryDateSettingsPage;