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
