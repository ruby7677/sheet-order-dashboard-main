// 錯誤處理工具函數
export const handleApiError = (error: any) => {
  console.error('API Error:', error);
  
  if (error.name === 'URIError' || error.message?.includes('URI malformed')) {
    console.warn('URI encoding error detected, attempting to fix...');
    return {
      error: 'URI_MALFORMED',
      message: '路徑編碼錯誤，請重新載入頁面',
      suggestion: '請清除瀏覽器快取後重新載入'
    };
  }
  
  return {
    error: 'UNKNOWN_ERROR',
    message: error.message || '未知錯誤',
    suggestion: '請檢查網路連線或聯繫技術支援'
  };
};

// URL 編碼安全處理
export const safeEncodeURI = (uri: string): string => {
  try {
    // 先解碼再編碼，避免重複編碼
    const decoded = decodeURIComponent(uri);
    return encodeURIComponent(decoded);
  } catch (error) {
    console.warn('URI encoding failed, using original:', uri);
    return uri;
  }
};

// 安全的 URL 構建
export const buildSafeUrl = (base: string, path: string, params?: Record<string, string>): string => {
  try {
    const url = new URL(path, base);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    
    return url.toString();
  } catch (error) {
    console.error('URL construction failed:', error);
    return `${base}${path}`;
  }
};