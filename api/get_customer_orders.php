<?php
// 根據客戶電話獲取訂單歷史
// 禁止顯示警告，避免影響 JSON 輸出
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

require 'D:/xampp/htdocs/vendor/autoload.php';
use Google\Client;
use Google\Service\Sheets;

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

// 獲取請求參數
$phone = isset($_GET['phone']) ? $_GET['phone'] : '';
$requestId = isset($_GET['nonce']) ? $_GET['nonce'] : uniqid();

// 記錄請求參數
// error_log("收到請求: phone={$phone}, requestId={$requestId}");

if (empty($phone)) {
    $errorResponse = [
        'success' => false,
        'message' => '缺少必要參數：phone',
        'timestamp' => time(),
        'request_id' => $requestId
    ];

    http_response_code(400);
    echo json_encode($errorResponse);
    exit;
}

// 快取機制
$cacheFile = __DIR__ . "/../cache/customer_orders_{$phone}_cache.json";
$cacheTime = 15; // 快取有效期，單位：秒

// 確保快取目錄存在
if (!is_dir(dirname($cacheFile))) {
    mkdir(dirname($cacheFile), 0755, true);
}

// 檢查是否有快取且未過期
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

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

// 從 Google Sheets API 獲取客戶資料
$spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo';
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
        file_put_contents($cacheFile, $result);
        exit;
    }

    // 第一行是標題
    $header = array_shift($values);

    // 記錄標題行
    // error_log("標題行: " . implode(", ", $header));

    // 處理標題，確保標題欄位名稱正確
    $headerMap = [];
    foreach ($header as $idx => $title) {
        // 記錄每個標題的索引
        // error_log("標題 #{$idx}: {$title}");

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
    // error_log("標題映射結果: " . print_r($headerMap, true));

    // 確保必要的欄位存在
    if (!isset($headerMap['phone']) || !isset($headerMap['orderTime']) || !isset($headerMap['items'])) {
        $errorResponse = [
            'success' => false,
            'message' => '客戶名單工作表缺少必要欄位',
            'timestamp' => time(),
            'request_id' => $requestId
        ];
        http_response_code(500);
        echo json_encode($errorResponse);
        exit;
    }

    $matchingOrders = [];
    foreach ($values as $idx => $row) {
        // 確保資料完整性
        if (empty($row)) continue;
        if (!isset($row[$headerMap['phone']])) continue;

        // 檢查電話是否匹配
        $rowPhone = $row[$headerMap['phone']];

        // 標準化電話號碼，只保留數字
        $normalizedRowPhone = preg_replace('/[^0-9]/', '', $rowPhone);
        $normalizedPhone = preg_replace('/[^0-9]/', '', $phone);

        // 取得後九碼進行比較（如果電話號碼長度大於9）
        $lastNineRowPhone = (strlen($normalizedRowPhone) >= 9) ? substr($normalizedRowPhone, -9) : $normalizedRowPhone;
        $lastNinePhone = (strlen($normalizedPhone) >= 9) ? substr($normalizedPhone, -9) : $normalizedPhone;

        // 記錄電話號碼比對資訊（僅用於調試）
        // error_log("比對電話: 請求電話={$phone}, 標準化={$normalizedPhone}, 後九碼={$lastNinePhone}");
        // error_log("行電話: {$rowPhone}, 標準化={$normalizedRowPhone}, 後九碼={$lastNineRowPhone}");

        // 比較電話號碼的後九碼
        if ($lastNineRowPhone === $lastNinePhone) {
            // 只保留訂單時間和購買項目
            $orderTime = isset($row[$headerMap['orderTime']]) ? $row[$headerMap['orderTime']] : '';
            $items = isset($row[$headerMap['items']]) ? $row[$headerMap['items']] : '';

            if (!empty($orderTime) || !empty($items)) {
                $matchingOrders[] = [
                    'id' => $idx,
                    'orderTime' => $orderTime,
                    'items' => $items,
                    'name' => isset($row[$headerMap['name']]) ? $row[$headerMap['name']] : ''
                ];
            }
        }
    }

    // 根據列數排序，列數越小的為最早訂購的資訊
    // 由於 id 就是列數，所以按 id 排序
    usort($matchingOrders, function($a, $b) {
        return $a['id'] - $b['id'];
    });

    // 記錄找到的訂單數量
    // error_log("找到 " . count($matchingOrders) . " 筆訂單記錄");

    // 記錄訂單詳情
    // foreach ($matchingOrders as $idx => $order) {
    //     error_log("訂單 #{$idx}: id={$order['id']}, orderTime={$order['orderTime']}, items={$order['items']}");
    // }

    $result = json_encode(['success' => true, 'data' => $matchingOrders, 'timestamp' => time(), 'request_id' => $requestId]);

    echo $result;

    // 更新快取文件
    file_put_contents($cacheFile, $result);

} catch (Exception $e) {
    // 記錄錯誤
    error_log('Google Sheets API 錯誤: ' . $e->getMessage());

    // 回傳錯誤訊息
    $errorResponse = [
        'success' => false,
        'message' => '無法從 Google Sheets 獲取客戶訂單資料',
        'error' => $e->getMessage(),
        'timestamp' => time(),
        'request_id' => $requestId
    ];

    http_response_code(500);
    echo json_encode($errorResponse);
}
