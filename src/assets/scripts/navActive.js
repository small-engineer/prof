/**
 * @fileoverview ナビゲーションリンクのアクティブ状態を制御するユーティリティ
 * @package
 */

/**
 * 現在のパスに応じてis-activeを付与／除去
 * @function updateActiveLink
 * @return {void}
 */
export function updateActiveLink() {
  const links = document.querySelectorAll(".site-header__link");

  if (!links.length) return;

  const current = location.pathname.replace(/\/$/, "");

  links.forEach((link) => {
    const linkPath = (link.dataset.path || "").replace(/\/$/, "");
    link.classList.toggle("is-active", linkPath === current);
  });
}
