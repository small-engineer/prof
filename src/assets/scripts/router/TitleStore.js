/**
 * @fileoverview ページタイトルを読み込んで管理するストア
 * @package
 */

export default class TitleStore {
  constructor(jsonPath) {
    /**
     * @type {string}
     * @private
     */
    this.src = jsonPath;

    /**
     * @type {!Record<string, string>}
     * @private
     */
    this.map = {};
  }

  /**
   * @return {!Promise<void>} 読み込み完了時に解決されるPromise
   * @throws {Error} 読み込みに失敗した場合にエラーをスロー
   */
  async load() {
    const res = await fetch(this.src);
    if (!res.ok) throw new Error(`Failed to load titles: ${this.src}`);
    this.map = await res.json();
  }

  /**
   * @param {string} path ページのパス。
   * @return {string} 対応するタイトル文字列。
   */
  get(path) {
    return this.map[path] ?? "Wakamiya Yuma";
  }
}
