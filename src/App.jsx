import { useEffect, useId, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Boxes,
  Check,
  Clock3,
  Copy,
  CopyCheck,
  Download,
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
  Search,
  Shield,
  Send,
  Ticket,
  Upload,
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
  totalRounds: 1,
  currentRound: 1,
  status: "live",
  poolText: "",
  thumbnailUrl: "",
};

const CARD_IMAGE_COMPRESSION = {
  maxWidth: 560,
  maxHeight: 760,
  quality: 0.68,
  minQuality: 0.58,
  targetBytes: 180 * 1024,
};

const statusLabels = {
  pending: "待審核",
  approved: "已批准",
  rejected: "已駁回",
  live: "直播中",
  completed: "已結束",
  assigned: "已完成",
  draft: "即將開播",
  shipping: "配送中",
  shipped: "已寄出",
};

const collectionStatuses = ["pending", "shipping", "shipped"];
const CONVERSION_RATE = 0.8;
const CHAT_COOLDOWN_MS = 3000;

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
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
    throw new Error("玩家名稱須為 3–24 個英文字母、數字或底線。");
  }

  await runTransaction(db, async (transaction) => {
    const profileRef = doc(db, "users", uid);
    const newRef = doc(db, "usernames", newKey);
    const newSnap = await transaction.get(newRef);
    const oldRef = oldKey && oldKey !== newKey ? doc(db, "usernames", oldKey) : null;
    const oldSnap = oldRef ? await transaction.get(oldRef) : null;

    if (newSnap.exists() && newSnap.data()?.uid !== uid) {
      throw new Error("這個玩家名稱已被使用。");
    }

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
      transaction.update(newRef, { username: cleanUsername });
    }

    if (oldSnap?.exists() && oldSnap.data()?.uid === uid) {
      transaction.delete(oldRef);
    }
  });

  return cleanUsername;
}

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
        throw new Error("這個玩家名稱已被使用，請選擇另一個名稱。");
      }
      return;
    }

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

const CARD_CATEGORIES = [
  "比卡超",
  "噴火龍",
  "路飛",
  "夢夢",
  "耿鬼",
  "其他",
  "伊貝",
  "卡盒",
  "卡包",
];

const TOKEN_PACKAGES = [
  { hkd: 500, tokens: 1050 },
  { hkd: 1000, tokens: 2100 },
  { hkd: 3000, tokens: 6480 },
  { hkd: 10000, tokens: 22000 },
  { hkd: 30000, tokens: 70200 },
];

const ADMIN_SECTIONS = [
  { id: "rooms", label: "房間管理", eyebrow: "Rooms", icon: Gavel },
  { id: "create-room", label: "建立房間", eyebrow: "New draw", icon: Plus },
  { id: "cards", label: "卡牌庫", eyebrow: "Card library", icon: ImagePlus },
  { id: "requests", label: "代幣審核", eyebrow: "Review queue", icon: BadgeDollarSign },
  { id: "packages", label: "套餐設定", eyebrow: "Token packages", icon: Ticket },
  { id: "records", label: "購買紀錄", eyebrow: "Room records", icon: ListChecks },
];

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
      setAuthError("登入初始化時間過長，請重新整理後再試。");
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
        setAuthError(getSafeErrorMessage(error, "登入失敗，請重新整理後再試。"));
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
          setAuthError(getSafeErrorMessage(error, "登入失敗，請再試一次。"));
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
        email: authUser.email || "",
        displayName: (authUser.displayName || "").slice(0, 80),
        photoURL: (authUser.photoURL || "").slice(0, 500),
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
  const isProfileLoading = Boolean(authUser && !profile);

  const tabs = useMemo(
    () => [
      { id: "draw", label: "抽卡", icon: Gavel },
      { id: "tokens", label: "申請代幣", icon: BadgeDollarSign },
      { id: "history", label: "我的紀錄", icon: ListChecks },
      { id: "collection", label: "我的卡牌", icon: Boxes },
      ...(isAdmin ? [{ id: "admin", label: "管理後台", icon: Shield }] : []),
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
          setAuthError(getSafeErrorMessage(redirectError, "Google 登入失敗，請再試一次。"));
        }
      } else if (error?.code === "auth/cancelled-popup-request") {
        setAuthError("上一個 Google 登入視窗已取消，請再試一次。");
      } else {
        setAuthError(getSafeErrorMessage(error, "Google 登入失敗，請再試一次。"));
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
          <span className="brand-mark">D!</span>
          <span>直播抽卡</span>
        </a>

        {authUser && (
          <button
            className="icon-btn menu-toggle"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

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
                <span>登出</span>
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
              {signingIn ? "正在開啟 Google..." : "使用 Google 登入"}
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
        ) : isProfileLoading ? (
          <LoadingScreen />
        ) : needsUsername ? (
          <UsernameGate
            authUser={authUser}
            profile={profile}
            conflict={usernameConflict}
          />
        ) : (
          <>
            <AccountPanel authUser={authUser} profile={profile} isAdmin={isAdmin} setActiveTab={setActiveTab} />
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
      <span>載入直播抽卡</span>
    </div>
  );
}

function WelcomePanel({ authError, onLogin, signingIn }) {
  return (
    <section className="welcome">
      <div>
        <p className="eyebrow">Live stream card draw</p>
        <h1>直播抽卡，選號入場，結果即時記錄。</h1>
        <p className="welcome-copy">
          使用 Google 登入後申請代幣，進入直播房間選擇抽卡號碼，所有購買紀錄、結果與配送狀態都會保存在 Firebase。
        </p>
        {authError && <p className="error-note">{authError}</p>}
        <button
          className="primary-btn large"
          type="button"
          onClick={onLogin}
          disabled={signingIn}
        >
          <LogIn size={19} />
          {signingIn ? "正在開啟 Google..." : "使用 Google 登入"}
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
      showSafeError(error);
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
          <h1>{conflict ? "選擇新的玩家名稱" : "設定玩家名稱"}</h1>
        </div>
      </div>
      <p className="muted">
        {conflict
          ? `「${profile?.username}」已被使用，請選擇一個獨有名稱。`
          : "選號後，其他玩家會看到這個名稱，而不是你的電郵。"}
      </p>
      <form className="stack-form" onSubmit={saveUsername}>
        <label>
          玩家名稱
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. nick_draws"
            maxLength={24}
            pattern="[A-Za-z0-9_]{3,24}"
            title="只可使用英文字母、數字及底線"
            required
          />
        </label>
        <button className="primary-btn" type="submit" disabled={saving}>
          <Save size={18} />
          {saving ? "儲存中..." : "儲存玩家名稱"}
        </button>
      </form>
    </section>
  );
}

function AccountPanel({ authUser, profile, isAdmin, setActiveTab }) {
  const [recentPicks, setRecentPicks] = useState([]);
  const [roomsById, setRoomsById] = useState({});
  const [username, setUsername] = useState(profile?.username || "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [pickSectionsOpen, setPickSectionsOpen] = useState({
    active: true,
    completed: false,
  });
  const initial = (profile?.username || authUser.displayName || authUser.email || "D")
    .trim()
    .charAt(0)
    .toUpperCase();

  useEffect(() => {
    setUsername(profile?.username || "");
  }, [profile?.username]);

  async function saveUsername(event) {
    event.preventDefault();
    setSavingUsername(true);
    setUsernameSaved(false);
    try {
      const cleanUsername = await saveProfileUsername(
        authUser.uid,
        username,
        profile?.username || "",
      );
      setUsername(cleanUsername);
      setUsernameSaved(true);
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingUsername(false);
    }
  }

  useEffect(() => {
    if (!profile?.uid) return undefined;

    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    const stopRecords = onSnapshot(recordsQuery, (snapshot) => {
      setRecentPicks(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 6),
      );
    });

    return stopRecords;
  }, [profile?.uid]);

  useEffect(() => {
    const roomsQuery = query(collection(db, "draws"), orderBy("createdAt", "desc"));
    const stopRooms = onSnapshot(roomsQuery, (snapshot) => {
      setRoomsById(
        Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }])),
      );
    });

    return stopRooms;
  }, []);

  function openPickRoom(record) {
    const room = roomsById[record.drawId];
    if (!room || room.status !== "live") return;
    window.history.pushState({}, "", makeRoomLink(room.id));
    window.dispatchEvent(new PopStateEvent("popstate"));
    setActiveTab("draw");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePickSection(section) {
    setPickSectionsOpen((current) => ({ ...current, [section]: !current[section] }));
  }

  function renderPickCard(record) {
    const room = roomsById[record.drawId];
    const roomIsLive = isActivePickRecord(record, room);
    const roomStatus = record.cardId
      ? "已完成抽卡"
      : roomIsLive
        ? "正在直播"
        : room
          ? statusLabels[room.status] || "未開場"
          : "已完成抽卡";

    return (
      <button
        className={roomIsLive ? "pick-card active clickable" : "pick-card"}
        disabled={!roomIsLive}
        key={record.id}
        type="button"
        onClick={() => openPickRoom(record)}
      >
        <div>
          <span>{record.roomSlug || room?.slug || "抽卡房"}</span>
          <b>#{record.number}</b>
        </div>
        <strong>{record.cardName || record.targetCardName || record.drawTitle}</strong>
        <small>
          {formatRoundLabel(record.round || "round-001")} · {roomStatus}
          {roomIsLive ? " · 點擊返回房間" : ""}
        </small>
      </button>
    );
  }

  const activePicks = recentPicks.filter((record) =>
    isActivePickRecord(record, roomsById[record.drawId]),
  );
  const completedPicks = recentPicks.filter(
    (record) => !isActivePickRecord(record, roomsById[record.drawId]),
  );

  return (
    <aside className="account-panel">
      <div className="profile-row">
        <span className="avatar-initial">{initial}</span>
        <div>
          <strong>{profile?.username}</strong>
          <span>{authUser.email}</span>
        </div>
      </div>

      <form className="stack-form username-edit-form" onSubmit={saveUsername}>
        <label>
          玩家名稱
          <input
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setUsernameSaved(false);
            }}
            placeholder="e.g. nick_draws"
            maxLength={24}
            pattern="[A-Za-z0-9_]{3,24}"
            title="只可使用英文字母、數字及底線"
            required
          />
        </label>
        <p className="muted username-edit-hint">名稱必須獨有；更改後會釋放舊名稱。</p>
        <button className="small-btn" type="submit" disabled={savingUsername}>
          <Pencil size={16} />
          {savingUsername ? "儲存中..." : usernameSaved ? "已儲存" : "更改名稱"}
        </button>
      </form>

      <div className="wallet-card">
        <span>代幣</span>
        <strong>
          <span className="coin-dot">⚡</span>
          {profile?.tokens ?? 0}
        </strong>
        <button className="primary-btn side-cta" type="button" onClick={() => setActiveTab("tokens")}>
          申請代幣
        </button>
      </div>

      <div className="current-picks">
        <strong>正在抽卡</strong>
        {recentPicks.length ? (
          <>
            <PickSection
              count={activePicks.length}
              isOpen={pickSectionsOpen.active}
              label="正在抽卡"
              onToggle={() => togglePickSection("active")}
            >
              {activePicks.length ? activePicks.map(renderPickCard) : <p>暫時未有正在抽卡項目。</p>}
            </PickSection>
            <PickSection
              count={completedPicks.length}
              isOpen={pickSectionsOpen.completed}
              label="已抽卡"
              onToggle={() => togglePickSection("completed")}
            >
              {completedPicks.length ? completedPicks.map(renderPickCard) : <p>暫時未有已完成項目。</p>}
            </PickSection>
          </>
        ) : (
          <p>進入房間後，你已選的號碼會顯示在這裡。</p>
        )}
      </div>

      <div className="role-chip">
        <Shield size={16} />
        {isAdmin ? "管理員" : "玩家"}
      </div>
    </aside>
  );
}

function PickSection({ children, count, isOpen, label, onToggle }) {
  return (
    <div className="pick-section">
      <button className="pick-section-toggle" type="button" onClick={onToggle}>
        <span>{label}</span>
        <b>{count}</b>
        <i>{isOpen ? "收起" : "展開"}</i>
      </button>
      {isOpen && <div className="pick-section-body">{children}</div>}
    </div>
  );
}

function isActivePickRecord(record, room) {
  return !record.cardId && room?.status === "live";
}

function FileUpload({ id, label, file, onChange, required = false }) {
  const generatedId = useId();
  const inputId = id || generatedId;

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
          選擇圖片
        </span>
        <span className={file ? "file-upload-name selected" : "file-upload-name"}>
          {file?.name || "未選擇圖片"}
        </span>
      </label>
    </div>
  );
}

