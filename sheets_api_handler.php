<?php
/**
 * Google Sheets API 處理器
 * 用於直接將訂單數據寫入Google Sheets
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Twilio\Rest\Client as TwilioClient;

class SheetsApiHandler {
    private $client;
    private $service;
    private $spreadsheetId = '10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo';
    private $orderSheetName = 'Sheet1';
    private $customerSheetName = '客戶名單';
    private $ipCache = [];
    private $ipCacheExpiry = 60; // 秒
    private $twilioSid = 'AC2e0ed31bb0213acdfa9e5322932659a0';
    private $twilioToken = '85e6d1c814833d9ac9def8d80f5c0ac4';
    private $twilioFrom = '+18592517209'; // 你的 Twilio 電話號碼


    public function __construct() {
        $this->initializeClient();
    }

    /**
     * 初始化Google API客戶端
     */
    private function initializeClient() {
        $this->client = new Client();
        $this->client->setApplicationName('訂單系統');
        $this->client->setScopes([Sheets::SPREADSHEETS]);
        $this->client->setAuthConfig(__DIR__ . '/service-account-key2.json');
        $this->client->setAccessType('offline');
        
        $this->service = new Sheets($this->client);
    }

    /**
     * 處理訂單提交
     * @param array $data 表單提交的數據
     * @return array 處理結果
     */
    public function processOrder($data) {
        try {
            // 檢查必要參數
            if (empty($data)) {
                throw new Exception('未收到表單數據');
            }
            
            // 檢查重複提交
            if ($this->isRecentSubmission($data)) {
                throw new Exception('剛剛訂單已提交，請稍後再試，勿重複提交訂單。<br>可聯繫官方LINE或FB私訊確認訂單是否無誤');
            }
            
            // 格式化電話號碼
            $phone = $this->formatPhoneNumber($data['phone']);
            
            // 處理訂單項目
            $orderItems = $this->processOrderItems($data);
            
            // 處理地址格式
            $storeLocation = $data['storeLocation'];
            $address = '';
            
            if ($storeLocation === '宅配到府') {
                $county = $data['county'];
                $district = $data['district'];
                $additionalInput = $data['additionalInput'];
                
                // 確保地址格式正確
                if (!str_starts_with($additionalInput, $county)) {
                    $address = "$county-$district $additionalInput";
                } else {
                    $address = $additionalInput;
                }
            } else {
                $address = $data['additionalInput'];
            }
            
            // 準備訂單數據
            $timestamp = date('Y-m-d H:i:s');
            
            // 組裝訂單數據
            $orderData = [
                $timestamp,
                $data['name'],
                $phone,
                $storeLocation,
                $address,
                $data['deliveryDate'],
                $data['deliveryTime'],
                $data['notes'] ?? '',
                $orderItems,
                $data['totalAmount'],
                $data['facebookline'],
                $this->formatSocialId($data['facebooklineid']),
                $data['pay']
            ];
            
            // 寫入訂單數據
            $this->appendToSheet($this->orderSheetName, [$orderData]);
            
            // 準備客戶資料
            $customerData = [
                $data['name'],
                $phone,
                $storeLocation,
                $address,
                $data['facebookline'],
                $this->formatSocialId($data['facebooklineid'])
            ];
            
            // 寫入客戶資料到客戶名單
            $this->appendToSheet($this->customerSheetName, [$customerData]);
            
            // 發送訂單確認簡訊
            $this->sendOrderConfirmationSMS($phone, $data['name'], $data['deliveryDate'], $data);
            
            return [
                'success' => true,
                'message' => '訂單已成功提交'
            ];
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }

    /**
     * 將數據附加到指定的工作表
     * @param string $sheetName 工作表名稱
     * @param array $values 要附加的數據
     */
    private function appendToSheet($sheetName, $values) {
        $range = $sheetName;
        $body = new ValueRange([
            'values' => $values
        ]);
        $params = [
            'valueInputOption' => 'RAW'
        ];
        
        $this->service->spreadsheets_values->append(
            $this->spreadsheetId,
            $range,
            $body,
            $params
        );
    }

    /**
     * 檢查是否為最近提交的訂單（防止重複提交）
     * @param array $data 表單數據
     * @return bool 是否為最近提交
     */
    private function isRecentSubmission($data) {
        try {
            // 獲取用戶 IP
            $userIP = $data['userip'] ?? '';
            
            if (empty($userIP)) {
                return false;
            }
            
            // 檢查是否有此 IP 的最近提交記錄
            if (isset($this->ipCache[$userIP]) && (time() - $this->ipCache[$userIP]) < $this->ipCacheExpiry) {
                return true;
            }
            
            // 將此 IP 記錄到快取中
            $this->ipCache[$userIP] = time();
            return false;
            
        } catch (Exception $e) {
            error_log('檢查重複提交時發生錯誤: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * 格式化電話號碼
     * @param string $phone 原始電話號碼
     * @return string 格式化後的電話號碼
     */
    private function formatPhoneNumber($phone) {
        if (empty($phone)) return '';
        
        // 移除所有非數字字符
        $phone = preg_replace('/\D/', '', $phone);
        
        // 確保電話號碼以 0 開頭
        if (!str_starts_with($phone, '0')) {
            $phone = '0' . $phone;
        }
        
        // 驗證電話號碼格式
        // 手機號碼為 10 位數，市話為 8-9 位數
        if (strlen($phone) > 10) {
            $phone = substr($phone, 0, 10);
        } else if (strlen($phone) < 7) {
            // 如果長度小於 7，可能是無效號碼
            error_log('無效的電話號碼長度: ' . $phone);
        }
        
        // 檢查電話號碼是否已經有單引號前綴，如果沒有才添加
        if (substr($phone, 0, 1) !== "'") {
            // 在電話號碼前加上單引號，強制 Google Sheets 將其視為文字
            return "" . $phone;
        }
        
        return $phone;
    }

    /**
     * 格式化社交軟體ID
     * @param string $socialId 原始社交軟體ID
     * @return string 格式化後的社交軟體ID
     */
    private function formatSocialId($socialId) {
        if (empty($socialId)) return '';
        
        // 檢查是否已經有單引號前綴，如果沒有才添加
        if (substr($socialId, 0, 1) !== "'") {
            // 在ID前加上單引號，強制 Google Sheets 將其視為文字
            return "" . $socialId;
        }
        
        return $socialId;
    }
    
    /**
     * 發送訂單確認簡訊
     * @param string $phone 客戶電話號碼
     * @param string $name 客戶姓名
     * @param string $deliveryDate 預計到達日期
     * @return bool 發送結果
     */
    private function sendOrderConfirmationSMS($phone, $name, $deliveryDate, $data) {
        // 最大重試次數
        $maxRetries = 2;
        $retryCount = 0;
        $success = false;
        
        // 驗證電話號碼
        if (empty($phone)) {
            error_log('無法發送簡訊: 電話號碼為空');
            return false;
        }
        
        try {
            // 確保電話號碼格式正確（移除非數字字符）
            $phone = preg_replace('/\D/', '', $phone);
            
            // 驗證電話號碼長度
            if (strlen($phone) < 8 || strlen($phone) > 10) {
                error_log('電話號碼格式可能不正確: ' . $phone . ' (長度: ' . strlen($phone) . ')');
            }
            
            // 如果電話號碼以0開頭，替換為台灣國碼+886
            if (substr($phone, 0, 1) === '0') {
                $phone = '+886' . substr($phone, 1);
            } else if (!preg_match('/^\+/', $phone)) {
                // 如果沒有國碼前綴，添加台灣國碼
                $phone = '+886' . $phone;
            }
            
            // 格式化日期顯示
            $formattedDate = date('Y/m/d', strtotime($deliveryDate));
            
            // 獲取訂單項目和總金額
            $orderItems = $data['orderItems'] ?? $this->processOrderItems($data);
            $totalAmount = $data['totalAmount'] ?? '';
            
            // 準備簡訊內容 - 改進格式使其更易讀
            $message = "【融氏古早味】訂單確認\n\n";
            $message .= "親愛的 {$name} 您好，\n\n";
            $message .= "您的訂單已成功建立！\n";
            $message .= "------------------\n";
            $message .= "訂單資訊:\n";
            $message .= "• 姓名: {$name}\n";
            $message .= "• 電話: {$phone}\n";
            $message .= "• 預計到貨日期: {$formattedDate}\n";
            $message .= "• 訂單項目: {$orderItems}\n";
            $message .= "• 總金額: {$totalAmount} 元\n";
            $message .= "------------------\n";
            $message .= "感謝您的購買，如有任何問題請聯繫我們的LINE或FB客服。";
            
            // 重試機制
            while ($retryCount <= $maxRetries && !$success) {
                try {
                    // 初始化Twilio客戶端
                    $twilio = new TwilioClient($this->twilioSid, $this->twilioToken);
                    
                    // 發送簡訊
                    $result = $twilio->messages->create(
                        $phone,
                        [
                            'from' => $this->twilioFrom,
                            'body' => $message
                        ]
                    );
                    
                    // 記錄成功發送的簡訊
                    error_log("簡訊發送成功 - SID: {$result->sid}, 電話: {$phone}, 嘗試次數: " . ($retryCount + 1));
                    $success = true;
                    break;
                    
                } catch (Exception $innerException) {
                    $retryCount++;
                    error_log("簡訊發送失敗 (嘗試 {$retryCount}/{$maxRetries}): " . $innerException->getMessage());
                    
                    if ($retryCount <= $maxRetries) {
                        // 等待一段時間後重試
                        sleep(2);
                    }
                }
            }
            
            return $success;
            
        } catch (Exception $e) {
            // 記錄錯誤但不中斷流程
            error_log('發送簡訊時發生錯誤: ' . $e->getMessage() . '\n' . $e->getTraceAsString());
            return false;
        }
    }

    /**
     * 處理訂單項目
     * @param array $data 表單數據
     * @return string 格式化的訂單項目字符串
     */
    private function processOrderItems($data) {
        $orderItems = [];
        for ($i = 1; $i <= 3; $i++) {
            $quantity = $data['quantity' . $i] ?? 0;
            if ($quantity > 0) {
                $itemSelection = explode(',', $data['itemSelection' . $i]);
                $orderItems[] = "{$itemSelection[0]} x {$quantity}";
            }
        }
        return implode(", ", $orderItems);
    }

    /**
     * 創建成功頁面
     * @return string HTML 成功頁面
     */
    public function createSuccessPage() {
        return <<<HTML
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        background-color: #f4f4f9;
        margin: 0;
        padding: 20px;
      }
      .message {
        margin-top: 50px;
        font-size: 26px;
        color: #333;
        background-color: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      }
      .success {
        font-weight: bold;
        font-size: 30px;
        color: #28a745;
        margin-bottom: 20px;
      }
      .red {
        color: #ff0000;
      }
    </style>
  </head>
  <body>
    <div class="message">
      <p class="success">訂單已提交！</p>
      <p>感謝您的購買，我們將盡快處理您的訂單！</p>
      <p class="red">請聯繫官方LINE或FB私訊聯繫 訂單是否無誤</p>
    </div>
  </body>
</html>
HTML;
    }

    /**
     * 創建錯誤頁面
     * @param string $errorMessage 錯誤訊息
     * @return string HTML 錯誤頁面
     */
    public function createErrorPage($errorMessage) {
        $message = $errorMessage ?: '抱歉，訂單提交時發生錯誤，請稍後再試。';
        return <<<HTML
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { text-align: center; padding: 20px; }
      .error { color: red; }
    </style>
  </head>
  <body>
    <h2 class="error">提交失敗</h2>
    <p>{$message}</p>
  </body>
</html>
HTML;
    }
}

// 處理API請求
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $handler = new SheetsApiHandler();
    $result = $handler->processOrder($_POST);
    
    // 檢查是否為AJAX請求
    $isAjax = !empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest';
    
    if ($isAjax) {
        // 返回JSON格式的響應
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($result);
    } else {
        // 返回HTML頁面（保持向後兼容）
        header('Content-Type: text/html; charset=utf-8');
        
        if ($result['success']) {
            echo $handler->createSuccessPage();
        } else {
            echo $handler->createErrorPage($result['message']);
        }
    }
    exit;
}