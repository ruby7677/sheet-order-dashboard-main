import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 載入環境變數
  const env = loadEnv(mode, process.cwd(), '');
  
  console.log('🔧 Vite config loading, mode:', mode);
  console.log('🔧 Current working directory:', process.cwd());
  console.log('🔧 __dirname:', __dirname);
  console.log('🔧 Environment:', {
    VITE_APP_ENV: env.VITE_APP_ENV,
    VITE_API_BASE_URL: env.VITE_API_BASE_URL,
    VITE_API_HOST: env.VITE_API_HOST
  });
  
  const isProduction = mode === 'production';
  const isDevelopment = mode === 'development';
  
  return {
  server: {
    host: "0.0.0.0",
    allowedHosts: ['node.767780.xyz', 'lopokao.767780.xyz', 'localhost', '127.0.0.1', '210.62.183.9' ,'210.62.183.9:8080' ,'767780.xyz'],
    cors: true,
    strictPort: false,
    headers: {
      'Content-Security-Policy': "frame-ancestors 'self' http://localhost http://127.0.0.1 http://192.168.1.5 http://210.62.183.9 http://210.62.183.9:8080 https://lopokao.767780.xyz https://node.767780.xyz https://cdn.gpteng.co *",
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cross-Origin-Opener-Policy': 'unsafe-none',
    },
    // 只在開發環境啟用 proxy
    proxy: isDevelopment ? {
      '/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
        rewrite: (path) => {
          try {
            console.log('🔍 Original path:', path);
            
            // 檢查 URI 是否有效，避免 decodeURI 錯誤
            try {
              decodeURI(path);
            } catch (decodeError) {
              console.warn('⚠️ Invalid URI detected, using encoded path:', path);
              // 如果 URI 無效，先進行安全編碼
              const safePath = encodeURI(path);
              const newPath = safePath.replace(/^%2Fapi/, '/sheet-order-dashboard-main/api')
                                     .replace(/^\/api/, '/sheet-order-dashboard-main/api');
              console.log('✅ Safe rewritten path:', newPath);
              return newPath;
            }
            
            const newPath = path.replace(/^\/api/, '/sheet-order-dashboard-main/api');
            console.log('✅ Rewritten path:', newPath);
            return newPath;
          } catch (error) {
            console.error('❌ Path rewrite error:', error);
            console.error('❌ Problematic path:', path);
            return '/sheet-order-dashboard-main/api/fallback'; // 安全的後備路徑
          }
        },
      },
      '/sheet-order-dashboard-main/api': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
        }
      }
    } : undefined,
    port: 8080,
    hmr: {
      overlay: false
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  };
});
