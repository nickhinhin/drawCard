import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BadgeDollarSign,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Clock3,
  Copy,
  Crown,
  Download,
  FileText,
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
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getAdditionalUserInfo,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithPhoneNumber,
  signInWithRedirect,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  FieldValue,
  Timestamp,
  collection,
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { IS_ADMIN_SITE, IS_BETA } from "./appVariant.js";
import { reportClientError } from "./errorReporting.js";
import { auth, db, functions, googleProvider } from "./firebase";

const PENDING_AFFILIATE_CODE_KEY = "livedraw-pending-affiliate-code";
const PENDING_REGISTRATION_KEY = "livedraw-pending-registration";
const PHONE_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

// Phone accounts sign in with phone + password after the first SMS verification.
// Firebase has no phone+password provider, so the password is linked to an
// internal login name derived from the verified phone number; no email is ever sent.
function phoneLoginEmail(phoneNumber) {
  return `${String(phoneNumber || "").replace(/\D/g, "")}@phone.livedraw-7e3c2.firebaseapp.com`;
}

// Phone accounts sign in with a synthetic email; never show it as a real address.
function displayEmail(email) {
  return /@phone\.livedraw-7e3c2\.firebaseapp\.com$/i.test(String(email || "")) ? "" : String(email || "");
}

function isPhoneAccount(user) {
  return Boolean(user?.phoneNumber) && (user.providerData || []).some((item) => item.providerId === "phone");
}

function hasPhonePassword(user) {
  return (user?.providerData || []).some((item) => item.providerId === "password");
}

function getPasswordAuthErrorMessage(error) {
  const code = String(error?.code || "");
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code)) {
    return "手機號碼或密碼不正確。如果未設定密碼或者忘記密碼，請撳「忘記密碼？」用 SMS 驗證碼重設。";
  }
  if (code === "auth/too-many-requests") return "嘗試次數過多，請稍後再試，或撳「忘記密碼？」重設密碼。";
  if (code === "auth/password-does-not-meet-requirements" || code === "auth/weak-password") {
    return "密碼最少 8 個字，並要包括英文字母同數字。";
  }
  if (code === "auth/requires-recent-login") return "為保安理由，請登出後用 SMS 驗證碼重新登入，再設定密碼。";
  return getSafeErrorMessage(error, "密碼登入失敗，請再試一次。");
}
const AFFILIATE_CODE_PATTERN = /^AFF[A-F0-9]{20}$/;

function normalizeAffiliateCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return AFFILIATE_CODE_PATTERN.test(code) ? code : "";
}

function captureAffiliateCode() {
  const code = normalizeAffiliateCode(new URLSearchParams(window.location.search).get("ref"));
  if (code) window.localStorage.setItem(PENDING_AFFILIATE_CODE_KEY, code);
  return code || normalizeAffiliateCode(window.localStorage.getItem(PENDING_AFFILIATE_CODE_KEY));
}

function readPendingRegistration() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PENDING_REGISTRATION_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

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

// Small preview used in lists, the marquee, slots and purchase records.
const CARD_THUMB_COMPRESSION = {
  maxWidth: 240,
  maxHeight: 330,
  quality: 0.7,
  minQuality: 0.55,
  targetBytes: 28 * 1024,
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
  awaiting_upload: "上傳付款證明中",
  scheduled: "直播預告",
  live: "直播中",
  completed: "已結束",
  assigned: "已完成",
  draft: "即將開播",
  shipping: "配送中",
  shipped: "已配送",
};

const ROUND_BUY_LOCKED_LABEL = "本場已停止購買";
const collectionStatuses = ["pending", "shipping", "shipped"];
const betaCollectionStatuses = ["pending", "shipping", "shipped", "converted"];
const CONVERSION_RATE = 0.8;
const CHAT_COOLDOWN_MS = 3000;
const MY_RECORDS_PAGE_SIZE = 6;
const MY_COLLECTION_PAGE_SIZE = 12;
const PLAYER_CARD_BATCH_SIZE = 40;
const ADMIN_CARD_BATCH_SIZE = 80;
const FIRESTORE_SAFE_BATCH_SIZE = 400;
const TOKEN_REQUEST_COOLDOWN_MS = 60 * 1000;
const TOKEN_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOKEN_REQUEST_DAILY_LIMIT = 5;
const TOKEN_REQUEST_PENDING_LIMIT = 2;
const SHIPPING_REGIONS = [
  { id: "hong-kong", label: "香港", sfAvailable: true },
  { id: "macau", label: "澳門", sfAvailable: false },
  { id: "mainland-china", label: "中國內地", sfAvailable: false },
  { id: "taiwan", label: "台灣", sfAvailable: false },
];

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
const DEFAULT_CARD_MARGIN_RATE = 1.2;

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

function normalizeManualCardPrices(prices) {
  const normalized = Object.fromEntries(
    ["half", "fifth", "tenth"].map((key) => {
      const value = Number(prices?.[key]);
      // Token prices are whole numbers so balances never carry fractions.
      return [key, Number.isFinite(value) ? Math.round(value) : 0];
    }),
  );
  return Object.values(normalized).every((value) => value > 0) ? normalized : null;
}

