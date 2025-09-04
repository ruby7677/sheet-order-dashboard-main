import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertCircle, Download, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { migrateGoogleSheetsData, validateMigrationData, clearExistingData, type MigrationResult } from "@/services/migrationService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function MigrationPanel() {
  const [sheetId, setSheetId] = useState("10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo");
  const [dryRun, setDryRun] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [validationData, setValidationData] = useState<unknown>(null);
  const [strategy, setStrategy] = useState<'auto' | 'replace' | 'upsert'>('auto');
  const [replaceWindowDays, setReplaceWindowDays] = useState<number>(21);

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
        skipExisting,
        strategy,
        replaceWindowDays
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

          {/* 遷移策略 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>遷移策略</Label>
              <Select value={strategy} onValueChange={(v: 'auto' | 'replace' | 'upsert') => setStrategy(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇策略" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">auto（無交集才清空近窗期）</SelectItem>
                  <SelectItem value="replace">replace（先清空近窗期再寫入）</SelectItem>
                  <SelectItem value="upsert">upsert（僅寫入不清空）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">建議使用 auto；每檔期全重置用 replace。</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="replaceDays">近窗期（天）</Label>
              <Input
                id="replaceDays"
                type="number"
                min={7}
                max={60}
                value={replaceWindowDays}
                onChange={(e) => setReplaceWindowDays(Math.max(7, Math.min(60, Number(e.target.value))))}
                disabled={isLoading || strategy === 'upsert'}
              />
              <p className="text-xs text-muted-foreground">用於 auto/replace 的清空範圍，預設 21。</p>
            </div>
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
              {typeof migrationResult.stats.ordersDeleted === 'number' && (
                <div className="text-center p-4 border rounded-lg md:col-span-3">
                  <div className="text-base text-muted-foreground">已刪除近窗期舊訂單</div>
                  <div className="text-2xl font-bold text-red-600">{migrationResult.stats.ordersDeleted}</div>
                </div>
              )}
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