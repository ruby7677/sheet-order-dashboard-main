<?php
// API 路徑檢查工具
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// 檢查環境和路徑
$result = [
    'success' => true,
    'message' => '成功檢查 API 路徑',
    'environment' => [
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? '未知',
        'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? '未知',
        'script_filename' => $_SERVER['SCRIPT_FILENAME'] ?? '未知',
        'request_uri' => $_SERVER['REQUEST_URI'] ?? '未知',
        'http_host' => $_SERVER['HTTP_HOST'] ?? '未知',
        'server_protocol' => $_SERVER['SERVER_PROTOCOL'] ?? '未知',
        'php_version' => PHP_VERSION,
        'os' => PHP_OS
    ],
    'api_paths' => [
        'current_file' => __FILE__,
        'current_dir' => __DIR__,
        'parent_dir' => dirname(__DIR__),
        'api_files' => []
    ],
    'cache' => [
        'cache_dir_exists' => false,
        'cache_dir_writable' => false,
        'cache_file_exists' => false
    ]
];

// 檢查 API 文件
$apiFiles = [
    'get_orders_from_sheet.php',
    'update_order_status.php',
    'update_payment_status.php',
    'delete_order.php'
];

foreach ($apiFiles as $file) {
    $filePath = __DIR__ . '/' . $file;
    $result['api_paths']['api_files'][$file] = [
        'exists' => file_exists($filePath),
        'path' => $filePath,
        'size' => file_exists($filePath) ? filesize($filePath) : 0,
        'last_modified' => file_exists($filePath) ? date('Y-m-d H:i:s', filemtime($filePath)) : null
    ];
}

// 檢查快取目錄
$cacheDir = __DIR__ . '/../cache';
$cacheFile = $cacheDir . '/orders_cache.json';

$result['cache']['cache_dir_exists'] = is_dir($cacheDir);
$result['cache']['cache_dir_path'] = $cacheDir;

if (!is_dir($cacheDir)) {
    // 嘗試創建快取目錄
    $created = mkdir($cacheDir, 0755, true);
    $result['cache']['cache_dir_created'] = $created;
    $result['cache']['cache_dir_exists'] = $created;
} 

if (is_dir($cacheDir)) {
    $result['cache']['cache_dir_writable'] = is_writable($cacheDir);
    $result['cache']['cache_file_exists'] = file_exists($cacheFile);
    
    if (file_exists($cacheFile)) {
        $result['cache']['cache_file_size'] = filesize($cacheFile);
        $result['cache']['cache_file_last_modified'] = date('Y-m-d H:i:s', filemtime($cacheFile));
        
        // 檢查快取文件內容
        $cacheContent = file_get_contents($cacheFile);
        $cacheData = json_decode($cacheContent, true);
        $result['cache']['cache_file_valid_json'] = $cacheData !== null;
        
        if ($cacheData !== null && isset($cacheData['data'])) {
            $result['cache']['cache_data_count'] = count($cacheData['data']);
        }
    }
}

// 檢查 Google Sheets API 憑證
$credentialFile = __DIR__ . '/../service-account-key2.json';
$result['google_api'] = [
    'credential_file_exists' => file_exists($credentialFile),
    'credential_file_path' => $credentialFile
];

if (file_exists($credentialFile)) {
    $result['google_api']['credential_file_size'] = filesize($credentialFile);
    $result['google_api']['credential_file_last_modified'] = date('Y-m-d H:i:s', filemtime($credentialFile));
    
    // 檢查憑證文件內容
    $credentialContent = file_get_contents($credentialFile);
    $credentialData = json_decode($credentialContent, true);
    $result['google_api']['credential_file_valid_json'] = $credentialData !== null;
    
    if ($credentialData !== null) {
        // 只顯示部分資訊，避免洩露敏感資料
        $result['google_api']['project_id'] = $credentialData['project_id'] ?? '未知';
        $result['google_api']['client_email'] = $credentialData['client_email'] ?? '未知';
    }
}

// 檢查 Composer 依賴
$vendorDir = 'D:/xampp/htdocs/vendor';
$result['dependencies'] = [
    'vendor_dir_exists' => is_dir($vendorDir),
    'vendor_dir_path' => $vendorDir,
    'google_api_client_exists' => is_dir($vendorDir . '/google')
];

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
