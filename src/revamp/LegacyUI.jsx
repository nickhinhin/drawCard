import React, { useEffect, useState } from "react";

// The /beta site reuses a few proven dialogs from the current site (sign-in, player
// name, phone password). Their stylesheets set global rules (body, input, button), so
// they are loaded only when such a dialog opens and are scoped to .ld-legacy.
let cssPromise = null;

function splitTopLevelBlocks(css) {
  // Returns [scopable, global]: @keyframes / @font-face / @import must stay top level.
  const keep = [];
  const lift = [];
  let i = 0;
  while (i < css.length) {
    const at = css.slice(i).search(/@(-webkit-)?keyframes|@font-face|@import/);
    if (at < 0) { keep.push(css.slice(i)); break; }
    const start = i + at;
    keep.push(css.slice(i, start));
    if (css.startsWith("@import", start)) {
      const end = css.indexOf(";", start) + 1;
      lift.push(css.slice(start, end));
      i = end;
      continue;
    }
    let depth = 0;
    let j = css.indexOf("{", start);
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    lift.push(css.slice(start, j + 1));
    i = j + 1;
  }
  return [keep.join(""), lift.join("\n")];
}

function scopeCss(css) {
  const [scopable, global] = splitTopLevelBlocks(css);
  const body = scopable
    .replace(/:root\b/g, ":scope")
    .replace(/(^|[\s,{}>+~(])(html|body)(?![\w-])/g, "$1:scope");
  return `${global}\n@scope (.ld-legacy) {\n${body}\n}`;
}

function loadLegacyCss() {
  if (!cssPromise) {
    cssPromise = Promise.all([import("../styles.css?inline"), import("../beta.css?inline")]).then(([base, beta]) => {
      const style = document.createElement("style");
      style.dataset.legacy = "true";
      style.textContent = scopeCss(base.default + "\n" + beta.default);
      document.head.appendChild(style);
    });
  }
  return cssPromise;
}

export default function LegacyUI({ children, className = "" }) {
  const [ready, setReady] = useState(Boolean(document.querySelector("style[data-legacy]")));
  useEffect(() => {
    let alive = true;
    loadLegacyCss().then(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);
  if (!ready) return null;
  // Scoped rules only match descendants of the scope root, so .beta-mode sits one level in.
  return (
    <div className="ld-legacy" style={{ background: "transparent", minHeight: 0 }}>
      <div className={`beta-mode ${className}`.trim()} style={{ background: "transparent", minWidth: 0 }}>{children}</div>
    </div>
  );
}
