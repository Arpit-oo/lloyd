/**
 * Contrast sweep, run inside the browser page (via Playwright evaluate).
 * For every visible text element it composites the background colors of its ancestors (alpha
 * included) over the page base, then computes the WCAG contrast ratio of the text color.
 * Works for any CSS color syntax (oklab, color-mix...) by resolving colors through a canvas.
 * `base` is the color under the app: the wallpaper's middle sky color, or the page background.
 *
 * Returns the failures (below 4.5:1, or 3:1 for large text), worst first.
 */
export function sweep(base) {
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    c.clearRect(0, 0, 1, 1);
    c.fillStyle = "#000";
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const baseRgb = rgba(base);
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!(el instanceof HTMLElement) || el.closest("[data-preview-root]") || el.closest("[aria-hidden=true]")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const isField = el.matches("input,textarea") && (el.value || el.placeholder);
    if (!own && !isField) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || +st.opacity === 0) continue;
    // Background stack from root to element.
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let bg = baseRgb;
    let opacity = 1;
    for (const n of chain) {
      const s = getComputedStyle(n);
      opacity *= +s.opacity;
      bg = over(rgba(s.backgroundColor), bg);
    }
    const colorCss = isField && !el.value ? getComputedStyle(el, "::placeholder").color : st.color;
    let fg = rgba(colorCss);
    fg = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const cr = ratio(fg, bg);
    const size = parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.66 && +st.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    if (cr < need) {
      const text = (isField && !el.value ? "[placeholder] " + el.placeholder : el.textContent.trim()).slice(0, 60);
      const key = text + Math.round(cr * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, ratio: +cr.toFixed(2), need, size, cls: (el.className || "").toString().slice(0, 90) });
    }
  }
  return out.sort((a, b) => a.ratio - b.ratio);
}
