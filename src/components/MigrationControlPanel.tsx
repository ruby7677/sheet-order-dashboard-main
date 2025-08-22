import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Database,
  Trash2,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { migrateGoogleSheetsData, validateMigrationData, clearExistingData, type MigrationResult } from '@/services/migrationService';

interface MigrationStats {
  ordersProcessed: number;
  customersProcessed: number;
  productsProcessed: number;
  errors: string[];
}

interface MigrationControlPanelProps {
  onMigrationComplete?: (stats: MigrationStats) => void;
}

/**
 * 精簡版資料遷移控制面板，專為整合到主頁面設計
 */
export const MigrationControlPanel: React.FC<MigrationControlPanelProps> = ({
  onMigrationComplete
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [validationData, setValidationData] = useState<any>(null);

  // 預設 Sheet ID - 蘿蔔糕訂單
  const defaultSheetId = "10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo";

  const handleQuickMigration = async (dryRun: boolean = false) => {
    setIsLoading(true);
    setProgress(0);
    setMigrationResult(null);

    try {
      // 模擬進度更新
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 15, 90));
      }, 300);

      const result = await migrateGoogleSheetsData({
        sheetId: defaultSheetId,
        dryRun,
        skipExisting: true
      });

      clearInterval(progressInterval);
      setProgress(100);
      setMigrationResult(result);

      if (result.success) {
        toast.success(result.message);
        
        // 如果不是試運行，驗證資料並通知父組件
        if (!dryRun) {
          const validation = await validateMigrationData();
          setValidationData(validation);
          onMigrationComplete?.(result.stats);
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
      onMigrationComplete?.({ ordersProcessed: 0, customersProcessed: 0, productsProcessed: 0, errors: [] });
    } catch (error) {
      toast.error("清空資料失敗");
      console.error("清空錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 快速操作面板 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            Google Sheets 資料同步
          </CardTitle>
          <CardDescription>
            快速同步蘿蔔糕訂單系統的訂單與客戶資料
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  正在同步資料...
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={() => handleQuickMigration(true)} 
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              試運行檢查
            </Button>
            
            <Button 
              onClick={() => handleQuickMigration(false)} 
              disabled={isLoading}
              size="sm"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {isLoading ? "同步中..." : "開始同步"}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleValidation}
              disabled={isLoading}
              size="sm"
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              驗證資料
            </Button>
            
            <Button 
              variant="destructive" 
              onClick={handleClearData}
              disabled={isLoading}
              size="sm"
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              清空資料
            </Button>
          </div>

          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertDescription>
              <strong>資料來源：</strong>蘿蔔糕訂單 Google Sheets
              <br />
              <strong>同步內容：</strong>訂單資料（Sheet1）+ 客戶資料（客戶名單）
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* 遷移結果 */}
      {migrationResult && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {migrationResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              同步結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={migrationResult.success ? "default" : "destructive"}>
              <AlertDescription>
                {migrationResult.message}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 border rounded-lg bg-blue-50/50">
                <div className="text-xl font-bold text-blue-600">
                  {migrationResult.stats.customersProcessed}
                </div>
                <div className="text-xs text-muted-foreground">客戶</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-green-50/50">
                <div className="text-xl font-bold text-green-600">
                  {migrationResult.stats.ordersProcessed}
                </div>
                <div className="text-xs text-muted-foreground">訂單</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-purple-50/50">
                <div className="text-xl font-bold text-purple-600">
                  {migrationResult.stats.productsProcessed}
                </div>
                <div className="text-xs text-muted-foreground">商品項目</div>
              </div>
            </div>

            {migrationResult.stats.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600 text-sm">錯誤記錄</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {migrationResult.stats.errors.slice(0, 3).map((error, index) => (
                    <Alert key={index} variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">
                        {error}
                      </AlertDescription>
                    </Alert>
                  ))}
                  {migrationResult.stats.errors.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center">
                      還有 {migrationResult.stats.errors.length - 3} 個錯誤...
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 驗證結果 */}
      {validationData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              資料驗證結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-2 border rounded text-sm">
                <span>客戶</span>
                <Badge variant="outline">{validationData.customersCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-2 border rounded text-sm">
                <span>訂單</span>
                <Badge variant="outline">{validationData.ordersCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-2 border rounded text-sm">
                <span>商品</span>
                <Badge variant="outline">{validationData.productsCount}</Badge>
              </div>
            </div>

            {validationData.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-orange-600 text-sm">發現問題</h4>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {validationData.issues.map((issue: string, index: number) => (
                    <Alert key={index} variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">
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
};

export default MigrationControlPanel;