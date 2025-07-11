import Router from "./Router.js";

/** ページごとの初期化関数 */
const pageInits = {
  "/gallery": createInitOnce(async () => {
    /* Swiper とかあったら入れる　*/
    await Promise.resolve();
  }),
};

/**
 * 同時実行・多重初期化を防ぐためのラッパー
 * @param {() => Promise<void> | void} initFn 初期化関数
 * @returns {() => Promise<void>} ラップされた関数
 */
function createInitOnce(initFn) {
  let currentInit = null;
  return async () => {
    if (currentInit) return currentInit;
    currentInit = (async () => {
      try {
        await initFn();
      } finally {
        currentInit = null;
      }
    })();
    return currentInit;
  };
}

/** @type {?Router} */
let router = null;

/**
 * Routerを初期化する
 * @return {Router} 初期化したRouterインスタンス
 */
export function initRouter() {
  if (router) {
    router.destroy();
  }
  router = new Router(pageInits);
  router.start();
  return router;
}

/** Routerを破棄する */
export function destroyRouter() {
  router?.destroy();
  router = null;
}
