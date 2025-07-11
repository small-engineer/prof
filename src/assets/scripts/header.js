/**
 * @fileoverview ヘッダーを読み込んで挿入し、アクティブリンクを設定する
 * @package
 */

import { updateActiveLink } from "./navActive.js";

/**
 * ヘッダー HTML を fetch して #site-header に挿入する
 * @async
 * @function loadHeader
 * @return {Promise<void>}
 */
export async function loadHeader() {
  const host = document.getElementById("site-header");
  if (!host) throw new Error("#site-header is not found");

  const res = await fetch("assets/components/header.html");
  host.innerHTML = await res.text();

  updateActiveLink();
}