// Prices are derived from the selected heaven/hell pair and one global margin multiplier.
function calculateAutomaticCardPrices(heavenConversionValue, hellConversionValue, marginRate = DEFAULT_CARD_MARGIN_RATE) {
  const heaven = Number(heavenConversionValue);
  const hell = Number(hellConversionValue);
  const margin = Number(marginRate);
  if (![heaven, hell, margin].every(Number.isFinite) || heaven < 0 || hell < 0 || margin <= 0) return null;

  // Whole-token prices, at least 1 token per share.
  const roundPrice = (value) => Math.max(1, Math.round(value));
  return {
    half: roundPrice((heaven * 0.5 + hell * 0.5) * margin),
    fifth: roundPrice((heaven * 0.2 + hell * 0.8) * margin),
    tenth: roundPrice((heaven * 0.1 + hell * 0.9) * margin),
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
const MIN_CUSTOM_PAYMENT_HKD = 100;
const CUSTOM_PAYMENT_BONUS_THRESHOLD_HKD = 500;
const DEFAULT_HOMEPAGE_BANNER_URL = "/default-live-banner.webp";
const MAX_BANNER_SLIDES = 8;
const BANNER_INTERVAL_OPTIONS = [3, 5, 7, 10, 15];
const DEFAULT_BANNER_INTERVAL_SECONDS = 5;

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
  { id: "promos", label: "推廣碼", eyebrow: "Promotion codes", icon: Gift },
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

const BETA_BANNER_SECTION = {
  id: "banner",
  label: "Banner 設定",
  eyebrow: "Homepage banner",
  icon: ImagePlus,
};

const BETA_DUMMY_PAYMENT_SETTINGS = {
  fpsIdentifier: "0000000",
  fpsName: "LiveDraw",
  isDummy: true,
};

const PROMO_CODE_PATTERN = /^([A-Z]{1,24})-?([1-9]\d{0,6})$/;

function normalizePromoCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parsePromoCode(value) {
  const code = normalizePromoCode(value);
  const match = code.match(PROMO_CODE_PATTERN);
  if (!match) return null;
  const amount = Number(match[2]);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return null;
  return { code: `${match[1]}-${amount}`, prefix: match[1], amount };
}

function getPromoRedemptionId(code, uid) {
  return `${code}_${uid}`;
}
const EMPTY_PAYMENT_SETTINGS = {
  fpsIdentifier: "",
  fpsName: "",
  isDummy: false,
};
function App() {
  const isBeta = IS_BETA;
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileInitializationError, setProfileInitializationError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const googleSignInPendingRef = useRef(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("draw");
  const [usernameConflict, setUsernameConflict] = useState(false);
  const [hasAdminClaim, setHasAdminClaim] = useState(false);
  const [adminClaimReady, setAdminClaimReady] = useState(false);
  const [signInProvider, setSignInProvider] = useState("");

  useEffect(() => {
    // Preserve the referral before login redirects or in-app navigation can remove it.
    captureAffiliateCode();
  }, []);

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
        setProfileInitializationError("");
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

  // The management workspace stays invisible unless Firebase issued the admin
  // custom claim. The server repeats this verification for every write.
  useEffect(() => {
    let cancelled = false;
    setAdminClaimReady(false);
    if (!authUser) {
      setHasAdminClaim(false);
      return undefined;
    }

    authUser.getIdTokenResult(true)
      .then((token) => {
        if (!cancelled) {
          setHasAdminClaim(token.claims.admin === true);
          setSignInProvider(token.signInProvider || "");
        }
      })
      .catch(() => {
        if (!cancelled) setHasAdminClaim(false);
      })
      .finally(() => {
        if (!cancelled) setAdminClaimReady(true);
      });

    return () => { cancelled = true; };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      setProfileInitializationError("");
      return undefined;
    }

    const profileRef = doc(db, "users", authUser.uid);
    const ensureAffiliateAccount = httpsCallable(functions, "ensureAffiliateAccount", {
      limitedUseAppCheckTokens: true,
    });
    const pendingRegistration = readPendingRegistration();
    let initializationStarted = false;
    const stopProfile = onSnapshot(profileRef, async (snapshot) => {
      if (snapshot.exists()) {
        setProfile({ id: snapshot.id, ...snapshot.data() });
        setProfileInitializationError("");
        window.localStorage.removeItem(PENDING_AFFILIATE_CODE_KEY);
        window.sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
        return;
      }
      if (initializationStarted) return;
      initializationStarted = true;
      try {
        const accountData = {
          referralCode: captureAffiliateCode(),
          displayName: pendingRegistration.displayName || authUser.displayName || "",
          phoneNumber: pendingRegistration.phoneNumber || authUser.phoneNumber || "",
          ageConfirmed: pendingRegistration.ageConfirmed === true,
        };
        // A browser can restore an Auth user before its cached ID token is usable by
        // Functions. Refresh once and retry only authentication failures so account
        // creation does not become stuck on the first page load after sign-in.
        await authUser.getIdToken(true);
        try {
          await ensureAffiliateAccount(accountData);
        } catch (error) {
          if (error?.code !== "functions/unauthenticated") throw error;
          await authUser.getIdToken(true);
          await ensureAffiliateAccount(accountData);
        }
        window.localStorage.removeItem(PENDING_AFFILIATE_CODE_KEY);
        window.sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
      } catch (error) {
        initializationStarted = false;
        setProfileInitializationError(getSafeErrorMessage(error, "未能建立會員帳戶，請重新登入。"));
      }
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

  const signedIn = Boolean(authUser);
  const activeProfile = profile;
  const needsUsername = Boolean(
    authUser && profile && (!profile.username || usernameConflict),
  );
  const [passwordGateDone, setPasswordGateDone] = useState(false);
  useEffect(() => setPasswordGateDone(false), [authUser?.uid]);
  // An SMS code never signs a phone account straight in: after any SMS sign-in the
  // player must set (or reset) a password, and daily logins use phone + password.
  const needsPhonePassword = Boolean(
    authUser && profile && !needsUsername && isPhoneAccount(authUser) && !passwordGateDone
      && (signInProvider === "phone" || !hasPhonePassword(authUser)),
  );
  const isProfileLoading = Boolean(authUser && !profile && !profileInitializationError);

  const tabs = useMemo(
    () => [
      { id: "draw", label: "抽卡", icon: Gavel },
      ...(isBeta
        ? [{ id: "archive", label: "過往直播及賽果", icon: Clock3 }]
        : []),
      { id: "tokens", label: "申請代幣", icon: BadgeDollarSign },
      { id: "history", label: "我的紀錄", icon: ListChecks },
      { id: "collection", label: "我的卡牌", icon: Boxes },
      ...(isBeta && signedIn
        ? [{ id: "account", label: "帳戶", icon: UserRoundPlus }]
        : []),
    ],
    [isBeta, signedIn],
  );

  async function handleLogin() {
    if (googleSignInPendingRef.current) return;

    googleSignInPendingRef.current = true;
    setAuthError("");
    setSigningIn(true);
    // Browsers can hide the popup's closure from the page (COOP), which would
    // leave the button spinning forever; give up waiting after 60 seconds.
    let timedOut = false;
    const popupTimeout = window.setTimeout(() => {
      timedOut = true;
      googleSignInPendingRef.current = false;
      setSigningIn(false);
      setAuthError("Google 登入未完成。請再撳一次登入，或者改用跳轉登入。");
    }, 60000);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
      setAuthDialogOpen(false);
    } catch (error) {
      if (timedOut) return;
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
      window.clearTimeout(popupTimeout);
      if (!timedOut) {
        googleSignInPendingRef.current = false;
        setSigningIn(false);
      }
    }
  }

  async function handleRedirectLogin() {
    setAuthError("");
    setSigningIn(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      setAuthError(getSafeErrorMessage(error, "Google 登入失敗，請再試一次。"));
      setSigningIn(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setHasAdminClaim(false);
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

  function openArchivedRoom(room) {
    window.history.pushState({}, "", makeRoomLink(room.id));
    window.dispatchEvent(new PopStateEvent("popstate"));
    setActiveTab("draw");
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (IS_ADMIN_SITE) {
    return (
      <AdminSite
        adminClaimReady={adminClaimReady}
        authError={authError}
        authReady={authReady}
        authUser={authUser}
        hasAdminClaim={hasAdminClaim}
        isProfileLoading={isProfileLoading}
        needsUsername={needsUsername}
        onGoogleLogin={handleLogin}
        onRedirectLogin={handleRedirectLogin}
        onLogout={handleLogout}
        profile={activeProfile}
        profileInitializationError={profileInitializationError}
        signingIn={signingIn}
        usernameConflict={usernameConflict}
      />
    );
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
              ) : activeTab === "archive" ? (
                <LiveArchivePage onOpenRoom={openArchivedRoom} />
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
        ) : profileInitializationError ? (
          <section className="panel empty-state" role="alert">
            <LogIn size={36} />
            <h1>未能載入會員帳戶</h1>
            <p>{profileInitializationError}</p>
            <div className="action-row">
              <button className="primary-btn" type="button" onClick={() => window.location.reload()}>
                重新載入
              </button>
              <button className="ghost-btn" type="button" onClick={handleLogout}>
                登出
              </button>
            </div>
          </section>
        ) : needsUsername ? (
          <UsernameGate
            authUser={authUser}
            profile={profile}
            conflict={usernameConflict}
          />
        ) : needsPhonePassword ? (
          <PhonePasswordGate
            authUser={authUser}
            resetting={hasPhonePassword(authUser)}
            onDone={() => {
              setSignInProvider("password");
              setPasswordGateDone(true);
            }}
            onLogout={handleLogout}
          />
        ) : (
          <>
            {!isBeta && (
              <AccountPanel authUser={authUser} profile={profile} setActiveTab={setActiveTab} />
            )}
            <section className="workspace">
              {activeTab === "draw" && <DrawCard profile={activeProfile} />}
              {activeTab === "archive" && <LiveArchivePage onOpenRoom={openArchivedRoom} />}
              {activeTab === "tokens" && <TokenRequest profile={activeProfile} />}
              {activeTab === "history" && <MyRecords profile={activeProfile} />}
              {activeTab === "collection" && <CollectionPage profile={activeProfile} />}
              {activeTab === "account" && isBeta && (
                <BetaAccountSettings authUser={authUser} profile={activeProfile} />
              )}
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
          signingIn={signingIn}
        />
      )}
    </div>
  );
}

// Standalone admin workspace served from the admin Hosting site only.
function AdminSite({
  adminClaimReady,
  authError,
  authReady,
  authUser,
  hasAdminClaim,
  isProfileLoading,
  needsUsername,
  onGoogleLogin,
  onLogout,
  onRedirectLogin,
  profile,
  profileInitializationError,
  signingIn,
  usernameConflict,
}) {
  const signedIn = Boolean(authUser);

  let content;
  if (!authReady || (signedIn && !adminClaimReady)) {
    content = <LoadingScreen />;
  } else if (!signedIn) {
    content = (
      <section className="panel empty-state">
        <Shield size={36} />
        <h1>LiveDraw 管理後台</h1>
        <p>請使用管理員 Google 帳戶登入。</p>
        {authError && <p className="error-note" role="alert">{authError}</p>}
        <button className="primary-btn" type="button" onClick={onGoogleLogin} disabled={signingIn}>
          <LogIn size={18} />
          {signingIn ? "登入中..." : "使用 Google 登入"}
        </button>
        <button className="ghost-btn admin-redirect-login" type="button" onClick={onRedirectLogin}>
          登入視窗冇彈出？改用跳轉登入
        </button>
      </section>
    );
  } else if (!hasAdminClaim) {
    content = (
      <section className="panel empty-state" role="alert">
        <Shield size={36} />
        <h1>沒有管理員權限</h1>
        <p>此帳戶未獲管理員權限，請改用管理員帳戶登入。</p>
        <button className="ghost-btn" type="button" onClick={onLogout}>
          <LogOut size={17} />
          登出
        </button>
      </section>
    );
  } else if (isProfileLoading) {
    content = <LoadingScreen />;
  } else if (profileInitializationError) {
    content = (
      <section className="panel empty-state" role="alert">
        <h1>未能載入管理員帳戶</h1>
        <p>{profileInitializationError}</p>
        <button className="primary-btn" type="button" onClick={() => window.location.reload()}>
          重新載入
        </button>
      </section>
    );
  } else if (needsUsername) {
    content = <UsernameGate authUser={authUser} profile={profile} conflict={usernameConflict} />;
  } else {
    content = (
      <section className="workspace">
        <LiveDrawAdminPanel profile={profile} />
      </section>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">
          <img
            className="beta-brand-logo"
            src="/livedraw-logo.svg"
            alt="LiveDraw TCG"
            width="430"
            height="112"
          />
        </span>
        <nav className="nav">
          <span className="nav-item active">
            <Shield size={18} />
            管理後台
          </span>
        </nav>
        <div className="auth-actions">
          {signedIn && (
            <>
              <span className="beta-player-name">
                {profile?.username || authUser?.displayName || "管理員"}
              </span>
              <button className="ghost-btn" type="button" onClick={onLogout} aria-label="登出">
                <LogOut size={17} />
                <span>登出</span>
              </button>
            </>
          )}
        </div>
      </header>
      <main id="top" className="main-grid beta-main-grid">
        {content}
      </main>
    </div>
  );
}

function BetaGuestGate({ activeTab, authError, onLogin }) {
  const labels = {
    archive: "過往直播及賽果",
    tokens: "申請代幣",
    history: "我的紀錄",
    collection: "我的卡牌",
    account: "帳戶設定",
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

function AuthDialog({ authError, isBeta = false, onClose, onGoogleLogin, signingIn }) {
  const [accountAction, setAccountAction] = useState(isBeta ? "" : "login");
  // Phone users sign in with a password. SMS is only for registration and "forgot password".
  const [useSmsLogin, setUseSmsLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [authMethod, setAuthMethod] = useState(isBeta ? "" : "phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [referralCode, setReferralCode] = useState(() => captureAffiliateCode());
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const recaptchaRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null);
  const isRegistration = accountAction === "register";
  const isPasswordReset = !isRegistration && useSmsLogin;

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
      if (isBeta && isRegistration) {
        const manualAffiliateCode = normalizeAffiliateCode(referralCode);
        if (referralCode.trim() && !manualAffiliateCode) {
          throw new Error("Affiliate 推薦碼格式不正確，請使用推薦連結內的完整代碼。");
        }
        if (manualAffiliateCode) window.localStorage.setItem(PENDING_AFFILIATE_CODE_KEY, manualAffiliateCode);
        window.sessionStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify({
          displayName: displayName.trim().slice(0, 80),
          phoneNumber: normalizePhoneNumber(phoneNumber),
          ageConfirmed: true,
        }));
      }
      const credential = await confirmation.confirm(verificationCode.trim());
      // "Forgot password" must not register a new account behind the registration form.
      if (isPasswordReset && getAdditionalUserInfo(credential)?.isNewUser) {
        await credential.user.delete().catch(() => signOut(auth));
        setConfirmation(null);
        throw new Error("呢個手機號碼未註冊，請返回選擇「註冊」。");
      }
      if (isBeta && isRegistration) {
        const username = normalizeUsername(displayName);
        // The phone sign-in credential is new; wait for its ID token before account bootstrap.
        await credential.user.getIdToken();
        await httpsCallable(functions, "ensureAffiliateAccount", {
          limitedUseAppCheckTokens: true,
        })({
          referralCode: captureAffiliateCode(),
          displayName: displayName.trim().slice(0, 80),
          phoneNumber: credential.user.phoneNumber || normalizePhoneNumber(phoneNumber),
          ageConfirmed: true,
        });
        window.localStorage.removeItem(PENDING_AFFILIATE_CODE_KEY);
        window.sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
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

  async function signInWithPhonePassword(event) {
    event.preventDefault();
    setPhoneError("");
    setPhoneBusy(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, phoneLoginEmail(normalizePhoneNumber(phoneNumber)), password);
      onClose();
    } catch (error) {
      setPhoneError(error?.code ? getPasswordAuthErrorMessage(error) : getPhoneAuthErrorMessage(error));
    } finally {
      setPhoneBusy(false);
    }
  }

  // "Forgot password" verifies the phone by SMS, then a new password is mandatory.
  function switchToSms() {
    setPhoneError("");
    setUseSmsLogin(true);
  }

  function goBack() {
    setPhoneError("");
    if (useSmsLogin && !confirmation && !isRegistration) {
      setUseSmsLogin(false);
      return;
    }
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
                <span><strong>手機號碼</strong><small>{isRegistration ? "使用 SMS 驗證碼註冊" : "手機號碼 + 密碼"}</small></span>
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
          </>
        ) : (
          <>

            <h2 id="auth-dialog-title">{isBeta ? (isPasswordReset ? "忘記密碼" : `手機號碼${isRegistration ? "註冊" : "登入"}`) : "登入 / 註冊"}</h2>
            <p className="muted">
              {confirmation
                ? "輸入已發送到你手機的 6 位數字驗證碼。"
                : isBeta && !isRegistration && !useSmsLogin
                  ? "輸入手機號碼同密碼登入。"
                  : isPasswordReset
                    ? "輸入已註冊嘅手機號碼，驗證之後需要設定新密碼。未設定過密碼嘅舊帳戶都用呢度設定。"
                    : isBeta ? "輸入手機號碼以接收一次性驗證碼。" : "使用手機號碼接收一次性驗證碼，或使用 Google 帳戶繼續。"}
            </p>

            {isBeta && !isRegistration && !useSmsLogin && !confirmation ? (
              <form className="stack-form" onSubmit={signInWithPhonePassword}>
                <label>
                  手機號碼
                  <input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="例如 +852 9123 4567" required />
                </label>
                <label>
                  密碼
                  <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </label>
                <div className="auth-options">
                  <label className="check-option">
                    <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                    <span>記住我</span>
                  </label>
                </div>
                <button className="primary-btn" type="submit" disabled={phoneBusy}>
                  <LogIn size={18} />
                  {phoneBusy ? "登入中..." : "登入"}
                </button>
                <div className="auth-sms-links">
                  <button className="auth-forgot-link" type="button" onClick={switchToSms}>忘記密碼？／未設定密碼</button>
                </div>
              </form>
            ) : !confirmation ? (
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
                  {phoneBusy ? "驗證中..." : isPasswordReset ? "確認並設定新密碼" : `確認並${isRegistration ? "註冊" : "登入"}`}
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

// Keeps the editable player name available in the beta layout without rewriting any historical snapshots.
// Shown after an SMS sign-in until the phone account has a password (or when resetting it).
function PhonePasswordGate({ authUser, resetting, onDone, onLogout }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function savePassword(event) {
    event.preventDefault();
    setError("");
    if (!PHONE_PASSWORD_PATTERN.test(password)) {
      setError("密碼最少 8 個字，並要包括英文字母同數字。");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入嘅密碼唔一樣。");
      return;
    }
    setBusy(true);
    try {
      const email = phoneLoginEmail(authUser.phoneNumber);
      if (hasPhonePassword(authUser)) {
        await updatePassword(authUser, password);
      } else {
        await linkWithCredential(authUser, EmailAuthProvider.credential(email, password));
      }
      // Switch this session to a password sign-in so a reload does not ask again.
      await signInWithEmailAndPassword(auth, email, password);
      onDone();
    } catch (saveError) {
      setError(getPasswordAuthErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel username-gate">
      <div className="section-heading">
        <Lock size={24} />
        <div>
          <h1>{resetting ? "重設密碼" : "設定登入密碼"}</h1>
          <p className="muted">
            {resetting
              ? "你用咗 SMS 驗證碼登入，請設定新密碼先可以繼續。之後請用手機號碼同密碼登入。"
              : "設定密碼之後，下次只需要輸入手機號碼同密碼就可以登入，唔使再收驗證碼。"}
          </p>
        </div>
      </div>
      <form className="stack-form" onSubmit={savePassword}>
        <p className="muted">手機號碼：{authUser.phoneNumber}</p>
        <label>
          新密碼
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={64} placeholder="最少 8 個字，包括英文字母同數字" required />
        </label>
        <label>
          再輸入一次新密碼
          <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={64} required />
        </label>
        {error && <p className="error-note">{error}</p>}
        <button className="primary-btn" type="submit" disabled={busy}>
          <Lock size={17} />{busy ? "儲存中..." : "儲存密碼"}
        </button>
        <button className="ghost-btn" type="button" onClick={onLogout}>
          <LogOut size={17} />登出
        </button>
      </form>
    </section>
  );
}

function ChangePhonePasswordForm({ authUser }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!PHONE_PASSWORD_PATTERN.test(password)) {
      setError("新密碼最少 8 個字，並要包括英文字母同數字。");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入嘅新密碼唔一樣。");
      return;
    }
    setBusy(true);
    try {
      const email = phoneLoginEmail(authUser.phoneNumber);
      await reauthenticateWithCredential(authUser, EmailAuthProvider.credential(email, currentPassword));
      await updatePassword(authUser, password);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setMessage("密碼已更新。");
    } catch (changeError) {
      setError(["auth/invalid-credential", "auth/wrong-password"].includes(changeError?.code)
        ? "現有密碼不正確。"
        : getPasswordAuthErrorMessage(changeError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="affiliate-link-card change-password-card">
      <div>
        <strong>更改登入密碼</strong>
        <small>忘記現有密碼？登出後喺登入畫面撳「忘記密碼」，用 SMS 驗證碼重設。</small>
      </div>
      <form className="affiliate-application-form" onSubmit={changePassword}>
        <label>現有密碼<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label>新密碼<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={64} placeholder="最少 8 個字，包括英文字母同數字" required /></label>
        <label>再輸入一次新密碼<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={64} required /></label>
        {error && <p className="error-note">{error}</p>}
        {message && <p className="sf-pickup-selected"><Check size={15} />{message}</p>}
        <button className="primary-btn" type="submit" disabled={busy}>
          <Lock size={17} />{busy ? "更新中..." : "更新密碼"}
        </button>
      </form>
    </section>
  );
}

function BetaAccountSettings({ authUser, profile }) {
  return (
    <section className="panel beta-account-settings">
      <div className="section-heading">
        <UserRoundPlus size={24} />
        <div>
          <p className="eyebrow">Account</p>
          <h1>帳戶設定</h1>
        </div>
      </div>
      <div className="profile-row">
        <span className="avatar-initial">
          {(profile?.username || authUser?.displayName || "P").trim().charAt(0).toUpperCase()}
        </span>
        <div>
          <strong>{profile?.username || "玩家"}</strong>
          <span>{displayEmail(authUser?.email) || authUser?.phoneNumber || ""}</span>
        </div>
      </div>
      <UsernameEditForm authUser={authUser} profile={profile} />
      {isPhoneAccount(authUser) && hasPhonePassword(authUser) && <ChangePhonePasswordForm authUser={authUser} />}
      <AffiliateLinkCard profile={profile} />
    </section>
  );
}

function AffiliateLinkCard({ profile, compact = false }) {
  const [copied, setCopied] = useState(false);
  const [contact, setContact] = useState(profile?.phoneNumber || displayEmail(profile?.email) || "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const code = profile?.affiliateCode || "";
  const status = profile?.affiliateStatus || (code ? "approved" : "none");
  const affiliateUrl = code
    ? `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(code)}`
    : "";

  async function copyAffiliateLink() {
    if (!affiliateUrl) return;
    await navigator.clipboard.writeText(affiliateUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function submitApplication(event) {
    event.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      await httpsCallable(functions, "submitAffiliateApplication", {
        limitedUseAppCheckTokens: true,
      })({ contact: contact.trim(), message: message.trim() });
      setMessage("");
    } catch (error) {
      setFormError(getSafeErrorMessage(error, "未能提交 Affiliate 申請，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={compact ? "affiliate-link-card compact" : "affiliate-link-card"}>
      <div>
        <strong>Affiliate 計劃</strong>
        <small>申請獲管理員批准後，系統先會發出及啟用你的專屬連結。</small>
      </div>
      {status === "approved" && affiliateUrl ? (
        <div className="affiliate-link-row">
          <input value={affiliateUrl} readOnly aria-label="Affiliate link" />
          <button className="small-btn" type="button" onClick={copyAffiliateLink}>
            <Copy size={15} />
            {copied ? "已複製" : "複製"}
          </button>
        </div>
      ) : status === "pending" ? (
        <p className="affiliate-status pending"><Clock3 size={16} />申請審批中，批准後會喺呢度顯示專屬連結。</p>
      ) : (
        <form className="affiliate-application-form" onSubmit={submitApplication}>
          {status === "rejected" && (
            <p className="affiliate-status rejected">
              上次申請未獲批准{profile?.affiliateReviewNote ? `：${profile.affiliateReviewNote}` : "。你可以更新資料後重新申請。"}
            </p>
          )}
          <label>
            聯絡資料
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="電話、WhatsApp、Email 或社交平台"
              minLength={3}
              maxLength={200}
              required
            />
          </label>
          <label>
            留言
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="簡單介紹自己、推廣渠道或合作方式"
              minLength={5}
              maxLength={2000}
              rows={compact ? 3 : 4}
              required
            />
          </label>
          {formError && <p className="error-note">{formError}</p>}
          <button className="primary-btn" type="submit" disabled={submitting}>
            <Send size={16} />
            {submitting ? "提交中…" : status === "rejected" ? "重新申請" : "申請 Affiliate Link"}
          </button>
        </form>
      )}
    </section>
  );
}

function UsernameEditForm({ authUser, profile }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);

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

  return (
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
      <p className="muted username-edit-hint">
        名稱必須獨有；改名不會更改以往抽卡、交易或聊天紀錄內保存的名稱。
      </p>
      <button className="small-btn" type="submit" disabled={savingUsername}>
        <Pencil size={16} />
        {savingUsername ? "儲存中..." : usernameSaved ? "已儲存" : "更改名稱"}
      </button>
    </form>
  );
}

function AccountPanel({ authUser, profile, setActiveTab }) {
  const [recentPicks, setRecentPicks] = useState([]);
  const [recentPicksLoading, setRecentPicksLoading] = useState(true);
  const [roomsById, setRoomsById] = useState({});
  const [accountRoomsLoading, setAccountRoomsLoading] = useState(true);
  const [pickSectionsOpen, setPickSectionsOpen] = useState({
    active: true,
    completed: false,
  });
  const initial = (profile?.username || authUser.displayName || authUser.email || "D")
    .trim()
    .charAt(0)
    .toUpperCase();

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
    const roomsQuery = query(
      collection(db, "draws"),
      where("status", "in", ["scheduled", "live"]),
    );
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
    if (!isRoomPurchasable(room)) return;
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
          <span>{displayEmail(authUser.email) || authUser.phoneNumber}</span>
        </div>
      </div>

      <UsernameEditForm authUser={authUser} profile={profile} />

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
        玩家
      </div>
      <AffiliateLinkCard profile={profile} compact />
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
  return !record.cardId && isRoomPurchasable(room);
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
  const isBeta = IS_BETA;
  const [activeRooms, setActiveRooms] = useState([]);
  const [activeRoomsLoading, setActiveRoomsLoading] = useState(true);
  const [requestedRoom, setRequestedRoom] = useState(null);
  const [requestedRoomLoading, setRequestedRoomLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const shouldLoadPrivateCardData = !IS_BETA || Boolean(profile?.uid);
  const [roomSlug, setRoomSlug] = useState(getRoomSlugFromUrl);
  const topShowcaseCards = useTopShowcaseCards();
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
  const [completedRoundView, setCompletedRoundView] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const pendingRoomRoundRef = useRef("");

  // Only live, scheduled and draft rooms are watched; archived rooms load on demand.
  useEffect(() => {
    const activeQuery = query(
      collection(db, "draws"),
      where("status", "in", ["live", "scheduled", "draft"]),
    );
    return onSnapshot(
      activeQuery,
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        setActiveRooms(snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt)));
        setRoomsError("");
        if (isSnapshotReady(snapshot)) setActiveRoomsLoading(false);
      },
      (error) => {
        console.error("Room list listener failed.", error);
        setRoomsError(getSafeErrorMessage(error, "未能載入房間。"));
        setActiveRoomsLoading(false);
      },
    );
  }, []);

  const requestedRoomIsActive = Boolean(roomSlug && activeRooms.some(
    (room) => room.id === roomSlug || room.slug === roomSlug,
  ));

  // A link to an archived room (e.g. from the archive page) loads just that room.
  useEffect(() => {
    if (!roomSlug || activeRoomsLoading || requestedRoomIsActive) {
      setRequestedRoom(null);
      setRequestedRoomLoading(false);
      return undefined;
    }
    let cancelled = false;
    let stopRoom = () => {};
    setRequestedRoomLoading(true);
    const watchRoom = (roomRef) => {
      stopRoom = onSnapshot(roomRef, (snapshot) => {
        if (cancelled) return;
        setRequestedRoom(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        setRequestedRoomLoading(false);
      }, () => {
        if (!cancelled) setRequestedRoomLoading(false);
      });
    };
    getDoc(doc(db, "draws", roomSlug))
      .then(async (snapshot) => {
        if (cancelled) return;
        if (snapshot.exists()) {
          watchRoom(snapshot.ref);
          return;
        }
        const bySlug = await getDocs(query(collection(db, "draws"), where("slug", "==", roomSlug), limit(1)));
        if (cancelled) return;
        if (bySlug.empty) {
          setRequestedRoom(null);
          setRequestedRoomLoading(false);
        } else {
          watchRoom(bySlug.docs[0].ref);
        }
      })
      .catch(() => {
        if (!cancelled) setRequestedRoomLoading(false);
      });
    return () => {
      cancelled = true;
      stopRoom();
    };
  }, [activeRoomsLoading, requestedRoomIsActive, roomSlug]);

  const rooms = useMemo(
    () => (requestedRoom && !activeRooms.some((room) => room.id === requestedRoom.id)
      ? [...activeRooms, requestedRoom]
      : activeRooms),
    [activeRooms, requestedRoom],
  );
  const roomsLoading = activeRoomsLoading || requestedRoomLoading;

  // Cards are loaded only for the pools of the rooms on screen, plus their hell cards.
  const [hellCardIds, setHellCardIds] = useState([]);
  const roomPoolCardIds = useMemo(() => rooms.flatMap((room) => getRoomPoolIds(room)), [rooms]);
  const { docsById: roomCardsById, loading: cardsLoading } = useDocsByIds(
    shouldLoadPrivateCardData ? "cards" : "publicCardShowcase",
    [...roomPoolCardIds, ...hellCardIds],
  );
  const cardLibrary = useMemo(
    () => Object.values(roomCardsById).filter((card) => !card.archived && card.active !== false),
    [roomCardsById],
  );
  useEffect(() => {
    const nextHellIds = [...new Set(cardLibrary.map((card) => String(card.hellCardId || "")).filter(Boolean))].sort();
    setHellCardIds((current) => (current.join("|") === nextHellIds.join("|") ? current : nextHellIds));
  }, [cardLibrary]);
  const cardCategories = useCardCategories(cardLibrary, shouldLoadPrivateCardData);

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
  const viewingArchivedBetaRoom = Boolean(isBeta && selectedRoom?.status === "completed");
  const selectedRoomDefaultRound = getDefaultRoomRound(selectedRoom);

  const roundOptions = useMemo(() => getRoomRoundOptions(selectedRoom), [selectedRoom]);
  const availableRoomDates = useMemo(
    () => rooms
      .filter((room) => room.status === "live" || room.status === "scheduled")
      .map((room) => {
        const rounds = getRoomRoundOptions(room);
        const firstRoundId = rounds[0];
        const firstDateGroup = getRoundsByDate(room, [firstRoundId])[0];
        return {
          ...firstDateGroup,
          rounds,
          room,
          roomId: room.id,
          firstRoundId,
          schedule: getRoundSchedule(room, firstRoundId),
        };
      })
      .sort((left, right) => {
        if (left.room.status === "live" && right.room.status !== "live") return -1;
        if (right.room.status === "live" && left.room.status !== "live") return 1;
        const leftTime = left.schedule instanceof Date ? left.schedule.getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.schedule instanceof Date ? right.schedule.getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      }),
    [rooms],
  );
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
    const pendingRound = pendingRoomRoundRef.current;
    pendingRoomRoundRef.current = "";
    setSelectedCardId("");
    setSelectedSlotNumber(null);
    setSelectedRound(roundOptions.includes(pendingRound) ? pendingRound : selectedRoomDefaultRound);
    setPurchaseStep(1);
    setCompletedRoundView(false);
    setMobileChatOpen(false);
  }, [roundOptions, selectedRoomDefaultRound, selectedRoomId]);

  useEffect(() => {
    if (!mobileChatOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setMobileChatOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileChatOpen]);

  useEffect(() => {
    setSelectedSlotNumber(null);
  }, [activeRoundId, selectedCardId]);

  useEffect(() => {
    if (!selectedRoom?.id || !activeRoundId || !profile?.uid) {
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
  }, [activeRoundId, profile?.uid, selectedRoom?.id]);

  useEffect(() => {
    if (!selectedSlotNumber) return;
    const latestSlot = slots.find((slot) => slot.number === selectedSlotNumber);
    if (latestSlot && latestSlot.status !== "available" && latestSlot.uid !== profile?.uid) {
      setSelectedSlotNumber(null);
    }
  }, [profile?.uid, selectedSlotNumber, slots]);

  function openPurchaseConfirmation(slot) {
    if (!isRoomPurchasable(selectedRoom)) return;
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
        // Rules require the card library's own name and image on the purchase.
        const cardSnap = await transaction.get(doc(db, "cards", purchase.card.id));
        if (!cardSnap.exists()) throw new Error("此卡牌已下架，請重新選擇。");
        const libraryName = String(cardSnap.data().name || "");
        const libraryImageUrl = String(cardSnap.data().thumbUrl || cardSnap.data().imageUrl || "");
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
          targetCardName: libraryName,
          targetCardImageUrl: libraryImageUrl,
          targetCardValue: tokenCost,
          shareMode: purchase.shareMode,
          round: purchase.roundId,
          updatedAt: serverTimestamp(),
        });
        transaction.set(recordRef, {
          slotId: String(purchase.slot.number),
          uid: profile.uid,
          affiliateReferrerUid: profile.referredByUid || "",
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
          targetCardName: libraryName,
          targetCardImageUrl: libraryImageUrl,
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

  // Every unfinished round in the same live session can be purchased in advance.
  // Keep an already selected card only when that card is also enabled for the new round's odds.
  function selectPurchaseRound(roundId) {
    if (isBeta && getRoundDisplayStatus(selectedRoom, roundId).key === "completed") {
      setSelectedRound(roundId);
      setSelectedSlotNumber(null);
      setCompletedRoundView(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setCompletedRoundView(false);
    const nextRoundCards = buildRoomCards(selectedRoom, cardLibrary, roundId);
    const cardRemainsAvailable = nextRoundCards.some((card) => card.id === selectedCardId);

    setSelectedRound(roundId);
    setSelectedSlotNumber(null);
    if (cardRemainsAvailable) {
      setPurchaseStep(2);
      window.requestAnimationFrame(() => {
        document.getElementById("number-selection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    setSelectedCardId("");
    setPurchaseStep(1);
    window.requestAnimationFrame(() => {
      document.getElementById("card-selection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function selectRoomDate(option) {
    if (option.roomId === selectedRoom.id) {
      selectPurchaseRound(option.firstRoundId);
      return;
    }

    pendingRoomRoundRef.current = option.firstRoundId;
    window.history.pushState({}, "", makeRoomLink(option.roomId));
    setRoomSlug(option.roomId);
    setPurchaseStep(1);
    setCompletedRoundView(false);
    window.setTimeout(() => {
      document.querySelector(".room-round-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
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

  if (isBeta && completedRoundView) {
    return (
      <CompletedRoundResultView
        activeRoundId={activeRoundId}
        loading={slotsLoading}
        onBack={() => {
          setCompletedRoundView(false);
          setSelectedRound(toRoundId(getRoomCurrentRound(selectedRoom)));
          setPurchaseStep(1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onRoundChange={selectPurchaseRound}
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
          cards={topShowcaseCards}
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
      {!isBeta && <button className="small-btn back-link" type="button" onClick={backToRooms}>返回房間列表</button>}
      <div className={`draw-layout purchase-step-${purchaseStep}`}>
        <section className="panel room-stream-panel">
          <div className="section-heading">
            <Gavel size={24} />
            <div>
              <h1>{isBeta ? "直播抽卡大廳" : selectedRoom.title}</h1>
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
            availableRoomDates={availableRoomDates}
            roundOptions={roundOptions}
            onDateChange={selectRoomDate}
            onRoundChange={selectPurchaseRound}
          />
        )}
        {isBeta && purchaseStep === 1 && (
          <DesktopNumberOccupancy
            activeRoundId={activeRoundId}
            draw={selectedRoom}
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
        {selectedRoom.status === "live" && (
          <div
            id="hall-chat"
            className={`hall-chat-anchor ${mobileChatOpen ? "mobile-chat-open" : ""}`}
            role={mobileChatOpen ? "dialog" : undefined}
            aria-modal={mobileChatOpen ? "true" : undefined}
            aria-label={mobileChatOpen ? "大廳聊天室" : undefined}
          >
            <button
              className="mobile-chat-close"
              type="button"
              onClick={() => setMobileChatOpen(false)}
              aria-label="關閉大廳聊天室"
            >
              <X size={20} />
            </button>
            {profile?.uid ? (
              <ChatRoom drawId={selectedRoom.id} profile={profile} />
            ) : (
              <section className="panel chat-panel guest-chat-panel">
              <div className="section-heading compact beta-live-chat-heading">
                <div><span>LIVE CHAT</span><h2>大廳聊天</h2></div>
              </div>
              <p className="muted">登入後即可查看及參與大廳聊天。</p>
              </section>
            )}
          </div>
        )}
      </div>
      {isBeta && (
        <BetaStickyControls
          actionBarVisible={purchaseStep === 1}
          onOpenChat={() => setMobileChatOpen(true)}
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

  useEffect(() => {
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
  }, [profile?.uid]);

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
      <HomepageBanner />
      <BetaPsaCarousel cards={cards} rooms={rooms} onOpenRoom={onOpenRoom} onSelectCard={onSelectCard} />
    </section>
  );
}

function HomepageBanner() {
  const { slides, intervalSeconds } = useHomepageBanner();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);
  const count = slides.length;
  const current = count ? index % count : 0;

  // Auto-advance; restarting the timer after every change keeps manual navigation from being skipped.
  useEffect(() => {
    if (count < 2 || paused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [count, current, paused, intervalSeconds]);

  const go = (step) => setIndex((value) => (value + step + count) % count);

  function handleTouchEnd(event) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null || count < 2) return;
    const deltaX = event.changedTouches[0].clientX - startX;
    if (Math.abs(deltaX) > 40) go(deltaX < 0 ? 1 : -1);
  }

  return (
    <div
      className="banner-slot banner-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="直播預告"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
      onTouchEnd={handleTouchEnd}
    >
      <div className="banner-track" style={{ transform: `translateX(-${current * 100}%)` }}>
        {slides.map((slide, slideIndex) => {
          const isDefault = slide.imageUrl === DEFAULT_HOMEPAGE_BANNER_URL;
          // Only the visible and next slides load right away; the rest load when reached.
          const eager = slideIndex === current || slideIndex === (current + 1) % count;
          return (
            <img
              key={slide.id}
              src={slide.imageUrl}
              srcSet={isDefault ? "/default-live-banner-800.webp 800w, /default-live-banner.webp 1600w" : undefined}
              sizes="(max-width: 860px) 100vw, 1200px"
              width="1600"
              height="529"
              loading={eager ? "eager" : "lazy"}
              fetchPriority={slideIndex === 0 ? "high" : "low"}
              decoding="async"
              alt={count > 1 ? `LiveDraw TCG 直播預告 ${slideIndex + 1}／${count}` : "LiveDraw TCG 直播預告"}
              aria-hidden={slideIndex !== current}
            />
          );
        })}
      </div>
      {count > 1 && (
        <>
          <button className="banner-arrow prev" type="button" onClick={() => go(-1)} aria-label="上一張">
            <ChevronLeft size={22} />
          </button>
          <button className="banner-arrow next" type="button" onClick={() => go(1)} aria-label="下一張">
            <ChevronRight size={22} />
          </button>
          <div className="banner-dots">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                className={slideIndex === current ? "active" : ""}
                onClick={() => setIndex(slideIndex)}
                aria-label={`第 ${slideIndex + 1} 張`}
                aria-current={slideIndex === current}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Keeps completed broadcasts off the draw homepage and exposes them on a dedicated public page.
const ARCHIVE_PAGE_SIZE = 20;

function LiveArchivePage({ onOpenRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(ARCHIVE_PAGE_SIZE);

  // Archived rooms load a page at a time instead of the whole history.
  useEffect(() => {
    const roomsQuery = query(
      collection(db, "draws"),
      where("status", "==", "completed"),
      orderBy("createdAt", "desc"),
      limit(pageSize),
    );
    return onSnapshot(roomsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setError("");
      if (isSnapshotReady(snapshot)) setLoading(false);
    }, (snapshotError) => {
      console.error("Archive room listener failed.", snapshotError);
      setError(getSafeErrorMessage(snapshotError, "未能載入過往直播及賽果。"));
      setLoading(false);
    });
  }, [pageSize]);

  if (loading) return <InlineLoading label="正在載入過往直播及賽果..." />;

  if (error) {
    return (
      <section className="panel empty-state">
        <Clock3 size={36} />
        <h1>過往直播及賽果</h1>
        <p className="muted">{error}</p>
      </section>
    );
  }

  if (!rooms.length) {
    return (
      <section className="panel empty-state">
        <Clock3 size={36} />
        <h1>過往直播及賽果</h1>
        <p className="muted">暫時未有已封存直播。</p>
      </section>
    );
  }

  return (
    <div className="live-archive-page">
      <LiveArchiveList rooms={rooms} onOpenRoom={onOpenRoom} />
      {rooms.length >= pageSize && (
        <button
          className="ghost-btn live-archive-more"
          type="button"
          onClick={() => setPageSize((current) => current + ARCHIVE_PAGE_SIZE)}
        >
          載入更多過往直播
        </button>
      )}
    </div>
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
        <span>顯示 {rooms.length} 個已封存直播</span>
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
            const ownerLabel = mine ? "我的號碼" : occupied ? slot.username || "已選" : "未選";
            const savedResultSide = room.roundResultSides?.[activeRoundId]?.[String(slot.number)];
            const resultSide = occupied && ["heaven", "hell"].includes(savedResultSide)
              ? savedResultSide
              : "";
            return (
              <div
                aria-label={`號碼 ${slot.number}，${mine ? "我的號碼" : occupied ? slot.username || "已選" : "未選"}${resultSide ? `，${getResultSideLabel(resultSide)}` : ""}`}
                className={[mine ? "mine" : occupied ? "occupied" : "", resultSide ? `result-${resultSide}` : ""].filter(Boolean).join(" ")}
                key={slot.id}
              >
                <strong className={resultSide ? `archive-slot-outcome ${resultSide}` : ""}>
                  {resultSide && <i aria-hidden="true" />}
                  {resultSide ? getResultSideLabel(resultSide) : slot.number}
                </strong>
                <small>{resultSide ? `#${slot.number} · ${ownerLabel}` : ownerLabel}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Opens a finished round from the live schedule as a focused, read-only result page.
function CompletedRoundResultView({ activeRoundId, loading, onBack, onRoundChange, profile, room, roundOptions, slots }) {
  const occupiedCount = slots.filter((slot) => slot.status !== "available").length;

  return (
    <div className="archived-live-page completed-round-result-page">
      <button className="small-btn back-link" type="button" onClick={onBack}>
        <ChevronLeft size={17} />返回直播抽卡
      </button>
      <section className="panel archived-live-header">
        <div>
          <p className="eyebrow">已完成場次</p>
          <h1>{room.title || "直播抽卡"} · {formatRoundLabel(activeRoundId)}</h1>
          <span>賽果、天堂／地獄及所有已選號碼均為唯讀。</span>
        </div>
        <b>賽果</b>
      </section>
      <RoomRoundOverview
        draw={room}
        activeRoundId={activeRoundId}
        roundOptions={roundOptions}
        onRoundChange={onRoundChange}
      />
      <section className="panel archived-number-records" aria-label={`${formatRoundLabel(activeRoundId)}號碼賽果`}>
        <header>
          <div><h2>{formatRoundLabel(activeRoundId)}號碼賽果</h2><span>{occupiedCount} / {slots.length || room.cardCount || 20} 已選</span></div>
          <small>唯讀</small>
        </header>
        <div className="archive-slot-grid">
          {loading ? <InlineLoading label="正在載入號碼賽果..." /> : slots.map((slot) => {
            const occupied = slot.status !== "available";
            const mine = occupied && slot.uid === profile?.uid;
            const ownerLabel = mine ? "我的號碼" : occupied ? slot.username || "已選" : "未選";
            const resultSide = getRoundSlotResultSide(room, activeRoundId, slot);
            return (
              <div
                aria-label={`號碼 ${slot.number}，${ownerLabel}${resultSide ? `，${getResultSideLabel(resultSide)}` : ""}`}
                className={[mine ? "mine" : occupied ? "occupied" : "", resultSide ? `result-${resultSide}` : ""].filter(Boolean).join(" ")}
                key={slot.id}
              >
                <strong className={resultSide ? `archive-slot-outcome ${resultSide}` : ""}>
                  {resultSide && <i aria-hidden="true" />}
                  {resultSide ? getResultSideLabel(resultSide) : slot.number}
                </strong>
                <small>{resultSide ? `#${slot.number} · ${ownerLabel}` : ownerLabel}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function BetaStickyControls({ actionBarVisible = false, onOpenChat, onOpenNumbers, profile }) {
  function openRecords() {
    if (!profile?.uid) {
      alert("登入後即可查看我的紀錄。");
      return;
    }
    window.dispatchEvent(new CustomEvent("beta-open-room-records"));
  }

  return (
    <>
      <nav className={`beta-desktop-sticky-controls${actionBarVisible ? " action-bar-visible" : ""}`} aria-label="桌面直播快捷功能">
        <button className="support" type="button" onClick={() => window.dispatchEvent(new CustomEvent("beta-open-support"))}>
          <Headphones size={17} /><span>聯絡客服</span>
        </button>
        <button className="records" type="button" onClick={openRecords}>
          <ListChecks size={17} /><span>我的紀錄</span>
        </button>
      </nav>
      <nav className={`beta-mobile-sticky-controls${actionBarVisible ? " action-bar-visible" : ""}`} aria-label="直播快捷功能">
      <button className="support" type="button" onClick={() => window.dispatchEvent(new CustomEvent("beta-open-support"))}>
        <Headphones size={15} /><span>聯絡客服</span>
      </button>
      <button className="numbers" type="button" onClick={onOpenNumbers}>
        <Hash size={15} /><span>號碼使用情況</span>
      </button>
      <button className="chat" type="button" onClick={onOpenChat}>
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
function DesktopNumberOccupancy({ activeRoundId, draw, loading, profile, slots }) {
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
          const resultSide = getRoundSlotResultSide(draw, activeRoundId, slot);
          const ownerLabel = mine ? "我的號碼" : occupied ? slot.username || "已選" : "未選";
          return (
            <button
              aria-label={`號碼 ${slot.number}，${ownerLabel}${resultSide ? `，${getResultSideLabel(resultSide)}` : ""}`}
              className={[mine ? "mine" : occupied ? "occupied" : "", resultSide ? `result-${resultSide}` : ""].filter(Boolean).join(" ")}
              disabled
              key={slot.id}
              type="button"
            >
              {resultSide
                ? <strong className={`number-slot-outcome ${resultSide}`}><i aria-hidden="true" />{getResultSideLabel(resultSide)}</strong>
                : occupied && !mine
                ? <X className="number-taken-cross" aria-hidden="true" />
                : <strong>{slot.number}</strong>}
              <small>{resultSide ? `#${slot.number} · ${ownerLabel}` : ownerLabel}</small>
            </button>
          );
        })}
      </div>
      <div className="desktop-number-legend">
        <span><i />未選</span>
        <span><i className="taken" aria-hidden="true" />已被選</span>
        <span><i />我的號碼</span>
        <span><i className="heaven" aria-hidden="true" />天堂</span>
        <span><i className="hell" aria-hidden="true" />地獄</span>
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
  }, [open, profile.uid]);

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
                  <img src={getCardThumbUrl(card)} alt={card.name} loading="lazy" decoding="async" width="240" height="330" />
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
  const isBeta = IS_BETA;
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
        <p className="muted">管理員可於獨立管理 App 建立新的抽卡房間。</p>
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
      <HomepageBanner />
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
  const [cardSearch, setCardSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(PLAYER_CARD_BATCH_SIZE);
  const cardGridRef = useRef(null);
  const categories = useMemo(
    () => getCardCategories(cards, cardCategories),
    [cardCategories, cards],
  );
  const filteredCards = useMemo(
    () =>
      cards
        .filter((card) => categoryFilter === "全部" || getCardCategory(card) === categoryFilter)
        .filter((card) => {
          const keyword = cardSearch.trim().toLocaleLowerCase("zh-HK");
          if (!keyword) return true;
          return String(card.name || "").toLocaleLowerCase("zh-HK").includes(keyword)
            || getCardCategory(card).toLocaleLowerCase("zh-HK").includes(keyword)
            || String(card.tokenValue || "").includes(keyword);
        })
        .sort((a, b) =>
          priceSort === "high"
            ? Number(b.tokenValue || 0) - Number(a.tokenValue || 0)
            : Number(a.tokenValue || 0) - Number(b.tokenValue || 0),
        ),
    [cardSearch, cards, categoryFilter, priceSort],
  );
  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleLimit),
    [filteredCards, visibleLimit],
  );

  useEffect(() => {
    setVisibleLimit(PLAYER_CARD_BATCH_SIZE);
    cardGridRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, [cardSearch, categoryFilter, priceSort]);

  return (
    <section id="card-selection" className="panel card-pool-preview">
      <div>
        <p className="eyebrow">第一步</p>
        <h2>選擇卡牌（保底隨機PSA10卡）</h2>
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
          <div className="card-search player-card-search">
            <Search size={17} />
            <input
              value={cardSearch}
              onChange={(event) => setCardSearch(event.target.value)}
              placeholder="搜尋卡名、分類或代幣"
              type="search"
            />
            <span>{visibleCards.length} / {filteredCards.length}</span>
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
          {!filteredCards.length && (
            <p className="form-note">沒有符合搜尋條件的卡牌。</p>
          )}
          {visibleCards.length < filteredCards.length && (
            <button
              className="small-btn player-card-load-more"
              type="button"
              onClick={() => setVisibleLimit((current) => current + PLAYER_CARD_BATCH_SIZE)}
            >
              顯示更多（尚有 {filteredCards.length - visibleCards.length} 張）
            </button>
          )}
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
function RoomRoundOverview({
  draw,
  activeRoundId,
  availableRoomDates = [],
  roundOptions,
  onDateChange,
  onRoundChange,
}) {
  const groups = getRoundsByDate(draw, roundOptions);
  const dateOptions = availableRoomDates.length
    ? availableRoomDates
    : groups.map((group) => ({
      ...group,
      room: draw,
      roomId: draw.id,
      firstRoundId: group.rounds[0],
    }));
  const activeGroup = dateOptions.find(
    (option) => option.roomId === draw.id && option.rounds.includes(activeRoundId),
  ) || dateOptions.find((option) => option.roomId === draw.id) || dateOptions[0];
  const activeRoundStatus = getRoundDisplayStatus(draw, activeRoundId);
  const activeResultImage = draw.roundResultImages?.[activeRoundId] || "";

  return (
    <section className="room-round-overview" aria-label="抽卡場次">
      <div className="room-round-date-navigation">
        <div className="room-round-date-tabs" aria-label="選擇直播日期">
          {dateOptions.map((option) => {
            const groupStatuses = option.rounds.map((roundId) => getRoundDisplayStatus(option.room, roundId));
            const dateStatusLabel = groupStatuses.some((status) => status.key === "live")
              ? "直播中"
              : groupStatuses.every((status) => status.key === "completed")
                ? "已結束"
                : "直播預告";
            return (
            <button
              aria-label={`${option.fullLabel}，${dateStatusLabel}`}
              className={option.roomId === draw.id && option.key === activeGroup?.key ? "active" : ""}
              key={`${option.roomId}-${option.key}`}
              type="button"
              onClick={() => onDateChange ? onDateChange(option) : onRoundChange(option.firstRoundId)}
            >
              <span>{option.fullLabel}</span>
              <small>{dateStatusLabel}</small>
            </button>
            );
          })}
        </div>
      </div>
      <div className="room-round-card-strip">
        {(activeGroup?.rounds || roundOptions).map((roundId) => {
          const roundStatus = getRoundDisplayStatus(draw, roundId);
          return (
            <button
              aria-label={`${roundStatus.label} ${formatRoundLabel(roundId)}${roundStatus.key === "completed" ? "，查看賽果" : ""}`}
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
      {(activeResultImage || activeRoundStatus.key === "completed") && (
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
  const isBeta = IS_BETA;

  if (!isRoomPurchasable(draw)) {
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
          const resultSide = getRoundSlotResultSide(draw, activeRoundId, slot);
          const ownerLabel = mine ? "你的號碼" : locked ? slot.username || "已被選走" : "";
          return (
            <button
              aria-label={`號碼 ${slot.number}${ownerLabel ? `，${ownerLabel}` : ""}${resultSide ? `，${getResultSideLabel(resultSide)}` : ""}`}
              className={`${
                mine
                  ? "slot mine"
                  : locked
                    ? "slot locked"
                    : selected
                      ? "slot selected"
                      : "slot"
              }${resultSide ? ` result-${resultSide}` : ""}`}
              disabled={!roundIsPurchasable || buyingBlocked || !selectedCard || locked || buyingNumber === slot.number}
              key={slot.id}
              type="button"
              onClick={() => onSelectNumber(slot.number)}
            >
              {resultSide
                ? <strong className={`number-slot-outcome ${resultSide}`}><i aria-hidden="true" />{getResultSideLabel(resultSide)}</strong>
                : locked && !mine
                ? <X className="number-taken-cross" aria-hidden="true" />
                : <strong>{slot.number}</strong>}
              <small>
                {resultSide
                  ? `#${slot.number} · ${ownerLabel}`
                  : mine
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
        <span><i className="taken" aria-hidden="true" />已被選走</span>
        <span><i />我的號碼</span>
        <span><i className="heaven" aria-hidden="true" />天堂</span>
        <span><i className="hell" aria-hidden="true" />地獄</span>
      </div>
      <div className="number-divider" />
      {roundResultImage && (
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
  const [isCompactPlayer, setIsCompactPlayer] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
  ));
  const [mobilePlaybackUrl, setMobilePlaybackUrl] = useState("");
  const [mobilePlayerFailed, setMobilePlayerFailed] = useState(false);
  const embedUrl = useMemo(() => {
    const playerUrl = toKickEmbedUrl(kickUrl);
    const autoplay = isCompactPlayer ? "false" : "true";
    const muted = isCompactPlayer ? "false" : String(isMuted);
    return playerUrl
      ? `${playerUrl}?autoplay=${autoplay}&muted=${muted}&allowfullscreen=true`
      : "";
  }, [isCompactPlayer, isMuted, kickUrl]);
  const frameWrapRef = useRef(null);
  const playerFrameRef = useRef(null);
  const inlinePlayerSizeRef = useRef(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isMobileFullscreen, setIsMobileFullscreen] = useState(false);
  const [fullscreenScale, setFullscreenScale] = useState(1);
  const isFullscreen = isNativeFullscreen || isMobileFullscreen;

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 760px)");
    function syncPlayerMode(event) {
      setIsCompactPlayer(event.matches);
    }

    compactQuery.addEventListener?.("change", syncPlayerMode);
    return () => compactQuery.removeEventListener?.("change", syncPlayerMode);
  }, []);

  useEffect(() => {
    if (!isCompactPlayer) return undefined;

    const channel = getKickChannel(kickUrl);
    if (!channel) return undefined;
    const controller = new AbortController();
    setMobilePlaybackUrl("");
    setMobilePlayerFailed(false);

    // The mobile player uses Kick's public channel response so iOS can control
    // one native video directly. This avoids reloading a cross-origin iframe
    // when the viewer unmutes or enters fullscreen.
    fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`, {
      credentials: "omit",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Kick channel unavailable");
        return response.json();
      })
      .then((channelData) => {
        if (!channelData?.playback_url) throw new Error("Kick playback unavailable");
        setMobilePlaybackUrl(channelData.playback_url);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMobilePlayerFailed(true);
      });

    return () => controller.abort();
  }, [isCompactPlayer, kickUrl]);

  useEffect(() => {
    function fitExistingPlayerToFullscreen() {
      const size = inlinePlayerSizeRef.current;
      if (!size?.width || !size?.height) return;
      setFullscreenScale(Math.min(window.innerWidth / size.width, window.innerHeight / size.height));
    }

    function syncFullscreenState() {
      const fullscreen = document.fullscreenElement === frameWrapRef.current;
      setIsNativeFullscreen(fullscreen);
      if (fullscreen) {
        window.requestAnimationFrame(fitExistingPlayerToFullscreen);
      } else if (!isMobileFullscreen) {
        setFullscreenScale(1);
      }
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    window.addEventListener("resize", fitExistingPlayerToFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      window.removeEventListener("resize", fitExistingPlayerToFullscreen);
    };
  }, [isMobileFullscreen]);

  useEffect(() => {
    if (!isMobileFullscreen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      const size = inlinePlayerSizeRef.current;
      if (size?.width && size?.height) {
        setFullscreenScale(Math.min(window.innerWidth / size.width, window.innerHeight / size.height));
      }
    });

    function closeOnEscape(event) {
      if (event.key === "Escape") setIsMobileFullscreen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      setFullscreenScale(1);
    };
  }, [isMobileFullscreen]);

  if (!embedUrl) {
    return <div className="stream-fallback">尚未設定有效的 Kick 頻道</div>;
  }

  async function toggleFullscreen() {
    if (isMobileFullscreen) {
      setIsMobileFullscreen(false);
      return;
    }

    if (isNativeFullscreen) {
      try {
        if (document.fullscreenElement) await document.exitFullscreen?.();
      } catch {
        // Fall through to the local state reset below.
      } finally {
        // Some mobile browsers leave fullscreen before updating React. Always
        // let a second tap restore the inline player instead of reopening it.
        setIsNativeFullscreen(false);
        setFullscreenScale(1);
      }
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      } else {
        const playerRect = playerFrameRef.current?.getBoundingClientRect();
        if (playerRect?.width && playerRect?.height) {
          inlinePlayerSizeRef.current = {
            width: playerRect.width,
            height: playerRect.height,
          };
        }
        if (frameWrapRef.current?.requestFullscreen && document.fullscreenEnabled !== false) {
          await frameWrapRef.current.requestFullscreen();
        } else {
          setIsMobileFullscreen(true);
        }
      }
    } catch {
      // iPhone Safari does not support fullscreen on arbitrary elements, so use
      // the same single player in a fixed full-viewport layer instead.
      setIsMobileFullscreen(true);
    }
  }

  function toggleMute() {
    const player = playerFrameRef.current;
    if (isCompactPlayer && player instanceof HTMLVideoElement) {
      const nextMuted = !player.muted;
      player.muted = nextMuted;
      setIsMuted(nextMuted);
      if (player.paused) player.play().catch(() => {});
      return;
    }
    setIsMuted((current) => !current);
  }

  const usesNativeMobilePlayer = isCompactPlayer && !mobilePlayerFailed;

  return (
    <div className={`kick-frame-wrap${isMobileFullscreen ? " is-mobile-fullscreen" : ""}${usesNativeMobilePlayer ? " uses-native-mobile-player" : ""}`} ref={frameWrapRef}>
      {usesNativeMobilePlayer ? (
        mobilePlaybackUrl ? (
          <video
            className="kick-frame"
            ref={playerFrameRef}
            src={mobilePlaybackUrl}
            style={isFullscreen && inlinePlayerSizeRef.current ? {
              width: `${inlinePlayerSizeRef.current.width}px`,
              height: `${inlinePlayerSizeRef.current.height}px`,
              maxWidth: "none",
              maxHeight: "none",
              transform: `scale(${fullscreenScale})`,
            } : undefined}
            title={`${title} Kick stream`}
            autoPlay
            muted={isMuted}
            playsInline
            preload="auto"
            onError={() => setMobilePlayerFailed(true)}
          />
        ) : (
          <div className="stream-fallback">正在載入直播…</div>
        )
      ) : (
        <iframe
          key={embedUrl}
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
          allow="autoplay *; fullscreen *; picture-in-picture *"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          allowFullScreen
        />
      )}
      <button
        className="stream-mute-btn"
        type="button"
        onClick={toggleMute}
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
  const isBeta = IS_BETA;
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
      limitToLast(30),
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
          lastChatMessageId: messageRef.id,
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

// Shows the exact reward card selected by the administrator, with a decorative fallback.
function VipTierArtwork({ tierIndex, imageUrl, rewardName }) {
  const ArtworkIcon = [Gift, Zap, Crown, Shield, Crown][tierIndex % 5] || Crown;

  if (imageUrl) {
    return (
      <div className="vip-tier-reward-image">
        <img src={imageUrl} alt={rewardName || `VIP${tierIndex} 獎勵卡牌`} />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`vip-tier-artwork level-${tierIndex % 5}`}
      data-level={`VIP ${tierIndex}`}
    >
      <i className="vip-art-orbit one" />
      <i className="vip-art-orbit two" />
      <ArtworkIcon size={31} strokeWidth={1.8} />
    </div>
  );
}

function VipProgramPanel({ deposit, profile, rewards = [], tiers }) {
  const vip = getVipState(tiers, deposit);
  const [claimingId, setClaimingId] = useState("");
  const [claimedRewardIds, setClaimedRewardIds] = useState(() => new Set());
  const rewardsByTier = useMemo(
    () => new Map(rewards.map((reward) => [reward.vipTierId, reward])),
    [rewards],
  );

  async function claimReward(reward) {
    if (!reward?.id) return;
    const rewardId = reward.id;
    setClaimingId(rewardId);
    try {
      await runTransaction(db, async (transaction) => {
        const rewardRef = doc(db, "drawRecords", rewardId);
        const rewardSnapshot = await transaction.get(rewardRef);

        // Rewards are issued by the server when an admin approves a deposit.
        if (!rewardSnapshot.exists()) {
          throw new Error("VIP 獎勵需要管理員批准入數後先會發放。");
        }
        const savedReward = rewardSnapshot.data();
        if (savedReward.uid !== profile.uid || savedReward.source !== "vip") {
          throw new Error("VIP 獎勵記錄不正確，請聯絡客服。");
        }
        if (savedReward.cardId || savedReward.vipRewardStatus === "claimed") return;
        if (savedReward.vipRewardStatus !== "claimable" || !savedReward.targetCardId) {
          throw new Error("呢份 VIP 獎勵暫時未能領取。");
        }
        transaction.update(rewardRef, {
          vipRewardStatus: "claimed",
          cardId: savedReward.targetCardId,
          cardName: savedReward.targetCardName || "VIP 升級獎勵",
          cardCategory: "VIP 獎勵",
          cardImageUrl: savedReward.targetCardImageUrl || "",
          cardValue: Number(savedReward.targetCardValue || 0),
          cardConversionValue: Number(savedReward.targetCardValue || 0),
          collectionStatus: "pending",
          claimedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setClaimedRewardIds((current) => new Set([...current, rewardId]));
      alert("VIP 卡牌獎勵已領取，已加入「我的卡牌」。");
    } catch (error) {
      showSafeError(error);
    } finally {
      setClaimingId("");
    }
  }

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
        {vip.tiers.map((tier, index) => {
          const reward = rewardsByTier.get(tier.id);
          const rewardId = reward?.id || `vip_${profile.uid}_${tier.id}`;
          const rewardClaimed = claimedRewardIds.has(rewardId)
            || Boolean(reward?.cardId || reward?.vipRewardStatus === "claimed");
          // Only rewards the server issued after an approved deposit can be claimed.
          const rewardClaimable = Boolean(reward?.vipRewardStatus === "claimable" && !rewardClaimed);
          const tierState = rewardClaimed
            ? "已領取"
            : rewardClaimable
              ? "可領取"
              : tier.done
                ? "等待批准發放"
                : tier.active ? `${Math.round(tier.progress)}%` : "未解鎖";

          return <article
            className={`vip-tier-card ${tier.done ? "done" : ""} ${tier.active ? "active" : ""} ${rewardClaimable ? "claimable" : ""}`}
            key={tier.id}
          >
            <div className="vip-tier-rail">
              <i style={{ width: `${tier.progress}%` }} />
            </div>
            <div className="vip-shield">{index}</div>
            <div className="vip-tier-state">{tierState}</div>
            <div className="vip-tier-detail">
              <VipTierArtwork
                tierIndex={index}
                imageUrl={tier.rewardImageUrl}
                rewardName={tier.rewardName}
              />
              <strong>{tier.name}</strong>
              <b>HK${formatTokenNumber(tier.threshold)}</b>
              <span>{tier.rewardName || "待設定升級獎勵"}</span>
              {rewardClaimable && (
                <button
                  className="vip-claim-btn"
                  type="button"
                  disabled={claimingId === rewardId}
                  onClick={() => claimReward(reward)}
                >
                  <Gift size={14} />{claimingId === rewardId ? "領取中..." : "領取"}
                </button>
              )}
              {rewardClaimed && <small className="vip-claimed-label"><Check size={13} />已加入我的卡牌</small>}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}

function TokenRequest({ profile }) {
  const isBeta = IS_BETA;
  const tokenPackages = useTokenPackages(true);
  const paymentSettings = usePaymentSettings(true);
  const vipTiers = useVipProgram(true);
  const [selectedPackage, setSelectedPackage] = useState(tokenPackages[0].hkd);
  const [customHkd, setCustomHkd] = useState("");
  const [proof, setProof] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [requestMethod, setRequestMethod] = useState("");
  const [fpsIdentifier, setFpsIdentifier] = useState("");
  const [fpsName, setFpsName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [vipRewards, setVipRewards] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const usingCustomAmount = selectedPackage === "custom";
  const hkdAmount = usingCustomAmount ? Number(customHkd || 0) : Number(selectedPackage);
  const tokenAmount = usingCustomAmount
    ? calculateTokenAmount(hkdAmount)
    : tokenPackages.find((item) => item.hkd === hkdAmount)?.tokens || 0;
  const parsedPromoCode = parsePromoCode(promoCode);
  const requestedTokenAmount = requestMethod === "promo" ? (parsedPromoCode?.amount || 0) : tokenAmount;
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
  }, [profile.uid]);

  useEffect(() => {
    const rewardsQuery = query(
      collection(db, "drawRecords"),
      where("uid", "==", profile.uid),
    );
    return onSnapshot(rewardsQuery, LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setVipRewards(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.source === "vip"));
    }, (error) => {
      console.error("VIP reward listener failed.", error);
      setVipRewards([]);
    });
  }, [profile.uid]);

  async function submitRequest(event) {
    event.preventDefault();

    if (!requestMethod) {
      alert("請先選擇付款購買代幣，或推廣活動兌換代幣。");
      return;
    }
    if (requestMethod === "payment" && (!Number.isSafeInteger(hkdAmount) || hkdAmount < MIN_CUSTOM_PAYMENT_HKD || hkdAmount > 1000000 || tokenAmount < 1 || tokenAmount > 1000000)) {
      alert(`請選擇套餐，或輸入最少 HK$${MIN_CUSTOM_PAYMENT_HKD} 的自訂金額。`);
      return;
    }
    const cleanPromoCode = parsedPromoCode?.code || normalizePromoCode(promoCode);
    if (requestMethod === "payment" && !proof) {
      alert("請上傳付款證明供管理員審核。");
      return;
    }
    if (requestMethod === "promo" && !parsedPromoCode) {
      alert("邀請碼格式不正確。請輸入「英文字母-代幣數目」，例如 EVENT-500。");
      return;
    }
    if (requestMethod === "payment" && proof?.size > 2 * 1024 * 1024) {
      alert("付款證明圖片不可超過 2MB。");
      return;
    }
    if (requestMethod === "payment" && proof && !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(proof.type || "")) {
      alert("付款證明必須是 JPEG、PNG 或 WebP 圖片。");
      return;
    }
    const requestFpsIdentifier = requestMethod === "payment"
      ? (isBeta ? paymentSettings.fpsIdentifier : fpsIdentifier.trim())
      : "";
    const requestFpsName = requestMethod === "payment"
      ? (isBeta ? paymentSettings.fpsName : fpsName.trim())
      : "";
    if (requestMethod === "payment" && (!requestFpsIdentifier || !requestFpsName)) {
      alert(isBeta
        ? "平台尚未設定 FPS 收款資料，請聯絡管理員。"
        : "請輸入轉數快識別碼及收款人姓名，方便管理員核對。");
      return;
    }

    const now = Date.now();
    const pendingRequestCount = requests.filter((request) => ["awaiting_upload", "pending"].includes(request.status)).length;
    const recentRequestTimes = requests.map((request) => toMillis(request.createdAt)).filter(Boolean);
    const latestRequestAt = Math.max(0, ...recentRequestTimes);
    const dailyRequestCount = recentRequestTimes.filter((createdAt) => now - createdAt < TOKEN_REQUEST_WINDOW_MS).length;
    if (pendingRequestCount >= TOKEN_REQUEST_PENDING_LIMIT) {
      alert(`最多只可以同時有 ${TOKEN_REQUEST_PENDING_LIMIT} 個待處理代幣申請。`);
      return;
    }
    if (latestRequestAt && now - latestRequestAt < TOKEN_REQUEST_COOLDOWN_MS) {
      alert("每次代幣申請需要相隔最少 1 分鐘。");
      return;
    }
    if (dailyRequestCount >= TOKEN_REQUEST_DAILY_LIMIT) {
      alert("24 小時內最多只可以提交 5 次代幣申請。");
      return;
    }

    setSubmitting(true);
    try {
      const claimedUsername = await ensureUsernameClaim(profile.uid, profile.username);
      const isPaymentRequest = requestMethod === "payment";
      if (isPaymentRequest) {
        // The server stores the proof first and only then creates the pending request.
        await submitTokenPaymentRequest({
          proof,
          hkdAmount,
          amount: tokenAmount,
          packageType: usingCustomAmount ? "custom" : "preset",
          fpsIdentifier: requestFpsIdentifier,
          fpsName: requestFpsName,
        });
        setProof(null);
        setRequestMethod("");
        setFpsIdentifier("");
        setFpsName("");
        setSelectedPackage(tokenPackages[0].hkd);
        setCustomHkd("");
        return;
      }
      const requestRef = doc(collection(db, "tokenRequests"));
      const promoRef = doc(db, "promoCodes", parsedPromoCode.code);
      const promoRedemptionRef = doc(db, "promoRedemptions", getPromoRedemptionId(parsedPromoCode.code, profile.uid));
      const [promoSnapshot, redemptionSnapshot] = await Promise.all([
        getDoc(promoRef),
        getDoc(promoRedemptionRef),
      ]);
      if (!promoSnapshot.exists() || promoSnapshot.data().active !== true
        || promoSnapshot.data().code !== parsedPromoCode.code
        || Number(promoSnapshot.data().amount || 0) !== parsedPromoCode.amount) {
        throw new Error("邀請碼未啟用、已停用或代幣數目不正確。");
      }
      if (redemptionSnapshot.exists()) {
        throw new Error("你已經使用過呢個邀請碼，每位用戶只可以使用一次。");
      }
      const verifiedPromo = promoSnapshot.data();
      const profileWindowStartedAt = toMillis(profile.tokenRequestWindowStartedAt);
      const activeWindow = profileWindowStartedAt > 0 && now - profileWindowStartedAt < TOKEN_REQUEST_WINDOW_MS;
      const batch = writeBatch(db);

      batch.set(requestRef, {
        uid: profile.uid,
        affiliateReferrerUid: profile.referredByUid || "",
        username: claimedUsername,
        email: profile.email || "",
        amount: verifiedPromo.amount,
        hkdAmount: 0,
        exchangeRate: 0,
        packageType: "promo",
        fpsIdentifier: requestFpsIdentifier,
        fpsName: requestFpsName,
        proofMode: "promo",
        proofPath: "",
        proofFileName: "",
        proofUrl: "",
        status: "pending",
        adminNote: "",
        promoCode: cleanPromoCode,
        promoCodeId: parsedPromoCode.code,
        quotaVersion: 1,
        createdAt: serverTimestamp(),
      });
      batch.set(promoRedemptionRef, {
        uid: profile.uid,
        promoCodeId: parsedPromoCode.code,
        code: parsedPromoCode.code,
        amount: verifiedPromo.amount,
        requestId: requestRef.id,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", profile.uid), {
        lastTokenRequestId: requestRef.id,
        lastTokenRequestAt: serverTimestamp(),
        pendingTokenRequestCount: Number(profile.pendingTokenRequestCount || 0) + 1,
        tokenRequestWindowStartedAt: activeWindow ? profile.tokenRequestWindowStartedAt : serverTimestamp(),
        tokenRequestWindowCount: activeWindow ? Number(profile.tokenRequestWindowCount || 0) + 1 : 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      setPromoCode("");
      setRequestMethod("");
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
      {!isBeta && <VipProgramPanel deposit={cumulativeDeposit} profile={profile} rewards={vipRewards} tiers={vipTiers} />}
      <div className="split-layout token-request-layout">
      <section className="panel token-request-panel">
        <div className="section-heading">
          <BadgeDollarSign size={24} />
          <div>

            <h1>申請代幣</h1>
          </div>
        </div>
        <form className="stack-form" onSubmit={submitRequest}>
          <fieldset className="token-request-methods">
            <legend>選擇申請方式</legend>
            <div role="radiogroup" aria-label="代幣申請方式">
              <button
                aria-checked={requestMethod === "payment"}
                className={requestMethod === "payment" ? "selected" : ""}
                role="radio"
                type="button"
                onClick={() => {
                  setRequestMethod("payment");
                  setPromoCode("");
                }}
              >
                <BadgeDollarSign size={22} />
                <span><strong>付款購買代幣</strong><small>查看付款資料並上載付款證明</small></span>
              </button>
              <button
                aria-checked={requestMethod === "promo"}
                className={requestMethod === "promo" ? "selected" : ""}
                role="radio"
                type="button"
                onClick={() => {
                  setRequestMethod("promo");
                  setProof(null);
                }}
              >
                <Gift size={22} />
                <span><strong>推廣活動兌換代幣</strong><small>使用推廣活動邀請碼申請</small></span>
              </button>
            </div>
          </fieldset>
          {requestMethod && <>
          {requestMethod === "payment" && <>
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
                <span>HK$100 起</span>
              </button>
            </div>
          </div>
          {usingCustomAmount && (
            <label>
              自訂付款金額（HKD）
              <input
                type="number"
                min={MIN_CUSTOM_PAYMENT_HKD}
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
          </div>
          </>}
          {requestMethod === "payment" && (isBeta ? (
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
                <input value={fpsIdentifier} onChange={(event) => setFpsIdentifier(event.target.value)} placeholder="請輸入 FPS 識別碼" required />
              </label>
              <label>
                收款人姓名
                <input value={fpsName} onChange={(event) => setFpsName(event.target.value)} placeholder="請輸入收款人姓名" required />
              </label>
            </>
          ))}
          {requestMethod === "payment" ? (
            <>
              <FileUpload
                label="付款證明圖片"
                file={proof}
                onChange={setProof}
                required
              />
              <p className="form-note">請按以上資料付款，再上載付款證明；所有申請須經人工審核。</p>
            </>
          ) : (
            <label>
              推廣活動邀請碼
              <input
                value={promoCode}
                onChange={(event) => setPromoCode(normalizePromoCode(event.target.value))}
                placeholder="例如 EVENT-500"
                pattern="[A-Za-z]{1,24}-?[1-9][0-9]{0,6}"
                maxLength="32"
                required
              />
            </label>
          )}
          {isBeta && (
            <div className="claimable-token-field">
              <span>可領取的代幣</span>
              <strong>{requestedTokenAmount ? <TokenAmount value={requestedTokenAmount} /> : "輸入有效邀請碼"}</strong>
            </div>
          )}
          {requestMethod === "promo" && (
            <p className="form-note">
              每位用戶每個完整邀請碼只可使用一次。批准後代幣會加入帳戶，活動獎勵不會計入 VIP 累積入金。
            </p>
          )}
          <button className="primary-btn" type="submit" disabled={submitting}>
            <FileImage size={18} />
            {submitting ? "提交中..." : "提交申請"}
          </button>
          </>}
        </form>
      </section>

      <section className="panel token-request-history-panel">
        <div className="section-heading compact">
          <Clock3 size={22} />
          <div>

            <h2>我的代幣申請</h2>
          </div>
        </div>
        <div className="token-request-history-scroll" role="region" aria-label="我的代幣申請記錄" tabIndex="0">
          <RequestList requests={requests} loading={requestsLoading} />
        </div>
      </section>
      </div>
      {isBeta && <VipProgramPanel deposit={cumulativeDeposit} profile={profile} rewards={vipRewards} tiers={vipTiers} />}
    </div>
  );
}

function getSafeProofName(proof) {
  return proof.name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "proof.jpg";
}

async function submitTokenPaymentRequest({ proof, ...request }) {
  if (!proof) {
    throw new Error("請上傳 JPEG、PNG 或 WebP 付款證明。");
  }

  const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  const contentType = proof.type === "image/jpg" ? "image/jpeg" : proof.type || "";
  if (!allowedTypes.has(contentType)) {
    throw new Error("付款證明必須是 JPEG、PNG 或 WebP 圖片。");
  }
  if (proof.size > 2 * 1024 * 1024) {
    throw new Error("付款證明圖片不可超過 2MB。");
  }

  const { data } = await httpsCallable(functions, "submitTokenPaymentRequest")({
    ...request,
    contentType,
    proofFileName: getSafeProofName(proof),
    base64: await blobToBase64(proof),
  });
  return data;
}

// Split the review queue so requests ready to review are not buried by
// ones still waiting for payment proof or already processed.
const TOKEN_REVIEW_TABS = [
  { id: "awaiting", label: "未審核", statuses: ["awaiting_upload"] },
  { id: "submitted", label: "已提交證明", statuses: ["pending"] },
  { id: "reviewed", label: "已審核", statuses: ["approved", "rejected"] },
];

function TokenRequestReview({ requests, loading, onApprove, onReject }) {
  const [reviewView, setReviewView] = useState("submitted");
  const requestsByTab = Object.fromEntries(TOKEN_REVIEW_TABS.map((tab) => [
    tab.id,
    requests.filter((request) => tab.statuses.includes(request.status)),
  ]));

  return (
    <>
      <div className="collection-tabs admin-status-tabs">
        {TOKEN_REVIEW_TABS.map((tab) => (
          <button
            className={reviewView === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setReviewView(tab.id)}
          >
            {tab.label} {requestsByTab[tab.id].length}
          </button>
        ))}
      </div>
      <RequestList
        requests={requestsByTab[reviewView]}
        loading={loading}
        adminMode
        onApprove={onApprove}
        onReject={onReject}
      />
    </>
  );
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
              {Number(request.hkdAmount) > 0 && <span>付款金額：HK${formatTokenNumber(request.hkdAmount)}</span>}
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
                <button className="small-btn" type="button" onClick={() => onApprove(request)}>
                  <Check size={15} />
                  批准
                </button>
            )}
            {adminMode && ["awaiting_upload", "pending"].includes(request.status) && (
                <button className="small-btn danger" type="button" onClick={() => onReject(request)}>
                  <X size={15} />
                  駁回
                </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function MyRecords({ profile }) {
  const isBeta = IS_BETA;
  const [records, setRecords] = useState([]);
  const [slotRecords, setSlotRecords] = useState([]);
  const [recordsError, setRecordsError] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setRecordsLoading(true);

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

    return stopRecords;
  }, [profile.uid]);

  useEffect(() => {
    const slotQuery = query(
      collectionGroup(db, "slots"),
      where("uid", "==", profile.uid),
    );

    return onSnapshot(
      slotQuery,
      (snapshot) => {
        setSlotRecords(snapshot.docs.map((item) => {
          const pathParts = item.ref.path.split("/");
          const roomId = pathParts[1] || "";
          const roundId = pathParts[2] === "rounds" ? pathParts[3] : "";
          return {
            id: `slot-${roomId}-${roundId || "legacy"}-${item.id}`,
            drawId: roomId,
            round: roundId,
            number: Number(item.data().number || item.id),
            tokenCost: Number(item.data().tokenCost || 0),
            targetCardId: item.data().targetCardId || "",
            targetCardName: item.data().targetCardName || "",
            targetCardImageUrl: item.data().targetCardImageUrl || "",
            targetCardValue: Number(item.data().targetCardValue || item.data().tokenCost || 0),
            createdAt: item.data().updatedAt || item.data().createdAt,
            slotOnly: true,
          };
        }));
      },
      (error) => {
        console.error("Slot history listener failed.", error);
      },
    );
  }, [profile.uid]);

  // Only the rooms this player bought in are needed to label the history.
  const { docsById: roomsById, loading: historyRoomsLoading } = useDocsByIds(
    "draws",
    [...records, ...slotRecords].map((record) => record.drawId),
  );
  const mergedRecords = useMemo(
    () => mergePurchaseRecords(records, slotRecords, roomsById),
    [records, roomsById, slotRecords],
  );
  const historyLoading = recordsLoading || historyRoomsLoading;
  const activeRecords = mergedRecords.filter((record) => {
    const room = roomsById[record.drawId];
    return !record.cardId && isRoomPurchasable(room);
  });
  const completedRecords = mergedRecords.filter(
    (record) => !activeRecords.some((active) => active.id === record.id),
  );
  const activeRecordsPage = getPaginationPage(activeRecords, activePage, MY_RECORDS_PAGE_SIZE);
  const completedRecordsPage = getPaginationPage(completedRecords, completedPage, MY_RECORDS_PAGE_SIZE);
  const allRecordsPage = getPaginationPage(mergedRecords, historyPage, MY_RECORDS_PAGE_SIZE);

  if (isBeta) {
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
              {activeRecordsPage.items.map((record) => (
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
                    <small className="record-acquired-time">取得時間：{formatRecordAcquiredTime(record)}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">暫時沒有正在抽卡的紀錄。</p>
          )}
          <RecordPagination
            label="正在抽卡"
            page={activeRecordsPage.page}
            totalPages={activeRecordsPage.totalPages}
            onChange={setActivePage}
          />
        </div>
        <div className="beta-history-section">
          <h2>已完成</h2>
          {completedRecords.length ? (
            <div className="history-table">
              <div className="history-head">
                <span>房間</span><span>中獎卡牌</span><span>天堂地獄號碼</span><span>售價</span><span>結果</span>
              </div>
              {completedRecordsPage.items.map((record) => (
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
                    <span>
                      <strong>{record.cardName || "未分配卡牌"}</strong>
                      <small>所屬盲盒：{record.targetCardName || "未選卡牌"}</small>
                      <small className="record-acquired-time">取得時間：{formatRecordAcquiredTime(record)}</small>
                    </span>
                  </span>
                  <b>#{record.number}</b>
                  <span className="history-paid-token">
                    繳付代幣：{formatTokenNumber(getOriginalDrawPrice(record))}
                  </span>
                  <span className={`status-badge ${record.cardId ? (record.resultSide === "hell" ? "hell" : "heaven") : "pending"}`}>
                    {record.cardId ? getResultSideLabel(record.resultSide) : "待開牌"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">暫時沒有已完成紀錄。</p>
          )}
          <RecordPagination
            label="已完成紀錄"
            page={completedRecordsPage.page}
            totalPages={completedRecordsPage.totalPages}
            onChange={setCompletedPage}
          />
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
          {allRecordsPage.items.map((record) => (
            <article className="history-row" key={record.id}>
              <span>{record.roomSlug || record.drawId}</span>
              <span className="history-card-title">
                <strong>{record.targetCardName || record.cardName || record.drawTitle}</strong>
                <small className="record-acquired-time">取得時間：{formatRecordAcquiredTime(record)}</small>
              </span>
              <b>#{record.number}</b>
              <TokenAmount value={record.tokenCost} />
              <span className={`status-badge ${record.cardId ? "approved" : "pending"}`}>
                {record.cardId ? "已完成" : "待開"}
              </span>
            </article>
          ))}
          <RecordPagination
            label="我的紀錄"
            page={allRecordsPage.page}
            totalPages={allRecordsPage.totalPages}
            onChange={setHistoryPage}
          />
        </div>
      ) : (
        <p className="muted">你已購買的抽卡號碼會顯示在這裡。</p>
      )}
    </section>
  );
}

// Keeps long user history readable without loading every row into one continuous page.
function RecordPagination({ label, page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="record-pagination" aria-label={`${label}分頁`}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一頁</button>
      <span>第 {page} / {totalPages} 頁</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一頁</button>
    </nav>
  );
}

function getPaginationPage(items, requestedPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (page - 1) * pageSize;
  return { items: items.slice(startIndex, startIndex + pageSize), page, totalPages };
}

function CollectionPage({ profile }) {
  const isBeta = IS_BETA;
  const [records, setRecords] = useState([]);
  const [activeStatus, setActiveStatus] = useState("pending");
  const [collectionError, setCollectionError] = useState("");
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [selectedPendingIds, setSelectedPendingIds] = useState([]);
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionActionBusy, setCollectionActionBusy] = useState(false);
  const [collectionActionProgress, setCollectionActionProgress] = useState("");
  const [shippingIds, setShippingIds] = useState([]);
  const [shippingForm, setShippingForm] = useState({
    name: "",
    phone: "",
    region: "hong-kong",
    method: "sf-door",
    address: "",
    note: "",
  });
  const [shippingBusy, setShippingBusy] = useState(false);
  const shippingRegion = SHIPPING_REGIONS.find((region) => region.id === shippingForm.region)
    || SHIPPING_REGIONS[0];

  useEffect(() => {
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
  }, [isBeta, profile.uid]);

  const visibleRecords = records.filter((record) => {
    if (!isBeta) return (record.collectionStatus || "pending") === activeStatus;
    return getBetaCollectionRecordStatus(record) === activeStatus;
  });
  const visibleRecordsPage = getPaginationPage(
    visibleRecords,
    collectionPage,
    MY_COLLECTION_PAGE_SIZE,
  );

  useEffect(() => {
    setCollectionPage(1);
  }, [activeStatus]);

  useEffect(() => {
    const pendingIds = new Set(
      records
        .filter((record) => getBetaCollectionRecordStatus(record) === "pending")
        .map((record) => record.id),
    );
    setSelectedPendingIds((current) => {
      const next = current.filter((id) => pendingIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [records]);
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
    const refund = getCardConversionRefund(record);

    if (!refund || record.convertedToTokens) return false;

    if (!skipConfirm) {
      const confirmed = window.confirm(
        `將「${record.cardName}」轉回 ${formatTokenNumber(refund)} 代幣？`,
      );
      if (!confirmed) return false;
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
      return true;
    } catch (error) {
      showSafeError(error);
      return false;
    }
  }

  async function convertSelectedCards() {
    const selectedRecords = isBeta
      ? visibleRecords.filter((record) => selectedPendingIds.includes(record.id))
      : visibleRecords;
    if (!selectedRecords.length) {
      alert("請先選擇要轉換成代幣的卡牌。");
      return;
    }

    const totalRefund = selectedRecords.reduce(
      (sum, record) => sum + getCardConversionRefund(record),
      0,
    );
    const confirmed = window.confirm(
      `將${isBeta ? "已選的" : "目前"} ${selectedRecords.length} 張卡牌按管理員設定價值轉回 ${formatTokenNumber(totalRefund)} 代幣？`,
    );
    if (!confirmed) return;

    setCollectionActionBusy(true);
    let convertedCount = 0;
    try {
      for (const [index, record] of selectedRecords.entries()) {
        setCollectionActionProgress(`正在轉換 ${index + 1} / ${selectedRecords.length} 張卡牌`);
        // Each conversion updates the same wallet. Sequential transactions avoid token-balance contention.
        if (await convertCardToTokens(record, { skipConfirm: true })) convertedCount += 1;
      }
    } finally {
      setCollectionActionBusy(false);
      setCollectionActionProgress("");
    }
    setSelectedPendingIds((current) => current.filter((id) => !selectedRecords.some((record) => record.id === id)));
    if (convertedCount && convertedCount !== selectedRecords.length) {
      alert(`已成功轉換 ${convertedCount} / ${selectedRecords.length} 張卡牌，其餘卡牌請重新整理後再試。`);
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
      region: "hong-kong",
      method: "sf-door",
      address: "",
      note: "",
    });
  }

  async function submitShippingRequest(event) {
    event.preventDefault();
    if (!shippingForm.name.trim() || !shippingForm.phone.trim() || !shippingForm.address.trim()) {
      alert(shippingForm.method === "sf-pickup" ? "請填寫收件人、電話並選擇順豐自提點。" : "請填寫收件人、電話及完整地址。");
      return;
    }
    const validMethod = shippingRegion.sfAvailable
      ? ["sf-door", "sf-pickup"].includes(shippingForm.method)
      : shippingForm.method === "address-delivery";
    if (!validMethod) {
      alert("配送地區與配送方式不相符，請重新選擇。");
      return;
    }
    setShippingBusy(true);
    try {
      for (let start = 0; start < shippingIds.length; start += FIRESTORE_SAFE_BATCH_SIZE) {
        const recordIds = shippingIds.slice(start, start + FIRESTORE_SAFE_BATCH_SIZE);
        setCollectionActionProgress(
          `正在提交配送 ${Math.min(start + recordIds.length, shippingIds.length)} / ${shippingIds.length} 張卡牌`,
        );
        const batch = writeBatch(db);
        recordIds.forEach((recordId) => {
          batch.update(doc(db, "drawRecords", recordId), {
            collectionStatus: "shipping",
            shippingRequested: true,
            shippingRecipient: shippingForm.name.trim(),
            shippingPhone: shippingForm.phone.trim(),
            shippingRegion: shippingForm.region,
            shippingMethod: shippingForm.method,
            shippingAddress: shippingForm.address.trim(),
            shippingNote: shippingForm.note.trim(),
            shippingRequestedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      setSelectedPendingIds((current) => current.filter((id) => !shippingIds.includes(id)));
      setShippingIds([]);
      setActiveStatus("shipping");
    } catch (error) {
      showSafeError(error);
    } finally {
      setShippingBusy(false);
      setCollectionActionProgress("");
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
              <button className="small-btn" type="button" onClick={convertSelectedCards}>
                轉換為點數
              </button>
              {isBeta && (
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => openShippingRequest(selectedPendingIds)}
                  disabled={!selectedPendingIds.length}
                >
                  批次申請配送
                </button>
              )}
            </>
          )}
        </div>}
        {isBeta && activeStatus === "pending" && (
          <div className="beta-collection-actions">
            <span className="beta-collection-selection-count">已選 {selectedPendingIds.length} 張</span>
            <button
              className="small-btn"
              type="button"
              disabled={collectionActionBusy || !visibleRecordsPage.items.length}
              onClick={() => setSelectedPendingIds((current) => [
                ...new Set([...current, ...visibleRecordsPage.items.map((record) => record.id)]),
              ])}
            >
              選取本頁
            </button>
            <button
              className="small-btn"
              type="button"
              disabled={collectionActionBusy || !selectedPendingIds.length}
              onClick={() => setSelectedPendingIds([])}
            >
              清除選取
            </button>
            <button
              className="small-btn"
              type="button"
              onClick={convertSelectedCards}
              disabled={collectionActionBusy || !selectedPendingIds.length}
            >
              批量申請轉換代幣
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={() => openShippingRequest(selectedPendingIds)}
              disabled={collectionActionBusy || !selectedPendingIds.length}
            >
              批次申請配送
            </button>
          </div>
        )}
        {collectionActionProgress && <p className="form-note collection-action-progress">{collectionActionProgress}</p>}
        {visibleRecords.length ? (
          <div className="collection-grid">
            {visibleRecordsPage.items.map((record) => (
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
                    <>
                      <span className="collection-room-meta">
                        {record.drawTitle || record.roomSlug || "抽卡房"} · {formatRoundLabel(record.round)}
                      </span>
                      <span className="record-acquired-time">取得時間：{formatRecordAcquiredTime(record)}</span>
                      {record.source !== "vip" && (
                        <span className="collection-heaven-card">
                          <small>當日所選天堂卡</small>
                          <b title={record.targetCardName || "舊紀錄未有保存天堂卡名稱"}>
                            {record.targetCardName || (record.resultSide === "heaven" ? record.cardName : "舊紀錄未記錄")}
                          </b>
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span>{record.cardCategory || "其他"}</span>
                      <span>{record.drawTitle} · #{record.number}</span>
                      <span className="record-acquired-time">取得時間：{formatRecordAcquiredTime(record)}</span>
                    </>
                  )}
                  <span className={`status-badge ${getCollectionStatusBadgeClass(record)}`}>
                    {getCollectionDeliveryLabel(record)}
                  </span>
                  {isBeta && activeStatus === "pending" && (
                    <label className="collection-select-option">
                      <input
                        type="checkbox"
                        checked={selectedPendingIds.includes(record.id)}
                        onChange={(event) => setSelectedPendingIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, record.id])]
                            : current.filter((id) => id !== record.id),
                        )}
                      />
                      選擇卡牌
                    </label>
                  )}
                  {!record.convertedToTokens && activeStatus === "pending" && (
                    <button className="small-btn" type="button" disabled={collectionActionBusy} onClick={() => convertCardToTokens(record)}>
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
        <RecordPagination
          label={getBetaCollectionStatusLabel(activeStatus)}
          page={visibleRecordsPage.page}
          totalPages={visibleRecordsPage.totalPages}
          onChange={setCollectionPage}
        />
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
            <p className="muted">共 {shippingIds.length} 張卡牌，請選擇配送地區並填寫收件資料。</p>
            <form className="stack-form" onSubmit={submitShippingRequest}>
              <label>收件人姓名<input value={shippingForm.name} onChange={(event) => setShippingForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>聯絡電話<input type="tel" value={shippingForm.phone} onChange={(event) => setShippingForm((current) => ({ ...current, phone: event.target.value }))} required /></label>
              <label>
                配送地區
                <select
                  value={shippingForm.region}
                  onChange={(event) => {
                    const nextRegion = SHIPPING_REGIONS.find((region) => region.id === event.target.value);
                    setShippingForm((current) => ({
                      ...current,
                      region: event.target.value,
                      method: nextRegion?.sfAvailable ? "sf-door" : "address-delivery",
                      address: "",
                    }));
                  }}
                >
                  {SHIPPING_REGIONS.map((region) => (
                    <option value={region.id} key={region.id}>{region.label}</option>
                  ))}
                </select>
              </label>
              {shippingRegion.sfAvailable ? (
                <label>
                  配送方式
                  <select
                    value={shippingForm.method}
                    onChange={(event) => setShippingForm((current) => ({ ...current, method: event.target.value, address: "" }))}
                  >
                    <option value="sf-door">順豐上門</option>
                    <option value="sf-pickup">順豐自提點</option>
                  </select>
                </label>
              ) : (
                <p className="form-note shipping-region-note">請直接填寫{shippingRegion.label}完整收件地址。</p>
              )}
              {shippingForm.method === "sf-pickup" ? (
                <SfPickupPointPicker
                  value={shippingForm.address}
                  onChange={(address) => setShippingForm((current) => ({ ...current, address }))}
                />
              ) : (
                <label>
                  配送地址
                  <textarea
                    rows={3}
                    value={shippingForm.address}
                    onChange={(event) => setShippingForm((current) => ({ ...current, address: event.target.value }))}
                    placeholder={shippingRegion.sfAvailable
                      ? "請輸入香港完整順豐配送地址"
                      : `請輸入${shippingRegion.label}完整收件地址`}
                    required
                  />
                </label>
              )}
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

// Official SF Express Hong Kong stations and public lockers, generated by
// scripts/update-sf-pickup-points.mjs and fetched only when this picker opens.
let sfPickupPointsPromise = null;

function loadSfPickupPoints() {
  sfPickupPointsPromise ||= fetch("/sf-pickup-points.json")
    .then((response) => {
      if (!response.ok) throw new Error("未能載入順豐自提點。");
      return response.json();
    })
    .then((data) => ({
      areas: data.areas,
      updatedAt: data.updatedAt,
      points: data.points.map(([type, area, district, code, name, address, hours]) => ({
        type, area, district, code, name, address, hours,
      })),
    }))
    .catch((error) => {
      sfPickupPointsPromise = null;
      throw error;
    });
  return sfPickupPointsPromise;
}

function formatSfPickupPoint(point) {
  const kind = point.type === "station" ? "順豐站" : "順豐自助櫃";
  return `【${kind}】${point.code} ${point.name}｜${point.address}`;
}

function SfPickupPointPicker({ value, onChange }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [area, setArea] = useState("");
  const [district, setDistrict] = useState("");
  const [pointType, setPointType] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadSfPickupPoints()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getSafeErrorMessage(error, "未能載入順豐自提點。"));
      });
    return () => { cancelled = true; };
  }, []);

  const points = data?.points || [];
  const typedPoints = pointType === "all" ? points : points.filter((point) => point.type === pointType);
  const districts = [...new Set(typedPoints.filter((point) => point.area === area).map((point) => point.district))];
  const keyword = search.trim().toLowerCase();
  const visiblePoints = keyword
    ? typedPoints.filter((point) => `${point.code} ${point.name} ${point.address} ${point.district}`.toLowerCase().includes(keyword)).slice(0, 80)
    : typedPoints.filter((point) => point.area === area && point.district === district);
  const selectedPoint = points.find((point) => formatSfPickupPoint(point) === value) || null;

  if (loadError) {
    return <p className="error-note" role="alert">{loadError}</p>;
  }
  if (!data) {
    return <InlineLoading label="正在載入順豐自提點..." />;
  }

  return (
    <fieldset className="sf-pickup-picker">
      <legend>選擇順豐自提點</legend>
      <div className="sf-pickup-types" role="radiogroup" aria-label="自提點類型">
        {[["all", "全部"], ["station", "順豐站"], ["locker", "順豐自助櫃"]].map(([id, label]) => (
          <button
            aria-checked={pointType === id}
            className={pointType === id ? "active" : ""}
            key={id}
            role="radio"
            type="button"
            onClick={() => {
              setPointType(id);
              setDistrict("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        搜尋
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="輸入地區、街道、商場或網點代碼，例如 旺角、852BF"
        />
      </label>
      {!keyword && (
        <div className="sf-pickup-filters">
          <label>
            地區
            <select value={area} onChange={(event) => { setArea(event.target.value); setDistrict(""); }}>
              <option value="">請選擇</option>
              {data.areas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            分區
            <select value={district} onChange={(event) => setDistrict(event.target.value)} disabled={!area}>
              <option value="">請選擇</option>
              {districts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}
      {(keyword || district) && (
        visiblePoints.length ? (
          <div className="sf-pickup-list" role="listbox" aria-label="順豐自提點">
            {visiblePoints.map((point) => {
              const selected = selectedPoint?.code === point.code;
              return (
                <button
                  aria-selected={selected}
                  className={selected ? "sf-pickup-option selected" : "sf-pickup-option"}
                  key={point.code}
                  role="option"
                  type="button"
                  onClick={() => onChange(formatSfPickupPoint(point))}
                >
                  <strong>
                    <span className={`sf-pickup-badge ${point.type}`}>{point.type === "station" ? "順豐站" : "自助櫃"}</span>
                    {point.name}
                  </strong>
                  <span>{point.address}</span>
                  <small>{point.code} · {point.hours}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">找不到符合的自提點。</p>
        )
      )}
      {selectedPoint ? (
        <p className="sf-pickup-selected"><Check size={15} />已選：{selectedPoint.name}（{selectedPoint.code}）</p>
      ) : (
        <p className="form-note">資料來源：順豐香港官網（{data.updatedAt} 更新）。只列出公眾可使用的順豐站及自助櫃。</p>
      )}
    </fieldset>
  );
}

const AFFILIATE_STATUS_LABELS = { pending: "待審批", approved: "已批准", rejected: "已拒絕" };

// Report periods are Hong Kong calendar days, months and years.
function hongKongDate(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, "0");
  return new Date(`${year}-${month}-${String(day).padStart(2, "0")}T00:00:00+08:00`);
}

function currentHongKongMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date()).slice(0, 7);
}

// "2026-09" → [1 Sep 00:00 HKT, 1 Oct 00:00 HKT).
function hongKongMonthRange(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return [null, null];
  return [hongKongDate(year, month - 1, 1), month === 12 ? hongKongDate(year + 1, 0, 1) : hongKongDate(year, month, 1)];
}

// Web replacement for the retired macOS affiliate screens: review applications
// and read per-referrer reports computed by the adminAffiliateReport function.
function AffiliateManager() {
  const [applications, setApplications] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState("");
  const [applicationView, setApplicationView] = useState("pending");
  const [downloading, setDownloading] = useState(false);
  const [downloadMonth, setDownloadMonth] = useState(currentHongKongMonth);

  async function loadAffiliateData() {
    setLoading(true);
    try {
      const [applicationResult, overviewResult] = await Promise.all([
        httpsCallable(functions, "adminAffiliateApplications")({}),
        httpsCallable(functions, "adminAffiliateOverview")({}),
      ]);
      setApplications(applicationResult.data.items || []);
      setAffiliates(overviewResult.data.items || []);
    } catch (error) {
      showSafeError(error, "未能載入 Affiliate 資料。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAffiliateData();
  }, []);

  async function review(application, decision) {
    const reviewNote = decision === "rejected" ? window.prompt("拒絕原因（必填）：", "") : "";
    if (reviewNote === null) return;
    if (decision === "rejected" && !reviewNote.trim()) {
      alert("拒絕申請時請填寫原因。");
      return;
    }
    if (decision === "approved" && !window.confirm(`確認批准 ${application.username || displayEmail(application.email) || "此會員"} 的 Affiliate 申請？`)) return;
    setBusyUid(application.uid);
    try {
      await httpsCallable(functions, "adminReviewAffiliateApplication")({ uid: application.uid, decision, reviewNote });
      await loadAffiliateData();
    } catch (error) {
      showSafeError(error, "未能完成審批，請稍後再試。");
    } finally {
      setBusyUid("");
    }
  }

  async function downloadAllReports(event) {
    event.preventDefault();
    const [start, end] = hongKongMonthRange(downloadMonth);
    if (!start || !end) {
      alert("請選擇月份。");
      return;
    }
    setDownloading(true);
    try {
      const rows = [];
      const report = httpsCallable(functions, "adminAffiliateReport");
      for (const affiliate of affiliates) {
        const { data } = await report({
          referrerUid: affiliate.uid,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        });
        const referrer = {
          推薦人: affiliate.username || "",
          推薦人電郵: displayEmail(affiliate.email),
          推薦碼: affiliate.affiliateCode || "",
        };
        data.referees.forEach((row) => rows.push({
          ...referrer,
          類型: "會員",
          會員: row.username || row.uid,
          會員電郵: displayEmail(row.email),
          入金HKD: row.depositsHkd,
          消費代幣: row.spendTokens,
          已開獎消費: row.settledSpendTokens,
          派出卡牌價值: row.payoutTokens,
          平台盈虧: row.gainLossTokens,
          抽卡次數: row.drawCount,
          未開獎: row.pendingDrawCount,
        }));
        rows.push({
          ...referrer,
          類型: "推薦人合計",
          會員: `${data.totals.refereeCount} 位會員`,
          會員電郵: "",
          入金HKD: data.totals.depositsHkd,
          消費代幣: data.totals.spendTokens,
          已開獎消費: data.totals.settledSpendTokens,
          派出卡牌價值: data.totals.payoutTokens,
          平台盈虧: data.totals.gainLossTokens,
          抽卡次數: data.totals.drawCount,
          未開獎: data.totals.pendingDrawCount,
        });
      }
      const headers = ["推薦人", "推薦人電郵", "推薦碼", "類型", "會員", "會員電郵", "入金HKD", "消費代幣", "已開獎消費", "派出卡牌價值", "平台盈虧", "抽卡次數", "未開獎"];
      downloadTextFile(`affiliate-report-${downloadMonth}.csv`, createCsvText(headers, rows));
    } catch (error) {
      showSafeError(error, "未能下載推薦報表。");
    } finally {
      setDownloading(false);
    }
  }

  const visibleApplications = applications.filter((item) => (
    applicationView === "pending" ? item.status === "pending" : item.status !== "pending"
  ));
  const pendingCount = applications.filter((item) => item.status === "pending").length;

  if (loading) return <section className="panel"><InlineLoading label="正在載入 Affiliate 資料..." /></section>;

  return (
    <div className="affiliate-admin">
      <section className="panel">
        <div className="section-heading compact">
          <UserRoundPlus size={22} />
          <div>
            <h2>Affiliate 申請</h2>
            <p className="muted">批准後系統會為會員建立專屬推薦連結；拒絕時需要填寫原因。</p>
          </div>
        </div>
        <div className="collection-tabs admin-status-tabs">
          <button className={applicationView === "pending" ? "active" : ""} type="button" onClick={() => setApplicationView("pending")}>
            待審批 {pendingCount}
          </button>
          <button className={applicationView === "reviewed" ? "active" : ""} type="button" onClick={() => setApplicationView("reviewed")}>
            已處理 {applications.length - pendingCount}
          </button>
        </div>
        {visibleApplications.length ? (
          <div className="record-list">
            {visibleApplications.map((item) => (
              <article className="record-item affiliate-application-item" key={item.uid}>
                <div>
                  <strong>{item.username || "未設定用戶名"} · {displayEmail(item.email) || "無電郵"}</strong>
                  <p className="muted">聯絡：{item.contact}</p>
                  <p>{item.message}</p>
                  {item.reviewNote && <p className="muted">備註：{item.reviewNote}</p>}
                </div>
                <div className="request-actions">
                  <span className={`status-pill ${item.status}`}>{AFFILIATE_STATUS_LABELS[item.status] || item.status}</span>
                  {item.status === "pending" && (
                    <>
                      <button className="small-btn" type="button" disabled={busyUid === item.uid} onClick={() => review(item, "approved")}>
                        <Check size={15} />批准
                      </button>
                      <button className="small-btn" type="button" disabled={busyUid === item.uid} onClick={() => review(item, "rejected")}>
                        <X size={15} />拒絕
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">{applicationView === "pending" ? "暫時未有待審批申請。" : "暫時未有已處理申請。"}</p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading compact">
          <ListChecks size={22} />
          <div>
            <h2>月結報表（全部推薦人）</h2>
            <p className="muted">入金只計管理員核實並批准的金額；消費不計 VIP 獎勵；盈虧 = 已開獎消費 − 派出卡牌價值。</p>
          </div>
        </div>
        {affiliates.length ? (
          <form className="affiliate-report-form" onSubmit={downloadAllReports}>
            <label>
              月份
              <input
                type="month"
                value={downloadMonth}
                max={currentHongKongMonth()}
                onChange={(event) => setDownloadMonth(event.target.value)}
                required
              />
            </label>
            <button className="primary-btn" type="submit" disabled={downloading || !downloadMonth}>
              <Download size={16} />
              {downloading ? "下載中..." : "下載該月報表"}
            </button>
          </form>
        ) : (
          <p className="muted">暫時未有已批准的推薦人。</p>
        )}
      </section>
    </div>
  );
}

const AUDIT_SEVERITY_LABELS = { critical: "嚴重", high: "高", medium: "中", low: "低" };

function toDateInputValue(date) {
  return new Intl.DateTimeFormat("en-CA").format(date);
}

// Analyses the data-change audit trail for a date range and prints the findings.
function AuditLogExporter() {
  const today = new Date();
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(today.getTime() - 6 * 86400000)));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [status, setStatus] = useState("");
  const [analysis, setAnalysis] = useState(null);

  function selectedRange() {
    // Dates are Hong Kong calendar days, whatever time zone the admin's browser uses.
    const start = new Date(`${startDate}T00:00:00+08:00`);
    const end = new Date(new Date(`${endDate}T00:00:00+08:00`).getTime() + 86400000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    return { start, end };
  }

  async function analyzeRange() {
    const range = selectedRange();
    if (!range) {
      alert("請選擇有效日期範圍。");
      return;
    }
    setStatus("分析中…");
    setAnalysis(null);
    try {
      const { data } = await httpsCallable(functions, "adminAuditAnalyze")({
        startAt: range.start.toISOString(),
        endAt: range.end.toISOString(),
      });
      setAnalysis(data);
    } catch (error) {
      showSafeError(error, "未能分析審計紀錄。");
    } finally {
      setStatus("");
    }
  }

  // Prints only the analysis report (see the audit-print styles); raw records are never exported.
  function printReport() {
    document.body.classList.add("printing-audit-report");
    const cleanUp = () => {
      document.body.classList.remove("printing-audit-report");
      window.removeEventListener("afterprint", cleanUp);
    };
    window.addEventListener("afterprint", cleanUp);
    window.print();
  }


  return (
    <section className="panel">
      <div className="section-heading compact">
        <Shield size={22} />
        <div>
          <h2>審計紀錄</h2>
          <p className="muted">揀日期範圍後一鍵分析期間內所有資料改動（代幣、購買、申請、設定等），列出可疑活動並可列印報告。原始紀錄存放於鎖定的日誌儲存區，任何人都不能修改、刪除或下載。</p>
        </div>
      </div>
      <form className="affiliate-report-form" onSubmit={(event) => { event.preventDefault(); analyzeRange(); }}>
        <label>開始日期<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>結束日期<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <button className="primary-btn" type="submit" disabled={Boolean(status)}>
          <Shield size={16} />
          {status || "一鍵分析"}
        </button>
      </form>
      {analysis && (
        <div className="audit-analysis audit-report">
          <h3 className="audit-report-title">LiveDraw 審計分析報告 · {startDate} 至 {endDate}</h3>
          <div className="affiliate-summary">
            <div><span>已檢查紀錄</span><strong>{formatTokenNumber(analysis.entryCount)}</strong></div>
            {["critical", "high", "medium", "low"].map((level) => (
              <div className={`audit-level ${level}`} key={level}>
                <span>{AUDIT_SEVERITY_LABELS[level]}</span><strong>{analysis.summary[level] || 0}</strong>
              </div>
            ))}
          </div>
          {analysis.source === "default-30-days" && <p className="form-note">鎖定儲存區未建立，只分析咗最近 30 日內嘅紀錄。</p>}
          {analysis.truncated && <p className="form-note">紀錄太多，只分析咗首 50,000 條，請縮短日期範圍。</p>}
          {analysis.findings.length ? (
            <>
              <button className="small-btn audit-print-hide" type="button" onClick={printReport}>
                <FileText size={15} />列印報告
              </button>
              <div className="audit-findings">
                {analysis.findings.map((item, index) => (
                  <article className={`audit-finding ${item.severity}`} key={`${item.rule}-${item.path}-${index}`}>
                    <strong><span className={`audit-badge ${item.severity}`}>{AUDIT_SEVERITY_LABELS[item.severity]}</span>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>{item.time ? new Date(item.time).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" }) : ""} · {item.path} · {item.actor}</small>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="sf-pickup-selected"><Check size={15} />呢段期間冇發現可疑活動。</p>
              <button className="small-btn audit-print-hide" type="button" onClick={printReport}>
                <FileText size={15} />列印報告
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const MONITOR_PENDING_ALERT_MS = 10 * 60 * 1000;
const MONITOR_HEALTH_REFRESH_MS = 60 * 1000;

function formatAgo(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "--";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "少於 1 分鐘";
  if (minutes < 60) return `${minutes} 分鐘`;
  return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分鐘`;
}

function formatClock(value) {
  const time = typeof value === "string" ? new Date(value) : value instanceof Date ? value : new Date(toMillis(value));
  return Number.isNaN(time.getTime()) ? "--" : time.toLocaleTimeString("zh-HK", { hour12: false });
}

// Real-time dashboard shown only while a monitor session is running.
function LiveMonitorDashboard({ session, onStop, stopping }) {
  const sessionStartMs = toMillis(session.startedAt) || Date.now();
  const [liveRoom, setLiveRoom] = useState(null);
  const [roundSlots, setRoundSlots] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [shippingQueue, setShippingQueue] = useState([]);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => onSnapshot(
    query(collection(db, "draws"), where("status", "==", "live")),
    (snapshot) => setLiveRoom(snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null),
    (error) => console.error("Monitor live room listener failed.", error),
  ), []);

  const currentRoundId = liveRoom ? toRoundId(getRoomCurrentRound(liveRoom)) : "";
  useEffect(() => {
    if (!liveRoom?.id || !currentRoundId) {
      setRoundSlots([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, "draws", liveRoom.id, "rounds", currentRoundId, "slots"),
      (snapshot) => setRoundSlots(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error("Monitor slot listener failed.", error),
    );
  }, [liveRoom?.id, currentRoundId]);

  useEffect(() => onSnapshot(
      query(collection(db, "drawRecords"), where("createdAt", ">=", Timestamp.fromMillis(sessionStartMs)), orderBy("createdAt", "desc")),
      (snapshot) => setTodayRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((record) => record.source !== "vip")),
      (error) => console.error("Monitor records listener failed.", error),
  ), [sessionStartMs]);

  useEffect(() => onSnapshot(
    query(collection(db, "tokenRequests"), where("status", "==", "pending")),
    (snapshot) => setPendingRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => console.error("Monitor token request listener failed.", error),
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, "drawRecords"), where("shippingRequested", "==", true)),
    (snapshot) => setShippingQueue(snapshot.docs.map((item) => item.data())
      .filter((record) => record.collectionStatus === "shipping" && getDeliveryStage(record) !== "delivered")),
    (error) => console.error("Monitor shipping listener failed.", error),
  ), []);

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const { data } = await httpsCallable(functions, "adminLiveHealth")({ sinceAt: new Date(sessionStartMs).toISOString() });
        if (!cancelled) {
          setHealth(data);
          setHealthError("");
        }
      } catch (error) {
        if (!cancelled) setHealthError(getSafeErrorMessage(error, "未能讀取系統錯誤紀錄。"));
      }
    }
    loadHealth();
    const timer = window.setInterval(loadHealth, MONITOR_HEALTH_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionStartMs]);

  const recentWindow = now - 15 * 60 * 1000;
  const recentRecords = todayRecords.filter((record) => toMillis(record.createdAt) >= recentWindow);
  const sumTokens = (records) => records.reduce((sum, record) => sum + Number(record.tokenCost || 0), 0);
  const buyers = new Set(todayRecords.map((record) => record.uid));
  const topBuyers = Object.values(todayRecords.reduce((totals, record) => {
    const key = record.uid || record.username;
    totals[key] = totals[key] || { name: record.username || record.uid, tokens: 0, count: 0 };
    totals[key].tokens += Number(record.tokenCost || 0);
    totals[key].count += 1;
    return totals;
  }, {})).sort((left, right) => right.tokens - left.tokens).slice(0, 5);
  const soldSlots = roundSlots.filter((slot) => slot.status && slot.status !== "available");
  const roundSize = Number(liveRoom?.cardCount || roundSlots.length || 0);
  const roundFill = roundSize ? soldSlots.length / roundSize : 0;
  const oldestPending = pendingRequests.reduce((oldest, request) => Math.min(oldest, toMillis(request.createdAt) || now), now);
  const oldestPendingWait = pendingRequests.length ? now - oldestPending : 0;
  const buyingStopped = Boolean(liveRoom && isRoundBuyingBlocked(liveRoom, currentRoundId));

  const alerts = [];
  if (!liveRoom) alerts.push({ level: "medium", text: "而家冇直播中嘅房間。" });
  if (buyingStopped) alerts.push({ level: "medium", text: `直播中，但${formatRoundLabel(currentRoundId)}已停止購買。` });
  if (roundFill >= 0.9 && roundFill < 1) alerts.push({ level: "low", text: `${formatRoundLabel(currentRoundId)}就快賣晒（${soldSlots.length}/${roundSize}）。` });
  if (roundFill >= 1) alerts.push({ level: "low", text: `${formatRoundLabel(currentRoundId)}已經賣晒，可以準備開卡或者開下一場。` });
  if (oldestPendingWait >= MONITOR_PENDING_ALERT_MS) alerts.push({ level: "high", text: `有代幣申請已經等咗 ${formatAgo(oldestPendingWait)}，玩家可能等緊入代幣先買到。` });
  if (health?.clientErrorCount) alerts.push({ level: "high", text: `監察期間有 ${health.clientErrorCount} 個玩家端錯誤。` });
  if (health?.serverErrorCount) alerts.push({ level: "high", text: `監察期間有 ${health.serverErrorCount} 個伺服器錯誤。` });
  if (healthError) alerts.push({ level: "medium", text: healthError });

  return (
    <div className="live-monitor">
      <section className="panel">
        <div className="section-heading compact">
          <Bell size={22} />
          <div>
            <h2>直播監察</h2>
            <p className="muted">
              {liveRoom ? `${liveRoom.title || "直播"} · ${formatRoundLabel(currentRoundId)} · ${buyingStopped ? "已停止購買" : "開放購買中"}` : "而家冇直播中嘅房間"}
              {" · "}監察咗 {formatAgo(now - sessionStartMs)}（由 {formatClock(new Date(sessionStartMs))} 開始）
            </p>
          </div>
          <button className="primary-btn monitor-stop" type="button" disabled={stopping} onClick={onStop}>
            {stopping ? "正在產生報告..." : "停止監察並產生報告"}
          </button>
        </div>
        {alerts.length ? (
          <div className="monitor-alerts">
            {alerts.map((alert) => <p className={`monitor-alert ${alert.level}`} key={alert.text}>{alert.text}</p>)}
          </div>
        ) : (
          <p className="sf-pickup-selected"><Check size={15} />一切正常。</p>
        )}
        <div className="affiliate-summary monitor-kpis">
          <div><span>監察期間銷售（代幣）</span><strong>{formatTokenNumber(sumTokens(todayRecords))}</strong></div>
          <div><span>購買次數</span><strong>{todayRecords.length}</strong></div>
          <div><span>買家人數</span><strong>{buyers.size}</strong></div>
          <div><span>最近 15 分鐘</span><strong>{recentRecords.length} 次 · {formatTokenNumber(sumTokens(recentRecords))}</strong></div>
          <div><span>{currentRoundId ? formatRoundLabel(currentRoundId) : "本場"}已售</span><strong>{soldSlots.length} / {roundSize || "--"}</strong></div>
          <div><span>本場銷售（代幣）</span><strong>{formatTokenNumber(soldSlots.reduce((sum, slot) => sum + Number(slot.tokenCost || 0), 0))}</strong></div>
          <div><span>待審核代幣申請</span><strong>{pendingRequests.length}{pendingRequests.length ? ` · 最耐 ${formatAgo(oldestPendingWait)}` : ""}</strong></div>
          <div><span>待安排配送</span><strong>{shippingQueue.length}</strong></div>
        </div>
      </section>

      <div className="monitor-columns">
        <section className="panel">
          <h3>最新購買</h3>
          {todayRecords.length ? (
            <div className="monitor-feed">
              {todayRecords.slice(0, 15).map((record) => (
                <p key={record.id}>
                  <b>{formatClock(record.createdAt)}</b> {record.username || record.uid} · {formatRoundLabel(record.round)} #{record.number} · {record.targetCardName} · ⚡{formatTokenNumber(record.tokenCost)}
                </p>
              ))}
            </div>
          ) : <p className="muted">監察期間未有購買。</p>}
          <h3>最高消費</h3>
          {topBuyers.length ? (
            <div className="monitor-feed">
              {topBuyers.map((buyer) => <p key={buyer.name}>{buyer.name} · {buyer.count} 次 · ⚡{formatTokenNumber(buyer.tokens)}</p>)}
            </div>
          ) : <p className="muted">--</p>}
        </section>

        <section className="panel">
          <div className="monitor-health-heading">
            <h3>錯誤監察</h3>
          </div>
          {health ? (
            <>
              <p className="muted">更新時間：{formatClock(health.checkedAt)} · 玩家端錯誤 {health.clientErrorCount >= 1000 ? "1000+" : health.clientErrorCount} · 伺服器錯誤 {health.serverErrorCount} · 警告 {health.serverWarningCount >= 500 ? "500+" : health.serverWarningCount}</p>
              <h4>玩家端錯誤</h4>
              {health.clientErrors.length ? health.clientErrors.map((item) => (
                <article className="audit-finding high" key={`${item.code}-${item.message}`}>
                  <strong>{item.message}</strong>
                  <small>{item.count} 次 · {item.users} 位用戶 · {item.code || "no code"} · {item.where} · 最後 {formatClock(item.lastSeen)}</small>
                </article>
              )) : <p className="muted">冇玩家端錯誤。</p>}
              <h4>伺服器錯誤及警告</h4>
              {health.serverErrors.length ? health.serverErrors.map((item) => (
                <article className={`audit-finding ${item.severity === "WARNING" ? "medium" : "high"}`} key={`${item.service}-${item.severity}-${item.message}`}>
                  <strong>{item.service} · {item.severity}</strong>
                  <p>{item.message}</p>
                  <small>{item.count} 次 · 最後 {formatClock(item.lastSeen)}</small>
                </article>
              )) : <p className="muted">冇伺服器錯誤。</p>}
            </>
          ) : healthError ? <p className="error-note">{healthError}</p> : <InlineLoading label="正在讀取錯誤紀錄..." />}
        </section>
      </div>
    </div>
  );
}

const MONITOR_REQUEST_LABELS = {
  submitted: "新提交", approved: "已批准", rejected: "已駁回", approvedHkd: "批准入金（HK$）",
  approvedTokens: "批出代幣", pendingAtEnd: "結束時未處理", averageWaitMinutes: "平均處理時間（分鐘）",
  longestWaitMinutes: "最長處理時間（分鐘）",
};

function downloadMonitorReport(session) {
  const report = session.report || {};
  const rows = [];
  const add = (section, item, value) => rows.push({ 部分: section, 項目: item, 數值: value });
  add("概覽", "直播", session.drawTitle || "");
  add("概覽", "開始", formatClock(session.startedAt));
  add("概覽", "結束", formatClock(session.endedAt));
  add("概覽", "時長（分鐘）", report.durationMinutes);
  add("銷售", "購買次數", report.sales?.purchases);
  add("銷售", "消費代幣", report.sales?.tokens);
  add("銷售", "買家人數", report.sales?.buyers);
  add("銷售", "最繁忙一分鐘", report.sales?.busiestMinute ? `${formatClock(report.sales.busiestMinute.at)}（${report.sales.busiestMinute.purchases} 次）` : "-");
  (report.sales?.byRound || []).forEach((round) => add("每場銷售", `${round.room} ${formatRoundLabel(round.round)}`, `${round.count} 次 · ${round.tokens} 代幣`));
  (report.sales?.topBuyers || []).forEach((buyer) => add("最高消費", buyer.name, `${buyer.count} 次 · ${buyer.tokens} 代幣`));
  Object.entries(report.tokenRequests || {}).forEach(([key, value]) => add("代幣申請", MONITOR_REQUEST_LABELS[key] || key, value));
  add("配送", "配送申請", report.shippingRequests);
  add("錯誤", "玩家端錯誤", report.errors?.clientErrorCount ?? "未能讀取");
  add("錯誤", "伺服器錯誤", report.errors?.serverErrorCount ?? "未能讀取");
  (report.errors?.clientErrors || []).forEach((item) => add("玩家端錯誤", item.message, `${item.count} 次 · ${item.users} 位用戶`));
  (report.errors?.serverErrors || []).forEach((item) => add("伺服器錯誤", `${item.service} ${item.severity}`, `${item.count} 次 · ${item.message}`));
  (report.audit?.findings || []).forEach((item) => add("可疑活動", `${AUDIT_SEVERITY_LABELS[item.severity]} · ${item.title}`, item.detail));
  const day = formatClock(session.startedAt).replace(/[^\d]/g, "");
  downloadTextFile(`live-monitor-report-${new Intl.DateTimeFormat("en-CA").format(new Date(toMillis(session.startedAt)))}-${day}.csv`, createCsvText(["部分", "項目", "數值"], rows));
}

function MonitorReportView({ session, onClose }) {
  const report = session.report || {};
  function printReport() {
    document.body.classList.add("printing-audit-report");
    const cleanUp = () => {
      document.body.classList.remove("printing-audit-report");
      window.removeEventListener("afterprint", cleanUp);
    };
    window.addEventListener("afterprint", cleanUp);
    window.print();
  }
  return (
    <section className="panel audit-report monitor-report">
      <div className="monitor-report-actions audit-print-hide">
        <button className="small-btn" type="button" onClick={onClose}><ChevronLeft size={15} />返回</button>
        <button className="small-btn" type="button" onClick={printReport}><FileText size={15} />列印報告</button>
        <button className="small-btn" type="button" onClick={() => downloadMonitorReport(session)}><Download size={15} />下載 CSV</button>
      </div>
      <h3 className="audit-report-title">直播監察報告 · {session.drawTitle || "直播"}</h3>
      <p className="muted">{new Date(toMillis(session.startedAt)).toLocaleString("zh-HK")} 至 {formatClock(session.endedAt)} · {report.durationMinutes} 分鐘 · {session.startedByEmail}</p>
      <div className="affiliate-summary">
        <div><span>消費代幣</span><strong>{formatTokenNumber(report.sales?.tokens)}</strong></div>
        <div><span>購買次數</span><strong>{report.sales?.purchases ?? 0}</strong></div>
        <div><span>買家人數</span><strong>{report.sales?.buyers ?? 0}</strong></div>
        <div><span>批准入金</span><strong>HK${formatTokenNumber(report.tokenRequests?.approvedHkd)}</strong></div>
        <div><span>平均處理申請</span><strong>{report.tokenRequests?.averageWaitMinutes ?? 0} 分鐘</strong></div>
        <div><span>錯誤</span><strong>{(report.errors?.clientErrorCount ?? 0) + (report.errors?.serverErrorCount ?? 0)}</strong></div>
        <div><span>可疑活動（高／嚴重）</span><strong>{(report.audit?.summary?.high ?? 0) + (report.audit?.summary?.critical ?? 0)}</strong></div>
      </div>
      <div className="monitor-columns">
        <div>
          <h4>每場銷售</h4>
          <div className="monitor-feed">
            {(report.sales?.byRound || []).map((round) => <p key={`${round.room}-${round.round}`}>{round.room} {formatRoundLabel(round.round)} · {round.count} 次 · ⚡{formatTokenNumber(round.tokens)}</p>)}
            {!report.sales?.byRound?.length && <p className="muted">冇購買。</p>}
          </div>
          <h4>最高消費</h4>
          <div className="monitor-feed">
            {(report.sales?.topBuyers || []).map((buyer) => <p key={buyer.name}>{buyer.name} · {buyer.count} 次 · ⚡{formatTokenNumber(buyer.tokens)}</p>)}
            {!report.sales?.topBuyers?.length && <p className="muted">冇購買。</p>}
          </div>
          <h4>代幣申請</h4>
          <div className="monitor-feed">
            {Object.entries(report.tokenRequests || {}).map(([key, value]) => <p key={key}>{MONITOR_REQUEST_LABELS[key] || key}：{formatTokenNumber(value)}</p>)}
            <p>配送申請：{report.shippingRequests ?? 0}</p>
          </div>
        </div>
        <div>
          <h4>錯誤</h4>
          {report.errors?.unavailable ? <p className="error-note">未能讀取錯誤紀錄。</p> : (
            <div className="audit-findings">
              {[...(report.errors?.clientErrors || []).map((item) => ({ key: `c-${item.message}`, title: `玩家端 · ${item.message}`, detail: `${item.count} 次 · ${item.users} 位用戶` })),
                ...(report.errors?.serverErrors || []).map((item) => ({ key: `s-${item.service}-${item.message}`, title: `${item.service} · ${item.severity}`, detail: `${item.count} 次 · ${item.message}` }))]
                .map((item) => <article className="audit-finding high" key={item.key}><strong>{item.title}</strong><small>{item.detail}</small></article>)}
              {!report.errors?.clientErrors?.length && !report.errors?.serverErrors?.length && <p className="muted">冇錯誤。</p>}
            </div>
          )}
          <h4>可疑活動</h4>
          {report.audit?.unavailable ? <p className="error-note">未能讀取審計紀錄。</p> : (
            <div className="audit-findings">
              {(report.audit?.findings || []).map((item, index) => (
                <article className={`audit-finding ${item.severity}`} key={`${item.rule}-${index}`}>
                  <strong><span className={`audit-badge ${item.severity}`}>{AUDIT_SEVERITY_LABELS[item.severity]}</span>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
              {!report.audit?.findings?.length && <p className="muted">冇發現可疑活動。</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Monitoring runs only between "start" and "stop"; each stop stores a report.
function LiveMonitor() {
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [viewingId, setViewingId] = useState("");

  useEffect(() => onSnapshot(
    query(collection(db, "monitorSessions"), orderBy("startedAt", "desc"), limit(30)),
    (snapshot) => setSessions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => console.error("Monitor sessions listener failed.", error),
  ), []);

  const activeSession = sessions.find((session) => session.status === "active");
  const viewing = sessions.find((session) => session.id === viewingId && session.status === "completed");

  async function startMonitor() {
    setBusy(true);
    try {
      const live = await getDocs(query(collection(db, "draws"), where("status", "==", "live"), limit(1)));
      await httpsCallable(functions, "adminMonitorSession")({ action: "start", drawTitle: live.docs[0]?.data().title || "" });
    } catch (error) {
      showSafeError(error, "未能開始監察。");
    } finally {
      setBusy(false);
    }
  }

  async function stopMonitor() {
    if (!window.confirm("確認停止監察並產生報告？")) return;
    setBusy(true);
    try {
      const { data } = await httpsCallable(functions, "adminMonitorSession")({ action: "stop", sessionId: activeSession.id });
      setViewingId(data.sessionId);
    } catch (error) {
      showSafeError(error, "未能停止監察，請再試一次。");
    } finally {
      setBusy(false);
    }
  }

  if (activeSession) return <LiveMonitorDashboard session={activeSession} onStop={stopMonitor} stopping={busy} />;
  if (viewing) return <MonitorReportView session={viewing} onClose={() => setViewingId("")} />;

  return (
    <div className="live-monitor">
      <section className="panel">
        <div className="section-heading compact">
          <Bell size={22} />
          <div>
            <h2>直播監察</h2>
            <p className="muted">直播開始時撳「開始監察」，期間會即時顯示銷售、待處理申請同錯誤；完場撳「停止」就會產生報告。</p>
          </div>
        </div>
        <button className="primary-btn" type="button" disabled={busy} onClick={startMonitor}>
          <Bell size={16} />{busy ? "開始中..." : "開始監察"}
        </button>
      </section>
      <section className="panel">
        <h3>過往監察報告</h3>
        {sessions.filter((session) => session.status === "completed").length ? (
          <div className="record-list">
            {sessions.filter((session) => session.status === "completed").map((session) => (
              <article className="record-item monitor-session-item" key={session.id}>
                <div>
                  <strong>{session.drawTitle || "直播"} · {new Date(toMillis(session.startedAt)).toLocaleString("zh-HK")}</strong>
                  <p className="muted">
                    {session.report?.durationMinutes ?? 0} 分鐘 · {session.report?.sales?.purchases ?? 0} 次購買 · ⚡{formatTokenNumber(session.report?.sales?.tokens)}
                    {" · "}錯誤 {(session.report?.errors?.clientErrorCount ?? 0) + (session.report?.errors?.serverErrorCount ?? 0)}
                    {" · "}可疑 {(session.report?.audit?.summary?.high ?? 0) + (session.report?.audit?.summary?.critical ?? 0)}
                  </p>
                </div>
                <div className="request-actions">
                  <button className="small-btn" type="button" onClick={() => setViewingId(session.id)}>查看</button>
                  <button className="small-btn" type="button" onClick={() => downloadMonitorReport(session)}><Download size={15} />CSV</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">未有監察報告。</p>}
      </section>
    </div>
  );
}

function LiveDrawAdminPanel({ profile }) {
  const isBeta = IS_BETA;
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
        { id: "monitor", label: "直播監察", eyebrow: "Live monitor", icon: Bell },
        { id: "live", label: "直播管理", eyebrow: "Live", icon: Gavel },
        BETA_BANNER_SECTION,
        ...ADMIN_SECTIONS.filter((section) => !["rooms", "create-room"].includes(section.id)),
        { id: "affiliate", label: "Affiliate", eyebrow: "Affiliate program", icon: UserRoundPlus },
        { id: "audit", label: "審計紀錄", eyebrow: "Audit trail", icon: Shield },
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
    );
    return onSnapshot(pendingShippingQuery, (snapshot) => {
      setPendingShippingCount(snapshot.docs.filter((item) => {
        const record = item.data();
        return ["shipping", "shipped"].includes(record.collectionStatus)
          && getDeliveryStage(record) !== "delivered";
      }).length);
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

  // Reviews run server-side so token grants, VIP rewards and the audit log commit together.
  async function reviewTokenRequest(payload) {
    await httpsCallable(functions, "adminReviewTokenRequest")(payload);
  }

  async function approveRequest(request) {
    // Promo requests can be approved directly; only verified bank payments count towards VIP deposits.
    const isPromo = request.proofMode === "promo";
    const verifiedInput = isPromo ? "0" : window.prompt("請先核對銀行實際入帳及付款證明，再輸入實際收到的港幣金額：");
    if (verifiedInput === null) return;
    const verifiedHkdAmount = Number(verifiedInput);
    if (!Number.isSafeInteger(verifiedHkdAmount) || (!isPromo && verifiedHkdAmount < MIN_CUSTOM_PAYMENT_HKD)) {
      alert("請輸入已核實的有效入帳金額。");
      return;
    }

    try {
      await reviewTokenRequest({ requestId: request.id, decision: "approved", verifiedHkdAmount });
    } catch (error) {
      showSafeError(error, "未能批准申請，請稍後再試。");
    }
  }

  async function rejectRequest(request) {
    const reason = window.prompt("駁回原因（可選）：", "");
    if (reason === null) return;

    try {
      await reviewTokenRequest({ requestId: request.id, decision: "rejected", adminNote: reason });
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
          <CreateDrawForm profile={profile} cards={cards} previousDraws={draws} />
        </div>
      )}
      {activeAdminSection === "cards" && (
        <div className="admin-section">
          <CreateCardForm cards={cards} profile={profile} />
        </div>
      )}
      {isBeta && activeAdminSection === "banner" && (
        <div className="admin-section narrow-admin-section">
          <HomepageBannerManager profile={profile} />
        </div>
      )}
      {activeAdminSection === "packages" && (
        <div className="admin-section narrow-admin-section">
          <TokenPackageManager profile={profile} />
        </div>
      )}
      {activeAdminSection === "promos" && (
        <div className="admin-section narrow-admin-section">
          <PromoCodeManager profile={profile} />
        </div>
      )}
      {isBeta && activeAdminSection === "monitor" && (
        <div className="admin-section">
          <LiveMonitor />
        </div>
      )}
      {isBeta && activeAdminSection === "audit" && (
        <div className="admin-section narrow-admin-section">
          <AuditLogExporter />
        </div>
      )}
      {isBeta && activeAdminSection === "affiliate" && (
        <div className="admin-section">
          <AffiliateManager />
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
          <TokenRequestReview
            requests={requests}
            loading={adminLoading.requests}
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
  const [legacySyncMessage, setLegacySyncMessage] = useState("");
  const legacySyncKeyRef = useRef("");
  const purchaseRecords = useMemo(
    () => records.filter((record) => record.uid && record.number).sort(compareRoomRoundRecords),
    [records],
  );

  // Older assignments stored the result only on each private purchase record.
  // Copy missing sides into the public room summary without replacing newer saved results.
  useEffect(() => {
    if (loading || !profile?.uid || !draws.length || !purchaseRecords.length) return;

    const drawsById = new Map(draws.map((draw) => [draw.id, draw]));
    const repairsByDraw = new Map();
    purchaseRecords.forEach((record) => {
      if (!record.cardId || !["heaven", "hell"].includes(record.resultSide)) return;
      const draw = drawsById.get(record.drawId);
      if (!draw || draw.status !== "completed") return;
      const roundId = record.round || "round-001";
      const number = String(record.number);
      const savedSides = draw.roundResultSides?.[roundId] || {};
      if (["heaven", "hell"].includes(savedSides[number])) return;

      if (!repairsByDraw.has(draw.id)) repairsByDraw.set(draw.id, new Map());
      const roundRepairs = repairsByDraw.get(draw.id);
      if (!roundRepairs.has(roundId)) roundRepairs.set(roundId, { ...savedSides });
      if (!roundRepairs.get(roundId)[number]) {
        roundRepairs.get(roundId)[number] = record.resultSide;
      }
    });

    if (!repairsByDraw.size) return;
    const syncKey = JSON.stringify(Array.from(repairsByDraw, ([drawId, rounds]) => [
      drawId,
      Array.from(rounds, ([roundId, sides]) => [roundId, sides]),
    ]));
    if (legacySyncKeyRef.current === syncKey) return;
    legacySyncKeyRef.current = syncKey;
    setLegacySyncMessage("正在同步舊天堂／地獄記錄到封存頁...");

    const syncLegacyResults = async () => {
      const entries = Array.from(repairsByDraw.entries());
      for (let start = 0; start < entries.length; start += 400) {
        const batch = adminWriteBatch();
        entries.slice(start, start + 400).forEach(([drawId, rounds]) => {
          const updates = { updatedAt: serverTimestamp(), updatedBy: profile.uid };
          rounds.forEach((sides, roundId) => {
            updates[`roundResultSides.${roundId}`] = sides;
          });
          batch.update(doc(db, "draws", drawId), updates);
        });
        await batch.commit();
      }
      const repairedRounds = Array.from(repairsByDraw.values())
        .reduce((total, rounds) => total + rounds.size, 0);
      setLegacySyncMessage(`已同步 ${repairedRounds} 個舊場次，封存頁會顯示天堂／地獄。`);
    };

    syncLegacyResults().catch((error) => {
      legacySyncKeyRef.current = "";
      setLegacySyncMessage(`未能同步舊賽果：${getSafeErrorMessage(error)}`);
    });
  }, [draws, loading, profile?.uid, purchaseRecords]);
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
  const totalPurchaseAmount = sessionRecords.reduce(
    (sum, record) => sum + Number(record.tokenCost || record.targetCardValue || 0),
    0,
  );
  const totalExchangeAmount = sessionRecords
    .filter((record) => record.cardId)
    .reduce((sum, record) => sum + Number(getCardConversionRefund(record) || 0), 0);
  const grossProfit = totalPurchaseAmount - totalExchangeAmount;
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
      const batch = adminWriteBatch();
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
          cardImageUrl: getCardThumbUrl(resultCard),
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
      {legacySyncMessage && <p className="form-note">{legacySyncMessage}</p>}
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
          <div className="admin-finance-summary">
            <span><small>購買總金額</small><strong><TokenAmount value={totalPurchaseAmount} /></strong></span>
            <span><small>需要兌換總金額</small><strong><TokenAmount value={totalExchangeAmount} /></strong></span>
            <span className={grossProfit >= 0 ? "user-profit" : "user-loss"}>
              <small>毛利</small>
              <strong><TokenAmount value={grossProfit} /></strong>
            </span>
          </div>
          <div className="batch-number-table" aria-label="已售號碼天堂地獄分配表">
            {numberList.map((number) => {
              const record = recordsByNumber.get(number);
              const side = draftSides[number] || "";
              return (
                <article className={`batch-number-result ${side || "unselected"} ${record?.cardId ? "locked" : ""}`} key={number}>
                  <header><strong>#{number}</strong><small>{record.username || "已售"}</small></header>
                  <p className="batch-number-target" title={record.targetCardName || "未記錄所選卡牌"}>
                    {record.targetCardImageUrl ? (
                      <img src={record.targetCardImageUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span aria-hidden="true"><Package size={14} /></span>
                    )}
                    <span><small>所選卡牌</small><strong>{record.targetCardName || "未記錄"}</strong></span>
                  </p>
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
                <em title={record.targetCardName || "未記錄所選卡牌"}>所選：{record.targetCardName || "未記錄"}</em>
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
  const [shippingView, setShippingView] = useState("shipping");
  const [auditUser, setAuditUser] = useState(null);
  const shippingRequests = records
    .filter((record) => (
      record.shippingRequested
      && ["shipping", "shipped"].includes(record.collectionStatus)
      && getDeliveryStage(record) !== "delivered"
    ))
    .sort((a, b) => toMillis(b.shippingRequestedAt) - toMillis(a.shippingRequestedAt));
  const deliveredRequests = records
    .filter((record) => getDeliveryStage(record) === "delivered" && (record.shippingRequested || record.trackingNumber))
    .sort((a, b) => toMillis(b.deliveredAt || b.updatedAt) - toMillis(a.deliveredAt || a.updatedAt));
  const visibleRequests = shippingView === "delivered" ? deliveredRequests : shippingRequests;

  async function markInTransit(record) {
    const trackingNumber = String(trackingNumbers[record.id] || record.trackingNumber || "").trim();
    if (!trackingNumber) {
      alert("請先輸入順豐運單號碼。");
      return;
    }
    setSavingId(record.id);
    try {
      await adminUpdateDoc(doc(db, "drawRecords", record.id), {
        collectionStatus: "shipping",
        deliveryStatus: "in_transit",
        trackingNumber,
        dispatchedAt: serverTimestamp(),
        shippedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingId("");
    }
  }

  async function markDelivered(record) {
    setSavingId(record.id);
    try {
      await adminUpdateDoc(doc(db, "drawRecords", record.id), {
        collectionStatus: "shipped",
        deliveryStatus: "delivered",
        deliveredAt: serverTimestamp(),
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

          <h2>{shippingView === "delivered" ? "已配送紀錄" : "配送中"}</h2>
          <p className="muted">「配送中」包括待安排配送及順豐正在配送；確認送達後才會移到「已配送」。</p>
        </div>
        <strong className="shipping-request-count">{shippingRequests.length} 個配送中</strong>
      </div>
      <div className="collection-tabs admin-status-tabs shipping-status-tabs">
        <button
          className={shippingView === "shipping" ? "active" : ""}
          type="button"
          onClick={() => setShippingView("shipping")}
        >
          配送中 {shippingRequests.length}
        </button>
        <button
          className={shippingView === "delivered" ? "active" : ""}
          type="button"
          onClick={() => setShippingView("delivered")}
        >
          已配送 {deliveredRequests.length}
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
                <div><dt>配送地區</dt><dd>{getShippingRegionLabel(record.shippingRegion)}</dd></div>
                <div><dt>配送方式</dt><dd>{getShippingMethodLabel(record.shippingMethod)}</dd></div>
                <div className="shipping-address-row"><dt>地址</dt><dd>{record.shippingAddress || "--"}</dd></div>
                {record.shippingNote && <div className="shipping-address-row"><dt>備註</dt><dd>{record.shippingNote}</dd></div>}
              </dl>
              <dl className="shipping-time-details">
                <div><dt>申請時間</dt><dd>{formatDate(record.shippingRequestedAt)}</dd></div>
                {getDeliveryStage(record) === "in_transit" && (
                  <div><dt>開始配送</dt><dd>{formatDate(record.dispatchedAt || record.shippedAt || record.updatedAt)}</dd></div>
                )}
                {getDeliveryStage(record) === "delivered" && (
                  <div><dt>完成配送</dt><dd>{formatDate(record.deliveredAt || record.updatedAt)}</dd></div>
                )}
              </dl>
              {getDeliveryStage(record) === "delivered" ? (
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
              ) : getDeliveryStage(record) === "in_transit" ? (
                <div className="shipping-request-actions">
                  <span className="status-badge shipping in-transit">正在配送</span>
                  {record.trackingNumber && (
                    <a
                      className="small-btn"
                      href={`https://htm.sf-express.com/hk/tc/dynamic_function/waybill/#search/bill-number/${encodeURIComponent(record.trackingNumber)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Truck size={16} />{record.trackingNumber}<ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => markDelivered(record)}
                    disabled={savingId === record.id}
                  >
                    <Check size={17} />{savingId === record.id ? "處理中..." : "標記已配送"}
                  </button>
                </div>
              ) : (
                <div className="shipping-request-actions">
                  <span className="status-badge pending">待安排配送</span>
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
                    onClick={() => markInTransit(record)}
                    disabled={savingId === record.id}
                  >
                    <Truck size={17} />{savingId === record.id ? "處理中..." : "標記正在配送"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact-empty">
          {shippingView === "delivered" ? "暫時未有已配送紀錄。" : "暫時未有配送中的需求。"}
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

// New dates are managed as rounds in one hall; legacy scheduled rooms remain editable until completed.
function SingleLiveManagement({ cards, draws, loading = false, profile }) {
  const live = draws.find((draw) => draw.status === "live")
    || draws.find((draw) => draw.status === "draft")
    || draws.find((draw) => draw.status === "scheduled")
    || null;
  const archivedLives = draws.filter((draw) => draw.id !== live?.id && draw.status === "completed");
  const scheduledLives = getScheduledLiveRooms(draws);
  if (loading) return <InlineLoading label="正在載入直播設定..." />;

  if (!live) {
    return (
      <div className="single-live-admin">
        <div className="single-live-note">
          <strong>尚未建立直播</strong>
          <span>只需建立一次；之後所有日期、場次和賽果都在同一個直播內管理。</span>
        </div>
        <CreateDrawForm profile={profile} cards={cards} previousDraws={draws} />
      </div>
    );
  }

  return (
    <div className="single-live-admin">
      <section className="panel single-live-section">
        <div className="section-heading compact">
          <Clock3 size={22} />
          <div><h2>直播日期、場次與賽果</h2><p className="muted">未來直播以場次加入同一個大廳，每場都可以獨立設定時間、機率及賽果相片。</p></div>
        </div>
        <AddBroadcastForm cards={cards} currentLive={live} profile={profile} />
        <LiveRoundSettingsList
          allDraws={draws}
          cards={cards}
          currentLive={live}
          profile={profile}
          scheduledLives={scheduledLives}
        />
      </section>
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

function BroadcastDetailsEditor({ draw, profile }) {
  const [title, setTitle] = useState(draw.title || "LiveDraw 直播抽卡大廳");
  const [kickUrl, setKickUrl] = useState(draw.kickUrl || "");
  const [saving, setSaving] = useState(false);
  const currentRoundId = toRoundId(getRoomCurrentRound(draw));
  const buyingBlocked = isRoundBuyingBlocked(draw, currentRoundId);
  const detailsChanged =
    title.trim() !== String(draw.title || "") ||
    getKickChannel(kickUrl) !== String(draw.kickUrl || "");

  useEffect(() => {
    setTitle(draw.title || "LiveDraw 直播抽卡大廳");
    setKickUrl(draw.kickUrl || "");
  }, [draw.id, draw.kickUrl, draw.title]);

  async function saveDetails() {
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
      await adminUpdateDoc(doc(db, "draws", draw.id), {
        title: cleanTitle,
        kickUrl: cleanKickChannel,
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
      ? (draw.buyingBlockedRounds || []).filter((roundId) => roundId !== currentRoundId)
      : [...new Set([...(draw.buyingBlockedRounds || []), currentRoundId])];
    const action = buyingBlocked ? "重新開放" : "停止";
    if (!window.confirm(`確認${action}${formatRoundLabel(currentRoundId)}購買？`)) return;

    try {
      await adminUpdateDoc(doc(db, "draws", draw.id), {
        buyingBlockedRounds: nextBlockedRounds,
        buyingBlockedRound: buyingBlocked ? "" : currentRoundId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    }
  }

  return (
    <div className="live-broadcast-detail-editor">
      <label>
        直播名稱
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Kick 頻道名稱
        <input value={kickUrl} onChange={(event) => setKickUrl(event.target.value)} placeholder="例如 livedrawtcg" />
      </label>
      <button className="primary-btn" type="button" onClick={saveDetails} disabled={saving || !detailsChanged}>
        <Save size={16} />{saving ? "儲存中..." : "儲存直播設定"}
      </button>
      {draw.status === "live" && (
        <button className={buyingBlocked ? "small-btn" : "small-btn danger"} type="button" onClick={toggleBuying}>
          <Lock size={15} />{buyingBlocked ? "重開本場購買" : "停止本場購買"}
        </button>
      )}
    </div>
  );
}

// Creates independently purchasable future broadcasts and promotes them without losing preorders.
export function FutureLiveScheduleManager({ draw, draws, profile }) {
  const [title, setTitle] = useState("LiveDraw 直播");
  const [liveDate, setLiveDate] = useState(() => getDateInputValue(addLocalDays(new Date(), 1)));
  const [liveHour, setLiveHour] = useState("20");
  const [liveMinute, setLiveMinute] = useState("00");
  const [saving, setSaving] = useState(false);
  const futureLives = getScheduledLiveRooms(draws);
  const selectedDate = buildLocalDateTime(liveDate, liveHour, liveMinute);

  async function addFutureLive(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const date = buildLocalDateTime(liveDate, liveHour, liveMinute);
    if (!cleanTitle || !date) {
      alert("請輸入直播名稱同日期時間。");
      return;
    }
    if (date.getTime() <= Date.now()) {
      alert("未來直播時間必須遲過而家。");
      return;
    }

    setSaving(true);
    try {
      const newDrawRef = doc(collection(db, "draws"));
      const totalRounds = getRoomRoundCount(draw);
      const cardCount = Math.max(4, Math.min(100, Math.round(Number(draw.cardCount) || 20)));
      const shareMode = String(draw.shareMode || "1/2");
      const poolCards = normalizeRoomCards(draw.poolCards).map(roomCardPayload);
      const roundSchedules = Object.fromEntries(
        rangeNumbers(1, totalRounds).map((roundNumber) => [
          toRoundId(roundNumber),
          new Date(date.getTime() + (roundNumber - 1) * 40 * 60 * 1000).toISOString(),
        ]),
      );
      const roundShareModes = Object.fromEntries(
        rangeNumbers(1, totalRounds).map((roundNumber) => [toRoundId(roundNumber), shareMode]),
      );

      await adminSetDoc(newDrawRef, {
        title: cleanTitle,
        slug: normalizeSlug(`${cleanTitle}-${Date.now()}`),
        kickUrl: String(draw.kickUrl || ""),
        cardCount,
        tokenCost: Number(draw.tokenCost || 10),
        totalRounds,
        currentRound: 1,
        round: toRoundId(1),
        status: "scheduled",
        scheduledAt: Timestamp.fromDate(date),
        preorderOpen: true,
        shareMode,
        roundShareModes,
        roundSchedules,
        futureLives: [],
        roundResultImages: {},
        buyingBlockedRounds: [],
        buyingBlockedRound: "",
        poolText: String(draw.poolText || ""),
        poolCards,
        poolCardIds: poolCards.length
          ? poolCards.map((card) => card.id).filter(Boolean)
          : Array.isArray(draw.poolCardIds) ? draw.poolCardIds : [],
        poolCardValues: poolCards.length
          ? Object.fromEntries(poolCards.filter((card) => card.id).map((card) => [card.id, Number(card.tokenValue || 0)]))
          : draw.poolCardValues || {},
        thumbnailUrl: "",
        roomLink: makeRoomLink(newDrawRef.id),
        previousLiveId: draw.id,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      await ensureRoomRoundSlots(newDrawRef.id, rangeNumbers(1, totalRounds), cardCount);
      setTitle("LiveDraw 直播");
      setLiveDate(getDateInputValue(addLocalDays(new Date(), 1)));
      setLiveHour("20");
      setLiveMinute("00");
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  async function removeFutureLive(item) {
    if (!window.confirm(`確認取消「${item.title}」？只有未有預購記錄嘅直播先可以取消。`)) return;
    setSaving(true);
    try {
      const purchases = await getDocs(query(collection(db, "drawRecords"), where("drawId", "==", item.id)));
      if (!purchases.empty) {
        alert("呢個未來直播已經有預購記錄，唔可以取消。請先處理相關訂單。");
        return;
      }
      await adminUpdateDoc(doc(db, "draws", item.id), {
        status: "cancelled",
        preorderOpen: false,
        cancelledAt: serverTimestamp(),
        cancelledBy: profile.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  async function startFutureLive(item) {
    if (!window.confirm(`確認開始「${item.title}」？目前直播會封存，預購號碼會完整保留。`)) return;
    setSaving(true);
    try {
      const batch = adminWriteBatch();
      draws.filter((candidate) => candidate.status === "live").forEach((candidate) => {
        batch.update(doc(db, "draws", candidate.id), {
          status: "completed",
          archivedAt: serverTimestamp(),
          archivedBy: profile.uid,
          updatedAt: serverTimestamp(),
        });
      });
      batch.update(doc(db, "draws", item.id), {
        status: "live",
        preorderOpen: true,
        startedAt: serverTimestamp(),
        chatStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      await batch.commit();
    } catch (error) {
      showSafeError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="future-live-admin">
      <form className="future-live-form" onSubmit={addFutureLive}>
        <label className="future-live-title-field">
          直播名稱
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required />
        </label>
        <fieldset className="future-live-picker" aria-label="直播日期及時間">
          <div className="future-live-picker-controls">
            <label>
              <span>日期</span>
              <input
                type="date"
                min={getDateInputValue(new Date())}
                value={liveDate}
                onChange={(event) => setLiveDate(event.target.value)}
                required
              />
            </label>
            <label>
              <span>時</span>
              <select value={liveHour} onChange={(event) => setLiveHour(event.target.value)}>
                {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
            </label>
            <span className="future-live-time-separator" aria-hidden="true">:</span>
            <label>
              <span>分</span>
              <select value={liveMinute} onChange={(event) => setLiveMinute(event.target.value)}>
                {["00", "15", "30", "45"].map((minute) => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <output className="future-live-picker-preview">
          <Clock3 size={14} />
          {selectedDate ? formatFutureLiveDate(selectedDate) : "請選擇日期及時間"}
        </output>
        <button className="primary-btn future-live-submit" type="submit" disabled={saving}>
          <Plus size={16} />{saving ? "儲存中..." : "新增未來直播"}
        </button>
      </form>
      {futureLives.length ? (
        <div className="future-live-admin-list">
          {futureLives.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{formatFutureLiveDate(item.scheduledDate)} · 獨立直播 · 預購已開放</span>
              </div>
              <div className="future-live-admin-actions">
                <a className="small-btn" href={makeRoomLink(item.id)} target="_blank" rel="noreferrer">前台查看</a>
                <button className="primary-btn" type="button" onClick={() => startFutureLive(item)} disabled={saving}>
                  <Zap size={15} />開始直播
                </button>
                <button className="small-btn danger" type="button" onClick={() => removeFutureLive(item)} disabled={saving}>
                  <Trash2 size={15} />取消
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="muted future-live-empty">暫時未設定未來直播。</p>}
    </div>
  );
}

// Creates an independent scheduled broadcast without changing the current live session.
function AddBroadcastForm({ cards, currentLive }) {
  const now = new Date();
  const initialDate = addLocalDays(now, 1);
  initialDate.setHours(20, 0, 0, 0);
  const localDateTime = new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`${new Intl.DateTimeFormat("zh-HK", { month: "2-digit", day: "2-digit" }).format(now)} LiveDraw 直播`);
  const [kickUrl, setKickUrl] = useState(currentLive?.kickUrl || "");
  const [firstRoundAt, setFirstRoundAt] = useState(localDateTime);
  const [totalRounds, setTotalRounds] = useState("6");
  const [cardCount, setCardCount] = useState(String(currentLive?.cardCount || 20));
  const [shareMode, setShareMode] = useState("1/2");
  const [selectedCardIds, setSelectedCardIds] = useState(() => getRoomPoolIds(currentLive));
  const [cardSearch, setCardSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const filteredCards = useMemo(
    () => filterCards(cards, cardSearch),
    [cards, cardSearch],
  );

  useEffect(() => {
    setKickUrl(currentLive?.kickUrl || "");
    setCardCount(String(currentLive?.cardCount || 20));
    setSelectedCardIds(getRoomPoolIds(currentLive));
  }, [currentLive]);

  function togglePoolCard(cardId) {
    setSelectedCardIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId],
    );
  }

  function selectAllPoolCards() {
    setSelectedCardIds(cards.map((card) => card.id));
  }

  function clearPoolCards() {
    setSelectedCardIds([]);
  }

  async function createBroadcast(event) {
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
    if (firstRoundDate.getTime() <= Date.now()) {
      alert("首場時間必須遲過而家。");
      return;
    }
    if (!selectedCardIds.length) {
      alert("請最少選擇一張直播卡牌。");
      return;
    }

    setCreating(true);
    try {
      const newDrawRef = doc(collection(db, "draws"));
      const poolCards = cards
        .filter((card) => selectedCardIds.includes(card.id))
        .map(roomCardPayload);
      const roundSchedules = Object.fromEntries(
        rangeNumbers(1, cleanTotalRounds).map((roundNumber) => [
          toRoundId(roundNumber),
          new Date(firstRoundDate.getTime() + (roundNumber - 1) * 40 * 60 * 1000).toISOString(),
        ]),
      );
      const roundShareModes = Object.fromEntries(
        rangeNumbers(1, cleanTotalRounds).map((roundNumber) => [toRoundId(roundNumber), shareMode]),
      );

      // Live creation stays behind the server-side admin endpoint. Firestore rules
      // therefore remain closed to direct browser writes, even for this page.
      await httpsCallable(functions, "adminWrite")({
        collection: "draws",
        documentId: newDrawRef.id,
        mode: "create",
        data: {
        title: cleanTitle,
        slug: normalizeSlug(`${cleanTitle}-${Date.now()}`),
        kickUrl: cleanKickChannel,
        cardCount: cleanCardCount,
        tokenCost: Number(currentLive?.tokenCost || 10),
        totalRounds: cleanTotalRounds,
        currentRound: 1,
        round: toRoundId(1),
        status: "scheduled",
        scheduledAt: firstRoundDate.toISOString(),
        preorderOpen: true,
        shareMode,
        roundShareModes,
        roundSchedules,
        futureLives: [],
        roundResultImages: {},
        buyingBlockedRounds: [],
        buyingBlockedRound: "",
        poolText: String(currentLive?.poolText || ""),
        poolCards,
        poolCardIds: poolCards.map((card) => card.id).filter(Boolean),
        poolCardValues: Object.fromEntries(poolCards.filter((card) => card.id).map((card) => [card.id, Number(card.tokenValue || 0)])),
        thumbnailUrl: "",
        roomLink: makeRoomLink(newDrawRef.id),
        previousLiveId: currentLive?.id || "",
        },
      });
      await httpsCallable(functions, "adminEnsureDrawSlots")({
        drawId: newDrawRef.id,
        totalRounds: cleanTotalRounds,
        cardCount: cleanCardCount,
      });
      setOpen(false);
      alert("新直播已加入直播列表，狀態為直播預告；目前直播不受影響。");
    } catch (error) {
      showSafeError(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={open ? "new-live-session embedded-new-live-session open" : "new-live-session embedded-new-live-session"}>
      <button className="small-btn add-broadcast-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <Plus size={17} />新增直播
      </button>
      {open && <form className="new-live-session-form" onSubmit={createBroadcast}>
        <label>新直播名稱<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Kick 頻道<input value={kickUrl} onChange={(event) => setKickUrl(event.target.value)} required /></label>
        <label>首場時間<input type="datetime-local" value={firstRoundAt} onChange={(event) => setFirstRoundAt(event.target.value)} required /></label>
        <label>總場數<input type="number" min="1" max="100" value={totalRounds} onChange={(event) => setTotalRounds(event.target.value)} required /></label>
        <label>每場可購買號碼<input type="number" min="4" max="100" value={cardCount} onChange={(event) => setCardCount(event.target.value)} required /></label>
        <label>預設機率<select value={shareMode} onChange={(event) => setShareMode(event.target.value)}><option value="1/2">1/2 二份之一</option><option value="1/5">1/5 五份之一</option><option value="1/10">1/10 十分之一</option></select></label>
        <div className="new-live-pool-picker">
          <div className="room-pool-header">
            <div><strong>直播卡池</strong><span>{selectedCardIds.length} 張已選 · 預設沿用上一場</span></div>
            <div className="pool-bulk-actions">
              <button className="small-btn" type="button" onClick={selectAllPoolCards}>全選全部</button>
              <button className="small-btn" type="button" onClick={clearPoolCards} disabled={!selectedCardIds.length}>取消全選</button>
            </div>
          </div>
          <div className="card-search">
            <Search size={16} />
            <input value={cardSearch} onChange={(event) => setCardSearch(event.target.value)} placeholder="搜尋卡名或代幣" type="search" />
          </div>
          <div className="mini-card-picker">
            {filteredCards.map((card) => (
              <button
                className={selectedCardIds.includes(card.id) ? "mini-card selected" : "mini-card"}
                key={card.id}
                type="button"
                aria-pressed={selectedCardIds.includes(card.id)}
                onClick={() => togglePoolCard(card.id)}
              >
                <b className="mini-card-selection-state">
                  {selectedCardIds.includes(card.id) ? <><Check size={12} />已選</> : "未選"}
                </b>
                {card.imageUrl ? <img src={getCardThumbUrl(card)} alt="" loading="lazy" /> : <span className="mini-card-placeholder"><Package size={15} /></span>}
                <span>{card.name}</span>
                <small><TokenAmount value={card.tokenValue || 0} /></small>
              </button>
            ))}
          </div>
          {!filteredCards.length && <span className="muted">沒有符合搜尋的卡牌。</span>}
        </div>
        <button className="primary-btn" type="submit" disabled={creating}>
          <Plus size={17} />
          {creating ? "處理中..." : "建立直播預告"}
        </button>
      </form>}
    </div>
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
      await adminUpdateDoc(doc(db, "draws", draw.id), { status, updatedAt: serverTimestamp() });
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
      await adminUpdateDoc(doc(db, "draws", draw.id), {
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
      await adminSetDoc(doc(db, "settings", "tokenPackages"), {
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

function PromoCodeManager({ profile }) {
  const [promoCodes, setPromoCodes] = useState([]);
  const [prefix, setPrefix] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => onSnapshot(collection(db, "promoCodes"), (snapshot) => {
    setPromoCodes(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((left, right) => String(left.code).localeCompare(String(right.code))));
  }, (error) => {
    console.error("Promotion code listener failed.", error);
    setPromoCodes([]);
  }), []);

  async function savePromoCode(event) {
    event.preventDefault();
    const normalizedPrefix = String(prefix || "").trim().toUpperCase();
    const parsed = parsePromoCode(`${normalizedPrefix}-${amount}`);
    if (!parsed) {
      alert("活動碼只可使用 1 至 24 個英文字母；代幣數目必須為 1 至 1,000,000 的整數。");
      return;
    }

    setSaving(true);
    try {
      const promoRef = doc(db, "promoCodes", parsed.code);
      const existing = await getDoc(promoRef);
      await adminSetDoc(promoRef, {
        code: parsed.code,
        prefix: parsed.prefix,
        amount: parsed.amount,
        active: true,
        createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
        createdBy: existing.exists() ? (existing.data().createdBy || profile.uid) : profile.uid,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
      setPrefix("");
      setAmount("");
    } catch (error) {
      showSafeError(error, "未能儲存推廣活動邀請碼，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  async function togglePromoCode(promo) {
    try {
      await adminUpdateDoc(doc(db, "promoCodes", promo.id), {
        active: !promo.active,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      });
    } catch (error) {
      showSafeError(error, "未能更新邀請碼狀態，請稍後再試。");
    }
  }

  return (
    <section className="panel promo-code-manager">
      <div className="section-heading compact">
        <Gift size={22} />
        <div>
          <h2>推廣活動邀請碼</h2>
          <p>完整邀請碼由英文字母及代幣數目組成，例如 EVENT-500。</p>
        </div>
      </div>
      <form className="promo-code-form" onSubmit={savePromoCode}>
        <label>
          活動字母碼
          <input
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 24))}
            placeholder="例如 EVENT"
            required
          />
        </label>
        <label>
          可兌換代幣
          <input
            type="number"
            min="1"
            max="1000000"
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="例如 500"
            required
          />
        </label>
        <div className="promo-code-preview">
          <span>完整邀請碼</span>
          <strong>{prefix && amount ? `${prefix}-${amount}` : "尚未輸入"}</strong>
        </div>
        <button className="primary-btn" type="submit" disabled={saving}>
          <Plus size={17} />{saving ? "儲存中..." : "新增並啟用"}
        </button>
      </form>
      <div className="promo-code-list">
        {promoCodes.length ? promoCodes.map((promo) => (
          <article key={promo.id} className={promo.active ? "active" : "inactive"}>
            <div>
              <strong>{promo.code}</strong>
              <span><TokenAmount value={promo.amount} /></span>
            </div>
            <span className={`status-badge ${promo.active ? "approved" : "rejected"}`}>
              {promo.active ? "已啟用" : "已停用"}
            </span>
            <button className="small-btn" type="button" onClick={() => togglePromoCode(promo)}>
              {promo.active ? "停用" : "重新啟用"}
            </button>
          </article>
        )) : <p className="muted">暫時未設定推廣活動邀請碼。</p>}
      </div>
      <p className="form-note">邀請碼一經用戶提交即會保留使用紀錄；停用後未審批申請亦不可批准，直至重新啟用。</p>
    </section>
  );
}

function HomepageBannerManager({ profile }) {
  const banner = useHomepageBanner();
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const customSlides = banner.isCustom ? banner.slides : [];

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return undefined;
    }
    const nextPreviewUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [imageFile]);

  // Every change saves straight away so visitors see the same order as the list here.
  async function saveSlides(nextSlides, intervalSeconds = banner.intervalSeconds) {
    await adminSetDoc(doc(db, "publicSiteSettings", "homepage"), {
      bannerSlides: nextSlides.map(({ id, imageUrl }) => ({ id, imageUrl })),
      // Kept for older clients that only read a single banner.
      bannerImageUrl: nextSlides[0]?.imageUrl || "",
      bannerIntervalSeconds: intervalSeconds,
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
    }, { merge: true });
  }

  async function runSave(action, fallbackMessage) {
    setSaving(true);
    try {
      await action();
    } catch (error) {
      showSafeError(error, fallbackMessage);
    } finally {
      setSaving(false);
    }
  }

  function addSlide() {
    if (!imageFile) return;
    if (customSlides.length >= MAX_BANNER_SLIDES) {
      alert(`最多 ${MAX_BANNER_SLIDES} 張 Banner。`);
      return;
    }
    runSave(async () => {
      const bannerDataUrl = await imageFileToCompressedDataUrl(imageFile, {
        maxWidth: 1600,
        maxHeight: 600,
        quality: 0.82,
        minQuality: 0.62,
        targetBytes: 520 * 1024,
      });
      const imageUrl = await uploadAdminImage(bannerDataUrl, "site", "homepage-banner");
      await saveSlides([...customSlides, { id: `slide-${Date.now()}`, imageUrl }]);
      setImageFile(null);
    }, "Banner 上載失敗，請重新選擇圖片再試。");
  }

  function moveSlide(slideIndex, step) {
    const nextSlides = [...customSlides];
    const [slide] = nextSlides.splice(slideIndex, 1);
    nextSlides.splice(slideIndex + step, 0, slide);
    runSave(() => saveSlides(nextSlides), "未能更改次序。");
  }

  function removeSlide(slideIndex) {
    if (!window.confirm(`確認移除第 ${slideIndex + 1} 張 Banner？`)) return;
    runSave(() => saveSlides(customSlides.filter((_slide, itemIndex) => itemIndex !== slideIndex)), "未能移除 Banner。");
  }

  function changeInterval(event) {
    const seconds = Number(event.target.value);
    runSave(() => saveSlides(customSlides, seconds), "未能更改輪播時間。");
  }

  function restoreDefaultBanner() {
    if (!window.confirm("確認移除所有自訂 Banner，恢復預設圖片？")) return;
    runSave(() => saveSlides([]), "未能恢復預設 Banner。");
  }

  return (
    <section className="panel homepage-banner-manager">
      <div className="section-heading compact">
        <ImagePlus size={22} />
        <div>
          <h2>首頁 Banner 輪播</h2>
          <p className="muted">
            最多 {MAX_BANNER_SLIDES} 張，會按以下次序自動輪播，改動即時顯示俾所有訪客；建議使用約 1600 × 540 的橫向圖片。
          </p>
        </div>
      </div>

      {customSlides.length ? (
        <ol className="banner-slide-list">
          {customSlides.map((slide, slideIndex) => (
            <li key={slide.id}>
              <span className="banner-slide-number">{slideIndex + 1}</span>
              <img src={slide.imageUrl} alt={`Banner ${slideIndex + 1}`} loading="lazy" />
              <div className="banner-slide-actions">
                <button className="small-btn" type="button" onClick={() => moveSlide(slideIndex, -1)} disabled={saving || slideIndex === 0} aria-label="上移">
                  <ArrowUp size={15} />
                </button>
                <button className="small-btn" type="button" onClick={() => moveSlide(slideIndex, 1)} disabled={saving || slideIndex === customSlides.length - 1} aria-label="下移">
                  <ArrowDown size={15} />
                </button>
                <button className="small-btn danger" type="button" onClick={() => removeSlide(slideIndex)} disabled={saving}>
                  <Trash2 size={15} />移除
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="homepage-banner-preview">
          <img src={DEFAULT_HOMEPAGE_BANNER_URL} alt="預設首頁 Banner" />
          <p className="form-note">而家顯示緊預設 Banner。加入圖片後會改為顯示你上載嘅 Banner。</p>
        </div>
      )}

      <label className="banner-interval">
        每張顯示時間
        <select value={banner.intervalSeconds} onChange={changeInterval} disabled={saving || customSlides.length < 2}>
          {BANNER_INTERVAL_OPTIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
        </select>
      </label>

      {previewUrl && (
        <div className="homepage-banner-preview">
          <img src={previewUrl} alt="新 Banner 預覽" />
        </div>
      )}
      <FileUpload
        id="homepage-banner-file"
        label="加入新 Banner"
        file={imageFile}
        onChange={setImageFile}
        disabled={saving || customSlides.length >= MAX_BANNER_SLIDES}
      />
      <div className="homepage-banner-actions">
        <button className="primary-btn" type="button" onClick={addSlide} disabled={saving || !imageFile}>
          <Plus size={17} />{saving ? "處理中..." : "加入輪播"}
        </button>
        <button className="small-btn" type="button" onClick={restoreDefaultBanner} disabled={saving || !customSlides.length}>
          <RefreshCcw size={15} />恢復預設
        </button>
      </div>
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
      await adminSetDoc(doc(db, "settings", "payment"), {
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
              rewardImageUrl: getCardThumbUrl(card),
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
      await adminSetDoc(doc(db, "settings", "vipProgram"), {
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
  const isBeta = IS_BETA;
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
      const deliveryUpdate = collectionStatus === "shipped"
        ? { deliveryStatus: "delivered", deliveredAt: serverTimestamp() }
        : collectionStatus === "shipping"
          ? { deliveryStatus: "in_transit", dispatchedAt: serverTimestamp(), shippedAt: serverTimestamp() }
          : {};
      await adminUpdateDoc(doc(db, "drawRecords", record.id), {
        cardId: card.id,
        cardName: card.name,
        cardCategory: getCardCategory(card),
        cardImageUrl: getCardThumbUrl(card),
        cardValue,
        cardConversionValue: Number(card.conversionValue ?? card.tokenValue ?? 0),
        resultSide,
        selectedHeavenCardId: selectedCard?.id || "",
        collectionStatus,
        ...deliveryUpdate,
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
          {card.imageUrl ? <img src={getCardThumbUrl(card)} alt={card.name} loading="lazy" /> : <Package size={42} />}
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
    allowedShareModes: [...SHARE_MODES],
    conversionValue: 8,
    category: CARD_CATEGORIES[0],
    hellCardId: "",
    pricingMode: "formula",
    modePrices: { half: "", fifth: "", tenth: "" },
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
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryVisibleLimit, setLibraryVisibleLimit] = useState(ADMIN_CARD_BATCH_SIZE);
  const [marginRate, setMarginRate] = useState(DEFAULT_CARD_MARGIN_RATE);
  const [marginRateDraft, setMarginRateDraft] = useState(String(DEFAULT_CARD_MARGIN_RATE));
  const [savingMarginRate, setSavingMarginRate] = useState(false);
  const importInputId = useId();

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "cardPricing"), (snapshot) => {
      const savedRate = Number(snapshot.data()?.marginRate || DEFAULT_CARD_MARGIN_RATE);
      const nextRate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : DEFAULT_CARD_MARGIN_RATE;
      setMarginRate(nextRate);
      setMarginRateDraft(String(nextRate));
    });
  }, []);

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

  const filteredLibraryCards = useMemo(() => {
    const keyword = librarySearch.trim().toLocaleLowerCase("zh-HK");
    if (!keyword) return cards;
    return cards.filter((card) =>
      String(card.name || "").toLocaleLowerCase("zh-HK").includes(keyword)
      || getCardCategory(card).toLocaleLowerCase("zh-HK").includes(keyword)
      || String(card.id || "").toLocaleLowerCase("zh-HK").includes(keyword),
    );
  }, [cards, librarySearch]);
  const visibleLibraryCards = useMemo(
    () => filteredLibraryCards.slice(0, libraryVisibleLimit),
    [filteredLibraryCards, libraryVisibleLimit],
  );

  useEffect(() => {
    setLibraryVisibleLimit(ADMIN_CARD_BATCH_SIZE);
  }, [librarySearch]);

  function resetCardDraft(card) {
    setCardDrafts((current) => ({
      ...current,
      [card.id]: createCardDraft(card),
    }));
  }

  function cardDraftChanged(card, draft) {
    const pricingMode = draft.pricingMode === "manual" ? "manual" : "formula";
    return (
      String(draft.name || "") !== String(card.name || "") ||
      String(draft.category || CARD_CATEGORIES[0]) !== getCardCategory(card) ||
      JSON.stringify(getCardAllowedShareModes(draft)) !== JSON.stringify(getCardAllowedShareModes(card)) ||
      Number(draft.conversionValue || 0) !== Number(card.conversionValue ?? card.tokenValue ?? 0) ||
      String(draft.hellCardId || "") !== String(card.hellCardId || "") ||
      pricingMode !== (card.pricingMode === "manual" ? "manual" : "formula") ||
      (pricingMode === "manual" && JSON.stringify(getCardModePrices(draft)) !== JSON.stringify(getCardModePrices(card))) ||
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

  function updateDraftPrice(cardId, priceKey, value) {
    setCardDrafts((current) => ({
      ...current,
      [cardId]: {
        ...(current[cardId] || {}),
        modePrices: {
          ...(current[cardId]?.modePrices || {}),
          [priceKey]: value,
        },
      },
    }));
  }

  function updateNewCardPrice(priceKey, value) {
    setNewCard((current) => ({
      ...current,
      modePrices: { ...current.modePrices, [priceKey]: value },
    }));
  }

  function getDraftCard(card) {
    return cardDrafts[card.id] || createCardDraft(card);
  }

  function getAutomaticPrices(conversionValue, hellCardId, rate = marginRate) {
    const hellCard = cards.find((card) => card.id === hellCardId);
    if (!hellCard) return null;
    const hellDraft = getDraftCard(hellCard);
    return calculateAutomaticCardPrices(conversionValue, hellDraft.conversionValue, rate);
  }

  // Reprice every paired card together so changing a hell card or the margin cannot leave stale prices behind.
  async function recalculateAllCardPrices(rate, saveSetting = false) {
    const [cardSnapshot, roomSnapshot, showcaseSnapshot] = await Promise.all([
      getDocs(collection(db, "cards")),
      getDocs(collection(db, "draws")),
      getDocs(collection(db, "publicCardShowcase")),
    ]);
    const allCards = cardSnapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((card) => !card.archived);
    const cardsById = new Map(allCards.map((card) => [card.id, card]));
    const pricesById = new Map();

    allCards.forEach((card) => {
      if (card.pricingMode === "manual") {
        // Older manual prices may carry decimals; round them to whole tokens.
        const current = getCardModePrices(card);
        const rounded = normalizeManualCardPrices(current);
        if (rounded && ["half", "fifth", "tenth"].some((key) => rounded[key] !== current[key])) {
          pricesById.set(card.id, rounded);
        }
        return;
      }
      const hellCard = cardsById.get(String(card.hellCardId || ""));
      if (!hellCard) return;
      const prices = calculateAutomaticCardPrices(
        card.conversionValue ?? card.tokenValue ?? 0,
        hellCard.conversionValue ?? hellCard.tokenValue ?? 0,
        rate,
      );
      if (prices) pricesById.set(card.id, prices);
    });

    const writes = [];
    if (saveSetting) {
      writes.push((batch) => batch.set(doc(db, "settings", "cardPricing"), {
        marginRate: rate,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      }, { merge: true }));
    }
    pricesById.forEach((prices, cardId) => {
      writes.push((batch) => batch.update(doc(db, "cards", cardId), {
        tokenValue: prices.half,
        modePrices: prices,
        pricingMarginRate: rate,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      }));
    });
    roomSnapshot.docs.forEach((roomDoc) => {
      const room = roomDoc.data();
      const roomPoolIds = getRoomPoolIds(room);
      if (!roomPoolIds.some((cardId) => pricesById.has(cardId))) return;
      const poolCardValues = { ...(room.poolCardValues || {}) };
      pricesById.forEach((prices, cardId) => {
        if (roomPoolIds.includes(cardId)) poolCardValues[cardId] = prices.half;
      });
      const roomUpdates = { poolCardValues, updatedAt: serverTimestamp() };
      if (Array.isArray(room.poolCards)) {
        roomUpdates.poolCards = normalizeRoomCards(room.poolCards).map((card) => {
          const prices = pricesById.get(card.id);
          return prices ? { ...card, tokenValue: prices.half, modePrices: prices } : card;
        });
      }
      writes.push((batch) => batch.update(roomDoc.ref, roomUpdates));
    });
    showcaseSnapshot.docs.forEach((showcaseDoc) => {
      const prices = pricesById.get(showcaseDoc.id);
      if (prices) writes.push((batch) => batch.set(showcaseDoc.ref, {
        tokenValue: prices.half,
        modePrices: prices,
        updatedAt: serverTimestamp(),
      }, { merge: true }));
    });

    for (let start = 0; start < writes.length; start += 450) {
      const batch = adminWriteBatch();
      writes.slice(start, start + 450).forEach((write) => write(batch));
      await batch.commit();
    }
    return {
      updated: pricesById.size,
      manual: allCards.filter((card) => card.pricingMode === "manual").length,
      skipped: allCards.filter((card) => card.pricingMode !== "manual" && !pricesById.has(card.id)).length,
    };
  }

  async function saveMarginRate() {
    const cleanRate = Number(marginRateDraft);
    if (!Number.isFinite(cleanRate) || cleanRate <= 0 || cleanRate > 10) {
      alert("毛利率必須大於 0 並且不多於 10。");
      return;
    }
    if (!window.confirm(`確認將毛利率改為 ${cleanRate}，並重算整個卡牌庫？`)) return;

    setSavingMarginRate(true);
    try {
      const result = await recalculateAllCardPrices(cleanRate, true);
      setMarginRate(cleanRate);
      alert(`已按毛利率 ${cleanRate} 更新 ${result.updated} 張卡。${result.manual ? `${result.manual} 張自訂優惠價未有改動。` : ""}${result.skipped ? `另有 ${result.skipped} 張未設定地獄對應卡，暫時保留原價。` : ""}`);
    } catch (error) {
      showSafeError(error);
    } finally {
      setSavingMarginRate(false);
    }
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
      await adminSetDoc(doc(db, "settings", "cardCategories"), {
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
      await adminSetDoc(doc(db, "settings", "cardCategories"), {
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
      await adminSetDoc(doc(db, "settings", "cardCategories"), {
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
    if (!newCard.hellCardId) {
      alert("請先設定地獄對應卡。");
      return;
    }
    const manualPricing = newCard.pricingMode === "manual";
    const modePrices = manualPricing
      ? normalizeManualCardPrices(newCard.modePrices)
      : getAutomaticPrices(newCard.conversionValue, newCard.hellCardId);
    if (!modePrices) {
      alert(manualPricing
        ? "請輸入有效的 1/2、1/5、1/10 自訂售價。"
        : "請先設定地獄對應卡，系統先可以自動計算三種玩法價錢。");
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
      const cardRef = doc(collection(db, "cards"));
      const { imageUrl, thumbUrl } = await createCardImageSet(newCard.imageFile, cardRef.id);

      const cardData = {
        name: cleanName,
        category: newCard.category || CARD_CATEGORIES[0],
        tokenValue: modePrices.half,
        modePrices,
        pricingMode: manualPricing ? "manual" : "formula",
        allowedShareModes: newCard.allowedShareModes,
        conversionValue: Number(newCard.conversionValue),
        hellCardId: newCard.hellCardId || "",
        imageUrl,
        thumbUrl,
        imageMode: "storage",
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await adminSetDoc(cardRef, cardData);
      await adminSetDoc(doc(db, "publicCardShowcase", cardRef.id), {
        ...getPublicCardPayload(cardData),
        updatedBy: profile.uid,
      }, { merge: true });
      setNewCard({ name: "", allowedShareModes: [...SHARE_MODES], conversionValue: 8, category: CARD_CATEGORIES[0], hellCardId: "", pricingMode: "formula", modePrices: { half: "", fifth: "", tenth: "" }, imageFile: null });
    } catch (error) {
      showSafeError(error);
    } finally {
      setCreating(false);
    }
  }

  async function saveCardEdit(card) {
    const draft = cardDrafts[card.id] || {};
    const cleanName = String(draft.name || "").trim();
    const cleanConversionValue = Number(draft.conversionValue || 0);
    const manualPricing = draft.pricingMode === "manual";
    const automaticPrices = getAutomaticPrices(cleanConversionValue, draft.hellCardId);
    const cleanModePrices = manualPricing
      ? normalizeManualCardPrices(draft.modePrices)
      : automaticPrices || getCardModePrices(card);
    const allowedShareModes = getCardAllowedShareModes(draft);

    if (!cleanName) {
      alert("請輸入卡牌名稱。");
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
    if (manualPricing && !draft.hellCardId) {
      alert("自訂 Promotion 售價前，請先設定地獄對應卡。");
      return;
    }
    if (!cleanModePrices) {
      alert("請輸入有效的 1/2、1/5、1/10 自訂售價。");
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
        pricingMode: manualPricing ? "manual" : "formula",
        allowedShareModes,
        conversionValue: cleanConversionValue,
        hellCardId: draft.hellCardId || "",
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid,
      };

      if (draft.imageFile) {
        Object.assign(updates, await createCardImageSet(draft.imageFile, card.id));
        updates.imageMode = "storage";
      }

      await adminUpdateDoc(doc(db, "cards", card.id), updates);
      await adminSetDoc(doc(db, "publicCardShowcase", card.id), {
        ...getPublicCardPayload({ ...card, ...updates }),
        updatedBy: profile.uid,
      }, { merge: true });
      await updateAssignedRecordsForCard(card.id, {
        cardName: cleanName,
        cardCategory: draft.category || CARD_CATEGORIES[0],
        cardValue: cleanModePrices.half,
        cardConversionValue: cleanConversionValue,
        ...(updates.imageUrl ? { cardImageUrl: updates.thumbUrl || updates.imageUrl } : {}),
        updatedAt: serverTimestamp(),
      });
      await updateRoomPoolCardsForCard(card.id, {
        name: cleanName,
        category: draft.category || CARD_CATEGORIES[0],
        tokenValue: cleanModePrices.half,
        modePrices: cleanModePrices,
        allowedShareModes,
      });
      await recalculateAllCardPrices(marginRate);
      setCardDrafts((current) => ({
        ...current,
        [card.id]: {
          name: cleanName,
          category: draft.category || CARD_CATEGORIES[0],
          allowedShareModes,
          conversionValue: cleanConversionValue,
          hellCardId: draft.hellCardId || "",
          pricingMode: manualPricing ? "manual" : "formula",
          modePrices: cleanModePrices,
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
      const batch = adminWriteBatch();

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
      pricingMode: card.pricingMode === "manual" ? "manual" : "formula",
      allowedShareModes: getCardAllowedShareModes(card).join("|"),
      conversionValue: Number(card.conversionValue ?? card.tokenValue ?? 0),
      hellCardId: card.hellCardId || "",
      imageUrl: card.imageUrl || "",
    }));
    const csvText = createCsvText(["id", "name", "category", "priceHalf", "priceFifth", "priceTenth", "pricingMode", "allowedShareModes", "conversionValue", "hellCardId", "imageUrl"], csvRows);
    downloadTextFile(`draw-card-library-${new Date().toISOString().slice(0, 10)}.csv`, csvText);
  }

  async function publishHomepageShowcase() {
    const publicCards = [...cards]
      .filter((card) => card.name && card.imageUrl && Number(card.tokenValue || 0) > 0)
      .sort((left, right) => Number(right.tokenValue || 0) - Number(left.tokenValue || 0));

    if (!publicCards.length) {
      alert("卡牌庫未有可發佈的卡牌圖片。");
      return;
    }
    if (!window.confirm(`確認更新公開卡牌圖片及首頁走馬燈？共 ${publicCards.length} 張卡牌。`)) {
      return;
    }

    setPublishingShowcase(true);
    try {
      const existingSnapshot = await getDocs(collection(db, "publicCardShowcase"));
      const batch = adminWriteBatch();

      existingSnapshot.docs.forEach((item) => {
        batch.set(item.ref, { active: false, updatedAt: serverTimestamp() }, { merge: true });
      });
      publicCards.forEach((card, index) => {
        batch.set(doc(db, "publicCardShowcase", card.id), {
          ...getPublicCardPayload(card),
          rank: index + 1,
          updatedBy: profile.uid,
        }, { merge: true });
      });
      await batch.commit();
      alert(`公開卡牌圖片已更新，共 ${publicCards.length} 張；首頁走馬燈會顯示最高價 12 張。`);
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
        await adminSetDoc(doc(db, "settings", "cardCategories"), {
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
          pricingMode: row.pricingMode,
          allowedShareModes: row.allowedShareModes,
          conversionValue: row.conversionValue,
          hellCardId: row.hellCardId || "",
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        };

        const importedImage = row.imageUrl
          ? await resolveImportedCardImage(row.imageUrl, matchedCard?.id || "import")
          : null;
        if (importedImage) Object.assign(updates, importedImage);

        if (matchedCard) {
          await adminUpdateDoc(doc(db, "cards", matchedCard.id), updates);
          await adminSetDoc(doc(db, "publicCardShowcase", matchedCard.id), {
            ...getPublicCardPayload({ ...matchedCard, ...updates }),
            updatedBy: profile.uid,
          }, { merge: true });
          await updateAssignedRecordsForCard(matchedCard.id, {
            cardName: row.name,
            cardCategory: row.category || CARD_CATEGORIES[0],
            cardValue: row.tokenValue,
            cardConversionValue: row.conversionValue,
            ...(importedImage ? { cardImageUrl: importedImage.thumbUrl || importedImage.imageUrl } : {}),
            updatedAt: serverTimestamp(),
          });
          await updateRoomPoolCardsForCard(matchedCard.id, {
            name: row.name,
            category: row.category || CARD_CATEGORIES[0],
            tokenValue: row.tokenValue,
            modePrices: row.modePrices,
            pricingMode: row.pricingMode,
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
            imageUrl: importedImage?.imageUrl || "",
            thumbUrl: importedImage?.thumbUrl || "",
            imageMode: importedImage?.imageMode || "excel-import-no-image",
            createdBy: profile.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const cardRef = await adminAddDoc(collection(db, "cards"), docData);
          if (docData.imageUrl) {
            await adminSetDoc(doc(db, "publicCardShowcase", cardRef.id), {
              ...getPublicCardPayload(docData),
              updatedBy: profile.uid,
            }, { merge: true });
          }
          createdCount += 1;
        }
      }

      await recalculateAllCardPrices(marginRate);
      alert(`匯入完成：新增 ${createdCount} 張，更新 ${updatedCount} 張。`);
    } catch (error) {
      showSafeError(error);
    } finally {
      setImporting(false);
    }
  }

  const newAutomaticPrices = getAutomaticPrices(newCard.conversionValue, newCard.hellCardId);
  const newDisplayedPrices = newCard.pricingMode === "manual" ? newCard.modePrices : newAutomaticPrices;

  return (
    <section className="panel card-library-panel">
      <div className="section-heading">
        <ImagePlus size={24} />
        <div>

          <h1>卡牌庫管理</h1>
          <p className="muted">一般卡牌按毛利率自動計算；Promotion 卡可勾選「自訂」並獨立設定三種玩法售價。</p>
        </div>
      </div>

      <div className="card-pricing-formula-panel">
        <div>
          <strong>自動定價公式</strong>
          <span>售價 =（天堂卡兌換價值 × 天堂機率＋地獄卡兌換價值 × 地獄機率）× 毛利率；自訂卡不受全局重算影響。</span>
        </div>
        <label>
          <span>毛利率</span>
          <input
            type="number"
            min="0.01"
            max="10"
            step="0.01"
            value={marginRateDraft}
            onChange={(event) => setMarginRateDraft(event.target.value)}
          />
        </label>
        <button className="primary-btn" type="button" onClick={saveMarginRate} disabled={savingMarginRate}>
          <Save size={16} />{savingMarginRate ? "重算中..." : "儲存並重算全部"}
        </button>
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
          CSV 欄位：id、name、category、priceHalf、priceFifth、priceTenth、pricingMode、conversionValue、hellCardId、imageUrl。pricingMode 填 manual 可保留自訂優惠價。
        </span>
      </div>

      <div className="card-search card-library-search">
        <Search size={17} />
        <input
          value={librarySearch}
          onChange={(event) => setLibrarySearch(event.target.value)}
          placeholder="搜尋卡名、分類或卡牌 ID"
          type="search"
        />
        <span>{visibleLibraryCards.length} / {filteredLibraryCards.length}</span>
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
          <span>1/2 售價</span>
          <span>1/5 售價</span>
          <span>1/10 售價</span>
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
          <div className="card-sheet-field card-price-field">
            <span>1/2 售價</span>
            <label className="card-pricing-mode-toggle">
              <input
                type="checkbox"
                checked={newCard.pricingMode === "manual"}
                onChange={(event) => updateNewCard("pricingMode", event.target.checked ? "manual" : "formula")}
              />
              自訂
            </label>
            <input
              type={newCard.pricingMode === "manual" ? "number" : "text"}
              min="0.01"
              step="0.01"
              value={newDisplayedPrices?.half ?? "先選地獄卡"}
              readOnly={newCard.pricingMode !== "manual"}
              onChange={(event) => updateNewCardPrice("half", event.target.value)}
            />
          </div>
          <label className="card-sheet-field">
            <span>1/5 售價</span>
            <input
              type={newCard.pricingMode === "manual" ? "number" : "text"}
              min="0.01"
              step="0.01"
              value={newDisplayedPrices?.fifth ?? "先選地獄卡"}
              readOnly={newCard.pricingMode !== "manual"}
              onChange={(event) => updateNewCardPrice("fifth", event.target.value)}
            />
          </label>
          <label className="card-sheet-field">
            <span>1/10 售價</span>
            <input
              type={newCard.pricingMode === "manual" ? "number" : "text"}
              min="0.01"
              step="0.01"
              value={newDisplayedPrices?.tenth ?? "先選地獄卡"}
              readOnly={newCard.pricingMode !== "manual"}
              onChange={(event) => updateNewCardPrice("tenth", event.target.value)}
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
          {filteredLibraryCards.length ? (
            visibleLibraryCards.map((card) => {
              const draft = cardDrafts[card.id] || createCardDraft(card);
              const automaticPrices = getAutomaticPrices(draft.conversionValue, draft.hellCardId);
              const manualPricing = draft.pricingMode === "manual";
              const displayedPrices = manualPricing
                ? draft.modePrices
                : automaticPrices || getCardModePrices(card);
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
                  <div className="card-sheet-field card-price-field">
                    <span>1/2 售價</span>
                    <label className="card-pricing-mode-toggle">
                      <input
                        type="checkbox"
                        checked={manualPricing}
                        onChange={(event) => updateDraft(card.id, "pricingMode", event.target.checked ? "manual" : "formula")}
                      />
                      自訂
                    </label>
                    <input
                      type={manualPricing ? "number" : "text"}
                      min="0.01"
                      step="0.01"
                      value={displayedPrices.half}
                      readOnly={!manualPricing}
                      onChange={(event) => updateDraftPrice(card.id, "half", event.target.value)}
                      title={manualPricing ? "自訂 Promotion 售價" : automaticPrices ? "按公式自動計算" : "未設定地獄對應卡，暫時保留原價"}
                    />
                  </div>
                  <label className="card-sheet-field">
                    <span>1/5 售價</span>
                    <input
                      type={manualPricing ? "number" : "text"}
                      min="0.01"
                      step="0.01"
                      value={displayedPrices.fifth}
                      readOnly={!manualPricing}
                      onChange={(event) => updateDraftPrice(card.id, "fifth", event.target.value)}
                      title={manualPricing ? "自訂 Promotion 售價" : automaticPrices ? "按公式自動計算" : "未設定地獄對應卡，暫時保留原價"}
                    />
                  </label>
                  <label className="card-sheet-field">
                    <span>1/10 售價</span>
                    <input
                      type={manualPricing ? "number" : "text"}
                      min="0.01"
                      step="0.01"
                      value={displayedPrices.tenth}
                      readOnly={!manualPricing}
                      onChange={(event) => updateDraftPrice(card.id, "tenth", event.target.value)}
                      title={manualPricing ? "自訂 Promotion 售價" : automaticPrices ? "按公式自動計算" : "未設定地獄對應卡，暫時保留原價"}
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
                      title={savingCardId === card.id ? "儲存中" : changed ? "確認儲存" : "已儲存"}
                      aria-label={savingCardId === card.id ? "儲存中" : changed ? "確認儲存" : "已儲存"}
                    >
                      <Save size={15} />
                      <span className="card-action-label">
                        {savingCardId === card.id ? "儲存中..." : changed ? "確認儲存" : "已儲存"}
                      </span>
                    </button>
                    {changed && (
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => resetCardDraft(card)}
                        disabled={savingCardId === card.id}
                        title="還原未儲存的修改"
                        aria-label="還原未儲存的修改"
                      >
                        <RefreshCcw size={15} />
                        <span className="card-action-label">還原</span>
                      </button>
                    )}
                    <button
                      className="small-btn danger"
                      type="button"
                      onClick={() => deleteCard(card)}
                      disabled={savingCardId === card.id || deletingCardId === card.id}
                      title={deletingCardId === card.id ? "刪除中" : "刪除卡牌"}
                      aria-label={deletingCardId === card.id ? "刪除中" : "刪除卡牌"}
                    >
                      <Trash2 size={15} />
                      <span className="card-action-label">
                        {deletingCardId === card.id ? "刪除中..." : "刪除卡牌"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="muted card-sheet-empty">{cards.length ? "沒有符合搜尋的卡牌。" : "暫時未建立卡牌。"}</p>
          )}
        </div>
      </div>
      {visibleLibraryCards.length < filteredLibraryCards.length && (
        <button className="small-btn player-card-load-more" type="button" onClick={() => setLibraryVisibleLimit((current) => current + ADMIN_CARD_BATCH_SIZE)}>
          顯示更多（尚有 {filteredLibraryCards.length - visibleLibraryCards.length} 張）
        </button>
      )}
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
  const [visibleLimit, setVisibleLimit] = useState(ADMIN_CARD_BATCH_SIZE);
  const [saving, setSaving] = useState(false);
  const hasUnsavedChanges = useMemo(
    () => !sameIdSet(selectedIds, savedIds),
    [savedIds, selectedIds],
  );
  const filteredCards = useMemo(
    () => filterCards(cards, cardSearch),
    [cards, cardSearch],
  );
  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleLimit),
    [filteredCards, visibleLimit],
  );

  useEffect(() => {
    setVisibleLimit(ADMIN_CARD_BATCH_SIZE);
  }, [cardSearch]);

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
      await adminUpdateDoc(doc(db, "draws", draw.id), {
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
            {visibleCards.map((card) => (
              <button
                className={selectedIds.includes(card.id) ? "mini-card selected" : "mini-card"}
                key={card.id}
                type="button"
                aria-pressed={selectedIds.includes(card.id)}
                onClick={() => toggleCard(card.id)}
              >
                <b className="mini-card-selection-state">
                  {selectedIds.includes(card.id) ? <><Check size={12} />已選</> : "未選"}
                </b>
                {card.imageUrl ? (
                  <img src={getCardThumbUrl(card)} alt="" loading="lazy" />
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
          {visibleCards.length < filteredCards.length && (
            <button className="small-btn player-card-load-more" type="button" onClick={() => setVisibleLimit((current) => current + ADMIN_CARD_BATCH_SIZE)}>
              顯示更多（尚有 {filteredCards.length - visibleCards.length} 張）
            </button>
          )}
        </>
      ) : (
        <span className="muted">請先建立卡牌。</span>
      )}
    </div>
  );
}

// Keeps a long schedule compact: administrators open only the broadcast they want to edit.
function LiveRoundSettingsList({ allDraws, cards, currentLive, profile, scheduledLives }) {
  const broadcasts = useMemo(
    () => [currentLive, ...scheduledLives.filter((item) => item.id !== currentLive.id)],
    [currentLive, scheduledLives],
  );
  const [expandedId, setExpandedId] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  useEffect(() => {
    if (expandedId && !broadcasts.some((item) => item.id === expandedId)) {
      setExpandedId("");
    }
  }, [broadcasts, expandedId]);

  async function setBroadcastLive(broadcast) {
    if (broadcast.status === "live") return;
    if (!window.confirm(`確認將「${broadcast.title || "LiveDraw 直播"}」設為直播中？其他直播中場次會同時封存。`)) return;

    setUpdatingId(broadcast.id);
    try {
      await runAdminTransaction(async (transaction) => {
        const liveStateRef = doc(db, "settings", "liveState");
        const targetRef = doc(db, "draws", broadcast.id);
        const liveStateSnapshot = await transaction.get(liveStateRef);
        const registeredLiveId = String(liveStateSnapshot.data()?.currentLiveId || "");
        const conflictingIds = [...new Set([
          ...allDraws
            .filter((item) => item.id !== broadcast.id && item.status === "live")
            .map((item) => item.id),
          ...(registeredLiveId && registeredLiveId !== broadcast.id ? [registeredLiveId] : []),
        ])];
        const targetSnapshot = await transaction.get(targetRef);
        const conflictingSnapshots = [];
        for (const drawId of conflictingIds) {
          const drawRef = doc(db, "draws", drawId);
          conflictingSnapshots.push({ drawRef, snapshot: await transaction.get(drawRef) });
        }

        if (!targetSnapshot.exists() || targetSnapshot.data().status === "completed") {
          throw new Error("所選直播已被封存，請重新整理後再試。");
        }

        conflictingSnapshots.forEach(({ drawRef, snapshot }) => {
          if (!snapshot.exists() || snapshot.data().status !== "live") return;
          transaction.update(drawRef, {
            status: "completed",
            preorderOpen: false,
            archivedAt: serverTimestamp(),
            archivedBy: profile.uid,
            updatedAt: serverTimestamp(),
          });
        });
        transaction.update(targetRef, {
          status: "live",
          preorderOpen: true,
          startedAt: serverTimestamp(),
          chatStartedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        });
        transaction.set(liveStateRef, {
          currentLiveId: broadcast.id,
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        }, { merge: true });
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setUpdatingId("");
    }
  }

  async function archiveBroadcast(broadcast) {
    if (broadcast.status === "live") {
      alert("直播中嘅場次唔可以封存，請先將另一場設為直播中。");
      return;
    }
    if (!window.confirm(`確認封存「${broadcast.title || "LiveDraw 直播"}」？場次、號碼、購買記錄及賽果會保留。`)) return;

    setUpdatingId(broadcast.id);
    try {
      await runAdminTransaction(async (transaction) => {
        const liveStateRef = doc(db, "settings", "liveState");
        const drawRef = doc(db, "draws", broadcast.id);
        const liveStateSnapshot = await transaction.get(liveStateRef);
        const drawSnapshot = await transaction.get(drawRef);
        if (!drawSnapshot.exists() || drawSnapshot.data().status === "completed") return;
        if (drawSnapshot.data().status === "live") {
          throw new Error("直播中嘅場次唔可以封存，請先將另一場設為直播中。");
        }

        transaction.update(drawRef, {
          status: "completed",
          preorderOpen: false,
          archivedAt: serverTimestamp(),
          archivedBy: profile.uid,
          updatedAt: serverTimestamp(),
        });
        if (liveStateSnapshot.data()?.currentLiveId === broadcast.id) {
          transaction.set(liveStateRef, {
            currentLiveId: "",
            updatedAt: serverTimestamp(),
            updatedBy: profile.uid,
          }, { merge: true });
        }
      });
    } catch (error) {
      showSafeError(error);
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="live-round-settings-list">
      {broadcasts.map((broadcast) => {
        const expanded = expandedId === broadcast.id;
        const firstSchedule = getRoundSchedule(broadcast, "round-001");
        const scheduleLabel = firstSchedule instanceof Date
          ? formatFutureLiveDate(firstSchedule)
          : "日期待定";
        const isLive = broadcast.status === "live";
        const isUpdating = updatingId === broadcast.id;
        const statusLabel = statusLabels[broadcast.status] || broadcast.status;

        return (
          <article className={expanded ? "expanded" : ""} key={broadcast.id}>
            <button
              aria-expanded={expanded}
              className="live-round-settings-toggle"
              type="button"
              onClick={() => setExpandedId(expanded ? "" : broadcast.id)}
            >
              <span>
                <strong>{broadcast.title || "LiveDraw 直播"}</strong>
                <small>{scheduleLabel} · {getRoomRoundCount(broadcast)} 場</small>
              </span>
              <b className={`status-${broadcast.status || "draft"}`}>{statusLabel}</b>
              <ChevronDown size={20} aria-hidden="true" />
            </button>
            <div className="live-round-broadcast-actions">
              {!isLive && (
                <button className="primary-btn" type="button" disabled={Boolean(updatingId)} onClick={() => setBroadcastLive(broadcast)}>
                  <Zap size={15} />{isUpdating ? "處理中..." : "設為直播中"}
                </button>
              )}
              <button
                className="small-btn danger"
                type="button"
                disabled={isLive || Boolean(updatingId)}
                onClick={() => archiveBroadcast(broadcast)}
                title={isLive ? "直播中場次不可封存" : "封存直播"}
              >
                <Package size={15} />{isUpdating ? "處理中..." : isLive ? "直播中不可封存" : "封存"}
              </button>
            </div>
            {expanded && (
              <div className="live-round-settings-content">
                <BroadcastDetailsEditor draw={broadcast} profile={profile} />
                <RoomRoundSettings draw={broadcast} />
                <div className="live-round-pool-settings">
                  <div className="section-heading compact">
                    <Boxes size={20} />
                    <div><h3>直播卡池</h3></div>
                  </div>
                  <RoomPoolEditor draw={broadcast} cards={cards} singleLive />
                </div>
              </div>
            )}
          </article>
        );
      })}
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

      await adminUpdateDoc(doc(db, "draws", draw.id), {
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
      await adminUpdateDoc(doc(db, "draws", draw.id), {
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

  // Lets an admin withdraw a wrongly uploaded result; the round shows "no result" again.
  async function removeRoundResult(roundId) {
    if (!window.confirm(`確認移除${formatRoundLabel(roundId)}的賽果相片？玩家頁面會即時不再顯示。`)) return;
    setUploadingRoundId(roundId);
    try {
      await adminUpdateDoc(doc(db, "draws", draw.id), {
        [`roundResultImages.${roundId}`]: "",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showSafeError(error, "未能移除賽果相片，請稍後再試。");
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
                <div className="round-result-current">
                  <a className="round-result-preview" href={resultImage} target="_blank" rel="noreferrer">
                    <img src={resultImage} alt={`第 ${roundNumber} 場賽果`} />
                    查看現有相片
                  </a>
                  <button
                    className="small-btn round-result-remove"
                    type="button"
                    disabled={Boolean(uploadingRoundId)}
                    onClick={() => removeRoundResult(roundId)}
                  >
                    <X size={14} />移除賽果相片
                  </button>
                </div>
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

function CreateDrawForm({ cards, previousDraws = [] }) {
  const isBeta = IS_BETA;
  const [form, setForm] = useState(DEFAULT_DRAW);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [cardSearch, setCardSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(ADMIN_CARD_BATCH_SIZE);
  const [creating, setCreating] = useState(false);
  const hasAppliedPreviousPool = useRef(false);
  const filteredCards = useMemo(
    () => filterCards(cards, cardSearch),
    [cards, cardSearch],
  );
  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleLimit),
    [filteredCards, visibleLimit],
  );

  useEffect(() => {
    setVisibleLimit(ADMIN_CARD_BATCH_SIZE);
  }, [cardSearch]);

  // A new beta live starts from the latest saved pool, while only retaining cards
  // that still exist in the library. This leaves every old live untouched.
  useEffect(() => {
    if (!isBeta || hasAppliedPreviousPool.current || !cards.length || !previousDraws.length) return;
    const latestDraw = [...previousDraws]
      .sort((left, right) => toMillis(right.updatedAt || right.createdAt) - toMillis(left.updatedAt || left.createdAt))[0];
    const availableIds = new Set(cards.map((card) => card.id));
    const inheritedIds = getRoomPoolIds(latestDraw).filter((cardId) => availableIds.has(cardId));
    if (inheritedIds.length) setSelectedCardIds(inheritedIds);
    hasAppliedPreviousPool.current = true;
  }, [cards, isBeta, previousDraws]);

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

  function selectAllPoolCards() {
    setSelectedCardIds(cards.map((card) => card.id));
  }

  function clearPoolCards() {
    setSelectedCardIds([]);
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

      // Keep browser clients out of direct Firestore writes. The admin callable
      // verifies the signed-in administrator before creating the broadcast.
      await httpsCallable(functions, "adminWrite")({
        collection: "draws",
        documentId: drawRef.id,
        mode: "create",
        data: {
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
        },
      });
      await httpsCallable(functions, "adminEnsureDrawSlots")({
        drawId: drawRef.id,
        totalRounds,
        cardCount,
      });
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
          <div className="room-pool-header">
            <div>
              <strong>{isBeta ? "直播卡池" : "房間卡池"}</strong>
              <span>{selectedCardIds.length} 張已選{isBeta && previousDraws.length ? " · 已沿用最近直播卡池" : ""}</span>
            </div>
            {cards.length > 0 && (
              <div className="pool-bulk-actions">
                <button className="small-btn" type="button" onClick={selectAllPoolCards}>全選全部</button>
                <button className="small-btn" type="button" onClick={clearPoolCards} disabled={!selectedCardIds.length}>取消全選</button>
              </div>
            )}
          </div>
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
                {visibleCards.map((card) => (
                  <button
                    className={
                      selectedCardIds.includes(card.id) ? "pool-card selected" : "pool-card"
                    }
                    key={card.id}
                    type="button"
                    onClick={() => toggleRoomCard(card.id)}
                  >
                    {card.imageUrl ? (
                      <img src={getCardThumbUrl(card)} alt={card.name} loading="lazy" />
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
              {visibleCards.length < filteredCards.length && (
                <button className="small-btn player-card-load-more" type="button" onClick={() => setVisibleLimit((current) => current + ADMIN_CARD_BATCH_SIZE)}>
                  顯示更多（尚有 {filteredCards.length - visibleCards.length} 張）
                </button>
              )}
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

// Keeps the anonymous card catalogue image-safe without exposing private card fields.
function getPublicCardPayload(card) {
  return {
    name: String(card?.name || ""),
    imageUrl: String(card?.imageUrl || ""),
    thumbUrl: String(card?.thumbUrl || ""),
    tokenValue: Number(card?.tokenValue || 0),
    modePrices: getCardModePrices(card),
    allowedShareModes: getCardAllowedShareModes(card),
    category: getCardCategory(card),
    active: !card?.archived,
    updatedAt: serverTimestamp(),
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
        thumbUrl: String(libraryCard?.thumbUrl || ""),
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
  let text = String(value ?? "");
  // Player-controlled text (e.g. usernames) must not run as a spreadsheet formula.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
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
        half: Math.round(Number(row.pricehalf || row.halfprice || legacyPrice)),
        fifth: Math.round(Number(row.pricefifth || row.fifthprice || legacyPrice)),
        tenth: Math.round(Number(row.pricetenth || row.tenthprice || legacyPrice)),
      };
      const tokenValue = modePrices.half;
      const pricingMode = String(row.pricingmode || row.pricing || "").trim().toLowerCase() === "manual"
        ? "manual"
        : "formula";
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
        pricingMode,
        allowedShareModes,
        conversionValue: Math.max(0, conversionValue),
        hellCardId,
        imageUrl,
      };
    })
    .filter((row) => row.name && row.allowedShareModes.length && Object.values(row.modePrices).every((value) => value > 0));
}

function createCardDraft(card) {
  return {
    name: card.name || "",
    category: getCardCategory(card),
    allowedShareModes: getCardAllowedShareModes(card),
    conversionValue: Number(card.conversionValue ?? card.tokenValue ?? 10),
    hellCardId: card.hellCardId || "",
    pricingMode: card.pricingMode === "manual" ? "manual" : "formula",
    modePrices: getCardModePrices(card),
    imageFile: null,
  };
}

const DEFAULT_BANNER_STATE = {
  slides: [{ id: "default", imageUrl: DEFAULT_HOMEPAGE_BANNER_URL }],
  intervalSeconds: DEFAULT_BANNER_INTERVAL_SECONDS,
  isCustom: false,
};

function readBannerSettings(data = {}) {
  const slides = (Array.isArray(data.bannerSlides) ? data.bannerSlides : [])
    .map((slide, slideIndex) => ({
      id: String(slide?.id || `slide-${slideIndex}`),
      imageUrl: String(slide?.imageUrl || "").trim(),
    }))
    .filter((slide) => slide.imageUrl)
    .slice(0, MAX_BANNER_SLIDES);
  // Settings saved before the carousel existed only have a single banner URL.
  const legacyUrl = String(data.bannerImageUrl || "").trim();
  if (!slides.length && legacyUrl && !Array.isArray(data.bannerSlides)) slides.push({ id: "legacy", imageUrl: legacyUrl });
  const seconds = Number(data.bannerIntervalSeconds);
  return {
    slides: slides.length ? slides : DEFAULT_BANNER_STATE.slides,
    intervalSeconds: BANNER_INTERVAL_OPTIONS.includes(seconds) ? seconds : DEFAULT_BANNER_INTERVAL_SECONDS,
    isCustom: slides.length > 0,
  };
}

function useHomepageBanner() {
  const [banner, setBanner] = useState(DEFAULT_BANNER_STATE);

  useEffect(() => {
    const settingsRef = doc(db, "publicSiteSettings", "homepage");
    return onSnapshot(settingsRef, (snapshot) => {
      setBanner(readBannerSettings(snapshot.data()));
    }, (error) => {
      console.error("Homepage banner listener failed.", error);
      setBanner(DEFAULT_BANNER_STATE);
    });
  }, []);

  return banner;
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
  const isBeta = IS_BETA;
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

// Listens to specific documents in chunks of 30 (Firestore's "in" limit) so pages
// read only the documents they show instead of whole collections.
function useDocsByIds(collectionName, ids, enabled = true) {
  const idsKey = [...new Set(ids.filter(Boolean).map(String))].sort().join("|");
  const [docsById, setDocsById] = useState({});
  const [loading, setLoading] = useState(Boolean(idsKey));

  useEffect(() => {
    const idList = idsKey ? idsKey.split("|") : [];
    if (!enabled || !idList.length) {
      setDocsById({});
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const chunks = [];
    for (let index = 0; index < idList.length; index += 30) chunks.push(idList.slice(index, index + 30));
    const results = chunks.map(() => null);
    const publish = () => {
      if (!results.every(Boolean)) return;
      setDocsById(Object.fromEntries(results.flat().map((item) => [item.id, item])));
      setLoading(false);
    };
    const stops = chunks.map((chunk, index) => onSnapshot(
      query(collection(db, collectionName), where(documentId(), "in", chunk)),
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        results[index] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        publish();
      },
      (error) => {
        console.error(`${collectionName} listener failed.`, error);
        results[index] = [];
        publish();
      },
    ));
    return () => stops.forEach((stop) => stop());
  }, [collectionName, enabled, idsKey]);

  return { docsById, loading };
}

// The homepage marquee only needs the highest-priced public cards.
function useTopShowcaseCards() {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    const topQuery = query(
      collection(db, "publicCardShowcase"),
      where("active", "==", true),
      orderBy("tokenValue", "desc"),
      limit(24),
    );
    return onSnapshot(topQuery, (snapshot) => {
      setCards(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (error) => {
      console.error("Showcase marquee listener failed.", error);
    });
  }, []);

  return cards;
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

function calculateTokenAmount(hkdAmount) {
  const amount = Number(hkdAmount || 0);
  if (!Number.isSafeInteger(amount) || amount < MIN_CUSTOM_PAYMENT_HKD) return 0;

  let bonusRate = 0;
  if (amount >= 30000) {
    bonusRate = 0.17;
  } else if (amount >= 10000) {
    bonusRate = 0.1;
  } else if (amount >= 3000) {
    bonusRate = 0.08;
  } else if (amount >= CUSTOM_PAYMENT_BONUS_THRESHOLD_HKD) {
    bonusRate = 0.05;
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

// Purchase price always comes from the selected heaven card, even when a hell card is awarded.
function getOriginalDrawPrice(record) {
  return Math.max(0, Number(record?.tokenCost ?? record?.targetCardValue ?? record?.cardValue ?? 0));
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

function isRoomPurchasable(room) {
  return Boolean(room && (
    room.status === "live"
    || (room.status === "scheduled" && room.preorderOpen === true)
  ));
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
  if (isRoundBuyingBlocked(room, roundId)) {
    return { key: "locked", label: "已停止" };
  }
  if (isRoomPurchasable(room) && roundNumber > currentRoundNumber) {
    return { key: "available", label: room?.status === "scheduled" ? "可預購" : "可購買" };
  }
  if (room?.status === "scheduled" && room?.preorderOpen === true) {
    return { key: "available", label: "可預購" };
  }
  if (room?.status !== "live") {
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
    converted: "已轉代幣次數",
  }[status] || "待處理";
}

function getBetaCollectionRecordStatus(record) {
  if (record?.convertedToTokens || record?.collectionStatus === "converted") return "converted";
  if (getDeliveryStage(record) === "delivered") return "shipped";
  if (["shipping", "shipped"].includes(record?.collectionStatus)) return "shipping";
  return "pending";
}

// Older "shipped" records did not distinguish transit from confirmed delivery.
// Keep them in transit until an administrator explicitly marks them delivered.
function getDeliveryStage(record) {
  if (
    record?.collectionStatus === "shipped"
    && (record?.deliveryStatus === "delivered" || record?.deliveredAt)
  ) return "delivered";
  if (
    ["shipping", "shipped"].includes(record?.collectionStatus)
    && (
      record?.deliveryStatus === "in_transit"
      || record?.trackingNumber
      || record?.collectionStatus === "shipped"
    )
  ) return "in_transit";
  return "awaiting_dispatch";
}

function getCollectionDeliveryLabel(record) {
  if (record?.convertedToTokens || record?.collectionStatus === "converted") return "已轉回代幣";
  const deliveryStage = getDeliveryStage(record);
  if (deliveryStage === "delivered") return "已配送";
  if (deliveryStage === "in_transit") return "正在配送";
  if (record?.collectionStatus === "shipping") return "待安排配送";
  return "待處理";
}

function getCollectionStatusBadgeClass(record) {
  if (record?.convertedToTokens || record?.collectionStatus === "converted") return "converted";
  const deliveryStage = getDeliveryStage(record);
  if (deliveryStage === "delivered") return "shipped";
  if (deliveryStage === "in_transit") return "shipping in-transit";
  return record?.collectionStatus === "shipping" ? "shipping awaiting-dispatch" : "pending";
}

function getResultSideLabel(resultSide) {
  if (resultSide === "hell") return "地獄";
  if (resultSide === "heaven") return "天堂";
  return "未設定";
}

// Completed rounds store the public outcome per number on the room document.
function getRoundSlotResultSide(draw, roundId, slot) {
  if (!slot || slot.status === "available") return "";
  const savedSide = draw?.roundResultSides?.[roundId]?.[String(slot.number)] || slot.resultSide;
  return ["heaven", "hell"].includes(savedSide) ? savedSide : "";
}

function getShippingRegionLabel(regionId) {
  return SHIPPING_REGIONS.find((region) => region.id === regionId)?.label || "香港";
}

function getShippingMethodLabel(method) {
  if (method === "sf-pickup") return "順豐自提點";
  if (method === "address-delivery") return "地址配送";
  return "順豐上門";
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
  const digits = compact.replace(/\D/g, "");
  // Numbers typed with the country code but without "+" (e.g. 85291234567) keep it.
  const hasCountryCode = /^852\d{8}$/.test(digits) || /^8860?9\d{8}$/.test(digits);
  const normalized = (compact.startsWith("+") || hasCountryCode
    ? `+${digits}`
    : `+852${digits}`)
    // Taiwan numbers are often typed with the local trunk 0 (+886 0912...).
    .replace(/^\+8860(9\d{8})$/, "+886$1");

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("請輸入有效手機號碼，例如 +852 9123 4567。");
  }
  // SMS delivery is limited to Hong Kong and Taiwan in Firebase Auth.
  if (!/^\+852\d{8}$/.test(normalized) && !/^\+8869\d{8}$/.test(normalized)) {
    throw new Error("手機登入只支援香港（+852）及台灣（+886）號碼。台灣號碼請輸入 +886 9XX XXX XXX。");
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
    "auth/operation-not-allowed": "此手機號碼地區暫不支援 SMS 登入，只支援香港及台灣號碼。",
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
  const message = getSafeErrorMessage(error, fallback);
  // Expected business outcomes (cooldowns, validation) are not reported as failures.
  const expected = /(resource-exhausted|failed-precondition|invalid-argument|already-exists)$/.test(String(error?.code || ""));
  if (!expected && (error?.code || /權限|失敗|未能|Failed|permission|network/i.test(message))) {
    reportClientError({ message: `${message}${error?.message && error.message !== message ? ` | ${error.message}` : ""}`, code: error?.code }, fallback || "showSafeError");
  }
  alert(message);
}

// Admin-owned collections are server-write only. These helpers mirror the
// Firestore write API but send every write through the audited adminBatchWrite.
function encodeAdminValue(value) {
  if (value instanceof FieldValue) {
    if (value.isEqual(serverTimestamp())) return { __adminServerTimestamp: true };
    throw new Error("管理後台不支援此資料操作。");
  }
  if (value instanceof Timestamp) return { __adminTimestampMillis: value.toMillis() };
  if (value instanceof Date) return { __adminTimestampMillis: value.getTime() };
  if (Array.isArray(value)) return value.map(encodeAdminValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, encodeAdminValue(item)]),
    );
  }
  return value;
}

function adminWriteBatch() {
  const operations = [];
  const add = (ref, mode, data) => {
    operations.push({ path: ref.path, mode, ...(data ? { data: encodeAdminValue(data) } : {}) });
  };
  return {
    set(ref, data, options) {
      add(ref, options?.merge ? "upsert" : "set", data);
    },
    update(ref, data) {
      add(ref, "update", data);
    },
    delete(ref) {
      add(ref, "delete");
    },
    async commit() {
      const write = httpsCallable(functions, "adminBatchWrite");
      for (let index = 0; index < operations.length; index += 100) {
        await write({ operations: operations.slice(index, index + 100) });
      }
    },
  };
}

// Reads happen first; the collected writes then commit together on the server.
async function runAdminTransaction(callback) {
  const batch = adminWriteBatch();
  await callback({
    get: (ref) => getDoc(ref),
    set: (ref, data, options) => batch.set(ref, data, options),
    update: (ref, data) => batch.update(ref, data),
    delete: (ref) => batch.delete(ref),
  });
  await batch.commit();
}

async function adminSetDoc(ref, data, options) {
  const batch = adminWriteBatch();
  batch.set(ref, data, options);
  await batch.commit();
}

async function adminUpdateDoc(ref, data) {
  const batch = adminWriteBatch();
  batch.update(ref, data);
  await batch.commit();
}

async function adminAddDoc(collectionRef, data) {
  const ref = doc(collectionRef);
  const batch = adminWriteBatch();
  batch.set(ref, data);
  await batch.commit();
  return ref;
}

async function deleteRoomWithChildren(drawId) {
  await httpsCallable(functions, "adminDeleteDraw")({ drawId });
}

async function ensureRoomRoundSlots(drawId, roundNumbers, cardCount) {
  await httpsCallable(functions, "adminEnsureDrawSlots")({
    drawId,
    totalRounds: Math.max(0, ...roundNumbers),
    cardCount,
  });
}

async function updateAssignedRecordsForCard(cardId, updates) {
  const recordsSnapshot = await getDocs(
    query(collection(db, "drawRecords"), where("cardId", "==", cardId)),
  );

  for (let index = 0; index < recordsSnapshot.docs.length; index += 450) {
    const batch = adminWriteBatch();
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
    const batch = adminWriteBatch();
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

// Every scheduled date is a separate room so its slots, purchases, results, and chat never mix with another day.
function getScheduledLiveRooms(rooms) {
  return (Array.isArray(rooms) ? rooms : [])
    .filter((room) => room?.status === "scheduled")
    .map((room) => {
      const scheduledDate = room.scheduledAt instanceof Timestamp
        ? room.scheduledAt.toDate()
        : new Date(room.scheduledAt || room.roundSchedules?.["round-001"] || "");
      return Number.isNaN(scheduledDate.getTime()) ? null : {
        ...room,
        scheduledAt: scheduledDate.toISOString(),
        scheduledDate,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.scheduledDate.getTime() - right.scheduledDate.getTime());
}

// Date picker helpers keep the administrator's local calendar date instead of converting it to UTC too early.
function addLocalDays(value, dayCount) {
  const date = new Date(value);
  date.setDate(date.getDate() + dayCount);
  return date;
}

function getDateInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildLocalDateTime(dateValue, hourValue, minuteValue) {
  const parts = String(dateValue || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  const [year, month, day] = parts;
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
  ) return null;
  return date;
}

// Formats the public schedule in Traditional Chinese with an explicit weekday and time.
function formatFutureLiveDate(value) {
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function getCardThumbUrl(card) {
  return String(card?.thumbUrl || card?.imageUrl || "");
}

// Stores an image file in Cloud Storage through the audited admin function.
async function uploadAdminImage(dataUrl, scope, ownerId) {
  const imageBlob = dataUrlToBlob(dataUrl);
  const { data } = await httpsCallable(functions, "adminUploadImage")({
    scope,
    ownerId,
    contentType: imageBlob.type || "image/webp",
    base64: await blobToBase64(imageBlob),
  });
  return data.url;
}

// Cards keep a full image for detail views and a small thumbnail for lists.
async function createCardImageSet(source, ownerId) {
  const [fullDataUrl, thumbDataUrl] = await Promise.all([
    imageFileToCompressedDataUrl(source, CARD_IMAGE_COMPRESSION),
    imageFileToCompressedDataUrl(source, CARD_THUMB_COMPRESSION),
  ]);
  const [imageUrl, thumbUrl] = await Promise.all([
    uploadAdminImage(fullDataUrl, "card", ownerId),
    uploadAdminImage(thumbDataUrl, "card", ownerId),
  ]);
  return { imageUrl, thumbUrl };
}

async function resolveImportedCardImage(url, ownerId) {
  if (String(url).startsWith("data:image/")) {
    return { ...await createCardImageSet(dataUrlToBlob(url), ownerId), imageMode: "storage" };
  }
  return { imageUrl: url, thumbUrl: "", imageMode: "external-url" };
}

async function uploadCompressedImage(file, path) {
  const dataUrl = await imageFileToCompressedDataUrl(file, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.76,
    minQuality: 0.62,
    targetBytes: 420 * 1024,
  });
  // Convert the local data URL directly. Using fetch(data:) can fail in Chrome/Safari
  // before Firebase Storage is contacted, resulting in the unhelpful "Failed to fetch" alert.
  const imageBlob = dataUrlToBlob(dataUrl);
  const drawResult = String(path).match(/^draw-results\/([^/]+)\//);
  if (drawResult) {
    const { data } = await httpsCallable(functions, "adminUploadImage")({
      scope: "draw-result",
      ownerId: drawResult[1],
      contentType: imageBlob.type || "image/webp",
      base64: await blobToBase64(imageBlob),
    });
    return data.url;
  }
  throw new Error("圖片上載路徑不正確。");
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("壓縮圖片格式不正確，請重新選擇圖片。");

  const mimeType = match[1] || "image/webp";
  const encodedData = match[3] || "";
  let binary;
  try {
    binary = match[2] ? atob(encodedData) : decodeURIComponent(encodedData);
  } catch (error) {
    throw new Error("未能讀取壓縮圖片，請重新選擇圖片。", { cause: error });
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
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
    const batch = adminWriteBatch();
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

// Card assignment is the acquisition moment; older records fall back to their purchase time.
function getRecordAcquiredAt(record) {
  return record?.assignedAt || record?.createdAt || record?.updatedAt || null;
}

function formatRecordAcquiredTime(record) {
  const acquiredAt = getRecordAcquiredAt(record);
  return acquiredAt ? formatDate(acquiredAt) : "--";
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
