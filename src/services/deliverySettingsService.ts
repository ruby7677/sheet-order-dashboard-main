import SecureStorage from '@/utils/secureStorage';
import type { Database } from '@/integrations/supabase/types';
import { createClient } from '@supabase/supabase-js';

// 類型定義
export type DeliveryDateSetting = Database['public']['Tables']['delivery_date_settings']['Row'];
export type DeliveryDateSettingInsert = Database['public']['Tables']['delivery_date_settings']['Insert'];
export type DeliveryDateSettingUpdate = Database['public']['Tables']['delivery_date_settings']['Update'];

export interface DeliverySettingsFormData {
  start_date: string;
  end_date: string;
  description?: string;
  updated_by: string;
}

export interface AvailableDateItem {
  value: string;
  display: string;
  dayOfWeek: number;
  isSunday: boolean;
}

export interface DeliverySettingsResponse {
  success: boolean;
  data?: DeliveryDateSetting;
  message?: string;
}

export interface AvailableDatesResponse {
  success: boolean;
  data?: AvailableDateItem[];
  message?: string;
}

/**
 * 到貨日期設定服務類
 * 管理到貨日期設定的 CRUD 操作和可用日期計算
 */
class DeliverySettingsService {
  private supabase;

  constructor() {
    // 使用 Service Role Key 來繞過 RLS
    this.supabase = createClient(
      "https://skcdapfynyszxyqqsvib.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrY2RhcGZ5bnlzenh5cXFzdmliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDk3NDMzNCwiZXhwIjoyMDcwNTUwMzM0fQ.BVaY-ZJOKyVlNOD9LLVFP-0uQVv2yLrPXCE-9-tDqYs"
    );
  }

