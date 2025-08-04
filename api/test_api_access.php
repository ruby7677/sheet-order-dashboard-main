<?php
/**
 * 簡單的 API 測試檔案
 * 用於測試 API 目錄是否可以正常訪問
 */

// 引入共用標頭設置
require_once __DIR__ . '/common_headers.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 輸出基本資訊
$response = [
    'success' => true,
    'message' => 'API 測試成功！',
    'timestamp' => time(),
    'server_info' => [
        'php_version' => PHP_VERSION,
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? 'Unknown',
        'script_filename' => $_SERVER['SCRIPT_FILENAME'] ?? 'Unknown',
        'request_uri' => $_SERVER['REQUEST_URI'] ?? 'Unknown',
        'current_directory' => __DIR__,
        'file_exists_check' => [
            'update_order_items.php' => file_exists(__DIR__ . '/update_order_items.php'),
            'get_orders_from_sheet.php' => file_exists(__DIR__ . '/get_orders_from_sheet.php'),
            'common_headers.php' => file_exists(__DIR__ . '/common_headers.php'),
        ]
    ]
];

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>
