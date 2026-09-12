c
## 人工審核活動碼（後續調整）

依用戶確認，恢復「付款證明或活動碼擇一」申請。兩種方式都必須經管理員審核，活動碼不會自動驗證或自動入帳。批准活動碼時須確認有效性、使用資格及使用紀錄；代幣仍須符合受保護的套餐數量。活動碼獎勵不計入 VIP 入金。正式版的 FPS 欄位僅在提供付款證明時必填。

## Beta function corrections — 2026-09-05

- Admin room finance now calculates payout from each awarded card's conversion value (`cardConversionValue`), so gross profit is spend minus actual redeemable liability.
- Home and full history retain and label the original target card. Completed history shows the awarded result alongside “原本想抽”.
- The token balance in the header is a button that opens the token application page.
- Room management has a persistent status selector for upcoming, live, and completed states.
- Kick setup accepts only a channel handle (letters, numbers, `_`, `-`). Existing rendering also validates that legacy URLs use an official Kick hostname. The player provides a fullscreen control; users then press the Kick player speaker to enable audio, as cross-origin/browser autoplay rules prevent the site from forcing audio.
- SF pickup opens the official SF Hong Kong service-point finder and asks the player to paste the selected point code and full address into the request.

Validation: production and Beta builds and lint pass. The isolated Firestore security suite passes 41/41. Phone (390px), tablet (768px), and desktop (1440px) layouts have no horizontal document overflow; target-card labels, token navigation, and the fullscreen control were exercised in the local Beta demo.

## Removed — 2026-09-05

The administrator direct token adjustment feature, its UI, Firestore permissions, and audit tests were removed at the user’s request. User token balances can no longer be changed through that tool.
