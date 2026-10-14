# 後台發布與來源交付

正式 Pages：`sheet-order-dashboard-main`，正式分支：`main`，API binding：`sheet-order-api`。
測試 Pages：`lopokao-dashboard-staging-20261002`，正式分支：`staging`，API binding：`sheet-order-api-staging-20261002`。
兩者的 service binding environment 都是 `production`，但服務名稱不同；不可交換。

使用 Node 22（至少 22.19），在本專案根目錄執行；禁止在 `sheet-order-api` 目錄發布 Pages。

## 檢查與建置

```powershell
npm ci
npm ci --prefix sheet-order-api
npm run lint
npm run type-check
npm run test:run
npm run test:release
$env:VITE_ENVIRONMENT = 'production'
node scripts/pages-release.mjs build production
npm run release:preflight
```

`lint` 檢查前端、Pages Functions 與發布工具；Worker 套件以自己的型別與安全測試檢查。`lint:all` 保留原本跨套件 lint，尚有 Worker 歷史 lint 債務，不假稱已通過。

建置雜湊檔只在本機或 CI artifact 保存，不提交 Git。工具會先產生全新建置再記錄雜湊，並檢查建置期間來源沒有改動；不提供直接替舊產物補蓋雜湊的 CLI。任何來源或 dist 改動都需要重新檢查與建置。
正式與測試產物不得互用，使用 `VITE_ENVIRONMENT`，不把金鑰或客戶資料寫入 `.env` 或 CI 前端變數。

## 發布

先整理為乾淨的交付 checkout，並沿用本次工作的正式發布授權。發布會更動正式網站，不是唯讀檢查。

```powershell
npm run release:production
```

工具先確認 Functions、來源與建置雜湊、專案／分支／服務；固定從專案根目錄呼叫 Wrangler。
完成後檢查新部署 ID、分支、success、`uses_functions=true` 與 API binding。若核對失敗，工具回非零並保留錯誤；不要宣告成功或盲目重試。先查最新部署，再決定是否使用上一個已驗證部署復原。

本機沿用已登入的 Wrangler OAuth；CI 使用環境中既有的 `CLOUDFLARE_API_TOKEN`，不可把權杖提交 Git。
OAuth 過期時先由使用者完成 `wrangler login`。TLS 使用系統信任鏈，不停用憑證驗證。

測試發布以 `VITE_ENVIRONMENT=staging` 執行 `node scripts/pages-release.mjs build staging`，再執行 `npm run release:staging`。

## CI

PR 只跑檢查與建置，不讀部署 secret、不發布。main／develop 通過相同檢查後，分別發布正式／隔離測試 Pages。
GitHub 的 production／staging environment 需各自設定既有 Cloudflare token；未設定會失敗，不使用其他帳號或公開 API 替代。
在遠端套用這份 workflow 前，需先交付完整且已驗證的來源，不能只推 workflow 而留著近期修復未追蹤。
