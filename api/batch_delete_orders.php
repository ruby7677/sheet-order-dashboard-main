<?php
// 批次刪除 Google Sheets 訂單
require 'D:/xampp/htdocs/vendor/autoload.php';
use Google\Client;
use Google\Service\Sheets;

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

// 處理 CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo';
$sheetName = 'Sheet1';

$input = json_decode(file_get_contents('php://input'), true);
$ids = $input['ids'] ?? [];

if (empty($ids) || !is_array($ids)) {
    echo json_encode(['success' => false, 'message' => '缺少參數或參數格式錯誤']);
    exit;
}

try {
    $client = new Client();
    $client->setApplicationName('訂單系統後台批次刪除');
    $client->setScopes([Sheets::SPREADSHEETS]);
    $client->setAuthConfig(__DIR__ . '/../service-account-key2.json');
    $client->setAccessType('offline');

    $service = new Sheets($client);

    // 首先獲取工作表的基本資訊
    $spreadsheet = $service->spreadsheets->get($spreadsheetId);
    $sheets = $spreadsheet->getSheets();
    $sheetId = null;

    // 找到對應的工作表 ID
    foreach ($sheets as $sheet) {
        if ($sheet->getProperties()->getTitle() === $sheetName) {
            $sheetId = $sheet->getProperties()->getSheetId();
            break;
        }
    }

    if ($sheetId === null) {
        throw new Exception('找不到指定的工作表');
    }

    // 獲取所有資料以確認要刪除的行
    $range = $sheetName;
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues();

    if (empty($rows)) {
        throw new Exception('工作表中沒有資料');
    }

    // 驗證所有要刪除的ID是否有效
    $validIds = [];
    $invalidIds = [];
    $orderNumbers = [];

    foreach ($ids as $id) {
        $targetRowIndex = (int)$id;
        
        // 檢查目標行是否存在
        if ($targetRowIndex < 1 || $targetRowIndex >= count($rows)) {
            $invalidIds[] = $id;
        } else {
            $validIds[] = $targetRowIndex;
            // 嘗試獲取訂單編號（假設在第B欄，索引1）
            $orderNumber = isset($rows[$targetRowIndex][1]) ? $rows[$targetRowIndex][1] : "訂單{$id}";
            $orderNumbers[$targetRowIndex] = $orderNumber;
        }
    }

    // 如果有無效的ID，返回錯誤
    if (!empty($invalidIds)) {
        throw new Exception('以下訂單ID無效：' . implode(', ', $invalidIds));
    }

    // 按照行號從大到小排序，這樣刪除時不會影響其他行的索引
    rsort($validIds);

    // 執行批次刪除
    $results = [];
    $deletedCount = 0;
    $failedCount = 0;

    foreach ($validIds as $targetRowIndex) {
        try {
            // 使用 batchUpdate 來刪除指定的行
            $requests = [
                [
                    'deleteDimension' => [
                        'range' => [
                            'sheetId' => $sheetId,
                            'dimension' => 'ROWS',
                            'startIndex' => $targetRowIndex, // 0-based index
                            'endIndex' => $targetRowIndex + 1 // 刪除一行
                        ]
                    ]
                ]
            ];

            $batchUpdateRequest = new Google_Service_Sheets_BatchUpdateSpreadsheetRequest([
                'requests' => $requests
            ]);

            $service->spreadsheets->batchUpdate($spreadsheetId, $batchUpdateRequest);

            $results[] = [
                'id' => (string)$targetRowIndex,
                'success' => true,
                'message' => '刪除成功',
                'orderNumber' => $orderNumbers[$targetRowIndex] ?? "訂單{$targetRowIndex}"
            ];
            $deletedCount++;

        } catch (Exception $e) {
            $results[] = [
                'id' => (string)$targetRowIndex,
                'success' => false,
                'message' => '刪除失敗：' . $e->getMessage(),
                'orderNumber' => $orderNumbers[$targetRowIndex] ?? "訂單{$targetRowIndex}"
            ];
            $failedCount++;
        }
    }

    // 重新排序後續訂單的ID（只有在有成功刪除的情況下才執行）
    $reorderResult = null;
    if ($deletedCount > 0) {
        $reorderResult = reorderOrderIdsAfterBatchDelete($service, $spreadsheetId, $sheetName);
    }

    // 刪除快取檔案，確保下次讀取時獲取最新數據
    $cacheFile = __DIR__ . '/../cache/orders_cache.json';
    if (file_exists($cacheFile)) {
        unlink($cacheFile);
    }

    // 添加時間戳和請求 ID，確保響應是唯一的
    $requestId = md5(time() . rand(1000, 9999));
    header('X-Request-ID: ' . $requestId);

    echo json_encode([
        'success' => true,
        'timestamp' => time(),
        'request_id' => $requestId,
        'message' => "批次刪除完成：成功 {$deletedCount} 筆，失敗 {$failedCount} 筆",
        'results' => $results,
        'totalDeleted' => $deletedCount,
        'totalFailed' => $failedCount,
        'reorder_result' => $reorderResult
    ]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

/**
 * 批次刪除後重新排序訂單ID
 * 重新獲取所有資料並重新分配連續的ID
 *
 * @param Google_Service_Sheets $service Google Sheets 服務實例
 * @param string $spreadsheetId 試算表ID
 * @param string $sheetName 工作表名稱
 * @return array 重排序結果
 */
function reorderOrderIdsAfterBatchDelete($service, $spreadsheetId, $sheetName) {
    try {
        // 重新獲取所有資料
        $range = $sheetName;
        $response = $service->spreadsheets_values->get($spreadsheetId, $range);
        $rows = $response->getValues();

        if (empty($rows) || count($rows) <= 1) {
            return [
                'success' => true,
                'message' => '沒有需要重新排序的資料',
                'updated_rows' => 0
            ];
        }

        // 準備批量更新的資料
        $updateData = [];
        $updatedCount = 0;

        // 從第二行開始（跳過標題行），重新分配ID
        for ($i = 1; $i < count($rows); $i++) {
            // 檢查該行是否有資料（避免更新空白行）
            if (!isset($rows[$i][1]) || trim($rows[$i][1]) === '') {
                continue;
            }

            // 新的ID應該是當前行索引
            $newId = $i;

            // 準備更新資料（假設ID在第N欄，索引13）
            $updateData[] = [
                'range' => sprintf('%s!N%d', $sheetName, $i + 1), // N欄，行號+1（因為Google Sheets是1-based）
                'values' => [[$newId]]
            ];

            $updatedCount++;
        }

        // 如果有資料需要更新，執行批量更新
        if (!empty($updateData)) {
            $batchUpdateRequest = new Google_Service_Sheets_BatchUpdateValuesRequest([
                'valueInputOption' => 'USER_ENTERED',
                'data' => $updateData
            ]);

            $service->spreadsheets_values->batchUpdate($spreadsheetId, $batchUpdateRequest);
        }

        return [
            'success' => true,
            'message' => "成功重新排序 {$updatedCount} 個訂單的ID",
            'updated_rows' => $updatedCount
        ];

    } catch (Exception $e) {
        return [
            'success' => false,
            'message' => '重新排序ID時發生錯誤：' . $e->getMessage(),
            'updated_rows' => 0
        ];
    }
}
?>
