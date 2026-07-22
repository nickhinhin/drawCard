import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Boxes,
  Check,
  CircleUserRound,
  Clock3,
  Copy,
  CopyCheck,
  CreditCard,
  ExternalLink,
  FileImage,
  Gavel,
  ImagePlus,
  ListChecks,
  LogIn,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  Send,
  Ticket,
  Truck,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, googleProvider, storage } from "./firebase";

const DEFAULT_DRAW = {
  title: "Tonight Live Card Draw",
  slug: "tonight-live-draw",
  kickUrl: "https://kick.com/",
  cardCount: 30,
  tokenCost: 10,
  status: "live",
  poolText: "",
  thumbnailUrl: "",
};

const statusLabels = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  live: "Live",
  completed: "Completed",
  draft: "Draft",
  shipping: "Shipping",
  shipped: "Shipped",
};

const collectionStatuses = ["pending", "shipping", "shipped"];

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 24);
}

function usernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

async function saveProfileUsername(uid, rawUsername, currentUsername = "") {
  const cleanUsername = normalizeUsername(rawUsername);
  const newKey = usernameKey(cleanUsername);
  const oldKey = usernameKey(currentUsername);

  if (cleanUsername.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  await runTransaction(db, async (transaction) => {
    const profileRef = doc(db, "users", uid);
    const newRef = doc(db, "usernames", newKey);
    const newSnap = await transaction.get(newRef);

    const oldRef = oldKey && oldKey !== newKey ? doc(db, "usernames", oldKey) : null;
    const oldSnap = oldRef ? await transaction.get(oldRef) : null;

    if (newSnap.exists() && newSnap.data()?.uid !== uid) {
      throw new Error("This username is already taken.");
    }

    // Profile must move to the claimed name in the same transaction (rules enforce this).
    transaction.update(profileRef, {
      username: cleanUsername,
      updatedAt: serverTimestamp(),
    });

    if (!newSnap.exists()) {
      transaction.set(newRef, {
        uid,
        username: cleanUsername,
        createdAt: serverTimestamp(),
      });
    } else if (newSnap.data()?.username !== cleanUsername) {
      transaction.update(newRef, {
        username: cleanUsername,
      });
    }

    if (oldSnap?.exists() && oldSnap.data()?.uid === uid) {
      transaction.delete(oldRef);
    }
  });

  return cleanUsername;
}

/** For users who already have a profile username but no reservation doc yet. */
async function ensureUsernameClaim(uid, username) {
  const cleanUsername = normalizeUsername(username);
  const key = usernameKey(cleanUsername);
  if (cleanUsername.length < 3) return;

  await runTransaction(db, async (transaction) => {
    const profileRef = doc(db, "users", uid);
    const claimRef = doc(db, "usernames", key);
    const claimSnap = await transaction.get(claimRef);

    if (claimSnap.exists()) {
      if (claimSnap.data()?.uid !== uid) {
        throw new Error("This username is already taken. Please choose a new one.");
      }
      return;
    }

    // Touch profile so afterUserDoc matches the claimed key (required by rules).
    transaction.update(profileRef, {
      username: cleanUsername,
      updatedAt: serverTimestamp(),
    });
    transaction.set(claimRef, {
      uid,
      username: cleanUsername,
      createdAt: serverTimestamp(),
    });
  });
}

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("draw");
  const [usernameConflict, setUsernameConflict] = useState(false);

  useEffect(() => {
    const authTimer = window.setTimeout(() => {
      setAuthReady(true);
      setAuthError("Login took too long to initialize. Refresh and try again.");
    }, 6000);

    const stopAuth = onAuthStateChanged(
      auth,
      (user) => {
        window.clearTimeout(authTimer);
        setAuthUser(user);
        setAuthReady(true);
      },
      (error) => {
        window.clearTimeout(authTimer);
        setAuthError(error.message);
        setAuthReady(true);
      },
    );

    return () => {
      window.clearTimeout(authTimer);
      stopAuth();
    };
  }, []);

  useEffect(() => {
    getRedirectResult(auth)
      .catch((error) => {
        if (error?.code !== "auth/no-auth-event") {
          setAuthError(error.message);
        }
      })
      .finally(() => setSigningIn(false));
  }, []);

  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      return undefined;
    }

    const profileRef = doc(db, "users", authUser.uid);
    const stopProfile = onSnapshot(profileRef, async (snapshot) => {
      if (snapshot.exists()) {
        setProfile({ id: snapshot.id, ...snapshot.data() });
        return;
      }

      await setDoc(profileRef, {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName || "",
        photoURL: authUser.photoURL || "",
        username: "",
        tokens: 0,
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return stopProfile;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !profile?.username) {
      setUsernameConflict(false);
      return undefined;
    }

    let cancelled = false;

    ensureUsernameClaim(authUser.uid, profile.username)
      .then(() => {
        if (!cancelled) setUsernameConflict(false);
      })
      .catch(() => {
        if (!cancelled) setUsernameConflict(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser, profile?.username]);

  const isAdmin = profile?.role === "admin";
  const needsUsername = Boolean(
    authUser && profile && (!profile.username || usernameConflict),
  );

  const tabs = useMemo(
    () => [
      { id: "draw", label: "Draw Card", icon: Gavel },
      { id: "tokens", label: "Apply Token", icon: BadgeDollarSign },
      { id: "history", label: "My Records", icon: ListChecks },
      { id: "collection", label: "Collection", icon: Boxes },
      ...(isAdmin ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
    ],
    [isAdmin],
  );

  async function handleLogin() {
    setAuthError("");
    setSigningIn(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const popupFallbackCodes = new Set([
        "auth/popup-blocked",
        "auth/popup-closed-by-user",
        "auth/operation-not-supported-in-this-environment",
      ]);

      if (popupFallbackCodes.has(error?.code)) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setAuthError(redirectError.message);
        }
      } else if (error?.code === "auth/cancelled-popup-request") {
        setAuthError("The previous Google login popup was cancelled. Please try again.");
      } else {
        setAuthError(error.message);
      }

      setSigningIn(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setActiveTab("draw");
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Draw Card home">
          <img src="/icon.svg" alt="" />
          <span>Draw Card</span>
        </a>

        <button
          className="icon-btn menu-toggle"
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav className={mobileOpen ? "nav nav-open" : "nav"}>
          {authUser &&
            tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  className={activeTab === tab.id ? "nav-item active" : "nav-item"}
                  type="button"
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileOpen(false);
                  }}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
        </nav>

        <div className="auth-actions">
          {authUser ? (
            <>
              <div className="token-pill">
                <Ticket size={16} />
                {profile?.tokens ?? 0}
              </div>
              <button className="ghost-btn" type="button" onClick={handleLogout}>
                <LogOut size={17} />
                Sign out
              </button>
            </>
          ) : (
            <button
              className="primary-btn"
              type="button"
              onClick={handleLogin}
              disabled={signingIn}
            >
              <LogIn size={18} />
              {signingIn ? "Opening Google..." : "Continue with Google"}
            </button>
          )}
        </div>
      </header>

      <main id="top" className="main-grid">
        {!authUser ? (
          <WelcomePanel
            authError={authError}
            onLogin={handleLogin}
            signingIn={signingIn}
          />
        ) : needsUsername ? (
          <UsernameGate
            authUser={authUser}
            profile={profile}
            conflict={usernameConflict}
          />
        ) : (
          <>
            <AccountPanel authUser={authUser} profile={profile} isAdmin={isAdmin} />
            <section className="workspace">
              {activeTab === "draw" && <DrawCard profile={profile} />}
              {activeTab === "tokens" && <TokenRequest profile={profile} />}
              {activeTab === "history" && <MyRecords profile={profile} />}
              {activeTab === "collection" && <CollectionPage profile={profile} />}
              {activeTab === "admin" && isAdmin && <AdminPanel profile={profile} />}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <RefreshCcw className="spin" size={28} />
      <span>Loading Draw Card</span>
    </div>
  );
}

function WelcomePanel({ authError, onLogin, signingIn }) {
  return (
    <section className="welcome">
      <div>
        <p className="eyebrow">Live stream card draw</p>
        <h1>Buy locked draw numbers with tokens and keep every record in Firebase.</h1>
        <p className="welcome-copy">
          Players sign in with Google, apply for tokens with a bank proof image,
          watch the Kick stream, and reserve card numbers during each live draw.
        </p>
        {authError && <p className="error-note">{authError}</p>}
        <button
          className="primary-btn large"
          type="button"
          onClick={onLogin}
          disabled={signingIn}
        >
          <LogIn size={19} />
          {signingIn ? "Opening Google..." : "Continue with Google"}
        </button>
      </div>
      <div className="welcome-visual" aria-hidden="true">
        <div className="card-stack card-a">01</div>
        <div className="card-stack card-b">17</div>
        <div className="card-stack card-c">30</div>
      </div>
    </section>
  );
}

function UsernameGate({ authUser, profile, conflict = false }) {
  const [username, setUsername] = useState(
    conflict ? "" : profile?.displayName?.split(" ")?.[0] || "",
  );
  const [saving, setSaving] = useState(false);

  async function saveUsername(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveProfileUsername(authUser.uid, username, profile?.username || "");
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="username-gate panel">
      <div className="section-heading">
        <UserRoundPlus size={24} />
        <div>
          <p className="eyebrow">One more step</p>
          <h1>{conflict ? "Choose a new username" : "Choose a username"}</h1>
        </div>
      </div>
      <p className="muted">
        {conflict
          ? `“${profile?.username}” is already taken. Pick a unique username to continue.`
          : "Usernames are unique. This name shows on locked numbers and chat. You can change it later from your account panel."}
      </p>
      <form className="stack-form" onSubmit={saveUsername}>
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. nick_draws"
            maxLength={24}
            required
          />
        </label>
        <button className="primary-btn" type="submit" disabled={saving}>
          <Save size={18} />
          {saving ? "Saving..." : "Save username"}
        </button>
      </form>
    </section>
  );
}

function AccountPanel({ authUser, profile, isAdmin }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUsername(profile?.username || "");
  }, [profile?.username]);

  async function saveUsername(event) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const cleanUsername = await saveProfileUsername(
        authUser.uid,
        username,
        profile?.username || "",
      );
      setUsername(cleanUsername);
      setSaved(true);
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="account-panel">
      <div className="profile-row">
        {authUser.photoURL ? (
          <img src={authUser.photoURL} alt="" />
        ) : (
          <CircleUserRound size={44} />
        )}
        <div>
          <strong>{profile?.username}</strong>
          <span>{authUser.email}</span>
        </div>
      </div>

      <form className="stack-form username-edit-form" onSubmit={saveUsername}>
        <label>
          Username
          <input
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setSaved(false);
            }}
            placeholder="e.g. nick_draws"
            maxLength={24}
            required
          />
        </label>
        <p className="muted username-edit-hint">Must be unique. Old name is released when you change it.</p>
        <button className="small-btn" type="submit" disabled={saving}>
          <Pencil size={16} />
          {saving ? "Saving..." : saved ? "Saved" : "Change username"}
        </button>
      </form>

      <div className="stats-grid">
        <StatCard icon={Ticket} label="Tokens" value={profile?.tokens ?? 0} />
        <StatCard icon={Shield} label="Role" value={isAdmin ? "Admin" : "User"} />
      </div>
    </aside>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="stat-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FileUpload({ id, label, file, onChange, required = false }) {
  const inputId = useMemo(
    () => id || `file-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    [id, label],
  );

  return (
    <div className="file-upload-field">
      <span>{label}</span>
      <label className="file-upload-control" htmlFor={inputId}>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
          required={required}
        />
        <span className="file-upload-button">
          <FileImage size={17} />
          Choose image
        </span>
        <span className={file ? "file-upload-name selected" : "file-upload-name"}>
          {file?.name || "No image selected"}
        </span>
      </label>
    </div>
  );
}

function DrawCard({ profile }) {
  const [rooms, setRooms] = useState([]);
  const [roomSlug, setRoomSlug] = useState(getRoomSlugFromUrl);
  const [slots, setSlots] = useState([]);
  const [buyingNumber, setBuyingNumber] = useState(null);

  useEffect(() => {
    const drawsQuery = query(
      collection(db, "draws"),
      orderBy("createdAt", "desc"),
    );
    const stopDraws = onSnapshot(drawsQuery, (snapshot) => {
      const allDraws = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setRooms(allDraws);
    });

    return stopDraws;
  }, []);

  useEffect(() => {
    function handleRouteChange() {
      setRoomSlug(getRoomSlugFromUrl());
    }

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  const selectedRoom = useMemo(() => {
    if (!roomSlug) return null;
    return (
      rooms.find((room) => room.id === roomSlug) ||
      rooms.find((room) => room.slug === roomSlug) ||
      null
    );
  }, [roomSlug, rooms]);

  useEffect(() => {
    if (!selectedRoom?.id) {
      setSlots([]);
      return undefined;
    }

    const slotsQuery = query(
      collection(db, "draws", selectedRoom.id, "slots"),
      orderBy("number", "asc"),
    );
    const stopSlots = onSnapshot(slotsQuery, (snapshot) => {
      setSlots(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return stopSlots;
  }, [selectedRoom?.id]);

  async function buySlot(slot) {
    if (!selectedRoom || selectedRoom.status !== "live") return;

    setBuyingNumber(slot.number);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", profile.uid);
        const slotRef = doc(db, "draws", selectedRoom.id, "slots", String(slot.number));
        const recordRef = doc(collection(db, "drawRecords"));
        const userSnap = await transaction.get(userRef);
        const slotSnap = await transaction.get(slotRef);
        const currentTokens = Number(userSnap.data()?.tokens || 0);
        const tokenCost = Number(selectedRoom.tokenCost || 10);

        if (!slotSnap.exists() || slotSnap.data().status !== "available") {
          throw new Error("This number is already taken.");
        }

        if (currentTokens < tokenCost) {
          throw new Error(`You need ${tokenCost} tokens to buy this number.`);
        }

        transaction.update(userRef, {
          tokens: currentTokens - tokenCost,
          updatedAt: serverTimestamp(),
        });
        transaction.update(slotRef, {
          status: "locked",
          uid: profile.uid,
          username: profile.username,
          tokenCost,
          updatedAt: serverTimestamp(),
        });
        transaction.set(recordRef, {
          uid: profile.uid,
          username: profile.username,
          drawId: selectedRoom.id,
          drawTitle: selectedRoom.title,
          roomSlug: selectedRoom.slug || selectedRoom.id,
          roomLink: makeRoomLink(selectedRoom.id),
          round: selectedRoom.round || "round-001",
          number: slot.number,
          tokenCost,
          createdAt: serverTimestamp(),
        });
      });
    } catch (error) {
      alert(error.message);
    } finally {
      setBuyingNumber(null);
    }
  }

  function openRoom(room) {
    const slug = room.id;
    const nextUrl = makeRoomLink(room.id);
    window.history.pushState({}, "", nextUrl);
    setRoomSlug(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToRooms() {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({}, "", baseUrl);
    setRoomSlug("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!roomSlug) {
    return <RoomList rooms={rooms} onOpenRoom={openRoom} />;
  }

  if (!selectedRoom) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>Room not found</h2>
        <p className="muted">This room link does not match an active room.</p>
        <button className="primary-btn" type="button" onClick={backToRooms}>
          Back to room list
        </button>
      </section>
    );
  }

  return (
    <>
      <button className="small-btn back-link" type="button" onClick={backToRooms}>
        Back to room list
      </button>
      <div className="draw-layout">
        <section className="panel">
          <div className="section-heading">
            <Gavel size={24} />
            <div>
              <p className="eyebrow">Room stream</p>
              <h1>{selectedRoom.title}</h1>
            </div>
          </div>
          <KickEmbed kickUrl={selectedRoom.kickUrl} title={selectedRoom.title} />
          <div className="draw-meta">
            <span>{selectedRoom.cardCount} cards</span>
            <span>{selectedRoom.tokenCost} token each</span>
            <span>{statusLabels[selectedRoom.status] || selectedRoom.status}</span>
            <span>Room: {selectedRoom.title}</span>
          </div>
        </section>

        <NumberGrid
          draw={selectedRoom}
          slots={slots}
          buyingNumber={buyingNumber}
          onBuy={buySlot}
        />
        {selectedRoom.status === "live" && (
          <ChatRoom drawId={selectedRoom.id} profile={profile} />
        )}
      </div>
    </>
  );
}

function RoomList({ rooms, onOpenRoom }) {
  if (!rooms.length) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>No rooms yet</h2>
        <p className="muted">Admin can create a room from the Admin page.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <Gavel size={24} />
        <div>
          <p className="eyebrow">Draw Card</p>
          <h1>Room list</h1>
        </div>
      </div>
      <div className="room-list-grid">
        {rooms.map((room) => (
          <button
            className="room-card"
            key={room.id}
            type="button"
            onClick={() => onOpenRoom(room)}
          >
            {room.thumbnailUrl ? (
              <img src={room.thumbnailUrl} alt={`${room.title} thumbnail`} />
            ) : (
              <div className="image-placeholder">
                <Gavel size={30} />
              </div>
            )}
            <div>
              <strong>{room.title}</strong>
              <span>
                {room.cardCount} cards · {room.tokenCost} token each
              </span>
              <span className={`status-badge ${room.status}`}>
                {statusLabels[room.status] || room.status}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function NumberGrid({ draw, slots, buyingNumber, onBuy }) {
  if (draw.status !== "live") {
    return (
      <section className="panel empty-state compact-empty">
        <Gavel size={32} />
        <h2>{draw.title}</h2>
        <p className="muted">
          This room exists, but it is not live yet. When admin sets it to Live,
          the stream and numbers will show here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading compact">
        <CreditCard size={22} />
        <div>
          <p className="eyebrow">Pick a number</p>
          <h2>Available cards</h2>
        </div>
      </div>
      <div className="slot-grid">
        {slots.map((slot) => {
          const locked = slot.status !== "available";
          return (
            <button
              className={locked ? "slot locked" : "slot"}
              disabled={locked || buyingNumber === slot.number}
              key={slot.id}
              type="button"
              onClick={() => onBuy(slot)}
            >
              <span>
                {locked ? slot.username || "Locked" : buyingNumber === slot.number ? "Buying..." : slot.number}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function KickEmbed({ kickUrl, title }) {
  const embedUrl = toKickEmbedUrl(kickUrl);

  if (!embedUrl) {
    return <div className="stream-fallback">Kick stream URL not set.</div>;
  }

  return (
    <iframe
      className="kick-frame"
      src={embedUrl}
      title={`${title} Kick stream`}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  );
}

function ChatRoom({ drawId, profile }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const messagesQuery = query(
      collection(db, "draws", drawId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const stopMessages = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return stopMessages;
  }, [drawId]);

  async function sendMessage(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText) return;

    setSending(true);
    try {
      await addDoc(collection(db, "draws", drawId, "messages"), {
        drawId,
        source: "draw",
        uid: profile.uid,
        username: profile.username,
        text: cleanText.slice(0, 500),
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (error) {
      alert(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel chat-panel">
      <div className="section-heading compact">
        <ListChecks size={22} />
        <div>
          <p className="eyebrow">Room chat</p>
          <h2>Chat room</h2>
        </div>
      </div>
      <div className="chat-log">
        {messages.length ? (
          messages.map((message) => (
            <article
              className={message.uid === profile.uid ? "chat-message own-message" : "chat-message"}
              key={message.id}
            >
              <div>
                <strong>{message.username}</strong>
                <span>{formatDate(message.createdAt)}</span>
              </div>
              <p>{message.text}</p>
            </article>
          ))
        ) : (
          <p className="muted">No messages in this room yet.</p>
        )}
      </div>
      <form className="chat-form" onSubmit={sendMessage}>
        <input
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type a room message"
        />
        <button className="primary-btn" type="submit" disabled={sending || !text.trim()}>
          <Send size={18} />
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
}

function toKickEmbedUrl(kickUrl) {
  try {
    const url = new URL(kickUrl);
    const channel = url.pathname.split("/").filter(Boolean)[0];
    return channel ? `https://player.kick.com/${channel}` : "";
  } catch {
    return "";
  }
}

function RoomThumbnail({ draw }) {
  if (!draw?.thumbnailUrl) return null;

  return (
    <img className="room-thumbnail" src={draw.thumbnailUrl} alt={`${draw.title} thumbnail`} />
  );
}

function TokenRequest({ profile }) {
  const [amount, setAmount] = useState(10);
  const [proof, setProof] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const requestsQuery = query(
      collection(db, "tokenRequests"),
      where("uid", "==", profile.uid),
      orderBy("createdAt", "desc"),
    );
    const stopRequests = onSnapshot(requestsQuery, (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return stopRequests;
  }, [profile.uid]);

  async function submitRequest(event) {
    event.preventDefault();

    setSubmitting(true);
    try {
      const proofInfo = await createProofInfo({
        proof,
        profile,
        amount: Number(amount),
      });

      await addDoc(collection(db, "tokenRequests"), {
        uid: profile.uid,
        username: profile.username,
        email: profile.email || "",
        amount: Number(amount),
        ...proofInfo,
        status: "pending",
        adminNote: "",
        createdAt: serverTimestamp(),
      });

      setProof(null);
      setAmount(10);
    } catch (error) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <div className="section-heading">
          <BadgeDollarSign size={24} />
          <div>
            <p className="eyebrow">Bank transfer proof</p>
            <h1>Apply for tokens</h1>
          </div>
        </div>
        <form className="stack-form" onSubmit={submitRequest}>
          <label>
            Tokens requested
            <input
              type="number"
              min="1"
              max="10000"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <FileUpload
            label="Payment proof image"
            file={proof}
            onChange={setProof}
          />
          <p className="form-note">
            Storage is optional for testing. If no image is uploaded, the request
            uses a dummy proof record.
          </p>
          <button className="primary-btn" type="submit" disabled={submitting}>
            <FileImage size={18} />
            {submitting ? "Submitting..." : "Submit request"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading compact">
          <Clock3 size={22} />
          <div>
            <p className="eyebrow">Status</p>
            <h2>My token requests</h2>
          </div>
        </div>
        <RequestList requests={requests} />
      </section>
    </div>
  );
}

async function createProofInfo({ proof, profile, amount }) {
  const dummyProof = {
    proofMode: "dummy",
    proofPath: "dummy/testing-only",
    proofFileName: proof?.name || "dummy-proof.svg",
    proofUrl: createDummyProofUrl(profile.username, amount),
  };

  if (!proof) return dummyProof;

  try {
    const proofPath = `token-proofs/${profile.uid}/${Date.now()}-${proof.name}`;
    const proofRef = ref(storage, proofPath);
    await uploadBytes(proofRef, proof, {
      contentType: proof.type || "image/jpeg",
    });

    return {
      proofMode: "storage",
      proofPath,
      proofFileName: proof.name,
      proofUrl: await getDownloadURL(proofRef),
    };
  } catch (error) {
    console.warn("Storage proof upload failed, using dummy proof.", error);
    return dummyProof;
  }
}

function createDummyProofUrl(username, amount) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
      <rect width="720" height="420" fill="#f8fafc"/>
      <rect x="48" y="48" width="624" height="324" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
      <text x="80" y="130" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#172033">Dummy Payment Proof</text>
      <text x="80" y="194" font-family="Arial, sans-serif" font-size="26" fill="#475569">Storage is not enabled yet.</text>
      <text x="80" y="252" font-family="Arial, sans-serif" font-size="24" fill="#155eef">User: ${escapeSvg(username || "player")}</text>
      <text x="80" y="300" font-family="Arial, sans-serif" font-size="24" fill="#155eef">Requested tokens: ${escapeSvg(String(amount || 0))}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function RequestList({ requests, adminMode = false, onApprove, onReject }) {
  if (!requests.length) {
    return <p className="muted">No requests yet.</p>;
  }

  return (
    <div className="record-list">
      {requests.map((request) => (
        <article className="record-item" key={request.id}>
          <div>
            <strong>
              {request.amount} tokens
              {adminMode && request.username ? ` for ${request.username}` : ""}
            </strong>
            <span>{formatDate(request.createdAt)}</span>
            <span className={`status-badge ${request.status}`}>
              {statusLabels[request.status] || request.status}
            </span>
          </div>
          <div className="record-actions">
            {request.proofUrl && (
              <a href={request.proofUrl} target="_blank" rel="noreferrer">
                {request.proofMode === "dummy" ? "Dummy proof" : "Proof"}{" "}
                <ExternalLink size={15} />
              </a>
            )}
            {adminMode && request.status === "pending" && (
              <>
                <button className="small-btn" type="button" onClick={() => onApprove(request)}>
                  <Check size={15} />
                  Approve
                </button>
                <button className="small-btn danger" type="button" onClick={() => onReject(request)}>
                  <X size={15} />
                  Reject
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function MyRecords({ profile }) {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
      orderBy("createdAt", "desc"),
    );
    const stopRecords = onSnapshot(recordsQuery, (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return stopRecords;
  }, [profile.uid]);

  return (
    <section className="panel">
      <div className="section-heading">
        <ListChecks size={24} />
        <div>
          <p className="eyebrow">Draw history</p>
          <h1>My locked cards</h1>
        </div>
      </div>
      {records.length ? (
        <div className="record-list">
          {records.map((record) => (
            <article className="record-item" key={record.id}>
              <div>
                <strong>{record.drawTitle}</strong>
                <span>Card #{record.number}</span>
              </div>
              <div>
                <strong>{record.tokenCost} token</strong>
                <span>{formatDate(record.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">Your purchased card numbers will appear here.</p>
      )}
    </section>
  );
}

function CollectionPage({ profile }) {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
      orderBy("createdAt", "desc"),
    );
    const stopRecords = onSnapshot(recordsQuery, (snapshot) => {
      setRecords(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((record) => record.cardId),
      );
    });

    return stopRecords;
  }, [profile.uid]);

  return (
    <section className="panel">
      <div className="section-heading">
        <Boxes size={24} />
        <div>
          <p className="eyebrow">Assigned cards</p>
          <h1>My collection</h1>
        </div>
      </div>
      {records.length ? (
        <div className="collection-grid">
          {records.map((record) => (
            <article className="collection-card" key={record.id}>
              {record.cardImageUrl ? (
                <img src={record.cardImageUrl} alt={record.cardName} />
              ) : (
                <div className="image-placeholder">
                  <Package size={30} />
                </div>
              )}
              <div>
                <strong>{record.cardName}</strong>
                <span>
                  {record.drawTitle} · #{record.number}
                </span>
                <span className={`status-badge ${record.collectionStatus || "pending"}`}>
                  {statusLabels[record.collectionStatus || "pending"]}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">
          Cards assigned by admin will appear here with pending, shipping, or
          shipped status.
        </p>
      )}
    </section>
  );
}

function AdminPanel({ profile }) {
  const [requests, setRequests] = useState([]);
  const [draws, setDraws] = useState([]);
  const [cards, setCards] = useState([]);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const requestsQuery = query(
      collection(db, "tokenRequests"),
      orderBy("createdAt", "desc"),
    );
    const stopRequests = onSnapshot(requestsQuery, (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    const drawsQuery = query(collection(db, "draws"), orderBy("createdAt", "desc"));
    const stopDraws = onSnapshot(drawsQuery, (snapshot) => {
      setDraws(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    const cardsQuery = query(collection(db, "cards"), orderBy("createdAt", "desc"));
    const stopCards = onSnapshot(cardsQuery, (snapshot) => {
      setCards(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    const recordsQuery = query(collection(db, "drawRecords"), orderBy("createdAt", "desc"));
    const stopRecords = onSnapshot(recordsQuery, (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => {
      stopRequests();
      stopDraws();
      stopCards();
      stopRecords();
    };
  }, []);

  async function approveRequest(request) {
    try {
      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, "tokenRequests", request.id);
        const userRef = doc(db, "users", request.uid);
        const requestSnap = await transaction.get(requestRef);
        const userSnap = await transaction.get(userRef);

        if (!requestSnap.exists() || requestSnap.data().status !== "pending") {
          throw new Error("This request has already been reviewed.");
        }
        if (!userSnap.exists()) {
          throw new Error("User profile was not found.");
        }

        transaction.update(requestRef, {
          status: "approved",
          reviewedAt: serverTimestamp(),
          reviewedBy: profile.uid,
        });
        transaction.update(userRef, {
          tokens: increment(Number(request.amount || 0)),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      alert(error.message);
    }
  }

  async function rejectRequest(request) {
    const reason = window.prompt("Reject reason (optional):", "");

    await updateDoc(doc(db, "tokenRequests", request.id), {
      status: "rejected",
      adminNote: reason || "",
      reviewedAt: serverTimestamp(),
      reviewedBy: profile.uid,
    });
  }

  async function completeDraw(draw) {
    const confirmed = window.confirm(
      `Complete and delete "${draw.title}"? Purchase records will stay for assignment and collection history.`,
    );
    if (!confirmed) return;

    try {
      await deleteRoomWithChildren(draw.id);
    } catch (error) {
      alert(error.message);
    }
  }

  async function copyRoomLink(draw) {
    await navigator.clipboard.writeText(makeRoomLink(draw.id));
  }

  return (
    <div className="admin-grid">
      <CreateDrawForm profile={profile} />
      <CreateCardForm cards={cards} profile={profile} />
      <section className="panel">
        <div className="section-heading compact">
          <BadgeDollarSign size={22} />
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>Token applications</h2>
          </div>
        </div>
        <RequestList
          requests={requests}
          adminMode
          onApprove={approveRequest}
          onReject={rejectRequest}
        />
      </section>
      <section className="panel wide">
        <div className="section-heading compact">
          <Gavel size={22} />
          <div>
            <p className="eyebrow">Room management</p>
            <h2>Draw rooms</h2>
          </div>
        </div>
        <div className="record-list">
          {draws.map((draw) => (
            <article className="record-item" key={draw.id}>
              <div className="record-main">
                <RoomThumbnail draw={draw} />
                <div>
                  <strong>{draw.title}</strong>
                  <span>
                    {draw.cardCount} cards, {draw.tokenCost} token each
                  </span>
                  <span>{makeRoomLink(draw.id)}</span>
                  <span className={`status-badge ${draw.status}`}>
                    {statusLabels[draw.status] || draw.status}
                  </span>
                </div>
              </div>
              <div className="record-actions">
                <button className="small-btn" type="button" onClick={() => copyRoomLink(draw)}>
                  <Copy size={15} />
                  Copy link
                </button>
                {draw.status === "live" && (
                  <button className="small-btn" type="button" onClick={() => completeDraw(draw)}>
                    <CopyCheck size={15} />
                    Complete & delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <AssignCardsPanel cards={cards} records={records} profile={profile} />
    </div>
  );
}

function CreateCardForm({ cards, profile }) {
  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editImageFile, setEditImageFile] = useState(null);
  const [savingCardId, setSavingCardId] = useState("");

  async function createCard(event) {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!imageFile) {
      alert("Upload a card image first.");
      return;
    }

    setCreating(true);
    try {
      const imageUrl = await imageFileToCompressedDataUrl(imageFile, {
        maxWidth: 720,
        maxHeight: 980,
        quality: 0.72,
      });

      await addDoc(collection(db, "cards"), {
        name: name.trim(),
        imageUrl,
        imageMode: "compressed-data-url",
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
      setImageFile(null);
      formElement.reset();
    } catch (error) {
      alert(error.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEditName(card.name || "");
    setEditImageFile(null);
  }

  function cancelEdit() {
    setEditingId("");
    setEditName("");
    setEditImageFile(null);
  }

  async function saveCardEdit(event, card) {
    event.preventDefault();
    const cleanName = editName.trim();

    if (!cleanName) {
      alert("Card name is required.");
      return;
    }

    setSavingCardId(card.id);
    try {
      const updates = {
        name: cleanName,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      };

      if (editImageFile) {
        updates.imageUrl = await imageFileToCompressedDataUrl(editImageFile, {
          maxWidth: 720,
          maxHeight: 980,
          quality: 0.72,
        });
        updates.imageMode = "compressed-data-url";
      }

      await updateDoc(doc(db, "cards", card.id), updates);
      await updateAssignedRecordsForCard(card.id, {
        cardName: cleanName,
        ...(updates.imageUrl ? { cardImageUrl: updates.imageUrl } : {}),
        updatedAt: serverTimestamp(),
      });
      cancelEdit();
    } catch (error) {
      alert(error.message);
    } finally {
      setSavingCardId("");
    }
  }

  return (
    <section className="panel card-library-panel">
      <div className="section-heading">
        <ImagePlus size={24} />
        <div>
          <p className="eyebrow">Card library</p>
          <h1>Create card</h1>
        </div>
      </div>
      <form className="stack-form" onSubmit={createCard}>
        <label>
          Card name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Pikachu AR"
            required
          />
        </label>
        <FileUpload
          label="Card image"
          file={imageFile}
          onChange={setImageFile}
          required
        />
        <p className="form-note">
          Images are compressed in the browser before saving, so admin can upload
          normal photos while Storage is still dummy.
        </p>
        <button className="primary-btn" type="submit" disabled={creating}>
          <Save size={18} />
          {creating ? "Creating..." : "Create card"}
        </button>
      </form>
      <div className="created-card-section">
        <div className="section-heading compact">
          <Package size={20} />
          <div>
            <p className="eyebrow">Created cards</p>
            <h2>Card list</h2>
          </div>
        </div>
        {cards.length ? (
          <div className="created-card-grid">
            {cards.map((card) => (
              <article className="created-card" key={card.id}>
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.name} />
                ) : (
                  <div className="image-placeholder">
                    <Package size={24} />
                  </div>
                )}
                {editingId === card.id ? (
                  <form className="card-edit-form" onSubmit={(event) => saveCardEdit(event, card)}>
                    <label>
                      Card name
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        required
                      />
                    </label>
                    <FileUpload
                      id={`edit-card-${card.id}`}
                      label="Replace image"
                      file={editImageFile}
                      onChange={setEditImageFile}
                    />
                    <div className="card-edit-actions">
                      <button
                        className="small-btn"
                        type="submit"
                        disabled={savingCardId === card.id}
                      >
                        <Save size={15} />
                        {savingCardId === card.id ? "Saving..." : "Save"}
                      </button>
                      <button className="small-btn danger" type="button" onClick={cancelEdit}>
                        <X size={15} />
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="created-card-info">
                    <strong>{card.name}</strong>
                    <button className="small-btn" type="button" onClick={() => startEdit(card)}>
                      <Pencil size={15} />
                      Edit
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No cards created yet.</p>
        )}
      </div>
    </section>
  );
}

function AssignCardsPanel({ cards, records, profile }) {
  const [selectedCards, setSelectedCards] = useState({});
  const [selectedStatuses, setSelectedStatuses] = useState({});
  const [assigningId, setAssigningId] = useState("");
  const purchasedRecords = records.filter((record) => record.uid && record.number);

  function updateSelection(recordId, value) {
    setSelectedCards((current) => ({ ...current, [recordId]: value }));
  }

  function updateStatus(recordId, value) {
    setSelectedStatuses((current) => ({ ...current, [recordId]: value }));
  }

  async function assignCard(record) {
    const cardId = selectedCards[record.id] || record.cardId;
    const card = cards.find((item) => item.id === cardId);
    const collectionStatus =
      selectedStatuses[record.id] || record.collectionStatus || "pending";

    if (!card) {
      alert("Select a card to assign.");
      return;
    }

    setAssigningId(record.id);
    try {
      await updateDoc(doc(db, "drawRecords", record.id), {
        cardId: card.id,
        cardName: card.name,
        cardImageUrl: card.imageUrl || "",
        collectionStatus,
        assignedAt: serverTimestamp(),
        assignedBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      alert(error.message);
    } finally {
      setAssigningId("");
    }
  }

  return (
    <section className="panel wide">
      <div className="section-heading compact">
        <Truck size={22} />
        <div>
          <p className="eyebrow">Result assignment</p>
          <h2>Assign cards to purchased numbers</h2>
        </div>
      </div>
      {purchasedRecords.length ? (
        <div className="record-list">
          {purchasedRecords.map((record) => {
            const selectedCard =
              cards.find((card) => card.id === (selectedCards[record.id] || record.cardId)) ||
              null;
            const previewImage = selectedCard?.imageUrl || record.cardImageUrl || "";
            const previewName = selectedCard?.name || record.cardName || "";

            return (
              <article className="record-item assignment-item" key={record.id}>
                <div>
                  <strong>{record.username}</strong>
                  <span>
                    {record.drawTitle} · round {record.roomSlug || record.drawId} ·
                    number #{record.number}
                  </span>
                  {record.cardName && (
                    <span>
                      Assigned: {record.cardName} ({statusLabels[record.collectionStatus]})
                    </span>
                  )}
                </div>
                <div className="assignment-preview">
                  {previewImage ? (
                    <img src={previewImage} alt={previewName || "Selected card"} />
                  ) : (
                    <div className="assignment-placeholder">
                      <Package size={20} />
                    </div>
                  )}
                  <span>{previewName || "No card selected"}</span>
                </div>
                <div className="assignment-controls">
                  <select
                    value={selectedCards[record.id] || record.cardId || ""}
                    onChange={(event) => updateSelection(record.id, event.target.value)}
                  >
                    <option value="">Select card</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedStatuses[record.id] || record.collectionStatus || "pending"}
                    onChange={(event) => updateStatus(record.id, event.target.value)}
                  >
                    {collectionStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => assignCard(record)}
                    disabled={assigningId === record.id}
                  >
                    <Package size={15} />
                    {assigningId === record.id ? "Saving..." : "Assign"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">Purchased numbers will appear here for assignment.</p>
      )}
    </section>
  );
}

function CreateDrawForm({ profile }) {
  const [form, setForm] = useState(DEFAULT_DRAW);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [creating, setCreating] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createDraw(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const cardCount = Number(form.cardCount);
    const tokenCost = Number(form.tokenCost);

    if (cardCount < 4 || cardCount > 100) {
      alert("Card count must be between 4 and 100.");
      return;
    }
    if (tokenCost < 1) {
      alert("Token cost must be at least 1.");
      return;
    }

    setCreating(true);
    try {
      const drawRef = doc(collection(db, "draws"));
      const batch = writeBatch(db);
      const slug = normalizeSlug(form.slug || form.title);
      const thumbnailUrl = thumbnailFile
        ? await imageFileToCompressedDataUrl(thumbnailFile, {
            maxWidth: 900,
            maxHeight: 520,
            quality: 0.7,
          })
        : form.thumbnailUrl.trim();

      batch.set(drawRef, {
        title: form.title.trim(),
        slug,
        kickUrl: form.kickUrl.trim(),
        cardCount,
        tokenCost,
        status: form.status,
        poolText: form.poolText.trim(),
        thumbnailUrl,
        thumbnailMode: thumbnailUrl?.startsWith("data:image/")
          ? "compressed-data-url"
          : "external-url",
        roomLink: makeRoomLink(drawRef.id),
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (let number = 1; number <= cardCount; number += 1) {
        batch.set(doc(db, "draws", drawRef.id, "slots", String(number)), {
          number,
          status: "available",
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setForm(DEFAULT_DRAW);
      setThumbnailFile(null);
      formElement.reset();
    } catch (error) {
      alert(error.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <Plus size={24} />
        <div>
          <p className="eyebrow">New draw</p>
          <h1>Start a card pool</h1>
        </div>
      </div>
      <form className="stack-form" onSubmit={createDraw}>
        <label>
          Room title
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            required
          />
        </label>
        <label>
          Room link name
          <input
            value={form.slug}
            onChange={(event) => updateField("slug", normalizeSlug(event.target.value))}
            placeholder="tonight-live-draw"
            required
          />
        </label>
        <label>
          Kick channel URL
          <input
            value={form.kickUrl}
            onChange={(event) => updateField("kickUrl", event.target.value)}
            placeholder="https://kick.com/channel-name"
            required
          />
        </label>
        <FileUpload
          label="Room thumbnail"
          file={thumbnailFile}
          onChange={setThumbnailFile}
        />
        <label>
          Or thumbnail image URL
          <input
            value={form.thumbnailUrl}
            onChange={(event) => updateField("thumbnailUrl", event.target.value)}
            placeholder="https://..."
          />
        </label>
        <div className="form-row">
          <label>
            Cards
            <input
              type="number"
              min="4"
              max="100"
              value={form.cardCount}
              onChange={(event) => updateField("cardCount", event.target.value)}
              required
            />
          </label>
          <label>
            Token cost
            <input
              type="number"
              min="1"
              value={form.tokenCost}
              onChange={(event) => updateField("tokenCost", event.target.value)}
              required
            />
          </label>
        </div>
        <label>
          Card pool info
          <textarea
            value={form.poolText}
            onChange={(event) => updateField("poolText", event.target.value)}
            placeholder="List card names, rarity, notes, or shipping details."
            rows={5}
          />
        </label>
        <button className="primary-btn" type="submit" disabled={creating}>
          <Save size={18} />
          {creating ? "Creating..." : "Create room"}
        </button>
      </form>
    </section>
  );
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function makeRoomLink(roomKey) {
  const cleanSlug = String(roomKey || "").trim();
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return cleanSlug ? `${baseUrl}?room=${encodeURIComponent(cleanSlug)}` : baseUrl;
}

function getRoomSlugFromUrl() {
  return new URLSearchParams(window.location.search).get("room") || "";
}

async function deleteRoomWithChildren(drawId) {
  const slotsSnapshot = await getDocs(collection(db, "draws", drawId, "slots"));
  const messagesSnapshot = await getDocs(collection(db, "draws", drawId, "messages"));
  const allRefs = [
    ...slotsSnapshot.docs.map((item) => item.ref),
    ...messagesSnapshot.docs.map((item) => item.ref),
    doc(db, "draws", drawId),
  ];

  for (let index = 0; index < allRefs.length; index += 450) {
    const batch = writeBatch(db);
    allRefs.slice(index, index + 450).forEach((itemRef) => batch.delete(itemRef));
    await batch.commit();
  }
}

async function updateAssignedRecordsForCard(cardId, updates) {
  const recordsSnapshot = await getDocs(
    query(collection(db, "drawRecords"), where("cardId", "==", cardId)),
  );

  for (let index = 0; index < recordsSnapshot.docs.length; index += 450) {
    const batch = writeBatch(db);
    recordsSnapshot.docs.slice(index, index + 450).forEach((item) => {
      batch.update(item.ref, updates);
    });
    await batch.commit();
  }
}

function imageFileToCompressedDataUrl(
  file,
  { maxWidth = 900, maxHeight = 900, quality = 0.72 } = {},
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not load image."));
      image.onload = () => {
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  if (!value) return "Just now";
  const date = value instanceof Timestamp ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default App;
