import React, { useEffect, useState } from "react";
import { BASE, navigate } from "./runtime.jsx";
import { SessionProvider, useSession } from "./session.jsx";
import Shell from "./Shell.jsx";
import HomePage from "./pages/HomePage.jsx";
import SelfDrawPage from "./pages/SelfDrawPage.jsx";
import RecordsPage from "./pages/RecordsPage.jsx";
import MyCardsPage from "./pages/MyCardsPage.jsx";
import { LiveRoute, ResultDetailRoute, ResultsRoute } from "./pages/LivePages.jsx";
import { AccountRoute, TopUpRoute } from "./pages/MemberToolsPages.jsx";

// demo: the page still shows the design's sample data (not yet connected to Firebase).
const PAGES = {
  "/": { Page: HomePage, active: "home", title: "LiveDraw TCG 首頁" },
  "/live": { Page: LiveRoute, active: "live", title: "LiveDraw TCG 直播抽卡" },
  "/selfdraw": { Page: SelfDrawPage, active: "selfdraw", title: "LiveDraw TCG 自助抽卡：天堂與地獄" },
  "/results": { Page: ResultsRoute, active: "results", title: "LiveDraw TCG 過往直播及賽果" },
  "/result": { Page: ResultDetailRoute, active: "results", title: "LiveDraw TCG 直播賽果詳情" },
  "/topup": { Page: TopUpRoute, active: "topup", title: "LiveDraw TCG 充值代幣及 VIP 等級" },
  "/records": { Page: RecordsPage, active: "records", title: "LiveDraw TCG 我的紀錄" },
  "/cards": { Page: MyCardsPage, active: "cards", title: "LiveDraw TCG 我的卡牌" },
  "/account": { Page: AccountRoute, active: "account", title: "LiveDraw TCG 帳戶設定" },
};

function currentPath() {
  let path = window.location.pathname;
  if (path.startsWith(BASE)) path = path.slice(BASE.length);
  return path.replace(/\/+$/, "") || "/";
}

function DemoNotice() {
  return (
    <div role="note" className="ld-demo" style={{ position: "fixed", top: "76px", right: "16px", zIndex: 50, padding: "6px 12px", borderRadius: "999px", background: "rgba(58, 42, 0, 0.92)", border: "1px solid #fdc800", color: "#ffe390", fontSize: "12px", lineHeight: "16px", fontWeight: 700, pointerEvents: "none" }}>
      示範資料：此頁尚未連接真實數據
    </div>
  );
}

function Routed({ path, entry }) {
  const session = useSession();
  const { Page } = entry;
  return (
    <Shell active={entry.active}>
      <Page key={path} session={session} />
      {entry.demo && <DemoNotice />}
    </Shell>
  );
}

export default function RevampApp() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onPop = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const entry = PAGES[path];
  useEffect(() => {
    if (!entry) navigate(BASE + "/", { replace: true });
    else document.title = entry.title;
  }, [entry]);

  // Keep in-site links inside the single-page app.
  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.target === "_blank") return;
    const href = anchor.getAttribute("href");
    if (href === "#") { event.preventDefault(); return; }
    if (!href || !href.startsWith(BASE)) return;
    event.preventDefault();
    if (href !== window.location.pathname + window.location.search) navigate(href);
  };

  if (!entry) return null;
  return (
    <SessionProvider>
      <div onClick={onClick}>
        <Routed path={path} entry={entry} />
      </div>
    </SessionProvider>
  );
}