function DrawCard({ profile }) {
  const [rooms, setRooms] = useState([]);
  const [roomsError, setRoomsError] = useState("");
  const [cardLibrary, setCardLibrary] = useState([]);
  const cardCategories = useCardCategories(cardLibrary);
  const [roomSlug, setRoomSlug] = useState(getRoomSlugFromUrl);
  const [slots, setSlots] = useState([]);
  const [buyingNumber, setBuyingNumber] = useState(null);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [selectedSlotNumber, setSelectedSlotNumber] = useState(null);
  const [selectedRound, setSelectedRound] = useState("");

  useEffect(() => {
    const drawsQuery = query(
      collection(db, "draws"),
      orderBy("createdAt", "desc"),
    );
    const stopDraws = onSnapshot(
      drawsQuery,
      (snapshot) => {
        const allDraws = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setRooms(allDraws);
        setRoomsError("");
      },
      async (error) => {
        console.error("Room list listener failed.", error);
        setRoomsError(getSafeErrorMessage(error, "未能載入房間。"));
        try {
          const fallbackSnapshot = await getDocs(collection(db, "draws"));
          const fallbackRooms = fallbackSnapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setRooms(fallbackRooms);
        } catch (fallbackError) {
          console.error("Room list fallback failed.", fallbackError);
          setRoomsError(getSafeErrorMessage(fallbackError, "未能載入房間。"));
        }
      },
    );

    return stopDraws;
  }, []);

  useEffect(() => {
    const cardsQuery = query(collection(db, "cards"), orderBy("createdAt", "desc"));
    const stopCards = onSnapshot(
      cardsQuery,
      (snapshot) => {
        setCardLibrary(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (error) => {
        console.error("Card library listener failed.", error);
      },
    );

    return stopCards;
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

  const selectedRoomCards = useMemo(
    () => buildRoomCards(selectedRoom, cardLibrary),
    [selectedRoom, cardLibrary],
  );

  const selectedTargetCard = useMemo(
    () => selectedRoomCards.find((card) => card.id === selectedCardId) || null,
    [selectedCardId, selectedRoomCards],
  );
  const roundOptions = useMemo(() => getRoomRoundOptions(selectedRoom), [selectedRoom]);
  const activeRoundId = useMemo(
    () => selectedRound || getDefaultRoomRound(selectedRoom),
    [selectedRoom, selectedRound],
  );
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.number === selectedSlotNumber) || null,
    [selectedSlotNumber, slots],
  );

  useEffect(() => {
    setSelectedCardId("");
    setSelectedSlotNumber(null);
    setSelectedRound(getDefaultRoomRound(selectedRoom));
  }, [selectedRoom]);

  useEffect(() => {
    setSelectedSlotNumber(null);
  }, [activeRoundId, selectedCardId]);

  useEffect(() => {
    if (!selectedRoom?.id || !activeRoundId) {
      setSlots([]);
      return undefined;
    }

    const slotsQuery = query(
      collection(db, "draws", selectedRoom.id, "rounds", activeRoundId, "slots"),
      orderBy("number", "asc"),
    );
    const stopSlots = onSnapshot(slotsQuery, async (snapshot) => {
      const roundSlots = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      if (roundSlots.length || activeRoundId !== "round-001") {
        setSlots(roundSlots);
        return;
      }

      const legacySnapshot = await getDocs(
        query(collection(db, "draws", selectedRoom.id, "slots"), orderBy("number", "asc")),
      );
      setSlots(legacySnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return stopSlots;
  }, [activeRoundId, selectedRoom?.id]);

  useEffect(() => {
    if (!selectedSlotNumber) return;
    const latestSlot = slots.find((slot) => slot.number === selectedSlotNumber);
    if (latestSlot && latestSlot.status !== "available" && latestSlot.uid !== profile?.uid) {
      setSelectedSlotNumber(null);
    }
  }, [profile?.uid, selectedSlotNumber, slots]);

  async function buySlot(slot) {
    if (!selectedRoom || selectedRoom.status !== "live") return;
    if (activeRoundId !== toRoundId(getRoomCurrentRound(selectedRoom))) {
      alert("此場次已鎖定，請切換到目前場次購買。");
      return;
    }
    if (!profile?.uid) {
      alert("玩家資料仍在載入，請稍後再試。");
      return;
    }
    if (!selectedTargetCard) {
      alert("請先選擇你想抽的卡牌。");
      return;
    }
    if (!slot) {
      alert("請先選擇號碼。");
      return;
    }

    const confirmed = window.confirm(
      `確認用 ${formatTokenNumber(selectedTargetCard.tokenValue || selectedRoom.tokenCost)} 代幣鎖定 #${slot.number}？`,
    );
    if (!confirmed) return;

    setBuyingNumber(slot.number);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", profile.uid);
        const slotRef = doc(
          db,
          "draws",
          selectedRoom.id,
          "rounds",
          activeRoundId,
          "slots",
          String(slot.number),
        );
        const recordRef = doc(collection(db, "drawRecords"));
        const userSnap = await transaction.get(userRef);
        const slotSnap = await transaction.get(slotRef);
        const currentTokens = Number(userSnap.data()?.tokens || 0);
        const tokenCost = Number(selectedTargetCard.tokenValue || selectedRoom.tokenCost || 10);

        if (!slotSnap.exists() || slotSnap.data().status !== "available") {
          throw new Error("這個號碼已被選走。");
        }

        if (currentTokens < tokenCost) {
          throw new Error(`你需要 ${tokenCost} 代幣才可購買此號碼。`);
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
          targetCardId: selectedTargetCard.id,
          targetCardName: selectedTargetCard.name,
          targetCardImageUrl: selectedTargetCard.imageUrl || "",
          targetCardValue: tokenCost,
          round: activeRoundId,
          updatedAt: serverTimestamp(),
        });
        transaction.set(recordRef, {
          uid: profile.uid,
          username: profile.username,
          drawId: selectedRoom.id,
          drawTitle: selectedRoom.title,
          roomSlug: selectedRoom.slug || selectedRoom.id,
          roomLink: makeRoomLink(selectedRoom.id),
          round: activeRoundId,
          roundSort: getRoundSortValue(activeRoundId),
          number: slot.number,
          tokenCost,
          targetCardId: selectedTargetCard.id,
          targetCardName: selectedTargetCard.name,
          targetCardImageUrl: selectedTargetCard.imageUrl || "",
          targetCardValue: tokenCost,
          createdAt: serverTimestamp(),
        });
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setBuyingNumber(null);
      setSelectedSlotNumber(null);
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
    return <RoomList rooms={rooms} error={roomsError} onOpenRoom={openRoom} />;
  }

  if (!selectedRoom) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>找不到房間</h2>
        <p className="muted">這個房間連結暫時沒有可用資料。</p>
        <button className="primary-btn" type="button" onClick={backToRooms}>
          返回房間列表
        </button>
      </section>
    );
  }

  return (
    <>
      <button className="small-btn back-link" type="button" onClick={backToRooms}>
        返回房間列表
      </button>
      <div className="draw-layout">
        <section className="panel">
          <div className="section-heading">
            <Gavel size={24} />
            <div>
              <p className="eyebrow">Live room</p>
              <h1>{selectedRoom.title}</h1>
            </div>
          </div>
          <KickEmbed kickUrl={selectedRoom.kickUrl} title={selectedRoom.title} />
          <div className="draw-meta">
            <span>{selectedRoom.cardCount} 張卡</span>
            <span>{formatRoundLabel(activeRoundId)}</span>
            <span>⚡ {selectedTargetCard?.tokenValue || selectedRoom.tokenCost} 入場</span>
            <span>{statusLabels[selectedRoom.status] || selectedRoom.status}</span>
            <span>房間：{selectedRoom.title}</span>
          </div>
        </section>
        <CardPoolPreview
          draw={selectedRoom}
          cards={selectedRoomCards}
          cardCategories={cardCategories}
          selectedCardId={selectedCardId}
          onSelectCard={setSelectedCardId}
        />

        <NumberGrid
          draw={selectedRoom}
          slots={slots}
          profile={profile}
          selectedCard={selectedTargetCard}
          activeRoundId={activeRoundId}
          roundOptions={roundOptions}
          selectedSlotNumber={selectedSlotNumber}
          buyingNumber={buyingNumber}
          onRoundChange={setSelectedRound}
          onSelectNumber={setSelectedSlotNumber}
          onBuy={() => buySlot(selectedSlot)}
        />
        {selectedRoom.status === "live" && (
          <ChatRoom drawId={selectedRoom.id} profile={profile} />
        )}
      </div>
    </>
  );
}

function RoomList({ rooms, error, onOpenRoom }) {
  if (error && !rooms.length) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>無法載入房間</h2>
        <p className="muted">{error}</p>
      </section>
    );
  }

  if (!rooms.length) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>暫時沒有房間</h2>
        <p className="muted">管理員可於管理後台建立新的抽卡房間。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="banner-slot">Banner 位置</div>
      <div className="section-heading">
        <Gavel size={24} />
        <div>
          <p className="eyebrow">Rooms</p>
          <h1>抽卡房間</h1>
        </div>
        <button className="small-btn" type="button">
          玩法介紹
        </button>
      </div>
      {error && <p className="form-note">Live room refresh warning: {error}</p>}
      <div className="room-list-grid">
        {rooms.map((room, index) => {
          const roomCards = normalizeRoomCards(room.poolCards);
          const roomValues = roomCards
            .map((card) => Number(card.tokenValue || 0))
            .filter((value) => value > 0);
          const minValue = roomValues.length ? Math.min(...roomValues) : Number(room.tokenCost || 0);
          const maxValue = roomValues.length ? Math.max(...roomValues) : Number(room.tokenCost || 0);
          const priceText =
            minValue === maxValue
              ? formatTokenNumber(minValue)
              : `${formatTokenNumber(minValue)}-${formatTokenNumber(maxValue)}`;

          return (
            <button
              className="room-card"
              key={room.id}
              type="button"
              onClick={() => onOpenRoom(room)}
            >
              <div className="room-card-media">
                {room.thumbnailUrl ? (
                  <img src={room.thumbnailUrl} alt={`${room.title} thumbnail`} />
                ) : (
                  <div className="image-placeholder">
                    <Gavel size={30} />
                  </div>
                )}
                <span className={`room-state ${room.status}`}>
                  {statusLabels[room.status] || room.status}
                </span>
              </div>
              <div className="room-card-body">
                <strong>{String(index + 7).padStart(2, "0")} 號房</strong>
                <div className="room-price-row">
                  <span>入場價</span>
                  <b>⚡ {priceText}</b>
                </div>
                <div className="room-progress">
                  <span style={{ width: `${room.status === "live" ? 55 : 14}%` }} />
                </div>
                <div className="room-sub-row">
                  <span>中卡率 50%</span>
                  <span>{room.status === "live" ? "18:42 後開播" : "22:00 開播"}</span>
                </div>
                <span>
                  {room.title} · {formatRoundLabel(toRoundId(getRoomCurrentRound(room)))} / 共 {getRoomRoundCount(room)} 場 · {room.cardCount} 個號碼
                </span>
                <span className="room-cta">
                  {room.status === "live" ? "確認入場" : "查看房間"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CardPoolPreview({ draw, cards, cardCategories, selectedCardId, onSelectCard }) {
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const categories = useMemo(
    () => getCardCategories(cards, cardCategories),
    [cardCategories, cards],
  );
  const visibleCards = useMemo(
    () =>
      cards
        .filter((card) => categoryFilter === "全部" || getCardCategory(card) === categoryFilter)
        .sort((a, b) => Number(b.tokenValue || 0) - Number(a.tokenValue || 0)),
    [cards, categoryFilter],
  );

  return (
    <section className="panel card-pool-preview">
      <div>
        <p className="eyebrow">第一步</p>
        <h2>先選您想要的PSA10卡</h2>
      </div>
      <span>共 {cards.length || draw.cardCount || 0} 張可選</span>
      {cards.length ? (
        <>
          <div className="category-filter">
            {categories.map((category) => (
              <button
                className={categoryFilter === category ? "active" : ""}
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="pool-card-grid">
            {visibleCards.map((card) => (
              <button
                className={selectedCardId === card.id ? "pool-card selected" : "pool-card"}
                key={card.id}
                type="button"
                onClick={() => onSelectCard(card.id)}
              >
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.name} />
                ) : (
                  <div className="image-placeholder">
                    <Package size={24} />
                  </div>
                )}
                <strong>{card.name}</strong>
                <small>{getCardCategory(card)}</small>
                <span>⚡ {formatTokenNumber(card.tokenValue)}</span>
              </button>
            ))}
          </div>
        </>
      ) : draw.poolText ? (
        <p>{draw.poolText}</p>
      ) : (
        <div className="pool-empty">管理員指定的卡池會顯示在這裡。</div>
      )}
    </section>
  );
}

function NumberGrid({
  draw,
  slots,
  profile,
  selectedCard,
  activeRoundId,
  roundOptions,
  selectedSlotNumber,
  buyingNumber,
  onRoundChange,
  onSelectNumber,
  onBuy,
}) {
  if (draw.status !== "live") {
    return (
      <section className="panel empty-state compact-empty">
        <Gavel size={32} />
        <h2>{draw.title}</h2>
        <p className="muted">
          房間已建立，但還未開始直播。管理員設定為直播中後，選號區會顯示在這裡。
        </p>
      </section>
    );
  }

  const currentRoundId = toRoundId(getRoomCurrentRound(draw));
  const activeRoundSort = getRoundSortValue(activeRoundId);
  const currentRoundSort = getRoundSortValue(currentRoundId);
  const roundIsCurrent = activeRoundId === currentRoundId;
  const roundLockedReason = activeRoundSort < currentRoundSort ? "已過場" : "未開場";
  const mySlots = slots.filter((slot) => slot.uid === profile?.uid);
  const selectedNumber = selectedSlotNumber || buyingNumber || null;
  const canPay = Boolean(roundIsCurrent && selectedCard && selectedSlotNumber && !buyingNumber);

  return (
    <section className="panel number-panel">
      <div className="section-heading compact number-heading">
        <div>
          <p className="eyebrow">第二步</p>
          <h2>選擇天堂地獄號碼</h2>
        </div>
      </div>
      <div className="round-selector" aria-label="選擇場次">
        {roundOptions.map((roundId) => (
          <button
            className={activeRoundId === roundId ? "active" : ""}
            key={roundId}
            type="button"
            onClick={() => onRoundChange(roundId)}
          >
            {formatRoundLabel(roundId)}
          </button>
        ))}
      </div>
      <p className="muted number-help">
        {!roundIsCurrent
          ? `${formatRoundLabel(activeRoundId)}${roundLockedReason}，只可以查看紀錄，不能再鎖定號碼。`
          : selectedCard
          ? `已選 ${selectedCard.name}，${formatRoundLabel(activeRoundId)}共 ${draw.cardCount} 個號碼，已被選走的號碼無法重選。`
          : "請先在第一步選擇卡牌，然後才可選號。"}
      </p>
      <div className="slot-grid">
        {slots.map((slot) => {
          const locked = slot.status !== "available";
          const mine = locked && slot.uid === profile?.uid;
          const selected = roundIsCurrent && !locked && slot.number === selectedSlotNumber;
          return (
            <button
              className={
                mine
                  ? "slot mine"
                  : locked
                    ? "slot locked"
                    : selected
                      ? "slot selected"
                      : "slot"
              }
              disabled={!roundIsCurrent || !selectedCard || locked || buyingNumber === slot.number}
              key={slot.id}
              type="button"
              onClick={() => onSelectNumber(slot.number)}
            >
              <strong>{slot.number}</strong>
              <small>
                {mine
                  ? "你的號碼"
                  : !roundIsCurrent
                    ? roundLockedReason
                  : locked
                    ? slot.username || "已被選走"
                    : buyingNumber === slot.number
                      ? "購買中..."
                      : selected
                        ? "已選"
                        : "可選"}
              </small>
            </button>
          );
        })}
      </div>
      <div className="number-legend">
        <span><i />可選</span>
        <span><i />已被選走</span>
        <span><i />我的號碼</span>
      </div>
      <div className="number-divider" />
      <div className="selected-number-row">
        <span>
          你在{formatRoundLabel(activeRoundId)}已鎖 {mySlots.length} 個號碼
        </span>
        <strong>{selectedNumber ? `#${selectedNumber}` : "--"}</strong>
      </div>
      <button
        className="number-pay-bar"
        type="button"
        disabled={!canPay}
        onClick={onBuy}
      >
        <span>
          {selectedCard && selectedSlotNumber
            ? `付款 ⚡ ${formatTokenNumber(selectedCard.tokenValue || draw.tokenCost)} 並鎖定號碼`
            : !roundIsCurrent
              ? roundLockedReason
            : selectedCard
              ? "先選擇號碼"
              : "先選擇卡牌"}
        </span>
      </button>
    </section>
  );
}

function KickEmbed({ kickUrl, title }) {
  const embedUrl = toKickEmbedUrl(kickUrl);

  if (!embedUrl) {
    return <div className="stream-fallback">尚未設定 Kick 直播連結</div>;
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
  const [cooldownMs, setCooldownMs] = useState(0);

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

  useEffect(() => {
    const lastChatAt = profile?.lastChatAt;
    if (!lastChatAt?.toMillis) {
      setCooldownMs(0);
      return undefined;
    }

    function tick() {
      setCooldownMs(
        Math.max(0, CHAT_COOLDOWN_MS - (Date.now() - lastChatAt.toMillis())),
      );
    }

    tick();
    if (CHAT_COOLDOWN_MS - (Date.now() - lastChatAt.toMillis()) <= 0) {
      return undefined;
    }

    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [profile?.lastChatAt]);

  async function sendMessage(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || sending || cooldownMs > 0) return;

    setSending(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", profile.uid);
        const messageRef = doc(collection(db, "draws", drawId, "messages"));
        const userSnap = await transaction.get(userRef);
        const lastChatAt = userSnap.data()?.lastChatAt;

        if (lastChatAt?.toMillis) {
          const elapsed = Date.now() - lastChatAt.toMillis();
          if (elapsed < CHAT_COOLDOWN_MS) {
            const waitSec = Math.ceil((CHAT_COOLDOWN_MS - elapsed) / 1000);
            throw new Error(`請等待 ${waitSec} 秒後再發送訊息。`);
          }
        }

        transaction.update(userRef, {
          lastChatAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(messageRef, {
          drawId,
          source: "draw",
          uid: profile.uid,
          username: profile.username,
          text: cleanText.slice(0, 500),
          createdAt: serverTimestamp(),
        });
      });
      setText("");
    } catch (error) {
      showSafeError(error);
    } finally {
      setSending(false);
    }
  }

  const cooldownSec = Math.ceil(cooldownMs / 1000);
  const sendDisabled = sending || cooldownMs > 0 || !text.trim();

  return (
    <section className="panel chat-panel">
      <div className="section-heading compact">
        <ListChecks size={22} />
        <div>
          <p className="eyebrow">Room chat</p>
          <h2>房間聊天</h2>
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
          <p className="muted">這個房間暫時未有訊息。</p>
        )}
      </div>
      <form className="chat-form" onSubmit={sendMessage}>
        <input
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="輸入房間訊息"
          disabled={sending}
        />
        <button className="primary-btn" type="submit" disabled={sendDisabled}>
          <Send size={18} />
          {sending ? "發送中..." : cooldownMs > 0 ? `等待 ${cooldownSec} 秒` : "發送"}
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
  const tokenPackages = useTokenPackages();
  const [selectedPackage, setSelectedPackage] = useState(tokenPackages[0].hkd);
  const [customHkd, setCustomHkd] = useState("");
  const [proof, setProof] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [fpsName, setFpsName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const usingCustomAmount = selectedPackage === "custom";
  const hkdAmount = usingCustomAmount ? Number(customHkd || 0) : Number(selectedPackage);
  const tokenAmount = usingCustomAmount
    ? calculateTokenAmount(hkdAmount)
    : tokenPackages.find((item) => item.hkd === hkdAmount)?.tokens || 0;

  useEffect(() => {
    if (
      selectedPackage !== "custom" &&
      !tokenPackages.some((item) => item.hkd === Number(selectedPackage))
    ) {
      setSelectedPackage(tokenPackages[0].hkd);
    }
  }, [selectedPackage, tokenPackages]);

  useEffect(() => {
    const requestsQuery = query(
      collection(db, "tokenRequests"),
      where("uid", "==", profile.uid),
    );
    const stopRequests = onSnapshot(requestsQuery, (snapshot) => {
      setRequests(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
      );
    });

    return stopRequests;
  }, [profile.uid]);

  async function submitRequest(event) {
    event.preventDefault();

    if (hkdAmount < 500 || tokenAmount < 1) {
      alert("請選擇套餐，或輸入最少 HK$500 的自訂金額。");
      return;
    }
    if (!fpsName.trim()) {
      alert("請輸入 FPS 轉帳人姓名，方便管理員核對。");
      return;
    }

    setSubmitting(true);
    try {
      const proofInfo = await createProofInfo({
        proof,
        profile,
        amount: tokenAmount,
      });

      await addDoc(collection(db, "tokenRequests"), {
        uid: profile.uid,
        username: profile.username,
        email: profile.email || "",
        amount: tokenAmount,
        hkdAmount,
        exchangeRate: tokenAmount / hkdAmount,
        packageType: usingCustomAmount ? "custom" : "preset",
        fpsName: fpsName.trim(),
        ...proofInfo,
        status: "pending",
        adminNote: "",
        promoCode: promoCode.trim(),
        createdAt: serverTimestamp(),
      });

      setProof(null);
      setPromoCode("");
      setFpsName("");
      setSelectedPackage(tokenPackages[0].hkd);
      setCustomHkd("");
    } catch (error) {
      showSafeError(error);
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
            <p className="eyebrow">Token request</p>
            <h1>申請代幣</h1>
          </div>
        </div>
        <form className="stack-form" onSubmit={submitRequest}>
          <div className="form-field">
            <span>選擇充值金額</span>
            <div className="token-package-grid">
              {tokenPackages.map((item) => (
                <button
                  className={selectedPackage === item.hkd ? "token-package selected" : "token-package"}
                  key={item.hkd}
                  type="button"
                  onClick={() => setSelectedPackage(item.hkd)}
                >
                  <strong>HK${formatTokenNumber(item.hkd)}</strong>
                  <span>⚡ {formatTokenNumber(item.tokens)} 代幣</span>
                </button>
              ))}
              <button
                className={usingCustomAmount ? "token-package selected" : "token-package"}
                type="button"
                onClick={() => setSelectedPackage("custom")}
              >
                <strong>自訂金額</strong>
                <span>HK$500 起</span>
              </button>
            </div>
          </div>
          {usingCustomAmount && (
            <label>
              自訂付款金額（HKD）
              <input
                type="number"
                min="500"
                step="1"
                value={customHkd}
                onChange={(event) => setCustomHkd(event.target.value)}
                placeholder="例如 2500"
                required
              />
            </label>
          )}
          <div className="token-preview">
            <span>申請代幣</span>
            <strong>⚡ {formatTokenNumber(tokenAmount)}</strong>
            <small>付款金額 HK${formatTokenNumber(hkdAmount)}</small>
          </div>
          <label>
            FPS 轉帳人姓名
            <input
              value={fpsName}
              onChange={(event) => setFpsName(event.target.value)}
              placeholder="請填入付款戶口姓名"
              required
            />
          </label>
        <FileUpload
            label="付款證明圖片"
            file={proof}
            onChange={setProof}
            required
          />
          <label>
            推廣活動邀請碼（選填）
            <input
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value)}
              placeholder="輸入 Giveaway 活動代碼"
            />
          </label>
          <p className="form-note">
            代幣兌換率可由管理員審核。上傳銀行轉帳截圖後，審核完成會自動加到帳戶。
          </p>
          <button className="primary-btn" type="submit" disabled={submitting}>
            <FileImage size={18} />
            {submitting ? "提交中..." : "提交申請"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading compact">
          <Clock3 size={22} />
          <div>
            <p className="eyebrow">Status</p>
            <h2>我的代幣申請</h2>
          </div>
        </div>
        <RequestList requests={requests} />
      </section>
    </div>
  );
}

async function createProofInfo({ proof, profile }) {
  if (!proof) {
    throw new Error("請上傳 JPEG、PNG 或 WebP 付款證明。");
  }

  const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  const contentType = proof.type || "";
  if (!allowedTypes.has(contentType)) {
    throw new Error("付款證明必須是 JPEG、PNG 或 WebP 圖片。");
  }

  const safeName = proof.name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "proof.jpg";
  const proofPath = `token-proofs/${profile.uid}/${Date.now()}-${safeName}`;
  const proofRef = ref(storage, proofPath);
  await uploadBytes(proofRef, proof, { contentType });

  return {
    proofMode: "storage",
    proofPath,
    proofFileName: safeName,
    proofUrl: await getDownloadURL(proofRef),
  };
}

function RequestList({ requests, adminMode = false, onApprove, onReject }) {
  if (!requests.length) {
    return <p className="muted">暫時未有申請。</p>;
  }

  return (
    <div className="record-list">
      {requests.map((request) => (
        <article className="record-item" key={request.id}>
          <div className="request-main">
            <span className="coin-dot">⚡</span>
            <div>
              <strong>
                {request.amount} 代幣
                {adminMode && request.username ? ` - ${request.username}` : ""}
              </strong>
              <span>{formatDate(request.createdAt)}</span>
              {request.hkdAmount && <span>付款金額：HK${formatTokenNumber(request.hkdAmount)}</span>}
              {request.fpsName && <span>FPS 戶名：{request.fpsName}</span>}
              {request.promoCode && <span>活動碼：{request.promoCode}</span>}
            </div>
          </div>
          <div className="record-actions">
            <span className={`status-badge ${request.status}`}>
              {statusLabels[request.status] || request.status}
            </span>
            {request.proofUrl && (
              <a href={request.proofUrl} target="_blank" rel="noreferrer">
                {request.proofMode === "dummy" ? "測試證明" : "付款證明"}{" "}
                <ExternalLink size={15} />
              </a>
            )}
            {adminMode && request.status === "pending" && (
              <>
                <button className="small-btn" type="button" onClick={() => onApprove(request)}>
                  <Check size={15} />
                  批准
                </button>
                <button className="small-btn danger" type="button" onClick={() => onReject(request)}>
                  <X size={15} />
                  駁回
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
  const [slotRecords, setSlotRecords] = useState([]);
  const [roomsById, setRoomsById] = useState({});
  const [recordsError, setRecordsError] = useState("");

  useEffect(() => {
    const roomsQuery = query(collection(db, "draws"), orderBy("createdAt", "desc"));
    const stopRooms = onSnapshot(
      roomsQuery,
      (snapshot) => {
        setRoomsById(
          Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }])),
        );
      },
      (error) => {
        console.error("History room listener failed.", error);
      },
    );

    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    const stopRecords = onSnapshot(
      recordsQuery,
      (snapshot) => {
        setRecords(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
        );
        setRecordsError("");
      },
      (error) => {
        console.error("Draw records listener failed.", error);
        setRecordsError(getSafeErrorMessage(error, "未能載入我的紀錄。"));
      },
    );

    return () => {
      stopRooms();
      stopRecords();
    };
  }, [profile.uid]);

  useEffect(() => {
    const roomIds = Object.keys(roomsById);
    if (!roomIds.length) {
      setSlotRecords([]);
      return undefined;
    }

    const slotsByRoom = {};
    const stops = roomIds.map((roomId) => {
      const slotQuery = query(
        collection(db, "draws", roomId, "slots"),
        where("uid", "==", profile.uid),
      );

      return onSnapshot(
        slotQuery,
        (snapshot) => {
          slotsByRoom[roomId] = snapshot.docs.map((item) => ({
            id: `slot-${roomId}-${item.id}`,
            drawId: roomId,
            number: Number(item.data().number || item.id),
            tokenCost: Number(item.data().tokenCost || 0),
            targetCardId: item.data().targetCardId || "",
            targetCardName: item.data().targetCardName || "",
            targetCardImageUrl: item.data().targetCardImageUrl || "",
            targetCardValue: Number(item.data().targetCardValue || item.data().tokenCost || 0),
            createdAt: item.data().updatedAt || item.data().createdAt,
            slotOnly: true,
          }));
          setSlotRecords(Object.values(slotsByRoom).flat());
        },
        (error) => {
          console.error("Slot history listener failed.", error);
        },
      );
    });

    return () => stops.forEach((stop) => stop());
  }, [profile.uid, roomsById]);

  const mergedRecords = useMemo(
    () => mergePurchaseRecords(records, slotRecords, roomsById),
    [records, roomsById, slotRecords],
  );

  return (
    <section className="panel">
      <div className="section-heading">
        <ListChecks size={24} />
        <div>
          <p className="eyebrow">Draw history</p>
          <h1>我的紀錄</h1>
        </div>
      </div>
      {recordsError && <p className="form-note">{recordsError}</p>}
      {mergedRecords.length ? (
        <div className="history-table">
          <div className="history-head">
            <span>房間</span>
            <span>目標卡</span>
            <span>號碼</span>
            <span>入場費</span>
            <span>狀態</span>
          </div>
          {mergedRecords.map((record) => (
            <article className="history-row" key={record.id}>
              <span>{record.roomSlug || record.drawId}</span>
              <strong>{record.targetCardName || record.cardName || record.drawTitle}</strong>
              <b>#{record.number}</b>
              <span>⚡ {formatTokenNumber(record.tokenCost)}</span>
              <span className={`status-badge ${record.cardId ? "approved" : "pending"}`}>
                {record.cardId ? "已完成" : "待開"}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">你已購買的抽卡號碼會顯示在這裡。</p>
      )}
    </section>
  );
}

function CollectionPage({ profile }) {
  const [records, setRecords] = useState([]);
  const [activeStatus, setActiveStatus] = useState("pending");
  const [collectionError, setCollectionError] = useState("");

  useEffect(() => {
    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    const stopRecords = onSnapshot(
      recordsQuery,
      (snapshot) => {
        setRecords(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
            .filter((record) => record.cardId && !record.convertedToTokens),
        );
        setCollectionError("");
      },
      (error) => {
        console.error("Collection listener failed.", error);
        setCollectionError(getSafeErrorMessage(error, "未能載入我的卡牌。"));
      },
    );

    return stopRecords;
  }, [profile.uid]);

  const visibleRecords = records.filter(
    (record) => (record.collectionStatus || "pending") === activeStatus,
  );
  const totalValue = records.reduce(
    (sum, record) => sum + Number(record.cardValue || record.tokenCost || 0),
    0,
  );
  const totalRefundValue = records.reduce(
    (sum, record) => sum + getCardConversionRefund(record),
    0,
  );

  async function convertCardToTokens(record, { skipConfirm = false } = {}) {
    const refund = getCardConversionRefund(record);

    if (!refund || record.convertedToTokens) return;

    if (!skipConfirm) {
      const originalValue = Number(record.cardValue || record.tokenCost || 0);
      const confirmed = window.confirm(
        `將「${record.cardName}」以 8 折轉回 ${formatTokenNumber(refund)} 代幣？原值 ⚡ ${formatTokenNumber(originalValue)}。`,
      );
      if (!confirmed) return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", profile.uid);
        const recordRef = doc(db, "drawRecords", record.id);
        const userSnap = await transaction.get(userRef);
        const recordSnap = await transaction.get(recordRef);

        if (!recordSnap.exists() || recordSnap.data().uid !== profile.uid) {
          throw new Error("找不到這張卡牌紀錄。");
        }
        if (recordSnap.data().convertedToTokens) {
          throw new Error("這張卡牌已經轉回代幣。");
        }
        const latestRefund = getCardConversionRefund(recordSnap.data());
        if (latestRefund !== refund) {
          throw new Error("卡牌代幣價值已更新，請重新整理後再試。");
        }

        transaction.update(recordRef, {
          collectionStatus: "converted",
          convertedToTokens: true,
          convertedAt: serverTimestamp(),
          tokenRefund: refund,
          updatedAt: serverTimestamp(),
        });
        transaction.update(userRef, {
          tokens: Number(userSnap.data()?.tokens || 0) + refund,
          lastConversionRecordId: record.id,
          lastConversionAmount: refund,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      showSafeError(error);
    }
  }

  async function convertVisibleCards() {
    if (!visibleRecords.length) return;

    const totalRefund = visibleRecords.reduce(
      (sum, record) => sum + getCardConversionRefund(record),
      0,
    );
    const confirmed = window.confirm(
      `將目前 ${visibleRecords.length} 張卡牌以 8 折轉回 ${formatTokenNumber(totalRefund)} 代幣？`,
    );
    if (!confirmed) return;

    for (const record of visibleRecords) {
      // Keep one transaction per card so a single old record cannot block the rest.
      await convertCardToTokens(record, { skipConfirm: true });
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <Boxes size={24} />
        <div>
          <p className="eyebrow">Collection</p>
          <h1>我的卡牌</h1>
          <p className="muted">管理員配發的卡牌會顯示待處理、出貨中或已送達狀態。</p>
        </div>
      </div>
      {records.length ? (
        <>
        <div className="collection-tabs">
          {collectionStatuses.map((status) => (
            <button
              className={activeStatus === status ? "active" : ""}
              type="button"
              key={status}
              onClick={() => setActiveStatus(status)}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
        <div className="collection-summary">
          <div>
            <span>卡片總值</span>
            <strong>
              <span className="coin-dot">⚡</span>
              {formatTokenNumber(totalValue)}
            </strong>
          </div>
          <div>
            <span>轉點 8 折</span>
            <strong>⚡ {formatTokenNumber(totalRefundValue)}</strong>
          </div>
          <div>
            <span>此分頁</span>
            <strong>{visibleRecords.length} 張卡</strong>
          </div>
          <button className="small-btn" type="button" onClick={convertVisibleCards}>
            轉換為點數
          </button>
          <button className="primary-btn" type="button">申請發送</button>
        </div>
        {visibleRecords.length ? (
          <div className="collection-grid">
            {visibleRecords.map((record) => (
              <article className="collection-card" key={record.id}>
                {record.cardImageUrl ? (
                  <img src={record.cardImageUrl} alt={record.cardName} />
                ) : (
                  <div className="image-placeholder">
                    <Package size={30} />
                  </div>
                )}
                <span className="card-check">✓</span>
                <div>
                  <strong>{record.cardName}</strong>
                  <span>{record.cardCategory || "其他"}</span>
                  <span>
                    {record.drawTitle} · #{record.number}
                  </span>
                  <span className={`status-badge ${record.collectionStatus || "pending"}`}>
                    {statusLabels[record.collectionStatus || "pending"]}
                  </span>
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => convertCardToTokens(record)}
                  >
                    8 折轉回 {formatTokenNumber(getCardConversionRefund(record))} 代幣
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">這個狀態暫時未有卡牌。</p>
        )}
        </>
      ) : (
        <>
          {collectionError && <p className="form-note">{collectionError}</p>}
          <p className="muted">
            管理員分配結果後，卡牌與配送狀態會顯示在這裡。
          </p>
        </>
      )}
    </section>
  );
}

function AdminPanel({ profile }) {
  const [activeAdminSection, setActiveAdminSection] = useState("rooms");
  const [requests, setRequests] = useState([]);
  const [draws, setDraws] = useState([]);
  const [cards, setCards] = useState([]);
  const [records, setRecords] = useState([]);
  const activeSection =
    ADMIN_SECTIONS.find((section) => section.id === activeAdminSection) || ADMIN_SECTIONS[0];
  const ActiveIcon = activeSection.icon;

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
          tokens: increment(Number(requestSnap.data().amount || 0)),
          lastTokenGrantRequestId: request.id,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      showSafeError(error);
    }
  }

  async function rejectRequest(request) {
    const reason = window.prompt("駁回原因（可選）：", "");

    await updateDoc(doc(db, "tokenRequests", request.id), {
      status: "rejected",
      adminNote: reason || "",
      reviewedAt: serverTimestamp(),
      reviewedBy: profile.uid,
    });
  }

  async function completeDraw(draw) {
    const confirmed = window.confirm(
      `完成並刪除「${draw.title}」？購買紀錄會保留，用於分配結果和收藏紀錄。`,
    );
    if (!confirmed) return;

    try {
      await deleteRoomWithChildren(draw.id);
    } catch (error) {
      showSafeError(error);
    }
  }

  async function copyRoomLink(draw) {
    await navigator.clipboard.writeText(makeRoomLink(draw.id));
  }

  return (
    <div className="admin-workspace">
      <section className="panel admin-menu-panel">
        <div className="section-heading compact">
          <Shield size={22} />
          <div>
            <p className="eyebrow">Admin tools</p>
            <h2>管理後台</h2>
          </div>
        </div>
        <div className="admin-function-grid">
          {ADMIN_SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            return (
              <button
                className={activeAdminSection === section.id ? "admin-function active" : "admin-function"}
                key={section.id}
                type="button"
                onClick={() => setActiveAdminSection(section.id)}
              >
                <SectionIcon size={20} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="admin-content-heading">
        <ActiveIcon size={24} />
        <div>
          <p className="eyebrow">{activeSection.eyebrow}</p>
          <h1>{activeSection.label}</h1>
        </div>
      </div>

      {activeAdminSection === "create-room" && (
        <div className="admin-section">
          <CreateDrawForm profile={profile} cards={cards} />
        </div>
      )}
      {activeAdminSection === "cards" && (
        <div className="admin-section">
          <CreateCardForm cards={cards} profile={profile} />
        </div>
      )}
      {activeAdminSection === "packages" && (
        <div className="admin-section narrow-admin-section">
          <TokenPackageManager profile={profile} />
        </div>
      )}
      {activeAdminSection === "requests" && (
        <section className="panel admin-section narrow-admin-section">
          <RequestList
            requests={requests}
            adminMode
            onApprove={approveRequest}
            onReject={rejectRequest}
          />
        </section>
      )}
      {activeAdminSection === "rooms" && (
        <section className="panel admin-section">
          <RoomManagementList
            cards={cards}
            draws={draws}
            onCompleteDraw={completeDraw}
            onCopyRoomLink={copyRoomLink}
          />
        </section>
      )}
      {activeAdminSection === "records" && (
        <div className="admin-section">
          <AdminRoomRecordsPanel cards={cards} records={records} profile={profile} />
        </div>
      )}
    </div>
  );
}

function RoomManagementList({ cards, draws, onCompleteDraw, onCopyRoomLink }) {
  if (!draws.length) {
    return <p className="muted">暫時未有房間。</p>;
  }

  return (
    <div className="room-manage-list">
      {draws.map((draw) => (
        <article className="room-manage-card" key={draw.id}>
          <div className="room-manage-summary">
            <div className="room-manage-main">
              <RoomThumbnail draw={draw} />
              <div>
                <strong>{draw.title}</strong>
                <span>
                  {draw.cardCount} 張卡 · {getRoomRoundCount(draw)} 場 · 目前{" "}
                  {formatRoundLabel(toRoundId(getRoomCurrentRound(draw)))} · ⚡ {draw.tokenCost} 入場
                </span>
                <span className="room-link-text">{makeRoomLink(draw.id)}</span>
                <span className={`status-badge ${draw.status}`}>
                  {statusLabels[draw.status] || draw.status}
                </span>
              </div>
            </div>
            <div className="record-actions">
              <button className="small-btn" type="button" onClick={() => onCopyRoomLink(draw)}>
                <Copy size={15} />
                複製連結
              </button>
              {draw.status === "live" && (
                <button className="small-btn" type="button" onClick={() => onCompleteDraw(draw)}>
                  <CopyCheck size={15} />
                  完成並刪除
                </button>
              )}
            </div>
          </div>
          <RoomRoundSettings draw={draw} />
          <RoomPoolEditor draw={draw} cards={cards} />
        </article>
      ))}
    </div>
  );
}

function TokenPackageManager({ profile }) {
  const savedPackages = useTokenPackages();
  const [drafts, setDrafts] = useState(savedPackages);
  const [saving, setSaving] = useState(false);
  const hasChanges = JSON.stringify(normalizeTokenPackages(drafts)) !== JSON.stringify(savedPackages);

  useEffect(() => {
    setDrafts(savedPackages);
  }, [savedPackages]);

  function updatePackage(index, field, value) {
    setDrafts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addPackage() {
    setDrafts((current) => [...current, { hkd: "", tokens: "" }]);
  }

  function removePackage(index) {
    setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function savePackages() {
    const packages = normalizeTokenPackages(drafts);

    if (!packages.length) {
      alert("請最少保留一個代幣套餐。");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "tokenPackages"), {
        packages,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-heading compact">
        <BadgeDollarSign size={22} />
        <div>
          <p className="eyebrow">Token packages</p>
          <h2>代幣套餐設定</h2>
        </div>
      </div>
      <div className="package-editor">
        <div className="package-editor-head">
          <span>付款 HKD</span>
          <span>代幣數量</span>
          <span />
        </div>
        {drafts.map((item, index) => (
          <div className="package-editor-row" key={`${index}-${item.hkd}`}>
            <input
              type="number"
              min="1"
              value={item.hkd}
              onChange={(event) => updatePackage(index, "hkd", event.target.value)}
            />
            <input
              type="number"
              min="1"
              value={item.tokens}
              onChange={(event) => updatePackage(index, "tokens", event.target.value)}
            />
            <button
              className="small-btn danger"
              type="button"
              onClick={() => removePackage(index)}
              disabled={drafts.length <= 1}
            >
              <X size={15} />
              刪除
            </button>
          </div>
        ))}
      </div>
      <div className="package-editor-actions">
        <button className="small-btn" type="button" onClick={addPackage}>
          <Plus size={15} />
          新增套餐
        </button>
        <button
          className="primary-btn"
          type="button"
          onClick={savePackages}
          disabled={saving || !hasChanges}
        >
          <Save size={17} />
          {saving ? "儲存中..." : "儲存套餐"}
        </button>
      </div>
      <p className="form-note">
        玩家申請代幣頁會即時使用這裡的套餐。自訂金額仍會按系統 bonus 規則自動計算。
      </p>
    </section>
  );
}

function AdminRoomRecordsPanel({ cards, records, profile }) {
  const [roomFilter, setRoomFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [drawRecordStatus, setDrawRecordStatus] = useState("active");
  const [selectedCards, setSelectedCards] = useState({});
  const [selectedStatuses, setSelectedStatuses] = useState({});
  const [assigningId, setAssigningId] = useState("");
  const purchaseRecords = records
    .filter((record) => record.uid && record.number)
    .sort(compareRoomRoundRecords);
  const rooms = Array.from(
    new Map(
      purchaseRecords.map((record) => [
        record.drawId || record.roomSlug || record.drawTitle || "unknown",
        record.drawTitle || record.roomSlug || record.drawId || "未命名房間",
      ]),
    ),
  );
  const visibleRecords =
    roomFilter === "all"
      ? purchaseRecords
      : purchaseRecords.filter((record) => (record.drawId || record.roomSlug) === roomFilter);
  const rounds = Array.from(
    new Set(visibleRecords.map((record) => record.round || "round-001")),
  ).sort(compareRoundNames);
  const filteredRecords =
    roundFilter === "all"
      ? visibleRecords
      : visibleRecords.filter((record) => (record.round || "round-001") === roundFilter);
  const activeRecords = filteredRecords.filter((record) => !record.cardId);
  const completedRecords = filteredRecords.filter((record) => record.cardId);
  const visibleStatusRecords =
    drawRecordStatus === "completed" ? completedRecords : activeRecords;
  const totalSpend = visibleStatusRecords.reduce(
    (sum, record) => sum + Number(record.tokenCost || record.targetCardValue || 0),
    0,
  );

  useEffect(() => {
    setRoundFilter("all");
  }, [roomFilter]);

  function updateSelection(recordId, value) {
    setSelectedCards((current) => ({ ...current, [recordId]: value }));
  }

  function updateStatus(recordId, value) {
    setSelectedStatuses((current) => ({ ...current, [recordId]: value }));
  }

  async function assignCard(record) {
    const cardId = selectedCards[record.id] || record.cardId || record.targetCardId;
    const card = cards.find((item) => item.id === cardId);
    const collectionStatus =
      selectedStatuses[record.id] || record.collectionStatus || "pending";

    if (!card) {
      alert("請選擇要分配的卡牌。");
      return;
    }

    setAssigningId(record.id);
    try {
      const cardValue = Number(card.tokenValue || record.targetCardValue || record.tokenCost || 0);
      await updateDoc(doc(db, "drawRecords", record.id), {
        cardId: card.id,
        cardName: card.name,
        cardCategory: getCardCategory(card),
        cardImageUrl: card.imageUrl || "",
        cardValue,
        collectionStatus,
        assignedAt: serverTimestamp(),
        assignedBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setAssigningId("");
    }
  }

  return (
    <section className="panel wide">
      <div className="section-heading compact">
        <ListChecks size={22} />
        <div>
          <p className="eyebrow">Room records</p>
          <h2>房間購買紀錄 / 分配抽卡結果</h2>
          <p className="muted">
            用房間同場次篩選後，直接查看購買資料並分配實際抽中卡牌。
          </p>
        </div>
      </div>
      <div className="admin-record-toolbar">
        <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}>
          <option value="all">全部房間</option>
          {rooms.map(([roomId, roomTitle]) => (
            <option key={roomId} value={roomId}>
              {roomTitle}
            </option>
          ))}
        </select>
        <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
          <option value="all">全部場次</option>
          {rounds.map((round) => (
            <option key={round} value={round}>
              {round}
            </option>
          ))}
        </select>
        <strong>{visibleStatusRecords.length} 筆紀錄</strong>
        <strong>合共 ⚡ {formatTokenNumber(totalSpend)}</strong>
      </div>
      <div className="collection-tabs admin-status-tabs">
        <button
          className={drawRecordStatus === "active" ? "active" : ""}
          type="button"
          onClick={() => setDrawRecordStatus("active")}
        >
          正在抽卡 {activeRecords.length}
        </button>
        <button
          className={drawRecordStatus === "completed" ? "active" : ""}
          type="button"
          onClick={() => setDrawRecordStatus("completed")}
        >
          已完成抽卡 {completedRecords.length}
        </button>
      </div>
      {visibleStatusRecords.length ? (
        <div className="admin-record-card-list">
          {visibleStatusRecords.map((record) => {
            const selectedCard =
              cards.find((card) =>
                card.id === (selectedCards[record.id] || record.cardId || record.targetCardId),
              ) ||
              null;
            const previewImage =
              selectedCard?.imageUrl || record.cardImageUrl || record.targetCardImageUrl || "";
            const previewName = selectedCard?.name || record.cardName || record.targetCardName || "";
            const previewValue =
              selectedCard?.tokenValue || record.cardValue || record.targetCardValue || 0;

            return (
              <article className="admin-record-card" key={record.id}>
                <div className="admin-record-card-main">
                  <div>
                    <span className="record-label">房間</span>
                    <strong>{record.drawTitle || "未命名房間"}</strong>
                    <small>{record.roomSlug || record.drawId} · {record.round || "round-001"}</small>
                    <small>{formatDate(record.createdAt)}</small>
                  </div>
                  <div>
                    <span className="record-label">玩家</span>
                    <strong>{record.username || "未命名玩家"}</strong>
                    <small>{record.uid}</small>
                  </div>
                  <div className="record-number-tile">
                    <span>號碼</span>
                    <b>#{record.number}</b>
                  </div>
                  <div className="record-number-tile">
                    <span>花費</span>
                    <b>⚡ {formatTokenNumber(record.tokenCost || record.targetCardValue || 0)}</b>
                  </div>
                  <div>
                    <span className="record-label">玩家選擇卡牌</span>
                    <strong>{record.targetCardName || "未選卡牌"}</strong>
                    <small>
                      {record.targetCardValue
                        ? `價值 ⚡ ${formatTokenNumber(record.targetCardValue)}`
                        : "未有價值"}
                    </small>
                  </div>
                </div>
                <div className="record-assignment-cell">
                  <span className="record-label">分配結果</span>
                  <div className="assignment-preview compact-preview">
                    {previewImage ? (
                      <img src={previewImage} alt={previewName || "Selected card"} />
                    ) : (
                      <div className="assignment-placeholder">
                        <Package size={18} />
                      </div>
                    )}
                    <span>
                      {previewName || "未分配"}
                      {previewValue ? ` · ⚡ ${formatTokenNumber(previewValue)}` : ""}
                    </span>
                  </div>
                  {record.cardName && (
                    <small className="assigned-note">
                      已分配：{record.cardName}（{statusLabels[record.collectionStatus]}）
                    </small>
                  )}
                </div>
                <div className="assignment-controls inline-assignment-controls">
                  <select
                    value={selectedCards[record.id] || record.cardId || record.targetCardId || ""}
                    onChange={(event) => updateSelection(record.id, event.target.value)}
                  >
                    <option value="">選擇卡牌</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name} · ⚡ {formatTokenNumber(card.tokenValue || 0)}
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
                    {assigningId === record.id ? "儲存中..." : "分配"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">暫時未有購買紀錄。</p>
      )}
    </section>
  );
}

function CreateCardForm({ cards, profile }) {
  const cardCategories = useCardCategories(cards);
  const [newCard, setNewCard] = useState({
    name: "",
    tokenValue: 10,
    category: CARD_CATEGORIES[0],
    imageFile: null,
  });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [savingCategory, setSavingCategory] = useState("");
  const [cardDrafts, setCardDrafts] = useState({});
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingCardId, setSavingCardId] = useState("");
  const importInputId = useId();

  useEffect(() => {
    setCardDrafts((current) => {
      const nextDrafts = {};
      cards.forEach((card) => {
        nextDrafts[card.id] = current[card.id] || createCardDraft(card);
      });
      return nextDrafts;
    });
  }, [cards]);

  useEffect(() => {
    setCategoryDrafts((current) =>
      Object.fromEntries(cardCategories.map((category) => [category, current[category] ?? category])),
    );
  }, [cardCategories]);

  function resetCardDraft(card) {
    setCardDrafts((current) => ({
      ...current,
      [card.id]: createCardDraft(card),
    }));
  }

  function cardDraftChanged(card, draft) {
    return (
      String(draft.name || "") !== String(card.name || "") ||
      String(draft.category || CARD_CATEGORIES[0]) !== getCardCategory(card) ||
      Number(draft.tokenValue || 0) !== Number(card.tokenValue || 0) ||
      Boolean(draft.imageFile)
    );
  }

  function updateNewCard(field, value) {
    setNewCard((current) => ({ ...current, [field]: value }));
  }

  function updateDraft(cardId, field, value) {
    setCardDrafts((current) => ({
      ...current,
      [cardId]: {
        ...(current[cardId] || {}),
        [field]: value,
      },
    }));
  }

  async function addCardCategory() {
    const cleanCategory = normalizeCardCategory(newCategoryName);
    if (cleanCategory === "其他" && String(newCategoryName || "").trim() !== "其他") {
      alert("請輸入分類名稱。");
      return;
    }
    if (cardCategories.includes(cleanCategory)) {
      alert("這個分類已經存在。");
      return;
    }

    try {
      const nextCategories = normalizeCardCategories([...cardCategories, cleanCategory]);
      await setDoc(doc(db, "settings", "cardCategories"), {
        categories: nextCategories,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      setNewCategoryName("");
      setNewCard((current) => ({ ...current, category: cleanCategory }));
    } catch (error) {
      showSafeError(error);
    }
  }

  async function renameCardCategory(category) {
    const cleanCategory = normalizeCardCategory(categoryDrafts[category]);
    if (!cleanCategory) {
      alert("請輸入分類名稱。");
      return;
    }
    if (cleanCategory === category) {
      alert("分類未有改動。");
      return;
    }
    if (cardCategories.includes(cleanCategory)) {
      alert("這個分類已經存在。");
      return;
    }
    if (!window.confirm(`確認將分類「${category}」改名為「${cleanCategory}」？`)) {
      return;
    }

    setSavingCategory(category);
    try {
      const nextCategories = normalizeCardCategories(
        cardCategories.map((item) => (item === category ? cleanCategory : item)),
      );
      await setDoc(doc(db, "settings", "cardCategories"), {
        categories: nextCategories,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      await renameCategoryInCards(category, cleanCategory);
      setNewCard((current) => ({
        ...current,
        category: current.category === category ? cleanCategory : current.category,
      }));
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingCategory("");
    }
  }

  async function deleteCardCategory(category) {
    if (category === "其他") {
      alert("「其他」分類不能刪除。");
      return;
    }
    if (cards.some((card) => getCardCategory(card) === category)) {
      alert("仍有卡牌使用這個分類。請先把相關卡牌改到其他分類，再刪除。");
      return;
    }
    if (!window.confirm(`確認刪除分類「${category}」？`)) {
      return;
    }

    setSavingCategory(category);
    try {
      const nextCategories = cardCategories.filter((item) => item !== category);
      await setDoc(doc(db, "settings", "cardCategories"), {
        categories: nextCategories,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      setNewCard((current) => ({
        ...current,
        category: current.category === category ? CARD_CATEGORIES[0] : current.category,
      }));
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingCategory("");
    }
  }

  async function createCard(event) {
    event.preventDefault();
    const cleanName = newCard.name.trim();

    if (!cleanName) {
      alert("請輸入卡牌名稱。");
      return;
    }
    if (!newCard.imageFile) {
      alert("請先上傳卡牌圖片。");
      return;
    }
    if (Number(newCard.tokenValue) < 1) {
      alert("卡牌代幣價值最少為 1。");
      return;
    }
    if (!window.confirm(`確認新增「${cleanName}」到卡牌庫？`)) {
      return;
    }

    setCreating(true);
    try {
      const imageUrl = await imageFileToCompressedDataUrl(
        newCard.imageFile,
        CARD_IMAGE_COMPRESSION,
      );

      await addDoc(collection(db, "cards"), {
        name: cleanName,
        category: newCard.category || CARD_CATEGORIES[0],
        tokenValue: Number(newCard.tokenValue),
        imageUrl,
        imageMode: "compressed-data-url",
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewCard({ name: "", tokenValue: 10, category: CARD_CATEGORIES[0], imageFile: null });
    } catch (error) {
      showSafeError(error);
    } finally {
      setCreating(false);
    }
  }

  async function saveCardEdit(card) {
    const draft = cardDrafts[card.id] || {};
    const cleanName = String(draft.name || "").trim();
    const cleanTokenValue = Number(draft.tokenValue || 0);

    if (!cleanName) {
      alert("請輸入卡牌名稱。");
      return;
    }
    if (cleanTokenValue < 1) {
      alert("卡牌代幣價值最少為 1。");
      return;
    }
    if (!cardDraftChanged(card, draft)) {
      alert("這張卡未有改動。");
      return;
    }
    if (!window.confirm(`確認儲存「${cleanName}」的卡牌資料？`)) {
      return;
    }

    setSavingCardId(card.id);
    try {
      const updates = {
        name: cleanName,
        category: draft.category || CARD_CATEGORIES[0],
        tokenValue: cleanTokenValue,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      };

      if (draft.imageFile) {
        updates.imageUrl = await imageFileToCompressedDataUrl(
          draft.imageFile,
          CARD_IMAGE_COMPRESSION,
        );
        updates.imageMode = "compressed-data-url";
      }

      await updateDoc(doc(db, "cards", card.id), updates);
      await updateAssignedRecordsForCard(card.id, {
        cardName: cleanName,
        cardCategory: draft.category || CARD_CATEGORIES[0],
        cardValue: cleanTokenValue,
        ...(updates.imageUrl ? { cardImageUrl: updates.imageUrl } : {}),
        updatedAt: serverTimestamp(),
      });
      await updateRoomPoolCardsForCard(card.id, {
        name: cleanName,
        category: draft.category || CARD_CATEGORIES[0],
        tokenValue: cleanTokenValue,
      });
      setCardDrafts((current) => ({
        ...current,
        [card.id]: {
          name: cleanName,
          category: draft.category || CARD_CATEGORIES[0],
          tokenValue: cleanTokenValue,
          imageFile: null,
        },
      }));
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingCardId("");
    }
  }

  function exportCardsCsv() {
    const csvRows = cards.map((card) => ({
      id: card.id,
      name: card.name || "",
      category: getCardCategory(card),
      tokenValue: Number(card.tokenValue || 0),
      imageUrl: card.imageUrl || "",
    }));
    const csvText = createCsvText(["id", "name", "category", "tokenValue", "imageUrl"], csvRows);
    downloadTextFile(`draw-card-library-${new Date().toISOString().slice(0, 10)}.csv`, csvText);
  }

  async function importCardsCsv(file) {
    if (!file) return;
    if (!window.confirm("確認匯入 CSV？同名或同 ID 的卡牌會被更新。")) {
      return;
    }

    setImporting(true);
    try {
      const importedRows = normalizeImportedCardRows(
        parseDelimitedText(await file.text()),
      );

      if (!importedRows.length) {
        alert("Excel/CSV 入面未有可匯入的卡牌。");
        return;
      }

      const importedCategories = normalizeCardCategories([
        ...cardCategories,
        ...importedRows.map((row) => row.category),
      ]);
      if (importedCategories.length !== cardCategories.length) {
        await setDoc(doc(db, "settings", "cardCategories"), {
          categories: importedCategories,
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        });
      }

      const cardsById = new Map(cards.map((card) => [card.id, card]));
      const cardsByName = new Map(
        cards.map((card) => [String(card.name || "").trim().toLowerCase(), card]),
      );
      let createdCount = 0;
      let updatedCount = 0;

      for (const row of importedRows) {
        const matchedCard =
          (row.id && cardsById.get(row.id)) ||
          cardsByName.get(row.name.toLowerCase()) ||
          null;
        const updates = {
          name: row.name,
          category: row.category || CARD_CATEGORIES[0],
          tokenValue: row.tokenValue,
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        };

        if (row.imageUrl) {
          updates.imageUrl = row.imageUrl;
          updates.imageMode = row.imageUrl.startsWith("data:image/")
            ? "imported-data-url"
            : "external-url";
        }

        if (matchedCard) {
          await updateDoc(doc(db, "cards", matchedCard.id), updates);
          await updateAssignedRecordsForCard(matchedCard.id, {
            cardName: row.name,
            cardCategory: row.category || CARD_CATEGORIES[0],
            cardValue: row.tokenValue,
            ...(row.imageUrl ? { cardImageUrl: row.imageUrl } : {}),
            updatedAt: serverTimestamp(),
          });
          await updateRoomPoolCardsForCard(matchedCard.id, {
            name: row.name,
            category: row.category || CARD_CATEGORIES[0],
            tokenValue: row.tokenValue,
          });
          updatedCount += 1;
        } else {
          const docData = {
            name: row.name,
            category: row.category || CARD_CATEGORIES[0],
            tokenValue: row.tokenValue,
            imageUrl: row.imageUrl || "",
            imageMode: row.imageUrl
              ? row.imageUrl.startsWith("data:image/")
                ? "imported-data-url"
                : "external-url"
              : "excel-import-no-image",
            createdBy: profile.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await addDoc(collection(db, "cards"), docData);
          createdCount += 1;
        }
      }

      alert(`匯入完成：新增 ${createdCount} 張，更新 ${updatedCount} 張。`);
    } catch (error) {
      showSafeError(error);
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="panel card-library-panel">
      <div className="section-heading">
        <ImagePlus size={24} />
        <div>
          <p className="eyebrow">Card library</p>
          <h1>卡牌庫管理</h1>
          <p className="muted">像表格一樣新增或修改圖片、名稱和代幣價值。</p>
        </div>
      </div>

      <div className="card-sheet-toolbar">
        <button className="small-btn" type="button" onClick={exportCardsCsv}>
          <Download size={15} />
          匯出 Excel CSV
        </button>
        <label className={importing ? "small-btn disabled" : "small-btn"} htmlFor={importInputId}>
          <Upload size={15} />
          {importing ? "匯入中..." : "匯入 Excel CSV"}
          <input
            id={importInputId}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={(event) => importCardsCsv(event.target.files?.[0] || null)}
            disabled={importing}
          />
        </label>
        <span className="form-note">
          CSV 欄位：id、name、category、tokenValue、imageUrl。保留 id 可更新現有卡；留空 id 會新增。
        </span>
      </div>

      <div className="category-manager">
        <div>
          <strong>分類管理</strong>
          <span>可以新增、改名或刪除未使用的分類。</span>
        </div>
        <input
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
          placeholder="新增分類，例如：Trainer"
        />
        <button className="small-btn" type="button" onClick={addCardCategory}>
          <Plus size={15} />
          新增分類
        </button>
      </div>
      <div className="category-edit-list">
        {cardCategories.map((category) => {
          const inUseCount = cards.filter((card) => getCardCategory(card) === category).length;
          const draftValue = categoryDrafts[category] ?? category;
          const changed = draftValue !== category;
          const saving = savingCategory === category;
          return (
            <div className="category-edit-row" key={category}>
              <input
                value={draftValue}
                onChange={(event) =>
                  setCategoryDrafts((current) => ({
                    ...current,
                    [category]: event.target.value,
                  }))
                }
              />
              <span>{inUseCount} 張卡使用中</span>
              <button
                className="small-btn"
                type="button"
                onClick={() => renameCardCategory(category)}
                disabled={saving || !changed}
              >
                <Save size={15} />
                {saving && changed ? "儲存中..." : "儲存"}
              </button>
              <button
                className="small-btn danger"
                type="button"
                onClick={() => deleteCardCategory(category)}
                disabled={saving || category === "其他" || inUseCount > 0}
              >
                <X size={15} />
                刪除
              </button>
            </div>
          );
        })}
      </div>

      <div className="card-sheet">
        <div className="card-sheet-row card-sheet-head">
          <span>圖片</span>
          <span>卡牌名稱</span>
          <span>分類</span>
          <span>代幣價值</span>
          <span>操作</span>
        </div>

        <form className="card-sheet-row card-sheet-new" onSubmit={createCard}>
          <ImageCellPicker
            file={newCard.imageFile}
            imageUrl=""
            label="新增圖片"
            onChange={(file) => updateNewCard("imageFile", file)}
          />
          <input
            value={newCard.name}
            onChange={(event) => updateNewCard("name", event.target.value)}
            placeholder="例如：Pikachu AR"
            required
          />
          <select
            value={newCard.category}
            onChange={(event) => updateNewCard("category", event.target.value)}
          >
            {cardCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={newCard.tokenValue}
            onChange={(event) => updateNewCard("tokenValue", event.target.value)}
            required
          />
          <button className="primary-btn" type="submit" disabled={creating}>
            <Save size={18} />
            {creating ? "建立中..." : "新增"}
          </button>
        </form>

        <div className="card-sheet-body">
          {cards.length ? (
            cards.map((card) => {
              const draft = cardDrafts[card.id] || {
                name: card.name || "",
                category: getCardCategory(card),
                tokenValue: Number(card.tokenValue || 10),
                imageFile: null,
              };
              const changed = cardDraftChanged(card, draft);
              return (
                <div className={changed ? "card-sheet-row has-draft" : "card-sheet-row"} key={card.id}>
                  <ImageCellPicker
                    file={draft.imageFile}
                    imageUrl={card.imageUrl}
                    label="更換圖片"
                    onChange={(file) => updateDraft(card.id, "imageFile", file)}
                  />
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft(card.id, "name", event.target.value)}
                  />
                  <select
                    value={draft.category || CARD_CATEGORIES[0]}
                    onChange={(event) => updateDraft(card.id, "category", event.target.value)}
                  >
                    {cardCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={draft.tokenValue}
                    onChange={(event) => updateDraft(card.id, "tokenValue", event.target.value)}
                  />
                  <div className="card-row-actions">
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => saveCardEdit(card)}
                      disabled={savingCardId === card.id || !changed}
                    >
                      <Save size={15} />
                      {savingCardId === card.id ? "儲存中..." : changed ? "確認儲存" : "已儲存"}
                    </button>
                    {changed && (
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => resetCardDraft(card)}
                        disabled={savingCardId === card.id}
                      >
                        <RefreshCcw size={15} />
                        還原
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="muted card-sheet-empty">暫時未建立卡牌。</p>
          )}
        </div>
      </div>
      <p className="form-note">
        上傳圖片會先壓縮成 WebP：盡量縮細檔案，同時保留可用清晰度。
      </p>
    </section>
  );
}

function ImageCellPicker({ imageUrl, file, label, onChange }) {
  const generatedId = useId();
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return (
    <label className="image-cell-picker" htmlFor={generatedId}>
      <input
        id={generatedId}
        type="file"
        accept="image/*"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <span className="image-cell-preview">
        {file ? (
          <img src={previewUrl} alt="" />
        ) : imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <Package size={22} />
        )}
      </span>
      <span className="image-cell-text">
        <FileImage size={15} />
        {file?.name || label}
      </span>
    </label>
  );
}

function RoomPoolEditor({ draw, cards }) {
  const [selectedIds, setSelectedIds] = useState(
    getRoomPoolIds(draw),
  );
  const savedIds = useMemo(() => getRoomPoolIds(draw), [draw]);
  const [cardSearch, setCardSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const hasUnsavedChanges = useMemo(
    () => !sameIdSet(selectedIds, savedIds),
    [savedIds, selectedIds],
  );
  const filteredCards = useMemo(
    () => filterCards(cards, cardSearch),
    [cards, cardSearch],
  );

  useEffect(() => {
    setSelectedIds(getRoomPoolIds(draw));
  }, [draw]);

  function toggleCard(cardId) {
    setSelectedIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId],
    );
  }

  async function saveRoomCards() {
    const poolCards = cards
      .filter((card) => selectedIds.includes(card.id))
      .map(roomCardPayload);
    const poolCardValues = Object.fromEntries(
      poolCards.map((card) => [card.id, Number(card.tokenValue || 0)]),
    );

    if (!poolCards.length) {
      alert("請最少選擇一張房間卡牌。");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "draws", draw.id), {
        poolCards,
        poolCardIds: poolCards.map((card) => card.id),
        poolCardValues,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="room-pool-editor">
      <div className="room-pool-header">
        <div>
          <strong>房間可選卡牌</strong>
          <span>{selectedIds.length} 張已選</span>
        </div>
        <button
          className="primary-btn compact-save"
          type="button"
          onClick={saveRoomCards}
          disabled={saving || !hasUnsavedChanges}
        >
          <Save size={16} />
          {saving ? "儲存中..." : "儲存卡池"}
        </button>
      </div>
      {cards.length ? (
        <>
          {hasUnsavedChanges ? (
            <span className="form-note unsaved-note">卡池有更改，按「儲存卡池」後先會更新到 Firebase。</span>
          ) : (
            <span className="form-note">現在顯示的是已儲存卡池。</span>
          )}
          <div className="card-search">
            <Search size={16} />
            <input
              value={cardSearch}
              onChange={(event) => setCardSearch(event.target.value)}
              placeholder="搜尋卡名或代幣"
              type="search"
            />
          </div>
          <div className="mini-card-picker">
            {filteredCards.map((card) => (
              <button
                className={selectedIds.includes(card.id) ? "mini-card selected" : "mini-card"}
                key={card.id}
                type="button"
                onClick={() => toggleCard(card.id)}
              >
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt="" />
                ) : (
                  <span className="mini-card-placeholder">
                    <Package size={15} />
                  </span>
                )}
                <span>{card.name}</span>
                <small>⚡ {formatTokenNumber(card.tokenValue || 0)}</small>
              </button>
            ))}
          </div>
          {!filteredCards.length && <span className="muted">沒有符合搜尋的卡牌。</span>}
        </>
      ) : (
        <span className="muted">請先建立卡牌。</span>
      )}
    </div>
  );
}

function RoomRoundSettings({ draw }) {
  const [totalRounds, setTotalRounds] = useState(String(getRoomRoundCount(draw)));
  const [currentRound, setCurrentRound] = useState(String(getRoomCurrentRound(draw)));
  const [saving, setSaving] = useState(false);
  const savedTotal = getRoomRoundCount(draw);
  const savedCurrent = getRoomCurrentRound(draw);
  const totalRoundNumber = Number(totalRounds);
  const currentRoundNumber = Number(currentRound);
  const hasChanges = totalRoundNumber !== savedTotal || currentRoundNumber !== savedCurrent;

  useEffect(() => {
    setTotalRounds(String(getRoomRoundCount(draw)));
    setCurrentRound(String(getRoomCurrentRound(draw)));
  }, [draw]);

  async function saveRoundSettings() {
    const nextTotal = Math.max(1, Math.min(100, Math.round(Number(totalRounds) || 1)));
    const nextCurrent = Math.max(1, Math.min(nextTotal, Math.round(Number(currentRound) || 1)));

    setSaving(true);
    try {
      await updateDoc(doc(db, "draws", draw.id), {
        totalRounds: nextTotal,
        currentRound: nextCurrent,
        round: toRoundId(nextCurrent),
        updatedAt: serverTimestamp(),
      });
      await ensureRoomRoundSlots(draw.id, rangeNumbers(1, nextTotal), Number(draw.cardCount || 30));
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="room-round-settings">
      <label>
        總場數
        <input
          type="number"
          min="1"
          max="100"
          value={totalRounds}
          onChange={(event) => setTotalRounds(event.target.value)}
        />
      </label>
      <label>
        目前場次
        <input
          type="number"
          min="1"
          max={totalRounds}
          value={currentRound}
          onChange={(event) => setCurrentRound(event.target.value)}
        />
      </label>
      <button
        className="small-btn"
        type="button"
        onClick={saveRoundSettings}
        disabled={saving || !hasChanges}
      >
        <Save size={15} />
        {saving ? "儲存中..." : "儲存場次"}
      </button>
    </div>
  );
}

function CreateDrawForm({ profile, cards }) {
  const [form, setForm] = useState(DEFAULT_DRAW);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [cardSearch, setCardSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const filteredCards = useMemo(
    () => filterCards(cards, cardSearch),
    [cards, cardSearch],
  );

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleRoomCard(cardId) {
    setSelectedCardIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId],
    );
  }

  async function createDraw(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const cardCount = Number(form.cardCount);
    const tokenCost = Number(form.tokenCost);
    const totalRounds = Number(form.totalRounds);
    const currentRound = Number(form.currentRound);

    if (cardCount < 4 || cardCount > 100) {
      alert("卡牌數量必須介乎 4 至 100。");
      return;
    }
    if (totalRounds < 1 || totalRounds > 100) {
      alert("總場數必須介乎 1 至 100。");
      return;
    }
    if (currentRound < 1 || currentRound > totalRounds) {
      alert("目前場次不能大過總場數。");
      return;
    }
    if (tokenCost < 1) {
      alert("入場代幣最少為 1。");
      return;
    }
    if (!selectedCardIds.length) {
      alert("請最少選擇一張房間卡牌。");
      return;
    }

    setCreating(true);
    try {
      const drawRef = doc(collection(db, "draws"));
      const batch = writeBatch(db);
      const slug = normalizeSlug(form.slug || form.title);
      const poolCards = cards
        .filter((card) => selectedCardIds.includes(card.id))
        .map(roomCardPayload);
      const poolCardValues = Object.fromEntries(
        poolCards.map((card) => [card.id, Number(card.tokenValue || 0)]),
      );
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
        totalRounds,
        currentRound,
        round: toRoundId(currentRound),
        status: form.status,
        poolText: form.poolText.trim(),
        poolCards,
        poolCardIds: poolCards.map((card) => card.id),
        poolCardValues,
        thumbnailUrl,
        thumbnailMode: thumbnailUrl?.startsWith("data:image/")
          ? "compressed-data-url"
          : "external-url",
        roomLink: makeRoomLink(drawRef.id),
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      await ensureRoomRoundSlots(drawRef.id, rangeNumbers(1, totalRounds), cardCount);
      setForm(DEFAULT_DRAW);
      setThumbnailFile(null);
      setSelectedCardIds([]);
      setCardSearch("");
      formElement.reset();
    } catch (error) {
      showSafeError(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel wide">
      <div className="section-heading">
        <Plus size={24} />
        <div>
          <p className="eyebrow">New draw</p>
          <h1>建立抽卡房間</h1>
        </div>
      </div>
      <form className="stack-form" onSubmit={createDraw}>
        <label>
          房間標題
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            required
          />
        </label>
        <label>
          房間連結名稱
          <input
            value={form.slug}
            onChange={(event) => updateField("slug", normalizeSlug(event.target.value))}
            placeholder="tonight-live-draw"
            required
          />
        </label>
        <label>
          Kick 頻道連結
          <input
            value={form.kickUrl}
            onChange={(event) => updateField("kickUrl", event.target.value)}
            placeholder="https://kick.com/channel-name"
            required
          />
        </label>
        <FileUpload
          label="房間主圖"
          file={thumbnailFile}
          onChange={setThumbnailFile}
        />
        <label>
          或輸入主圖網址
          <input
            value={form.thumbnailUrl}
            onChange={(event) => updateField("thumbnailUrl", event.target.value)}
            placeholder="https://..."
          />
        </label>
        <div className="form-row">
          <label>
            卡牌數量
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
            入場代幣
            <input
              type="number"
              min="1"
              value={form.tokenCost}
              onChange={(event) => updateField("tokenCost", event.target.value)}
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            總場數
            <input
              type="number"
              min="1"
              max="100"
              value={form.totalRounds}
              onChange={(event) => updateField("totalRounds", event.target.value)}
              required
            />
          </label>
          <label>
            目前場次
            <input
              type="number"
              min="1"
              max={form.totalRounds || 1}
              value={form.currentRound}
              onChange={(event) => updateField("currentRound", event.target.value)}
              required
            />
          </label>
        </div>
        <div className="form-field">
          <span>房間卡池</span>
          {cards.length ? (
            <>
              <div className="card-search">
                <Search size={17} />
                <input
                  value={cardSearch}
                  onChange={(event) => setCardSearch(event.target.value)}
                  placeholder="搜尋卡名或代幣"
                  type="search"
                />
              </div>
              <div className="room-card-picker">
                {filteredCards.map((card) => (
                  <button
                    className={
                      selectedCardIds.includes(card.id) ? "pool-card selected" : "pool-card"
                    }
                    key={card.id}
                    type="button"
                    onClick={() => toggleRoomCard(card.id)}
                  >
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} />
                    ) : (
                      <div className="image-placeholder">
                        <Package size={22} />
                      </div>
                    )}
                    <strong>{card.name}</strong>
                    <span>⚡ {formatTokenNumber(card.tokenValue || 0)}</span>
                  </button>
                ))}
              </div>
              {!filteredCards.length && <span className="form-note">沒有符合搜尋的卡牌。</span>}
            </>
          ) : (
            <span className="form-note">請先在右邊建立卡牌，再建立房間。</span>
          )}
        </div>
        <label>
          文字備註
          <textarea
            value={form.poolText}
            onChange={(event) => updateField("poolText", event.target.value)}
            placeholder="列出卡名、稀有度、備註或寄送安排。"
            rows={5}
          />
        </label>
        <button className="primary-btn" type="submit" disabled={creating}>
          <Save size={18} />
          {creating ? "建立中..." : "建立房間"}
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

function roomCardPayload(card) {
  return {
    id: card.id,
    name: card.name || "",
    category: getCardCategory(card),
    tokenValue: Number(card.tokenValue || 0),
  };
}

function buildRoomCards(room, cards) {
  if (!room) return [];

  const libraryCards = new Map(cards.map((card) => [String(card.id), card]));
  const legacyCards = new Map(normalizeRoomCards(room.poolCards).map((card) => [card.id, card]));
  const cardIds = getRoomPoolIds(room);

  return cardIds
    .map((cardId) => {
      const libraryCard = libraryCards.get(cardId);
      const legacyCard = legacyCards.get(cardId);
      const source = libraryCard || legacyCard;

      if (!source) return null;

      return {
        id: cardId,
        name: String(source.name || legacyCard?.name || ""),
        category: getCardCategory(source || legacyCard),
        imageUrl: String(libraryCard?.imageUrl || legacyCard?.imageUrl || ""),
        tokenValue: Number(source.tokenValue || legacyCard?.tokenValue || 0),
      };
    })
    .filter((card) => card?.id && card.name);
}

function getRoomPoolIds(room) {
  if (Array.isArray(room?.poolCardIds) && room.poolCardIds.length) {
    return room.poolCardIds.map((cardId) => String(cardId || "")).filter(Boolean);
  }

  return normalizeRoomCards(room?.poolCards).map((card) => card.id);
}

function sameIdSet(leftIds, rightIds) {
  if (leftIds.length !== rightIds.length) return false;

  const rightSet = new Set(rightIds);
  return leftIds.every((id) => rightSet.has(id));
}

function normalizeRoomCards(cards) {
  if (!Array.isArray(cards)) return [];

  return cards
    .map((card) => ({
      id: String(card?.id || ""),
      name: String(card?.name || ""),
      category: getCardCategory(card),
      imageUrl: String(card?.imageUrl || ""),
      tokenValue: Number(card?.tokenValue || 0),
    }))
    .filter((card) => card.id && card.name);
}

function filterCards(cards, searchText) {
  const keyword = String(searchText || "").trim().toLowerCase();
  const sortedCards = [...cards].sort((a, b) => Number(b.tokenValue || 0) - Number(a.tokenValue || 0));
  if (!keyword) return sortedCards;

  return sortedCards.filter((card) => {
    const name = String(card.name || "").toLowerCase();
    const category = getCardCategory(card).toLowerCase();
    const tokenValue = String(card.tokenValue || "");
    return name.includes(keyword) || category.includes(keyword) || tokenValue.includes(keyword);
  });
}

function createCsvText(headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseDelimitedText(text) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = cleanText.includes("\t") ? "\t" : ",";
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitDelimitedLine(lines[0], delimiter).map((header) =>
    header.trim().toLowerCase(),
  );

  return lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      insideQuotes = !insideQuotes;
    } else if (character === delimiter && !insideQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeImportedCardRows(rows) {
  return rows
    .map((row) => {
      const id = String(row.id || "").trim();
      const name = String(row.name || row.cardname || row["card name"] || "").trim();
      const category = normalizeCardCategory(row.category || row.cat || row.type || "");
      const tokenValue = Number(row.tokenvalue || row.price || row.token || row.value || 0);
      const imageUrl = String(row.imageurl || row.image || row.photo || row.picture || "").trim();

      return {
        id,
        name,
        category,
        tokenValue,
        imageUrl,
      };
    })
    .filter((row) => row.name && row.tokenValue > 0);
}

function createCardDraft(card) {
  return {
    name: card.name || "",
    category: getCardCategory(card),
    tokenValue: Number(card.tokenValue || 10),
    imageFile: null,
  };
}

function useTokenPackages() {
  const [packages, setPackages] = useState(TOKEN_PACKAGES);

  useEffect(() => {
    const settingsRef = doc(db, "settings", "tokenPackages");
    const stopSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setPackages(TOKEN_PACKAGES);
          return;
        }

        const nextPackages = normalizeTokenPackages(snapshot.data().packages);
        setPackages(nextPackages.length ? nextPackages : TOKEN_PACKAGES);
      },
      (error) => {
        console.error("Token package settings listener failed.", error);
        setPackages(TOKEN_PACKAGES);
      },
    );

    return stopSettings;
  }, []);

  return packages;
}

function useCardCategories(cards = []) {
  const [categories, setCategories] = useState(CARD_CATEGORIES);

  useEffect(() => {
    const settingsRef = doc(db, "settings", "cardCategories");
    const stopSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        const savedCategories = snapshot.exists() ? snapshot.data().categories : [];
        setCategories(normalizeCardCategories(savedCategories));
      },
      (error) => {
        console.error("Card category settings listener failed.", error);
        setCategories(CARD_CATEGORIES);
      },
    );

    return stopSettings;
  }, []);

  return useMemo(
    () => normalizeCardCategories([...categories, ...cards.map((card) => card.category)]),
    [cards, categories],
  );
}

function normalizeTokenPackages(packages) {
  const uniquePackages = new Map();

  (Array.isArray(packages) ? packages : [])
    .map((item) => ({
      hkd: Number(item?.hkd || 0),
      tokens: Number(item?.tokens || 0),
    }))
    .filter((item) => item.hkd > 0 && item.tokens > 0)
    .forEach((item) => {
      uniquePackages.set(item.hkd, {
        hkd: Math.round(item.hkd),
        tokens: Math.round(item.tokens),
      });
    });

  return [...uniquePackages.values()].sort((left, right) => left.hkd - right.hkd);
}

function calculateTokenAmount(hkdAmount) {
  const amount = Number(hkdAmount || 0);
  if (amount < 500) return 0;

  let bonusRate = 0.05;
  if (amount >= 30000) {
    bonusRate = 0.17;
  } else if (amount >= 10000) {
    bonusRate = 0.1;
  } else if (amount >= 3000) {
    bonusRate = 0.08;
  }

  return Math.floor(amount * 2 * (1 + bonusRate));
}

function normalizeCardCategory(category) {
  const cleanCategory = String(category || "").trim();
  return cleanCategory || "其他";
}

function normalizeCardCategories(categories) {
  const orderedCategories = [...CARD_CATEGORIES, ...(Array.isArray(categories) ? categories : [])]
    .map(normalizeCardCategory)
    .filter(Boolean);
  return [...new Set(orderedCategories)];
}

function getCardCategory(card) {
  return normalizeCardCategory(card?.category || "");
}

function getCardCategories(cards, availableCategories = CARD_CATEGORIES) {
  const categories = new Set(["全部"]);
  normalizeCardCategories([
    ...availableCategories,
    ...cards.map((card) => getCardCategory(card)),
  ]).forEach((category) => categories.add(category));
  return [...categories];
}

function getCardConversionRefund(record) {
  return Math.floor(Number(record.cardValue || record.tokenCost || 0) * CONVERSION_RATE);
}

function compareRoundNames(left, right) {
  return getRoundSortValue(left) - getRoundSortValue(right);
}

function getRoundSortValue(round) {
  const match = String(round || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getRoomRoundCount(room) {
  const totalRounds = Number(room?.totalRounds || 1);
  return Number.isFinite(totalRounds) ? Math.max(1, Math.min(100, Math.round(totalRounds))) : 1;
}

function getRoomCurrentRound(room) {
  const currentRound = Number(room?.currentRound || 1);
  const totalRounds = getRoomRoundCount(room);
  if (!Number.isFinite(currentRound)) return 1;
  return Math.max(1, Math.min(totalRounds, Math.round(currentRound)));
}

function toRoundId(roundNumber) {
  const cleanNumber = Math.max(1, Math.round(Number(roundNumber) || 1));
  return `round-${String(cleanNumber).padStart(3, "0")}`;
}

function getDefaultRoomRound(room) {
  if (!room) return "";
  return room.status === "live" ? toRoundId(getRoomCurrentRound(room)) : "round-001";
}

function getRoomRoundOptions(room) {
  return Array.from({ length: getRoomRoundCount(room) }, (_, index) => toRoundId(index + 1));
}

function formatRoundLabel(round) {
  return `第 ${getRoundSortValue(round) || 1} 場`;
}

function compareRoomRoundRecords(left, right) {
  const leftRoom = String(left.drawTitle || left.roomSlug || left.drawId || "");
  const rightRoom = String(right.drawTitle || right.roomSlug || right.drawId || "");
  const roomCompare = leftRoom.localeCompare(rightRoom);
  if (roomCompare !== 0) return roomCompare;

  const roundCompare = getRoundSortValue(left.round) - getRoundSortValue(right.round);
  if (roundCompare !== 0) return roundCompare;

  return Number(left.number || 0) - Number(right.number || 0);
}

function mergePurchaseRecords(records, slotRecords, roomsById) {
  const recordKeys = new Set(
    records.map((record) => `${record.drawId}-${record.number}-${record.targetCardId || ""}`),
  );
  const fallbackSlots = slotRecords
    .filter((slot) => !recordKeys.has(`${slot.drawId}-${slot.number}-${slot.targetCardId || ""}`))
    .map((slot) => {
      const room = roomsById[slot.drawId] || {};
      return {
        ...slot,
        drawTitle: room.title || "抽卡房間",
        roomSlug: room.slug || slot.drawId,
      };
    });

  return [...records, ...fallbackSlots].sort(
    (left, right) => toMillis(right.createdAt) - toMillis(left.createdAt),
  );
}

function makeRoomLink(roomKey) {
  const cleanSlug = String(roomKey || "").trim();
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return cleanSlug ? `${baseUrl}?room=${encodeURIComponent(cleanSlug)}` : baseUrl;
}

function getRoomSlugFromUrl() {
  return new URLSearchParams(window.location.search).get("room") || "";
}

function rangeNumbers(start, end) {
  const first = Math.round(Number(start) || 1);
  const last = Math.round(Number(end) || first);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function getSafeErrorMessage(error, fallback = "操作失敗，請稍後再試。") {
  const message = String(error?.message || "");

  if (
    message.includes("maximum allowed size") ||
    message.includes("cannot be written because its size")
  ) {
    return "資料太大，未能儲存。請減少圖片大小或卡池數量後再試。";
  }
  if (message.includes("requires an index") || message.includes("create_composite")) {
    return "資料排序需要更新，請重新整理後再試。";
  }
  if (message.includes("Missing or insufficient permissions")) {
    return "權限不足，請重新登入或確認帳戶權限。";
  }
  if (
    message.includes("projects/") ||
    message.includes("databases/") ||
    message.includes("documents/")
  ) {
    return fallback;
  }

  return message || fallback;
}

function showSafeError(error, fallback) {
  console.error(error);
  alert(getSafeErrorMessage(error, fallback));
}

async function deleteRoomWithChildren(drawId) {
  const slotsSnapshot = await getDocs(collection(db, "draws", drawId, "slots"));
  const messagesSnapshot = await getDocs(collection(db, "draws", drawId, "messages"));
  const roundsSnapshot = await getDocs(collection(db, "draws", drawId, "rounds"));
  const allRefs = [
    ...slotsSnapshot.docs.map((item) => item.ref),
    ...messagesSnapshot.docs.map((item) => item.ref),
  ];

  for (const roundItem of roundsSnapshot.docs) {
    const roundSlotsSnapshot = await getDocs(
      collection(db, "draws", drawId, "rounds", roundItem.id, "slots"),
    );
    allRefs.push(...roundSlotsSnapshot.docs.map((item) => item.ref), roundItem.ref);
  }

  allRefs.push(doc(db, "draws", drawId));

  for (let index = 0; index < allRefs.length; index += 450) {
    const batch = writeBatch(db);
    allRefs.slice(index, index + 450).forEach((itemRef) => batch.delete(itemRef));
    await batch.commit();
  }
}

async function ensureRoomRoundSlots(drawId, roundNumbers, cardCount) {
  let batch = writeBatch(db);
  let writes = 0;
  const cleanCardCount = Math.max(4, Math.min(100, Math.round(Number(cardCount) || 30)));

  async function flush() {
    if (!writes) return;
    await batch.commit();
    batch = writeBatch(db);
    writes = 0;
  }

  for (const roundNumber of roundNumbers) {
    const roundId = toRoundId(roundNumber);
    const roundRef = doc(db, "draws", drawId, "rounds", roundId);
    const slotsRef = collection(db, "draws", drawId, "rounds", roundId, "slots");
    const existingSnapshot = await getDocs(slotsRef);
    const existingNumbers = new Set(existingSnapshot.docs.map((item) => item.id));

    batch.set(
      roundRef,
      {
        round: roundId,
        roundNumber,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    writes += 1;

    for (let number = 1; number <= cleanCardCount; number += 1) {
      const slotId = String(number);
      if (existingNumbers.has(slotId)) continue;
      batch.set(doc(db, "draws", drawId, "rounds", roundId, "slots", slotId), {
        number,
        round: roundId,
        status: "available",
        createdAt: serverTimestamp(),
      });
      writes += 1;

      if (writes >= 450) {
        await flush();
      }
    }
  }

  await flush();
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

async function updateRoomPoolCardsForCard(cardId, updates) {
  const roomsSnapshot = await getDocs(
    query(collection(db, "draws"), where("poolCardIds", "array-contains", cardId)),
  );

  for (let index = 0; index < roomsSnapshot.docs.length; index += 450) {
    const batch = writeBatch(db);
    roomsSnapshot.docs.slice(index, index + 450).forEach((item) => {
      const poolCards = normalizeRoomCards(item.data().poolCards)
        .map((card) => (card.id === cardId ? { ...card, ...updates } : card))
        .map(roomCardPayload);
      const poolCardValues = Object.fromEntries(
        poolCards.map((card) => [card.id, Number(card.tokenValue || 0)]),
      );

      batch.update(item.ref, {
        poolCards,
        poolCardIds: poolCards.map((card) => card.id),
        poolCardValues,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

async function renameCategoryInCards(oldCategory, newCategory) {
  const cardsSnapshot = await getDocs(
    query(collection(db, "cards"), where("category", "==", oldCategory)),
  );
  const recordsSnapshot = await getDocs(
    query(collection(db, "drawRecords"), where("cardCategory", "==", oldCategory)),
  );
  const roomsSnapshot = await getDocs(collection(db, "draws"));
  const refsAndUpdates = [];

  cardsSnapshot.docs.forEach((item) => {
    refsAndUpdates.push([
      item.ref,
      {
        category: newCategory,
        updatedAt: serverTimestamp(),
      },
    ]);
  });

  recordsSnapshot.docs.forEach((item) => {
    refsAndUpdates.push([
      item.ref,
      {
        cardCategory: newCategory,
        updatedAt: serverTimestamp(),
      },
    ]);
  });

  roomsSnapshot.docs.forEach((item) => {
    const poolCards = normalizeRoomCards(item.data().poolCards);
    if (!poolCards.some((card) => getCardCategory(card) === oldCategory)) return;
    refsAndUpdates.push([
      item.ref,
      {
        poolCards: poolCards
          .map((card) =>
            getCardCategory(card) === oldCategory ? { ...card, category: newCategory } : card,
          )
          .map(roomCardPayload),
        updatedAt: serverTimestamp(),
      },
    ]);
  });

  for (let index = 0; index < refsAndUpdates.length; index += 450) {
    const batch = writeBatch(db);
    refsAndUpdates.slice(index, index + 450).forEach(([itemRef, updates]) => {
      batch.update(itemRef, updates);
    });
    await batch.commit();
  }
}

function imageFileToCompressedDataUrl(
  file,
  {
    maxWidth = 900,
    maxHeight = 900,
    quality = 0.72,
    minQuality = 0.6,
    targetBytes = 260 * 1024,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not load image."));
      image.onload = async () => {
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        let width = Math.max(1, Math.round(image.width * scale));
        let height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        let bestDataUrl = "";

        try {
          for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
            canvas.width = width;
            canvas.height = height;
            context.clearRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);

            for (
              let currentQuality = quality;
              currentQuality >= minQuality;
              currentQuality -= 0.05
            ) {
              // Browser WebP output keeps card photos clear at smaller sizes.
              const dataUrl = await canvasToDataUrl(canvas, currentQuality);
              bestDataUrl = dataUrl;
              if (estimateDataUrlBytes(dataUrl) <= targetBytes) {
                resolve(dataUrl);
                return;
              }
            }

            width = Math.max(1, Math.round(width * 0.86));
            height = Math.max(1, Math.round(height * 0.86));
          }

          resolve(bestDataUrl || canvas.toDataURL("image/webp", minQuality));
        } catch (error) {
          reject(error);
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function canvasToDataUrl(canvas, quality) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      resolve(canvas.toDataURL("image/webp", quality));
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
        }

        const blobReader = new FileReader();
        blobReader.onerror = () => reject(new Error("Could not read compressed image."));
        blobReader.onload = () => resolve(blobReader.result);
        blobReader.readAsDataURL(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
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

function toMillis(value) {
  if (!value) return 0;
  const date = value instanceof Timestamp ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatTokenNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export default App;
