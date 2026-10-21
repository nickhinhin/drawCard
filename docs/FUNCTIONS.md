# Function Map

## LoadingScreen

- Section: full-app authentication startup.
- Calls: none.
- Input: authentication readiness state.
- Output: full-screen animated loading indicator until the account state is known.

## InlineLoading

- Section: database-backed room, card, number, chat, record, collection, request, shipping, and admin lists.
- Calls: none.
- Input: a short label describing the data currently being fetched.
- Output: accessible animated loading feedback. Confirmed Firestore data is kept across reloads, so repeat visits can render from local cache immediately; an empty cache keeps loading until the server confirms whether data exists.

## App

- Section: global app shell, auth state, navigation.
- Calls: `onAuthStateChanged`, `onSnapshot`, `setDoc`, `signInWithPopup`, `signOut`.
- Input: Firebase Auth user state.
- Output: authenticated dashboard, login screen, or username registration screen.

## UsernameGate

- Section: first-login username setup (also shown if the current name is claimed by someone else).
- Calls: `runTransaction`.
- Input: typed username and current auth UID.
- Output: updates `users/{uid}.username` and creates `usernames/{lowercaseUsername}`.
- Notes: transaction enforces uniqueness. Auth uid remains the identity.

## AccountPanel username edit

- Section: change username anytime.
- Calls: `runTransaction`.
- Input: new username, current username, and auth UID.
- Output: claims `usernames/{new}`, deletes owned `usernames/{old}`, updates profile.
- Notes: rules require the profile username after the transaction to match the claimed reservation.

## TokenRequest

- Section: VIP progress, package selection, bonus breakdown, and token application.
- Calls: `uploadBytes`, `getDownloadURL`, `addDoc`, `onSnapshot`.
- Input: package/custom HKD amount, token amount, proof image, approved request history, and VIP settings.
- Output: image saved under `token-proofs/{uid}/...` and a `tokenRequests` document with `status: "pending"`.
- Calls other functions: `VipProgramPanel`, `useVipProgram`, `getVipState`, and `RequestList`.

## VipProgramPanel

- Section: player VIP progress on the token request page.
- Calls: `getVipState`.
- Input: cumulative approved HKD deposits and ordered VIP tiers.
- Output: current level, next-level amount, progress rails, and the reward card for each level.

## VipProgramManager

- Section: admin VIP configuration tab.
- Calls: `setDoc` and `normalizeVipTiers`.
- Input: VIP deposit thresholds plus one reward card selected from the card library for each tier.
- Output: saves `settings/vipProgram`; new tiers are used immediately by the player page and token approval flow.

## DrawCard

- Section: Draw Card tab room list and selected room view.
- Calls: `onSnapshot`, `runTransaction`.
- Input: admin-created draw documents, optional `?room=` URL slug, selected room slots, current profile.
- Output: the default Draw Card page shows only the room list. The Beta single-hall view places the stream and compact Live Chat side by side, removes the old metadata pills, and keeps a date-grouped round strip directly below them before the card or number step.
- Calls other functions: `RoomList`, `RoomRoundOverview`, `NumberGrid`, `KickEmbed`, `ChatRoom`, `toKickEmbedUrl`.

## RoomRoundOverview

- Section: persistent Beta live-hall round navigation.
- Calls: `getRoundsByDate`, `getRoundDisplayStatus`, `getRoomShareMode`, and `formatRoundSchedule`.
- Input: active room, active round, and all room rounds.
- Output: horizontally scrollable date tabs and round cards showing status, odds, and scheduled time; selecting a completed/current round opens its number and result view.

## RoomList

- Section: room list.
- Calls: no Firebase APIs directly.
- Input: admin-created draw room list from `DrawCard`.
- Output: room cards with thumbnail, title, card count, token cost, and status. Clicking a card opens that room.

## NumberGrid

- Section: selected room number purchase.
- Calls: no Firebase APIs directly.
- Input: selected room, slot list, current buying number, and purchase callback.
- Output: available number buttons and locked username cells.

