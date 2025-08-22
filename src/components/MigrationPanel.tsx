import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertCircle, Download, Upload, Trash2, Clock, Zap } from "lucide-react";
import { toast } from "sonner";
import { migrateGoogleSheetsData, validateMigrationData, clearExistingData, type MigrationResult } from "@/services/migrationService";

export function MigrationPanel() {
  const [sheetId, setSheetId] = useState("10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo");
  const [dryRun, setDryRun] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [validationData, setValidationData] = useState<any>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<any>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(false);

  // 取得 API 基礎 URL
  const getApiBaseUrl = () => {
    try {
      const isLocal = typeof window !== 'undefined' && 
                     (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      return isLocal 
        ? 'http://127.0.0.1:5714/api' 
        : 'https://sheet-order-api.ruby7677.workers.dev/api';
    } catch {
      return 'https://sheet-order-api.ruby7677.workers.dev/api';
    }
  };

  // 獲取自動同步狀態
  const fetchAutoSyncStatus = async () => {
    try {
      const apiUrl = `${getApiBaseUrl()}/sync/status`;
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        setAutoSyncStatus(data.data);
      }
    } catch (error) {
      console.error('獲取自動同步狀態失敗:', error);
    }
  };

  // 觸發自動同步
  const handleAutoSync = async () => {
    setIsLoading(true);
    setProgress(0);
    
    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const apiUrl = `${getApiBaseUrl()}/sync/auto`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          forceFullSync: false,
          dryRun: false,
          syncOrders: true,
          syncCustomers: true,
          triggerType: 'manual'
        })
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (response.ok) {
        const result = await response.json();
        setMigrationResult(result);
        toast.success('自動同步完成');
        
        // 更新同步狀態
        await fetchAutoSyncStatus();
        
        // 驗證資料
        const validation = await validateMigrationData();
        setValidationData(validation);
      } else {
        const error = await response.json();
        toast.error(error.message || '自動同步失敗');
      }
    } catch (error) {
      setProgress(0);
      toast.error('自動同步失敗');
      console.error('自動同步錯誤:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 組件載入時獲取狀態
  useEffect(() => {
    fetchAutoSyncStatus();
  }, []);

  const handleMigration = async () => {
    if (!sheetId.trim()) {
      toast.error("請輸入 Google Sheets ID");
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setMigrationResult(null);

    try {
      // 模擬進度更新
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const result = await migrateGoogleSheetsData({
        sheetId: sheetId.trim(),
        dryRun,
        skipExisting
      });

      clearInterval(progressInterval);
      setProgress(100);
      setMigrationResult(result);

      if (result.success) {
        toast.success(result.message);
        
        // 如果不是試運行，驗證資料
        if (!dryRun) {
          const validation = await validateMigrationData();
          setValidationData(validation);
        }
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      setProgress(0);
      toast.error(error instanceof Error ? error.message : "遷移失敗");
      console.error("遷移錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidation = async () => {
    try {
      setIsLoading(true);
      const validation = await validateMigrationData();
      setValidationData(validation);
      toast.success("資料驗證完成");
    } catch (error) {
      toast.error("資料驗證失敗");
      console.error("驗證錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearData = async () => {
    if (!confirm("確定要清空所有現有資料嗎？此操作無法復原！")) {
      return;
    }

    try {
      setIsLoading(true);
      await clearExistingData();
      toast.success("資料已清空");
      setValidationData(null);
      setMigrationResult(null);
    } catch (error) {
      toast.error("清空資料失敗");
      console.error("清空錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {autoSyncStatus && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              自動同步狀態
            </CardTitle>
            <CardDescription>
              系統會每 2 小時自動同步 Google Sheets 資料到 Supabase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">最後同步時間</p>
                <p className="text-sm text-muted-foreground">
                  {autoSyncStatus.lastSyncTime 
                    ? new Date(autoSyncStatus.lastSyncTime).toLocaleString('zh-TW')
                    : '尚未同步'
                  }
                </p>
              </div>
              <Badge variant={autoSyncStatus.lastSyncStatus === 'completed' ? 'default' : 'destructive'}>
                {autoSyncStatus.lastSyncStatus === 'completed' ? '正常' : '異常'}
              </Badge>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleAutoSync}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                {isLoading ? '同步中...' : '立即同步'}
              </Button>
              <Button 
                variant="outline"
                onClick={fetchAutoSyncStatus}
                disabled={isLoading}
              >
                更新狀態
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Google Sheets 資料遷移
          </CardTitle>
          <CardDescription>
            將 Google Sheets 中的訂單和客戶資料遷移到 Supabase 資料庫
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sheetId">Google Sheets ID</Label>
            <Input
              id="sheetId"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="請輸入 Google Sheets 的 ID"
              disabled={isLoading}
            />
            <p className="text-sm text-muted-foreground">
              從 Google Sheets URL 中提取的 ID，例如：10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dryRun">試運行模式</Label>
              <p className="text-sm text-muted-foreground">
                啟用後只會模擬遷移過程，不會實際寫入資料
              </p>
            </div>
            <Switch
              id="dryRun"
              checked={dryRun}
              onCheckedChange={setDryRun}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skipExisting">跳過已存在資料</Label>
              <p className="text-sm text-muted-foreground">
                避免重複遷移已存在的資料
              </p>
            </div>
            <Switch
              id="skipExisting"
              checked={skipExisting}
              onCheckedChange={setSkipExisting}
              disabled={isLoading}
            />
          </div>

          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>遷移進度</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={handleMigration} 
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? "遷移中..." : "開始遷移"}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleValidation}
              disabled={isLoading}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              驗證資料
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleClearData}
              disabled={isLoading}
              size="icon"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {migrationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {migrationResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              遷移結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                {migrationResult.message}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {migrationResult.stats.customersProcessed}
                </div>
                <div className="text-sm text-muted-foreground">客戶</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {migrationResult.stats.ordersProcessed}
                </div>
                <div className="text-sm text-muted-foreground">訂單</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {migrationResult.stats.productsProcessed}
                </div>
                <div className="text-sm text-muted-foreground">商品</div>
              </div>
            </div>

            {migrationResult.stats.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600">錯誤記錄</h4>
                <div className="space-y-1">
                  {migrationResult.stats.errors.map((error, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertDescription className="text-sm">
                        {error}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {validationData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              資料驗證結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 border rounded">
                <span>客戶總數</span>
                <Badge variant="outline">{validationData.customersCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <span>訂單總數</span>
                <Badge variant="outline">{validationData.ordersCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <span>商品總數</span>
                <Badge variant="outline">{validationData.productsCount}</Badge>
              </div>
            </div>

            {validationData.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-orange-600">發現問題</h4>
                <div className="space-y-1">
                  {validationData.issues.map((issue: string, index: number) => (
                    <Alert key={index} variant="destructive">
                      <AlertDescription className="text-sm">
                        {issue}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}