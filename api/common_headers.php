<?php
// 共用標頭設置，用於所有 API 檔案
// 設置 CORS 標頭
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

// 設置內容類型
header('Content-Type: application/json; charset=utf-8');

// 強制禁止所有快取 - 針對 Cloudflare 和瀏覽器
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');
header('Expires: 0');
header('Surrogate-Control: no-store');
header('X-Accel-Expires: 0');

// 添加 Cloudflare 特定標頭
header('CF-Cache-Status: BYPASS');
header('CDN-Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');

// 添加隨機 ETag 以防止快取
header('ETag: "' . md5(time() . rand()) . '"');

// 處理 OPTIONS 預檢請求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