## KickEmbed

- Section: selected room stream viewer.
- Calls: `toKickEmbedUrl`.
- Input: Kick channel URL, for example `https://kick.com/channel-name`.
- Output: Kick player iframe URL, for example `https://player.kick.com/channel-name`.

## ChatRoom

- Section: selected room chat.
- Calls: `onSnapshot`, `runTransaction`.
- Input: current room ID and current user profile.
- Output: reads and writes room messages while atomically enforcing the three-second user cooldown.

## MyRecords

- Section: player draw history.
- Calls: `onSnapshot`.
- Input: current user UID.
- Output: list of `drawRecords` belonging to the signed-in user.

## CollectionPage

- Section: player collection.
- Calls: `onSnapshot`.
- Input: current user UID.
- Output: assigned and VIP reward cards, including image, delivery status, and the exact admin-configured token conversion value. The delivery dialog includes an in-app SF Store finder with territory and district menus, plus search by street, building name, or point code; it writes the selected point into the existing shipping address field.

## BetaPsaCarousel

- Section: Beta homepage PSA 10 card carousel.
- Calls: `getRoomPoolIds`, `normalizeRoomCards`, and the parent room-opening callback.
- Input: public showcase cards, the current room list, and `onOpenRoom`.
- Output: an animated, keyboard-accessible card row. Clicking a card opens the newest live room containing that card; when no matching pool exists it opens the newest live room, and when no room is live it shows a clear message.

## RoomRecordsDrawer

- Section: collapsible left-side record drawer inside Beta live rooms.
- Calls: `onSnapshot`, `TokenAmount`, `formatRoundLabel`, and `getResultSideLabel`.
- Input: current player profile and live-room ID.
- Output: the player's latest 20 draw records with target card, room, round, number, token cost, result, and current-room marker. It subscribes only while open, overlays the room on mobile, and closes from its button, backdrop, or Escape key.

## BlindBoxPurchaseModal

- Section: live-room number purchase confirmation and progress display.
- Calls: the supplied confirm and cancel callbacks, `TokenAmount`, and `formatRoundLabel`.
- Input: immutable room, round, target-card, number, and token-cost details captured when the player presses the payment bar.
- Output: a review screen titled「確認生成盲盒」with a clear heaven/hell explanation and the room's published odds, a payment-safe generating animation, and a completion screen. `1/2`, `1/5`, and `1/10` display heaven odds of 50%, 20%, and 10% respectively, with the complementary hell odds. The generating state cannot be dismissed and the purchase handler uses an in-flight guard to prevent repeat submission.

## AdminBlindBoxConfirmModal

- Section: administrator draw-result confirmation.
- Calls: the supplied assignment callback, `TokenAmount`, `formatRoundLabel`, and `getResultSideLabel`.
- Input: one draw record plus the selected actual card, heaven/hell result, and collection status.
- Output: a complete「確認生成盲盒」review page before the permanent result write. The underlying record list remains compact so more pending records fit on one screen.

## NumberGrid

- Section: live-room round and number selection panel.
- Calls: `getRoomCurrentRound`, `isRoundBuyingBlocked`, `formatRoundSchedule`, and the supplied purchase callback.
- Input: room, selected round and card, live slot records, player profile, and the back-to-card-selection callback.
- Output: a date bar and dedicated round list with each round's independent 1/2, 1/5, or 1/10 odds, schedule, and explicit「直播中／已結束／即將開」status. Players can browse number occupancy without selecting a card, review read-only past dates and rounds, and open the administrator's official result image beneath a completed round. On mobile the date and round controls remain horizontally scrollable.

## SF_PICKUP_POINTS

- Section: in-app SF Store finder data.
- Calls: none.
- Input: bundled SF Hong Kong official 2026 store list; locations marked as send-only or unavailable for pickup are excluded.
- Output: 139 selectable pickup points with region, district, point code, store name, and full address. Filtering stays inside the browser and does not send the player's search to another website.

