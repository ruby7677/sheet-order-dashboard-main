@echo off
echo ==========================================
echo 切換到 Cloudflare 部署環境
echo ==========================================

REM 暫存本地變更
git stash

REM 切換到 cloudflare-pages 分支
git checkout cloudflare-pages

REM 拉取最新代碼
git pull origin cloudflare-pages

REM 複製雲端環境配置
copy .env.cloudflare .env /Y

REM 安裝或更新依賴
npm install

echo.
echo ✅ 已成功切換到 Cloudflare 部署環境
echo 📁 當前分支: cloudflare-pages
echo 🔧 環境配置: .env.cloudflare
echo ☁️ 目標平台: Cloudflare Pages + Workers
echo.
echo 注意：此分支僅用於雲端部署相關開發
echo 核心功能請在 xampp-local 分支開發
echo.
echo 執行 'npm run build' 建置生產版本
pause