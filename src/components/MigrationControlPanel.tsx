import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Upload, Database, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { migrateGoogleSheetsData, validateMigrationData, clearExistingData, type MigrationResult } from "@/services/migrationService";

interface MigrationControlPanelProps {
  className?: string;
}

export function MigrationControlPanel({ className }: MigrationControlPanelProps) {
  const [sheetId, setSheetId] = useState("10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo");
  const [dryRun, setDryRun] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [validationData, setValidationData] = useState<any>(null);

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
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            資料遷移控制台
          </CardTitle>
          <CardDescription>
            將 Google Sheets 資料同步到 Supabase 資料庫
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sheetId">Google Sheets ID</Label>
            <Input
              id="sheetId"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="輸入 Sheet ID"
              disabled={isLoading}
              className="text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dryRun" className="text-sm">試運行</Label>
              <p className="text-xs text-muted-foreground">
                僅模擬遷移過程
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
              <Label htmlFor="skipExisting" className="text-sm">跳過已存在</Label>
              <p className="text-xs text-muted-foreground">
                避免重複遷移
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
                <span>進度</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={handleMigration} 
              disabled={isLoading}
              size="sm"
              className="flex-1"
            >
              {isLoading ? "遷移中..." : "開始遷移"}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleValidation}
              disabled={isLoading}
              size="sm"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              驗證
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleClearData}
              disabled={isLoading}
              size="sm"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {migrationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {migrationResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              遷移結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                {migrationResult.message}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 border rounded-lg">
                <div className="text-lg font-bold text-blue-600">
                  {migrationResult.stats.customersProcessed}
                </div>
                <div className="text-xs text-muted-foreground">客戶</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-lg font-bold text-green-600">
                  {migrationResult.stats.ordersProcessed}
                </div>
                <div className="text-xs text-muted-foreground">訂單</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-lg font-bold text-purple-600">
                  {migrationResult.stats.productsProcessed}
                </div>
                <div className="text-xs text-muted-foreground">商品</div>
              </div>
              {migrationResult.stats.ordersDeleted !== undefined && migrationResult.stats.ordersDeleted > 0 && (
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-lg font-bold text-red-600">
                    {migrationResult.stats.ordersDeleted}
                  </div>
                  <div className="text-xs text-muted-foreground">已刪除</div>
                </div>
              )}
            </div>

            {migrationResult.stats.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600 text-sm">錯誤記錄</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {migrationResult.stats.errors.slice(0, 3).map((error, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertDescription className="text-xs">
                        {error}
                      </AlertDescription>
                    </Alert>
                  ))}
                  {migrationResult.stats.errors.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      還有 {migrationResult.stats.errors.length - 3} 個錯誤...
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {validationData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              資料驗證
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center justify-between p-2 border rounded text-xs">
                <span>客戶</span>
                <Badge variant="outline" className="h-5 px-2 text-xs">{validationData.customersCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-2 border rounded text-xs">
                <span>訂單</span>
                <Badge variant="outline" className="h-5 px-2 text-xs">{validationData.ordersCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-2 border rounded text-xs">
                <span>商品</span>
                <Badge variant="outline" className="h-5 px-2 text-xs">{validationData.productsCount}</Badge>
              </div>
            </div>

            {validationData.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-orange-600 text-sm">發現問題</h4>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {validationData.issues.map((issue: string, index: number) => (
                    <Alert key={index} variant="destructive">
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
}