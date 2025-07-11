/**
 * 最小限の LRU キャッシュ
 * @template K, V
 */
export default class LRUCache {
  /**
   * @param {number} maxSize 最大保持数
   * @param {number} ttlMs   TTL（ミリ秒）
   */
  constructor(maxSize, ttlMs) {
    this.max = maxSize;
    this.ttl = ttlMs;
    /** @type {Map<K, {value: V, ts: number}>} */
    this.map = new Map();
  }

  /** @param {K} key */
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttl) {
      this.map.delete(key);
      return undefined;
    }
    // LRU 更新
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /**
   * @param {K} key
   * @param {V} value
   */
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, ts: Date.now() });

    if (this.map.size > this.max) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }
}
