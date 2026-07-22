# Function Map

## App

- Section: global app shell, auth state, navigation.
- Calls: `onAuthStateChanged`, `onSnapshot`, `setDoc`, `signInWithPopup`, `signOut`.
- Input: Firebase Auth user state.
- Output: authenticated dashboard, login screen, or username registration screen.

## UsernameGate

- Section: first-login username registration.
- Calls: `runTransaction`.
- Input: typed username and current auth UID.
- Output: updates `users/{uid}.username` and creates `usernames/{username}`.
- Notes: transaction prevents two users from claiming the same lowercase username.

## TokenRequest

- Section: apply for tokens.
- Calls: `uploadBytes`, `getDownloadURL`, `addDoc`, `onSnapshot`.
- Input: token amount and proof image file.
- Output: image saved under `token-proofs/{uid}/...` and a `tokenRequests` document with `status: "pending"`.
- Calls other functions: `RequestList` renders the request status list.

## DrawCard

- Section: Draw Card tab room list and selected room view.
- Calls: `onSnapshot`, `runTransaction`.
- Input: admin-created draw documents, optional `?room=` URL slug, selected room slots, current profile.
- Output: the default Draw Card page shows only the room list. Clicking a room opens that room's stream, number grid, and one-room chat.
- Calls other functions: `RoomList`, `NumberGrid`, `KickEmbed`, `ChatRoom`, `toKickEmbedUrl`.

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
- Calls: `onSnapshot`, `addDoc`.
- Input: current room ID and current user profile.
- Output: reads and writes messages under `draws/{roomId}/messages`, so every room has separate chat.

## MyRecords

- Section: player draw history.
- Calls: `onSnapshot`.
- Input: current user UID.
- Output: list of `drawRecords` belonging to the signed-in user.

## CollectionPage

- Section: player collection.
- Calls: `onSnapshot`.
- Input: current user UID.
- Output: assigned cards filtered from the user's `drawRecords`, including card image and pending/shipping/shipped status.

## AdminPanel

- Section: admin tools.
- Calls: `onSnapshot`, `runTransaction`, `updateDoc`, `deleteRoomWithChildren`.
- Input: admin profile.
- Output: token request approvals, token balance edits through approval transactions, request rejections, room deletion after completion, card library records, and result assignments.
- Calls other functions: `RequestList`, `CreateDrawForm`, `CreateCardForm`, `AssignCardsPanel`.

## CreateDrawForm

- Section: create a new draw room.
- Calls: `writeBatch`.
- Input: room title, room slug, Kick URL, thumbnail image or URL, card count, token cost, and card pool text.
- Output: one `draws/{id}` document plus numbered slot documents from `1` to `cardCount`.

## CreateCardForm

- Section: admin card library.
- Calls: `addDoc`, `updateDoc`, `updateAssignedRecordsForCard`, `imageFileToCompressedDataUrl`.
- Input: card name and uploaded card image, or edited card name and optional replacement image.
- Output: creates or updates one `cards/{id}` document with a compressed image data URL.

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
