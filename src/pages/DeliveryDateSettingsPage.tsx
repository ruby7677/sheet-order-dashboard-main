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
import { getDeliverySetting, saveDeliverySetting } from '@/services/settingsApi';
import { Switch } from '@/components/ui/switch';

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
  const [saving,setSaving]=useState(false);
  const [readOnly,setReadOnly]=useState(true);
  const [revision,setRevision]=useState(0);
  const [homeAdvanceDays,setHomeAdvanceDays]=useState(0);
  const [storeAdvanceDays,setStoreAdvanceDays]=useState(0);
  const [excludeHomeSunday,setExcludeHomeSunday]=useState(true);
  const [excludeStoreSunday,setExcludeStoreSunday]=useState(false);
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
  const loadCurrentSettings=async()=>{try{setLoading(true);const result=await getDeliverySetting(),data=result.data;setRevision(result.revision);setReadOnly(result.readOnly);setCurrentSettings(data);setFormData({start_date:data.start_date,end_date:data.end_date,description:data.description||''});setExcludeHomeSunday(data.excludeHomeSunday??true);setExcludeStoreSunday(data.excludeStoreSunday??false);setHomeAdvanceDays(data.homeAdvanceDays??0);setStoreAdvanceDays(data.storeAdvanceDays??0);}catch{toast({title:'錯誤',description:'無法讀取目前到貨日期設定',variant:'destructive'});}finally{setLoading(false);}};

  const generatePreviewDates = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) {
      setPreviewDates({ homeDelivery: [], storePickup: [] });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: PreviewDate[] = [];
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end||end.getTime()-start.getTime()>366*86400000){setPreviewDates({homeDelivery:[],storePickup:[]});return;}
    
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getUTCDay();
      const isSunday = dayOfWeek === 0;
      
      dates.push({
        date: current.toISOString().split('T')[0],
        display: current.toLocaleDateString('zh-TW', { 
          month: '2-digit', 
          day: '2-digit',
          weekday: 'short'
          ,timeZone:'Asia/Taipei'
        }),
        dayOfWeek,
        isSunday
      });
      
      current.setUTCDate(current.getUTCDate() + 1);
    }
    
    const today=Date.parse(new Date(Date.now()+8*3600000).toISOString().slice(0,10));
    setPreviewDates({homeDelivery:dates.filter(d=>(!excludeHomeSunday||!d.isSunday)&&Date.parse(d.date)>=today+homeAdvanceDays*86400000),storePickup:dates.filter(d=>(!excludeStoreSunday||!d.isSunday)&&Date.parse(d.date)>=today+storeAdvanceDays*86400000)});
  };

  const handleSave=async()=>{if(readOnly||saving)return;setSaving(true);try{await saveDeliverySetting({...formData,exclude_home_sunday:excludeHomeSunday,exclude_store_sunday:excludeStoreSunday,home_advance_days:homeAdvanceDays,store_advance_days:storeAdvanceDays},revision);await loadCurrentSettings();toast({title:'到貨設定已儲存',description:'前台可選日期與下單驗證已使用這份規則。'});}catch(error){toast({title:'儲存失敗',description:error instanceof Error?error.message:'請重新載入後再試',variant:'destructive'});}finally{setSaving(false);}};

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  // 當表單資料變更時更新預覽
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      generatePreviewDates(formData.start_date, formData.end_date);
    }
  }, [formData.start_date, formData.end_date, excludeHomeSunday, excludeStoreSunday,homeAdvanceDays,storeAdvanceDays]);

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
          <p className="mt-1 text-sm text-muted-foreground">設定前台可選的到貨日期，並分別確認宅配與 7-11 的限制。</p>
        </div>
        
        <Alert className="mb-4"><AlertDescription>{loading?'正在讀取目前設定…':readOnly?'目前僅供查看，暫時無法儲存。請確認設定服務後再試。':'此設定與前台共用。請先確認下方日期預覽，再儲存本次修改。'}</AlertDescription></Alert>
        <div className="space-y-6">
        {/* 當前設定顯示 */}
        {currentSettings && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                已儲存的設定
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start justify-between gap-6 leading-relaxed [&>span:first-child]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:break-words [&>span:last-child]:text-right">
                  <span className="font-medium text-muted-foreground">開始日期：</span>
                  <span>{currentSettings.start_date}</span>
                </div>
                <div className="flex items-start justify-between gap-6 leading-relaxed [&>span:first-child]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:break-words [&>span:last-child]:text-right">
                  <span className="font-medium text-muted-foreground">結束日期：</span>
                  <span>{currentSettings.end_date}</span>
                </div>
                <div className="flex items-start justify-between gap-6 leading-relaxed [&>span:first-child]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:break-words [&>span:last-child]:text-right">
                  <span className="font-medium text-muted-foreground">設定說明：</span>
                  <span>{currentSettings.description || '無'}</span>
                </div>
                <div className="flex items-start justify-between gap-6 leading-relaxed [&>span:first-child]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:break-words [&>span:last-child]:text-right">
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
              編輯到貨日期
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="start-date" className="text-base font-semibold text-foreground">
                  開始日期
                </Label>
                <Input
                  id="start-date"
                  aria-describedby="delivery-range-help"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  required
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="end-date" className="text-base font-semibold text-foreground">
                  結束日期
                </Label>
                <Input
                  id="end-date"
                  aria-describedby="delivery-range-help"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  required
                  className="h-11 text-base"
                />
              </div>
            </div>
            
            <p id="delivery-range-help" className="text-sm leading-relaxed text-muted-foreground">開始與結束日期為本次可選範圍；實際日期還會套用下方的星期日與提前天數設定。</p>
            <div className="space-y-2">
              <Label htmlFor="description">設定說明（選填）</Label>
              <Textarea
                id="description"
                placeholder="例如：春節檔期到貨日設定"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="min-h-24 resize-y text-base"
                aria-describedby="delivery-description-help"
              />
              <p id="delivery-description-help" className="text-sm text-muted-foreground">可註明本次檔期或調整原因，方便日後辨識。</p>
            </div>

            <div className="flex gap-3 flex-wrap border-t pt-6">
              <div className="mb-3 grid w-full grid-cols-1 gap-8 sm:grid-cols-2">
                <div className="space-y-4"><h3 className="text-base font-semibold">宅配到府</h3><div className="flex items-center justify-between gap-4"><Label htmlFor="home-sunday" className="leading-relaxed">宅配排除星期日</Label><Switch id="home-sunday" checked={excludeHomeSunday} onCheckedChange={setExcludeHomeSunday} aria-describedby="home-sunday-help"/></div><p id="home-sunday-help" className="text-sm text-muted-foreground">開啟後，宅配日期不包含星期日。</p><div className="space-y-2"><Label htmlFor="home-advance">宅配最少提前天數</Label><Input id="home-advance" className="h-11 text-base" aria-describedby="home-advance-help" type="number" min="0" max="365" value={homeAdvanceDays} onChange={e=>setHomeAdvanceDays(Number(e.target.value))}/><p id="home-advance-help" className="text-sm leading-relaxed text-muted-foreground">以天為單位，決定從今天起最早可選的日期。</p></div></div>
                <div className="space-y-4"><h3 className="text-base font-semibold">7-11 門市取貨</h3><div className="flex items-center justify-between gap-4"><Label htmlFor="store-sunday" className="leading-relaxed">7-11 排除星期日</Label><Switch id="store-sunday" checked={excludeStoreSunday} onCheckedChange={setExcludeStoreSunday} aria-describedby="store-sunday-help"/></div><p id="store-sunday-help" className="text-sm text-muted-foreground">開啟後，7-11 取貨日期不包含星期日。</p><div className="space-y-2"><Label htmlFor="store-advance">7-11 最少提前天數</Label><Input id="store-advance" className="h-11 text-base" aria-describedby="store-advance-help" type="number" min="0" max="365" value={storeAdvanceDays} onChange={e=>setStoreAdvanceDays(Number(e.target.value))}/><p id="store-advance-help" className="text-sm leading-relaxed text-muted-foreground">以天為單位，決定從今天起最早可選的日期。</p></div></div>
              </div>
              <Button 
                onClick={handleSave} 
                disabled={saving || readOnly}
                className="h-11 min-w-32 gap-2"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? '儲存中…' : '儲存到貨設定'}
              </Button>
              <Button 
                variant="outline" 
                onClick={loadCurrentSettings}
                disabled={loading}
                className="h-11 min-w-32 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {loading ? '讀取中…' : '重新讀取設定'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 預覽區域 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              編輯中設定的日期預覽
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="mr-6 inline-block"><strong>宅配到府：</strong>{excludeHomeSunday ? '排除星期日' : '包含星期日'}</span>
                <strong>7-11門市取貨：</strong>{excludeStoreSunday?'排除星期日':'包含星期日'}
              </AlertDescription>
            </Alert>

            <p className="text-sm leading-relaxed text-muted-foreground">預覽會隨上方欄位更新；儲存後，才會套用至前台。</p>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-2">宅配到府可選日期：</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {previewDates.homeDelivery.length > 0 ? (
                    previewDates.homeDelivery.map((date, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary"
                        className="justify-center whitespace-nowrap px-3 py-2 text-sm font-medium"
                      >
                        {date.display}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground col-span-full">目前沒有可選日期，請核對日期範圍、星期日與提前天數設定。</p>
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
                        variant="secondary"
                        className="justify-center whitespace-nowrap px-3 py-2 text-sm font-medium"
                      >
                        {date.display}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground col-span-full">目前沒有可選日期，請核對日期範圍、星期日與提前天數設定。</p>
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
