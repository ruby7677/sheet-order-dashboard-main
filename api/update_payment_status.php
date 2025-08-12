<?php
// 用於更新 Google Sheet 訂單的付款狀態（款項）
require 'D:/xampp/htdocs/vendor/autoload.php';
use Google\Client;
use Google\Service\Sheets;

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

// 如果是 OPTIONS 預檢請求，直接返回成功
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo'; // Google Sheet ID
$sheetName = 'Sheet1';

// 快取檔案位置
$cacheFile = __DIR__ . '/../cache/orders_cache.json';

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $rowId = isset($input['id']) ? intval($input['id']) : null;
    $paymentStatus = isset($input['paymentStatus']) ? $input['paymentStatus'] : '';
    if ($rowId === null || $paymentStatus === '') {
        throw new Exception('缺少必要參數');
    }

    $client = new Client();
    $client->setApplicationName('訂單系統後台更新');
    $client->setScopes([Sheets::SPREADSHEETS]);
    $client->setAuthConfig(__DIR__ . '/../service-account-key2.json');
    $client->setAccessType('offline');

    $service = new Sheets($client);
    // 款項在 P 欄（index 15），rowId 對應 Google Sheet 實際 row（+1 因為有標題列）
    $range = $sheetName . '!P' . ($rowId + 1);
    $body = new Google_Service_Sheets_ValueRange([
        'values' => [[ $paymentStatus ]]
    ]);
    $params = ['valueInputOption' => 'USER_ENTERED'];
    $result = $service->spreadsheets_values->update($spreadsheetId, $range, $body, $params);

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
        'message' => '付款狀態已成功更新'
    ]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
