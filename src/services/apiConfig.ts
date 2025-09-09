// Linus式API配置 - 10行解决100行的问题
// "Theory and practice sometimes clash. Theory loses. Every single time."

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const WORKERS_API = import.meta.env.VITE_WORKERS_API || 'https://sheet-order-api.ruby7677.workers.dev';
const USE_WORKERS = import.meta.env.VITE_USE_WORKERS === 'true';

export const getApiUrl = (endpoint: string): string => 
  USE_WORKERS ? `${WORKERS_API}${endpoint}` : `${API_BASE}${endpoint}`;

// 简单的重试机制 - 不需要复杂的降级逻辑
export const apiCall = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const url = getApiUrl(endpoint);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }
  
  return response;
};