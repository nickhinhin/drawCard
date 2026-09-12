import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BadgeDollarSign,
  Bell,
  Boxes,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  FileImage,
  Gavel,
  Gift,
  Hash,
  Headphones,
  ImagePlus,
  ListChecks,
  LogIn,
  LogOut,
  Lock,
  Menu,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Shield,
  Smartphone,
  Send,
  Ticket,
  Trash2,
  Truck,
  Upload,
  UserRoundPlus,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import {
  RecaptchaVerifier,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithPhoneNumber,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limitToLast,
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
import { SF_PICKUP_POINTS, SF_PICKUP_POINTS_UPDATED_AT } from "./sfPickupPoints";

const DEFAULT_DRAW = {
  title: "Tonight Live Card Draw",
  slug: "tonight-live-draw",
  kickUrl: "",
  cardCount: 30,
  tokenCost: 10,
  totalRounds: 1,
  currentRound: 1,
  shareMode: "1/2",
  firstRoundAt: "",
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

const LIVE_SNAPSHOT_OPTIONS = { includeMetadataChanges: true };

// Show useful cached data immediately, but keep loading when the cache is empty until the server confirms it.
function isSnapshotReady(snapshot) {
  return !snapshot.metadata.fromCache || !snapshot.empty;
}

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

const ROUND_BUY_LOCKED_LABEL = "本場已停止購買";
const collectionStatuses = ["pending", "shipping", "shipped"];
const betaCollectionStatuses = ["pending", "shipping", "shipped", "converted"];
const CONVERSION_RATE = 0.8;
const CHAT_COOLDOWN_MS = 3000;
const PUBLIC_CARD_SHOWCASE_LIMIT = 12;

function TokenAmount({ value, suffix = "", className = "" }) {
  return (
    <span className={`token-amount ${className}`.trim()}>
      <span className="token-lightning" aria-hidden="true"><Zap size={12} /></span>
      <span>{formatTokenNumber(value)}</span>
      {suffix && <span className="token-suffix">{suffix}</span>}
    </span>
  );
}

function getRoomShareMode(room, roundId = "") {
  const roundValue = roundId && room?.roundShareModes?.[roundId];
  const value = String(roundValue || room?.shareMode || room?.drawMode || "");
  if (value.includes("1/10") || value.includes("十分之一")) return "1/10";
  if (value.includes("1/5") || value.includes("五分之一")) return "1/5";
  return "1/2";
}

function getBlindBoxOdds(shareMode) {
  if (shareMode === "1/10") return { label: "十分之一", heavenRate: 10, hellRate: 90 };
  if (shareMode === "1/5") return { label: "五份之一", heavenRate: 20, hellRate: 80 };
  return { label: "二份之一", heavenRate: 50, hellRate: 50 };
}

const SHARE_MODE_PRICE_KEYS = {
  "1/2": "half",
  "1/5": "fifth",
  "1/10": "tenth",
};
const SHARE_MODES = Object.keys(SHARE_MODE_PRICE_KEYS);

// Cards without an explicit setting predate this feature and remain available in every odds mode.
function getCardAllowedShareModes(card) {
  if (!Array.isArray(card?.allowedShareModes)) return [...SHARE_MODES];
  return SHARE_MODES.filter((mode) => card.allowedShareModes.includes(mode));
}

function cardAllowsShareMode(card, shareMode) {
  return getCardAllowedShareModes(card).includes(shareMode);
}

// Return the card price for the room's odds, while keeping old single-price cards compatible.
function getCardTokenValue(card, shareMode = "1/2") {
  const key = SHARE_MODE_PRICE_KEYS[shareMode] || SHARE_MODE_PRICE_KEYS["1/2"];
  const modeValue = Number(card?.modePrices?.[key]);
  return modeValue > 0 ? modeValue : Number(card?.tokenValue || 0);
}

// Normalize all three prices so cards created before this feature use their existing price by default.
function getCardModePrices(card) {
  const fallback = Math.max(1, Number(card?.tokenValue || 10));
  return {
    half: Math.max(1, Number(card?.modePrices?.half || fallback)),
    fifth: Math.max(1, Number(card?.modePrices?.fifth || fallback)),
    tenth: Math.max(1, Number(card?.modePrices?.tenth || fallback)),
  };
}

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
  if (cleanUsername.length < 3) {
    throw new Error("請先設定 3–24 個英文字母、數字或底線的玩家名稱。");
  }

  await runTransaction(db, async (transaction) => {
    const profileRef = doc(db, "users", uid);
    const claimRef = doc(db, "usernames", key);
    const profileSnap = await transaction.get(profileRef);
    const claimSnap = await transaction.get(claimRef);

    if (!profileSnap.exists()) {
      throw new Error("找不到玩家資料，請重新登入後再試。");
    }

    if (claimSnap.exists()) {
      if (claimSnap.data()?.uid !== uid) {
        throw new Error("這個玩家名稱已被使用，請選擇另一個名稱。");
      }
      if (claimSnap.data()?.username !== cleanUsername) {
        transaction.update(claimRef, { username: cleanUsername });
      }
    } else {
      transaction.set(claimRef, {
        uid,
        username: cleanUsername,
        createdAt: serverTimestamp(),
      });
    }

    if (profileSnap.data()?.username !== cleanUsername) {
      transaction.update(profileRef, {
        username: cleanUsername,
        updatedAt: serverTimestamp(),
      });
    }
  });

  return cleanUsername;
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
  { hkd: 500, tokens: 525 },
  { hkd: 1000, tokens: 1050 },
  { hkd: 3000, tokens: 3240 },
  { hkd: 10000, tokens: 11000 },
  { hkd: 30000, tokens: 35100 },
];
const TOKEN_PACKAGE_RATE_VERSION = 2;

const DEFAULT_VIP_TIERS = [
  { id: "vip0", name: "VIP0", threshold: 3000, rewardCardId: "", rewardName: "M2 卡包" },
  { id: "vip1", name: "VIP1", threshold: 10000, rewardCardId: "", rewardName: "M2A 卡盒" },
  { id: "vip2", name: "VIP2", threshold: 30000, rewardCardId: "", rewardName: "升級實體卡獎勵" },
  { id: "vip3", name: "VIP3", threshold: 100000, rewardCardId: "", rewardName: "升級實體卡獎勵" },
  { id: "vip4", name: "VIP4", threshold: 300000, rewardCardId: "", rewardName: "升級實體卡獎勵" },
];

const ADMIN_SECTIONS = [
  { id: "rooms", label: "房間管理", eyebrow: "Rooms", icon: Gavel },
  { id: "create-room", label: "建立房間", eyebrow: "New draw", icon: Plus },
  { id: "cards", label: "卡牌庫", eyebrow: "Card library", icon: ImagePlus },
  { id: "requests", label: "代幣審核", eyebrow: "Review queue", icon: BadgeDollarSign },
  { id: "packages", label: "套餐設定", eyebrow: "Token packages", icon: Ticket },
  { id: "vip", label: "VIP 設定", eyebrow: "VIP program", icon: Crown },
  { id: "records", label: "購買紀錄", eyebrow: "Room records", icon: ListChecks },
  { id: "shipping", label: "配送需求", eyebrow: "Shipping requests", icon: Truck },
];

const BETA_PAYMENT_SECTION = {
  id: "payment",
  label: "付款設定",
  eyebrow: "Payment settings",
  icon: Copy,
};

const BETA_DEMO_SESSION_KEY = "livedraw-beta-demo";
const BETA_DUMMY_PAYMENT_SETTINGS = {
  fpsIdentifier: "0000000",
  fpsName: "LiveDraw Demo（測試）",
  isDummy: true,
};
const EMPTY_PAYMENT_SETTINGS = {
  fpsIdentifier: "",
  fpsName: "",
  isDummy: false,
};
const BETA_DEMO_PROFILE = {
  uid: "beta-demo-local",
  username: "DemoPlayer",
  displayName: "Demo Player",
  email: "demo@beta.local",
  tokens: 25000,
  role: "user",
  totalDeposits: 1000,
  isDemo: true,
};
const BETA_DEMO_RECORDS = [
  {
    id: "demo-active",
    uid: BETA_DEMO_PROFILE.uid,
    drawId: "demo-live-room",
    drawTitle: "Beta Live Card Draw",
    roomSlug: "beta-live-card-draw",
    round: "round-002",
    number: 17,
    tokenCost: 1200,
    targetCardName: "Pikachu VMAX",
  },
  {
    id: "demo-complete",
    uid: BETA_DEMO_PROFILE.uid,
    drawId: "demo-complete-room",
    drawTitle: "Weekend Card Break",
    roomSlug: "weekend-card-break",
    round: "round-001",
    number: 8,
    tokenCost: 800,
    targetCardName: "Charizard ex",
    cardId: "demo-card-charizard",
    cardName: "Charizard ex",
  },
];
const BETA_DEMO_COLLECTION = [
  {
    ...BETA_DEMO_RECORDS[1],
    id: "demo-card-pending",
    cardId: "demo-card-charizard",
    cardName: "Charizard ex",
    cardValue: 800,
    collectionStatus: "pending",
  },
  {
    id: "demo-card-shipping",
    uid: BETA_DEMO_PROFILE.uid,
    drawTitle: "Sunday Live Draw",
    roomSlug: "sunday-live-draw",
    round: "round-003",
    number: 21,
    cardId: "demo-card-mew",
    cardName: "Mew VMAX",
    cardValue: 650,
    collectionStatus: "shipping",
    trackingNumber: "DEMO123456789",
  },
  {
    id: "demo-card-processed",
    uid: BETA_DEMO_PROFILE.uid,
    drawTitle: "Friday Night Draw",
    roomSlug: "friday-night-draw",
    round: "round-001",
    number: 5,
    cardId: "demo-card-lugia",
    cardName: "Lugia V",
    cardValue: 500,
    collectionStatus: "shipped",
  },
];

function useBetaDemoCards(enabled) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!enabled) {
      setCards([]);
      return undefined;
    }

    const showcaseQuery = query(
      collection(db, "publicCardShowcase"),
      where("active", "==", true),
    );
    return onSnapshot(showcaseQuery, (snapshot) => {
      setCards(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  }, [enabled]);

  return cards;
}

function enrichDemoRecords(records, cards) {
  const cardsWithImages = cards.filter((card) => card.imageUrl);
  if (!cardsWithImages.length) return records;

  return records.map((record, index) => {
    const card = cardsWithImages[index % cardsWithImages.length];
    return {
      ...record,
      targetCardName: card.name || record.targetCardName,
      targetCardImageUrl: card.imageUrl,
      ...(record.cardId
        ? {
            cardName: card.name || record.cardName,
            cardImageUrl: card.imageUrl,
          }
        : {}),
    };
  });
}

