/**
 * @fileoverview ページ遷移とキャッシュ、タイトル設定を担当するルータークラス
 * JSON タイトルと HTML ページを非同期に読み込み、クライアントルーティングを実現する
 * @package
 */

import LRUCache from "./LRUCache.js";
import TitleStore from "./TitleStore.js";
import { updateActiveLink } from "../navActive.js";


/** @typedef {function(string): string} TitleGetter */
function getRepoBase() {
  return location.hostname === "localhost"
    ? ""
    : "/" + location.pathname.split("/")[1];
}

/**
 * パスを正規化する（GitHub Pages対応）
 * リポジトリ名を除外し、純粋なSPAルートに変換
 * @param {string} path location.pathnameなど
 * @return {string} 例: "/gallery"
 */
function normalizePath(path) {
  const repoBase = getRepoBase();
  return path.startsWith(repoBase) ? path.slice(repoBase.length) || "/" : path;
}


/** @const {function(HTMLElement): Promise<void>} */
const waitAnimationEnd = (el) =>
  new Promise((resolve) =>
    el.addEventListener("animationend", resolve, { once: true })
  );

/** @const {!{rootDir: string, defaultTitle: string, ttl: number, maxCache: number}} */
const CONFIG = {
  rootDir: "assets/pages",
  defaultTitle: "Wakamiya Yuma",
  ttl: location.hostname === "localhost" ? 1_000 : 86_400_000,
  maxCache: 20,
};

/**
 * クライアントサイドのルーティングを管理するクラス
 * ページ遷移時に HTML を取得・表示し、タイトル更新と初期化処理を行う
 */
export default class Router {
  /**
   * @param {!Record<string, function()>} pageInits 各ページの初期化関数
   */
  constructor(pageInits) {
    /** @const {!HTMLElement} */
    this.view = document.getElementById("app");
    if (!this.view) throw new Error("#app is not found");

    /** @private @const {!Record<string, function()>} */
    this.pageInits = pageInits;

    /** @private @const {!Set<string>} */
    this.prefetchedSet = new Set();

    /** @private @const {!LRUCache<string, string>} */
    this.cache = new LRUCache(CONFIG.maxCache, CONFIG.ttl);

    /** @private @const {!TitleStore} */
    this.titles = new TitleStore(`${CONFIG.rootDir}/pageTitles.json`);

    /** @private {?AbortController} */
    this.abort = null;

    /** @private {boolean} */
    this.isNavigating = false;

    /** @private {function(): void} */
    this.clickHandler = this.onClick.bind(this);

    /** @private {function(): void} */
    this.pointeroverHandler = this.onPointerOver.bind(this);
  }

  /**
   * @return {string} ページのパス
   */
  applyBasePathToLinks() {
    const repoBase = getRepoBase();
    const links = document.querySelectorAll(
      "a[href^='/']:not([data-no-rewrite])"
    );

    links.forEach((a) => {
      const relative = a.getAttribute("href");
      if (!relative.startsWith(repoBase)) {
        a.setAttribute("href", `${repoBase}${relative}`);
      }
    });
  }

  /** Router を起動し、初期化とイベント設定を行う */
  async start() {
    const params = new URLSearchParams(location.search);
    const redirect = params.keys().next().value;
    if (redirect) {
      const realPath = decodeURIComponent(
        redirect.replace(location.origin, "")
      );
      const repoBase = getRepoBase();
      history.replaceState({}, "", `${repoBase}${realPath}`);

      await this.titles.load();
      document.body.addEventListener("click", this.clickHandler);
      window.addEventListener("popstate", () => {
        this.navigate(normalizePath(location.pathname));
      });

      /*navigateでとばす*/
      await this.navigate(normalizePath(realPath));
      this.injectSpeculationRules();
      /*通常処理では不要*/
      return;
    }

    await this.titles.load();
    document.body.addEventListener("click", this.clickHandler);
    window.addEventListener("popstate", () => {
      router?.navigate(normalizePath(location.pathname));
    });

    await this.navigate(normalizePath(location.pathname));
    this.injectSpeculationRules();
  }

  /** Router破棄、リスナ解除  */
  destroy() {
    document.body.removeEventListener("click", this.clickHandler);
    document.body.removeEventListener("pointerover", this.pointeroverHandler);
    this.abort?.abort();
    this.abort = null;
  }

  /** ページ内リンクのクリック判定とルーティング制御 */
  onClick = (ev) => {
    const a = ev.target.closest("a[href]");
    if (!a || !this.isInternalLink(a)) return;

    ev.preventDefault();
    if (this.isNavigating) return;

    const repoBase = getRepoBase();
    const fullPath = a.pathname;
    const internalPath = normalizePath(fullPath);

    history.pushState({}, "", `${repoBase}${internalPath}`);
    this.routeTo(internalPath);
  };

