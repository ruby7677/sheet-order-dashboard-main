<?php
/**
 * 更新訂單商品和金額到 Google Sheets
 * 接收新的商品清單，重新計算總金額，並更新到 Google Sheets
 */

require 'D:/xampp/htdocs/vendor/autoload.php';
use Google\Client;
use Google\Service\Sheets;

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo';
$sheetName = 'Sheet1';

// 快取檔案位置
$cacheFile = __DIR__ . '/../cache/orders_cache.json';

$input = json_decode(file_get_contents('php://input'), true);
$id = $input['id'] ?? '';
$items = $input['items'] ?? [];
$total = $input['total'] ?? 0;

// 驗證輸入參數
if (!$id || !is_array($items) || !is_numeric($total)) {
    echo json_encode(['success' => false, 'message' => '缺少必要參數或參數格式錯誤']);
    exit;
}

// 驗證商品資料格式
foreach ($items as $item) {
    if (!isset($item['product']) || !isset($item['quantity']) || !isset($item['price']) || !isset($item['subtotal'])) {
        echo json_encode(['success' => false, 'message' => '商品資料格式錯誤']);
        exit;
    }

    if (!is_string($item['product']) || !is_numeric($item['quantity']) || !is_numeric($item['price']) || !is_numeric($item['subtotal'])) {
        echo json_encode(['success' => false, 'message' => '商品資料類型錯誤']);
        exit;
    }
}

try {
    $client = new Client();
    $client->setApplicationName('訂單系統後台寫入');
    $client->setScopes([Sheets::SPREADSHEETS]);
    $client->setAuthConfig(__DIR__ . '/../service-account-key2.json');
    $client->setAccessType('offline');

    $service = new Sheets($client);
    $range = $sheetName;
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues();

    if (empty($rows)) {
        echo json_encode(['success' => false, 'message' => '無法讀取工作表資料']);
        exit;
    }

    // 根據 get_orders_from_sheet.php 的結構，使用固定的欄位索引
    // items 在第 8 欄 (索引 8)，amount 在第 9 欄 (索引 9)
    $itemsCol = 8;  // I欄 - 購買項目
    $amountCol = 9; // J欄 - 金額

    // 尋找目標訂單行（使用行索引作為 ID）
    $targetRow = -1;
    if (is_numeric($id) && $id > 0 && $id < count($rows)) {
        $targetRow = intval($id); // 直接使用 ID 作為行索引
    }

    if ($targetRow === -1) {
        echo json_encode(['success' => false, 'message' => '找不到指定訂單']);
        exit;
    }

    // 將商品陣列轉換為字串格式 (例如: "原味蘿蔔糕 x 2, 芋頭粿 x 1")
    $itemsString = '';
    foreach ($items as $item) {
        if ($itemsString !== '') {
            $itemsString .= ', ';
        }
        $itemsString .= $item['product'] . ' x ' . $item['quantity'];
    }

    // 準備更新資料
    $updates = [];

    // Google Sheets API 使用 1-based 行號，所以需要 +1
    $sheetRow = $targetRow + 1;

    // 更新商品欄位 (I欄)
    $itemsRange = $sheetName . '!' . chr(65 + $itemsCol) . $sheetRow;
    $updates[] = [
        'range' => $itemsRange,
        'values' => [[$itemsString]]
    ];

    // 更新金額欄位 (J欄)
    $amountRange = $sheetName . '!' . chr(65 + $amountCol) . $sheetRow;
    $updates[] = [
        'range' => $amountRange,
        'values' => [[$total]]
    ];

    // 批次更新
    $batchUpdateRequest = new Google_Service_Sheets_BatchUpdateValuesRequest([
        'valueInputOption' => 'RAW',
        'data' => $updates
    ]);

    $service->spreadsheets_values->batchUpdate($spreadsheetId, $batchUpdateRequest);

    // 更新成功後刪除快取檔案，確保下次讀取時獲取最新數據
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
        'message' => '訂單商品已成功更新',
        'updated_items' => $itemsString,
        'updated_total' => $total
    ]);

} catch (Exception $e) {
    // error_log('更新訂單商品失敗: ' . $e->getMessage());
    echo json_encode(['success' => false, 'message' => '更新失敗: ' . $e->getMessage()]);
}
?>
