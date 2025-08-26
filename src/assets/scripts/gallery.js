/** @type {boolean} ライトボックスの初期化状態を保持するフラグ */
let inited = false;

/**
 * ページ内の遅延読み込み画像を初期化する
 *
 * @remarks
 * - `loading="lazy"` を持つ画像に `lazyload` クラスを付与して IntersectionObserver で遅延読み込みを制御
 * - `src` を `data-src` に一時的に移動させて手動で読み込み制御
 * - ページ完全読込後にも未読み込み画像があればフォールバックで読み込む
 */
function initLazyImages() {
  const LZ_SELECTOR = 'img.gallery__image[loading="lazy"], img.foods__image[loading="lazy"]';
  const imgs = Array.from(document.querySelectorAll(LZ_SELECTOR));

  for (const img of imgs) {
    if (img.classList.contains('lazyload')) continue;

    // src が存在し data-src が未定義の場合は移し替え
    if (img.getAttribute('src') && !img.dataset.src) {
      img.dataset.src = img.getAttribute('src');
      img.removeAttribute('src');
    }

    img.classList.add('lazyload');
  }

  /**
   * 画像の読み込み完了または失敗時に `is-loaded` クラスを付与する
   * @param {HTMLImageElement} img 対象の画像要素
   */
  function markLoaded(img) {
    img.classList.add('is-loaded');
  }

  const io = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = /** @type {HTMLImageElement} */ (entry.target);
      const src = img.dataset.src;
      if (src && !img.getAttribute('src')) {
        img.addEventListener('load', () => markLoaded(img), { once: true });
        img.addEventListener('error', () => markLoaded(img), { once: true });
        img.setAttribute('src', src);
      }
      obs.unobserve(img);
    }
  }, {
    root: null,
    rootMargin: '200px 0px',
    threshold: 0.01,
  });

  imgs.forEach((img) => io.observe(img));

  window.addEventListener('load', () => {
    document.querySelectorAll('img.lazyload').forEach((img) => {
      if (!img.getAttribute('src') && img.dataset.src) {
        img.addEventListener('load', () => markLoaded(img), { once: true });
        img.addEventListener('error', () => markLoaded(img), { once: true });
        img.setAttribute('src', img.dataset.src);
      }
    });
  });
}

/**
 * ギャラリー画像をライトボックス表示できるように初期化する
 *
 * @remarks
 * - 遅延画像読み込みも内部で初期化
 * - data-lightbox 属性が付与された画像をクリックで拡大表示
 * - キーボード操作で前後の画像に遷移可能
 * - 初回のみ一度だけ初期化されるよう制御
 */
export function initGalleryLightbox() {
  if (inited) return;
  inited = true;

  initLazyImages();

  const root = document.createElement('div');
  root.className = 'lb';
  root.setAttribute('aria-hidden', 'true');
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

  const imgEl = /** @type {HTMLImageElement} */ (root.querySelector('.lb__img'));
  const nameEl = root.querySelector('.lb__name');
  const yearEl = root.querySelector('.lb__year');

  /** @type {{ el: HTMLImageElement, src: string, name: string, year: string }[]} */
  let items = [];
  let index = 0;

  /**
   * 表示対象となる画像リストを収集して items に格納する
   */
  function collect() {
    const nodeList = document.querySelectorAll('img[data-lightbox]');
    items = Array.from(nodeList).map((img, i) => {
      const figure = img.closest('figure');
      const name =
        figure?.querySelector('.gallery__name, .foods__name')?.textContent?.trim() ||
        img.alt ||
        `Image ${i + 1}`;
      const year =
        img.dataset.year ||
        figure?.querySelector('.gallery__meta, .foods__meta')?.textContent?.trim() ||
        '';
      const preferredSrc = img.currentSrc || img.getAttribute('src') || img.dataset.src || '';
      return { el: img, src: preferredSrc, name, year };
    });
  }
  collect();

  /**
   * ライトボックスの画像を指定の src で表示する
   * @param {string} src 表示する画像の URL
   */
  function setLightboxSrc(src) {
    imgEl.classList.remove('is-ready');
    imgEl.removeAttribute('src');
    imgEl.onload = () => imgEl.classList.add('is-ready');
    imgEl.onerror = () => imgEl.classList.add('is-ready');
    if (src) imgEl.setAttribute('src', src);
  }

  /**
   * 指定インデックスの画像を開いて表示する
   * @param {number} i 表示する画像のインデックス
   */
  function openAt(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const it = items[index];

    nameEl.textContent = it.name;
    yearEl.textContent = it.year || '';

    const src =
      it.el.currentSrc ||
      it.el.getAttribute('src') ||
      it.el.dataset.src ||
      it.src ||
      '';

    setLightboxSrc(src);

    // 隣接画像のプリロード
    const next = items[(index + 1) % items.length]?.el;
    const prev = items[(index - 1 + items.length) % items.length]?.el;
    [next, prev].forEach((img) => {
      if (!img) return;
      const s = img.currentSrc || img.getAttribute('src') || img.dataset.src;
      if (!s) return;
      const pre = new Image();
      pre.decoding = 'async';
      pre.loading = 'eager';
      pre.src = s;
    });

    root.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    root.focus();
  }

  /** ライトボックスを閉じる */
  function close() {
    root.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  /** 次の画像を表示する */
  function next() {
    openAt(index + 1);
  }

  /** 前の画像を表示する */
  function prev() {
    openAt(index - 1);
  }

  // 画像クリック時にライトボックスを開く
  document.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const img = target.closest('img[data-lightbox]');
    if (!img) return;

    ev.preventDefault();
    collect();
    const i = items.findIndex((it) => it.el === img);
    if (i >= 0) openAt(i);
  });

  // モーダル外クリックで閉じる
  root.addEventListener('click', (ev) => {
    if (ev.target === root) close();
  });

  root.querySelector('.lb__close')?.addEventListener('click', close);
  root.querySelector('.lb__next')?.addEventListener('click', next);
  root.querySelector('.lb__prev')?.addEventListener('click', prev);

  // キーボード操作
  window.addEventListener('keydown', (ev) => {
    if (root.getAttribute('aria-hidden') === 'true') return;
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowRight') next();
    else if (ev.key === 'ArrowLeft') prev();
  });

  // ページ破棄時に閉じる
  document.addEventListener('pagehide', () => close(), { once: true });

  // 初期表示時に読み込み済み画像へ is-loaded を付与
  document.querySelectorAll('.gallery__image, .foods__image').forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('is-loaded');
    } else {
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
    }
  });
}
