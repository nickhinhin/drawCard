// 充值代幣 (TopUp.jsx) and 帳戶設定 (Account.jsx) on /beta, built to the revamp design
// with the main site's rules and server functions.
import React from "react";
import Account from "./Account.jsx";
import TopUp from "./TopUp.jsx";
import { MembersOnly } from "../ui.jsx";
import { CSS as TOPUP_CSS } from "./TopUpPage.jsx";
import { CSS as ACCOUNT_CSS } from "./AccountPage.jsx";

const COIN_ICON = <><circle cx="12" cy="12" r="9"></circle><path d="M13 7.5 9.5 12.5H12l-1 4 3.5-5H12z"></path></>;
const USER_ICON = <><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></>;

// Dev-only layout check without signing in (/beta/topup?sampleProfile=1); not in production builds.
const SAMPLE = import.meta.env.DEV && new URLSearchParams(window.location.search).has("sampleProfile")
  ? {
    profile: { uid: "sample", username: "sample", tokens: 1200 },
    authUser: { uid: "sample", phoneNumber: "+85200000000", providerData: [{ providerId: "phone" }, { providerId: "password" }] },
  } : null;

export function TopUpRoute({ session: real }) {
  const session = SAMPLE ? { ...real, ...SAMPLE, ready: true } : real;
  if (!session.ready) return <MembersOnly css={TOPUP_CSS} title="充值代幣" icon={COIN_ICON} />;
  return <TopUp profile={session.profile} />;
}

export function AccountRoute({ session: real }) {
  const session = SAMPLE ? { ...real, ...SAMPLE, ready: true } : real;
  if (!session.ready) return <MembersOnly css={ACCOUNT_CSS} title="帳戶設定" icon={USER_ICON} />;
  return <Account session={session} />;
}