## AdminPanel

- Section: admin tools.
- Calls: `onSnapshot`, `runTransaction`, `updateDoc`, `deleteRoomWithChildren`.
- Input: admin profile.
- Output: token request approvals, VIP deposit/level updates, automatic VIP reward-card records, request rejections, room deletion, card library records, and result assignments. Room and card data load first; full request and purchase/delivery histories only subscribe while their section is open. A small filtered listener keeps the pending-delivery badge current. Delivery requests use a compact text list without card images so more records fit on screen. Clicking a player opens a wide audit view with every deposit request and draw record for that UID, including an in-app payment-proof image preview. It compares approved HKD deposits with draw spend and card conversion-value payouts, shows platform profit/loss, and verifies the stored UID, username, room, round, number, payment, target card, and target value against the protected room-slot record.

## SingleLiveManagement

- Section: Beta administrator's single permanent live hall.
- Calls: `updateDoc`, `RoomRoundSettings`, `RoomPoolEditor`, and `CreateDrawForm` only when no live document exists yet.
- Input: the newest draw document, card library, and administrator profile.
- Output: one「直播管理」workspace for the live name, Kick channel, broadcast status, purchase lock, dates, rounds, result images, and card pool. Legacy draw documents remain untouched for historical records and are not shown as separate rooms.
- Calls other functions: `RequestList`, `CreateDrawForm`, `CreateCardForm`, `AssignCardsPanel`.

## CreateDrawForm

- Section: create a new draw room.
- Calls: `writeBatch`.
- Input: room title, room slug, Kick URL, thumbnail image or URL, card count, token cost, and card pool text.
- Output: one `draws/{id}` document plus numbered slot documents from `1` to `cardCount`.

## CreateCardForm

- Section: admin card library.
- Calls: `addDoc`, `updateDoc`, `updateAssignedRecordsForCard`, `imageFileToCompressedDataUrl`.
- Input: card name, category, separate draw values for 1/2, 1/5, and 1/10 rooms, player conversion value, and uploaded/replacement image.
- Output: creates or updates one `cards/{id}` document with `modePrices`, keeps the legacy `tokenValue` equal to the 1/2 value, and propagates the price map to room card snapshots.

## AssignCardsPanel

- Section: admin result assignment.
- Calls: `updateDoc`.
- Input: draw purchase record, selected card, and collection status.
- Output: updates `drawRecords/{id}` with `cardId`, `cardName`, `cardImageUrl`, assignment metadata, and pending/shipping/shipped status.

## imageFileToCompressedDataUrl

- Section: shared browser image compression.
- Calls: `FileReader`, `Image`, `canvas.toDataURL`.
- Input: image file and compression settings.
- Output: compressed WebP data URL for thumbnails or card images.

## deleteRoomWithChildren

- Section: admin room completion cleanup.
- Calls: `getDocs`, `writeBatch`.
- Input: draw room ID.
- Output: deletes the room document plus that room's slot and chat subcollection documents. It does not delete `drawRecords`.

## updateAssignedRecordsForCard

- Section: card library edit propagation.
- Calls: `getDocs`, `writeBatch`.
- Input: card ID and updated card fields.
- Output: updates existing `drawRecords` assigned to that card so user collection pages show the latest card name and image.

## RequestList

- Section: token request display for users and admins.
- Calls: none directly.
- Input: request array, admin mode flag, approve/reject callbacks.
- Output: request cards with proof links and review buttons when admin mode is active.

## formatDate

- Section: shared date display.
- Calls: `Intl.DateTimeFormat`.
- Input: Firestore `Timestamp` or date value.
- Output: short month/day/time label.

### 直播購買：`purchaseLiveNumber` / `purchaseLiveSlot`

