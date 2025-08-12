@echo off
echo ==========================================
echo 切換到 XAMPP 本地開發環境
echo ==========================================

REM 切換到 xampp-local 分支
git checkout xampp-local

REM 拉取最新代碼
git pull origin xampp-local

REM 複製本地環境配置
copy .env.xampp .env /Y

REM 安裝或更新依賴
npm install

echo.
echo ✅ 已成功切換到 XAMPP 本地開發環境
echo 📁 當前分支: xampp-local
echo 🔧 環境配置: .env.xampp
echo 🌐 API 地址: http://localhost/sheet-order-dashboard-main/api
echo.
echo 可以開始本地開發了！
echo 執行 'npm run dev' 啟動開發伺服器
pause