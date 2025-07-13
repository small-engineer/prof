/**
 * @fileoverview ページ遷移とキャッシュ、タイトル設定を担当するルータークラス
 * JSON タイトルと HTML ページを非同期に読み込み、クライアントルーティングを実現する
 * @package
 */

import LRUCache from "./LRUCache.js";
import TitleStore from "./TitleStore.js";
import { updateActiveLink } from "../navActive.js";

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

  /** Router を起動し、初期化とイベント設定を行う */
  async start() {
    await this.titles.load();
    document.body.addEventListener("click", this.clickHandler);
    document.body.addEventListener("pointerover", this.pointeroverHandler);

    this.navigate(location.pathname);
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

    history.pushState({}, "", a.pathname);
    this.routeTo(a.pathname);
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
        this.view.textContent = "このページは現在ご利用できません";
      }
    } finally {
      this.abort = null;
      this.isNavigating = false;
    }
  }

  /**
   * 指定されたパスのページを事前に取得してキャッシュする
   *
   * @param {string} path ページのパス
   * @return {!Promise<void>} Prefetch処理のPromise
   */
  async prefetch(path) {
    if (this.prefetchedSet.has(path) || this.cache.get(path)) return;
    this.prefetchedSet.add(path);
    try {
      const filePath =
        path === "/"
          ? `${CONFIG.rootDir}/home.html`
          : `${CONFIG.rootDir}${path}.html`;

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

    const filePath =
      path === "/"
        ? `${CONFIG.rootDir}/home.html`
        : `${CONFIG.rootDir}${path}.html`;

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
    const urls = [...new Set(aTags.map((a) => a.pathname))];

    const script = document.createElement("script");
    script.type = "speculationrules";
    script.textContent = JSON.stringify({
      prefetch: [{ source: "list", urls }],
    });
    document.head.appendChild(script);
  }
}