  /** navigate */
  async routeTo(path) {
    await this.navigate(path);
  }

  /** PointerOverでPrefetch */
  onPointerOver = (ev) => {
    if (ev.pointerType !== "mouse") return;
    const a = ev.target.closest("a[href]");
    if (!this.isInternalLink(a)) return;

    this.prefetch(a.pathname);
  };

  /** HTMLを差し替えて初期化もする */
  async replaceContent(html, path) {
    this.view.innerHTML = html;
    document.title = this.titles.get(path);

    /* 初期化を await 可能にしたい */
    const init = this.pageInits[path];
    if (typeof init === "function") {
      const maybePromise = init();
      if (maybePromise instanceof Promise) {
        try {
          await maybePromise;
          this.applyBasePathToLinks();
        } catch (err) {
          throw err;
        }
      }
    }

    updateActiveLink(path);
  }

  async animateSwap(htmlPromise, path) {
    this.view.classList.add("fade-out");
    const [html] = await Promise.all([
      htmlPromise,
      waitAnimationEnd(this.view),
    ]);
    this.replaceContent(html, path);

    this.view.classList.remove("fade-out");
    this.view.classList.add("slide-in");
    await waitAnimationEnd(this.view);
    this.view.classList.remove("slide-in");
  }

  isInternalLink(a) {
    return (
      a &&
      a.target !== "_blank" &&
      a.origin === location.origin &&
      !/\.\w+$/.test(a.pathname)
    );
  }

  /**
   * 指定されたパスのページへ遷移し、HTML を取得・描画する
   * タイトルの更新や初期化フックの呼び出しも行う
   *
   * @param {string} path 遷移先のパス
   * @param {boolean} isFallback フェールオーバー時のフラグ
   * @return {!Promise<void>} 遷移処理のPromise
   *
   */
  async navigate(path, isFallback = false) {
    if (this.isNavigating) return;
    this.isNavigating = true;

    try {
      this.abort?.abort();
      this.abort = new AbortController();
      const signal = this.abort.signal;

      const htmlPromise = this.fetchPage(path, signal);
      await this.animateSwap(htmlPromise, path);
    } catch (e) {
      if (!isFallback) {
        await this.navigate("/404", true);
      } else {
        this.view.innerHTML = `
        <section class="error-page">
          <h2>ページを表示できません</h2>
          <p>一時的な問題が発生しています。</p>
        </section>
      `;
      }
    } finally {
      this.abort = null;
      this.isNavigating = false;
    }
  }

  /**
   * 指定されたパスのページを事前に取得してキャッシュする
   *const filePath
   * @param {string} path ページのパス
   * @return {!Promise<void>} Prefetch処理のPromise
   */
  async prefetch(path) {
    if (this.prefetchedSet.has(path) || this.cache.get(path)) return;
    this.prefetchedSet.add(path);
    try {
      const route = normalizePath(path);
      const filePath =
        route === "/"
          ? `${CONFIG.rootDir}/home.html`
          : `${CONFIG.rootDir}${route}.html`;

      /* abort 無視 */
      const res = await fetch(filePath);
      if (!res.ok) return;

      const text = await res.text();
      this.cache.set(path, text);
    } catch (err) {
      /* Prefetch 失敗は握りつぶす */
    }
  }

  /**
   * 指定されたパスに対応するHTMLを取得する
   * キャッシュがあればそれを返し、なければfetchしてキャッシュに保存
   *
   * @param {string} path ページのパス
   * @param {AbortSignal} signal fetchのAbortSignal
   * @return {!Promise<string>} ページ HTMLを返すPromise
   * @throws {Error} ページ取得に失敗した場合
   */
  async fetchPage(path, signal) {
    const cached = this.cache.get(path);
    if (cached) return cached;

    const route = normalizePath(path);
    const filePath =
      route === "/"
        ? `${CONFIG.rootDir}/home.html`
        : `${CONFIG.rootDir}${route}.html`;

    const res = await fetch(filePath, { signal });
    if (!res.ok) throw new Error(`Failed to fetch page: ${filePath}`);

    const text = await res.text();
    this.cache.set(path, text);
    return text;
  }

  /**
   * Prefetchを行う
   * @private
   */
  injectSpeculationRules() {
    if (!("speculationrules" in document.createElement("script"))) return;
    const aTags = Array.from(document.querySelectorAll("a[href^='/']"));
    const urls = [...new Set(aTags.map((a) => normalizePath(a.pathname)))];

    const script = document.createElement("script");
    script.type = "speculationrules";
    script.textContent = JSON.stringify({
      prefetch: [{ source: "list", urls }],
    });
    document.head.appendChild(script);
  }
}