  /**
   * 獲取當前有效的配送設定
   */
  async getCurrentSettings(): Promise<DeliverySettingsResponse> {
    try {
      const { data, error } = await this.supabase
        .from('delivery_date_settings')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Supabase 查詢錯誤:', error);
        throw error;
      }

      if (data) {
        return {
          success: true,
          data: data
        };
      } else {
        // 如果沒有資料，返回預設設定
        const defaultSetting = this.getDefaultSettings();
        return {
          success: true,
          data: defaultSetting
        };
      }
    } catch (error) {
      console.error('獲取配送設定失敗:', error);
      // 如果查詢失敗，返回預設設定
      const defaultSetting = this.getDefaultSettings();
      return {
        success: true,
        data: defaultSetting
      };
    }
  }

  /**
   * 更新配送設定
   */
  async updateSettings(formData: DeliverySettingsFormData): Promise<DeliverySettingsResponse> {
    try {
      // 驗證輸入資料
      this.validateSettingsData(formData);

      // 先將現有的設定標記為非活動
      const { error: updateError } = await this.supabase
        .from('delivery_date_settings')
        .update({ is_active: false })
        .eq('is_active', true);

      if (updateError) {
        console.error('更新現有設定失敗:', updateError);
        // 繼續執行，因為可能沒有現有設定
      }

      // 創建新的設定記錄
      const newSetting: DeliveryDateSettingInsert = {
        start_date: formData.start_date,
        end_date: formData.end_date,
        description: formData.description || null,
        updated_by: formData.updated_by,
        is_active: true
      };

      const { data, error: insertError } = await this.supabase
        .from('delivery_date_settings')
        .insert(newSetting)
        .select()
        .single();

      if (insertError) {
        console.error('插入新設定失敗:', insertError);
        throw insertError;
      }

      return {
        success: true,
        data: data,
        message: '配送設定更新成功'
      };
    } catch (error) {
      console.error('更新配送設定失敗:', error);
      return {
        success: false,
        message: `更新配送設定失敗: ${error instanceof Error ? error.message : '未知錯誤'}`
      };
    }
  }

  /**
   * 計算可用的配送日期
   * @param deliveryMethod 配送方式：'宅配到府' | '超商取貨'
   * @param customStartDate 自訂開始日期（可選）
   * @param customEndDate 自訂結束日期（可選）
   */
  async getAvailableDates(
    deliveryMethod?: '宅配到府' | '超商取貨',
    customStartDate?: string,
    customEndDate?: string
  ): Promise<AvailableDatesResponse> {
    try {
      let startDate: string;
      let endDate: string;

      if (customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        const settingsResponse = await this.getCurrentSettings();
        if (!settingsResponse.success || !settingsResponse.data) {
          throw new Error('無法獲取配送設定');
        }
        startDate = settingsResponse.data.start_date;
        endDate = settingsResponse.data.end_date;
      }

      // 可以選擇使用 API 或本地計算
      const dates = this.calculateAvailableDates(startDate, endDate, deliveryMethod);

      return {
        success: true,
        data: dates
      };
    } catch (error) {
      console.error('計算可用日期失敗:', error);
      return {
        success: false,
        message: `計算可用日期失敗: ${error instanceof Error ? error.message : '未知錯誤'}`
      };
    }
  }

  /**
   * 計算指定日期範圍內的可用日期
   */
  private calculateAvailableDates(
    startDate: string,
    endDate: string,
    deliveryMethod?: '宅配到府' | '超商取貨'
  ): AvailableDateItem[] {
    const dates: AvailableDateItem[] = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 確保開始日期不早於今天
    const actualStart = start < today ? today : start;

    const currentDate = new Date(actualStart);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay(); // 0 = 星期日
      const dateStr = currentDate.toISOString().split('T')[0];

      // 檢查是否需要排除星期日
      const shouldExcludeSunday = deliveryMethod === '宅配到府';
      const isSunday = dayOfWeek === 0;

      if (!shouldExcludeSunday || !isSunday) {
        const month = currentDate.getMonth() + 1;
        const day = currentDate.getDate();
        const weekDayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const displayStr = `${month}/${day} (${weekDayNames[dayOfWeek]})`;

        dates.push({
          value: dateStr,
          display: displayStr,
          dayOfWeek: dayOfWeek,
          isSunday: isSunday
        });
      }

      // 移動到下一天
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  /**
   * 驗證設定資料
   */
  private validateSettingsData(data: DeliverySettingsFormData): void {
    if (!data.start_date || !this.isValidDate(data.start_date)) {
      throw new Error(`開始日期格式錯誤: ${data.start_date}`);
    }

    if (!data.end_date || !this.isValidDate(data.end_date)) {
      throw new Error(`結束日期格式錯誤: ${data.end_date}`);
    }

    if (new Date(data.start_date) > new Date(data.end_date)) {
      throw new Error('結束日期不能早於開始日期');
    }

    if (!data.updated_by) {
      throw new Error('更新者不能為空');
    }
  }

  /**
   * 檢查日期格式是否正確
   */
  private isValidDate(dateString: string): boolean {
    if (!dateString) {
      return false;
    }
    
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) {
      return false;
    }

    try {
      // 創建日期物件並檢查是否為有效日期
      const date = new Date(dateString + 'T00:00:00');
      
      // 檢查日期是否為 Invalid Date
      if (isNaN(date.getTime())) {
        return false;
      }
      
      // 檢查日期字符串是否與解析後的日期一致
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const reconstructedDate = `${year}-${month}-${day}`;
      
      return reconstructedDate === dateString;
    } catch (error) {
      return false;
    }
  }

  /**
   * 獲取預設設定
   */
  private getDefaultSettings(): DeliveryDateSetting {
    const today = new Date();
    const startDate = new Date(today);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14);

    return {
      id: 'default',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      description: '預設配送設定',
      is_active: true,
      updated_by: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * 清除快取（為了與其他服務保持一致性）
   */
  clearCache(): void {
    // 如果未來需要添加快取功能，在這裡實現清除邏輯
    console.log('DeliverySettingsService: 清除快取');
  }
}

// 創建單例實例
export const deliverySettingsService = new DeliverySettingsService();

// 導出預設實例
export default deliverySettingsService;