import React from "react";

// The revamp site lives under /beta until the team signs it off.
export const BASE = "/beta";

const PAGE_ROUTES = {
  index: "/",
  LiveDraw: "/live",
  SelfDraw: "/selfdraw",
  Results: "/results",
  ResultDetail: "/result",
  TopUp: "/topup",
  Records: "/records",
  MyCards: "/cards",
  Account: "/account",
};

// Design links point at "LiveDraw.html" etc.; map them onto /beta routes.
export function route(href) {
  if (typeof href !== "string") return href;
  const m = href.match(/^([A-Za-z0-9]+)(?:\.dc)?\.html(.*)$/);
  if (m && PAGE_ROUTES[m[1]]) return BASE + PAGE_ROUTES[m[1]] + m[2];
  return href;
}

export function asset(value) {
  if (typeof value !== "string") return value;
  return value.replace(/(^|[("'\s,])images\//g, "$1/revamp/images/");
}

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, "", to);
  else window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Base class for the page logic carried over from the design. Each page
// supplies renderVals() and a template(v); template names resolve against the
// render values first, then props, then the logic instance itself.
export class DCLogic extends React.Component {
  render() {
    const vals = this.renderVals ? this.renderVals() : {};
    const v = Object.assign(Object.create(this), this.props, vals);
    return this.template(v);
  }
}
