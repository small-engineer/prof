/**
 * @fileoverview ギャラリー用ライトボックス（フルスクラッチ）
 * - data-lightbox 属性を持つ <img> を対象に拡大表示
 * - ESC で閉じる、←/→ で前後移動、クリックで背景閉じる
 * - SPA でも二重初期化しない
 * @package
 */

let inited = false;

export function initGalleryLightbox() {
  if (inited) return;
  inited = true;

  // ルート要素を1回だけ生成
  const root = document.createElement("div");
  root.className = "lb";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="lb__dialog" role="dialog" aria-modal="true" aria-label="画像ビューア">
      <div class="lb__imgwrap">
        <img class="lb__img" alt="" />
        <button type="button" class="lb__btn lb__prev" aria-label="前の画像">‹</button>
        <button type="button" class="lb__btn lb__next" aria-label="次の画像">›</button>
        <button type="button" class="lb__btn lb__close" aria-label="閉じる">×</button>
      </div>
      <div class="lb__caption">
        <span class="lb__name"></span>
        <span class="lb__year"></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const imgEl = root.querySelector(".lb__img");
  const nameEl = root.querySelector(".lb__name");
  const yearEl = root.querySelector(".lb__year");

  let items = [];
  let index = 0;

  // 対象ノードを収集する関数（再描画時にも呼べる）
  function collect() {
    const nodeList = document.querySelectorAll("img[data-lightbox]");
    items = Array.from(nodeList).map((img, i) => {
      const figure = img.closest("figure");
      const name =
        figure?.querySelector(".gallery__name, .foods__name")?.textContent?.trim() ||
        img.alt ||
        `Image ${i + 1}`;
      const year =
        img.dataset.year ||
        figure?.querySelector(".gallery__meta, .foods__meta")?.textContent?.trim() ||
        "";
      return { el: img, src: img.currentSrc || img.src, name, year };
    });
  }
  collect();

  // 表示処理
  function openAt(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const it = items[index];

    imgEl.classList.remove("is-ready");
    imgEl.src = ""; // 旧画像を消す
    nameEl.textContent = it.name;
    yearEl.textContent = it.year || "";

    // 読み込み完了後にフェードイン
    imgEl.onload = () => imgEl.classList.add("is-ready");
    imgEl.src = it.src;

    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden"; // 背景スクロール抑止
    root.focus();
  }

  function close() {
    root.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  function next() {
    openAt(index + 1);
  }
  function prev() {
    openAt(index - 1);
  }

  // イベント委譲（画像クリック）
  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const img = target.closest("img[data-lightbox]");
    if (!img) return;

    ev.preventDefault();
    collect(); // その時点のDOMを再収集
    const i = items.findIndex((it) => it.el === img);
    if (i >= 0) openAt(i);
  });

  // 背景クリックで閉じる
  root.addEventListener("click", (ev) => {
    if (ev.target === root) close();
  });

  // ボタン操作
  root.querySelector(".lb__close")?.addEventListener("click", close);
  root.querySelector(".lb__next")?.addEventListener("click", next);
  root.querySelector(".lb__prev")?.addEventListener("click", prev);

  // キーボード操作
  window.addEventListener("keydown", (ev) => {
    if (root.getAttribute("aria-hidden") === "true") return;
    if (ev.key === "Escape") close();
    else if (ev.key === "ArrowRight") next();
    else if (ev.key === "ArrowLeft") prev();
  });

  // SPAのページ破棄時に軽く掃除
  document.addEventListener(
    "pagehide",
    () => {
      close();
      // 要素は保持して再訪時も即利用（initedフラグで多重生成防止）
    },
    { once: true }
  );
}
