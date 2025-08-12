<?php
// 檢查並確保快取目錄存在且可寫入
header('Content-Type: application/json; charset=utf-8');

$cacheDir = __DIR__ . '/../cache';
$result = [
    'success' => false,
    'message' => '',
    'cache_dir_exists' => false,
    'cache_dir_writable' => false,
    'cache_file_exists' => false,
    'cache_file_path' => ''
];

// 檢查快取目錄是否存在
if (!is_dir($cacheDir)) {
    // 嘗試創建快取目錄
    $created = mkdir($cacheDir, 0755, true);
    if ($created) {
        $result['message'] = '快取目錄已成功創建';
        $result['cache_dir_exists'] = true;
    } else {
        $result['message'] = '無法創建快取目錄';
        echo json_encode($result);
        exit;
    }
} else {
    $result['message'] = '快取目錄已存在';
    $result['cache_dir_exists'] = true;
}

// 檢查快取目錄是否可寫入
if (is_writable($cacheDir)) {
    $result['cache_dir_writable'] = true;
    $result['message'] .= '，且可寫入';
} else {
    $result['message'] .= '，但不可寫入';
    // 嘗試修改權限
    chmod($cacheDir, 0755);
    if (is_writable($cacheDir)) {
        $result['cache_dir_writable'] = true;
        $result['message'] .= '。已修復權限問題';
    } else {
        $result['message'] .= '。無法修復權限問題';
    }
}

// 檢查快取文件是否存在
$cacheFile = $cacheDir . '/orders_cache.json';
$result['cache_file_path'] = $cacheFile;
if (file_exists($cacheFile)) {
    $result['cache_file_exists'] = true;
    $result['message'] .= '。快取文件存在';
    
    // 檢查快取文件內容
    $cacheContent = file_get_contents($cacheFile);
    $cacheData = json_decode($cacheContent, true);
    if ($cacheData && isset($cacheData['success']) && isset($cacheData['data'])) {
        $result['message'] .= '，格式正確';
        $result['cache_data_count'] = count($cacheData['data']);
        $result['cache_last_modified'] = date('Y-m-d H:i:s', filemtime($cacheFile));
    } else {
        $result['message'] .= '，但格式不正確';
        // 刪除不正確的快取文件
        unlink($cacheFile);
        $result['message'] .= '。已刪除不正確的快取文件';
        $result['cache_file_exists'] = false;
    }
} else {
    $result['message'] .= '。快取文件不存在';
}

// 測試創建臨時快取文件
if ($result['cache_dir_writable']) {
    $testFile = $cacheDir . '/test_' . time() . '.txt';
    $testContent = 'Test cache write: ' . date('Y-m-d H:i:s');
    $writeResult = file_put_contents($testFile, $testContent);
    
    if ($writeResult !== false) {
        $result['message'] .= '。成功寫入測試文件';
        // 刪除測試文件
        unlink($testFile);
    } else {
        $result['message'] .= '。無法寫入測試文件';
    }
}

$result['success'] = $result['cache_dir_exists'] && $result['cache_dir_writable'];
echo json_encode($result);
