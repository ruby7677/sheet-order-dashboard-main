<?php
// 讀取 Google Sheet 客戶資料，回傳 JSON
// 禁止顯示警告，避免影響 JSON 輸出
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

require 'D:/xampp/htdocs/vendor/autoload.php';
use Google\Client;
use Google\Service\Sheets;

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

// 啟用伺服器端快取機制，減少每次對 Google Sheets API 的請求
$cacheFile = __DIR__ . '/../cache/customers_cache.json';
$cacheTime = 15; // 快取有效期，單位：秒，降低為15秒以提高即時性

// 確保快取目錄存在
if (!is_dir(dirname($cacheFile))) {
    mkdir(dirname($cacheFile), 0755, true);
}

// 檢查是否有快取且未過期
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';
$requestId = isset($_GET['nonce']) ? $_GET['nonce'] : uniqid();

if (!$forceRefresh && file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTime)) {
    // 使用快取
    header('X-Cache: HIT');
    header('X-Cache-Age: ' . (time() - filemtime($cacheFile)));
    header('X-Request-ID: ' . $requestId);
    echo file_get_contents($cacheFile);
    exit;
}

// 快取不存在、已過期或強制刷新
header('X-Cache: MISS');
if ($forceRefresh) {
    header('X-Cache-Refresh: Forced');
}

// 快取不存在或已過期，從 Google Sheets API 獲取資料
$spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo'; // 與 sheets_api_handler.php 相同
$sheetName = '客戶名單'; // 客戶名單工作表名稱

try {
    $client = new Client();
    $client->setApplicationName('訂單系統後台讀取');
    $client->setScopes([Sheets::SPREADSHEETS_READONLY]);
    $client->setAuthConfig(__DIR__ . '/../service-account-key2.json');
    $client->setAccessType('offline');

    $service = new Sheets($client);
    $range = $sheetName;
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $values = $response->getValues();

    if (empty($values)) {
        $result = json_encode(['success' => true, 'data' => []]);
        echo $result;

        // 更新快取文件
        if (!is_dir(dirname($cacheFile))) {
            mkdir(dirname($cacheFile), 0755, true);
        }
        file_put_contents($cacheFile, $result);
        exit;
    }

    // 第一行是標題
    $header = array_shift($values);

    // 記錄標題行
    //error_log("客戶名單標題行: " . implode(", ", $header));

    // 處理標題，確保標題欄位名稱正確
    $headerMap = [];
    foreach ($header as $idx => $title) {
        // 記錄每個標題的索引
        //error_log("客戶名單標題 #{$idx}: {$title}");

        switch ($title) {
            case '姓名':
                $headerMap['name'] = $idx;
                break;
            case '電話':
                $headerMap['phone'] = $idx;
                break;
            case '取貨方式':
                $headerMap['deliveryMethod'] = $idx;
                break;
            case '地址':
                $headerMap['address'] = $idx;
                break;
            case '透過什麼聯繫賣家':
                $headerMap['contactMethod'] = $idx;
                break;
            case '社交軟體名字':
                $headerMap['socialId'] = $idx;
                break;
            case '訂單時間':
                $headerMap['orderTime'] = $idx;
                break;
            case '購買項目':
                $headerMap['items'] = $idx;
                break;
            default:
                // 其他欄位
                $headerMap[strtolower($title)] = $idx;
                break;
        }
    }

    // 記錄標題映射結果
    //error_log("客戶名單標題映射結果: " . print_r($headerMap, true));

    $customers = [];
    foreach ($values as $idx => $row) {
        // 確保資料完整性
        if (empty($row)) continue;
        if (!isset($headerMap['name']) || !isset($row[$headerMap['name']]) ||
            !isset($headerMap['phone']) || !isset($row[$headerMap['phone']])) continue;

        $customers[] = [
            'id' => $idx,
            'name' => $row[$headerMap['name']] ?? '',
            'phone' => $row[$headerMap['phone']] ?? '',
            'deliveryMethod' => isset($headerMap['deliveryMethod']) && isset($row[$headerMap['deliveryMethod']]) ? $row[$headerMap['deliveryMethod']] : '',
            'address' => isset($headerMap['address']) && isset($row[$headerMap['address']]) ? $row[$headerMap['address']] : '',
            'contactMethod' => isset($headerMap['contactMethod']) && isset($row[$headerMap['contactMethod']]) ? $row[$headerMap['contactMethod']] : '',
            'socialId' => isset($headerMap['socialId']) && isset($row[$headerMap['socialId']]) ? $row[$headerMap['socialId']] : '',
            'orderTime' => isset($headerMap['orderTime']) && isset($row[$headerMap['orderTime']]) ? $row[$headerMap['orderTime']] : '',
            'items' => isset($headerMap['items']) && isset($row[$headerMap['items']]) ? $row[$headerMap['items']] : ''
        ];
    }

    $result = json_encode(['success' => true, 'data' => $customers, 'timestamp' => time(), 'request_id' => $requestId]);

    echo $result;

    // 更新快取文件
    file_put_contents($cacheFile, $result);

} catch (Exception $e) {
    // 記錄錯誤
    error_log('Google Sheets API 錯誤: ' . $e->getMessage());

    // 回傳錯誤訊息
    $errorResponse = [
        'success' => false,
        'message' => '無法從 Google Sheets 獲取客戶資料',
        'error' => $e->getMessage(),
        'timestamp' => time(),
        'request_id' => $requestId
    ];

    http_response_code(500);
    echo json_encode($errorResponse);
}
