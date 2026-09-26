import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { IS_BETA } from "./appVariant.js";

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyAm3d8LboRVkDvKEgyjUY8rScMgdezGR3U",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "livedraw-7e3c2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "livedraw-7e3c2",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "livedraw-7e3c2.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1088314947548",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:1088314947548:web:de46447738529f6689c119",
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-1T7X8R5R18",
};

export const app = initializeApp(firebaseConfig);
// Local UI testing only: `vite` dev server with VITE_USE_EMULATORS=true talks to the
// Firebase emulators. import.meta.env.DEV is false in production builds, so this
// branch (and the emulator hosts) is removed from the deployed bundle.
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";
// App Check is switched off (25/9/2026): browsers with a low reCAPTCHA score were locked
// out for 24 h. Set APP_CHECK_ENABLED back to true (and re-enforce in the console) to restore it.
const APP_CHECK_ENABLED = false;
const appCheckSiteKey = useEmulators || !APP_CHECK_ENABLED ? "" : import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
export const appCheck = appCheckSiteKey
  ? initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
  : null;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// The offline cache lives in IndexedDB. If that database is corrupted (a crashed
// browser, low storage), Firestore throws internal assertions and the page breaks.
// recoverFromCorruptLocalCache() then switches this browser to an in-memory cache
// for a day, deletes the damaged database and reloads once.
const MEMORY_CACHE_UNTIL_KEY = "livedraw-firestore-memory-cache-until";
const CACHE_RECOVERED_KEY = "livedraw-firestore-cache-recovered";
const CORRUPT_CACHE_PATTERN = /FIRESTORE .*INTERNAL ASSERTION FAILED|IndexedDB/i;

function memoryCacheRequested() {
  try {
    return Number(localStorage.getItem(MEMORY_CACHE_UNTIL_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

const memoryCacheMode = memoryCacheRequested();

// Keep confirmed Firestore data across reloads so repeat visits can render immediately.
export const db = initializeFirestore(app, {
  localCache: memoryCacheMode
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// In memory mode the damaged database is not open here, so it can be removed.
if (memoryCacheMode) {
  indexedDB.databases?.()
    .then((databases) => databases
      .filter((item) => String(item.name || "").startsWith("firestore/"))
      .forEach((item) => indexedDB.deleteDatabase(item.name)))
    .catch(() => {});
}

export function recoverFromCorruptLocalCache(message) {
  if (memoryCacheMode || !CORRUPT_CACHE_PATTERN.test(String(message || ""))) return false;
  try {
    // One automatic reload per tab session, so a different fault cannot loop.
    if (sessionStorage.getItem(CACHE_RECOVERED_KEY)) return false;
    sessionStorage.setItem(CACHE_RECOVERED_KEY, "1");
    localStorage.setItem(MEMORY_CACHE_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  } catch {
    return false;
  }
  window.setTimeout(() => window.location.reload(), 300);
  return true;
}
export const functions = getFunctions(app, "asia-east2");

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export const analyticsPromise = new Promise((resolve) => {
  if (IS_BETA) {
    resolve(null);
    return;
  }

  const loadAnalytics = () => {
    import("firebase/analytics")
      .then(async ({ getAnalytics, isSupported }) => (
        (await isSupported()) ? getAnalytics(app) : null
      ))
      .then(resolve)
      .catch(() => resolve(null));
  };

  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(loadAnalytics, { timeout: 5000 });
    } else {
      loadAnalytics();
    }
  }, 8000);
});
