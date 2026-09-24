# Draw Card

Firebase-backed React website for live card draws.

## Features

- Google login through Firebase Authentication.
- First-login username setup, changeable anytime from the account panel.
- Token applications with bank proof image upload to Firebase Storage.
- Admin review queue for approving or rejecting token requests.
- Live Kick stream embed per draw.
- Beta administration uses one permanent live hall; dates, rounds, results, and card pools are managed inside that single live stream.
- Admin room creation with separate room link, title, thumbnail, Kick URL, and 4 to 100 card slots.
- Per-room chat room for signed-in users.
- Admin card library with browser-compressed card images and independent 1/2, 1/5, and 1/10 prices.
- Admin result assignment from purchased number records to specific cards.
- Transactional card number purchase that deducts tokens and locks the number.
- Player history, collection status, and admin draw status tracking in Firestore.

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Optional: copy `.env.example` to `.env.local` and change Firebase values if the project changes.

3. Run the app.

   ```bash
   npm run dev
   ```

4. Open the local URL shown by Vite.

## Firebase setup

Enable these Firebase products in project `livedraw-7e3c2`:

- Authentication: enable Google provider.
- Firestore Database: native mode.
- Storage: create the default bucket.
- Hosting: optional, if deploying with Firebase Hosting.

Deploy rules after installing and logging in to the Firebase CLI:

```bash
firebase deploy --only firestore:rules,storage
```

Build and deploy hosting:

```bash
npm run build
firebase deploy --only hosting
```

## First admin

Administration is available only on the separate admin website
(https://livedraw-adminpage-7e3c2.web.app, built with `npm run build:admin` and
deployed with `npm run deploy:admin`). Follow `ADMIN_SECURITY_HANDOFF.md` to configure
the UID allowlist, Firebase custom claim and App Check. The public website build does
not contain any administration code (`scripts/assert-no-web-admin.mjs` enforces this).

## Data model

- `users/{uid}`: profile, display username, token balance, role. Auth `uid` is the only identity.
- `usernames/{lowercaseUsername}`: unique username reservation owned by one uid. Changing username claims the new key and deletes the old reservation in one transaction.
- Username is 3–24 characters, unique case-insensitively. Slots, chat, and draw records store a username snapshot at write time.
- `tokenRequests/{id}`: requested token amount, proof image URL, review status.
- `draws/{id}`: room title, slug, room link, thumbnail, Kick URL, card count, token price, pool info, status.
- `draws/{id}/slots/{number}`: card slot availability and buyer info (`uid` + username snapshot).
- `draws/{id}/messages/{messageId}`: room chat messages from signed-in users.
- `cards/{id}`: admin-created card name, compressed image, conversion value, and `modePrices` for 1/2, 1/5, and 1/10 play.
- `drawRecords/{id}`: purchase record plus admin-assigned card result and collection status.

## Admin flow

1. Create draw rooms in Admin. The Draw Card page shows a room list for players.
2. Create cards in the Card library. Uploaded images are compressed to WebP in the browser and saved as temporary data URLs until Firebase Storage is ready.
3. After users buy numbers, use Result assignment to pick the card for each user/round/number and set status to Pending, Shipping, or Shipped.
4. When a room is finished, click Complete & delete. The room, number slots, and room chat are removed; purchase records stay for assignment and user history.
5. Users see assigned cards in the Collection tab.
