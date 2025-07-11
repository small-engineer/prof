/**
 * @fileoverview アプリのエントリーポイント
 * ページロード時ルーターを初期化
 * @module main
 * @requires module:components/header
 * @requires module:components/router
 * @package
 */

import { loadHeader } from "./header.js";
import { initRouter, destroyRouter } from "./router/index.js";

let router = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadHeader();
  router = initRouter();

  const frame = document.createElement("div");
  frame.className = "page-frame";
  document.body.appendChild(frame);

  requestAnimationFrame(() => {
    frame.classList.add("fade-bg");
  });
});

window.addEventListener("beforeunload", () => {
  destroyRouter();
});
