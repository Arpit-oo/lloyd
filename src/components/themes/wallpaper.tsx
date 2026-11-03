"use client";

import { useEffect, useRef } from "react";
import { createScene, drawScene, type Scene } from "@/lib/client/wallpapers";

/**
 * Canvas that paints a scene and keeps it moving (about 24 fps, paused while the tab is hidden
 * since requestAnimationFrame stops). With reduced motion it paints a single still frame.
 */
export function Wallpaper({ scene, cell = 13, className = "", fps = 24 }: { scene: Scene; cell?: number; className?: string; fps?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let state = createScene(scene, 1, 1);
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = createScene(scene, Math.ceil(w / (cell * 0.62)), Math.ceil(h / cell));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const start = performance.now();
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / fps) return;
      last = now;
      drawScene(ctx, scene, state, (now - start) / 1000, w, h, cell);
    };
    if (still) drawScene(ctx, scene, state, 4, w, h, cell);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene, cell, fps]);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
