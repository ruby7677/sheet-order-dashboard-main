// URI 錯誤處理工具
export class URIErrorHandler {
  private static instance: URIErrorHandler;
  private errorCount = 0;
  private lastErrorTime = 0;
  private readonly MAX_ERRORS_PER_MINUTE = 10;

  private constructor() {
    this.setupGlobalHandlers();
  }

  public static getInstance(): URIErrorHandler {
    if (!URIErrorHandler.instance) {
      URIErrorHandler.instance = new URIErrorHandler();
    }
    return URIErrorHandler.instance;
  }

  private setupGlobalHandlers(): void {
    // 攔截 fetch 請求
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === 'string' ? input : input.toString();
        const safeUrl = this.sanitizeURL(url);
        
        if (safeUrl !== url) {
          console.warn('🔧 URL sanitized:', { original: url, sanitized: safeUrl });
        }
        
        return await originalFetch(safeUrl, init);
      } catch (error) {
        if (this.isURIError(error)) {
          console.error('❌ URI Error in fetch:', error);
          return this.handleURIError(error, input);
        }
        throw error;
      }
    };

    // 攔截 XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
      try {
        const urlString = typeof url === 'string' ? url : url.toString();
        const safeUrl = URIErrorHandler.getInstance().sanitizeURL(urlString);
        return originalOpen.call(this, method, safeUrl, ...args);
      } catch (error) {
        if (URIErrorHandler.getInstance().isURIError(error)) {
          console.error('❌ URI Error in XMLHttpRequest:', error);
          // 使用安全的後備 URL
          return originalOpen.call(this, method, '/api/fallback', ...args);
        }
        throw error;
      }
    };
  }

  private sanitizeURL(url: string): string {
    try {
      // 檢查 URL 是否已經是有效的
      decodeURI(url);
      return url;
    } catch (error) {
      if (this.isURIError(error)) {
        console.warn('⚠️ Invalid URI detected, attempting to fix:', url);
        
        // 嘗試修復常見的 URI 問題
        let fixedUrl = url;
        
        // 修復不完整的百分號編碼
        fixedUrl = fixedUrl.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
        
        // 修復無效的百分號編碼
        fixedUrl = fixedUrl.replace(/%[^0-9A-Fa-f]/g, (match) => {
          return encodeURIComponent(match);
        });
        
        // 如果還是無效，進行完全編碼
        try {
          decodeURI(fixedUrl);
          return fixedUrl;
        } catch {
          console.warn('⚠️ Complete URL encoding required for:', url);
          return encodeURI(url);
        }
      }
      throw error;
    }
  }

  private isURIError(error: any): boolean {
    return error && 
           (error.message?.includes('URI malformed') || 
            error.message?.includes('Invalid URL') ||
            error.name === 'URIError');
  }

  private handleURIError(error: any, originalInput: RequestInfo | URL): Promise<Response> {
    this.logError(error);
    
    // 返回一個安全的錯誤回應
    return Promise.resolve(new Response(
      JSON.stringify({
        error: 'URI_MALFORMED',
        message: 'The request URL contains invalid characters',
        timestamp: new Date().toISOString(),
        originalUrl: originalInput.toString()
      }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    ));
  }

  private logError(error: any): void {
    const now = Date.now();
    
    // 防止錯誤日誌洪水
    if (now - this.lastErrorTime < 60000) { // 1 分鐘內
      this.errorCount++;
      if (this.errorCount > this.MAX_ERRORS_PER_MINUTE) {
        console.warn('⚠️ Too many URI errors, suppressing further logs for 1 minute');
        return;
      }
    } else {
      this.errorCount = 1;
      this.lastErrorTime = now;
    }

    console.error('🚨 URI Error handled:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  }

  // 公共方法：手動清理 URL
  public static sanitizeURL(url: string): string {
    return URIErrorHandler.getInstance().sanitizeURL(url);
  }

  // 公共方法：檢查 URL 是否有效
  public static isValidURL(url: string): boolean {
    try {
      decodeURI(url);
      return true;
    } catch {
      return false;
    }
  }
}

// 自動初始化
if (typeof window !== 'undefined') {
  URIErrorHandler.getInstance();
  console.log('✅ URI Error Handler initialized');
}