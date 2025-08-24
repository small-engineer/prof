/**
 * レーダーチャート（Canvas）フルスクラッチ
 * - 動的半径: ラベル実測幅/高さから内部半径を算出してキャンバス内に収める
 * - 高DPI / リサイズ追従
 * - ホバー: 値ツールチップ、クリックでピン留め
 * - HTMLラベルは選択可（user-select: text）
 * - CSS-in-JS的スタイル注入 + z-index整理
 */

let _stylesInjected = false;
export function ensureRadarStyles() {
  if (_stylesInjected) return;
  const css = `
  .radar-overlay{position:absolute;inset:0;pointer-events:none;z-index:2}
  .radar-label{position:absolute;transform:translate(-50%,-50%);
    font:12px Manrope,system-ui,sans-serif;color:var(--color-text-alt);
    background:transparent;border-radius:4px;padding:.125rem .25rem;
    user-select:text;pointer-events:auto;line-height:1.2;white-space:nowrap;z-index:2}
  .radar-label.is-hover{background:rgba(0,0,0,.04)}
  .radar-tooltip{position:absolute;transform:translate(-50%,-120%);z-index:3;
    background:var(--color-bg);color:var(--color-text);border:1px solid #e5e5e5;
    border-radius:8px;padding:.3rem .5rem;font:12px Manrope,system-ui,sans-serif;
    box-shadow:0 6px 20px rgba(0,0,0,.08);pointer-events:none;white-space:nowrap}
  .radar-tooltip__label{opacity:.7;margin-right:.35rem}
  .radar-legend{position:absolute;left:8px;bottom:6px;z-index:2;
    font:11px Manrope,system-ui,sans-serif;color:var(--color-text-alt);
    background:rgba(0,0,0,.03);border:1px solid #eee;border-radius:6px;padding:.15rem .4rem}
  `;
  const style = document.createElement("style");
  style.id = "radar-style";
  style.textContent = css;
  document.head.appendChild(style);
  _stylesInjected = true;
}

/**
 * @typedef {Object} RadarOptions
 * @property {string[]} labels
 * @property {number[]} values        // 0..maxValue
 * @property {number}   [levels=5]
 * @property {number}   [maxValue=5]
 * @property {string}   [stroke]
 * @property {string}   [fill]
 * @property {string}   [gridColor]
 * @property {string}   [axisColor]
 * @property {string}   [labelColor]
 * @property {number}   [animMs=700]
 */
export class RadarChart {
  constructor(canvas, opts) {
    ensureRadarStyles();

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.labels = opts.labels;
    this.maxValue = Math.max(1, opts.maxValue ?? 5);
    this.values = opts.values.map((v) => Math.max(0, Math.min(this.maxValue, v)));
    this.levels = opts.levels ?? 5;
    this.stroke = opts.stroke ?? "#35c82d";
    this.fill = opts.fill ?? "rgba(53,200,45,0.18)";
    this.gridColor = opts.gridColor ?? "#e9e9e9";
    this.axisColor = opts.axisColor ?? "#dddddd";
    this.labelColor = opts.labelColor ?? "#666666";
    this.animMs = opts.animMs ?? 700;

    this._raf = 0;
    this._startTs = 0;
    this._progress = 0;
    this._hover = { index: -1, pinned: -1, x: 0, y: 0 };

    this.host = canvas.closest(".skills-radar") || canvas.parentElement;
    const cs = getComputedStyle(this.host);
    if (cs.position === "static") this.host.style.position = "relative";

    this.overlay = document.createElement("div");
    this.overlay.className = "radar-overlay";
    this.host.appendChild(this.overlay);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "radar-tooltip";
    this.tooltip.style.display = "none";
    this.overlay.appendChild(this.tooltip);

    this.legend = document.createElement("div");
    this.legend.className = "radar-legend";
    this.legend.textContent = `5段階評価`;
    this.overlay.appendChild(this.legend);

    this.labelEls = this.labels.map((text, i) => {
      const s = document.createElement("span");
      s.className = "radar-label";
      s.textContent = text;
      s.dataset.index = String(i);
      this.overlay.appendChild(s);
      s.addEventListener("mouseenter", () => this._setHover(i, null));
      s.addEventListener("mousemove", (ev) => this._showTipAtLabel(ev, i));
      s.addEventListener("mouseleave", () => this._clearHover());
      s.addEventListener("click", () => this._togglePin(i));
      return s;
    });

    this._resizeObserver = new ResizeObserver(() => this.draw(false));
    this._resizeObserver.observe(this.canvas);

    this.canvas.addEventListener("pointermove", this._onMove);
    this.canvas.addEventListener("pointerleave", this._onLeave);
    this.canvas.addEventListener("click", this._onClick);

    this.draw(true);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener("pointermove", this._onMove);
    this.canvas.removeEventListener("pointerleave", this._onLeave);
    this.canvas.removeEventListener("click", this._onClick);
    this.overlay.remove();
  }

