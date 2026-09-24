import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { IS_ADMIN_SITE, IS_BETA } from "./appVariant.js";
import { installGlobalErrorReporting } from "./errorReporting.js";
import "./styles.css";
import "./beta.css";

if (IS_BETA) {
  document.body.classList.add("beta-mode");
  document.title = "LiveDraw TCG｜直播抽卡";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#07070a");
  document.querySelector('meta[name="description"]')?.setAttribute(
    "content",
    "LiveDraw TCG 直播抽卡、代幣申請及卡牌配送平台。",
  );
  document.querySelector('link[rel="icon"]')?.setAttribute("href", "/livedraw-logo.svg");
}

if (IS_ADMIN_SITE) {
  document.title = "LiveDraw 管理後台";
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex, nofollow";
  document.head.appendChild(robots);
}

installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
