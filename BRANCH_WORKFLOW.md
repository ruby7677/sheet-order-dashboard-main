# 分支工作流程指南

## 分支架構

```
main (主分支 - 穩定版本)
├── xampp-local (本地 XAMPP 開發分支)
│   ├── feature/feature-name-xampp
│   └── hotfix/bug-fix-xampp
└── cloudflare-pages (Cloudflare 部署分支)
    ├── feature/feature-name-cf
    └── hotfix/deployment-fix-cf
```

## 分支用途說明

### xampp-local 分支
- **主要開發分支**：日常功能開發在此進行
- **環境**：本地 XAMPP (Apache + PHP + MySQL)
- **配置文件**：`.env.xampp`
- **適用於**：
  - 新功能開發
  - Bug 修復
  - 業務邏輯調整
  - UI/UX 改進

### cloudflare-pages 分支
- **部署專用分支**：僅用於 Cloudflare 部署
- **環境**：Cloudflare Pages + Workers
- **配置文件**：`.env.cloudflare`
- **適用於**：
  - 雲端環境專用功能
  - Workers 腳本
  - 部署配置調整
  - 雲端API適配

### main 分支
- **穩定版本分支**：經過測試的穩定代碼
- **用途**：作為 xampp-local 和 cloudflare-pages 的合併基準

## 工作流程

### 日常開發流程

#### 1. 本地功能開發
```bash
# 切換到本地開發分支
git checkout xampp-local

# 拉取最新代碼
git pull origin xampp-local

# 建立功能分支 (可選)
git checkout -b feature/new-order-feature

# 開發功能...
# 使用 .env.xampp 配置

# 提交變更
git add .
git commit -m "feat: 新增訂單批量處理功能"

# 推送到遠端
git push origin feature/new-order-feature
# 或直接推送到 xampp-local
git checkout xampp-local
git merge feature/new-order-feature
git push origin xampp-local
```

#### 2. 穩定版本合併
```bash
# 功能開發完成且測試通過後
git checkout main
git pull origin main
git merge xampp-local
git push origin main
```

#### 3. 雲端部署準備
```bash
# 將穩定功能移植到雲端分支
git checkout cloudflare-pages
git pull origin cloudflare-pages

# 選擇性合併 (推薦)
git cherry-pick <commit-hash>

# 或整批合併 (需處理衝突)
git merge main

# 調整雲端專用配置
# 使用 .env.cloudflare 配置

# 測試雲端部署
npm run build

# 推送到雲端分支
git push origin cloudflare-pages
```

### 緊急修復流程

#### 本地環境修復
```bash
git checkout xampp-local
git checkout -b hotfix/critical-bug-fix
# 修復問題...
git commit -m "fix: 修復訂單狀態更新問題"
git checkout xampp-local
git merge hotfix/critical-bug-fix
git push origin xampp-local
```

#### 雲端環境修復
```bash
git checkout cloudflare-pages
git checkout -b hotfix/deployment-issue
# 修復雲端特有問題...
git commit -m "fix: 修復 Cloudflare Workers 部署問題"
git checkout cloudflare-pages
git merge hotfix/deployment-issue
git push origin cloudflare-pages
```

## 分支切換指令

### 切換到本地開發
```bash
git checkout xampp-local
# 複製本地環境配置
cp .env.xampp .env
echo "已切換到本地 XAMPP 開發環境"
```

### 切換到雲端部署
```bash
git checkout cloudflare-pages
# 複製雲端環境配置
cp .env.cloudflare .env
echo "已切換到 Cloudflare 部署環境"
```

## 環境配置管理

### .env.xampp (本地配置)
- API_BASE_URL: `http://localhost/sheet-order-dashboard-main/api`
- 啟用調試日誌
- 使用本地快取機制
- PHP API 後端

### .env.cloudflare (雲端配置)
- API_BASE_URL: `https://your-domain.pages.dev/api`
- 關閉調試日誌
- 使用 Cloudflare KV 快取
- Workers API 後端

## 注意事項

### ⚠️ 重要規則

1. **禁止直接修改 main 分支**
   - main 分支僅接受來自 xampp-local 的合併

2. **環境配置分離**
   - 切換分支時務必更新對應的 .env 文件
   - 不要將環境特定配置提交到錯誤分支

3. **功能移植原則**
   - 核心業務邏輯在 xampp-local 開發
   - 雲端特定功能在 cloudflare-pages 開發
   - 使用 cherry-pick 精確移植功能

4. **衝突處理**
   - 合併前務必解決所有衝突
   - 優先保留對應環境的配置

### 🚫 避免的操作

- 不要在 cloudflare-pages 分支開發核心功能
- 不要將本地環境配置推送到雲端分支
- 不要直接從 cloudflare-pages 合併到 main

### ✅ 推薦做法

- 定期同步分支（每天或每次功能完成後）
- 使用功能分支進行大型功能開發
- 保持分支間配置文件的獨立性
- 建立自動化測試確保分支穩定性

## 快速指令

### 分支狀態檢查
```bash
# 檢查當前分支
git branch -v

# 檢查遠端分支
git branch -r

# 檢查分支差異
git diff xampp-local..cloudflare-pages
```

### 清理與重置
```bash
# 清理未追蹤文件
git clean -fd

# 重置到遠端狀態
git reset --hard origin/<branch-name>

# 清理本地分支
git branch -d <branch-name>
```

---

**維護者**: 開發團隊  
**最後更新**: 2025-08-12  
**版本**: v1.0  

遵循此工作流程可確保本地 XAMPP 版本與 Cloudflare 版本的清楚分離，避免開發混亂。