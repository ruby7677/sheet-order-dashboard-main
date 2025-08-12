<?php
// 關閉所有錯誤輸出，避免破壞 JSON
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');

// 允許 POST 跨域預檢
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 讀取 POST 輸入
$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!is_array($input)) {
    echo json_encode([
        'success' => false,
        'message' => '請以 JSON 格式傳送帳號密碼'
    ]);
    exit;
}
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';

// 硬編碼帳號密碼
$valid_username = 'admin';
$valid_password = 'admin123';

if ($username === $valid_username && $password === $valid_password) {
    echo json_encode([
        'success' => true,
        'token' => bin2hex(random_bytes(16))
    ]);
    exit;
} else {
    echo json_encode([
        'success' => false,
        'message' => '帳號或密碼錯誤'
    ]);
    exit;
}
