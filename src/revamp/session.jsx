import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, googleProvider } from "../firebase";
import {
  AuthDialog,
  GiftModal,
  PENDING_AFFILIATE_CODE_KEY,
  PENDING_REGISTRATION_KEY,
  PhonePasswordGate,
  UsernameGate,
  captureAffiliateCode,
  ensureUsernameClaim,
  formatTokenNumber,
  getSafeErrorMessage,
  getVipState,
  hasGoogleProvider,
  hasPhonePassword,
  isPhoneAccount,
  normalizeUsername,
  readPendingRegistration,
  useSignupGift,
  useVipProgram,
} from "../App.jsx";
import LegacyUI from "./LegacyUI.jsx";

// Signed-in member, profile and VIP standing for every /beta page. The rules are the
// same as the current site (see App() in src/App.jsx); only the presentation differs.
export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [dialog, setDialog] = useState(null); // { notice, action }
  const [usernameConflict, setUsernameConflict] = useState(false);
  const [signInProvider, setSignInProvider] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordGateDone, setPasswordGateDone] = useState(false);
  const [welcomeBonus, setWelcomeBonus] = useState(0);
  const signupGift = useSignupGift();
  // VIP settings are readable by members only.
  const vipTiers = useVipProgram(Boolean(authUser));
  const popupPending = useRef(false);

  useEffect(() => { captureAffiliateCode(); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setAuthReady(true), 6000);
    const stop = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timer);
      setAuthUser(user);
      setProfileError("");
      setAuthReady(true);
    }, (error) => {
      window.clearTimeout(timer);
      setAuthError(getSafeErrorMessage(error, "登入失敗，請重新整理後再試。"));
      setAuthReady(true);
    });
    return () => { window.clearTimeout(timer); stop(); };
  }, []);

  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      if (error?.code !== "auth/no-auth-event") setAuthError(getSafeErrorMessage(error, "登入失敗，請再試一次。"));
    });
  }, []);

  useEffect(() => {
    setPasswordGateDone(false);
    if (!authUser) { setIsAdmin(false); setSignInProvider(""); return undefined; }
    let cancelled = false;
    authUser.getIdTokenResult(true).then((token) => {
      if (cancelled) return;
      setIsAdmin(token.claims.admin === true);
      setSignInProvider(token.signInProvider || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authUser]);

  // Same account bootstrap as the current site: create the member on first sign-in.
  useEffect(() => {
    if (!authUser) { setProfile(null); setProfileError(""); return undefined; }
    const ensureAccount = httpsCallable(functions, "ensureAffiliateAccount", { limitedUseAppCheckTokens: true });
    const pending = readPendingRegistration();
    let started = false;
    return onSnapshot(doc(db, "users", authUser.uid), async (snapshot) => {
      if (snapshot.exists()) {
        setProfile({ id: snapshot.id, ...snapshot.data() });
        setProfileError("");
        window.localStorage.removeItem(PENDING_AFFILIATE_CODE_KEY);
        window.sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
        return;
      }
      if (started) return;
      started = true;
      try {
        const data = {
          referralCode: captureAffiliateCode(),
          username: normalizeUsername(pending.displayName || ""),
          displayName: pending.displayName || authUser.displayName || "",
          phoneNumber: pending.phoneNumber || authUser.phoneNumber || "",
          ageConfirmed: pending.ageConfirmed === true,
        };
        await authUser.getIdToken(true);
        let created;
        try {
          created = await ensureAccount(data);
        } catch (error) {
          if (error?.code !== "functions/unauthenticated") throw error;
          await authUser.getIdToken(true);
          created = await ensureAccount(data);
        }
        if (created?.data?.created && created.data.signupBonusTokens > 0) setWelcomeBonus(created.data.signupBonusTokens);
      } catch (error) {
        started = false;
        setProfileError(getSafeErrorMessage(error, "未能建立會員帳戶，請重新登入。"));
      }
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !profile?.username) { setUsernameConflict(false); return undefined; }
    let cancelled = false;
    ensureUsernameClaim(authUser.uid, profile.username)
      .then(() => { if (!cancelled) setUsernameConflict(false); })
      .catch(() => { if (!cancelled) setUsernameConflict(true); });
    return () => { cancelled = true; };
  }, [authUser, profile?.username]);

  // The current site's pages ask for login with this event; keep it working here too.
  useEffect(() => {
    const open = (event) => setDialog({ notice: String(event.detail?.notice || ""), action: String(event.detail?.action || "") });
    window.addEventListener("beta-open-login", open);
    return () => window.removeEventListener("beta-open-login", open);
  }, []);

  const openLogin = useCallback((notice = "", action = "") => setDialog({ notice, action }), []);

  const googleLogin = useCallback(async () => {
    if (popupPending.current) return;
    popupPending.current = true;
    setAuthError("");
    setSigningIn(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
      setDialog(null);
    } catch (error) {
      const messages = {
        "auth/popup-blocked": "瀏覽器已封鎖 Google 登入視窗，請允許彈出式視窗後再試。",
        "auth/popup-closed-by-user": "Google 登入視窗已關閉，請再試一次。",
        "auth/cancelled-popup-request": "上一個 Google 登入視窗已取消，請再試一次。",
      };
      setAuthError(messages[error?.code] || getSafeErrorMessage(error, "Google 登入失敗，請再試一次。"));
    } finally {
      popupPending.current = false;
      setSigningIn(false);
    }
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const needsUsername = Boolean(authUser && profile && (!profile.username || usernameConflict));
  const needsPhonePassword = Boolean(
    authUser && profile && !needsUsername && isPhoneAccount(authUser) && !passwordGateDone
      && (signInProvider === "phone" || (!hasPhonePassword(authUser) && !hasGoogleProvider(authUser))),
  );
  const ready = Boolean(profile) && !needsUsername && !needsPhonePassword;
  const deposit = Number(profile?.totalDeposits || 0);
  const vip = useMemo(() => getVipState(vipTiers, deposit), [vipTiers, deposit]);

  const value = useMemo(() => ({
    authReady, authUser, profile, isAdmin, signedIn: Boolean(authUser), ready, vip, deposit,
    tokens: Math.round(Number(profile?.tokens || 0)),
    username: profile?.username || authUser?.displayName || "",
    openLogin, logout,
  }), [authReady, authUser, profile, isAdmin, ready, vip, deposit, openLogin, logout]);

  return (
    <SessionContext.Provider value={value}>
      {children}
      {dialog && !authUser && (
        <LegacyUI>
          <AuthDialog
            authError={authError}
            isBeta
            notice={dialog.notice}
            initialAction={dialog.action}
            onClose={() => setDialog(null)}
            onGoogleLogin={googleLogin}
            signingIn={signingIn}
            signupGift={signupGift}
          />
        </LegacyUI>
      )}
      {(needsUsername || needsPhonePassword || profileError) && (
        <LegacyUI className="ld-gate">
          <div className="modal-backdrop" role="presentation">
            <div className="modal" role="dialog" aria-modal="true">
              {profileError ? (
                <section className="panel empty-state" role="alert">
                  <h1>未能載入會員帳戶</h1>
                  <p>{profileError}</p>
                  <div className="action-row">
                    <button className="primary-btn" type="button" onClick={() => window.location.reload()}>重新載入</button>
                    <button className="ghost-btn" type="button" onClick={logout}>登出</button>
                  </div>
                </section>
              ) : needsUsername ? (
                <UsernameGate authUser={authUser} profile={profile} conflict={usernameConflict} />
              ) : (
                <PhonePasswordGate
                  authUser={authUser}
                  resetting={hasPhonePassword(authUser)}
                  onDone={() => { setSignInProvider("password"); setPasswordGateDone(true); }}
                  onLogout={logout}
                />
              )}
            </div>
          </div>
        </LegacyUI>
      )}
      {welcomeBonus > 0 && (
        <LegacyUI>
          <GiftModal
            title="歡迎加入 LiveDraw！"
            body={`新會員禮物 ${formatTokenNumber(welcomeBonus)} 代幣已存入你的帳戶，可立即用於抽卡。`}
            actionLabel="開始抽卡"
            onAction={() => setWelcomeBonus(0)}
            onClose={() => setWelcomeBonus(0)}
          />
        </LegacyUI>
      )}
    </SessionContext.Provider>
  );
}
