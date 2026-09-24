# LiveDraw 獨立管理系統交接

## 已完成範圍（原定第 1–7 項）

1. 公開 React 網站不再顯示或掛載管理後台；正式 build 會自動檢查輸出檔沒有管理頁文字。
2. 管理後台是獨立網站 `livedraw-adminpage-7e3c2.web.app`（`npm run build:admin`／`npm run deploy:admin`），包含卡牌、場次、代幣審批、配送、設定及審計頁面。原本的 macOS 管理 App 已停用並移除。
3. 管理身份使用 Firebase UID 白名單；電郵只作額外核對，不能單靠電郵取得權限。
4. Firebase Auth custom claim `admin: true` 是 Rules 及 Functions 的管理身份來源。
5. 管理寫入改由 callable Cloud Functions 執行，管理網站不包含 Admin SDK 或服務帳戶密鑰。
6. 會員及管理 Callable 均強制 Firebase App Check；管理 Functions 另外以 Firebase Auth、伺服器 `admin` claim、UID／電郵白名單核對。
7. 每項 Functions 管理修改會寫入 `adminAuditLogs`；所有客戶端均不能新增、修改或刪除審計紀錄。

另外已加入 Affiliate 功能：會員先提交聯絡資料及合作留言，經管理後台批准後，伺服器才建立並啟用唯一連結；首次註冊後推薦關係永久鎖定。管理後台可按日、月、年查看推薦會員的入金、消費、派彩及平台盈虧。

按要求未加入：重新驗證／雙人覆核（第 8 項）及自動離職撤權流程（第 9 項）。

## 客人 Firebase account 接手清單

1. 在客人 Firebase project 啟用 Google Sign-In、Firestore、Storage、Functions、App Check。
2. 建立管理網站的 Hosting site，並把管理網站網域加入 Firebase Auth 授權網域及 reCAPTCHA Enterprise 金鑰的允許網域。
3. （保留編號）不再需要 macOS App 或 `GoogleService-Info.plist`。
4. 在 Functions runtime 設定：
   - `ADMIN_UID_ALLOWLIST`：指定管理員 Firebase UID，以逗號分隔；留空時系統會 fail closed。
   - `ADMIN_EMAIL_ALLOWLIST`：可選的已驗證 Google 電郵二次核對。
5. 使用客人 project 的 Application Default Credentials，在 `functions/` 執行：
   `ADMIN_UID_ALLOWLIST="uid" npm run grant-admin -- uid admin@example.com`
6. 在 Firebase App Check 登記 Web App／reCAPTCHA Enterprise，並向 Functions runtime service account 授予最小角色 `roles/firebaseappcheck.tokenVerifier`；否則有效會員請求亦會顯示 `Unauthenticated`。
7. 部署 `firestore.indexes.json` 內 Affiliate 報表索引；索引完成建立後才測試報表。
8. 先部署 Functions，再部署公開網站及管理網站，最後部署 Firestore／Storage Rules 及索引，並測試管理網站。

## 本機驗證及建立

- 公開網站：repository 根目錄執行 `npm run build`。
- Functions：`cd functions && npm install && npm test && npm run lint`。
- Functions runtime 固定為 Node.js 22，以配合目前 Firebase Admin SDK 的安全修正版。
- 管理網站：`npm run build:admin`（輸出 `dist-admin/`），本機開發用 `npm run dev:admin`。

## 安全邊界

- Firestore／Storage Rules 不接受任何管理員客戶端直接寫入；Admin SDK 只存在 Cloud Functions runtime。
- 管理 Functions 同時要求有效 App Check token、Firebase Auth、`admin` claim、UID allowlist 及可選的已驗證電郵白名單；會員 Functions 同樣強制有效 App Check token。
- UID allowlist 缺失會拒絕所有管理操作，避免設定漏咗時意外放行。
- 卡牌及場次不提供永久刪除；一般資料以停用／封存保留舊紀錄。只有 promotion code 可由後端永久刪除。
- 圖片由 Function 驗證格式及 6MB 上限後存入 Storage，直接管理上載被 Rules 拒絕。
- `affiliateApplications`、`affiliateCodes` 與 `affiliateReferrals` 只可由 Function 寫入。會員不能自行批准申請、建立連結或更改推薦人；只有獲批連結可用於新註冊。

## Functions 介面

- `adminSession`：驗證 Firebase 管理登入、`admin` claim 與伺服器白名單。
- `ensureAffiliateAccount`：原子建立會員，並只接受已批准、仍啟用的推薦碼建立不可變推薦關係。
- `submitAffiliateApplication`：會員提交聯絡資料及留言；重複待審申請會被拒絕。
- `adminAffiliateApplications` / `adminReviewAffiliateApplication`：管理員讀取及批准／拒絕申請；批准時才建立可用推薦碼。
- `adminAffiliateOverview` / `adminAffiliateReport`：讀取推薦人清單及指定時段的推薦報表。
- `adminList` / `adminGet`：白名單 collection 的受控讀取。
- `adminWrite` / `adminBatchWrite`：受控管理寫入及逐項 audit。
- `adminReviewTokenRequest`：以 Firestore transaction 完成審批、入帳及防重複操作。
- `adminSetShippingStatus`：只接受待安排、配送中、已送到三個狀態。
- `adminUploadImage`：受控圖片上載並記錄 hash、大小及操作者。
