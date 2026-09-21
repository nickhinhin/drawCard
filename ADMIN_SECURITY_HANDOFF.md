# LiveDraw 獨立管理系統交接

## 已完成範圍（第 1–7 項）

1. 公開 React 網站不再顯示或掛載管理後台；正式 build 會自動檢查輸出檔沒有管理頁文字。
2. `admin-macos/` 是獨立 macOS SwiftUI 管理 App，包含卡牌、場次、代幣審批、配送、設定及審計頁面。
3. 管理身份使用 Firebase UID 白名單；電郵只作額外核對，不能單靠電郵取得權限。
4. Firebase Auth custom claim `admin: true` 是 Rules 及 Functions 的管理身份來源。
5. 管理寫入改由 callable Cloud Functions 執行，Mac App 不包含 Admin SDK 或服務帳戶密鑰。
6. 所有管理 Functions 強制 Firebase App Check，正式 Mac App 使用 App Attest，Debug 使用 Firebase Debug Provider。
7. 每項 Functions 管理修改會寫入 `adminAuditLogs`；所有客戶端均不能新增、修改或刪除審計紀錄。

按要求未加入：重新驗證／雙人覆核（第 8 項）及自動離職撤權流程（第 9 項）。

## 客人 Firebase account 接手清單

1. 在客人 Firebase project 啟用 Google Sign-In、Firestore、Storage、Functions、App Check。
2. 新增 macOS App，Bundle ID 使用 `com.livedraw.tcg.admin`（如要更改，需同步改 `admin-macos/project.yml`）。
3. 下載 `GoogleService-Info.plist` 放入 `admin-macos/Resources/`；不要提交到 Git。
   同時把 plist 內的 `REVERSED_CLIENT_ID` 填入 `admin-macos/project.yml` 同名設定。
4. 在 Functions runtime 設定：
   - `ADMIN_UID_ALLOWLIST`：指定管理員 Firebase UID，以逗號分隔；留空時系統會 fail closed。
   - `ADMIN_EMAIL_ALLOWLIST`：可選的已驗證 Google 電郵二次核對。
5. 使用客人 project 的 Application Default Credentials，在 `functions/` 執行：
   `ADMIN_UID_ALLOWLIST="uid" npm run grant-admin -- uid admin@example.com`
6. 在 Firebase App Check 登記 macOS App／App Attest。首次 Debug 測試需把 Xcode console 的 debug token 加入 Firebase Console。
7. 先部署 Functions，再部署 Firestore／Storage Rules，最後測試 Mac App。這個 repository 未替任何 account 執行部署。

## 本機驗證及建立

- 公開網站：repository 根目錄執行 `npm run build`。
- Functions：`cd functions && npm install && npm test && npm run lint`。
- Functions runtime 固定為 Node.js 22，以配合目前 Firebase Admin SDK 的安全修正版。
- Mac App：安裝 XcodeGen 後，把客人 plist 放好，再執行 `admin-macos/scripts/create-project.sh`。
- Release：先填客人 Apple Developer Team 與 Keychain notary profile，再執行 `admin-macos/scripts/archive-and-notarize.sh`。

## 安全邊界

- Firestore／Storage Rules 不接受任何管理員客戶端直接寫入；Admin SDK 只存在 Cloud Functions runtime。
- Functions 同時要求 Firebase Auth、`admin` claim、UID allowlist 及有效 App Check token。
- UID allowlist 缺失會拒絕所有管理操作，避免設定漏咗時意外放行。
- 卡牌及場次不提供永久刪除；一般資料以停用／封存保留舊紀錄。只有 promotion code 可由後端永久刪除。
- 圖片由 Function 驗證格式及 6MB 上限後存入 Storage，直接管理上載被 Rules 拒絕。

## Functions 介面

- `adminSession`：驗證管理登入及 App Check。
- `adminList` / `adminGet`：白名單 collection 的受控讀取。
- `adminWrite` / `adminBatchWrite`：受控管理寫入及逐項 audit。
- `adminReviewTokenRequest`：以 Firestore transaction 完成審批、入帳及防重複操作。
- `adminSetShippingStatus`：只接受待安排、配送中、已送到三個狀態。
- `adminUploadImage`：受控圖片上載並記錄 hash、大小及操作者。