  _onMove = (ev) => {
    const { x, y } = this._eventPos(ev);
    const idx = this._nearestAxis(x, y);
    this._setHover(idx, { x, y });
  };
  _onLeave = () => this._clearHover();
  _onClick = () => this._togglePin(this._hover.index);

  _togglePin(i) {
    if (i < 0) return;
    this._hover.pinned = this._hover.pinned === i ? -1 : i;
    this.draw(false);
  }

  _setHover(i, pos) {
    this._hover.index = i;
    if (pos) {
      this._hover.x = pos.x;
      this._hover.y = pos.y;
    }
    this.draw(false);
    this._updateTooltip();
  }

  _clearHover() {
    this._hover.index = -1;
    if (this._hover.pinned === -1) {
      this.tooltip.style.display = "none";
      this.labelEls.forEach((el) => el.classList.remove("is-hover"));
      this.draw(false);
    }
  }

  _eventPos(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }
  _angles(n) {
    return Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);
  }
  _nearestAxis(x, y) {
    const n = this.labels.length;
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.width / 2,
      cy = rect.height / 2;
    const ang = Math.atan2(y - cy, x - cx);
    const angles = this._angles(n);
    let minIdx = 0,
      min = Infinity;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(this._angleDiff(ang, angles[i]));
      if (d < min) {
        min = d;
        minIdx = i;
      }
    }
    return minIdx;
  }
  _angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  _calcSafeRadius(w, h, padding = 20) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "12px Manrope, system-ui, sans-serif";
    const metrics = this.labels.map((t) => ctx.measureText(t));
    const maxLabelWidth = Math.max(...metrics.map((m) => m.width));
    const lineH = Math.max(
      ...metrics.map((m) => (m.actualBoundingBoxAscent || 10) + (m.actualBoundingBoxDescent || 2))
    );

    const ringPadX = maxLabelWidth / 2 + 8;
    const ringPadY = lineH / 2 + 8;

    const rX = w / 2 - padding - ringPadX;
    const rY = h / 2 - padding - ringPadY;

    ctx.restore();
    return Math.max(28, Math.min(rX, rY));
  }

  _scaleForDPR() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return false;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
  }
  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  draw(animate = false) {
    if (!this._scaleForDPR()) return;
    const ctx = this.ctx;

    const canvasRect = this.canvas.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    const offX = canvasRect.left - hostRect.left;
    const offY = canvasRect.top - hostRect.top;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2,
      cy = h / 2;
    const padding = 20;
    const n = this.labels.length;
    const angles = this._angles(n);

    const maxR = this._calcSafeRadius(w, h, padding);
    const labelRadius = maxR + 10;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 1;
    for (let l = 1; l <= this.levels; l++) {
      const r = (maxR * l) / this.levels;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = Math.cos(angles[i]) * r;
        const y = Math.sin(angles[i]) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = this.gridColor;
      ctx.stroke();
    }

    ctx.strokeStyle = this.axisColor;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angles[i]) * maxR, Math.sin(angles[i]) * maxR);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < n; i++) {
      const lx = cx + Math.cos(angles[i]) * labelRadius;
      const ly = cy + Math.sin(angles[i]) * labelRadius;
      const el = this.labelEls[i];
      el.style.left = `${offX + lx}px`;
      el.style.top = `${offY + ly}px`;
      el.style.color = this.labelColor;
      el.classList.toggle("is-hover", i === this._hover.index || i === this._hover.pinned);
    }

    const renderPolygon = (progress) => {
      const eased = this._easeOutCubic(progress);
      const scaled = this.values.map((v) => v * eased);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const r = (scaled[i] / this.maxValue) * maxR;
        const x = Math.cos(angles[i]) * r;
        const y = Math.sin(angles[i]) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = this.fill;
      ctx.strokeStyle = this.stroke;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      // 強調表示
      const hi = this._hover.pinned >= 0 ? this._hover.pinned : this._hover.index;
      if (hi >= 0) {
        const r = (scaled[hi] / this.maxValue) * maxR;
        const x = Math.cos(angles[hi]) * r;
        const y = Math.sin(angles[hi]) * r;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = this.stroke;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.stroke;
        ctx.stroke();

        const prev = (hi - 1 + n) % n;
        const next = (hi + 1) % n;
        const rPrev = (scaled[prev] / this.maxValue) * maxR;
        const rNext = (scaled[next] / this.maxValue) * maxR;

        ctx.beginPath();
        ctx.moveTo(Math.cos(angles[prev]) * rPrev, Math.sin(angles[prev]) * rPrev);
        ctx.lineTo(x, y);
        ctx.lineTo(Math.cos(angles[next]) * rNext, Math.sin(angles[next]) * rNext);
        ctx.strokeStyle = this.stroke;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.restore();
    };

    if (animate) {
      cancelAnimationFrame(this._raf);
      this._startTs = performance.now();
      const tick = (ts) => {
        const t = Math.min(1, (ts - this._startTs) / this.animMs);
        this._progress = t;
        this.draw(false);
        renderPolygon(t);
        if (t < 1) this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    } else {
      renderPolygon(this._progress || 1);
    }
  }

  _updateTooltip() {
    const idx = this._hover.pinned >= 0 ? this._hover.pinned : this._hover.index;
    if (idx < 0) {
      this.tooltip.style.display = "none";
      return;
    }

    const val = this.values[idx];
    const stars = "★★★★★".slice(0, Math.round(val)) + "☆☆☆☆☆".slice(Math.round(val));
    this.tooltip.innerHTML = `<span class="radar-tooltip__label">${
      this.labels[idx]
    }</span> ${val.toFixed(0)} / ${this.maxValue} <span aria-hidden="true">(${stars})</span>`;

    const canvasRect = this.canvas.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    const offX = canvasRect.left - hostRect.left;
    const offY = canvasRect.top - hostRect.top;

    const w = canvasRect.width,
      h = canvasRect.height;
    const cx = w / 2,
      cy = h / 2;
    const n = this.labels.length;
    const ang = -Math.PI / 2 + (idx * 2 * Math.PI) / n;

    // 半径は直近の draw と同様のロジックで再計算
    const maxR = this._calcSafeRadius(w, h, 20);
    const r = (this.values[idx] / this.maxValue) * maxR;

    const vx = cx + Math.cos(ang) * r;
    const vy = cy + Math.sin(ang) * r;

    const tipX = this._hover.index === idx && this._hover.pinned === -1 ? this._hover.x : vx;
    const tipY = this._hover.index === idx && this._hover.pinned === -1 ? this._hover.y : vy;

    this.tooltip.style.left = `${offX + tipX}px`;
    this.tooltip.style.top = `${offY + tipY}px`;
    this.tooltip.style.display = "block";
  }
}