function App() {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [demoMode, setDemoMode] = useState(
    () => isBeta && window.sessionStorage.getItem(BETA_DEMO_SESSION_KEY) === "1",
  );
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const googleSignInPendingRef = useRef(false);
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
      }, { merge: true });
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
  const signedIn = Boolean(authUser || demoMode);
  const activeProfile = demoMode ? BETA_DEMO_PROFILE : profile;
  const needsUsername = Boolean(
    authUser && !demoMode && profile && (!profile.username || usernameConflict),
  );
  const isProfileLoading = Boolean(authUser && !demoMode && !profile);

  const tabs = useMemo(
    () => [
      { id: "draw", label: "抽卡", icon: Gavel },
      { id: "tokens", label: "申請代幣", icon: BadgeDollarSign },
      { id: "history", label: "我的紀錄", icon: ListChecks },
      { id: "collection", label: "我的卡牌", icon: Boxes },
      ...(isAdmin || (isBeta && !signedIn)
        ? [{ id: "admin", label: "管理後台", icon: Shield }]
        : []),
    ],
    [isAdmin, isBeta, signedIn],
  );

  async function handleLogin() {
    if (googleSignInPendingRef.current) return;

    googleSignInPendingRef.current = true;
    setAuthError("");
    setSigningIn(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
      setAuthDialogOpen(false);
    } catch (error) {
      const productionRedirectCodes = new Set([
        "auth/popup-blocked",
        "auth/popup-closed-by-user",
        "auth/operation-not-supported-in-this-environment",
      ]);

      if (!isBeta && productionRedirectCodes.has(error?.code)) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setAuthError(getSafeErrorMessage(redirectError, "Google 登入失敗，請再試一次。"));
        }
      } else if (error?.code === "auth/popup-blocked") {
        setAuthError("瀏覽器已封鎖 Google 登入視窗，請允許彈出式視窗後再試。");
      } else if (error?.code === "auth/popup-closed-by-user") {
        setAuthError("Google 登入視窗已關閉，請再試一次。");
      } else if (error?.code === "auth/cancelled-popup-request") {
        setAuthError("上一個 Google 登入視窗已取消，請再試一次。");
      } else {
        setAuthError(getSafeErrorMessage(error, "Google 登入失敗，請再試一次。"));
      }
    } finally {
      googleSignInPendingRef.current = false;
      setSigningIn(false);
    }
  }

  async function handleLogout() {
    if (demoMode) {
      window.sessionStorage.removeItem(BETA_DEMO_SESSION_KEY);
      setDemoMode(false);
      setActiveTab("draw");
      return;
    }
    await signOut(auth);
    setActiveTab("draw");
  }

  function handleDemoLogin() {
    if (!isBeta) return;
    window.sessionStorage.setItem(BETA_DEMO_SESSION_KEY, "1");
    setDemoMode(true);
    setAuthDialogOpen(false);
    setActiveTab("draw");
  }

  function handleBrandHome(event) {
    event.preventDefault();
    const homeUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({}, "", homeUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setActiveTab("draw");
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!authReady && !isBeta) {
    return <LoadingScreen />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LiveDraw TCG home" onClick={handleBrandHome}>
          {isBeta ? (
            <img
              className="beta-brand-logo"
              src="/livedraw-logo.svg"
              alt="LiveDraw TCG"
              width="430"
              height="112"
            />
          ) : (
            <>
              <span className="brand-mark">D!</span>
              <span>直播抽卡 DRAW GP</span>
            </>
          )}
        </a>

        {(signedIn || isBeta) && (
          <button
            className="icon-btn menu-toggle"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "關閉選單" : "開啟選單"}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <nav className={mobileOpen ? "nav nav-open" : "nav"}>
          {(signedIn || isBeta) &&
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
          {signedIn ? (
            <>
              {isBeta && (
                <span className="beta-player-name">
                  {activeProfile?.username || authUser?.displayName || "玩家"}
                </span>
              )}
              <button className="token-pill token-pill-button" type="button" onClick={() => { setActiveTab("tokens"); setMobileOpen(false); }} aria-label="前往申請代幣">
                <Zap size={16} />
                {formatTokenBalance(activeProfile?.tokens)}
              </button>
              <button className="ghost-btn" type="button" onClick={handleLogout} aria-label="登出">
                <LogOut size={17} />
                <span>登出</span>
              </button>
            </>
          ) : (
            <button
              className="primary-btn"
              type="button"
              onClick={() => setAuthDialogOpen(true)}
            >
              <LogIn size={18} />
              登入 / 註冊
            </button>
          )}
        </div>
      </header>

      <main id="top" className={isBeta ? "main-grid beta-main-grid" : "main-grid"}>
        {!signedIn ? (
          isBeta ? (
            <section className="workspace beta-public-workspace">
              {activeTab === "draw" ? (
                <DrawCard profile={null} />
              ) : (
                <BetaGuestGate
                  activeTab={activeTab}
                  authError={authError}
                  onLogin={() => setAuthDialogOpen(true)}
                />
              )}
            </section>
          ) : (
            <WelcomePanel
              authError={authError}
              onGoogleLogin={handleLogin}
              onPhoneLogin={() => setAuthDialogOpen(true)}
              signingIn={signingIn}
            />
          )
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
            {!isBeta && (
              <AccountPanel authUser={authUser} profile={profile} isAdmin={isAdmin} setActiveTab={setActiveTab} />
            )}
            <section className="workspace">
              {activeTab === "draw" && <DrawCard profile={activeProfile} />}
              {activeTab === "tokens" && <TokenRequest profile={activeProfile} />}
              {activeTab === "history" && <MyRecords profile={activeProfile} />}
              {activeTab === "collection" && <CollectionPage profile={activeProfile} />}
              {activeTab === "admin" && isAdmin && <AdminPanel profile={activeProfile} />}
            </section>
          </>
        )}
      </main>
      {isBeta && <BetaFooter onNavigate={setActiveTab} />}
      {authDialogOpen && !signedIn && (
        <AuthDialog
          authError={authError}
          isBeta={isBeta}
          onClose={() => setAuthDialogOpen(false)}
          onGoogleLogin={handleLogin}
          onDemoLogin={handleDemoLogin}
          signingIn={signingIn}
        />
      )}
    </div>
  );
}

function BetaGuestGate({ activeTab, authError, onLogin }) {
  const labels = {
    tokens: "申請代幣",
    history: "我的紀錄",
    collection: "我的卡牌",
    admin: "管理後台",
  };

  return (
    <section className="panel beta-guest-gate">
      <span className="beta-slash-mark" aria-hidden="true" />

      <h1>{labels[activeTab] || "會員專區"}</h1>
      <p>登入後即可查看個人資料及使用完整功能。</p>
      {authError && <p className="error-note">{authError}</p>}
      <button className="primary-btn large" type="button" onClick={onLogin}>
        <LogIn size={18} />
        登入 / 註冊
      </button>
    </section>
  );
}

const FOOTER_PAGES = {
  company: {
    title: "公司簡介",
    eyebrow: "ABOUT LIVEDRAW",
    body: [
      "LiveDraw TCG 是專為卡牌收藏家而設的直播抽卡平台，整合直播房間、選卡選號、購買紀錄及配送管理。",
      "平台以公開流程記錄每次抽卡，讓玩家可以隨時查閱房間、場次、號碼及卡牌處理狀態。",
    ],
  },
  terms: {
    title: "服務條款",
    eyebrow: "TERMS OF SERVICE",
    body: [
      "使用平台前，請確認帳戶資料正確並已年滿 18 歲。代幣只可用於平台指定服務，不能視作銀行存款或法定貨幣。",
      "抽卡結果以房間直播及平台紀錄為準。玩家提交配送資料前應再次核對，因資料錯誤引致的延誤需由玩家承擔。",
    ],
  },
  privacy: {
    title: "隱私條款",
    eyebrow: "PRIVACY",
    body: [
      "平台只會收集登入、交易審核、抽卡紀錄及配送所需資料，並使用 Firebase 服務保存及處理。",
      "配送資料只用於完成相關申請。請勿在聊天室公開電話、地址或其他敏感資料。",
    ],
  },
  process: {
    title: "抽盲盒流程",
    eyebrow: "HOW IT WORKS",
    body: [
      "1. 登入帳戶並申請代幣。",
      "2. 進入直播房間，先選擇想要的卡牌，再選擇場次及未被鎖定的號碼。",
      "3. 確認付款後號碼才會鎖定；完成開卡後可在「我的紀錄」及「我的卡牌」查看結果。",
      "4. 可按卡牌狀態申請配送，或把合資格卡牌轉回代幣。",
    ],
  },
  faq: {
    title: "常見問題",
    eyebrow: "FAQ",
    body: [
      "代幣申請會在管理員核對付款證明後入帳；處理時間會按申請量而不同。",
      "號碼只有在最後確認購買後才會扣除代幣及鎖定。如同一號碼同時被其他玩家購入，系統會要求重新選擇。",
      "配送進度及順豐運單號會顯示在「我的卡牌」。",
    ],
  },
  support: {
    title: "聯絡客服",
    eyebrow: "SUPPORT",
    body: [
      "查詢時請準備帳戶顯示名稱、房間名稱、場次、號碼及相關申請時間，以便客服核對。",
      "請使用平台官方客服渠道聯絡，切勿向非官方帳戶提供驗證碼、付款資料或配送地址。",
    ],
  },
};

function BetaFooter({ onNavigate }) {
  const [activePage, setActivePage] = useState("");
  const page = FOOTER_PAGES[activePage];

  useEffect(() => {
    function openSupport() {
      setActivePage("support");
    }

    window.addEventListener("beta-open-support", openSupport);
    return () => window.removeEventListener("beta-open-support", openSupport);
  }, []);

  return (
    <>
      <footer className="beta-footer">
        <div className="beta-footer-cut" />
        <div className="beta-footer-inner">
          <div className="beta-footer-brand">
            <img src="/livedraw-logo.svg" alt="LiveDraw TCG" width="430" height="112" />
            <p>專為卡牌收藏家而設的直播抽卡平台。</p>
          </div>
          <div>
            <h2>關於平台</h2>
            <button type="button" onClick={() => setActivePage("company")}>公司簡介</button>
            <button type="button" onClick={() => setActivePage("terms")}>服務條款</button>
            <button type="button" onClick={() => setActivePage("privacy")}>隱私條款</button>
          </div>
          <div>
            <h2>買家指南</h2>
            <button type="button" onClick={() => setActivePage("process")}>抽盲盒流程</button>
            <button type="button" onClick={() => setActivePage("faq")}>常見問題</button>
            <button type="button" onClick={() => setActivePage("support")}>聯絡客服</button>
          </div>
        </div>
        <p className="beta-copyright">© 2026 LiveDraw TCG. All rights reserved.</p>
      </footer>
      {page && (
        <div className="modal-backdrop footer-page-backdrop" role="presentation" onMouseDown={() => setActivePage("")}>
          <section className="modal footer-page-modal" role="dialog" aria-modal="true" aria-labelledby="footer-page-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-btn modal-close" type="button" onClick={() => setActivePage("")} aria-label="關閉內容頁"><X size={19} /></button>

            <h2 id="footer-page-title">{page.title}</h2>
            <div className="footer-page-copy">
              {page.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            {activePage === "process" && (
              <button className="primary-btn" type="button" onClick={() => { onNavigate("draw"); setActivePage(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                開始選擇房間
              </button>
            )}
          </section>
        </div>
      )}
    </>
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

function InlineLoading({ label = "資料載入中..." }) {
  return (
    <div className="inline-loading" role="status" aria-live="polite">
      <RefreshCcw className="spin" size={22} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function WelcomePanel({ authError, onGoogleLogin, onPhoneLogin, signingIn }) {
  return (
    <section className="welcome">
      <div>

        <h1>直播抽卡，選號入場，結果即時記錄。</h1>
        <p className="welcome-copy">
          使用手機號碼或 Google 登入後申請代幣，進入直播房間選擇抽卡號碼，所有購買紀錄、結果與配送狀態都會保存在 Firebase。
        </p>
        {authError && <p className="error-note">{authError}</p>}
        <div className="welcome-auth-actions">
          <button className="primary-btn large" type="button" onClick={onPhoneLogin}>
            <Smartphone size={19} />
            手機號碼登入 / 註冊
          </button>
          <button
            className="ghost-btn large"
            type="button"
            onClick={onGoogleLogin}
            disabled={signingIn}
          >
            <LogIn size={19} />
            {signingIn ? "正在開啟 Google..." : "使用 Google 登入"}
          </button>
        </div>
      </div>
      <div className="welcome-visual" aria-hidden="true">
        <div className="card-stack card-a">01</div>
        <div className="card-stack card-b">17</div>
        <div className="card-stack card-c">30</div>
      </div>
    </section>
  );
}

function AuthDialog({ authError, isBeta = false, onClose, onDemoLogin, onGoogleLogin, signingIn }) {
  const [accountAction, setAccountAction] = useState(isBeta ? "" : "login");
  const [authMethod, setAuthMethod] = useState(isBeta ? "" : "phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const recaptchaRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null);
  const isRegistration = accountAction === "register";

  useEffect(
    () => () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
      recaptchaWidgetIdRef.current = null;
    },
    [],
  );

  async function getRecaptchaVerifier() {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, "phone-recaptcha", {
        size: "invisible",
      });
      recaptchaWidgetIdRef.current = await recaptchaRef.current.render();
    } else if (recaptchaWidgetIdRef.current !== null) {
      window.grecaptcha?.reset(recaptchaWidgetIdRef.current);
    }

    return recaptchaRef.current;
  }

  async function sendPhoneCode(event) {
    event.preventDefault();
    setPhoneError("");
    setPhoneBusy(true);

    try {
      if (isBeta && isRegistration && !ageConfirmed) {
        throw new Error("請確認你已年滿 18 歲。 ");
      }
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence,
      );
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      const verifier = await getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
      setConfirmation(result);
    } catch (error) {
      if (recaptchaWidgetIdRef.current !== null) {
        window.grecaptcha?.reset(recaptchaWidgetIdRef.current);
      }
      setPhoneError(getPhoneAuthErrorMessage(error));
    } finally {
      setPhoneBusy(false);
    }
  }

  async function confirmPhoneCode(event) {
    event.preventDefault();
    if (!confirmation) return;
    setPhoneError("");
    setPhoneBusy(true);

    try {
      const credential = await confirmation.confirm(verificationCode.trim());
      if (isBeta && isRegistration) {
        const username = normalizeUsername(displayName);
        const betaProfileRef = doc(db, "users", credential.user.uid);
        await runTransaction(db, async (transaction) => {
          const profileSnapshot = await transaction.get(betaProfileRef);
          const betaFields = {
            displayName: displayName.trim().slice(0, 80),
            phoneNumber: credential.user.phoneNumber || normalizePhoneNumber(phoneNumber),
            referralCode: referralCode.trim().slice(0, 40),
            ageConfirmed: true,
            ageConfirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          if (profileSnapshot.exists()) {
            transaction.update(betaProfileRef, betaFields);
          } else {
            transaction.set(betaProfileRef, {
              uid: credential.user.uid,
              email: credential.user.email || "",
              photoURL: credential.user.photoURL || "",
              username: "",
              tokens: 0,
              role: "user",
              createdAt: serverTimestamp(),
              ...betaFields,
            });
          }
        });
        if (username.length >= 3) {
          await ensureUsernameClaim(credential.user.uid, username);
        }
      }
      onClose();
    } catch (error) {
      setPhoneError(getPhoneAuthErrorMessage(error));
    } finally {
      setPhoneBusy(false);
    }
  }

  function goBack() {
    setPhoneError("");
    if (confirmation) {
      setConfirmation(null);
    } else if (authMethod) {
      setAuthMethod("");
    } else {
      setAccountAction("");
    }
  }

  async function continueWithGoogle() {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence,
    );
    onGoogleLogin();
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-btn auth-dialog-close" type="button" onClick={onClose} aria-label="關閉">
          <X size={20} />
        </button>
        {isBeta && (accountAction || authMethod || confirmation) && (
          <button className="auth-back-btn" type="button" onClick={goBack}>
            <ChevronLeft size={18} />
            返回
          </button>
        )}

        {!accountAction ? (
          <>

            <h2 id="auth-dialog-title">歡迎來到 LiveDraw</h2>
            <p className="muted">請先選擇登入現有帳戶，或建立新帳戶。</p>
            <div className="auth-entry-grid">
              <button className="auth-choice-card primary" type="button" onClick={() => setAccountAction("login")}>
                <LogIn size={24} />
                <span><strong>登入</strong><small>已有 LiveDraw 帳戶</small></span>
              </button>
              <button className="auth-choice-card" type="button" onClick={() => setAccountAction("register")}>
                <UserRoundPlus size={24} />
                <span><strong>註冊</strong><small>建立新的玩家帳戶</small></span>
              </button>
            </div>
          </>
        ) : !authMethod ? (
          <>

            <h2 id="auth-dialog-title">{isRegistration ? "註冊" : "登入"}</h2>
            <p className="muted">請選擇使用手機號碼或 Google {isRegistration ? "建立帳戶" : "繼續"}。</p>
            <div className="auth-method-grid">
              <button className="auth-choice-card primary" type="button" onClick={() => setAuthMethod("phone")}>
                <Smartphone size={24} />
                <span><strong>手機號碼</strong><small>使用 SMS 一次性驗證碼</small></span>
              </button>
              <button className="auth-choice-card" type="button" onClick={continueWithGoogle} disabled={signingIn}>
                <LogIn size={24} />
                <span><strong>Google</strong><small>{signingIn ? "正在開啟..." : `使用 Google ${isRegistration ? "註冊" : "登入"}`}</small></span>
              </button>
            </div>
            {isBeta && (
              <label className="check-option auth-remember-option">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                <span>記住我</span>
              </label>
            )}
            {isBeta && (
              <>
          <div className="auth-divider"><span>測試預覽</span></div>
                <button className="ghost-btn beta-demo-login" type="button" onClick={onDemoLogin}>
                  <UserRoundPlus size={18} />
                  使用 Demo Account
                </button>
            <small className="form-note beta-demo-note">測試帳戶只供預覽，不會寫入資料或影響正式版。</small>
              </>
            )}
          </>
        ) : (
          <>

            <h2 id="auth-dialog-title">{isBeta ? `手機號碼${isRegistration ? "註冊" : "登入"}` : "登入 / 註冊"}</h2>
            <p className="muted">{confirmation ? "輸入已發送到你手機的 6 位數字驗證碼。" : isBeta ? "輸入手機號碼以接收一次性驗證碼。" : "使用手機號碼接收一次性驗證碼，或使用 Google 帳戶繼續。"}</p>

            {!confirmation ? (
              <form className="stack-form" onSubmit={sendPhoneCode}>
                {isBeta && isRegistration && (
                  <>
                    <label>
                      顯示名稱
                      <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="其他玩家會看到的名稱" minLength={3} maxLength={24} required />
                    </label>
                    <label>
                      推薦碼（選填）
                      <input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="輸入推薦碼" maxLength={40} />
                    </label>
                  </>
                )}
                <label>
                  手機號碼
                  <input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="例如 +852 9123 4567" required />
                </label>
                {isBeta && (
                  <div className="auth-options">
                    {isRegistration && (
                      <label className="check-option">
                        <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} required />
                        <span>本人確認已年滿 18 歲</span>
                      </label>
                    )}
                    <label className="check-option">
                      <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                      <span>記住我</span>
                    </label>
                    {!isRegistration && (
                      <button className="auth-forgot-link" type="button" onClick={() => alert("手機號碼帳戶不設密碼，請重新接收 SMS 驗證碼登入。")}>
                        忘記密碼？
                      </button>
                    )}
                  </div>
                )}
                <button className="primary-btn" id="send-phone-code" type="submit" disabled={phoneBusy}>
                  <Smartphone size={18} />
                  {phoneBusy ? "發送中..." : "發送驗證碼"}
                </button>
              </form>
            ) : (
              <form className="stack-form" onSubmit={confirmPhoneCode}>
                <label>
                  SMS 驗證碼
                  <input inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 位數字驗證碼" pattern="[0-9]{6}" required />
                </label>
                <button className="primary-btn" type="submit" disabled={phoneBusy}>
                  <Check size={18} />
                  {phoneBusy ? "驗證中..." : `確認並${isRegistration ? "註冊" : "登入"}`}
                </button>
                <button className="small-btn" type="button" onClick={() => setConfirmation(null)}>更改手機號碼</button>
              </form>
            )}
          </>
        )}

        <div id="phone-recaptcha" />
        {(phoneError || authError) && <p className="error-note">{phoneError || authError}</p>}
        {!isBeta && (
          <>
            <div className="auth-divider"><span>或</span></div>
            <button className="ghost-btn auth-google-btn" type="button" onClick={continueWithGoogle} disabled={signingIn}>
              <LogIn size={18} />
              {signingIn ? "正在開啟 Google..." : "使用 Google 登入"}
            </button>
          </>
        )}
        {authMethod === "phone" && (
          <small className="form-note">{isRegistration ? "註冊" : "登入"}即表示你同意手機號碼由 Google Firebase 用作驗證及防止濫用。</small>
        )}
      </section>
    </div>
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
  const [recentPicksLoading, setRecentPicksLoading] = useState(true);
  const [roomsById, setRoomsById] = useState({});
  const [accountRoomsLoading, setAccountRoomsLoading] = useState(true);
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
    const stopRecords = onSnapshot(recordsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRecentPicks(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.source !== "vip")
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 6),
      );
      if (isSnapshotReady(snapshot)) setRecentPicksLoading(false);
    }, (error) => {
      console.error("Account record listener failed.", error);
      setRecentPicksLoading(false);
    });

    return stopRecords;
  }, [profile?.uid]);

  useEffect(() => {
    const roomsQuery = query(collection(db, "draws"), orderBy("createdAt", "desc"));
    const stopRooms = onSnapshot(roomsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRoomsById(
        Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }])),
      );
      if (isSnapshotReady(snapshot)) setAccountRoomsLoading(false);
    }, (error) => {
      console.error("Account room listener failed.", error);
      setAccountRoomsLoading(false);
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
        <div className="pick-card-main">
          <span className="pick-card-art">
            {record.targetCardImageUrl || record.cardImageUrl ? (
              <img
                src={record.targetCardImageUrl || record.cardImageUrl}
                alt={record.cardName || record.targetCardName || "卡牌"}
              />
            ) : (
              <Package size={20} />
            )}
          </span>
          <span className="pick-card-copy">
            <strong>{room?.title || record.drawTitle || "抽卡房"}</strong>
            <small>{record.roomSlug || room?.slug || "draw-room"}</small>
            <span className="pick-number-box">
              <em>天堂地獄號碼</em>
              <b>#{record.number}</b>
            </span>
          </span>
        </div>
        <strong className="pick-card-name">
          所屬盲盒：{record.targetCardName || "未選卡牌"}
        </strong>
        <small className="pick-card-meta">
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
        <strong><TokenAmount value={roundTokenBalance(profile?.tokens)} /></strong>
        <button className="primary-btn side-cta" type="button" onClick={() => setActiveTab("tokens")}>
          申請代幣
        </button>
      </div>

      <div className="current-picks">
        <strong>正在抽卡</strong>
        {recentPicksLoading || accountRoomsLoading ? (
          <InlineLoading label="正在載入抽卡紀錄..." />
        ) : recentPicks.length ? (
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

function FileUpload({ id, label, file, onChange, required = false, disabled = false }) {
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
          disabled={disabled}
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
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [cardLibrary, setCardLibrary] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const shouldLoadPrivateCardData =
    import.meta.env.VITE_APP_VARIANT !== "beta" || Boolean(profile?.uid && !profile?.isDemo);
  const cardCategories = useCardCategories(cardLibrary, shouldLoadPrivateCardData);
  const [roomSlug, setRoomSlug] = useState(getRoomSlugFromUrl);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [buyingNumber, setBuyingNumber] = useState(null);
  const [pendingPurchase, setPendingPurchase] = useState(null);
  const [purchaseStage, setPurchaseStage] = useState("confirm");
  const purchaseInFlightRef = useRef(false);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [selectedSlotNumber, setSelectedSlotNumber] = useState(null);
  const [selectedRound, setSelectedRound] = useState("");
  const [purchaseStep, setPurchaseStep] = useState(1);

  useEffect(() => {
    const drawsQuery = query(
      collection(db, "draws"),
      orderBy("createdAt", "desc"),
    );
    const stopDraws = onSnapshot(
      drawsQuery,
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        const allDraws = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setRooms(allDraws);
        setRoomsError("");
        if (isSnapshotReady(snapshot)) setRoomsLoading(false);
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
        } finally {
          setRoomsLoading(false);
        }
      },
    );

    return stopDraws;
  }, []);

  useEffect(() => {
    setCardsLoading(true);
    const cardsQuery = shouldLoadPrivateCardData
      ? query(collection(db, "cards"), orderBy("createdAt", "desc"))
      : query(collection(db, "publicCardShowcase"), where("active", "==", true));
    const stopCards = onSnapshot(
      cardsQuery,
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        setCardLibrary(snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((card) => !card.archived));
        if (isSnapshotReady(snapshot)) setCardsLoading(false);
      },
      (error) => {
        console.error("Card library listener failed.", error);
        setCardsLoading(false);
      },
    );

    return stopCards;
  }, [shouldLoadPrivateCardData]);

  useEffect(() => {
    function handleRouteChange() {
      setRoomSlug(getRoomSlugFromUrl());
    }

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  const selectedRoom = useMemo(() => {
    if (isBeta) {
      const requestedRoom = roomSlug
        ? rooms.find((room) => room.id === roomSlug) || rooms.find((room) => room.slug === roomSlug)
        : null;
      const currentLive = rooms.find((room) => room.status === "live")
        || rooms.find((room) => room.status === "draft");
      return requestedRoom || currentLive || rooms[0] || null;
    }
    const requestedRoom = roomSlug
      ? rooms.find((room) => room.id === roomSlug) ||
        rooms.find((room) => room.slug === roomSlug)
      : null;
    if (requestedRoom) return requestedRoom;
    return null;
  }, [isBeta, roomSlug, rooms]);
  const selectedRoomId = selectedRoom?.id || "";
  const currentBetaLive = isBeta
    ? rooms.find((room) => room.status === "live") || rooms.find((room) => room.status === "draft") || null
    : null;
  const archivedBetaRooms = isBeta
    ? rooms.filter((room) => room.id !== currentBetaLive?.id && room.status === "completed")
    : [];
  const viewingArchivedBetaRoom = Boolean(isBeta && selectedRoom?.status === "completed");
  const selectedRoomDefaultRound = getDefaultRoomRound(selectedRoom);

  const roundOptions = useMemo(() => getRoomRoundOptions(selectedRoom), [selectedRoom]);
  const activeRoundId = useMemo(
    () => selectedRound || getDefaultRoomRound(selectedRoom),
    [selectedRoom, selectedRound],
  );
  const selectedRoomCards = useMemo(
    () => buildRoomCards(selectedRoom, cardLibrary, activeRoundId),
    [activeRoundId, selectedRoom, cardLibrary],
  );

  const selectedTargetCard = useMemo(
    () => selectedRoomCards.find((card) => card.id === selectedCardId) || null,
    [selectedCardId, selectedRoomCards],
  );
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.number === selectedSlotNumber) || null,
    [selectedSlotNumber, slots],
  );
  const myActiveRoundNumbers = useMemo(
    () => slots
      .filter((slot) => slot.uid === profile?.uid && slot.status !== "available")
      .map((slot) => Number(slot.number))
      .filter(Number.isFinite)
      .sort((left, right) => left - right),
    [profile?.uid, slots],
  );

  useEffect(() => {
    setSelectedCardId("");
    setSelectedSlotNumber(null);
    setSelectedRound(selectedRoomDefaultRound);
    setPurchaseStep(1);
  }, [selectedRoomDefaultRound, selectedRoomId]);

  useEffect(() => {
    setSelectedSlotNumber(null);
  }, [activeRoundId, selectedCardId]);

  useEffect(() => {
    if (!selectedRoom?.id || !activeRoundId) {
      setSlots([]);
      setSlotsLoading(false);
      return undefined;
    }

    setSlotsLoading(true);

    const slotsQuery = query(
      collection(db, "draws", selectedRoom.id, "rounds", activeRoundId, "slots"),
      orderBy("number", "asc"),
    );
    const stopSlots = onSnapshot(
      slotsQuery,
      LIVE_SNAPSHOT_OPTIONS,
      async (snapshot) => {
        try {
          const roundSlots = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          if (roundSlots.length || activeRoundId !== "round-001") {
            setSlots(roundSlots);
            return;
          }

          const legacySnapshot = await getDocs(
            query(collection(db, "draws", selectedRoom.id, "slots"), orderBy("number", "asc")),
          );
          setSlots(legacySnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        } finally {
          if (isSnapshotReady(snapshot)) setSlotsLoading(false);
        }
      },
      (error) => {
        console.error("Room slots listener failed.", error);
        setSlotsLoading(false);
      },
    );

    return stopSlots;
  }, [activeRoundId, selectedRoom?.id]);

  useEffect(() => {
    if (!selectedSlotNumber) return;
    const latestSlot = slots.find((slot) => slot.number === selectedSlotNumber);
    if (latestSlot && latestSlot.status !== "available" && latestSlot.uid !== profile?.uid) {
      setSelectedSlotNumber(null);
    }
  }, [profile?.uid, selectedSlotNumber, slots]);

  function openPurchaseConfirmation(slot) {
    if (!selectedRoom || selectedRoom.status !== "live") return;
    if (getRoundSortValue(activeRoundId) < getRoomCurrentRound(selectedRoom)) {
      alert("此場次已完結，不能再購買號碼。");
      return;
    }
    if (isRoundBuyingBlocked(selectedRoom, activeRoundId)) {
      alert("管理員已停止本場購買，不能再鎖定新號碼。");
      return;
    }
    if (!profile?.uid) {
      alert("請先登入／註冊，再付款鎖定號碼。");
      return;
    }
    if (profile.isDemo) {
      alert("測試帳戶只供預覽，不會購買號碼或扣除代幣。");
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

    setPendingPurchase({
      slot,
      roomId: selectedRoom.id,
      roomTitle: selectedRoom.title,
      roomSlug: selectedRoom.slug || selectedRoom.id,
      roundId: activeRoundId,
      shareMode: getRoomShareMode(selectedRoom, activeRoundId),
      card: selectedTargetCard,
      hellCardName: cardLibrary.find((card) => card.id ===
        cardLibrary.find((card) => card.id === selectedTargetCard.id)?.hellCardId,
      )?.name || "未設定地獄對應卡",
      tokenCost: Number(selectedTargetCard.tokenValue || selectedRoom.tokenCost || 10),
    });
    setPurchaseStage("confirm");
  }

  function closePurchaseConfirmation() {
    if (purchaseStage === "generating") return;
    const purchaseCompleted = purchaseStage === "complete";
    setPendingPurchase(null);
    setPurchaseStage("confirm");
    if (purchaseCompleted) goToCardStep();
  }

  async function confirmBlindBoxPurchase() {
    if (!pendingPurchase || purchaseInFlightRef.current) return;

    const purchase = pendingPurchase;
    const animationStartedAt = Date.now();
    purchaseInFlightRef.current = true;
    setPurchaseStage("generating");
    setBuyingNumber(purchase.slot.number);
    try {
      const claimedUsername = await ensureUsernameClaim(profile.uid, profile.username);

      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", profile.uid);
        const slotRef = doc(
          db,
          "draws",
          purchase.roomId,
          "rounds",
          purchase.roundId,
          "slots",
          String(purchase.slot.number),
        );
        const recordRef = doc(collection(db, "drawRecords"));
        const userSnap = await transaction.get(userRef);
        const slotSnap = await transaction.get(slotRef);
        const currentTokens = Number(userSnap.data()?.tokens || 0);
        const tokenCost = purchase.tokenCost;

        if (!slotSnap.exists() || slotSnap.data().status !== "available") {
          throw new Error("這個號碼已被選走。");
        }

        if (currentTokens < tokenCost) {
          throw new Error(`你需要 ${tokenCost} 代幣才可購買此號碼。`);
        }

        transaction.update(userRef, {
          tokens: currentTokens - tokenCost,
          lastPurchaseRecordId: recordRef.id,
          updatedAt: serverTimestamp(),
        });
        transaction.update(slotRef, {
          purchaseRecordId: recordRef.id,
          status: "locked",
          uid: profile.uid,
          username: claimedUsername,
          tokenCost,
          targetCardId: purchase.card.id,
          targetCardName: purchase.card.name,
          targetCardImageUrl: purchase.card.imageUrl || "",
          targetCardValue: tokenCost,
          shareMode: purchase.shareMode,
          round: purchase.roundId,
          updatedAt: serverTimestamp(),
        });
        transaction.set(recordRef, {
          slotId: String(purchase.slot.number),
          uid: profile.uid,
          username: claimedUsername,
          drawId: purchase.roomId,
          drawTitle: purchase.roomTitle,
          roomSlug: purchase.roomSlug,
          roomLink: makeRoomLink(purchase.roomId),
          round: purchase.roundId,
          roundSort: getRoundSortValue(purchase.roundId),
          number: purchase.slot.number,
          tokenCost,
          targetCardId: purchase.card.id,
          targetCardName: purchase.card.name,
          targetCardImageUrl: purchase.card.imageUrl || "",
          targetCardValue: tokenCost,
          shareMode: purchase.shareMode,
          createdAt: serverTimestamp(),
        });
      });

      const remainingAnimation = 1700 - (Date.now() - animationStartedAt);
      if (remainingAnimation > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingAnimation));
      }
      setPurchaseStage("complete");
      setSelectedSlotNumber(null);
    } catch (error) {
      setPurchaseStage("confirm");
      setPendingPurchase(null);
      showSafeError(error);
    } finally {
      purchaseInFlightRef.current = false;
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

  function goToNumberStep() {
    if (!selectedTargetCard) return;
    setPurchaseStep(2);
    window.requestAnimationFrame(() => {
      document.getElementById("number-selection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openNumberOccupancy() {
    setPurchaseStep(2);
    window.requestAnimationFrame(() => {
      document.getElementById("number-selection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToCardStep() {
    setSelectedSlotNumber(null);
    setPurchaseStep(1);
    window.requestAnimationFrame(() => {
      document.getElementById("card-selection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (!isBeta && !roomSlug) {
    return (
      <RoomList
        rooms={rooms}
        cards={cardLibrary}
        error={roomsError}
        loading={roomsLoading}
        onOpenRoom={openRoom}
        profile={profile}
      />
    );
  }

  if (roomsLoading) {
    return <InlineLoading label="正在載入房間..." />;
  }

  if (!selectedRoom) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>{isBeta ? "暫時未有直播" : "找不到房間"}</h2>
        <p className="muted">{roomsError || (isBeta ? "直播資料準備中，請稍後再試。" : "這個房間連結暫時沒有可用資料。")}</p>
        {!isBeta && <button className="primary-btn" type="button" onClick={backToRooms}>返回房間列表</button>}
      </section>
    );
  }

  if (viewingArchivedBetaRoom) {
    return (
      <ArchivedLiveRoom
        activeRoundId={activeRoundId}
        loading={slotsLoading}
        onBack={() => currentBetaLive ? openRoom(currentBetaLive) : backToRooms()}
        onRoundChange={setSelectedRound}
        profile={profile}
        room={selectedRoom}
        roundOptions={roundOptions}
        slots={slots}
      />
    );
  }

  return (
    <>
      {isBeta && (
        <BetaSingleHallIntro
          cards={cardLibrary}
          rooms={[selectedRoom]}
          onOpenRoom={openRoom}
          onSelectCard={(card) => {
            const matchingCard = selectedRoomCards.find((item) =>
              String(item.id || "") === String(card.id || "")
              || String(item.name || "").trim().toLowerCase() === String(card.name || "").trim().toLowerCase(),
            );
            setPurchaseStep(1);
            setSelectedSlotNumber(null);
            setSelectedCardId(matchingCard?.id || "");
            window.requestAnimationFrame(() => {
              document.getElementById("card-selection")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      )}
      {isBeta && profile?.uid && (
        <RoomRecordsDrawer currentRoomId={selectedRoom.id} profile={profile} />
      )}
      {isBeta && archivedBetaRooms.length > 0 && (
        <LiveArchiveList rooms={archivedBetaRooms} onOpenRoom={openRoom} />
      )}
      {!isBeta && <button className="small-btn back-link" type="button" onClick={backToRooms}>返回房間列表</button>}
      <div className={`draw-layout purchase-step-${purchaseStep}`}>
        <section className="panel room-stream-panel">
          <div className="section-heading">
            <Gavel size={24} />
            <div>
              {isBeta && <span className="beta-live-label">直播中</span>}
              <h1>{isBeta ? <><em>LIVE</em> 抽卡大廳</> : selectedRoom.title}</h1>
              {isBeta && myActiveRoundNumbers.length > 0 && (
                <span className="beta-my-live-numbers">
                  已買：{myActiveRoundNumbers.map((number) => `#${number}`).join("、")}
                </span>
              )}
            </div>
          </div>
          <KickEmbed kickUrl={selectedRoom.kickUrl} title={selectedRoom.title} />
          {!isBeta && (
            <div className="draw-meta">
              <span>{selectedRoom.cardCount} 張卡</span>
              <span>{formatRoundLabel(activeRoundId)}</span>
              <span>玩法：{getRoomShareMode(selectedRoom, activeRoundId)}</span>
              <span>{statusLabels[selectedRoom.status] || selectedRoom.status}</span>
              <span>房間：{selectedRoom.title}</span>
            </div>
          )}
        </section>
        {isBeta && (
          <RoomRoundOverview
            draw={selectedRoom}
            activeRoundId={activeRoundId}
            roundOptions={roundOptions}
            onRoundChange={(roundId) => {
              setSelectedRound(roundId);
              if (getRoundDisplayStatus(selectedRoom, roundId).key !== "upcoming") {
                setPurchaseStep(2);
              }
            }}
          />
        )}
        {isBeta && purchaseStep === 1 && (
          <DesktopNumberOccupancy
            activeRoundId={activeRoundId}
            loading={slotsLoading}
            profile={profile}
            slots={slots}
          />
        )}
        {purchaseStep === 1 ? (
          <CardPoolPreview
            draw={selectedRoom}
            cards={selectedRoomCards}
            loading={cardsLoading}
            cardCategories={cardCategories}
            selectedCardId={selectedCardId}
            selectedCard={selectedTargetCard}
            onSelectCard={setSelectedCardId}
            onContinue={goToNumberStep}
          />
        ) : (
          <NumberGrid
            draw={selectedRoom}
            slots={slots}
            loading={slotsLoading}
            profile={profile}
            selectedCard={selectedTargetCard}
            activeRoundId={activeRoundId}
            roundOptions={roundOptions}
            selectedSlotNumber={selectedSlotNumber}
            buyingNumber={buyingNumber}
            onBack={goToCardStep}
            onRoundChange={setSelectedRound}
            onSelectNumber={setSelectedSlotNumber}
            onBuy={() => openPurchaseConfirmation(selectedSlot)}
          />
        )}
        {selectedRoom.status === "live" &&
          (profile?.uid && !profile?.isDemo ? (
            <div id="hall-chat" className="hall-chat-anchor"><ChatRoom drawId={selectedRoom.id} profile={profile} /></div>
          ) : (
            <section id="hall-chat" className="panel chat-panel guest-chat-panel">
              <div className="section-heading compact beta-live-chat-heading">
                <div><span>LIVE CHAT</span><h2>大廳聊天</h2></div>
              </div>
              <p className="muted">登入後即可查看及參與大廳聊天。</p>
            </section>
          ))}
      </div>
      {isBeta && (
        <BetaStickyControls
          onOpenNumbers={openNumberOccupancy}
          profile={profile}
        />
      )}
      {pendingPurchase && (
        <BlindBoxPurchaseModal
          purchase={pendingPurchase}
          stage={purchaseStage}
          onCancel={closePurchaseConfirmation}
          onConfirm={confirmBlindBoxPurchase}
        />
      )}
    </>
  );
}

function BetaRecentRecords({ profile }) {
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(Boolean(profile));
  const demoCards = useBetaDemoCards(Boolean(profile?.isDemo));

  useEffect(() => {
    if (profile?.isDemo) {
      setRecords(enrichDemoRecords(BETA_DEMO_RECORDS, demoCards));
      setRecordsLoading(false);
      return undefined;
    }
    if (!profile?.uid) {
      setRecords([]);
      setRecordsLoading(false);
      return undefined;
    }

    setRecordsLoading(true);

    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    return onSnapshot(recordsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRecords(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 6),
      );
      if (isSnapshotReady(snapshot)) setRecordsLoading(false);
    }, (error) => {
      console.error("Home record listener failed.", error);
      setRecordsLoading(false);
    });
  }, [demoCards, profile?.isDemo, profile?.uid]);

  return (
    <aside className="beta-home-records">
      <div className="beta-home-records-heading">
        <h2>我的紀錄</h2>
        <span>{profile ? `${records.length} / 20` : "-- / 20"}</span>
      </div>
      {profile ? (
        recordsLoading ? (
          <InlineLoading label="正在載入我的紀錄..." />
        ) : records.length ? (
          records.map((record) => (
            <article className="beta-home-record" key={record.id}>
              <div className="beta-home-record-body">
                {record.targetCardImageUrl || record.cardImageUrl ? (
                  <img
                    src={record.targetCardImageUrl || record.cardImageUrl}
                    alt={record.targetCardName || record.cardName || "目標卡牌"}
                  />
                ) : (
                  <span className="beta-home-record-image"><Package size={18} /></span>
                )}
                <div>
                  <div className="beta-home-record-title">
                    <strong>{record.drawTitle || record.roomSlug || "抽卡房"}</strong>
                    <span>#{record.number || "--"}</span>
                  </div>
                  <p>所屬盲盒：{record.targetCardName || "未選卡牌"}</p>
                </div>
              </div>
              <footer>
                <b><TokenAmount value={record.tokenCost || 0} /></b>
                <span className={record.cardId ? `complete ${record.resultSide === "hell" ? "hell" : "heaven"}` : "pending"}>
                  {record.cardId
                    ? `已完成 · ${getResultSideLabel(record.resultSide)}`
                    : "待開"}
                </span>
              </footer>
            </article>
          ))
        ) : (
          <p className="beta-home-records-empty">暫時未有抽卡紀錄。</p>
        )
      ) : (
        <div className="beta-home-records-login">
          <ListChecks size={24} />
          <strong>登入查看紀錄</strong>
          <span>最近購買的房間及號碼會顯示在這裡。</span>
        </div>
      )}
    </aside>
  );
}

function BetaSingleHallIntro({ cards, rooms, onOpenRoom, onSelectCard }) {
  return (
    <section className="panel beta-single-hall-intro">
      <div className="beta-announcements" aria-label="最新公告">
        <div className="beta-announcements-track">
          {[false, true].map((duplicate) => (
            <div
              aria-hidden={duplicate || undefined}
              className="beta-announcements-group"
              key={duplicate ? "duplicate" : "primary"}
            >
              <strong>最新公告</strong>
              <span><b>最新</b> 二份之一賽道限量開放。</span>
              <span><b>活動</b> 首次申請代幣滿指定金額送免費抽選。</span>
              <span><b>公告</b> 系統維護時間請留意最新消息。</span>
            </div>
          ))}
        </div>
      </div>
      <div className="banner-slot" />
      <BetaPsaCarousel cards={cards} rooms={rooms} onOpenRoom={onOpenRoom} onSelectCard={onSelectCard} />
    </section>
  );
}

// Lists completed live sessions without exposing private purchase records.
function LiveArchiveList({ rooms, onOpenRoom }) {
  return (
    <section className="panel live-archive-list" aria-labelledby="live-archive-title">
      <div className="live-archive-heading">
        <div>
          <p className="eyebrow">直播紀錄</p>
          <h2 id="live-archive-title">過往直播及賽果</h2>
        </div>
        <span>{rooms.length} 個已封存直播</span>
      </div>
      <div className="live-archive-strip">
        {rooms.map((room) => {
          const resultCount = Object.values(room.roundResultImages || {}).filter(Boolean).length;
          return (
            <button type="button" key={room.id} onClick={() => onOpenRoom(room)}>
              <Clock3 size={18} />
              <span>
                <strong>{room.title || "過往直播"}</strong>
                <small>{getRoomRoundCount(room)} 場 · {resultCount} 個賽果 · {formatDate(room.archivedAt || room.updatedAt || room.createdAt)}</small>
              </span>
              <b>查看</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Shows an archived session as read-only history for every visitor.
function ArchivedLiveRoom({ activeRoundId, loading, onBack, onRoundChange, profile, room, roundOptions, slots }) {
  const occupiedCount = slots.filter((slot) => slot.status !== "available").length;

  return (
    <div className="archived-live-page">
      <button className="small-btn back-link" type="button" onClick={onBack}>
        <ChevronLeft size={17} />返回目前直播
      </button>
      <section className="panel archived-live-header">
        <div>
          <p className="eyebrow">已封存直播</p>
          <h1>{room.title || "過往直播"}</h1>
          <span>所有場次、號碼及賽果均為唯讀紀錄。</span>
        </div>
        <b>{getRoomRoundCount(room)} 場</b>
      </section>
      <RoomRoundOverview
        draw={room}
        activeRoundId={activeRoundId}
        roundOptions={roundOptions}
        onRoundChange={onRoundChange}
      />
      <section className="panel archived-number-records" aria-label={`${formatRoundLabel(activeRoundId)}號碼紀錄`}>
        <header>
          <div><h2>{formatRoundLabel(activeRoundId)}號碼紀錄</h2><span>{occupiedCount} / {slots.length || room.cardCount || 20} 已選</span></div>
          <small>唯讀</small>
        </header>
        <div className="archive-slot-grid">
          {loading ? <InlineLoading label="正在載入號碼紀錄..." /> : slots.map((slot) => {
            const occupied = slot.status !== "available";
            const mine = occupied && slot.uid === profile?.uid;
            return (
              <div className={mine ? "mine" : occupied ? "occupied" : ""} key={slot.id}>
                <strong>{slot.number}</strong>
                <small>{mine ? "我的號碼" : occupied ? slot.username || "已選" : "未選"}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function BetaStickyControls({ onOpenNumbers, profile }) {
  function scrollToChat() {
    document.getElementById("hall-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openRecords() {
    if (!profile?.uid) {
      alert("登入後即可查看我的紀錄。");
      return;
    }
    window.dispatchEvent(new CustomEvent("beta-open-room-records"));
  }

  return (
    <>
      <nav className="beta-desktop-sticky-controls" aria-label="桌面直播快捷功能">
        <button className="support" type="button" onClick={() => window.dispatchEvent(new CustomEvent("beta-open-support"))}>
          <Headphones size={17} /><span>聯絡客服</span>
        </button>
        <button className="records" type="button" onClick={openRecords}>
          <ListChecks size={17} /><span>我的紀錄</span>
        </button>
      </nav>
      <nav className="beta-mobile-sticky-controls" aria-label="直播快捷功能">
      <button className="support" type="button" onClick={() => window.dispatchEvent(new CustomEvent("beta-open-support"))}>
        <Headphones size={15} /><span>聯絡客服</span>
      </button>
      <button className="numbers" type="button" onClick={onOpenNumbers}>
        <Hash size={15} /><span>號碼使用情況</span>
      </button>
      <button className="chat" type="button" onClick={scrollToChat}>
        <MessageCircle size={15} /><span>大廳聊天</span>
      </button>
      <button className="records" type="button" onClick={openRecords}>
        <ListChecks size={15} /><span>我的紀錄</span>
      </button>
      </nav>
    </>
  );
}

// Keeps the current round's number usage visible beside the card list on desktop.
function DesktopNumberOccupancy({ activeRoundId, loading, profile, slots }) {
  const occupiedCount = slots.filter((slot) => slot.status !== "available").length;

  return (
    <aside className="desktop-number-occupancy" aria-label="天堂地獄號碼使用情況">
      <header>
        <div>
          <strong>天堂地獄號碼</strong>
          <small>{formatRoundLabel(activeRoundId)} · 即時更新</small>
        </div>
        <span>{occupiedCount} / {slots.length || 20} 已選</span>
      </header>
      <div className="desktop-number-grid">
        {loading ? (
          <InlineLoading label="正在載入號碼..." />
        ) : slots.map((slot) => {
          const occupied = slot.status !== "available";
          const mine = occupied && slot.uid === profile?.uid;
          return (
            <button
              className={mine ? "mine" : occupied ? "occupied" : ""}
              disabled
              key={slot.id}
              type="button"
            >
              <strong>{slot.number}</strong>
              <small>{mine ? "我的號碼" : occupied ? slot.username || "已選" : "未選"}</small>
            </button>
          );
        })}
      </div>
      <div className="desktop-number-legend">
        <span><i />未選</span>
        <span><i />已被選</span>
        <span><i />我的號碼</span>
      </div>
    </aside>
  );
}

function RoomRecordsDrawer({ currentRoomId, profile }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    if (profile.isDemo) {
      setRecords(BETA_DEMO_RECORDS);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const recordsQuery = query(collection(db, "drawRecords"), where("uid", "==", profile.uid));
    return onSnapshot(recordsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRecords(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.source !== "vip")
          .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt))
          .slice(0, 20),
      );
      if (isSnapshotReady(snapshot)) setLoading(false);
    }, (error) => {
      console.error("Room record drawer listener failed.", error);
      setLoading(false);
    });
  }, [open, profile.isDemo, profile.uid]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    function openFromShortcut() {
      setOpen(true);
    }

    window.addEventListener("beta-open-room-records", openFromShortcut);
    return () => window.removeEventListener("beta-open-room-records", openFromShortcut);
  }, []);

  return (
    <>
      <button
        className={open ? "room-records-toggle open" : "room-records-toggle"}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="room-records-drawer"
        aria-label={open ? "收起我的紀錄" : "開啟我的紀錄"}
      >
        <ListChecks size={18} />
      </button>
      {open && (
        <div className="room-records-drawer-layer">
          <button className="room-records-scrim" type="button" onClick={() => setOpen(false)} aria-label="收起我的紀錄" />
          <aside id="room-records-drawer" className="room-records-drawer" aria-label="我的紀錄">
            <header>
              <div><h2>我的紀錄</h2></div>
              <button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="收起我的紀錄"><ChevronLeft size={20} /></button>
            </header>
            <p className="room-records-drawer-count">最近 {records.length} / 20 筆</p>
            {loading ? (
              <InlineLoading label="正在載入我的紀錄..." />
            ) : records.length ? (
              <div className="room-records-drawer-list">
                {records.map((record) => {
                  const resultClass = record.cardId
                    ? record.resultSide === "hell" ? "hell" : "heaven"
                    : "pending";
                  return (
                    <article className="room-records-drawer-item" key={record.id}>
                      <div className="room-records-drawer-main">
                        {record.targetCardImageUrl || record.cardImageUrl ? (
                          <img src={record.targetCardImageUrl || record.cardImageUrl} alt={record.targetCardName || record.cardName || "目標卡牌"} />
                        ) : <span className="room-records-drawer-image"><Package size={17} /></span>}
                        <div>
                          <strong>{record.drawTitle || record.roomSlug || "抽卡房"}</strong>
                          <span>{formatRoundLabel(record.round)} · #{record.number || "--"}</span>
                          <span>所屬盲盒：{record.targetCardName || "未選卡牌"}</span>
                        </div>
                      </div>
                      <footer>
                        <TokenAmount value={record.tokenCost || 0} />
                        {record.drawId === currentRoomId && <b>本直播</b>}
                        <span className={`room-record-result ${resultClass}`}>
                          {record.cardId ? getResultSideLabel(record.resultSide) : "待開"}
                        </span>
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : <p className="empty-state compact-empty">暫時未有抽卡紀錄。</p>}
          </aside>
        </div>
      )}
    </>
  );
}

// Keeps purchase review, payment progress, and completion feedback in one focused flow.
function BlindBoxPurchaseModal({ purchase, stage, onCancel, onConfirm }) {
  const isGenerating = stage === "generating";
  const isComplete = stage === "complete";
  const odds = getBlindBoxOdds(purchase.shareMode);

  return (
    <div
      className="modal-backdrop blind-box-backdrop"
      role="presentation"
      onMouseDown={isGenerating ? undefined : onCancel}
    >
      <section
        className={`modal blind-box-modal ${stage}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blind-box-title"
        aria-live="polite"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {stage === "confirm" && (
          <>
            <button className="icon-btn modal-close" type="button" onClick={onCancel} aria-label="取消生成盲盒"><X size={19} /></button>
            <div className="blind-box-visual confirm-visual"><Gift size={48} /></div>

            <h2 id="blind-box-title">確認生成盲盒</h2>
            <p className="blind-box-copy">確認後會扣除代幣並鎖定號碼，盲盒將會加入你的抽卡紀錄。</p>
            <section className="blind-box-rules" aria-label="天堂地獄玩法及中獎機率">
              <div className="blind-box-odds-heading">
                <span>{odds.label}玩法</span>
                <strong>盲盒抽中機率 {odds.heavenRate}%</strong>
              </div>
              <div className="blind-box-outcome heaven">
                <span>天堂 · {odds.heavenRate}%</span>
                <strong>{purchase.card.name}</strong>
                <small>抽中並獲得所選目標卡</small>
              </div>
              <div className="blind-box-outcome hell">
                <span>地獄 · {odds.hellRate}%</span>
                <strong>{purchase.hellCardName}</strong>
                <small>未抽中目標卡時獲得的對應卡牌</small>
              </div>
            </section>
            <div className="blind-box-order">
              <div><span>房間</span><strong>{purchase.roomTitle}</strong></div>
              <div><span>場次</span><strong>{formatRoundLabel(purchase.roundId)}</strong></div>
              <div><span>盲盒號碼</span><strong>#{purchase.slot.number}</strong></div>
              <div><span>所需代幣</span><strong><TokenAmount value={purchase.tokenCost} /></strong></div>
            </div>
            <div className="blind-box-actions">
              <button className="small-btn" type="button" onClick={onCancel}>返回修改</button>
              <button className="primary-btn" type="button" onClick={onConfirm}>確認生成盲盒</button>
            </div>
          </>
        )}
        {isGenerating && (
          <div className="blind-box-generating">
            <div className="blind-box-animation" aria-hidden="true">
              <span className="blind-box-glow" />
              {Array.from({ length: 10 }, (_, index) => (
                <span className={`blind-box-card blind-box-card-${index + 1}`} key={index} />
              ))}
              <span className="blind-box-cube"><Gift size={54} /></span>
              <i /><i /><i /><i />
            </div>

            <h2 id="blind-box-title">正在生成盲盒</h2>
            <p>正在鎖定 #{purchase.slot.number}，請勿關閉頁面。</p>
          </div>
        )}
        {isComplete && (
          <div className="blind-box-complete">
            <div className="blind-box-visual complete-visual"><Check size={48} /></div>

            <h2 id="blind-box-title">盲盒生成完成</h2>
            <p><strong>#{purchase.slot.number}</strong> 已成功加入你的抽卡紀錄。</p>
            <button className="primary-btn" type="button" onClick={onCancel}>返回揀卡</button>
          </div>
        )}
      </section>
    </div>
  );
}

function BetaPsaCarousel({ cards, rooms, onOpenRoom, onSelectCard }) {
  const featuredCards = useMemo(() => {
    const roomCards = rooms.flatMap((room) => normalizeRoomCards(room.poolCards));
    const uniqueCards = new Map();

    [...cards, ...roomCards].forEach((card) => {
      const key = String(card.id || card.name || "").trim();
      const value = Number(card.tokenValue || 0);
      if (!key || !card.name || !card.imageUrl || value <= 0 || uniqueCards.has(key)) return;
      uniqueCards.set(key, { ...card, tokenValue: value });
    });

    return [...uniqueCards.values()]
      .sort((left, right) => right.tokenValue - left.tokenValue)
      .slice(0, 12);
  }, [cards, rooms]);

  if (!featuredCards.length) return null;

  function openLiveRoom(card) {
    const liveRooms = rooms.filter((room) => room.status === "live");
    const cardId = String(card.id || "");
    const cardName = String(card.name || "").trim().toLowerCase();
    const matchingRoom = liveRooms.find((room) => {
      const roomCardIds = getRoomPoolIds(room);
      const roomCards = normalizeRoomCards(room.poolCards);
      return (cardId && roomCardIds.includes(cardId)) || roomCards.some((roomCard) =>
        (cardId && String(roomCard.id || "") === cardId)
        || String(roomCard.name || "").trim().toLowerCase() === cardName,
      );
    });
    const destinationRoom = matchingRoom || liveRooms[0];

    if (!destinationRoom) {
      alert("目前暫時未有直播中房間，請稍後再試。");
      return;
    }
    if (onSelectCard) onSelectCard(card);
    else onOpenRoom(destinationRoom);
  }

  return (
    <section className="beta-psa-carousel" aria-labelledby="beta-psa-title">
      <div className="beta-psa-heading">
        <div>
          <h2 id="beta-psa-title">即時直播盲盒抽卡</h2>
        </div>
      </div>
      <div className="beta-psa-viewport" tabIndex="0" aria-label="PSA10 卡牌走馬燈">
        <div className="beta-psa-track">
          {[false, true].map((duplicate) => (
            <div
              aria-hidden={duplicate || undefined}
              className="beta-psa-group"
              key={duplicate ? "duplicate" : "primary"}
            >
              {featuredCards.map((card) => (
                <button
                  className="beta-psa-card"
                  key={`${duplicate ? "copy" : "card"}-${card.id || card.name}`}
                  type="button"
                  tabIndex={duplicate ? -1 : 0}
                  onClick={() => openLiveRoom(card)}
                  aria-label={`進入直播中房間抽 ${card.name}`}
                >
                  <span className="beta-psa-badge">PSA 10</span>
                  <img src={card.imageUrl} alt={card.name} loading="lazy" />
                  <strong title={card.name}>{card.name}</strong>
                  <div className="beta-psa-price">
                    <del><TokenAmount value={card.tokenValue} /></del>
                    <b><TokenAmount value={Math.max(1, Math.round(card.tokenValue / 10))} /></b>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoomList({ rooms, cards = [], error, loading, onOpenRoom, profile }) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [betaFilter, setBetaFilter] = useState("live");
  const [rulesOpen, setRulesOpen] = useState(false);
  const betaFilters = [
    { id: "live", label: "直播中", sublabel: "" },
    { id: "draft", label: "即將開", sublabel: "" },
    { id: "half", label: "二份之一", sublabel: "1/2" },
    { id: "fifth", label: "五份之一", sublabel: "1/5" },
    { id: "tenth", label: "十分之一", sublabel: "1/10" },
  ];
  const visibleRooms = useMemo(() => {
    if (!isBeta) return rooms;
    if (betaFilter === "live") return rooms.filter((room) => room.status === "live");
    if (betaFilter === "draft") return rooms.filter((room) => room.status === "draft");
    const shareText = { half: "1/2", fifth: "1/5", tenth: "1/10" }[betaFilter];
    return rooms.filter((room) =>
      String(room.shareMode || room.drawMode || room.poolText || "").includes(shareText),
    );
  }, [betaFilter, isBeta, rooms]);

  if (loading) {
    return (
      <section className="panel">
        <InlineLoading label="正在載入房間..." />
      </section>
    );
  }

  if (error && !rooms.length) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>無法載入房間</h2>
        <p className="muted">{error}</p>
      </section>
    );
  }

  if (!rooms.length && !isBeta) {
    return (
      <section className="panel empty-state">
        <Gavel size={36} />
        <h2>暫時沒有房間</h2>
        <p className="muted">管理員可於管理後台建立新的抽卡房間。</p>
      </section>
    );
  }

  return (
    <section className={isBeta ? "panel beta-room-list-panel" : "panel"}>
      {isBeta && (
        <div className="beta-announcements" aria-label="最新公告">
          <div className="beta-announcements-track">
            {[false, true].map((duplicate) => (
              <div
                aria-hidden={duplicate || undefined}
                className="beta-announcements-group"
                key={duplicate ? "duplicate" : "primary"}
              >
                <strong>最新公告</strong>
                <span><b>最新</b> 二份之一賽道限量開放。</span>
                <span><b>活動</b> 首次申請代幣滿指定金額送免費抽選。</span>
                <span><b>公告</b> 系統維護時間請留意最新消息。</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="banner-slot">

      </div>
      {isBeta && <BetaPsaCarousel cards={cards} rooms={rooms} onOpenRoom={onOpenRoom} />}
      {isBeta && (
        <div className="beta-room-filters" aria-label="房間篩選">
          {betaFilters.map((filter) => (
            <button
              className={betaFilter === filter.id ? "active" : ""}
              key={filter.id}
              type="button"
              onClick={() => setBetaFilter(filter.id)}
            >
              {filter.sublabel && <b>{filter.sublabel}</b>}
              <span>{filter.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="section-heading">
        <Gavel size={24} />
        <div>

          <h1>{isBeta ? "所有房間" : "抽卡房間"}</h1>
        </div>
        {isBeta ? (
          <div className="beta-room-heading-actions">
            <span className="beta-room-count">
              {visibleRooms.length} 間 · {rooms.filter((room) => room.status === "live").length} 直播中
            </span>
            <button className="small-btn" type="button" onClick={() => setRulesOpen(true)}>
              玩法介紹
            </button>
          </div>
        ) : (
          <button className="small-btn" type="button">玩法介紹</button>
        )}
      </div>
      {error && <p className="form-note">Live room refresh warning: {error}</p>}
      <div className={isBeta ? "beta-home-room-layout" : undefined}>
        <div className="room-list-grid">
          {visibleRooms.map((room) => {
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
                <strong>{room.title}</strong>
                <span>{formatRoundLabel(toRoundId(getRoomCurrentRound(room)))} / 共 {getRoomRoundCount(room)} 場</span>
                <span className="beta-room-start-time">
                  開場時間：{formatRoundSchedule(room, toRoundId(getRoomCurrentRound(room)))}
                </span>
              </div>
            </button>
            );
          })}
          {!visibleRooms.length && (
            <div className="empty-state compact-empty room-filter-empty">
              <Gavel size={28} />
              <p className="muted">呢個分類暫時未有房間。</p>
            </div>
          )}
        </div>
        {isBeta && <BetaRecentRecords profile={profile} />}
      </div>
      {isBeta && rulesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRulesOpen(false)}>
          <section className="modal beta-rules-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-btn modal-close" type="button" onClick={() => setRulesOpen(false)} aria-label="關閉玩法介紹">
              <X size={18} />
            </button>

            <h2>抽卡玩法</h2>
            <ol>
              <li>進入直播房間，先選擇想抽中的目標卡牌。</li>
              <li>選擇場次及未被鎖定的天堂地獄號碼。</li>
              <li>確認付款後扣除代幣並鎖定號碼，等待直播開牌。</li>
              <li>結果分配後可在「我的卡牌」申請配送或轉回代幣。</li>
            </ol>
          </section>
        </div>
      )}
    </section>
  );
}

const CardPoolPreview = memo(function CardPoolPreview({
  draw,
  cards,
  cardCategories,
  loading,
  selectedCardId,
  selectedCard,
  onSelectCard,
  onContinue,
}) {
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [priceSort, setPriceSort] = useState("high");
  const cardGridRef = useRef(null);
  const categories = useMemo(
    () => getCardCategories(cards, cardCategories),
    [cardCategories, cards],
  );
  const visibleCards = useMemo(
    () =>
      cards
        .filter((card) => categoryFilter === "全部" || getCardCategory(card) === categoryFilter)
        .sort((a, b) =>
          priceSort === "high"
            ? Number(b.tokenValue || 0) - Number(a.tokenValue || 0)
            : Number(a.tokenValue || 0) - Number(b.tokenValue || 0),
        ),
    [cards, categoryFilter, priceSort],
  );

  useEffect(() => {
    cardGridRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, [categoryFilter, priceSort]);

  return (
    <section id="card-selection" className="panel card-pool-preview">
      <div>
        <p className="eyebrow">第一步</p>
        <h2>選擇卡牌</h2>
      </div>
      <span>共 {cards.length || draw.cardCount || 0} 張可選</span>
      {loading ? (
        <InlineLoading label="正在載入房間卡池..." />
      ) : cards.length ? (
        <>
          <div className="card-pool-toolbar">
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
            <div className="price-sort-filter" aria-label="卡牌價格排序">
              <button
                className={priceSort === "high" ? "active" : ""}
                type="button"
                onClick={() => setPriceSort("high")}
              >
                價高
              </button>
              <button
                className={priceSort === "low" ? "active" : ""}
                type="button"
                onClick={() => setPriceSort("low")}
              >
                價低
              </button>
            </div>
          </div>
          <div className="card-step-action">
            <div>
              <span>已選卡牌</span>
              <strong>{selectedCard?.name || "請先選擇卡牌"}</strong>
              {selectedCard && <TokenAmount value={selectedCard.tokenValue} />}
            </div>
            <button className="primary-btn" type="button" disabled={!selectedCard} onClick={onContinue}>
              確定 · 選擇號碼
            </button>
          </div>
          <div className="pool-card-grid" ref={cardGridRef}>
            {visibleCards.map((card) => (
              <button
                className={selectedCardId === card.id ? "pool-card selected" : "pool-card"}
                key={card.id}
                type="button"
                onClick={() => onSelectCard(card.id)}
              >
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="image-placeholder">
                    <Package size={24} />
                  </div>
                )}
                <strong>{card.name}</strong>
                <small>{getCardCategory(card)}</small>
                <TokenAmount value={card.tokenValue} />
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
});

// Keeps every live date and round visible beneath the stream, matching the single-hall layout.
function RoomRoundOverview({ draw, activeRoundId, roundOptions, onRoundChange }) {
  const groups = getRoundsByDate(draw, roundOptions);
  const activeGroup = groups.find((group) => group.rounds.includes(activeRoundId)) || groups[0];
  const activeRoundStatus = getRoundDisplayStatus(draw, activeRoundId);
  const activeResultImage = draw.roundResultImages?.[activeRoundId] || "";

  return (
    <section className="room-round-overview" aria-label="抽卡場次">
      <div className="room-round-date-navigation">
        <strong>按日期查看場次／過往賽果</strong>
        <div className="room-round-date-tabs" aria-label="選擇直播日期">
          {groups.map((group) => (
            <button
              className={group.key === activeGroup?.key ? "active" : ""}
              key={group.key}
              type="button"
              onClick={() => onRoundChange(group.rounds[0])}
            >
              {group.fullLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="room-round-card-strip">
        {(activeGroup?.rounds || roundOptions).map((roundId) => {
          const roundStatus = getRoundDisplayStatus(draw, roundId);
          return (
            <button
              className={activeRoundId === roundId ? "active" : ""}
              key={roundId}
              type="button"
              onClick={() => onRoundChange(roundId)}
            >
              <span className={`round-status ${roundStatus.key}`}>{roundStatus.label}</span>
              <strong>{formatRoundLabel(roundId)}</strong>
              <small>盲盒機率：{getBlindBoxOdds(getRoomShareMode(draw, roundId)).label}</small>
              <time>{formatRoundSchedule(draw, roundId)}</time>
            </button>
          );
        })}
      </div>
      {activeRoundStatus.key === "completed" && (
        <section className="round-overview-result" aria-label={`${formatRoundLabel(activeRoundId)}過往賽果`}>
          <div>
            <FileImage size={17} />
            <span><strong>{formatRoundLabel(activeRoundId)}賽果</strong><small>{activeGroup?.fullLabel || "過往場次"}</small></span>
          </div>
          {activeResultImage ? (
            <a href={activeResultImage} target="_blank" rel="noreferrer" aria-label={`放大查看${formatRoundLabel(activeRoundId)}賽果`}>
              <img src={activeResultImage} alt={`${formatRoundLabel(activeRoundId)}正式賽果`} />
              <span>按圖放大查看</span>
            </a>
          ) : (
            <p>呢一場已完結，賽果相片整理中。</p>
          )}
        </section>
      )}
    </section>
  );
}

function NumberGrid({
  draw,
  slots,
  loading,
  profile,
  selectedCard,
  activeRoundId,
  roundOptions,
  selectedSlotNumber,
  buyingNumber,
  onBack,
  onRoundChange,
  onSelectNumber,
  onBuy,
}) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";

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
  const roundHasEnded = activeRoundSort < currentRoundSort;
  const roundIsPurchasable = activeRoundSort >= currentRoundSort;
  const buyingBlocked = isRoundBuyingBlocked(draw, activeRoundId);
  const roundResultImage = draw.roundResultImages?.[activeRoundId] || "";
  const roundOutcomeDescription = {
    "1/2": "開牌後，將會有10張開出天堂，10張開出地獄。（二份之一）",
    "1/10": "開牌後，將會有2張開出天堂，另外有18張開出地獄。（十份之一）",
    "1/5": "開牌後，將會有4張開出天堂，另外有16張開出地獄。（五份之一）",
  }[getRoomShareMode(draw, activeRoundId)];
  const roundsByDate = getRoundsByDate(draw, roundOptions);
  const activeDateGroup = roundsByDate.find((group) => group.rounds.includes(activeRoundId));
  const visibleRoundOptions = activeDateGroup?.rounds || roundOptions;
  const mySlots = slots.filter((slot) => slot.uid === profile?.uid);
  const selectedNumber = selectedSlotNumber || buyingNumber || null;
  const canPay = Boolean(roundIsPurchasable && !buyingBlocked && selectedCard && selectedSlotNumber && !buyingNumber);

  return (
    <section id="number-selection" className="panel number-panel">
      <div className="section-heading compact number-heading">
        <div>
          <p className="eyebrow">第二步</p>
          <h2>選擇號碼</h2>
          <p className="number-outcome-description">{roundOutcomeDescription}</p>
        </div>
        <button className="small-btn number-step-back" type="button" onClick={onBack}>
          <ChevronLeft size={17} />上一步 · 重新揀牌
        </button>
      </div>
      {!isBeta && <aside className="round-stage-list" aria-label="場次列表">
        <header><span>場次列表</span><small>共 {roundOptions.length} 場</small></header>
        <div className="round-date-bar" aria-label="按日期查看過往賽果">
          {roundsByDate.map((group) => (
            <button
              className={group.key === activeDateGroup?.key ? "active" : ""}
              key={group.key}
              type="button"
              onClick={() => onRoundChange(group.rounds[0])}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="round-selector">
          {visibleRoundOptions.map((roundId) => {
            const roundStatus = getRoundDisplayStatus(draw, roundId);
            return (
              <button
                className={activeRoundId === roundId ? "active" : ""}
                key={roundId}
                type="button"
                onClick={() => onRoundChange(roundId)}
              >
                <strong>{formatRoundLabel(roundId)}</strong>
                <small>{formatRoundSchedule(draw, roundId)} · {getRoomShareMode(draw, roundId)}</small>
                <em className={`round-status ${roundStatus.key}`}>{roundStatus.label}</em>
              </button>
            );
          })}
        </div>
      </aside>}
      <div className="round-time-summary">
        <Clock3 size={16} />
        <span>預計開卡：{formatRoundSchedule(draw, activeRoundId)}</span>
      </div>
      {(roundHasEnded || buyingBlocked || selectedCard) && <p className="muted number-help">
        {roundHasEnded
          ? `${formatRoundLabel(activeRoundId)}已過場，只可以查看紀錄，不能再鎖定號碼。`
          : buyingBlocked
          ? `${formatRoundLabel(activeRoundId)}已停止購買，只可以查看紀錄，不能再鎖定號碼。`
          : `已選 ${selectedCard.name}，${formatRoundLabel(activeRoundId)}共 ${draw.cardCount} 個號碼，已被選走的號碼無法重選。`}
      </p>}
      {!selectedCard && (
        <div className="number-card-gate" role="status">
          <Package size={23} />
          <div><strong>號碼使用情況</strong><span>你可以先查看哪些號碼已被選走；如要購買，請返回上一步選擇卡牌。</span></div>
        </div>
      )}
      <div className={selectedCard ? "slot-grid" : "slot-grid card-required"}>
        {loading ? (
          <InlineLoading label="正在載入可選號碼..." />
        ) : slots.map((slot) => {
          const locked = slot.status !== "available";
          const mine = locked && slot.uid === profile?.uid;
          const selected = roundIsPurchasable && !buyingBlocked && !locked && slot.number === selectedSlotNumber;
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
              disabled={!roundIsPurchasable || buyingBlocked || !selectedCard || locked || buyingNumber === slot.number}
              key={slot.id}
              type="button"
              onClick={() => onSelectNumber(slot.number)}
            >
              <strong>{slot.number}</strong>
              <small>
                {mine
                  ? "你的號碼"
                  : locked
                    ? slot.username || "已被選走"
                  : roundHasEnded
                    ? "已過場"
                  : buyingBlocked
                    ? "已停止"
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
      {(roundHasEnded || draw.status === "completed") && roundResultImage && (
        <section className="room-round-result after-grid" aria-label={`${formatRoundLabel(activeRoundId)}賽果相片`}>
          <div className="room-round-result-heading">
            <FileImage size={18} />
            <div>
              <strong>{formatRoundLabel(activeRoundId)}正式賽果</strong>
              <span>點擊圖片可以放大查看</span>
            </div>
          </div>
          <a href={roundResultImage} target="_blank" rel="noreferrer" aria-label={`放大查看${formatRoundLabel(activeRoundId)}賽果`}>
            <img src={roundResultImage} alt={`${formatRoundLabel(activeRoundId)}賽果`} />
          </a>
        </section>
      )}
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
            : roundHasEnded
              ? "已過場"
            : buyingBlocked
              ? ROUND_BUY_LOCKED_LABEL
            : selectedCard
              ? "先選擇號碼"
              : "先選擇卡牌"}
        </span>
      </button>
    </section>
  );
}

const KickEmbed = memo(function KickEmbed({ kickUrl, title }) {
  const [isMuted, setIsMuted] = useState(true);
  const embedUrl = useMemo(() => {
    const playerUrl = toKickEmbedUrl(kickUrl);
    return playerUrl
      ? `${playerUrl}?autoplay=true&muted=${isMuted}&allowfullscreen=true`
      : "";
  }, [isMuted, kickUrl]);
  const frameWrapRef = useRef(null);
  const playerFrameRef = useRef(null);
  const inlinePlayerSizeRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenScale, setFullscreenScale] = useState(1);

  useEffect(() => {
    function fitExistingPlayerToFullscreen() {
      const size = inlinePlayerSizeRef.current;
      if (!size?.width || !size?.height) return;
      setFullscreenScale(Math.min(window.innerWidth / size.width, window.innerHeight / size.height));
    }

    function syncFullscreenState() {
      const fullscreen = document.fullscreenElement === frameWrapRef.current;
      setIsFullscreen(fullscreen);
      if (fullscreen) {
        window.requestAnimationFrame(fitExistingPlayerToFullscreen);
      } else {
        setFullscreenScale(1);
      }
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    window.addEventListener("resize", fitExistingPlayerToFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      window.removeEventListener("resize", fitExistingPlayerToFullscreen);
    };
  }, []);

  if (!embedUrl) {
    return <div className="stream-fallback">尚未設定有效的 Kick 頻道</div>;
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === frameWrapRef.current) {
        await document.exitFullscreen?.();
      } else {
        const playerRect = playerFrameRef.current?.getBoundingClientRect();
        if (playerRect?.width && playerRect?.height) {
          inlinePlayerSizeRef.current = {
            width: playerRect.width,
            height: playerRect.height,
          };
        }
        await frameWrapRef.current?.requestFullscreen?.();
      }
    } catch {
      // Browsers may reject fullscreen changes; the player remains usable inline.
    }
  }

  return (
    <div className="kick-frame-wrap" ref={frameWrapRef}>
      <iframe
        className="kick-frame"
        ref={playerFrameRef}
        src={embedUrl}
        style={isFullscreen && inlinePlayerSizeRef.current ? {
          width: `${inlinePlayerSizeRef.current.width}px`,
          height: `${inlinePlayerSizeRef.current.height}px`,
          maxWidth: "none",
          maxHeight: "none",
          transform: `scale(${fullscreenScale})`,
        } : undefined}
        title={`${title} Kick stream`}
        allow="autoplay; fullscreen; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        referrerPolicy="strict-origin-when-cross-origin"
        scrolling="no"
        allowFullScreen
      />
      <button
        className="stream-mute-btn"
        type="button"
        onClick={() => setIsMuted((current) => !current)}
        aria-label={isMuted ? "開啟直播聲音" : "將直播靜音"}
        aria-pressed={isMuted}
        title={isMuted ? "開啟聲音" : "靜音"}
      >
        {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      <button
        className="stream-fullscreen-btn"
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "縮小直播" : "放大直播"}
        title={isFullscreen ? "縮小直播" : "放大直播"}
      >
        {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
      </button>
    </div>
  );
});

function ChatRoom({ drawId, profile }) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const chatLogRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);

  useEffect(() => {
    // Each live document owns a separate message collection; clear local state before switching rooms.
    setMessages([]);
    setText("");
    setMessagesLoading(true);
    const messagesQuery = query(
      collection(db, "draws", drawId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(100),
    );
    const stopMessages = onSnapshot(messagesQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      if (isSnapshotReady(snapshot)) setMessagesLoading(false);
    }, (error) => {
      console.error("Room chat listener failed.", error);
      setMessagesLoading(false);
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

  // Keep the live conversation pinned to the newest message as updates arrive.
  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog || messagesLoading) return;
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, messagesLoading]);

  async function sendMessage(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || sending || cooldownMs > 0) return;

    setSending(true);
    try {
      const claimedUsername = await ensureUsernameClaim(profile.uid, profile.username);

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
          username: claimedUsername,
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
      <div className={isBeta ? "section-heading compact beta-live-chat-heading" : "section-heading compact"}>
        {!isBeta && <ListChecks size={22} />}
        <div>
          {isBeta && <span>LIVE CHAT</span>}
          <h2>大廳聊天</h2>
        </div>
      </div>
      <div className="chat-log" ref={chatLogRef} aria-live="polite">
        {messagesLoading ? (
          <InlineLoading label="正在載入大廳訊息..." />
        ) : messages.length ? (
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
          <p className="muted">大廳暫時未有訊息。</p>
        )}
      </div>
      <form className="chat-form" onSubmit={sendMessage}>
        <input
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="輸入大廳訊息"
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

function getKickChannel(kickValue) {
  const value = String(kickValue || "").trim();
  if (/^[A-Za-z0-9_-]{2,40}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!["kick.com", "www.kick.com", "player.kick.com"].includes(url.hostname.toLowerCase())) return "";
    const channel = url.pathname.split("/").filter(Boolean)[0] || "";
    return /^[A-Za-z0-9_-]{2,40}$/.test(channel) ? channel : "";
  } catch {
    return "";
  }
}

function toKickEmbedUrl(kickValue) {
  const channel = getKickChannel(kickValue);
  return channel ? `https://player.kick.com/${channel}` : "";
}

function RoomThumbnail({ draw }) {
  if (!draw?.thumbnailUrl) return null;

  return (
    <img className="room-thumbnail" src={draw.thumbnailUrl} alt={`${draw.title} thumbnail`} />
  );
}

function VipProgramPanel({ deposit, tiers }) {
  const vip = getVipState(tiers, deposit);

  return (
    <section className="vip-program-panel">
      <div className="vip-program-header">
        <div>

          <h1>
            VIP 等級 <span>{vip.currentTier?.name || "未入級"}</span>
          </h1>
          <p>
            累積入金 <strong>HK${formatTokenNumber(deposit)}</strong> · 每次升級即送指定實體卡
          </p>
        </div>
        <div className="vip-next-card">
          {vip.nextTier ? (
            <>
              <span>距離 {vip.nextTier.name}</span>
              <strong>再入金 HK${formatTokenNumber(vip.remaining)}</strong>
              <small>升級即獲 {vip.nextTier.rewardName || "指定卡牌"}</small>
            </>
          ) : (
            <>
              <span>最高級別</span>
              <strong>所有 VIP 等級已達成</strong>
              <small>多謝你一直支持直播抽卡。</small>
            </>
          )}
        </div>
      </div>
      <div className="vip-tier-grid">
        {vip.tiers.map((tier, index) => (
          <article
            className={`vip-tier-card ${tier.done ? "done" : ""} ${tier.active ? "active" : ""}`}
            key={tier.id}
          >
            <div className="vip-tier-rail">
              <i style={{ width: `${tier.progress}%` }} />
            </div>
            <div className="vip-shield">{index}</div>
            <div className="vip-tier-state">
              {tier.done ? "已達成" : tier.active ? `${Math.round(tier.progress)}%` : "未解鎖"}
            </div>
            <div className="vip-tier-detail">
              <strong>{tier.name}</strong>
              <b>HK${formatTokenNumber(tier.threshold)}</b>
              <span>{tier.rewardName || "待設定升級獎勵"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TokenRequest({ profile }) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const tokenPackages = useTokenPackages(!profile.isDemo);
  const paymentSettings = usePaymentSettings(!profile.isDemo);
  const vipTiers = useVipProgram(!profile.isDemo);
  const [selectedPackage, setSelectedPackage] = useState(tokenPackages[0].hkd);
  const [customHkd, setCustomHkd] = useState("");
  const [proof, setProof] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [fpsIdentifier, setFpsIdentifier] = useState("");
  const [fpsName, setFpsName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const usingCustomAmount = selectedPackage === "custom";
  const hkdAmount = usingCustomAmount ? Number(customHkd || 0) : Number(selectedPackage);
  const tokenAmount = usingCustomAmount
    ? calculateTokenAmount(hkdAmount)
    : tokenPackages.find((item) => item.hkd === hkdAmount)?.tokens || 0;
  const baseTokens = Math.max(0, Math.floor(hkdAmount));
  const bonusTokens = Math.max(0, tokenAmount - baseTokens);
  const bonusRate = baseTokens > 0 ? Math.round((bonusTokens / baseTokens) * 100) : 0;
  const approvedDeposit = requests
    .filter((request) => request.status === "approved" && request.proofMode !== "promo")
    .reduce((sum, request) => sum + Number(request.verifiedHkdAmount ?? request.hkdAmount ?? 0), 0);
  const cumulativeDeposit = Math.max(Number(profile.totalDeposits || 0), approvedDeposit);

  useEffect(() => {
    if (
      selectedPackage !== "custom" &&
      !tokenPackages.some((item) => item.hkd === Number(selectedPackage))
    ) {
      setSelectedPackage(tokenPackages[0].hkd);
    }
  }, [selectedPackage, tokenPackages]);

  useEffect(() => {
    if (profile.isDemo) {
      setRequests([
        {
          id: "demo-token-request",
          amount: 1050,
          hkdAmount: 1000,
          status: "approved",
          fpsName: "Demo Player",
        },
      ]);
      setRequestsLoading(false);
      return undefined;
    }
    setRequestsLoading(true);
    const requestsQuery = query(
      collection(db, "tokenRequests"),
      where("uid", "==", profile.uid),
    );
    const stopRequests = onSnapshot(requestsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRequests(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
      );
      if (isSnapshotReady(snapshot)) setRequestsLoading(false);
    }, (error) => {
      console.error("Token request listener failed.", error);
      setRequestsLoading(false);
    });

    return stopRequests;
  }, [profile.isDemo, profile.uid]);

  async function submitRequest(event) {
    event.preventDefault();

    if (profile.isDemo) {
      alert("測試帳戶只供預覽，不會提交代幣申請。");
      return;
    }

    if (!Number.isSafeInteger(hkdAmount) || hkdAmount < 500 || hkdAmount > 1000000 || tokenAmount < 1 || tokenAmount > 1000000) {
      alert("請選擇套餐，或輸入最少 HK$500 的自訂金額。");
      return;
    }
    const cleanPromoCode = promoCode.trim();
    if (!proof && !cleanPromoCode) {
      alert("請上傳付款證明，或輸入活動碼供管理員審核。");
      return;
    }
    const requestFpsIdentifier = isBeta ? paymentSettings.fpsIdentifier : fpsIdentifier.trim();
    const requestFpsName = isBeta ? paymentSettings.fpsName : fpsName.trim();
    if (proof && (!requestFpsIdentifier || !requestFpsName)) {
      alert(isBeta
        ? "平台尚未設定 FPS 收款資料，請聯絡管理員。"
        : "請輸入轉數快識別碼及收款人姓名，方便管理員核對。");
      return;
    }

    setSubmitting(true);
    try {
      const claimedUsername = await ensureUsernameClaim(profile.uid, profile.username);

      const proofInfo = proof
        ? await createProofInfo({ proof, profile })
        : { proofMode: "promo", proofPath: "", proofFileName: "", proofUrl: "" };

      await addDoc(collection(db, "tokenRequests"), {
        uid: profile.uid,
        username: claimedUsername,
        email: profile.email || "",
        amount: tokenAmount,
        hkdAmount,
        exchangeRate: tokenAmount / hkdAmount,
        packageType: usingCustomAmount ? "custom" : "preset",
        fpsIdentifier: requestFpsIdentifier,
        fpsName: requestFpsName,
        ...proofInfo,
        status: "pending",
        adminNote: "",
        promoCode: cleanPromoCode,
        createdAt: serverTimestamp(),
      });

      setProof(null);
      setPromoCode("");
      setFpsIdentifier("");
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
    <div className="token-page">
      {!isBeta && <VipProgramPanel deposit={cumulativeDeposit} tiers={vipTiers} />}
      <div className="split-layout token-request-layout">
      <section className="panel token-request-panel">
        <div className="section-heading">
          <BadgeDollarSign size={24} />
          <div>

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
                  <span>
                    <TokenAmount value={item.tokens} />
                    <em>+{getTokenBonusRate(item)}% 額外</em>
                  </span>
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
            <div>
              <span>{isBeta ? "可領取的代幣" : "申請代幣"}</span>
              <em>+{bonusRate}% 額外</em>
            </div>
            <strong><span className="coin-dot">D</span>{formatTokenNumber(tokenAmount)}</strong>
            <small>付款金額 HK${formatTokenNumber(hkdAmount)}</small>
            <p>
              基本 1:1 = {formatTokenNumber(baseTokens)} 代幣 ＋ 額外 {bonusRate}% = {formatTokenNumber(bonusTokens)} 代幣
            </p>
          </div>
          {isBeta ? (
            <div className="platform-fps-panel">
              <div>
                <span>平台 FPS 識別碼</span>
                <strong>{paymentSettings.fpsIdentifier || "尚未設定"}</strong>
              </div>
              <div>
                <span>收款人姓名</span>
                <strong>{paymentSettings.fpsName || "尚未設定"}</strong>
              </div>
              <button
                className="small-btn"
                type="button"
                disabled={!paymentSettings.fpsIdentifier}
                onClick={() => navigator.clipboard.writeText(paymentSettings.fpsIdentifier)}
              >
                <Copy size={15} />複製 FPS 號碼
              </button>
            </div>
          ) : (
            <>
              <label>
                轉數快識別碼
                <input value={fpsIdentifier} onChange={(event) => setFpsIdentifier(event.target.value)} placeholder="請輸入 FPS 識別碼" required={Boolean(proof)} />
              </label>
              <label>
                收款人姓名
                <input value={fpsName} onChange={(event) => setFpsName(event.target.value)} placeholder="請輸入收款人姓名" required={Boolean(proof)} />
              </label>
            </>
          )}
        <FileUpload
            label="付款證明圖片"
            file={proof}
            onChange={setProof}
          />
          <p className="form-note">付款證明或活動碼擇一提供；所有申請須經人工審核，批准後才會發放代幣。</p>
          <label>
            推廣活動邀請碼
            <input
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value)}
              placeholder="輸入推廣活動邀請碼（選填）"
            />
          </label>
          {isBeta && (
            <div className="claimable-token-field">
              <span>可領取的代幣</span>
              <strong><TokenAmount value={tokenAmount} /></strong>
            </div>
          )}
          <p className="form-note">
            基本兌換率 HK$1：1 代幣；入金愈多，額外代幣百分比愈高。批准後代幣會加入帳戶；只有核實的付款會計入 VIP 累積入金。
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

            <h2>我的代幣申請</h2>
          </div>
        </div>
        <RequestList requests={requests} loading={requestsLoading} />
      </section>
      </div>
      {isBeta && <VipProgramPanel deposit={cumulativeDeposit} tiers={vipTiers} />}
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

function RequestList({ requests, loading = false, adminMode = false, onApprove, onReject }) {
  if (loading) {
    return <InlineLoading label="正在載入申請紀錄..." />;
  }

  if (!requests.length) {
    return <p className="muted">暫時未有申請。</p>;
  }

  return (
    <div className="record-list">
      {requests.map((request) => (
        <article className="record-item" key={request.id}>
          <div className="request-main">
            <span className="coin-dot"><Zap size={15} /></span>
            <div>
              <strong>
                {request.amount} 代幣
                {adminMode && request.username ? ` - ${request.username}` : ""}
              </strong>
              <span>{formatDate(request.createdAt)}</span>
              {request.hkdAmount && <span>付款金額：HK${formatTokenNumber(request.hkdAmount)}</span>}
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
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [records, setRecords] = useState([]);
  const [slotRecords, setSlotRecords] = useState([]);
  const [roomsById, setRoomsById] = useState({});
  const [recordsError, setRecordsError] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [historyRoomsLoading, setHistoryRoomsLoading] = useState(true);
  const demoCards = useBetaDemoCards(Boolean(profile.isDemo));

  useEffect(() => {
    if (profile.isDemo) {
      setRecords(enrichDemoRecords(BETA_DEMO_RECORDS, demoCards));
      setRoomsById({
        "demo-live-room": { id: "demo-live-room", status: "live", title: "Beta Live Card Draw" },
        "demo-complete-room": { id: "demo-complete-room", status: "completed", title: "Weekend Card Break" },
      });
      setRecordsError("");
      setRecordsLoading(false);
      setHistoryRoomsLoading(false);
      return undefined;
    }
    setRecordsLoading(true);
    setHistoryRoomsLoading(true);
    const roomsQuery = query(collection(db, "draws"), orderBy("createdAt", "desc"));
    const stopRooms = onSnapshot(
      roomsQuery,
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        setRoomsById(
          Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }])),
        );
        if (isSnapshotReady(snapshot)) setHistoryRoomsLoading(false);
      },
      (error) => {
        console.error("History room listener failed.", error);
        setHistoryRoomsLoading(false);
      },
    );

    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    const stopRecords = onSnapshot(
      recordsQuery,
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        setRecords(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
        );
        setRecordsError("");
        if (isSnapshotReady(snapshot)) setRecordsLoading(false);
      },
      (error) => {
        console.error("Draw records listener failed.", error);
        setRecordsError(getSafeErrorMessage(error, "未能載入我的紀錄。"));
        setRecordsLoading(false);
      },
    );

    return () => {
      stopRooms();
      stopRecords();
    };
  }, [demoCards, profile.isDemo, profile.uid]);

  useEffect(() => {
    if (profile.isDemo) {
      setSlotRecords([]);
      return undefined;
    }
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
  }, [profile.isDemo, profile.uid, roomsById]);

  const mergedRecords = useMemo(
    () => mergePurchaseRecords(records, slotRecords, roomsById),
    [records, roomsById, slotRecords],
  );
  const historyLoading = recordsLoading || historyRoomsLoading;

  if (isBeta) {
    const activeRecords = mergedRecords.filter((record) => {
      const room = roomsById[record.drawId];
      return !record.cardId && room?.status === "live";
    });
    const completedRecords = mergedRecords.filter(
      (record) => !activeRecords.some((active) => active.id === record.id),
    );

    return (
      <section className="panel beta-history-page">
        <div className="section-heading">
          <ListChecks size={24} />
          <div>

            <h1>我的紀錄</h1>
          </div>
        </div>
        {recordsError && <p className="form-note">{recordsError}</p>}
        {historyLoading ? (
          <InlineLoading label="正在載入我的紀錄..." />
        ) : (
          <>
        <div className="beta-history-section">
          <h2>正在抽卡</h2>
          {activeRecords.length ? (
            <div className="beta-active-record-grid">
              {activeRecords.map((record) => (
                <article className="beta-active-record" key={record.id}>
                  <span className="beta-record-card-image">
                    {record.targetCardImageUrl || record.cardImageUrl ? (
                      <img
                        src={record.targetCardImageUrl || record.cardImageUrl}
                        alt={record.targetCardName || record.cardName || "正在抽卡卡牌"}
                      />
                    ) : (
                      <Package size={24} />
                    )}
                  </span>
                  <span className="pick-number-box">
                    <em>天堂地獄號碼</em>
                    <b>#{record.number}</b>
                  </span>
                  <div>
                    <strong>{record.drawTitle || record.roomSlug || "抽卡房"}</strong>
                    <p>{record.targetCardName || "等待開牌"}</p>
                    <small>{formatRoundLabel(record.round)} · 直播中</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">暫時沒有正在抽卡的紀錄。</p>
          )}
        </div>
        <div className="beta-history-section">
          <h2>已完成</h2>
          {completedRecords.length ? (
            <div className="history-table">
              <div className="history-head">
                <span>房間</span><span>中獎卡牌</span><span>天堂地獄號碼</span><span>售價</span><span>結果</span>
              </div>
              {completedRecords.map((record) => (
                <article className="history-row" key={record.id}>
                  <span>{record.drawTitle || record.roomSlug || record.drawId}</span>
                  <span className="beta-history-card-cell">
                    <span className="beta-record-card-image small">
                      {record.cardImageUrl || record.targetCardImageUrl ? (
                        <img
                          src={record.cardImageUrl || record.targetCardImageUrl}
                          alt={record.cardName || record.targetCardName || "中獎卡牌"}
                        />
                      ) : (
                        <Package size={18} />
                      )}
                    </span>
                    <span><strong>{record.cardName || "未分配卡牌"}</strong><small>所屬盲盒：{record.targetCardName || "未選卡牌"}</small></span>
                  </span>
                  <b>#{record.number}</b>
                  <TokenAmount value={record.cardValue || record.targetCardValue || record.tokenCost} />
                  <span className={`status-badge ${record.cardId ? (record.resultSide === "hell" ? "hell" : "heaven") : "pending"}`}>
                    {record.cardId ? getResultSideLabel(record.resultSide) : "待開牌"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">暫時沒有已完成紀錄。</p>
          )}
        </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <ListChecks size={24} />
        <div>

          <h1>我的紀錄</h1>
        </div>
      </div>
      {recordsError && <p className="form-note">{recordsError}</p>}
      {historyLoading ? (
        <InlineLoading label="正在載入我的紀錄..." />
      ) : mergedRecords.length ? (
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
              <TokenAmount value={record.tokenCost} />
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
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [records, setRecords] = useState([]);
  const [activeStatus, setActiveStatus] = useState("pending");
  const [collectionError, setCollectionError] = useState("");
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [selectedShippingIds, setSelectedShippingIds] = useState([]);
  const [shippingIds, setShippingIds] = useState([]);
  const [shippingForm, setShippingForm] = useState({
    name: "",
    phone: "",
    method: "sf-door",
    address: "",
    note: "",
  });
  const [pickupSearch, setPickupSearch] = useState("");
  const [pickupRegion, setPickupRegion] = useState("all");
  const [pickupDistrict, setPickupDistrict] = useState("all");
  const [selectedPickupCode, setSelectedPickupCode] = useState("");
  const [shippingBusy, setShippingBusy] = useState(false);
  const demoCards = useBetaDemoCards(Boolean(profile.isDemo));

  // Build the second-level district menu from the currently selected territory.
  const pickupDistricts = useMemo(() => (
    [...new Set(
      SF_PICKUP_POINTS
        .filter((point) => pickupRegion === "all" || point.region === pickupRegion)
        .map((point) => point.district),
    )].sort((a, b) => a.localeCompare(b, "zh-HK"))
  ), [pickupRegion]);

  // Filter the bundled official SF Store list locally so the player never leaves the app.
  const pickupResults = useMemo(() => {
    const keyword = pickupSearch.trim().toLocaleLowerCase("zh-HK");
    return SF_PICKUP_POINTS.filter((point) => {
      const matchesRegion = pickupRegion === "all" || point.region === pickupRegion;
      const matchesDistrict = pickupDistrict === "all" || point.district === pickupDistrict;
      const searchableText = `${point.code} ${point.region} ${point.district} ${point.name} ${point.address}`
        .toLocaleLowerCase("zh-HK");
      return matchesRegion && matchesDistrict && (!keyword || searchableText.includes(keyword));
    }).slice(0, 12);
  }, [pickupDistrict, pickupRegion, pickupSearch]);

  useEffect(() => {
    if (profile.isDemo) {
      setRecords(enrichDemoRecords(BETA_DEMO_COLLECTION, demoCards));
      setCollectionError("");
      setCollectionLoading(false);
      return undefined;
    }
    setCollectionLoading(true);
    const recordsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    const stopRecords = onSnapshot(
      recordsQuery,
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        setRecords(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
            .filter((record) => record.cardId && (isBeta || !record.convertedToTokens)),
        );
        setCollectionError("");
        if (isSnapshotReady(snapshot)) setCollectionLoading(false);
      },
      (error) => {
        console.error("Collection listener failed.", error);
        setCollectionError(getSafeErrorMessage(error, "未能載入我的卡牌。"));
        setCollectionLoading(false);
      },
    );

    return stopRecords;
  }, [demoCards, isBeta, profile.isDemo, profile.uid]);

  const visibleRecords = records.filter((record) => {
    if (!isBeta) return (record.collectionStatus || "pending") === activeStatus;
    return getBetaCollectionRecordStatus(record) === activeStatus;
  });
  const totalValue = records.reduce(
    (sum, record) => sum + Number(record.cardValue || record.tokenCost || 0),
    0,
  );
  const totalRefundValue = records.reduce(
    (sum, record) =>
      record.convertedToTokens || (record.collectionStatus || "pending") !== "pending"
        ? sum
        : sum + getCardConversionRefund(record),
    0,
  );

  async function convertCardToTokens(record, { skipConfirm = false } = {}) {
    if (profile.isDemo) {
      alert("Demo Account 只供預覽，不會轉回代幣。");
      return;
    }
    const refund = getCardConversionRefund(record);

    if (!refund || record.convertedToTokens) return;

    if (!skipConfirm) {
      const originalValue = Number(record.cardValue || record.tokenCost || 0);
      const confirmed = window.confirm(
        `將「${record.cardName}」轉回 ${formatTokenNumber(refund)} 代幣？卡牌原值 ⚡ ${formatTokenNumber(originalValue)}。`,
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
        const latestRecord = recordSnap.data();
        if (latestRecord.convertedToTokens || (latestRecord.collectionStatus || "pending") !== "pending"
          || latestRecord.shippingRequested || latestRecord.shippingRequestedAt || latestRecord.shippedAt) {
          throw new Error("只有未申請寄送的待處理卡牌可以轉回代幣。");
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
    if (profile.isDemo) {
      alert("Demo Account 只供預覽，不會轉回代幣。");
      return;
    }
    if (!visibleRecords.length) return;

    const totalRefund = visibleRecords.reduce(
      (sum, record) => sum + getCardConversionRefund(record),
      0,
    );
    const confirmed = window.confirm(
      `將目前 ${visibleRecords.length} 張卡牌按管理員設定價值轉回 ${formatTokenNumber(totalRefund)} 代幣？`,
    );
    if (!confirmed) return;

    for (const record of visibleRecords) {
      // Keep one transaction per card so a single old record cannot block the rest.
      await convertCardToTokens(record, { skipConfirm: true });
    }
  }

  function openShippingRequest(recordIds) {
    const ids = recordIds.filter(Boolean);
    if (!ids.length) {
      alert("請先選擇要配送的卡牌。");
      return;
    }
    setShippingIds(ids);
    setShippingForm({
      name: profile.displayName || profile.username || "",
      phone: profile.phoneNumber || "",
      method: "sf-door",
      address: "",
      note: "",
    });
    setPickupSearch("");
    setPickupRegion("all");
    setPickupDistrict("all");
    setSelectedPickupCode("");
  }

  async function submitShippingRequest(event) {
    event.preventDefault();
    if (!shippingForm.name.trim() || !shippingForm.phone.trim() || !shippingForm.address.trim()) {
      alert("請填寫收件人、電話及完整地址。");
      return;
    }
    if (shippingForm.method === "sf-pickup" && !selectedPickupCode) {
      alert("請從清單選擇順豐自提點。");
      return;
    }
    if (profile.isDemo) {
      alert("Demo Account 只供預覽，不會提交配送資料。");
      setShippingIds([]);
      return;
    }

    setShippingBusy(true);
    try {
      const batch = writeBatch(db);
      shippingIds.forEach((recordId) => {
        batch.update(doc(db, "drawRecords", recordId), {
          collectionStatus: "shipping",
          shippingRequested: true,
          shippingRecipient: shippingForm.name.trim(),
          shippingPhone: shippingForm.phone.trim(),
          shippingMethod: shippingForm.method,
          shippingAddress: shippingForm.address.trim(),
          shippingNote: shippingForm.note.trim(),
          shippingRequestedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setSelectedShippingIds((current) => current.filter((id) => !shippingIds.includes(id)));
      setShippingIds([]);
      setActiveStatus("shipping");
    } catch (error) {
      showSafeError(error);
    } finally {
      setShippingBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <Boxes size={24} />
        <div>

          <h1>我的卡牌</h1>
          <p className="muted">管理員配發的卡牌會分為待處理、配送中、已配送及已轉換代幣。</p>
        </div>
      </div>
      {collectionLoading ? (
        <InlineLoading label="正在載入我的卡牌..." />
      ) : records.length ? (
        <>
        <div className="collection-tabs">
          {(isBeta ? betaCollectionStatuses : collectionStatuses).map((status) => (
            <button
              className={activeStatus === status ? "active" : ""}
              type="button"
              key={status}
              onClick={() => setActiveStatus(status)}
            >
              {isBeta
                ? `${getBetaCollectionStatusLabel(status)} ${records.filter((record) => getBetaCollectionRecordStatus(record) === status).length}`
                : statusLabels[status]}
            </button>
          ))}
        </div>
        {!isBeta && <div className="collection-summary">
          <div>
            <span>卡片總值</span>
            <strong><TokenAmount value={totalValue} /></strong>
          </div>
          <div>
            <span>可轉回代幣</span>
            <strong><TokenAmount value={totalRefundValue} /></strong>
          </div>
          <div>
            <span>此分頁</span>
            <strong>{visibleRecords.length} 張卡</strong>
          </div>
          {activeStatus === "pending" && (
            <>
              <button className="small-btn" type="button" onClick={convertVisibleCards}>
                轉換為點數
              </button>
              {isBeta && (
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => openShippingRequest(selectedShippingIds)}
                  disabled={!selectedShippingIds.length}
                >
                  批次申請配送
                </button>
              )}
            </>
          )}
        </div>}
        {isBeta && activeStatus === "pending" && (
          <div className="beta-collection-actions">
            <button
              className="primary-btn"
              type="button"
              onClick={() => openShippingRequest(selectedShippingIds)}
              disabled={!selectedShippingIds.length}
            >
              批次申請配送
            </button>
          </div>
        )}
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
                  {isBeta ? (
                    <span className="collection-room-meta">
                      {record.drawTitle || record.roomSlug || "抽卡房"} · {formatRoundLabel(record.round)}
                    </span>
                  ) : (
                    <>
                      <span>{record.cardCategory || "其他"}</span>
                      <span>{record.drawTitle} · #{record.number}</span>
                    </>
                  )}
                  <span className={`status-badge ${record.collectionStatus || "pending"}`}>
                    {isBeta
                      ? record.convertedToTokens
                        ? "已轉回代幣"
                        : record.collectionStatus === "shipped"
                          ? "已配送"
                          : getBetaCollectionStatusLabel(record.collectionStatus || "pending")
                      : statusLabels[record.collectionStatus || "pending"]}
                  </span>
                  {isBeta && activeStatus === "pending" && (
                    <label className="collection-select-option">
                      <input
                        type="checkbox"
                        checked={selectedShippingIds.includes(record.id)}
                        onChange={(event) => setSelectedShippingIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, record.id])]
                            : current.filter((id) => id !== record.id),
                        )}
                      />
                      選擇配送
                    </label>
                  )}
                  {!record.convertedToTokens && activeStatus === "pending" && (
                    <button className="small-btn" type="button" onClick={() => convertCardToTokens(record)}>
                      轉回 {formatTokenNumber(getCardConversionRefund(record))} 代幣
                    </button>
                  )}
                  {isBeta && activeStatus === "pending" && (
                    <button className="primary-btn" type="button" onClick={() => openShippingRequest([record.id])}>
                      申請配送
                    </button>
                  )}
                  {record.trackingNumber && (
                    <a
                      className="small-btn collection-tracking-link"
                      href={`https://htm.sf-express.com/hk/tc/dynamic_function/waybill/#search/bill-number/${encodeURIComponent(record.trackingNumber)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`查詢順豐單號 ${record.trackingNumber}`}
                    >
                      <Truck size={16} />
                      <span>順豐單號：{record.trackingNumber}</span>
                      <ExternalLink size={14} />
                    </a>
                  )}
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
      {isBeta && shippingIds.length > 0 && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShippingIds([])}>
          <section className="modal shipping-modal" role="dialog" aria-modal="true" aria-labelledby="shipping-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-btn modal-close" type="button" onClick={() => setShippingIds([])} aria-label="關閉配送申請">
              <X size={18} />
            </button>

            <h2 id="shipping-dialog-title">申請配送</h2>
            <p className="muted">共 {shippingIds.length} 張卡牌，請填寫順豐收件資料。</p>
            <form className="stack-form" onSubmit={submitShippingRequest}>
              <label>收件人姓名<input value={shippingForm.name} onChange={(event) => setShippingForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>聯絡電話<input type="tel" value={shippingForm.phone} onChange={(event) => setShippingForm((current) => ({ ...current, phone: event.target.value }))} required /></label>
              <label>
                配送方式
                <select
                  value={shippingForm.method}
                  onChange={(event) => {
                    setShippingForm((current) => ({ ...current, method: event.target.value, address: "" }));
                    setSelectedPickupCode("");
                  }}
                >
                  <option value="sf-door">順豐上門</option>
                  <option value="sf-pickup">順豐自提點</option>
                </select>
              </label>
              {shippingForm.method === "sf-pickup" && (
                <div className="sf-pickup-finder">
                  <div className="sf-pickup-heading">
                    <div>
                      <strong>選擇順豐站</strong>
                      <small>搜尋地區、街道、大廈或網點編號</small>
                    </div>
                    <span>{SF_PICKUP_POINTS.length} 個網點</span>
                  </div>
                  <div className="sf-pickup-search-row">
                    <select
                      value={pickupRegion}
                      onChange={(event) => {
                        setPickupRegion(event.target.value);
                        setPickupDistrict("all");
                      }}
                      aria-label="篩選順豐站區域"
                    >
                      <option value="all">全港區域</option>
                      <option value="香港島">香港島</option>
                      <option value="九龍">九龍</option>
                      <option value="新界">新界</option>
                    </select>
                    <select value={pickupDistrict} onChange={(event) => setPickupDistrict(event.target.value)} aria-label="篩選順豐站分區">
                      <option value="all">所有分區</option>
                      {pickupDistricts.map((district) => (
                        <option value={district} key={district}>{district}</option>
                      ))}
                    </select>
                    <label className="sf-pickup-search">
                      <Search size={17} aria-hidden="true" />
                      <input
                        type="search"
                        value={pickupSearch}
                        onChange={(event) => setPickupSearch(event.target.value)}
                        placeholder="例如：旺角、海港城、852E"
                        aria-label="搜尋順豐站"
                      />
                    </label>
                  </div>
                  <div className="sf-pickup-results" role="listbox" aria-label="順豐站搜尋結果">
                    {pickupResults.length ? pickupResults.map((point) => (
                      <button
                        className={`sf-pickup-option${selectedPickupCode === point.code ? " selected" : ""}`}
                        type="button"
                        role="option"
                        aria-selected={selectedPickupCode === point.code}
                        key={point.code}
                        onClick={() => {
                          setSelectedPickupCode(point.code);
                          setShippingForm((current) => ({
                            ...current,
                            address: `${point.code}｜${point.name}\n${point.address}`,
                          }));
                        }}
                      >
                        <span className="sf-pickup-code">{point.code}</span>
                        <span className="sf-pickup-details">
                          <strong>{point.name}</strong>
                          <small>{point.address}</small>
                        </span>
                        <Check size={18} aria-hidden="true" />
                      </button>
                    )) : (
                      <p className="sf-pickup-empty">搵唔到相關順豐站，請試另一個地區或關鍵字。</p>
                    )}
                  </div>
                  <p className="sf-pickup-source">順豐香港官方網點資料，更新：{SF_PICKUP_POINTS_UPDATED_AT}</p>
                </div>
              )}
              <label>
                {shippingForm.method === "sf-pickup" ? "已選自提點" : "配送地址"}
                <textarea
                  rows={3}
                  value={shippingForm.address}
                  onChange={(event) => setShippingForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder={shippingForm.method === "sf-pickup" ? "請從上方清單選擇順豐站" : "請輸入完整順豐配送地址"}
                  readOnly={shippingForm.method === "sf-pickup"}
                  required
                />
              </label>
              <label>備註<textarea rows={2} value={shippingForm.note} onChange={(event) => setShippingForm((current) => ({ ...current, note: event.target.value }))} placeholder="選填" /></label>
              <button className="primary-btn" type="submit" disabled={shippingBusy}>
                <Package size={17} />{shippingBusy ? "提交中..." : "確認申請配送"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function AdminPanel({ profile }) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [activeAdminSection, setActiveAdminSection] = useState(isBeta ? "live" : "rooms");
  const [requests, setRequests] = useState([]);
  const [draws, setDraws] = useState([]);
  const [cards, setCards] = useState([]);
  const [records, setRecords] = useState([]);
  const [adminLoading, setAdminLoading] = useState({
    requests: true,
    draws: true,
    cards: true,
    records: true,
  });
  const [pendingShippingCount, setPendingShippingCount] = useState(0);
  const vipTiers = useVipProgram();
  const adminSections = isBeta
    ? [
        { id: "live", label: "直播管理", eyebrow: "Live", icon: Gavel },
        ...ADMIN_SECTIONS.filter((section) => !["rooms", "create-room"].includes(section.id)),
        BETA_PAYMENT_SECTION,
      ]
    : ADMIN_SECTIONS;
  const activeSection =
    adminSections.find((section) => section.id === activeAdminSection) || adminSections[0];
  const ActiveIcon = activeSection.icon;

  useEffect(() => {
    const drawsQuery = query(collection(db, "draws"), orderBy("createdAt", "desc"));
    const stopDraws = onSnapshot(drawsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setDraws(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      if (isSnapshotReady(snapshot)) {
        setAdminLoading((current) => ({ ...current, draws: false }));
      }
    }, (error) => {
      console.error("Admin room listener failed.", error);
      setAdminLoading((current) => ({ ...current, draws: false }));
    });

    const cardsQuery = query(collection(db, "cards"), orderBy("createdAt", "desc"));
    const stopCards = onSnapshot(cardsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setCards(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((card) => !card.archived));
      if (isSnapshotReady(snapshot)) {
        setAdminLoading((current) => ({ ...current, cards: false }));
      }
    }, (error) => {
      console.error("Admin card listener failed.", error);
      setAdminLoading((current) => ({ ...current, cards: false }));
    });

    return () => {
      stopDraws();
      stopCards();
    };
  }, []);

  // Only load the full request history while its admin section is open.
  useEffect(() => {
    if (activeAdminSection !== "requests") return undefined;

    setAdminLoading((current) => ({ ...current, requests: true }));
    const requestsQuery = query(
      collection(db, "tokenRequests"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(requestsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      if (isSnapshotReady(snapshot)) {
        setAdminLoading((current) => ({ ...current, requests: false }));
      }
    }, (error) => {
      console.error("Admin token request listener failed.", error);
      setAdminLoading((current) => ({ ...current, requests: false }));
    });
  }, [activeAdminSection]);

  // Keep the menu badge live with a small filtered query instead of loading every draw record.
  useEffect(() => {
    const pendingShippingQuery = query(
      collection(db, "drawRecords"),
      where("shippingRequested", "==", true),
      where("collectionStatus", "==", "shipping"),
    );
    return onSnapshot(pendingShippingQuery, (snapshot) => {
      setPendingShippingCount(snapshot.size);
    }, (error) => {
      console.error("Admin shipping badge listener failed.", error);
    });
  }, []);

  // Purchase and delivery history is the largest dataset, so defer it until needed.
  useEffect(() => {
    if (activeAdminSection !== "records" && activeAdminSection !== "shipping") return undefined;

    setAdminLoading((current) => ({ ...current, records: true }));
    const recordsQuery = query(collection(db, "drawRecords"), orderBy("createdAt", "desc"));
    return onSnapshot(recordsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      if (isSnapshotReady(snapshot)) {
        setAdminLoading((current) => ({ ...current, records: false }));
      }
    }, (error) => {
      console.error("Admin record listener failed.", error);
      setAdminLoading((current) => ({ ...current, records: false }));
    });
  }, [activeAdminSection]);

  async function approveRequest(request) {
    // Review codes manually; only verified bank payments count towards VIP deposits.
    const isPromo = request.proofMode === "promo";
    if (isPromo && !window.confirm(`確認已人工核實活動碼「${request.promoCode}」的有效性、使用資格及使用紀錄，並批准 ${formatTokenNumber(request.amount)} 代幣？活動碼獎勵不計入 VIP 入金。`)) return;
    const verifiedInput = isPromo ? "0" : window.prompt("請先核對銀行實際入帳及付款證明，再輸入實際收到的港幣金額：");
    if (verifiedInput === null) return;
    const verifiedHkdAmount = Number(verifiedInput);
    if (!Number.isSafeInteger(verifiedHkdAmount) || (!isPromo && verifiedHkdAmount < 500)) {
      alert("請輸入已核實的有效入帳金額。");
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, "tokenRequests", request.id);
        const userRef = doc(db, "users", request.uid);
        const requestSnap = await transaction.get(requestRef);
        const userSnap = await transaction.get(userRef);
        const packagesSnap = await transaction.get(doc(db, "settings", "tokenPackages"));

        if (!requestSnap.exists() || requestSnap.data().status !== "pending") {
          throw new Error("This request has already been reviewed.");
        }
        if (!userSnap.exists()) {
          throw new Error("User profile was not found.");
        }

        const requestData = requestSnap.data();
        if (requestData.proofMode !== request.proofMode || requestData.promoCode !== request.promoCode || requestData.amount !== request.amount) {
          throw new Error("申請資料已變更，請重新審核。");
        }
        const userData = userSnap.data();
        const packageSettings = packagesSnap.exists() ? packagesSnap.data() : null;
        const approvedTokens = getVerifiedTokenGrant(requestData, verifiedHkdAmount, packageSettings);
        const totalDeposits = Number(userData.totalDeposits || 0) + verifiedHkdAmount;
        const previousVipLevel = Number(userData.vipLevel ?? -1);
        const vipState = getVipState(vipTiers, totalDeposits);
        const attainedTiers = isPromo ? [] : vipTiers.filter(
          (tier, index) =>
            index > previousVipLevel &&
            index <= vipState.currentIndex &&
            tier.rewardCardId,
        );

        transaction.update(requestRef, {
          status: "approved",
          verifiedHkdAmount,
          promoReviewed: isPromo,
          reviewedAt: serverTimestamp(),
          reviewedBy: profile.uid,
        });
        transaction.update(userRef, {
          tokens: increment(approvedTokens),
          lastTokenGrantRequestId: request.id,
          totalDeposits,
          vipLevel: isPromo ? previousVipLevel : vipState.currentIndex,
          lastVipRewardTier: attainedTiers.at(-1)?.id || userData.lastVipRewardTier || "",
          updatedAt: serverTimestamp(),
        });

        attainedTiers.forEach((tier) => {
          const rewardCard = cards.find((card) => card.id === tier.rewardCardId);
          const rewardName = rewardCard?.name || tier.rewardName;
          const rewardImageUrl = rewardCard?.imageUrl || tier.rewardImageUrl || "";
          const rewardConversionValue = Number(
            rewardCard?.conversionValue ?? rewardCard?.tokenValue ?? tier.rewardConversionValue ?? 0,
          );
          const rewardRef = doc(db, "drawRecords", `vip_${request.uid}_${tier.id}`);
          transaction.set(rewardRef, {
            source: "vip",
            vipTierId: tier.id,
            uid: request.uid,
            username: requestData.username || userData.username || "VIP member",
            drawId: "vip-program",
            drawTitle: `${tier.name} 升級獎勵`,
            roomSlug: "vip-program",
            roomLink: "",
            round: "vip-reward",
            roundSort: 0,
            number: vipTiers.findIndex((item) => item.id === tier.id) + 1,
            tokenCost: 0,
            targetCardId: tier.rewardCardId,
            targetCardName: rewardName,
            targetCardImageUrl: rewardImageUrl,
            targetCardValue: rewardConversionValue,
            cardId: tier.rewardCardId,
            cardName: rewardName,
            cardCategory: "VIP 獎勵",
            cardImageUrl: rewardImageUrl,
            cardValue: rewardConversionValue,
            cardConversionValue: rewardConversionValue,
            collectionStatus: "pending",
            assignedAt: serverTimestamp(),
            assignedBy: profile.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      });
    } catch (error) {
      showSafeError(error);
    }
  }

  async function rejectRequest(request) {
    const reason = window.prompt("駁回原因（可選）：", "");
    if (reason === null) return;

    try {
      await updateDoc(doc(db, "tokenRequests", request.id), {
        status: "rejected",
        adminNote: reason,
        reviewedAt: serverTimestamp(),
        reviewedBy: profile.uid,
      });
    } catch (error) {
      showSafeError(error, "未能駁回申請，請稍後再試。");
    }
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

            <h2>管理後台</h2>
          </div>
        </div>
        <div className="admin-function-grid">
          {adminSections.map((section) => {
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
                {section.id === "shipping" && pendingShippingCount > 0 && (
                  <b className="admin-notification-badge">{pendingShippingCount}</b>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className="admin-content-heading">
        <ActiveIcon size={24} />
        <div>

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
      {isBeta && activeAdminSection === "payment" && (
        <div className="admin-section narrow-admin-section">
          <PaymentSettingsManager profile={profile} />
        </div>
      )}
      {activeAdminSection === "vip" && (
        <div className="admin-section">
          <VipProgramManager cards={cards} profile={profile} tiers={vipTiers} />
        </div>
      )}
      {activeAdminSection === "requests" && (
        <section className="panel admin-section narrow-admin-section">
          <RequestList
            requests={requests}
            loading={adminLoading.requests}
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
            loading={adminLoading.draws || adminLoading.cards}
            onCompleteDraw={completeDraw}
            onCopyRoomLink={copyRoomLink}
          />
        </section>
      )}
      {isBeta && activeAdminSection === "live" && (
        <section className="admin-section">
          <SingleLiveManagement
            cards={cards}
            draws={draws}
            loading={adminLoading.draws || adminLoading.cards}
            profile={profile}
          />
        </section>
      )}
      {activeAdminSection === "records" && (
        <div className="admin-section">
          {isBeta ? (
            <AdminRoundResultAssignmentPanel
              cards={cards}
              draws={draws}
              records={records}
              profile={profile}
              loading={adminLoading.cards || adminLoading.draws || adminLoading.records}
            />
          ) : (
            <AdminRoomRecordsPanel
              cards={cards}
              records={records}
              profile={profile}
              loading={adminLoading.cards || adminLoading.records}
            />
          )}
        </div>
      )}
      {activeAdminSection === "shipping" && (
        <div className="admin-section">
          <ShippingRequestManager records={records} loading={adminLoading.records} />
        </div>
      )}
    </div>
  );
}

// Assign a complete round in one pass, then require a full-table review before saving.
function AdminRoundResultAssignmentPanel({ cards, draws, records, profile, loading = false }) {
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [draftSides, setDraftSides] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const purchaseRecords = useMemo(
    () => records.filter((record) => record.uid && record.number).sort(compareRoomRoundRecords),
    [records],
  );
  const sessions = useMemo(() => {
    const sessionMap = new Map();
    purchaseRecords.forEach((record) => {
      const drawId = record.drawId || record.roomSlug || "unknown";
      const roundId = record.round || "round-001";
      const key = `${drawId}::${roundId}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          key,
          drawId,
          roundId,
          drawTitle: record.drawTitle || record.roomSlug || drawId,
          sortValue: toMillis(record.createdAt),
        });
      }
    });
    return Array.from(sessionMap.values()).sort((left, right) => right.sortValue - left.sortValue);
  }, [purchaseRecords]);

  useEffect(() => {
    if (!sessions.length) {
      setSelectedSessionKey("");
      return;
    }
    if (!sessions.some((session) => session.key === selectedSessionKey)) {
      setSelectedSessionKey(sessions[0].key);
    }
  }, [selectedSessionKey, sessions]);

  const selectedSession = sessions.find((session) => session.key === selectedSessionKey) || null;
  const selectedDraw = draws.find((draw) => draw.id === selectedSession?.drawId) || null;
  const sessionRecords = useMemo(
    () => purchaseRecords.filter((record) =>
      (record.drawId || record.roomSlug || "unknown") === selectedSession?.drawId
        && (record.round || "round-001") === selectedSession?.roundId,
    ),
    [purchaseRecords, selectedSession?.drawId, selectedSession?.roundId],
  );
  const recordsByNumber = useMemo(
    () => new Map(sessionRecords.map((record) => [Number(record.number), record])),
    [sessionRecords],
  );
  const numberList = useMemo(
    () => Array.from(recordsByNumber.keys())
      .filter(Number.isFinite)
      .sort((left, right) => left - right),
    [recordsByNumber],
  );
  const shareMode = getRoomShareMode(selectedDraw || {}, selectedSession?.roundId);
  const heavenCount = numberList.filter((number) => draftSides[number] === "heaven").length;
  const hellCount = numberList.filter((number) => draftSides[number] === "hell").length;
  const unselectedCount = numberList.length - heavenCount - hellCount;

  useEffect(() => {
    if (!selectedSession) {
      setDraftSides({});
      return;
    }
    const savedSides = selectedDraw?.roundResultSides?.[selectedSession.roundId] || {};
    const recordSides = Object.fromEntries(
      sessionRecords
        .filter((record) => ["heaven", "hell"].includes(record.resultSide))
        .map((record) => [Number(record.number), record.resultSide]),
    );
    setDraftSides({ ...savedSides, ...recordSides });
    setPreviewOpen(false);
  }, [selectedSessionKey, selectedDraw?.roundResultSides, selectedSession, sessionRecords]);

  function chooseSide(number, side) {
    const record = recordsByNumber.get(number);
    if (record?.cardId) return;
    setDraftSides((current) => ({ ...current, [number]: side }));
  }

  function fillUnselectedWithHell() {
    setDraftSides((current) => Object.fromEntries(
      numberList.map((number) => [number, current[number] || "hell"]),
    ));
  }

  function clearUnassignedSides() {
    setDraftSides(Object.fromEntries(
      sessionRecords
        .filter((record) => record.cardId && ["heaven", "hell"].includes(record.resultSide))
        .map((record) => [Number(record.number), record.resultSide]),
    ));
  }

  function resolveRecordResult(record) {
    const resultSide = draftSides[Number(record.number)];
    const heavenCard = cards.find((card) => card.id === record.targetCardId) || null;
    const resultCard = resultSide === "hell"
      ? heavenCard?.hellCardId
        ? cards.find((card) => card.id === heavenCard.hellCardId) || null
        : null
      : heavenCard;
    return { heavenCard, resultCard, resultSide };
  }

  function openFullTablePreview() {
    if (unselectedCount > 0) {
      alert(`尚有 ${unselectedCount} 個號碼未標記天堂或地獄。`);
      return;
    }
    const missingCardRecord = sessionRecords
      .filter((record) => !record.cardId)
      .find((record) => !resolveRecordResult(record).resultCard);
    if (missingCardRecord) {
      alert(`#${missingCardRecord.number} 未設定可派發卡牌，請先到卡牌庫設定天堂卡及地獄對應卡。`);
      return;
    }
    setPreviewOpen(true);
  }

  async function confirmRoundAssignment() {
    if (!selectedSession || saving) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      if (selectedDraw) {
        batch.update(doc(db, "draws", selectedDraw.id), {
          roundResultSides: {
            ...(selectedDraw.roundResultSides || {}),
            [selectedSession.roundId]: Object.fromEntries(
              numberList.map((number) => [String(number), draftSides[number]]),
            ),
          },
          updatedAt: serverTimestamp(),
        });
      }

      sessionRecords.filter((record) => !record.cardId).forEach((record) => {
        const { heavenCard, resultCard, resultSide } = resolveRecordResult(record);
        const cardValue = Number(resultCard.tokenValue || record.targetCardValue || record.tokenCost || 0);
        batch.update(doc(db, "drawRecords", record.id), {
          cardId: resultCard.id,
          cardName: resultCard.name,
          cardCategory: getCardCategory(resultCard),
          cardImageUrl: resultCard.imageUrl || "",
          cardValue,
          cardConversionValue: Number(resultCard.conversionValue ?? resultCard.tokenValue ?? 0),
          resultSide,
          selectedHeavenCardId: heavenCard?.id || "",
          collectionStatus: record.collectionStatus || "pending",
          assignedAt: serverTimestamp(),
          assignedBy: profile.uid,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setPreviewOpen(false);
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="panel wide"><InlineLoading label="正在載入場次購買紀錄..." /></section>;
  }

  return (
    <section className="panel wide batch-result-panel">
      <div className="section-heading compact">
        <ListChecks size={22} />
        <div>
          <h2>按場次分配抽卡結果</h2>
          <p className="muted">一次標記所有已售號碼嘅天堂／地獄結果，預覽完整表格後先正式確認。</p>
        </div>
      </div>
      {sessions.length ? (
        <>
          <div className="batch-result-toolbar">
            <label>
              <span>揀場次</span>
              <select value={selectedSessionKey} onChange={(event) => setSelectedSessionKey(event.target.value)}>
                {sessions.map((session) => (
                  <option key={session.key} value={session.key}>{session.drawTitle} · {formatRoundLabel(session.roundId)}</option>
                ))}
              </select>
            </label>
            <div className="batch-result-counts">
              <span>玩法 {shareMode}</span>
              <span className="heaven">天堂 {heavenCount}</span>
              <span className="hell">地獄 {hellCount}</span>
              <span>未標記 {unselectedCount}</span>
            </div>
            <div className="batch-result-actions">
              <button className="small-btn" type="button" onClick={fillUnselectedWithHell}>未標記全設地獄</button>
              <button className="small-btn" type="button" onClick={clearUnassignedSides}>清除未確認</button>
            </div>
          </div>
          <div className="batch-number-table" aria-label="已售號碼天堂地獄分配表">
            {numberList.map((number) => {
              const record = recordsByNumber.get(number);
              const side = draftSides[number] || "";
              return (
                <article className={`batch-number-result ${side || "unselected"} ${record?.cardId ? "locked" : ""}`} key={number}>
                  <header><strong>#{number}</strong><small>{record.username || "已售"}</small></header>
                  <div>
                    <button className={side === "heaven" ? "active" : ""} type="button" onClick={() => chooseSide(number, "heaven")} disabled={Boolean(record?.cardId)}>天堂</button>
                    <button className={side === "hell" ? "active" : ""} type="button" onClick={() => chooseSide(number, "hell")} disabled={Boolean(record?.cardId)}>地獄</button>
                  </div>
                  {record?.cardId && <em>已派發</em>}
                </article>
              );
            })}
          </div>
          <button className="primary-btn batch-preview-btn" type="button" onClick={openFullTablePreview}>
            預覽完整結果表
          </button>
        </>
      ) : <p className="muted">暫時未有可分配嘅購買場次。</p>}
      {previewOpen && (
        <AdminRoundResultConfirmModal
          drawTitle={selectedSession.drawTitle}
          roundId={selectedSession.roundId}
          numberList={numberList}
          recordsByNumber={recordsByNumber}
          sides={draftSides}
          saving={saving}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={confirmRoundAssignment}
        />
      )}
    </section>
  );
}

function AdminRoundResultConfirmModal({ drawTitle, roundId, numberList, recordsByNumber, sides, saving, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop blind-box-backdrop" role="presentation" onMouseDown={saving ? undefined : onCancel}>
      <section className="modal batch-result-modal" role="dialog" aria-modal="true" aria-labelledby="batch-result-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-btn modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="返回修改"><X size={19} /></button>
        <h2 id="batch-result-title">確認完整結果表</h2>
        <p className="blind-box-copy">{drawTitle} · {formatRoundLabel(roundId)}。下表只顯示已售號碼，確認後會一次過派發。</p>
        <div className="batch-confirm-table">
          {numberList.map((number) => {
            const record = recordsByNumber.get(number);
            const side = sides[number];
            return (
              <div className={side} key={number}>
                <strong>#{number}</strong>
                <span>{side === "heaven" ? "天堂" : "地獄"}</span>
                <small>{record.username || "已售"}</small>
              </div>
            );
          })}
        </div>
        <div className="blind-box-actions">
          <button className="small-btn" type="button" onClick={onCancel} disabled={saving}>返回修改</button>
          <button className="primary-btn" type="button" onClick={onConfirm} disabled={saving}>{saving ? "派發中..." : "確認並一次過派發"}</button>
        </div>
      </section>
    </div>
  );
}

function ShippingRequestManager({ records, loading = false }) {
  const [trackingNumbers, setTrackingNumbers] = useState({});
  const [savingId, setSavingId] = useState("");
  const [shippingView, setShippingView] = useState("pending");
  const [auditUser, setAuditUser] = useState(null);
  const pendingRequests = records
    .filter((record) => record.shippingRequested && record.collectionStatus === "shipping")
    .sort((a, b) => toMillis(b.shippingRequestedAt) - toMillis(a.shippingRequestedAt));
  const shippedRequests = records
    .filter((record) => record.collectionStatus === "shipped" && (record.shippingRequested || record.trackingNumber))
    .sort((a, b) => toMillis(b.shippedAt || b.updatedAt) - toMillis(a.shippedAt || a.updatedAt));
  const visibleRequests = shippingView === "shipped" ? shippedRequests : pendingRequests;

  async function markShipped(record) {
    const trackingNumber = String(trackingNumbers[record.id] || record.trackingNumber || "").trim();
    if (!trackingNumber) {
      alert("請先輸入順豐運單號碼。");
      return;
    }
    setSavingId(record.id);
    try {
      await updateDoc(doc(db, "drawRecords", record.id), {
        collectionStatus: "shipped",
        trackingNumber,
        shippedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="panel shipping-admin-panel">
      <div className="section-heading compact">
        <Bell size={22} />
        <div>

          <h2>{shippingView === "shipped" ? "已配送紀錄" : "待處理配送需求"}</h2>
          <p className="muted">處理完成後會永久保留在「已配送紀錄」。</p>
        </div>
        <strong className="shipping-request-count">{pendingRequests.length} 個待處理</strong>
      </div>
      <div className="collection-tabs admin-status-tabs shipping-status-tabs">
        <button
          className={shippingView === "pending" ? "active" : ""}
          type="button"
          onClick={() => setShippingView("pending")}
        >
          待處理 {pendingRequests.length}
        </button>
        <button
          className={shippingView === "shipped" ? "active" : ""}
          type="button"
          onClick={() => setShippingView("shipped")}
        >
          已配送紀錄 {shippedRequests.length}
        </button>
      </div>
      {loading ? (
        <InlineLoading label="正在載入配送需求..." />
      ) : visibleRequests.length ? (
        <div className="shipping-request-list">
          <div className="shipping-list-header" aria-hidden="true">
            <span>卡牌／房間</span>
            <span>收件人</span>
            <span>配送資料</span>
            <span>時間</span>
            <span>順豐單號／操作</span>
          </div>
          {visibleRequests.map((record) => (
            <article className="shipping-request-card" key={record.id}>
              <div className="shipping-card-summary">
                <strong>{record.cardName || "未命名卡牌"}</strong>
                <span>{record.drawTitle || record.roomSlug || "抽卡房"} · {formatRoundLabel(record.round)}</span>
                <button
                  className="shipping-user-link"
                  type="button"
                  onClick={() => setAuditUser({ uid: record.uid, username: record.username })}
                >
                  <UserRoundPlus size={13} />{record.username || "未命名玩家"} · #{record.number || "--"}
                </button>
              </div>
              <dl className="shipping-recipient-details">
                <div><dt>收件人</dt><dd>{record.shippingRecipient || "--"}</dd></div>
                <div><dt>電話</dt><dd>{record.shippingPhone || "--"}</dd></div>
              </dl>
              <dl className="shipping-address-details">
                <div><dt>配送方式</dt><dd>{record.shippingMethod === "sf-pickup" ? "順豐自提點" : "順豐上門"}</dd></div>
                <div className="shipping-address-row"><dt>地址</dt><dd>{record.shippingAddress || "--"}</dd></div>
                {record.shippingNote && <div className="shipping-address-row"><dt>備註</dt><dd>{record.shippingNote}</dd></div>}
              </dl>
              <dl className="shipping-time-details">
                <div><dt>申請時間</dt><dd>{formatDate(record.shippingRequestedAt)}</dd></div>
                {record.collectionStatus === "shipped" && (
                  <div><dt>完成配送</dt><dd>{formatDate(record.shippedAt || record.updatedAt)}</dd></div>
                )}
              </dl>
              {record.collectionStatus === "shipped" ? (
                <div className="shipping-completed-details">
                  <span className="status-badge shipped">已配送</span>
                  <small>順豐單號</small>
                  {record.trackingNumber ? (
                    <a
                      className="small-btn"
                      href={`https://htm.sf-express.com/hk/tc/dynamic_function/waybill/#search/bill-number/${encodeURIComponent(record.trackingNumber)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Truck size={16} />{record.trackingNumber}<ExternalLink size={14} />
                    </a>
                  ) : <strong>--</strong>}
                </div>
              ) : (
                <div className="shipping-request-actions">
                  <input
                    value={trackingNumbers[record.id] ?? record.trackingNumber ?? ""}
                    onChange={(event) => setTrackingNumbers((current) => ({
                      ...current,
                      [record.id]: event.target.value,
                    }))}
                    placeholder="順豐運單號碼"
                  />
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => markShipped(record)}
                    disabled={savingId === record.id}
                  >
                    <Truck size={17} />{savingId === record.id ? "處理中..." : "標記已配送"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact-empty">
          {shippingView === "shipped" ? "暫時未有已配送紀錄。" : "暫時未有待處理配送需求。"}
        </p>
      )}
      {auditUser && (
        <UserRecordAuditModal
          records={records}
          user={auditUser}
          onClose={() => setAuditUser(null)}
        />
      )}
    </section>
  );
}

function UserRecordAuditModal({ records, user, onClose }) {
  const [slotChecks, setSlotChecks] = useState({});
  const [checking, setChecking] = useState(true);
  const [accountSummary, setAccountSummary] = useState(null);
  const [depositRecords, setDepositRecords] = useState([]);
  const [selectedProof, setSelectedProof] = useState(null);
  const userRecords = useMemo(
    () => records
      .filter((record) => record.uid === user.uid)
      .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt)),
    [records, user.uid],
  );
  const totalSpend = userRecords.reduce((sum, record) => sum + Number(record.tokenCost || 0), 0);
  const assignedCount = userRecords.filter((record) => record.cardId).length;
  const shippingCount = userRecords.filter((record) => record.shippingRequested).length;
  const totalPayout = userRecords
    .filter((record) => record.cardId)
    .reduce(
      (sum, record) => sum + Number(record.cardConversionValue ?? getCardConversionRefund(record) ?? 0),
      0,
    );
  const grossProfit = totalSpend - totalPayout;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(query(collection(db, "tokenRequests"), where("uid", "==", user.uid))),
    ])
      .then(([profileSnapshot, requestSnapshot]) => {
        const profileData = profileSnapshot.exists() ? profileSnapshot.data() : {};
        const approvedDeposit = requestSnapshot.docs
          .map((item) => item.data())
          .filter((request) => request.status === "approved" && request.proofMode !== "promo")
          .reduce((sum, request) => sum + Number(request.verifiedHkdAmount ?? request.hkdAmount ?? 0), 0);
        if (!cancelled) {
          setDepositRecords(
            requestSnapshot.docs
              .map((item) => ({ id: item.id, ...item.data() }))
              .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt)),
          );
          setAccountSummary({
            ...profileData,
            totalDeposits: Math.max(Number(profileData.totalDeposits || 0), approvedDeposit),
          });
        }
      })
      .catch((error) => {
        console.error("Admin user account summary failed.", error);
        if (!cancelled) setAccountSummary({});
      });
    return () => { cancelled = true; };
  }, [user.uid]);

  useEffect(() => {
    let cancelled = false;

    async function checkSlots() {
      setChecking(true);
      const checkedEntries = await Promise.all(userRecords.map(async (record) => {
        if (!record.drawId || !record.slotId || !record.round) {
          return [record.id, record.number
            ? { status: "warning", message: "購買紀錄缺少房間、場次或號碼 ID" }
            : { status: "system", message: "系統贈送紀錄，無購買號碼" }];
        }

        try {
          let slotSnapshot = await getDoc(doc(
            db,
            "draws",
            record.drawId,
            "rounds",
            record.round,
            "slots",
            String(record.slotId),
          ));
          if (!slotSnapshot.exists()) {
            slotSnapshot = await getDoc(doc(db, "draws", record.drawId, "slots", String(record.slotId)));
          }
          if (!slotSnapshot.exists()) {
            return [record.id, { status: "warning", message: "搵唔到對應房間號碼紀錄" }];
          }

          const slot = slotSnapshot.data();
          const mismatches = [];
          if (slot.purchaseRecordId !== record.id) mismatches.push("紀錄 ID");
          if (slot.uid !== record.uid) mismatches.push("玩家 UID");
          if (slot.username !== record.username) mismatches.push("玩家名稱");
          if (Number(slot.number) !== Number(record.number)) mismatches.push("號碼");
          if (Number(slot.tokenCost) !== Number(record.tokenCost)) mismatches.push("付款代幣");
          if (slot.targetCardId !== record.targetCardId) mismatches.push("所屬盲盒卡牌");
          if (Number(slot.targetCardValue) !== Number(record.targetCardValue)) mismatches.push("目標卡價值");
          if (slot.round && slot.round !== record.round) mismatches.push("場次");

          return mismatches.length
            ? [record.id, { status: "warning", message: `${mismatches.join("、")}與房間紀錄不一致` }]
            : [record.id, { status: "ok", message: "與房間號碼及付款紀錄一致" }];
        } catch (error) {
          console.error("Admin user record audit failed.", error);
          return [record.id, { status: "error", message: "暫時無法完成核對，請重試" }];
        }
      }));

      if (!cancelled) {
        setSlotChecks(Object.fromEntries(checkedEntries));
        setChecking(false);
      }
    }

    checkSlots();
    return () => { cancelled = true; };
  }, [userRecords]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal user-audit-modal" role="dialog" aria-modal="true" aria-labelledby="user-audit-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-btn modal-close" type="button" onClick={onClose} aria-label="關閉玩家紀錄"><X size={19} /></button>

        <h2 id="user-audit-title">{user.username || "未命名玩家"} 全部紀錄</h2>
        <p className="user-audit-uid">UID：{user.uid || "--"}</p>
        <div className="user-audit-summary">
          <span><small>累計入金</small><strong>{accountSummary ? `HK$${formatTokenNumber(accountSummary.totalDeposits || 0)}` : "載入中..."}</strong></span>
          <span><small>抽卡投入</small><strong><TokenAmount value={totalSpend} /></strong></span>
          <span><small>派彩／攞出</small><strong><TokenAmount value={totalPayout} /></strong></span>
          <span className={grossProfit >= 0 ? "user-profit" : "user-loss"}>
            <small>平台毛利</small>
            <strong>{grossProfit >= 0 ? "賺 " : "蝕 "}<TokenAmount value={Math.abs(grossProfit)} /></strong>
          </span>
          <span><small>現有代幣</small><strong>{accountSummary ? <TokenAmount value={roundTokenBalance(accountSummary.tokens)} /> : "載入中..."}</strong></span>
          <span><small>紀錄／派卡／配送</small><strong>{userRecords.length}／{assignedCount}／{shippingCount}</strong></span>
        </div>
        <p className="user-audit-note">毛利按「抽卡投入代幣 − 已派卡兌換價值」計算；累計入金以港幣獨立顯示。系統亦會將每筆紀錄與原本房間號碼資料核對。</p>
        <section className="user-audit-section">
          <div className="user-audit-section-title">
            <h3>入金紀錄</h3>
            <strong>{depositRecords.length} 筆</strong>
          </div>
          {accountSummary && depositRecords.length ? (
            <div className="deposit-audit-list">
              <div className="deposit-audit-header" aria-hidden="true">
                <span>日期／紀錄</span>
                <span>方式</span>
                <span>申請入金</span>
                <span>獲批代幣</span>
                <span>狀態</span>
                <span>審核資料</span>
              </div>
              {depositRecords.map((request) => (
                <article className="deposit-audit-row" key={request.id}>
                  <div><strong>{formatDate(request.createdAt)}</strong><span>ID：{request.id}</span></div>
                  <div>
                    <strong>{request.proofMode === "promo" ? "活動碼" : "FPS／銀行"}</strong>
                    {request.proofMode === "promo" ? (
                      <span>{request.promoCode || "--"}</span>
                    ) : request.proofUrl ? (
                      <button className="proof-preview-button" type="button" onClick={() => setSelectedProof(request)}>
                        <FileImage size={14} />查看付款證明
                      </button>
                    ) : (
                      <span>{request.fpsIdentifier || "未有付款證明"}</span>
                    )}
                  </div>
                  <div><strong>{request.proofMode === "promo" ? "非現金" : `HK$${formatTokenNumber(request.hkdAmount || 0)}`}</strong><span>{request.status === "approved" && request.proofMode !== "promo" ? `核實 HK$${formatTokenNumber(request.verifiedHkdAmount ?? request.hkdAmount ?? 0)}` : "--"}</span></div>
                  <div><strong><TokenAmount value={request.amount || 0} /></strong><span>{request.packageType === "custom" ? "自訂金額" : "套餐"}</span></div>
                  <div><span className={`status-badge ${request.status || "pending"}`}>{statusLabels[request.status] || request.status || "待審核"}</span></div>
                  <div><strong>{request.reviewedBy ? "已由管理員審核" : "等待審核"}</strong><span>{request.reviewedAt ? formatDate(request.reviewedAt) : request.adminNote || "--"}</span></div>
                </article>
              ))}
            </div>
          ) : accountSummary ? (
            <p className="empty-state compact-empty">未有入金申請紀錄。</p>
          ) : (
            <InlineLoading label="正在載入入金紀錄..." />
          )}
        </section>
        <section className="user-audit-section">
          <div className="user-audit-section-title">
            <h3>抽卡及派彩紀錄</h3>
            <strong>{userRecords.length} 筆</strong>
          </div>
        {userRecords.length ? (
          <div className="user-audit-list">
            <div className="user-audit-list-header" aria-hidden="true">
              <span>日期／紀錄</span>
              <span>房間／選擇</span>
              <span>投入</span>
              <span>派彩</span>
              <span>實際結果</span>
              <span>資料核對</span>
            </div>
            {userRecords.map((record) => {
              const check = slotChecks[record.id];
              const payout = record.cardId
                ? Number(record.cardConversionValue ?? getCardConversionRefund(record) ?? 0)
                : 0;
              return (
                <article className="user-audit-record" key={record.id}>
                  <div className="user-audit-cell user-audit-date">
                    <strong>{formatDate(record.createdAt)}</strong>
                    <span>ID：{record.id}</span>
                  </div>
                  <div className="user-audit-cell user-audit-room">
                    <strong>{record.drawTitle || record.roomSlug || "系統紀錄"}</strong>
                    <span>{formatRoundLabel(record.round)} · #{record.number || "--"}</span>
                    <span>想抽：{record.targetCardName || "--"}</span>
                  </div>
                  <div className="user-audit-cell user-audit-money">
                    <strong><TokenAmount value={record.tokenCost || 0} /></strong>
                  </div>
                  <div className="user-audit-cell user-audit-money">
                    <strong><TokenAmount value={payout} /></strong>
                  </div>
                  <div className="user-audit-cell user-audit-outcome">
                    <strong>{record.cardName || "尚未派卡"}</strong>
                    <span>{record.cardId ? `兌換價值 ${formatTokenNumber(payout)}` : "等待開卡結果"}</span>
                    {record.shippingRequested && <span>配送：{getBetaCollectionStatusLabel(record.collectionStatus)}</span>}
                  </div>
                  <div className={`user-audit-result ${check?.status || "checking"}`}>
                    {checking && !check ? <RefreshCcw className="spin" size={15} /> : check?.status === "ok" ? <Check size={15} /> : <Bell size={15} />}
                    <span>{check?.message || "正在核對房間紀錄..."}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <p className="empty-state compact-empty">搵唔到呢位玩家嘅紀錄。</p>}
        </section>
        {selectedProof && (
          <div className="proof-preview-backdrop" role="presentation" onMouseDown={() => setSelectedProof(null)}>
            <section className="proof-preview-modal" role="dialog" aria-modal="true" aria-labelledby="proof-preview-title" onMouseDown={(event) => event.stopPropagation()}>
              <button className="icon-btn modal-close" type="button" onClick={() => setSelectedProof(null)} aria-label="關閉付款證明"><X size={19} /></button>

              <h3 id="proof-preview-title">付款證明</h3>
              <p>{formatDate(selectedProof.createdAt)} · HK${formatTokenNumber(selectedProof.hkdAmount || 0)}</p>
              <img src={selectedProof.proofUrl} alt={`${user.username || "玩家"} 的付款證明`} />
              <a className="small-btn" href={selectedProof.proofUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />另開原圖
              </a>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

// Beta uses one permanent live hall; older draw documents stay untouched as historical records.
function SingleLiveManagement({ cards, draws, loading = false, profile }) {
  const live = draws.find((draw) => draw.status === "live")
    || draws.find((draw) => draw.status === "draft")
    || draws[0]
    || null;
  const archivedLives = draws.filter((draw) => draw.id !== live?.id && draw.status === "completed");
  const [title, setTitle] = useState(live?.title || "LiveDraw 直播抽卡大廳");
  const [kickUrl, setKickUrl] = useState(live?.kickUrl || "");
  const [status, setStatus] = useState(live?.status || "draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(live?.title || "LiveDraw 直播抽卡大廳");
    setKickUrl(live?.kickUrl || "");
    setStatus(live?.status || "draft");
  }, [live?.id, live?.kickUrl, live?.status, live?.title]);

  if (loading) return <InlineLoading label="正在載入直播設定..." />;

  if (!live) {
    return (
      <div className="single-live-admin">
        <div className="single-live-note">
          <strong>尚未建立直播</strong>
          <span>只需建立一次；之後所有日期、場次和賽果都在同一個直播內管理。</span>
        </div>
        <CreateDrawForm profile={profile} cards={cards} />
      </div>
    );
  }

  const currentRoundId = toRoundId(getRoomCurrentRound(live));
  const buyingBlocked = isRoundBuyingBlocked(live, currentRoundId);
  const detailsChanged =
    title.trim() !== String(live.title || "") ||
    getKickChannel(kickUrl) !== String(live.kickUrl || "") ||
    status !== String(live.status || "draft");

  async function saveLiveDetails() {
    const cleanTitle = title.trim();
    const cleanKickChannel = getKickChannel(kickUrl);
    if (!cleanTitle) {
      alert("請輸入直播名稱。");
      return;
    }
    if (!cleanKickChannel) {
      alert("請輸入有效的 Kick 頻道名稱。");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "draws", live.id), {
        title: cleanTitle,
        kickUrl: cleanKickChannel,
        status,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  async function toggleBuying() {
    const nextBlockedRounds = buyingBlocked
      ? (live.buyingBlockedRounds || []).filter((roundId) => roundId !== currentRoundId)
      : [...new Set([...(live.buyingBlockedRounds || []), currentRoundId])];
    const action = buyingBlocked ? "重新開放" : "停止";
    if (!window.confirm(`確認${action}${formatRoundLabel(currentRoundId)}購買？`)) return;

    try {
      await updateDoc(doc(db, "draws", live.id), {
        buyingBlockedRounds: nextBlockedRounds,
        buyingBlockedRound: buyingBlocked ? "" : currentRoundId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    }
  }

  return (
    <div className="single-live-admin">
      <section className="panel single-live-settings">
        <div className="section-heading compact">
          <Gavel size={22} />
          <div>
            <h2>唯一直播大廳</h2>
            <p className="muted">所有直播日期、場次、號碼及賽果都使用同一個直播。</p>
          </div>
        </div>
        <div className="single-live-form">
          <label>
            直播名稱
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Kick 頻道名稱
            <input value={kickUrl} onChange={(event) => setKickUrl(event.target.value)} placeholder="例如 livedrawtcg" />
          </label>
          <label>
            直播狀態
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">未開播</option>
              <option value="live">直播中</option>
              <option value="completed">已暫停</option>
            </select>
          </label>
          <button className="primary-btn" type="button" onClick={saveLiveDetails} disabled={saving || !detailsChanged}>
            <Save size={16} />{saving ? "儲存中..." : "儲存直播設定"}
          </button>
          <button className={buyingBlocked ? "small-btn" : "small-btn danger"} type="button" onClick={toggleBuying}>
            <Lock size={15} />{buyingBlocked ? "重開本場購買" : "停止本場購買"}
          </button>
        </div>
      </section>
      <section className="panel single-live-section">
        <div className="section-heading compact"><Clock3 size={22} /><div><h2>直播日期、場次與賽果</h2></div></div>
        <RoomRoundSettings draw={live} />
      </section>
      <section className="panel single-live-section">
        <div className="section-heading compact"><Boxes size={22} /><div><h2>直播卡池</h2></div></div>
        <RoomPoolEditor draw={live} cards={cards} singleLive />
      </section>
      <NewLiveSessionForm cards={cards} currentLive={live} draws={draws} profile={profile} />
      {archivedLives.length > 0 && (
        <section className="panel single-live-section admin-live-archive">
          <div className="section-heading compact">
            <ListChecks size={22} />
            <div><h2>已封存直播</h2><p className="muted">舊直播資料只可查看，不會被新直播覆蓋。</p></div>
          </div>
          <div className="admin-live-archive-list">
            {archivedLives.map((draw) => (
              <article key={draw.id}>
                <div><strong>{draw.title || "過往直播"}</strong><span>{getRoomRoundCount(draw)} 場 · {formatDate(draw.archivedAt || draw.updatedAt || draw.createdAt)}</span></div>
                <a className="small-btn" href={makeRoomLink(draw.id)} target="_blank" rel="noreferrer">前台查看</a>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Atomically archives active sessions and creates a clean live session with fresh round slots.
function NewLiveSessionForm({ cards, currentLive, draws, profile }) {
  const now = new Date();
  const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [title, setTitle] = useState(`${new Intl.DateTimeFormat("zh-HK", { month: "2-digit", day: "2-digit" }).format(now)} LiveDraw 直播`);
  const [kickUrl, setKickUrl] = useState(currentLive?.kickUrl || "");
  const [firstRoundAt, setFirstRoundAt] = useState(localDateTime);
  const [totalRounds, setTotalRounds] = useState("6");
  const [cardCount, setCardCount] = useState(String(currentLive?.cardCount || 20));
  const [shareMode, setShareMode] = useState("1/2");
  const [copyPool, setCopyPool] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setKickUrl(currentLive?.kickUrl || "");
    setCardCount(String(currentLive?.cardCount || 20));
  }, [currentLive?.cardCount, currentLive?.id, currentLive?.kickUrl]);

  async function createNewLive(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanKickChannel = getKickChannel(kickUrl);
    const cleanTotalRounds = Math.max(1, Math.min(100, Math.round(Number(totalRounds) || 1)));
    const cleanCardCount = Math.max(4, Math.min(100, Math.round(Number(cardCount) || 20)));
    const firstRoundDate = new Date(firstRoundAt);
    if (!cleanTitle || !cleanKickChannel || Number.isNaN(firstRoundDate.getTime())) {
      alert("請輸入直播名稱、有效 Kick 頻道及首場時間。");
      return;
    }
    if (!window.confirm("確認封存現有直播並開啟全新直播？舊直播紀錄會保留，新的場次及號碼會由空白開始。")) return;

    setCreating(true);
    try {
      const newDrawRef = doc(collection(db, "draws"));
      const batch = writeBatch(db);
      const archivedDraws = draws.filter((draw) => ["live", "draft"].includes(draw.status));
      const sourcePoolCards = copyPool ? normalizeRoomCards(currentLive?.poolCards) : [];
      const poolCards = sourcePoolCards.length
        ? sourcePoolCards
        : copyPool
          ? cards.filter((card) => (currentLive?.poolCardIds || []).includes(card.id)).map(roomCardPayload)
          : [];
      const roundSchedules = Object.fromEntries(
        rangeNumbers(1, cleanTotalRounds).map((roundNumber) => [
          toRoundId(roundNumber),
          new Date(firstRoundDate.getTime() + (roundNumber - 1) * 40 * 60 * 1000).toISOString(),
        ]),
      );
      const roundShareModes = Object.fromEntries(
        rangeNumbers(1, cleanTotalRounds).map((roundNumber) => [toRoundId(roundNumber), shareMode]),
      );

      archivedDraws.forEach((draw) => {
        batch.update(doc(db, "draws", draw.id), {
          status: "completed",
          archivedAt: serverTimestamp(),
          archivedBy: profile.uid,
          updatedAt: serverTimestamp(),
        });
      });
      batch.set(newDrawRef, {
        title: cleanTitle,
        slug: normalizeSlug(`${cleanTitle}-${Date.now()}`),
        kickUrl: cleanKickChannel,
        cardCount: cleanCardCount,
        tokenCost: Number(currentLive?.tokenCost || 10),
        totalRounds: cleanTotalRounds,
        currentRound: 1,
        round: toRoundId(1),
        status: "live",
        shareMode,
        roundShareModes,
        roundSchedules,
        roundResultImages: {},
        buyingBlockedRounds: [],
        buyingBlockedRound: "",
        poolText: copyPool ? String(currentLive?.poolText || "") : "",
        poolCards,
        poolCardIds: poolCards.map((card) => card.id).filter(Boolean),
        poolCardValues: Object.fromEntries(poolCards.filter((card) => card.id).map((card) => [card.id, Number(card.tokenValue || 0)])),
        thumbnailUrl: "",
        roomLink: makeRoomLink(newDrawRef.id),
        previousLiveId: currentLive?.id || "",
        chatStartedAt: serverTimestamp(),
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await ensureRoomRoundSlots(newDrawRef.id, rangeNumbers(1, cleanTotalRounds), cleanCardCount);
      alert("新直播已建立；舊直播已安全封存。新場次、號碼及聊天室均由空白開始。");
    } catch (error) {
      showSafeError(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel single-live-section new-live-session">
      <div className="section-heading compact">
        <Plus size={22} />
        <div><h2>開新直播</h2><p className="muted">現有直播會封存；玩家紀錄、場次、號碼及賽果全部保留。</p></div>
      </div>
      <form className="new-live-session-form" onSubmit={createNewLive}>
        <label>新直播名稱<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Kick 頻道<input value={kickUrl} onChange={(event) => setKickUrl(event.target.value)} required /></label>
        <label>首場時間<input type="datetime-local" value={firstRoundAt} onChange={(event) => setFirstRoundAt(event.target.value)} required /></label>
        <label>總場數<input type="number" min="1" max="100" value={totalRounds} onChange={(event) => setTotalRounds(event.target.value)} required /></label>
        <label>每場號碼<input type="number" min="4" max="100" value={cardCount} onChange={(event) => setCardCount(event.target.value)} required /></label>
        <label>預設機率<select value={shareMode} onChange={(event) => setShareMode(event.target.value)}><option value="1/2">1/2 二份之一</option><option value="1/5">1/5 五份之一</option><option value="1/10">1/10 十分之一</option></select></label>
        <label className="new-live-copy-pool"><input type="checkbox" checked={copyPool} onChange={(event) => setCopyPool(event.target.checked)} />沿用現有直播卡池</label>
        <button className="primary-btn" type="submit" disabled={creating}><Plus size={17} />{creating ? "建立中..." : "封存舊直播並開新直播"}</button>
      </form>
    </section>
  );
}

function RoomManagementList({ cards, draws, loading = false, onCompleteDraw, onCopyRoomLink }) {
  if (loading) {
    return <InlineLoading label="正在載入房間管理..." />;
  }

  if (!draws.length) {
    return <p className="muted">暫時未有房間。</p>;
  }

  async function updateRoomStatus(draw, status) {
    try {
      await updateDoc(doc(db, "draws", draw.id), { status, updatedAt: serverTimestamp() });
    } catch (error) {
      showSafeError(error);
    }
  }

  async function toggleCurrentRoundBuying(draw) {
    const currentRoundId = toRoundId(getRoomCurrentRound(draw));
    const blocked = isRoundBuyingBlocked(draw, currentRoundId);
    const nextBlockedRounds = blocked
      ? (draw.buyingBlockedRounds || []).filter((roundId) => roundId !== currentRoundId)
      : [...new Set([...(draw.buyingBlockedRounds || []), currentRoundId])];
    const confirmText = blocked
      ? `確認重新開放 ${draw.title} ${formatRoundLabel(currentRoundId)} 購買？`
      : `確認停止 ${draw.title} ${formatRoundLabel(currentRoundId)} 購買？玩家將不能再買新號碼。`;

    if (!window.confirm(confirmText)) return;

    try {
      await updateDoc(doc(db, "draws", draw.id), {
        buyingBlockedRounds: nextBlockedRounds,
        buyingBlockedRound: !blocked ? currentRoundId : "",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    }
  }

  return (
    <div className="room-manage-list">
      {draws.map((draw) => {
        const currentRoundId = toRoundId(getRoomCurrentRound(draw));
        const buyingBlocked = isRoundBuyingBlocked(draw, currentRoundId);

        return (
        <article className="room-manage-card" key={draw.id}>
          <div className="room-manage-summary">
            <div className="room-manage-main">
              <RoomThumbnail draw={draw} />
              <div className="room-manage-info">
                <div className="room-manage-title-row">
                  <strong>{draw.title}</strong>
                  <span className={`status-badge ${draw.status}`}>{statusLabels[draw.status] || draw.status}</span>
                  {buyingBlocked && <span className="status-badge rejected">{ROUND_BUY_LOCKED_LABEL}</span>}
                </div>
                <div className="room-manage-stats">
                  <span><b>{draw.cardCount}</b> 張卡</span>
                  <span><b>{getRoomRoundCount(draw)}</b> 場</span>
                  <span>目前 <b>{formatRoundLabel(toRoundId(getRoomCurrentRound(draw)))}</b></span>
                  <span><b>{getRoomShareMode(draw)}</b> 玩法</span>
                </div>
                <span className="room-link-text">{makeRoomLink(draw.id)}</span>
              </div>
            </div>
            <div className="record-actions">
              <label className="room-status-control">
                <span>房間狀態</span>
                <select value={draw.status || "draft"} onChange={(event) => updateRoomStatus(draw, event.target.value)}>
                  <option value="draft">即將開</option>
                  <option value="live">直播中</option>
                  <option value="completed">已結束</option>
                </select>
              </label>
              <button className="small-btn" type="button" onClick={() => onCopyRoomLink(draw)}>
                <Copy size={15} />
                複製連結
              </button>
              {draw.status === "live" && (
                <button
                  className={buyingBlocked ? "small-btn" : "small-btn danger"}
                  type="button"
                  onClick={() => toggleCurrentRoundBuying(draw)}
                >
                  <Lock size={15} />
                  {buyingBlocked ? "重開本場購買" : "停止本場購買"}
                </button>
              )}
              <button className="small-btn danger room-delete-btn" type="button" onClick={() => onCompleteDraw(draw)}>
                <X size={15} />
                刪除房間
              </button>
            </div>
          </div>
          <div className="room-manage-sections">
            <details className="room-config-section">
              <summary><span><Clock3 size={17} />場次與賽果</span><small>{getRoomRoundCount(draw)} 場 · 目前 {formatRoundLabel(currentRoundId)}</small></summary>
              <RoomRoundSettings draw={draw} />
            </details>
            <details className="room-config-section">
              <summary><span><Boxes size={17} />房間卡池</span><small>{getRoomPoolIds(draw).length} 張卡牌</small></summary>
              <RoomPoolEditor draw={draw} cards={cards} />
            </details>
          </div>
        </article>
      );
      })}
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
        rateVersion: TOKEN_PACKAGE_RATE_VERSION,
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

function PaymentSettingsManager({ profile }) {
  const savedSettings = usePaymentSettings();
  const [form, setForm] = useState(savedSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(savedSettings);
  }, [savedSettings]);

  async function savePaymentSettings(event) {
    event.preventDefault();
    if (!form.fpsIdentifier.trim() || !form.fpsName.trim()) {
      alert("請輸入平台 FPS 識別碼及收款人姓名。");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, "settings", "payment"), {
        fpsIdentifier: form.fpsIdentifier.trim(),
        fpsName: form.fpsName.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      setSaved(true);
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-heading compact">
        <Copy size={22} />
        <div><h2>平台 FPS 收款資料</h2></div>
      </div>
      <p className="form-note">
        {savedSettings.isDummy
          ? "目前使用測試收款資料。儲存以下設定後，Beta 申請代幣頁會即時改用正式資料。"
          : "目前使用已儲存的收款資料；更新後會即時同步到 Beta 申請代幣頁。"}
      </p>
      <form className="stack-form" onSubmit={savePaymentSettings}>
        <label>FPS 識別碼<input value={form.fpsIdentifier} onChange={(event) => { setSaved(false); setForm((current) => ({ ...current, fpsIdentifier: event.target.value })); }} placeholder="例如：1234567" required /></label>
        <label>收款人姓名<input value={form.fpsName} onChange={(event) => { setSaved(false); setForm((current) => ({ ...current, fpsName: event.target.value })); }} placeholder="請輸入收款帳戶姓名" required /></label>
        <button className="primary-btn" type="submit" disabled={saving}><Save size={17} />{saving ? "儲存中..." : "儲存付款設定"}</button>
        {saved && <p className="form-note" role="status">付款設定已儲存並同步到申請代幣頁。</p>}
      </form>
    </section>
  );
}

function VipProgramManager({ cards, profile, tiers }) {
  const [drafts, setDrafts] = useState(tiers);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(tiers);
  }, [tiers]);

  function updateTier(index, field, value) {
    setDrafts((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier,
      ),
    );
  }

  function chooseReward(index, cardId) {
    const card = cards.find((item) => item.id === cardId);
    updateTier(index, "rewardCardId", cardId);
    setDrafts((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index
          ? {
              ...tier,
              rewardCardId: cardId,
              rewardName: card?.name || "待設定升級獎勵",
              rewardImageUrl: card?.imageUrl || "",
              rewardConversionValue: Number(card?.conversionValue ?? card?.tokenValue ?? 0),
            }
          : tier,
      ),
    );
  }

  async function saveVipProgram() {
    const normalized = normalizeVipTiers(drafts);
    if (normalized.some((tier, index) => index > 0 && tier.threshold <= normalized[index - 1].threshold)) {
      alert("VIP 入金門檻必須逐級增加。");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "vipProgram"), {
        tiers: normalized,
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
    <section className="panel vip-manager">
      <div className="section-heading">
        <Crown size={24} />
        <div>

          <h1>VIP 等級及升級贈卡</h1>
          <p className="muted">設定每級累積入金門檻及指定贈送卡牌；批准入金時系統會自動發放新達成級別的獎勵。</p>
        </div>
      </div>
      <div className="vip-manager-grid">
        {drafts.map((tier, index) => (
          <article className="vip-manager-card" key={tier.id}>
            <div className="vip-manager-title">
              <span className="vip-shield small">{index}</span>
              <div>
                <strong>{tier.name}</strong>
                <small>第 {index + 1} 級</small>
              </div>
            </div>
            <label>
              累積入金門檻（HKD）
              <input
                type="number"
                min="1"
                value={tier.threshold}
                onChange={(event) => updateTier(index, "threshold", event.target.value)}
              />
            </label>
            <label>
              升級贈送卡牌
              <select
                value={tier.rewardCardId || ""}
                onChange={(event) => chooseReward(index, event.target.value)}
              >
                <option value="">未設定</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>{card.name}</option>
                ))}
              </select>
            </label>
            <div className="vip-reward-preview">
              {tier.rewardImageUrl ? (
                <img src={tier.rewardImageUrl} alt={tier.rewardName} />
              ) : (
                <Gift size={24} />
              )}
              <div>
                <strong>{tier.rewardName || "待設定升級獎勵"}</strong>
                <span>可轉回 <TokenAmount value={tier.rewardConversionValue || 0} /></span>
              </div>
            </div>
          </article>
        ))}
      </div>
      <button className="primary-btn vip-save-btn" type="button" onClick={saveVipProgram} disabled={saving}>
        <Save size={17} />
        {saving ? "儲存中..." : "儲存 VIP 設定"}
      </button>
    </section>
  );
}

function AdminRoomRecordsPanel({ cards, records, profile, loading = false }) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const [roomFilter, setRoomFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [drawRecordStatus, setDrawRecordStatus] = useState("active");
  const [selectedCards, setSelectedCards] = useState({});
  const [selectedStatuses, setSelectedStatuses] = useState({});
  const [selectedResultSides, setSelectedResultSides] = useState({});
  const [assigningId, setAssigningId] = useState("");
  const [pendingAssignment, setPendingAssignment] = useState(null);
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
  const totalSpend = filteredRecords.reduce(
    (sum, record) => sum + Number(record.tokenCost || record.targetCardValue || 0),
    0,
  );
  const totalPayout = completedRecords.reduce(
    (sum, record) => sum + Number(record.cardConversionValue ?? getCardConversionRefund(record) ?? 0),
    0,
  );

  useEffect(() => {
    setRoundFilter("all");
  }, [roomFilter]);

  if (loading) {
    return (
      <section className="panel wide">
        <div className="section-heading compact">
          <ListChecks size={22} />
          <div>

            <h2>{isBeta ? "直播購買紀錄 / 分配抽卡結果" : "房間購買紀錄 / 分配抽卡結果"}</h2>
          </div>
        </div>
        <InlineLoading label="正在載入購買紀錄..." />
      </section>
    );
  }

  function updateSelection(recordId, value) {
    setSelectedCards((current) => ({ ...current, [recordId]: value }));
  }

  function updateStatus(recordId, value) {
    setSelectedStatuses((current) => ({ ...current, [recordId]: value }));
  }

  function updateResultSide(recordId, value) {
    setSelectedResultSides((current) => ({ ...current, [recordId]: value }));
  }

  function openAssignmentConfirmation(record) {
    const cardId = selectedCards[record.id] || record.cardId || record.targetCardId;
    const selectedCard = cards.find((item) => item.id === cardId);
    const resultSide = selectedResultSides[record.id] || record.resultSide || "heaven";
    const card =
      resultSide === "hell" && selectedCard?.hellCardId
        ? cards.find((item) => item.id === selectedCard.hellCardId) || selectedCard
        : selectedCard;
    const collectionStatus =
      selectedStatuses[record.id] || record.collectionStatus || "pending";

    if (!card) {
      alert("請選擇要分配的卡牌。");
      return;
    }

    setPendingAssignment({ record, selectedCard, card, resultSide, collectionStatus });
  }

  async function confirmAssignment() {
    if (!pendingAssignment || assigningId) return;

    const { record, selectedCard, card, resultSide, collectionStatus } = pendingAssignment;

    setAssigningId(record.id);
    try {
      const cardValue = Number(card.tokenValue || record.targetCardValue || record.tokenCost || 0);
      await updateDoc(doc(db, "drawRecords", record.id), {
        cardId: card.id,
        cardName: card.name,
        cardCategory: getCardCategory(card),
        cardImageUrl: card.imageUrl || "",
        cardValue,
        cardConversionValue: Number(card.conversionValue ?? card.tokenValue ?? 0),
        resultSide,
        selectedHeavenCardId: selectedCard?.id || "",
        collectionStatus,
        assignedAt: serverTimestamp(),
        assignedBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
      setPendingAssignment(null);
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

          <h2>{isBeta ? "直播購買紀錄 / 分配抽卡結果" : "房間購買紀錄 / 分配抽卡結果"}</h2>
          <p className="muted">
            {isBeta ? "按場次查看購買資料並分配實際抽中卡牌。" : "用房間同場次篩選後，直接查看購買資料並分配實際抽中卡牌。"}
          </p>
        </div>
      </div>
      <div className="admin-record-toolbar">
        {!isBeta && <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}>
          <option value="all">全部房間</option>
          {rooms.map(([roomId, roomTitle]) => (
            <option key={roomId} value={roomId}>
              {roomTitle}
            </option>
          ))}
        </select>}
        <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
          <option value="all">全部場次</option>
          {rounds.map((round) => (
            <option key={round} value={round}>
              {round}
            </option>
          ))}
        </select>
        <strong>{filteredRecords.length} 筆紀錄</strong>
      </div>
      <div className="admin-finance-summary">
        <span><small>總計購買</small><strong><TokenAmount value={totalSpend} /></strong></span>
        <span><small>派彩總額</small><strong><TokenAmount value={totalPayout} /></strong></span>
        <span><small>毛利</small><strong><TokenAmount value={totalSpend - totalPayout} /></strong></span>
      </div>
      <div className="collection-tabs admin-status-tabs">
        <button
          className={drawRecordStatus === "active" ? "active" : ""}
          type="button"
          onClick={() => setDrawRecordStatus("active")}
        >
          未分配 {activeRecords.length}
        </button>
        <button
          className={drawRecordStatus === "completed" ? "active" : ""}
          type="button"
          onClick={() => setDrawRecordStatus("completed")}
        >
          已分配 {completedRecords.length}
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
            const resultSide = selectedResultSides[record.id] || record.resultSide || "heaven";
            const resultCard =
              resultSide === "hell" && selectedCard?.hellCardId
                ? cards.find((card) => card.id === selectedCard.hellCardId) || selectedCard
                : selectedCard;
            const previewImage =
              resultCard?.imageUrl || record.targetCardImageUrl || record.cardImageUrl || "";
            const previewName = resultCard?.name || record.cardName || record.targetCardName || "";
            const previewValue =
              resultCard?.conversionValue ?? record.cardConversionValue ?? getCardConversionRefund(record) ?? 0;

            return (
              <article className="admin-record-card" key={record.id}>
                <div className="admin-record-card-main">
                  <div>
                    <span className="record-label">{isBeta ? "直播" : "房間"}</span>
                    <strong title={record.drawTitle || "未命名房間"}>{record.drawTitle || "未命名房間"}</strong>
                    <small title={record.roomSlug || record.drawId}>{record.roomSlug || record.drawId} · {formatRoundLabel(record.round)}</small>
                    <small>{formatDate(record.createdAt)}</small>
                  </div>
                  <div>
                    <span className="record-label">玩家</span>
                    <strong title={record.username || "未命名玩家"}>{record.username || "未命名玩家"}</strong>
                    <small className="record-full-id" title={record.uid}>{record.uid}</small>
                  </div>
                  <div className="record-number-tile">
                    <span>號碼</span>
                    <b>#{record.number}</b>
                  </div>
                  <div className="record-number-tile">
                    <span>花費</span>
                    <b><TokenAmount value={record.tokenCost || record.targetCardValue || 0} /></b>
                  </div>
                  <div>
                    <span className="record-label">玩家選擇卡牌</span>
                    <strong title={record.targetCardName || "未選卡牌"}>{record.targetCardName || "未選卡牌"}</strong>
                    <small>
                      {record.targetCardValue
                        ? `價值 ⚡ ${formatTokenNumber(record.targetCardValue)}`
                        : "未有價值"}
                    </small>
                  </div>
                </div>
                <div className="assignment-controls inline-assignment-controls">
                  <select
                    value={selectedCards[record.id] || record.cardId || record.targetCardId || ""}
                    title={selectedCard?.name || "選擇卡牌"}
                    onChange={(event) => updateSelection(record.id, event.target.value)}
                  >
                    <option value="">選擇卡牌</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name} · ⚡ {formatTokenNumber(card.tokenValue || 0)}
                      </option>
                    ))}
                  </select>
                  <div className="result-side-toggle" aria-label="開牌結果">
                    <button
                      className={resultSide === "heaven" ? "active" : ""}
                      type="button"
                      onClick={() => updateResultSide(record.id, "heaven")}
                    >
                      天堂
                    </button>
                    <button
                      className={resultSide === "hell" ? "active" : ""}
                      type="button"
                      onClick={() => updateResultSide(record.id, "hell")}
                    >
                      地獄
                    </button>
                  </div>
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
                    onClick={() => openAssignmentConfirmation(record)}
                    disabled={assigningId === record.id}
                  >
                    <Package size={15} />
                    {assigningId === record.id ? "儲存中..." : "生成盲盒"}
                  </button>
                </div>
                {record.cardName && (
                  <div className="assigned-result-inline">
                    {previewImage ? <img src={previewImage} alt={previewName || "已分配卡牌"} /> : <Package size={18} />}
                    <span>已分配：{previewName}{previewValue ? ` · ⚡ ${formatTokenNumber(previewValue)}` : ""}</span>
                    <b className={record.resultSide === "hell" ? "hell" : "heaven"}>{getResultSideLabel(record.resultSide)}</b>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">暫時未有購買紀錄。</p>
      )}
      {pendingAssignment && (
        <AdminBlindBoxConfirmModal
          assignment={pendingAssignment}
          saving={assigningId === pendingAssignment.record.id}
          onCancel={() => setPendingAssignment(null)}
          onConfirm={confirmAssignment}
        />
      )}
    </section>
  );
}

// Reviews the exact result before an administrator permanently assigns a card to a draw record.
function AdminBlindBoxConfirmModal({ assignment, saving, onCancel, onConfirm }) {
  const { record, card, resultSide, collectionStatus } = assignment;

  return (
    <div className="modal-backdrop blind-box-backdrop" role="presentation" onMouseDown={saving ? undefined : onCancel}>
      <section className="modal blind-box-modal admin-blind-box-modal" role="dialog" aria-modal="true" aria-labelledby="admin-blind-box-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-btn modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="取消生成盲盒"><X size={19} /></button>
        <div className="admin-blind-box-preview">
          {card.imageUrl ? <img src={card.imageUrl} alt={card.name} /> : <Package size={42} />}
        </div>

        <h2 id="admin-blind-box-title">確認生成盲盒</h2>
        <p className="blind-box-copy">請核對派發結果。確認後，玩家會在「我的紀錄」及「我的卡牌」看到呢張卡。</p>
        <div className="blind-box-order admin-blind-box-order">
          <div><span>玩家</span><strong>{record.username || "未命名玩家"}</strong></div>
          <div><span>房間／場次</span><strong>{record.drawTitle || "未命名房間"} · {formatRoundLabel(record.round)}</strong></div>
          <div><span>盲盒號碼</span><strong>#{record.number}</strong></div>
          <div><span>玩家花費</span><strong><TokenAmount value={record.tokenCost || record.targetCardValue || 0} /></strong></div>
          <div><span>玩家所屬盲盒</span><strong>{record.targetCardName || "未選卡牌"}</strong></div>
          <div><span>天堂／地獄</span><strong className={resultSide === "hell" ? "result-hell" : "result-heaven"}>{getResultSideLabel(resultSide)}</strong></div>
          <div className="blind-box-target"><span>實際派發卡牌</span><strong>{card.name} · ⚡ {formatTokenNumber(card.conversionValue ?? card.tokenValue ?? 0)}</strong></div>
          <div className="blind-box-target"><span>卡牌狀態</span><strong>{statusLabels[collectionStatus]}</strong></div>
        </div>
        <div className="blind-box-actions">
          <button className="small-btn" type="button" onClick={onCancel} disabled={saving}>返回修改</button>
          <button className="primary-btn" type="button" onClick={onConfirm} disabled={saving}>{saving ? "生成中..." : "確認生成盲盒"}</button>
        </div>
      </section>
    </div>
  );
}

function CreateCardForm({ cards, profile }) {
  const cardCategories = useCardCategories(cards);
  const [newCard, setNewCard] = useState({
    name: "",
    modePriceHalf: 10,
    modePriceFifth: 10,
    modePriceTenth: 10,
    allowedShareModes: [...SHARE_MODES],
    conversionValue: 8,
    category: CARD_CATEGORIES[0],
    hellCardId: "",
    imageFile: null,
  });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [savingCategory, setSavingCategory] = useState("");
  const [cardDrafts, setCardDrafts] = useState({});
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [publishingShowcase, setPublishingShowcase] = useState(false);
  const [savingCardId, setSavingCardId] = useState("");
  const [deletingCardId, setDeletingCardId] = useState("");
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
      Number(draft.modePriceHalf || 0) !== getCardModePrices(card).half ||
      Number(draft.modePriceFifth || 0) !== getCardModePrices(card).fifth ||
      Number(draft.modePriceTenth || 0) !== getCardModePrices(card).tenth ||
      JSON.stringify(getCardAllowedShareModes(draft)) !== JSON.stringify(getCardAllowedShareModes(card)) ||
      Number(draft.conversionValue || 0) !== Number(card.conversionValue ?? card.tokenValue ?? 0) ||
      String(draft.hellCardId || "") !== String(card.hellCardId || "") ||
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

  function toggleAllowedShareMode(cardId, mode) {
    setCardDrafts((current) => {
      const draft = current[cardId] || {};
      const allowedShareModes = getCardAllowedShareModes(draft);
      return {
        ...current,
        [cardId]: {
          ...draft,
          allowedShareModes: allowedShareModes.includes(mode)
            ? allowedShareModes.filter((item) => item !== mode)
            : SHARE_MODES.filter((item) => [...allowedShareModes, mode].includes(item)),
        },
      };
    });
  }

  function toggleNewCardShareMode(mode) {
    setNewCard((current) => ({
      ...current,
      allowedShareModes: current.allowedShareModes.includes(mode)
        ? current.allowedShareModes.filter((item) => item !== mode)
        : SHARE_MODES.filter((item) => [...current.allowedShareModes, mode].includes(item)),
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
    const modePrices = {
      half: Number(newCard.modePriceHalf),
      fifth: Number(newCard.modePriceFifth),
      tenth: Number(newCard.modePriceTenth),
    };
    if (Object.values(modePrices).some((value) => value < 1)) {
      alert("三種玩法的卡牌價值都最少為 1。");
      return;
    }
    if (!newCard.allowedShareModes.length) {
      alert("每張卡最少要開放一種份額。");
      return;
    }
    if (Number(newCard.conversionValue) < 0) {
      alert("兌換價值不能少於 0。");
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
        tokenValue: modePrices.half,
        modePrices,
        allowedShareModes: newCard.allowedShareModes,
        conversionValue: Number(newCard.conversionValue),
        hellCardId: newCard.hellCardId || "",
        imageUrl,
        imageMode: "compressed-data-url",
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewCard({ name: "", modePriceHalf: 10, modePriceFifth: 10, modePriceTenth: 10, allowedShareModes: [...SHARE_MODES], conversionValue: 8, category: CARD_CATEGORIES[0], hellCardId: "", imageFile: null });
    } catch (error) {
      showSafeError(error);
    } finally {
      setCreating(false);
    }
  }

  async function saveCardEdit(card) {
    const draft = cardDrafts[card.id] || {};
    const cleanName = String(draft.name || "").trim();
    const cleanModePrices = {
      half: Number(draft.modePriceHalf || 0),
      fifth: Number(draft.modePriceFifth || 0),
      tenth: Number(draft.modePriceTenth || 0),
    };
    const cleanConversionValue = Number(draft.conversionValue || 0);
    const allowedShareModes = getCardAllowedShareModes(draft);

    if (!cleanName) {
      alert("請輸入卡牌名稱。");
      return;
    }
    if (Object.values(cleanModePrices).some((value) => value < 1)) {
      alert("三種玩法的卡牌價值都最少為 1。");
      return;
    }
    if (!allowedShareModes.length) {
      alert("每張卡最少要開放一種份額。");
      return;
    }
    if (cleanConversionValue < 0) {
      alert("兌換價值不能少於 0。");
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
        tokenValue: cleanModePrices.half,
        modePrices: cleanModePrices,
        allowedShareModes,
        conversionValue: cleanConversionValue,
        hellCardId: draft.hellCardId || "",
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
        cardValue: cleanModePrices.half,
        cardConversionValue: cleanConversionValue,
        ...(updates.imageUrl ? { cardImageUrl: updates.imageUrl } : {}),
        updatedAt: serverTimestamp(),
      });
      await updateRoomPoolCardsForCard(card.id, {
        name: cleanName,
        category: draft.category || CARD_CATEGORIES[0],
        tokenValue: cleanModePrices.half,
        modePrices: cleanModePrices,
        allowedShareModes,
      });
      setCardDrafts((current) => ({
        ...current,
        [card.id]: {
          name: cleanName,
          category: draft.category || CARD_CATEGORIES[0],
          modePriceHalf: cleanModePrices.half,
          modePriceFifth: cleanModePrices.fifth,
          modePriceTenth: cleanModePrices.tenth,
          allowedShareModes,
          conversionValue: cleanConversionValue,
          hellCardId: draft.hellCardId || "",
          imageFile: null,
        },
      }));
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingCardId("");
    }
  }

  async function deleteCard(card) {
    if (!window.confirm(`確認刪除「${card.name}」？\n\n這張卡會從卡牌庫及所有房間卡池移除；已完成的抽卡及配送紀錄會保留。`)) {
      return;
    }

    setDeletingCardId(card.id);
    try {
      const roomsSnapshot = await getDocs(collection(db, "draws"));
      const batch = writeBatch(db);

      roomsSnapshot.docs.forEach((roomDoc) => {
        const room = roomDoc.data();
        const poolCardIds = getRoomPoolIds(room);
        if (!poolCardIds.includes(card.id)) return;

        const poolCards = normalizeRoomCards(room.poolCards)
          .filter((item) => item.id !== card.id)
          .map(roomCardPayload);
        const nextPoolCardIds = poolCardIds.filter((cardId) => cardId !== card.id);
        const poolCardValues = { ...(room.poolCardValues || {}) };
        delete poolCardValues[card.id];

        batch.update(roomDoc.ref, {
          poolCards,
          poolCardIds: nextPoolCardIds,
          poolCardValues,
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        });
      });

      cards.forEach((item) => {
        if (item.id !== card.id && item.hellCardId === card.id) {
          batch.update(doc(db, "cards", item.id), {
            hellCardId: "",
            updatedAt: serverTimestamp(),
            updatedBy: profile.uid,
          });
        }
      });

      batch.set(doc(db, "publicCardShowcase", card.id), {
        active: false,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      }, { merge: true });
      batch.update(doc(db, "cards", card.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      showSafeError(error);
    } finally {
      setDeletingCardId("");
    }
  }

  function exportCardsCsv() {
    const csvRows = cards.map((card) => ({
      id: card.id,
      name: card.name || "",
      category: getCardCategory(card),
      priceHalf: getCardModePrices(card).half,
      priceFifth: getCardModePrices(card).fifth,
      priceTenth: getCardModePrices(card).tenth,
      allowedShareModes: getCardAllowedShareModes(card).join("|"),
      conversionValue: Number(card.conversionValue ?? card.tokenValue ?? 0),
      hellCardId: card.hellCardId || "",
      imageUrl: card.imageUrl || "",
    }));
    const csvText = createCsvText(["id", "name", "category", "priceHalf", "priceFifth", "priceTenth", "allowedShareModes", "conversionValue", "hellCardId", "imageUrl"], csvRows);
    downloadTextFile(`draw-card-library-${new Date().toISOString().slice(0, 10)}.csv`, csvText);
  }

  async function publishHomepageShowcase() {
    const featuredCards = [...cards]
      .filter((card) => card.name && card.imageUrl && Number(card.tokenValue || 0) > 0)
      .sort((left, right) => Number(right.tokenValue || 0) - Number(left.tokenValue || 0))
      .slice(0, PUBLIC_CARD_SHOWCASE_LIMIT);

    if (!featuredCards.length) {
      alert("卡牌庫未有可發佈的卡牌圖片。");
      return;
    }
    if (!window.confirm(`確認更新首頁走馬燈的 ${featuredCards.length} 張卡牌？`)) {
      return;
    }

    setPublishingShowcase(true);
    try {
      const existingSnapshot = await getDocs(collection(db, "publicCardShowcase"));
      const batch = writeBatch(db);

      existingSnapshot.docs.forEach((item) => {
        batch.set(item.ref, { active: false, updatedAt: serverTimestamp() }, { merge: true });
      });
      featuredCards.forEach((card, index) => {
        batch.set(doc(db, "publicCardShowcase", card.id), {
          name: String(card.name || ""),
          imageUrl: String(card.imageUrl || ""),
          tokenValue: Number(card.tokenValue || 0),
          modePrices: getCardModePrices(card),
          allowedShareModes: getCardAllowedShareModes(card),
          category: getCardCategory(card),
          active: true,
          rank: index + 1,
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        }, { merge: true });
      });
      await batch.commit();
      alert(`首頁走馬燈已更新，共 ${featuredCards.length} 張卡牌。`);
    } catch (error) {
      showSafeError(error);
    } finally {
      setPublishingShowcase(false);
    }
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
          modePrices: row.modePrices,
          allowedShareModes: row.allowedShareModes,
          conversionValue: row.conversionValue,
          hellCardId: row.hellCardId || "",
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
            cardConversionValue: row.conversionValue,
            ...(row.imageUrl ? { cardImageUrl: row.imageUrl } : {}),
            updatedAt: serverTimestamp(),
          });
          await updateRoomPoolCardsForCard(matchedCard.id, {
            name: row.name,
            category: row.category || CARD_CATEGORIES[0],
            tokenValue: row.tokenValue,
            modePrices: row.modePrices,
            allowedShareModes: row.allowedShareModes,
            conversionValue: row.conversionValue,
          });
          updatedCount += 1;
        } else {
          const docData = {
            name: row.name,
            category: row.category || CARD_CATEGORIES[0],
            tokenValue: row.tokenValue,
            modePrices: row.modePrices,
            allowedShareModes: row.allowedShareModes,
            conversionValue: row.conversionValue,
            hellCardId: row.hellCardId || "",
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

          <h1>卡牌庫管理</h1>
          <p className="muted">可分開設定抽卡價值及玩家把卡牌轉回代幣的價值。</p>
        </div>
      </div>

      <div className="card-sheet-toolbar">
        <button
          className="small-btn"
          type="button"
          onClick={publishHomepageShowcase}
          disabled={publishingShowcase}
        >
          <RefreshCcw size={15} />
          {publishingShowcase ? "更新中..." : "更新首頁走馬燈"}
        </button>
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
          CSV 欄位：id、name、category、priceHalf、priceFifth、priceTenth、conversionValue、hellCardId、imageUrl。保留 id 可更新現有卡；留空 id 會新增。
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
          <span>1/2 價值</span>
          <span>1/5 價值</span>
          <span>1/10 價值</span>
          <span>開放份額</span>
          <span>兌換價值</span>
          <span>地獄對應卡</span>
          <span>操作</span>
        </div>

        <form className="card-sheet-row card-sheet-new" onSubmit={createCard}>
          <ImageCellPicker
            file={newCard.imageFile}
            imageUrl=""
            label="新增圖片"
            onChange={(file) => updateNewCard("imageFile", file)}
          />
          <label className="card-sheet-field">
            <span>卡牌名稱</span>
            <input
              value={newCard.name}
              onChange={(event) => updateNewCard("name", event.target.value)}
              placeholder="例如：Pikachu AR"
              required
            />
          </label>
          <label className="card-sheet-field">
            <span>分類</span>
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
          </label>
          <label className="card-sheet-field">
            <span>1/2 價值</span>
            <input
              type="number"
              min="1"
              step="any"
              value={newCard.modePriceHalf}
              onChange={(event) => updateNewCard("modePriceHalf", event.target.value)}
              required
            />
          </label>
          <label className="card-sheet-field">
            <span>1/5 價值</span>
            <input
              type="number"
              min="1"
              step="any"
              value={newCard.modePriceFifth}
              onChange={(event) => updateNewCard("modePriceFifth", event.target.value)}
              required
            />
          </label>
          <label className="card-sheet-field">
            <span>1/10 價值</span>
            <input
              type="number"
              min="1"
              step="any"
              value={newCard.modePriceTenth}
              onChange={(event) => updateNewCard("modePriceTenth", event.target.value)}
              required
            />
          </label>
          <fieldset className="card-sheet-field card-share-mode-field">
            <legend>開放份額</legend>
            {SHARE_MODES.map((mode) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={newCard.allowedShareModes.includes(mode)}
                  onChange={() => toggleNewCardShareMode(mode)}
                />
                {mode}
              </label>
            ))}
          </fieldset>
          <label className="card-sheet-field">
            <span>兌換價值</span>
            <input
              type="number"
              min="0"
              value={newCard.conversionValue}
              onChange={(event) => updateNewCard("conversionValue", event.target.value)}
              required
            />
          </label>
          <label className="card-sheet-field">
            <span>地獄對應卡</span>
            <select value={newCard.hellCardId} onChange={(event) => updateNewCard("hellCardId", event.target.value)}>
              <option value="">未設定</option>
              {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </label>
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
                modePriceHalf: getCardModePrices(card).half,
                modePriceFifth: getCardModePrices(card).fifth,
                modePriceTenth: getCardModePrices(card).tenth,
                allowedShareModes: getCardAllowedShareModes(card),
                conversionValue: Number(card.conversionValue ?? card.tokenValue ?? 10),
                hellCardId: card.hellCardId || "",
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
                  <label className="card-sheet-field">
                    <span>卡牌名稱</span>
                    <input
                      value={draft.name}
                      onChange={(event) => updateDraft(card.id, "name", event.target.value)}
                    />
                  </label>
                  <label className="card-sheet-field">
                    <span>分類</span>
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
                  </label>
                  <label className="card-sheet-field">
                    <span>1/2 價值</span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={draft.modePriceHalf}
                      onChange={(event) => updateDraft(card.id, "modePriceHalf", event.target.value)}
                    />
                  </label>
                  <label className="card-sheet-field">
                    <span>1/5 價值</span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={draft.modePriceFifth}
                      onChange={(event) => updateDraft(card.id, "modePriceFifth", event.target.value)}
                    />
                  </label>
                  <label className="card-sheet-field">
                    <span>1/10 價值</span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={draft.modePriceTenth}
                      onChange={(event) => updateDraft(card.id, "modePriceTenth", event.target.value)}
                    />
                  </label>
                  <fieldset className="card-sheet-field card-share-mode-field">
                    <legend>開放份額</legend>
                    {SHARE_MODES.map((mode) => (
                      <label key={mode}>
                        <input
                          type="checkbox"
                          checked={getCardAllowedShareModes(draft).includes(mode)}
                          onChange={() => toggleAllowedShareMode(card.id, mode)}
                        />
                        {mode}
                      </label>
                    ))}
                  </fieldset>
                  <label className="card-sheet-field">
                    <span>兌換價值</span>
                    <input
                      type="number"
                      min="0"
                      value={draft.conversionValue}
                      onChange={(event) => updateDraft(card.id, "conversionValue", event.target.value)}
                    />
                  </label>
                  <label className="card-sheet-field">
                    <span>地獄對應卡</span>
                    <select value={draft.hellCardId || ""} onChange={(event) => updateDraft(card.id, "hellCardId", event.target.value)}>
                      <option value="">未設定</option>
                      {cards.filter((item) => item.id !== card.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
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
                    <button
                      className="small-btn danger"
                      type="button"
                      onClick={() => deleteCard(card)}
                      disabled={savingCardId === card.id || deletingCardId === card.id}
                    >
                      <Trash2 size={15} />
                      {deletingCardId === card.id ? "刪除中..." : "刪除卡牌"}
                    </button>
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

function RoomPoolEditor({ draw, cards, singleLive = false }) {
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
      alert(singleLive ? "請最少選擇一張直播卡牌。" : "請最少選擇一張房間卡牌。");
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
          <strong>{singleLive ? "直播可選卡牌" : "房間可選卡牌"}</strong>
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
                <small><TokenAmount value={card.tokenValue || 0} /></small>
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
  const [roundSchedules, setRoundSchedules] = useState(() => getRoundScheduleDrafts(draw));
  const [roundShareModes, setRoundShareModes] = useState(() => ({ ...(draw.roundShareModes || {}) }));
  const [resultFiles, setResultFiles] = useState({});
  const [uploadingRoundId, setUploadingRoundId] = useState("");
  const [saving, setSaving] = useState(false);
  const savedTotal = getRoomRoundCount(draw);
  const savedCurrent = getRoomCurrentRound(draw);
  const savedRoundSchedules = draw.roundSchedules;
  const totalRoundNumber = Number(totalRounds);
  const currentRoundNumber = Number(currentRound);
  const hasChanges =
    totalRoundNumber !== savedTotal ||
    currentRoundNumber !== savedCurrent ||
    JSON.stringify(roundSchedules) !== JSON.stringify(getRoundScheduleDrafts(draw)) ||
    JSON.stringify(roundShareModes) !== JSON.stringify(draw.roundShareModes || {}) ||
    Object.values(resultFiles).some(Boolean);

  useEffect(() => {
    setTotalRounds(String(savedTotal));
    setCurrentRound(String(savedCurrent));
    setRoundSchedules(getRoundScheduleDrafts({ roundSchedules: savedRoundSchedules }));
    setRoundShareModes({ ...(draw.roundShareModes || {}) });
    setResultFiles({});
  }, [draw.id, draw.roundShareModes, savedCurrent, savedRoundSchedules, savedTotal]);

  function addFutureRound() {
    const currentTotal = Math.max(1, Math.min(100, Math.round(Number(totalRounds) || 1)));
    if (currentTotal >= 100) {
      alert("每個直播最多可以設定 100 場。");
      return;
    }

    const nextRoundNumber = currentTotal + 1;
    const previousRoundId = toRoundId(currentTotal);
    const nextRoundId = toRoundId(nextRoundNumber);
    const previousSchedule = roundSchedules[previousRoundId];
    const previousDate = previousSchedule ? new Date(previousSchedule) : null;
    const nextDate = previousDate && !Number.isNaN(previousDate.getTime())
      ? new Date(previousDate.getTime() + 40 * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    nextDate.setSeconds(0, 0);
    const localDateTime = new Date(nextDate.getTime() - nextDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setTotalRounds(String(nextRoundNumber));
    setRoundSchedules((current) => ({ ...current, [nextRoundId]: localDateTime }));
    setRoundShareModes((current) => ({
      ...current,
      [nextRoundId]: current[previousRoundId] || getRoomShareMode(draw, previousRoundId),
    }));
  }

  async function saveRoundSettings() {
    const nextTotal = Math.max(1, Math.min(100, Math.round(Number(totalRounds) || 1)));
    const nextCurrent = Math.max(1, Math.min(nextTotal, Math.round(Number(currentRound) || 1)));

    setSaving(true);
    try {
      const nextRoundSchedules = {};
      const nextRoundShareModes = {};
      const nextResultImages = { ...(draw.roundResultImages || {}) };

      for (const roundNumber of rangeNumbers(1, nextTotal)) {
        const roundId = toRoundId(roundNumber);
        const scheduleValue = roundSchedules[roundId];
        if (scheduleValue) {
          nextRoundSchedules[roundId] = new Date(scheduleValue).toISOString();
        }
        nextRoundShareModes[roundId] = roundShareModes[roundId] || getRoomShareMode(draw, roundId);
        if (resultFiles[roundId]) {
          nextResultImages[roundId] = await uploadCompressedImage(
            resultFiles[roundId],
            `draw-results/${draw.id}/${roundId}-${Date.now()}.webp`,
          );
        }
      }

      await updateDoc(doc(db, "draws", draw.id), {
        totalRounds: nextTotal,
        currentRound: nextCurrent,
        round: toRoundId(nextCurrent),
        roundSchedules: nextRoundSchedules,
        roundShareModes: nextRoundShareModes,
        roundResultImages: nextResultImages,
        updatedAt: serverTimestamp(),
      });
      await ensureRoomRoundSlots(draw.id, rangeNumbers(1, nextTotal), Number(draw.cardCount || 30));
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  async function uploadRoundResult(roundId, file) {
    if (!file) return;

    setResultFiles((current) => ({ ...current, [roundId]: file }));
    setUploadingRoundId(roundId);
    try {
      const imageUrl = await uploadCompressedImage(
        file,
        `draw-results/${draw.id}/${roundId}-${Date.now()}.webp`,
      );
      await updateDoc(doc(db, "draws", draw.id), {
        [`roundResultImages.${roundId}`]: imageUrl,
        updatedAt: serverTimestamp(),
      });
      setResultFiles((current) => ({ ...current, [roundId]: null }));
      alert(`${formatRoundLabel(roundId)}賽果相片已上載。`);
    } catch (error) {
      showSafeError(error, "賽果相片上載失敗，請重新選擇圖片再試。");
    } finally {
      setUploadingRoundId("");
    }
  }

  return (
    <div className="room-round-settings-wrap">
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
          disabled={saving || Boolean(uploadingRoundId) || !hasChanges}
        >
          <Save size={15} />
          {saving ? "儲存中..." : "儲存場次"}
        </button>
        <button
          className="small-btn future-round-add-btn"
          type="button"
          onClick={addFutureRound}
          disabled={saving || Boolean(uploadingRoundId) || totalRoundNumber >= 100}
        >
          <Plus size={15} />
          新增未來場次
        </button>
      </div>
      <div className="round-schedule-editor">
        {rangeNumbers(1, Math.max(1, Math.min(100, Number(totalRounds) || 1))).map((roundNumber) => {
          const roundId = toRoundId(roundNumber);
          const resultImage = draw.roundResultImages?.[roundId] || "";
          return (
            <div className="round-schedule-row" key={roundId}>
              <strong>第 {roundNumber} 場</strong>
              <label>
                預計開卡時間
                <input
                  type="datetime-local"
                  value={roundSchedules[roundId] || ""}
                  onChange={(event) =>
                    setRoundSchedules((current) => ({
                      ...current,
                      [roundId]: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                本場機率
                <select
                  value={roundShareModes[roundId] || getRoomShareMode(draw, roundId)}
                  onChange={(event) => setRoundShareModes((current) => ({
                    ...current,
                    [roundId]: event.target.value,
                  }))}
                >
                  <option value="1/2">1/2 二份之一</option>
                  <option value="1/5">1/5 五份之一</option>
                  <option value="1/10">1/10 十分之一</option>
                </select>
              </label>
              <FileUpload
                id={`round-result-${draw.id}-${roundId}`}
                label={uploadingRoundId === roundId ? "賽果相片上載中..." : "賽果相片"}
                file={resultFiles[roundId] || null}
                onChange={(file) => uploadRoundResult(roundId, file)}
                disabled={Boolean(uploadingRoundId)}
              />
              {uploadingRoundId === roundId ? (
                <span className="round-result-empty">正在壓縮及上載...</span>
              ) : resultImage ? (
                <a className="round-result-preview" href={resultImage} target="_blank" rel="noreferrer">
                  <img src={resultImage} alt={`第 ${roundNumber} 場賽果`} />
                  查看現有相片
                </a>
              ) : (
                <span className="round-result-empty">未有賽果相片</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateDrawForm({ profile, cards }) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
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
    const currentRound = isBeta ? 1 : Number(form.currentRound);

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
      alert(isBeta ? "請最少選擇一張直播卡牌。" : "請最少選擇一張房間卡牌。");
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
      const thumbnailUrl = !isBeta && thumbnailFile
        ? await imageFileToCompressedDataUrl(thumbnailFile, {
            maxWidth: 900,
            maxHeight: 520,
            quality: 0.7,
          })
        : isBeta ? "" : form.thumbnailUrl.trim();
      const firstRoundDate = form.firstRoundAt ? new Date(form.firstRoundAt) : null;
      const roundSchedules = Object.fromEntries(
        rangeNumbers(1, totalRounds).map((roundNumber) => {
          const scheduledAt = firstRoundDate && !Number.isNaN(firstRoundDate.getTime())
            ? new Date(firstRoundDate.getTime() + (roundNumber - 1) * 40 * 60 * 1000).toISOString()
            : "";
          return [toRoundId(roundNumber), scheduledAt];
        }),
      );
      const roundShareModes = Object.fromEntries(
        rangeNumbers(1, totalRounds).map((roundNumber) => [
          toRoundId(roundNumber),
          form.shareMode || "1/2",
        ]),
      );

      batch.set(drawRef, {
        title: form.title.trim(),
        slug,
        kickUrl: getKickChannel(form.kickUrl),
        cardCount,
        tokenCost,
        totalRounds,
        currentRound,
        round: toRoundId(currentRound),
        status: form.status,
        shareMode: form.shareMode || "1/2",
        roundShareModes,
        roundSchedules,
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

          <h1>{isBeta ? "建立唯一直播" : "建立抽卡房間"}</h1>
          {isBeta && <p className="muted">只需建立一次；日後直接在「直播管理」新增日期、場次及賽果。</p>}
        </div>
      </div>
      <form className="stack-form" onSubmit={createDraw}>
        <label>
          {isBeta ? "直播名稱" : "房間標題"}
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            required
          />
        </label>
        <label>
          {isBeta ? "直播識別名稱" : "房間連結名稱"}
          <input
            value={form.slug}
            onChange={(event) => updateField("slug", normalizeSlug(event.target.value))}
            placeholder="tonight-live-draw"
            required
          />
        </label>
        <label>
          Kick 頻道名稱
          <input
            value={form.kickUrl}
            onChange={(event) => updateField("kickUrl", event.target.value)}
            placeholder="只輸入頻道名稱，例如 livedrawtcg"
            pattern="[A-Za-z0-9_-]{2,40}"
            title="只可輸入 Kick 頻道名稱，不接受網址或 HTML"
            required
          />
        </label>
        {isBeta ? (
          <div className="form-row">
            <label>
              首頁狀態
              <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                <option value="live">直播中</option>
                <option value="draft">即將開</option>
                <option value="completed">已結束</option>
              </select>
            </label>
            <label>
              卡牌分類（賽道）
              <select value={form.shareMode} onChange={(event) => updateField("shareMode", event.target.value)}>
                <option value="1/2">1/2 二份之一</option>
                <option value="1/5">1/5 五份之一</option>
                <option value="1/10">1/10 十分之一</option>
              </select>
            </label>
          </div>
        ) : (
          <>
            <FileUpload label="房間主圖" file={thumbnailFile} onChange={setThumbnailFile} />
            <label>或輸入主圖網址<input value={form.thumbnailUrl} onChange={(event) => updateField("thumbnailUrl", event.target.value)} placeholder="https://..." /></label>
          </>
        )}
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
          {isBeta ? (
            <label>
              首場預計開卡時間
              <input type="datetime-local" value={form.firstRoundAt} onChange={(event) => updateField("firstRoundAt", event.target.value)} />
            </label>
          ) : (
            <label>目前場次<input type="number" min="1" max={form.totalRounds || 1} value={form.currentRound} onChange={(event) => updateField("currentRound", event.target.value)} required /></label>
          )}
        </div>
        <div className="form-field">
          <span>{isBeta ? "直播卡池" : "房間卡池"}</span>
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
                    <TokenAmount value={card.tokenValue || 0} />
                  </button>
                ))}
              </div>
              {!filteredCards.length && <span className="form-note">沒有符合搜尋的卡牌。</span>}
            </>
          ) : (
            <span className="form-note">請先在右邊建立卡牌，再建立房間。</span>
          )}
        </div>
        {!isBeta && (
          <label>文字備註<textarea value={form.poolText} onChange={(event) => updateField("poolText", event.target.value)} placeholder="列出卡名、稀有度、備註或寄送安排。" rows={5} /></label>
        )}
        <button className="primary-btn" type="submit" disabled={creating}>
          <Save size={18} />
          {creating ? "建立中..." : isBeta ? "建立直播" : "建立房間"}
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
    modePrices: getCardModePrices(card),
    allowedShareModes: getCardAllowedShareModes(card),
  };
}

function buildRoomCards(room, cards, roundId = "") {
  if (!room) return [];

  const libraryCards = new Map(cards.map((card) => [String(card.id), card]));
  const legacyCards = new Map(normalizeRoomCards(room.poolCards).map((card) => [card.id, card]));
  const roomValues = room?.poolCardValues && typeof room.poolCardValues === "object"
    ? room.poolCardValues
    : {};
  const cardIds = getRoomPoolIds(room);

  return cardIds
    .map((cardId) => {
      const libraryCard = libraryCards.get(cardId);
      const legacyCard = legacyCards.get(cardId);
      const source = libraryCard || legacyCard;
      const priceSource = {
        ...(legacyCard || {}),
        ...(libraryCard || {}),
        modePrices: libraryCard?.modePrices || legacyCard?.modePrices,
      };
      const availabilitySource = libraryCard || legacyCard;
      const roomValue = Number(roomValues[cardId] || 0);
      const tokenValue = libraryCard?.modePrices || legacyCard?.modePrices
        ? getCardTokenValue(priceSource, getRoomShareMode(room, roundId))
        : roomValue > 0
          ? roomValue
          : Number(source?.tokenValue || legacyCard?.tokenValue || 0);

      if (!source) return null;

      return {
        id: cardId,
        name: String(source.name || legacyCard?.name || ""),
        category: getCardCategory(source || legacyCard),
        imageUrl: String(libraryCard?.imageUrl || legacyCard?.imageUrl || ""),
        tokenValue,
        modePrices: getCardModePrices(priceSource),
        allowedShareModes: getCardAllowedShareModes(availabilitySource),
      };
    })
    .filter((card) => card?.id && card.name && cardAllowsShareMode(card, getRoomShareMode(room, roundId)));
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
      modePrices: getCardModePrices(card),
      allowedShareModes: getCardAllowedShareModes(card),
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
      const legacyPrice = Number(row.tokenvalue || row.price || row.token || row.value || 0);
      const modePrices = {
        half: Number(row.pricehalf || row.halfprice || legacyPrice),
        fifth: Number(row.pricefifth || row.fifthprice || legacyPrice),
        tenth: Number(row.pricetenth || row.tenthprice || legacyPrice),
      };
      const tokenValue = modePrices.half;
      const conversionValue = Number(
        row.conversionvalue || row.refundvalue || row.convertvalue || tokenValue,
      );
      const hellCardId = String(row.hellcardid || row.hellcard || "").trim();
      const allowedShareModesText = String(
        row.allowedsharemodes || row.sharemodes || row.allowedmodes || "",
      );
      const allowedShareModes = allowedShareModesText
        ? SHARE_MODES.filter((mode) => allowedShareModesText.split(/[|,;/\s]+/).includes(mode))
        : [...SHARE_MODES];
      const imageUrl = String(row.imageurl || row.image || row.photo || row.picture || "").trim();

      return {
        id,
        name,
        category,
        tokenValue,
        modePrices,
        allowedShareModes,
        conversionValue: Math.max(0, conversionValue),
        hellCardId,
        imageUrl,
      };
    })
    .filter((row) => row.name && row.allowedShareModes.length && Object.values(row.modePrices).every((value) => value > 0));
}

function createCardDraft(card) {
  const modePrices = getCardModePrices(card);
  return {
    name: card.name || "",
    category: getCardCategory(card),
    modePriceHalf: modePrices.half,
    modePriceFifth: modePrices.fifth,
    modePriceTenth: modePrices.tenth,
    allowedShareModes: getCardAllowedShareModes(card),
    conversionValue: Number(card.conversionValue ?? card.tokenValue ?? 10),
    hellCardId: card.hellCardId || "",
    imageFile: null,
  };
}

function useTokenPackages(enabled = true) {
  const [packages, setPackages] = useState(TOKEN_PACKAGES);

  useEffect(() => {
    if (!enabled) {
      setPackages(TOKEN_PACKAGES);
      return undefined;
    }
    const settingsRef = doc(db, "settings", "tokenPackages");
    const stopSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setPackages(TOKEN_PACKAGES);
          return;
        }

        const settings = snapshot.data();
        const savedPackages = normalizeTokenPackages(settings.packages);
        const nextPackages = Number(settings.rateVersion || 1) >= TOKEN_PACKAGE_RATE_VERSION
          ? savedPackages
          : savedPackages.map((item) => ({
              ...item,
              tokens: Math.max(1, Math.round(item.tokens / 2)),
            }));
        setPackages(nextPackages.length ? nextPackages : TOKEN_PACKAGES);
      },
      (error) => {
        console.error("Token package settings listener failed.", error);
        setPackages(TOKEN_PACKAGES);
      },
    );

    return stopSettings;
  }, [enabled]);

  return packages;
}

function usePaymentSettings(enabled = true) {
  const isBeta = import.meta.env.VITE_APP_VARIANT === "beta";
  const fallbackSettings = isBeta
    ? BETA_DUMMY_PAYMENT_SETTINGS
    : EMPTY_PAYMENT_SETTINGS;
  const [settings, setSettings] = useState(fallbackSettings);

  useEffect(() => {
    if (!enabled) {
      setSettings(BETA_DUMMY_PAYMENT_SETTINGS);
      return undefined;
    }
    return onSnapshot(doc(db, "settings", "payment"), (snapshot) => {
      const fpsIdentifier = String(snapshot.data()?.fpsIdentifier || "");
      const fpsName = String(snapshot.data()?.fpsName || "");
      if (!snapshot.exists() || !fpsIdentifier || !fpsName) {
        setSettings(fallbackSettings);
        return;
      }
      setSettings({
        fpsIdentifier,
        fpsName,
        isDummy: false,
      });
    });
  }, [enabled, fallbackSettings]);

  return settings;
}

function useVipProgram(enabled = true) {
  const [tiers, setTiers] = useState(DEFAULT_VIP_TIERS);

  useEffect(() => {
    if (!enabled) {
      setTiers(DEFAULT_VIP_TIERS);
      return undefined;
    }
    const settingsRef = doc(db, "settings", "vipProgram");
    const stopSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        setTiers(normalizeVipTiers(snapshot.exists() ? snapshot.data().tiers : []));
      },
      (error) => {
        console.error("VIP settings listener failed.", error);
        setTiers(DEFAULT_VIP_TIERS);
      },
    );
    return stopSettings;
  }, [enabled]);

  return tiers;
}

function normalizeVipTiers(tiers) {
  const source = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_VIP_TIERS;
  return source
    .map((tier, index) => ({
      id: String(tier?.id || `vip${index}`).trim().toLowerCase(),
      name: String(tier?.name || `VIP${index}`).trim().slice(0, 20),
      threshold: Math.max(1, Math.round(Number(tier?.threshold || 0))),
      rewardCardId: String(tier?.rewardCardId || ""),
      rewardName: String(tier?.rewardName || "待設定升級獎勵").trim().slice(0, 120),
      rewardImageUrl: String(tier?.rewardImageUrl || ""),
      rewardConversionValue: Math.max(0, Math.round(Number(tier?.rewardConversionValue || 0))),
    }))
    .filter((tier) => tier.id && tier.threshold > 0)
    .sort((left, right) => left.threshold - right.threshold)
    .slice(0, 8);
}

function getVipState(tiers, deposit) {
  const normalizedTiers = normalizeVipTiers(tiers);
  const total = Math.max(0, Number(deposit || 0));
  let currentIndex = -1;
  normalizedTiers.forEach((tier, index) => {
    if (total >= tier.threshold) currentIndex = index;
  });
  const nextIndex = currentIndex + 1;
  const nextTier = normalizedTiers[nextIndex] || null;

  return {
    currentIndex,
    currentTier: normalizedTiers[currentIndex] || null,
    nextTier,
    remaining: nextTier ? Math.max(0, nextTier.threshold - total) : 0,
    tiers: normalizedTiers.map((tier, index) => {
      const previousThreshold = index === 0 ? 0 : normalizedTiers[index - 1].threshold;
      const distance = Math.max(1, tier.threshold - previousThreshold);
      const progress = Math.max(0, Math.min(100, ((total - previousThreshold) / distance) * 100));
      return {
        ...tier,
        done: total >= tier.threshold,
        active: index === nextIndex,
        progress,
      };
    }),
  };
}

function getTokenBonusRate(tokenPackage) {
  const baseTokens = Number(tokenPackage?.hkd || 0);
  if (!baseTokens) return 0;
  return Math.max(0, Math.round(((Number(tokenPackage?.tokens || 0) - baseTokens) / baseTokens) * 100));
}

function useCardCategories(cards = [], enabled = true) {
  const [categories, setCategories] = useState(CARD_CATEGORIES);

  useEffect(() => {
    if (!enabled) {
      setCategories(CARD_CATEGORIES);
      return undefined;
    }

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
  }, [enabled]);

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

// Calculate the grant from verified payment and protected rates; reject stale or forged claims.
function getVerifiedTokenGrant(request, verifiedHkdAmount, settings) {
  const isPromo = request.proofMode === "promo";
  const pricingAmount = isPromo ? request.hkdAmount : verifiedHkdAmount;
  if (isPromo ? (!request.promoCode?.trim() || verifiedHkdAmount !== 0)
    : (request.proofMode !== "storage" || !request.proofUrl || request.hkdAmount !== verifiedHkdAmount)) {
    throw new Error("實際入帳金額與申請不符，或缺少付款證明。請拒絕此申請並要求重新提交。");
  }
  const savedPackages = settings ? normalizeTokenPackages(settings.packages) : TOKEN_PACKAGES;
  const packages = settings && Number(settings.rateVersion || 1) < TOKEN_PACKAGE_RATE_VERSION
    ? savedPackages.map((item) => ({ ...item, tokens: Math.max(1, Math.round(item.tokens / 2)) }))
    : savedPackages;
  const grant = request.packageType === "custom"
    ? calculateTokenAmount(pricingAmount)
    : request.packageType === "preset"
      ? packages.find((item) => item.hkd === pricingAmount && item.tokens === request.amount)?.tokens
      : 0;
  if (!Number.isSafeInteger(grant) || grant < 1 || grant > 1000000
    || grant !== request.amount || request.exchangeRate !== grant / pricingAmount) {
    throw new Error("申請代幣數量不符合目前套餐價格。請拒絕此申請並要求重新提交。");
  }
  return grant;
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

  return Math.floor(amount * (1 + bonusRate));
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
  if (record.cardConversionValue !== undefined && record.cardConversionValue !== null) {
    return Math.max(0, Math.floor(Number(record.cardConversionValue || 0)));
  }
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

function isRoundBuyingBlocked(room, roundId = toRoundId(getRoomCurrentRound(room))) {
  if (!room) return false;
  const blockedRounds = Array.isArray(room.buyingBlockedRounds)
    ? room.buyingBlockedRounds.map((item) => String(item || ""))
    : [];
  return blockedRounds.includes(roundId) || room.buyingBlockedRound === roundId;
}

function getRoundDisplayStatus(room, roundId) {
  const roundNumber = getRoundSortValue(roundId);
  const currentRoundNumber = getRoomCurrentRound(room);
  if (room?.status === "completed" || roundNumber < currentRoundNumber) {
    return { key: "completed", label: "已結束" };
  }
  if (room?.status !== "live" || roundNumber > currentRoundNumber) {
    return { key: "upcoming", label: "即將開" };
  }
  return { key: "live", label: "直播中" };
}

function getRoomRoundOptions(room) {
  return Array.from({ length: getRoomRoundCount(room) }, (_, index) => toRoundId(index + 1));
}

// Group scheduled rounds by local calendar date for both the overview and detailed number view.
function getRoundsByDate(room, roundOptions) {
  return roundOptions.reduce((groups, roundId) => {
    const schedule = getRoundSchedule(room, roundId);
    const key = schedule instanceof Date
      ? `${schedule.getFullYear()}-${String(schedule.getMonth() + 1).padStart(2, "0")}-${String(schedule.getDate()).padStart(2, "0")}`
      : "unscheduled";
    const label = schedule instanceof Date
      ? new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", weekday: "short" }).format(schedule)
      : "日期待定";
    const fullLabel = schedule instanceof Date
      ? `${new Intl.DateTimeFormat("zh-HK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(schedule)} 抽卡場次`
      : "日期待定 · 抽卡場次";
    const existing = groups.find((group) => group.key === key);

    if (existing) existing.rounds.push(roundId);
    else groups.push({ key, label, fullLabel, rounds: [roundId] });
    return groups;
  }, []);
}

function formatRoundLabel(round) {
  return `第 ${getRoundSortValue(round) || 1} 場`;
}

function getRoundSchedule(room, roundId) {
  const value = room?.roundSchedules?.[roundId];
  if (!value) return "時間待定";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待定";
  return date;
}

function formatRoundSchedule(room, roundId) {
  const date = getRoundSchedule(room, roundId);
  if (typeof date === "string") return date;
  return new Intl.DateTimeFormat("zh-HK", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getBetaCollectionStatusLabel(status) {
  return {
    pending: "待處理",
    shipping: "配送中",
    shipped: "已配送",
    converted: "已轉換代幣",
  }[status] || "待處理";
}

function getBetaCollectionRecordStatus(record) {
  if (record?.convertedToTokens || record?.collectionStatus === "converted") return "converted";
  if (record?.collectionStatus === "shipped") return "shipped";
  if (record?.collectionStatus === "shipping") return "shipping";
  return "pending";
}

function getResultSideLabel(resultSide) {
  if (resultSide === "hell") return "地獄";
  if (resultSide === "heaven") return "天堂";
  return "未設定";
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

function normalizePhoneNumber(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  const normalized = compact.startsWith("+")
    ? `+${compact.slice(1).replace(/\D/g, "")}`
    : `+852${compact.replace(/\D/g, "")}`;

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("請輸入有效手機號碼，例如 +852 9123 4567。");
  }

  return normalized;
}

function getPhoneAuthErrorMessage(error) {
  const messages = {
    "auth/invalid-phone-number": "手機號碼格式不正確，請連同國家／地區號碼輸入。",
    "auth/invalid-verification-code": "驗證碼不正確，請重新輸入。",
    "auth/code-expired": "驗證碼已過期，請重新發送。",
    "auth/too-many-requests": "嘗試次數過多，請稍後再試。",
    "auth/quota-exceeded": "今日 SMS 驗證配額已用完，請使用 Google 登入或稍後再試。",
    "auth/operation-not-allowed": "手機登入尚未啟用，請聯絡管理員。",
    "auth/captcha-check-failed": "安全驗證失敗，請重新整理後再試。",
    "auth/missing-phone-number": "請輸入手機號碼。",
  };

  return messages[error?.code] || getSafeErrorMessage(error, "手機登入失敗，請稍後再試。");
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

function getRoundScheduleDrafts(room) {
  return Object.fromEntries(
    Object.entries(room?.roundSchedules || {}).map(([roundId, value]) => {
      const date = value instanceof Timestamp ? value.toDate() : new Date(value);
      if (Number.isNaN(date.getTime())) return [roundId, ""];
      const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
      return [roundId, localDate.toISOString().slice(0, 16)];
    }),
  );
}

async function uploadCompressedImage(file, path) {
  const dataUrl = await imageFileToCompressedDataUrl(file, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.76,
    minQuality: 0.62,
    targetBytes: 420 * 1024,
  });
  const imageBlob = await fetch(dataUrl).then((response) => response.blob());
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, imageBlob, { contentType: "image/webp" });
  return getDownloadURL(imageRef);
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

// Token balances are shown as whole units while the stored ledger value remains unchanged.
function roundTokenBalance(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function formatTokenBalance(value) {
  return formatTokenNumber(roundTokenBalance(value));
}

export default App;
