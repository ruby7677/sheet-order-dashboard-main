<?php
/**
 * 到貨日設定管理 API
 * 提供後台管理員設定本檔期到貨日的功能
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
// 處理 OPTIONS 請求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

class DeliverySettingsManager {
    private $settingsFile;

    public function __construct() {
        $this->settingsFile = __DIR__ . '/config/delivery_settings.json';
    }

    /**
     * 獲取當前設定
     */
    public function getSettings() {
        try {
            if (!file_exists($this->settingsFile)) {
                return $this->getDefaultSettings();
            }

            $content = file_get_contents($this->settingsFile);
            $settings = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('設定檔案格式錯誤');
            }

            return [
                'success' => true,
                'data' => $settings
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => '讀取設定失敗: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 更新設定
     */
    public function updateSettings($data) {
        try {
            // 驗證輸入資料
            $this->validateSettingsData($data);

            // 讀取現有設定
            $currentSettings = $this->getCurrentSettings();

            // 更新設定
            if (isset($data['start_date'])) {
                $currentSettings['delivery_period']['start_date'] = $data['start_date'];
            }
            if (isset($data['end_date'])) {
                $currentSettings['delivery_period']['end_date'] = $data['end_date'];
            }
            if (isset($data['description'])) {
                $currentSettings['delivery_period']['description'] = $data['description'];
            }

            // 設定時區為台北時間並更新時間戳記
            date_default_timezone_set('Asia/Taipei');
            $currentSettings['delivery_period']['updated_at'] = date('Y-m-d H:i:s');
            $currentSettings['delivery_period']['updated_by'] = $data['updated_by'] ?? 'admin';

            // 儲存設定
            $this->saveSettings($currentSettings);

            return [
                'success' => true,
                'message' => '設定更新成功',
                'data' => $currentSettings
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => '更新設定失敗: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 獲取可選擇的到貨日期
     */
    public function getAvailableDates($deliveryMethod = null, $customStartDate = null, $customEndDate = null) {
        try {
            $settings = $this->getCurrentSettings();

            // 如果提供了自訂日期，使用自訂日期；否則使用設定檔案中的日期
            if ($customStartDate && $customEndDate) {
                $period = [
                    'start_date' => $customStartDate,
                    'end_date' => $customEndDate
                ];
            } else {
                $period = $settings['delivery_period'];
            }

            $rules = $settings['delivery_rules'];

            // 設定時區為台北時間
            date_default_timezone_set('Asia/Taipei');

            // 建立日期物件，確保時間設定為當天開始 (00:00:00)
            $startDate = new DateTime($period['start_date'] . ' 00:00:00');
            $endDate = new DateTime($period['end_date'] . ' 23:59:59');
            $today = new DateTime('today'); // 今天的 00:00:00

            // 確保開始日期不早於今天
            if ($startDate < $today) {
                $startDate = $today;
            }

            $dates = [];
            $currentDate = clone $startDate;

            // 確保 currentDate 也是當天開始時間
            $currentDate->setTime(0, 0, 0);

            // 使用日期比較而非日期時間比較
            while ($currentDate->format('Y-m-d') <= $endDate->format('Y-m-d')) {
                $dayOfWeek = (int)$currentDate->format('w');

                // 檢查是否需要排除星期日
                $excludeSunday = false;
                if ($deliveryMethod === '宅配到府') {
                    $excludeSunday = $rules['home_delivery']['exclude_sunday'];
                } else if ($deliveryMethod === '超商取貨') {
                    $excludeSunday = $rules['store_pickup']['exclude_sunday'];
                }

                if (!$excludeSunday || $dayOfWeek !== 0) { // 0 = 星期日
                    $dateStr = $currentDate->format('Y-m-d');
                    $displayStr = $currentDate->format('n/j') . ' (' .
                        ['日', '一', '二', '三', '四', '五', '六'][$dayOfWeek] . ')';

                    $dates[] = [
                        'value' => $dateStr,
                        'display' => $displayStr,
                        'dayOfWeek' => $dayOfWeek
                    ];
                }

                $currentDate->add(new DateInterval('P1D'));
            }

            return [
                'success' => true,
                'data' => $dates,
                'period' => $period,
                'delivery_method' => $deliveryMethod,
                'debug_info' => [
                    'start_date' => $period['start_date'],
                    'end_date' => $period['end_date'],
                    'actual_start' => $startDate->format('Y-m-d'),
                    'actual_end' => $endDate->format('Y-m-d'),
                    'total_dates' => count($dates),
                    'first_date' => !empty($dates) ? $dates[0]['value'] : null,
                    'last_date' => !empty($dates) ? end($dates)['value'] : null
                ]
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => '獲取可選日期失敗: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 驗證設定資料
     */
    private function validateSettingsData($data) {
        if (isset($data['start_date']) && !$this->isValidDate($data['start_date'])) {
            throw new Exception('開始日期格式錯誤');
        }

        if (isset($data['end_date']) && !$this->isValidDate($data['end_date'])) {
            throw new Exception('結束日期格式錯誤');
        }

        if (isset($data['start_date']) && isset($data['end_date'])) {
            if (strtotime($data['start_date']) >= strtotime($data['end_date'])) {
                throw new Exception('結束日期必須晚於開始日期');
            }
        }
    }

    /**
     * 檢查日期格式是否正確
     */
    private function isValidDate($date) {
        $d = DateTime::createFromFormat('Y-m-d', $date);
        return $d && $d->format('Y-m-d') === $date;
    }

    /**
     * 獲取當前設定
     */
    private function getCurrentSettings() {
        if (!file_exists($this->settingsFile)) {
            return $this->getDefaultSettings()['data'];
        }

        $content = file_get_contents($this->settingsFile);
        return json_decode($content, true);
    }

    /**
     * 儲存設定
     */
    private function saveSettings($settings) {
        $json = json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if (file_put_contents($this->settingsFile, $json) === false) {
            throw new Exception('無法儲存設定檔案');
        }
    }

    /**
     * 獲取預設設定
     */
    private function getDefaultSettings() {
        // 設定時區為台北時間
        date_default_timezone_set('Asia/Taipei');

        $today = new DateTime();
        $startDate = clone $today;
        // 直接從今天開始，不再添加額外天數
        $endDate = clone $startDate;
        $endDate->add(new DateInterval('P14D')); // 從今天開始+14天

        return [
            'success' => true,
            'data' => [
                'delivery_period' => [
                    'start_date' => $startDate->format('Y-m-d'),
                    'end_date' => $endDate->format('Y-m-d'),
                    'description' => '本檔期到貨日設定',
                    'updated_at' => date('Y-m-d H:i:s'),
                    'updated_by' => 'system'
                ],
                'delivery_rules' => [
                    'home_delivery' => [
                        'exclude_sunday' => true,
                        'advance_days' => 0,
                        'description' => '宅配到府排除星期日'
                    ],
                    'store_pickup' => [
                        'exclude_sunday' => false,
                        'advance_days' => 0,
                        'description' => '7-11門市取貨無星期限制'
                    ]
                ]
            ]
        ];
    }
}

// API 端點處理
try {
    $manager = new DeliverySettingsManager();

    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            if (isset($_GET['action']) && $_GET['action'] === 'available_dates') {
                $deliveryMethod = $_GET['delivery_method'] ?? null;
                $customStartDate = $_GET['start_date'] ?? null;
                $customEndDate = $_GET['end_date'] ?? null;
                $result = $manager->getAvailableDates($deliveryMethod, $customStartDate, $customEndDate);
            } else {
                $result = $manager->getSettings();
            }
            break;

        case 'POST':
        case 'PUT':
            $input = file_get_contents('php://input');
            $data = json_decode($input, true);

            if (empty($data)) {
                $data = $_POST;
            }

            $result = $manager->updateSettings($data);
            break;

        default:
            http_response_code(405);
            $result = [
                'success' => false,
                'message' => '不支援的請求方法'
            ];
            break;
    }

    echo json_encode($result, JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>
