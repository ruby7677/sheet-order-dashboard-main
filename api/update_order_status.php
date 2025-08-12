<?php
// 更新 Google Sheets 訂單狀態
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
$status = $input['status'] ?? '';

// 僅允許四種合法狀態，避免寫入錯誤內容
$validStatuses = ['訂單確認中', '已抄單', '已出貨', '取消訂單'];
if (!in_array($status, $validStatuses, true)) {
    echo json_encode(['success' => false, 'message' => '狀態值不正確']);
    exit;
}

if (!$id || !$status) {
    echo json_encode(['success' => false, 'message' => '缺少參數']);
    exit;
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

    $header = $rows[0];
    $idCol = array_search('id', $header);
    $statusCol = array_search('status', $header);
    if ($idCol === false || $statusCol === false) {
        echo json_encode(['success' => false, 'message' => '找不到 id 或 status 欄位']);
        exit;
    }
    $targetRow = -1;
    foreach ($rows as $i => $row) {
        if (isset($row[$idCol]) && $row[$idCol] == $id) {
            $targetRow = $i + 1; // Google Sheets API 是 1-based
            break;
        }
    }
    if ($targetRow === -1) {
        echo json_encode(['success' => false, 'message' => '找不到指定訂單']);
        exit;
    }
    $rangeToUpdate = $sheetName . '!'. chr(65 + $statusCol) . $targetRow;
    $body = new Google_Service_Sheets_ValueRange([
        'values' => [[$status]]
    ]);
    $params = ['valueInputOption' => 'RAW'];
    $service->spreadsheets_values->update($spreadsheetId, $rangeToUpdate, $body, $params);

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
        'message' => '訂單狀態已成功更新'
    ]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
