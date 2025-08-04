<?php
// 讀取 Google Sheet 訂單資料，回傳 JSON
require 'D:/xampp/htdocs/vendor/autoload.php';
use Google\Client;
use Google\Service\Sheets;

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

// 啟用伺服器端快取機制，減少每次對 Google Sheets API 的請求
$cacheFile = __DIR__ . '/../cache/orders_cache.json';
$cacheTime = 15; // 快取有效期，單位：秒，降低為15秒以提高即時性

// 確保快取目錄存在
if (!is_dir(dirname($cacheFile))) {
    mkdir(dirname($cacheFile), 0755, true);
}

// 檢查是否有強制刷新參數
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

// 添加時間戳參數，確保每次請求都是唯一的
$timestamp = isset($_GET['_']) ? $_GET['_'] : time();
$requestId = md5($timestamp . rand(1000, 9999));
header('X-Request-ID: ' . $requestId);

// 如果是通過 Cloudflare 訪問，始終強制刷新
if (isset($_SERVER['HTTP_CF_CONNECTING_IP']) || isset($_SERVER['HTTP_CF_VISITOR'])) {
    $forceRefresh = true;
    header('X-CF-Detected: Yes');
}

// 檢查快取是否存在且未過期且不是強制刷新
$useCache = false;
if (!$forceRefresh && file_exists($cacheFile)) {
    $fileTime = filemtime($cacheFile);
    if (time() - $fileTime < $cacheTime) {
        // 快取有效，直接輸出快取內容
        header('X-Cache: HIT');
        header('X-Cache-Age: ' . (time() - $fileTime) . 's');
        echo file_get_contents($cacheFile);
        exit;
    }
}

// 快取不存在、已過期或強制刷新
header('X-Cache: MISS');
if ($forceRefresh) {
    header('X-Cache-Refresh: Forced');
}

// 快取不存在或已過期，從 Google Sheets API 獲取資料
$spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo'; // 與 sheets_api_handler.php 相同
$sheetName = 'Sheet1'; // 訂單工作表名稱

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

    // 第一列為標題
    $header = array_map('trim', $values[0]);
    $orders = [];
    foreach ($values as $idx => $row) {
        if ($idx === 0) continue; // 跳過標題列
        // 跳過空白列（已刪除訂單或空白）
        if (!isset($row[1]) || trim($row[1]) === '') continue;

        // 轉換到貨日期格式
        $rawDate = $row[5] ?? '';
        $dueDate = '';
        if ($rawDate) {
            $dt = date_create($rawDate);
            if ($dt) {
                $dueDate = date_format($dt, 'Y-m-d');
            } else {
                $dueDate = $rawDate;
            }
        }

        // 使用行索引作為 ID，這樣刪除功能可以正確定位要刪除的行
        // 注意：刪除後行號會改變，但這是預期的行為
        $orders[] = [
            'createdAt' => $row[0] ?? '', // A欄 訂單時間
            'id' => $idx, // 使用當前行索引作為 ID
            'orderNumber' => sprintf('ORD-%03d', $idx), // 生成格式化的訂單編號
            'customerName' => $row[1] ?? '',
            'customerPhone' => $row[2] ?? '',
            'items' => $row[8] ?? '',
            'amount' => $row[9] ?? '',
            'dueDate' => $dueDate, // F欄 到貨日期 (已轉為 YYYY-MM-DD)
            'deliveryTime' => $row[6] ?? '', // G欄 宅配時段
            // 從 H 欄（index 7）讀取「備註」
            'note' => $row[7] ?? '', // H欄
            'status' => $row[14] ?? '',
            'deliveryMethod' => $row[3] ?? '',
            'deliveryAddress' => $row[4] ?? '',
            'paymentMethod' => $row[12] ?? '',
            'paymentStatus' => $row[15] ?? '' // P欄 款項狀態
        ];
    }

    $result = json_encode(['success' => true, 'data' => $orders, 'timestamp' => time(), 'request_id' => $requestId]);

    echo $result;

    // 更新快取文件
    file_put_contents($cacheFile, $result);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
