import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { IS_ADMIN_SITE, IS_BETA } from "./appVariant.js";
import { installGlobalErrorReporting } from "./errorReporting.js";
import "./styles.css";
import "./beta.css";

if (IS_BETA) {
  document.body.classList.add("beta-mode");
  document.title = "LiveDraw線上直播抽卡平台";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#07070a");
  document.querySelector('meta[name="description"]')?.setAttribute(
    "content",
    "LiveDraw 提供線上直播抽卡體驗，集合人氣 TCG 卡牌及熱門卡包，即時參與抽卡、觀看直播開卡過程，享受更刺激透明的收藏卡牌體驗。",
  );
  document.querySelector('link[rel="icon"]')?.setAttribute("href", "/livedraw-logo.svg");
}

if (IS_ADMIN_SITE) {
  document.title = "LiveDraw 管理後台";
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex, nofollow";
  document.head.appendChild(robots);
} else {
  // Keep the Ads tag in the public page head without tracking the admin site.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", "AW-18481965647");
  const googleTag = document.createElement("script");
  googleTag.async = true;
  googleTag.src = "https://www.googletagmanager.com/gtag/js?id=AW-18481965647";
  document.head.appendChild(googleTag);
}

installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
