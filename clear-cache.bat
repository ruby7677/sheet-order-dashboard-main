@echo off
echo 正在清理 Vite 快取和依賴...

REM 刪除 node_modules/.vite 快取
if exist "node_modules\.vite" (
    echo 刪除 Vite 快取目錄...
    rmdir /s /q "node_modules\.vite"
)

REM 刪除 dist 目錄
if exist "dist" (
    echo 刪除 dist 目錄...
    rmdir /s /q "dist"
)

REM 刪除瀏覽器快取相關的臨時文件
if exist ".vite" (
    echo 刪除 .vite 目錄...
    rmdir /s /q ".vite"
)

echo 快取清理完成！
echo 現在可以執行 npm run dev 重新啟動開發服務器
pause