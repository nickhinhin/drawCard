import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
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
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
export const appCheck = appCheckSiteKey
  ? initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
  : null;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Keep confirmed Firestore data across reloads so repeat visits can render immediately.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-east2");

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
