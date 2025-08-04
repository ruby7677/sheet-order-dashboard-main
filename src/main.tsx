import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 導入 URI 錯誤處理器
import './utils/uriErrorHandler'

// 全域錯誤處理器 - 捕獲 URI malformed 錯誤
window.addEventListener('error', (event) => {
  console.error('🚨 Global error caught:', event.error);
  if (event.error?.message?.includes('URI malformed')) {
    console.error('❌ URI Malformed Error Details:');
    console.error('- Error message:', event.error.message);
    console.error('- Stack trace:', event.error.stack);
    console.error('- Current URL:', window.location.href);
    console.error('- User Agent:', navigator.userAgent);
    
    // 嘗試重新載入頁面作為最後手段
    if (confirm('檢測到 URI 錯誤，是否重新載入頁面？')) {
      window.location.reload();
    }
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled promise rejection:', event.reason);
  if (event.reason?.message?.includes('URI malformed')) {
    console.error('❌ URI Malformed Promise Rejection:', event.reason);
    event.preventDefault(); // 防止錯誤冒泡
  }
});

/*
if (import.meta.env.MODE === 'development') {
  import('@stagewise/toolbar-react').then(({ StagewiseToolbar }) => {
    const config = { plugins: [] };
    const toolbarRoot = document.createElement('div');
    toolbarRoot.id = 'stagewise-toolbar-root';
    document.body.appendChild(toolbarRoot);
    import('react-dom/client').then(({ createRoot }) => {
      createRoot(toolbarRoot).render(<StagewiseToolbar config={config} />);
    });
  });
}
*/
createRoot(document.getElementById("root")!).render(<App />);
