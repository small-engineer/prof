/**
 * Aboutページ用：レーダーチャート初期化（5段階・ホバー対応）
 * - CSS変数追従 / SPA再訪の二重初期化防止
 * - CSS-in-JSスタイル注入
 */
import { RadarChart, ensureRadarStyles } from "./radar.js";

let instances = [];
let ro = null;

function cleanup() {
  instances.forEach((i) => i.destroy());
  instances = [];
  ro?.disconnect();
  ro = null;
}

function getThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue("--color-accent").trim() || "#35c82d",
    textAlt: cs.getPropertyValue("--color-text-alt").trim() || "#666666",
  };
}

function toFill(accent, alpha = 0.18) {
  const m = accent.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return `rgba(53,200,45,${alpha})`;
  const r = parseInt(m[1], 16),
    g = parseInt(m[2], 16),
    b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function initAboutRadars() {
  cleanup();
  ensureRadarStyles();

  const front = document.getElementById("radar-frontend");
  const back = document.getElementById("radar-backend");
  const infra = document.getElementById("radar-infra");
  if (!front || !back || !infra) return;

  const { accent, textAlt } = getThemeColors();
  const common = {
    levels: 5,
    maxValue: 5,
    stroke: accent,
    fill: toFill(accent, 0.18),
    gridColor: "#e9e9e9",
    axisColor: "#dddddd",
    labelColor: textAlt,
    animMs: 650,
  };

  const FRONT = [5, 3, 3, 5, 5, 4];
  const BACK = [4, 5, 4, 4, 3, 2];
  const INFRA = [4, 4, 5, 4, 3, 5];

  instances.push(
    new RadarChart(front, {
      ...common,
      labels: ["React/Next", "Nuxt", "Svelte", "TypeScript", "SCSS/Tailwind", "Wordpress"],
      values: FRONT,
    }),
    new RadarChart(back, {
      ...common,
      labels: ["Express", "Node.js", "REST/gRPC", "ORM/CRM", "Python", "GO"],
      values: BACK,
    }),
    new RadarChart(infra, {
      ...common,
      labels: ["AWS", "Cloudflare", "Docker(Container)", "IasC", "Kubernetes", "Linux/IOS"],
      values: INFRA,
    })
  );

  // フォント読み込みやレイアウト変化に追従
  ro = new ResizeObserver(() => instances.forEach((i) => i.draw(false)));
  [front, back, infra].forEach((c) => ro.observe(c));

  // ページ離脱で掃除
  document.addEventListener("pagehide", cleanup, { once: true });
}
