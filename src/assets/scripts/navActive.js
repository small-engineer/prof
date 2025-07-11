/**
 * @fileoverview ナビゲーションリンクのアクティブ状態を制御するユーティリティ
 * @package
 */

/**
 * GitHub Pages対応：リポジトリ名を除去してパスを正規化
 * @param {string} path location.pathnameなど
 * @return {string}
 */
function normalizePath(path) {
  const repoBase =
    location.hostname === "localhost"
      ? ""
      : "/" + location.pathname.split("/")[1];
  return path.startsWith(repoBase) ? path.slice(repoBase.length) || "/" : path;
}

/**
 * 現在のパスに応じてis-activeを付与／除去
 * @function updateActiveLink
 * @return {void}
 */
export function updateActiveLink() {
  const links = document.querySelectorAll(".site-header__link");
  if (!links.length) return;

  const current = normalizePath(location.pathname).replace(/\/$/, "");

  links.forEach((link) => {
    const linkPath = normalizePath(link.getAttribute("href") || "").replace(
      /\/$/,
      ""
    );
    link.classList.toggle("is-active", linkPath === current);
  });
}
