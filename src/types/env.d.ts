/// <reference types="vite/client" />

// 環境變數類型定義
interface ImportMetaEnv {
  readonly VITE_APP_ENV: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_API_HOST: string
  readonly VITE_GOOGLE_SHEET_ID: string
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_DESCRIPTION: string
  readonly VITE_CACHE_DURATION: string
  readonly VITE_DEBUG_MODE: string
  readonly VITE_CF_PAGES_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 全域 API 配置介面
interface APIConfig {
  getApiBase(): string;
  isProduction(): boolean;
  isDevelopment(): boolean;
  getFullApiUrl(endpoint: string): string;
}

// 擴展 Window 介面
declare global {
  interface Window {
    API_CONFIG: APIConfig;
  }
}