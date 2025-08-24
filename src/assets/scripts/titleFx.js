export function initTitleFx(root = document) {
  const targets = root.querySelectorAll(".fx-rtl-color");
  targets.forEach((el) => {
    if (el.dataset.splitDone === "1") return;

    const text = el.textContent ?? "";
    el.textContent = "";
    const chars = Array.from(text);
    const total = chars.length;

    chars.forEach((ch, idx) => {
      const span = document.createElement("span");
      span.textContent = ch;
      span.style.setProperty("--i", String(total - 1 - idx));
      el.appendChild(span);
    });

    el.dataset.splitDone = "1";
  });
}
