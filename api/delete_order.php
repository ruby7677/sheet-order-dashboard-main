<?php
// 刪除 Google Sheets 訂單（真正刪除該行，而非僅清空內容）
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
$id = $input['id'] ?? '';

if (!$id) {
    echo json_encode(['success' => false, 'message' => '缺少參數']);
    exit;
}

try {
    $client = new Client();
    $client->setApplicationName('訂單系統後台刪除');
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

    // 傳入 id 是 $rows 陣列的索引 (跳過標題為 idx=1)，sheet 列號 = idx + 1
    $targetRowIndex = (int)$id;
    $targetRowNumber = $targetRowIndex + 1; // Google Sheets 的行號從 1 開始

    // 檢查目標行是否存在
    if ($targetRowIndex < 1 || $targetRowIndex >= count($rows)) {
        throw new Exception('指定的訂單不存在');
    }

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

    $response = $service->spreadsheets->batchUpdate($spreadsheetId, $batchUpdateRequest);

    // 重新排序後續訂單的ID（如果有ID欄位的話）
    $reorderResult = reorderOrderIds($service, $spreadsheetId, $sheetName, $targetRowIndex);

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
        'message' => '訂單已成功從 Google Sheets 中刪除，ID已重新排序',
        'deleted_row' => $targetRowNumber,
        'reorder_result' => $reorderResult
    ]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

/**
 * 重新排序訂單ID
 * 在刪除訂單後，更新後續所有訂單的ID，確保ID的連續性
 *
 * @param Google_Service_Sheets $service Google Sheets 服務實例
 * @param string $spreadsheetId 試算表ID
 * @param string $sheetName 工作表名稱
 * @param int $deletedRowIndex 被刪除的行索引（0-based）
 * @return array 重排序結果
 */
function reorderOrderIds($service, $spreadsheetId, $sheetName, $deletedRowIndex) {
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

        // 檢查是否有需要更新的行（從被刪除位置開始的所有後續行）
        $totalRows = count($rows);
        $startUpdateIndex = $deletedRowIndex; // 因為行已被刪除，原本 deletedRowIndex+1 的行現在變成 deletedRowIndex

        if ($startUpdateIndex >= $totalRows) {
            return [
                'success' => true,
                'message' => '沒有後續行需要重新排序',
                'updated_rows' => 0
            ];
        }

        // 準備批量更新的資料
        $updateData = [];
        $updatedCount = 0;

        // 從被刪除位置開始，重新分配ID
        for ($i = $startUpdateIndex; $i < $totalRows; $i++) {
            if ($i === 0) continue; // 跳過標題行

            // 檢查該行是否有資料（避免更新空白行）
            if (!isset($rows[$i][1]) || trim($rows[$i][1]) === '') {
                continue;
            }

            // 新的ID應該是當前行索引
            $newId = $i;

            // 準備更新資料（假設ID在第N欄，索引13）
            // 根據您的 Google Sheets 結構，ID可能在不同的欄位
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
            'updated_rows' => $updatedCount,
            'start_index' => $startUpdateIndex,
            'total_rows' => $totalRows - 1 // 扣除標題行
        ];

    } catch (Exception $e) {
        return [
            'success' => false,
            'message' => '重新排序ID時發生錯誤：' . $e->getMessage(),
            'updated_rows' => 0
        ];
    }
}