- 呼叫位置：玩家直播頁 `confirmBlindBoxPurchase`。確認視窗建立時產生 `requestId`；網絡結果不明時保留原視窗和識別碼，重按確認不會再次扣款。
- 輸入：`requestId`, `drawId`, `roundId`, `number`, `cardId`, `shareMode`, `tokenCost`（玩家確認的價格）。身份只取 Firebase Auth，前端不可指定其他會員付款。
- 流程：`purchaseLiveNumber` 呼叫 `purchaseLiveSlot(db, request)`，交易內讀取收據、會員、房間、場次、號碼、卡牌及名稱佔用資料，再一次寫入扣款、鎖號和抽卡紀錄。名稱未被佔用時在同一交易補回，避免舊帳戶缺少名稱索引而購買失敗。
- 輸出：`{ ok: true, recordId }`。相同會員及 requestId 重送會回傳原收據；不能用原識別碼更改號碼、卡牌、玩法或金額。不同會員不共用識別碼。
- 價格：三種玩法一律採用卡牌庫 `modePrices`（舊卡回退 `tokenValue`）。房間 `poolCardValues` 只作顯示副本，不參與價格授權。金額或玩法改變會拒絕並要求重新確認，不會靜默加價。
- 最新資料：玩家名稱、推薦人、房名和圖片一律由交易當下的伺服器資料建立，避免舊頁面資料引起「權限不足」。停購、售出、餘額不足、卡牌下架都有業務訊息。
- 安全：Firestore 規則亦統一驗證卡牌庫價格，繼續檢查身份、餘額、號碼和完整扣款。舊版頁面的卡牌庫價格提交亦相容；新版本透過伺服器交易處理。
- 驗證：`scripts/verify-live-purchase.mjs` 使用 Auth / Firestore / Functions 模擬器，測試重送、搶號、價格不一致、舊玩法、預購、停購、過期場次、餘額及資料一致性，已納入 `npm run test:security`。
- 發佈順序：先部署購買、管理寫入及同步相關 Functions，再部署 Firestore 規則及玩家／管理網站；不能只發網站。此流程不涵蓋自助抽卡 `instantDraw`。


### 價格同步：`price-sync.js`

- `canonicalPrices(card)`：由卡牌庫輸入取得三種玩法價格；供公開副本同步使用。
- `copyPricePatch(copy, card)`：逐玩法比較副本與卡牌庫，只回傳需更新的價格欄位；一致則回傳 null。
- `roomPricePatch(room, cards)`：輸入房間與卡牌 Map，僅修復 live/scheduled/draft 的價格副本，保留卡牌順序及其他資料；completed/cancelled 不改。
- `syncRoomPrices(db, ref, dryRun)`：交易內讀取最新房間和卡牌，呼叫 `roomPricePatch`；dryRun 只回傳差異數，不寫入。交易重試避免延遲事件覆蓋新價格。
- `syncCardPrices(db, cardId, options)`：修復 publicCardShowcase 和 instantDraw 指定卡牌價格，可選擇同步相關未完結房間。保留其他卡牌、排序、暫停旗標和設定。
- `syncAllPrices(db, dryRun)`：全面掃描未完結房間和公開副本，即使卡牌庫價格沒有再變，仍會修復舊差異。`adminRecalculateCardPrices` 完成重算後必定呼叫。
- `syncAdminPriceWrites(db, operations)`：`adminWrite`、`adminBatchWrite` 寫入後呼叫。舊管理頁面寫入舊副本時，回傳成功前重新按卡牌庫校正。
- `auditCards`、`auditDraws`：相關價格／卡池變更後呼叫同步。使用原本的 retryable triggers，讀取最新文件而非事件中的舊值；不另新增背景排程。
- 管理網站重算改由 `adminRecalculateCardPrices` 處理，移除瀏覽器另一套重算及整份房間副本覆寫流程。
- 驗證：`npm run test:purchase-incident` 涵蓋未變卡價的副本修復、歷史資料保留及 93 張歷史卡牌的 canonical-price 購買；Functions 單元測試及 callable/security 流程亦覆蓋舊管理頁面、重試、搶號與防止少付。
