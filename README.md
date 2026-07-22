# Draw Card

Firebase-backed React website for live card draws.

## Features

- Google login through Firebase Authentication.
- First-login username registration.
- Token applications with bank proof image upload to Firebase Storage.
- Admin review queue for approving or rejecting token requests.
- Live Kick stream embed per draw.
- Admin room creation with separate room link, title, thumbnail, Kick URL, and 4 to 100 card slots.
- Per-room chat room for signed-in users.
- Admin card library with browser-compressed card images.
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

Enable these Firebase products in project `drawcard-26e01`:

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

The app creates all new users with `role: "user"` and `tokens: 0`. To create the first admin, sign in once, then edit the user document in Firestore:

- Collection: `users`
- Document ID: the Firebase Auth UID
- Field: `role`
- Value: `admin`

After that, admin users can approve token requests, create rooms, and complete/delete draw rooms from the website. Admin roles must still be edited manually in Firebase Firestore.

## Data model

- `users/{uid}`: profile, username, token balance, role.
- `usernames/{username}`: username reservation.
- `tokenRequests/{id}`: requested token amount, proof image URL, review status.
- `draws/{id}`: room title, slug, room link, thumbnail, Kick URL, card count, token price, pool info, status.
- `draws/{id}/slots/{number}`: card slot availability and buyer info.
- `draws/{id}/messages/{messageId}`: room chat messages from signed-in users.
- `cards/{id}`: admin-created card name and compressed image.
- `drawRecords/{id}`: purchase record plus admin-assigned card result and collection status.

## Admin flow

1. Create draw rooms in Admin. The Draw Card page shows a room list for players.
2. Create cards in the Card library. Uploaded images are compressed to WebP in the browser and saved as temporary data URLs until Firebase Storage is ready.
3. After users buy numbers, use Result assignment to pick the card for each user/round/number and set status to Pending, Shipping, or Shipped.
4. When a room is finished, click Complete & delete. The room, number slots, and room chat are removed; purchase records stay for assignment and user history.
5. Users see assigned cards in the Collection tab.
