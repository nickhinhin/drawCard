import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyBJEFwKf6hGSEv0gR-amTuKk0FJ7igNGE4",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "drawcard-26e01.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "drawcard-26e01",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "drawcard-26e01.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "814745985336",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:814745985336:web:218fb3f397cf5e2c5961cd",
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-T7MSG09PE6",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export const analyticsPromise = isSupported()
  .then((supported) => (supported ? getAnalytics(app) : null))
  .catch(() => null);
