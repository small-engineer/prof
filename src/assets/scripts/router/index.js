import Router from "./Router.js";

const pageInits = {
  "/about": createInitOnce(async () => {
    const { initAboutRadars } = await import("../graph/aboutRadar.js");
    initAboutRadars();
  }),
  "/gallery": createInitOnce(async () => {
    const { initGalleryLightbox } = await import("../gallery.js"); // ← 追加
    initGalleryLightbox();
  }),
  "/": async () => {
    const { initTitleFx } = await import("../titleFx.js");
    initTitleFx(document.getElementById("app"));
  },
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

export function destroyRouter() {
  router?.destroy();
  router = null;
}
