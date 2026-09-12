import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./beta.css";

if (import.meta.env.VITE_APP_VARIANT === "beta") {
  document.body.classList.add("beta-mode");
  document.title = "LiveDraw TCG｜直播抽卡";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#07070a");
  document.querySelector('meta[name="description"]')?.setAttribute(
    "content",
    "LiveDraw TCG 直播抽卡、代幣申請及卡牌配送平台。",
  );
  document.querySelector('link[rel="icon"]')?.setAttribute("href", "/livedraw-logo.svg");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
